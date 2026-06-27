import test from "node:test";
import assert from "node:assert/strict";
import {
  fetchIncidents,
  getSourceStatuses,
  normalizeGenericPayload,
  normalizeWazePayload,
} from "../src/services/incidentsApi.js";

const apiSource = {
  id: "alerts",
  name: "API de alertas",
  cadence: "tempo real",
};

test("generic API payload is normalized to dashboard incidents", () => {
  const [incident] = normalizeGenericPayload(
    {
      incidents: [
        {
          id: "api-1",
          type: "accident",
          title: "Colisao na avenida",
          address: "Av. Sampaio Vidal",
          neighborhood: "Centro",
          status: "open",
          severity: "high",
          confidence: 82,
          occurredAt: "2026-06-27T13:00:00-03:00",
          lat: -22.217,
          lng: -49.95,
        },
      ],
    },
    apiSource,
  );

  assert.equal(incident.id, "api-1");
  assert.equal(incident.type, "acidente");
  assert.equal(incident.status, "ativo");
  assert.equal(incident.severity, "alta");
  assert.equal(incident.source, "API de alertas");
  assert.ok(incident.position.x >= 0 && incident.position.x <= 100);
  assert.ok(incident.position.y >= 0 && incident.position.y <= 100);
});

test("waze feed payload is filtered and normalized for Marilia", () => {
  const incidents = normalizeWazePayload(
    {
      alerts: [
        {
          uuid: "waze-1",
          type: "ACCIDENT",
          street: "Av. Rio Branco",
          city: "Marilia",
          confidence: 8,
          reliability: 9,
          pubMillis: 1782586800000,
          location: { x: -49.94, y: -22.21 },
        },
        {
          uuid: "waze-2",
          type: "ACCIDENT",
          street: "Av. Paulista",
          city: "Sao Paulo",
          location: { x: -46.65, y: -23.56 },
        },
      ],
    },
    { id: "waze", name: "Waze Partner Feed" },
  );

  assert.equal(incidents.length, 1);
  assert.equal(incidents[0].id, "waze-1");
  assert.equal(incidents[0].type, "acidente");
  assert.equal(incidents[0].location, "Av. Rio Branco");
});

test("generic API payload keeps coordinate objects out of visible text", () => {
  const [incident] = normalizeGenericPayload(
    {
      incidents: [
        {
          type: "hazard",
          description: "Buraco na pista",
          city: "Marilia",
          location: { lat: -22.22, lng: -49.94 },
        },
      ],
    },
    apiSource,
  );

  assert.equal(incident.title, "Buraco na pista");
  assert.equal(incident.location, "Marilia-SP");
  assert.equal(incident.neighborhood, "Marilia");
});

test("fetchIncidents returns empty state when no real API is configured", async () => {
  const result = await fetchIncidents({ env: {}, fetchImpl: async () => assert.fail("fetch should not run") });

  assert.deepEqual(result.incidents, []);
  assert.equal(result.warnings[0], "Nenhuma API real configurada.");
  assert.ok(result.sources.every((source) => source.status === "pendente"));
});

test("fetchIncidents consults configured sources without fake fallback", async () => {
  const result = await fetchIncidents({
    env: {
      VITE_WAZE_FEED_URL: "https://example.test/waze.json",
    },
    fetchImpl: async (url) => {
      assert.equal(url, "https://example.test/waze.json");
      return {
        ok: true,
        json: async () => ({
          alerts: [
            {
              uuid: "waze-live",
              type: "HAZARD",
              street: "Rodovia BR-153",
              city: "Marilia",
              confidence: 7,
              location: { x: -49.89, y: -22.26 },
            },
          ],
        }),
      };
    },
  });

  assert.equal(result.incidents.length, 1);
  assert.equal(result.incidents[0].id, "waze-live");
  assert.equal(result.sources.find((source) => source.id === "waze").status, "conectado");
  assert.deepEqual(result.warnings, []);
});

test("source statuses reflect configured endpoints", () => {
  const statuses = getSourceStatuses({ VITE_INCIDENTS_API_URL: "https://example.test/incidents" });

  assert.equal(statuses.find((source) => source.id === "alerts").status, "conectado");
  assert.equal(statuses.find((source) => source.id === "waze").status, "pendente");
});
