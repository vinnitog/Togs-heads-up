import test from "node:test";
import assert from "node:assert/strict";
import {
  calculateRiskScore,
  createIncidentSummary,
  filterIncidents,
  formatAge,
  getHotspots,
  getIncidentAgeMinutes,
  getRiskBand,
  sortIncidentsByOccurredAt,
  sortIncidentsByRisk,
} from "../src/utils/incidents.js";

const now = new Date("2026-06-26T15:00:00-03:00");

const incidents = [
  {
    id: "a",
    type: "acidente",
    title: "Colisao no Centro",
    location: "Av. Sampaio Vidal",
    neighborhood: "Centro",
    source: "Relato local",
    status: "ativo",
    severity: "alta",
    confidence: 8,
    occurredAt: "2026-06-26T14:45:00-03:00",
  },
  {
    id: "b",
    type: "policial",
    title: "Ocorrencia em apuracao",
    location: "Jardim Aquarius",
    neighborhood: "Jardim Aquarius",
    source: "SINESP",
    status: "historico",
    severity: "media",
    confidence: 5,
    occurredAt: "2026-06-26T10:00:00-03:00",
  },
  {
    id: "c",
    type: "risco",
    title: "Semaforo intermitente",
    location: "Av. Tiradentes",
    neighborhood: "Centro",
    source: "Relato local",
    status: "monitorado",
    severity: "baixa",
    confidence: 6,
    occurredAt: "2026-06-26T13:50:00-03:00",
  },
];

test("risk score prioritizes recent high severity active incidents", () => {
  assert.equal(getIncidentAgeMinutes(incidents[0], now), 15);
  assert.equal(calculateRiskScore(incidents[0], now), 100);
  assert.equal(getRiskBand(calculateRiskScore(incidents[0], now)), "critico");

  const sorted = sortIncidentsByRisk(incidents, now);
  assert.equal(sorted[0].id, "a");
});

test("local news is ordered only by occurredAt from newest to oldest", () => {
  const mixedIncidents = [
    { id: "old-critical", occurredAt: "2026-06-26T10:00:00-03:00", severity: "alta", source: "A" },
    { id: "new-low", occurredAt: "2026-06-26T14:00:00-03:00", severity: "baixa", source: "B" },
    { id: "middle", occurredAt: "2026-06-26T12:00:00-03:00", severity: "media", source: "C" },
    { id: "invalid", occurredAt: "sem-data", severity: "alta", source: "D" },
  ];

  const sorted = sortIncidentsByOccurredAt(mixedIncidents);

  assert.deepEqual(sorted.map((incident) => incident.id), ["new-low", "middle", "old-critical", "invalid"]);
  assert.notEqual(sorted, mixedIncidents);
});

test("local news ordering uses absolute instants across timezones and day rollover", () => {
  const mixedTimezones = [
    { id: "previous-day", occurredAt: "2026-06-26T23:55:00-03:00" },
    { id: "later-clock-older-instant", occurredAt: "2026-06-27T04:00:00+02:00" },
    { id: "newest", occurredAt: "2026-06-27T00:10:00-03:00" },
  ];

  const sorted = sortIncidentsByOccurredAt(mixedTimezones);

  assert.deepEqual(sorted.map((incident) => incident.id), [
    "newest",
    "previous-day",
    "later-clock-older-instant",
  ]);
});

test("local news ordering is stable for ties and keeps absent dates at the end", () => {
  const tiedAndMissing = [
    { id: "tie-first", occurredAt: "2026-06-27T03:00:00Z" },
    { id: "missing-first" },
    { id: "tie-second", occurredAt: "2026-06-27T00:00:00-03:00" },
    { id: "missing-null", occurredAt: null },
    { id: "missing-blank", occurredAt: "" },
  ];

  const sorted = sortIncidentsByOccurredAt(tiedAndMissing);

  assert.deepEqual(sorted.map((incident) => incident.id), [
    "tie-first",
    "tie-second",
    "missing-first",
    "missing-null",
    "missing-blank",
  ]);
});

test("filters incidents by type status severity and query", () => {
  const result = filterIncidents(incidents, {
    type: "acidente",
    status: "ativo",
    severity: "alta",
    query: "centro",
  });

  assert.deepEqual(result.map((incident) => incident.id), ["a"]);
});

test("summary and hotspots aggregate operational data", () => {
  const summary = createIncidentSummary(incidents, now);
  assert.deepEqual(summary, {
    total: 3,
    active: 1,
    critical: 1,
    recent: 1,
    averageRisk: 71,
  });

  const hotspots = getHotspots(incidents, now);
  assert.equal(hotspots[0].neighborhood, "Centro");
  assert.equal(hotspots[0].total, 2);
});

test("age formatter keeps alert timestamps readable", () => {
  assert.equal(formatAge(0), "agora");
  assert.equal(formatAge(42), "42 min");
  assert.equal(formatAge(135), "2h 15min");
});
