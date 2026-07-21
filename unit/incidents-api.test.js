import test from "node:test";
import assert from "node:assert/strict";
import {
  distanceFromUserKm,
  fetchIncidents,
  getSourceStatuses,
  haversineKm,
  mapPositionToCoordinates,
  normalizeGenericPayload,
  normalizeInmetPayload,
  normalizeRss2JsonPayload,
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

test("generic incidents without a valid timestamp remain without a time", () => {
  const incidents = normalizeGenericPayload(
    {
      incidents: [
        { id: "missing-time", title: "Alerta sem horario" },
        { id: "invalid-time", title: "Alerta com horario invalido", occurredAt: "sem-data" },
      ],
    },
    apiSource,
  );

  assert.deepEqual(incidents.map((incident) => incident.occurredAt), [null, null]);
});

test("rss2json regional feed only keeps Marilia safety reports", () => {
  const incidents = normalizeRss2JsonPayload(
    {
      items: [
        {
          title: "Jovem suspeito de crime e preso em Marilia",
          pubDate: "2026-06-27 12:30:00",
          link: "https://example.test/marilia",
          guid: "g1-1",
          description: "Ocorrencia policial no Alto Cafezal em Marilia (SP).",
        },
        {
          title: "IBGE abre inscricoes em Marilia",
          pubDate: "2026-06-27 11:00:00",
          link: "https://example.test/ibge",
          guid: "g1-2",
          description: "Vagas temporarias para pesquisa agropecuaria.",
        },
      ],
    },
    { id: "g1-bauru-marilia", name: "G1 Bauru e Marilia" },
  );

  assert.equal(incidents.length, 1);
  assert.equal(incidents[0].id, "g1-1");
  assert.equal(incidents[0].type, "policial");
  assert.equal(incidents[0].neighborhood, "Alto Cafezal");
  assert.equal(incidents[0].url, "https://example.test/marilia");
});

test("inmet active warnings are filtered by Marilia geocode", () => {
  const incidents = normalizeInmetPayload(
    {
      hoje: [
        {
          id: 1,
          codigo: "alerta-marilia",
          descricao: "Tempestade",
          data_inicio: "2026-06-27T00:00:00.000Z",
          hora_inicio: "12:00",
          data_fim: "2026-06-27T00:00:00.000Z",
          hora_fim: "23:59",
          geocodes: "3529005,3506003",
          municipios: "Marilia - SP (3529005),Bauru - SP (3506003)",
          severidade: "Perigo Potencial",
          riscos: ["Chuva intensa e ventos fortes."],
        },
        {
          id: 2,
          codigo: "alerta-fora",
          descricao: "Baixa Umidade",
          geocodes: "3550308",
          municipios: "Sao Paulo - SP (3550308)",
        },
      ],
    },
    { id: "inmet-alertas", name: "INMET Avisos Meteorologicos" },
  );

  assert.equal(incidents.length, 1);
  assert.equal(incidents[0].id, "inmet-alertas-alerta-marilia");
  assert.equal(incidents[0].type, "risco");
  assert.equal(incidents[0].location, "Marília-SP");
  assert.match(incidents[0].detail, /Chuva intensa/);
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
  assert.equal(incident.location, "Marília-SP");
  assert.equal(incident.neighborhood, "Marilia");
});

test("fetchIncidents consults real default public APIs without env setup", async () => {
  const requestedUrls = [];
  const result = await fetchIncidents({
    env: {},
    fetchImpl: async (url) => {
      requestedUrls.push(url);

      if (url.includes("rss2json")) {
        return {
          ok: true,
          json: async () => ({
            items: [
              {
                title: "Acidente interdita via em Marilia",
                pubDate: "2026-06-27 10:00:00",
                link: "https://example.test/acidente",
                guid: "g1-live",
                description: "Colisao no Centro de Marilia.",
              },
            ],
          }),
        };
      }

      if (url.includes("apiprevmet3.inmet.gov.br")) {
        return {
          ok: true,
          json: async () => ({ hoje: [], amanha: [] }),
        };
      }

      return {
        ok: true,
        json: async () => ({ incidents: [] }),
      };
    },
  });

  assert.ok(requestedUrls.some((url) => url.includes("api.rss2json.com")));
  assert.ok(requestedUrls.some((url) => url.includes("apiprevmet3.inmet.gov.br")));
  assert.equal(result.incidents.length, 1);
  assert.equal(result.incidents[0].source, "G1 Bauru e Marília");
  assert.equal(result.sources.find((source) => source.id === "g1-bauru-marilia").status, "conectado");
});

test("fetchIncidents consults a configured custom endpoint without fake fallback", async () => {
  const result = await fetchIncidents({
    env: {
      VITE_INCIDENTS_API_URL: "https://example.test/alerts.json",
    },
    fetchImpl: async (url) => {
      if (url.includes("rss2json")) {
        return {
          ok: true,
          json: async () => ({ items: [] }),
        };
      }

      if (url.includes("apiprevmet3.inmet.gov.br")) {
        return {
          ok: true,
          json: async () => ({ hoje: [], amanha: [] }),
        };
      }

      assert.equal(url, "https://example.test/alerts.json");
      return {
        ok: true,
        json: async () => ({
          incidents: [
            {
              id: "alerts-live",
              type: "hazard",
              description: "Buraco na pista",
              city: "Marilia",
              confidence: 7,
              lat: -22.26,
              lng: -49.89,
            },
          ],
        }),
      };
    },
  });

  assert.equal(result.incidents.length, 1);
  assert.equal(result.incidents[0].id, "alerts-live");
  assert.equal(result.sources.find((source) => source.id === "alerts").status, "conectado");
  assert.deepEqual(result.warnings, []);
});

test("source statuses reflect configured endpoints", () => {
  const statuses = getSourceStatuses({ VITE_INCIDENTS_API_URL: "https://example.test/incidents" });

  assert.equal(statuses.find((source) => source.id === "g1-bauru-marilia").status, "conectado");
  assert.equal(statuses.find((source) => source.id === "giro-marilia").status, "conectado");
  assert.equal(statuses.find((source) => source.id === "gmc-online").status, "conectado");
  assert.equal(statuses.find((source) => source.id === "inmet-alertas").status, "conectado");
  assert.equal(statuses.find((source) => source.id === "alerts").status, "conectado");
});

test("removed private sources are no longer listed", () => {
  const ids = getSourceStatuses({}).map((source) => source.id);

  for (const removed of ["waze", "artesp", "sinesp"]) {
    assert.ok(!ids.includes(removed), `${removed} should be removed`);
  }
});

test("an env source stays pendente until an endpoint is configured", () => {
  assert.equal(
    getSourceStatuses({}).find((source) => source.id === "infosiga").status,
    "pendente",
  );
  assert.equal(
    getSourceStatuses({ VITE_INFOSIGA_API_URL: "https://example.test/infosiga.json" }).find(
      (source) => source.id === "infosiga",
    ).status,
    "conectado",
  );
});

test("haversineKm measures real distance and handles invalid input", () => {
  const center = { lat: -22.21, lng: -49.94 };
  assert.equal(haversineKm(center, center), 0);
  assert.equal(haversineKm(null, center), null);
  assert.equal(haversineKm(center, { lat: Number.NaN, lng: -49.9 }), null);

  // ~1 degree of latitude is roughly 111 km.
  const oneDegreeNorth = haversineKm(center, { lat: -21.21, lng: -49.94 });
  assert.ok(oneDegreeNorth > 105 && oneDegreeNorth < 115);
});

test("mapPositionToCoordinates stays inside Marilia bounds", () => {
  const center = mapPositionToCoordinates({ x: 50, y: 50 });
  assert.ok(center.lat > -22.36 && center.lat < -22.08);
  assert.ok(center.lng > -50.08 && center.lng < -49.74);
});

test("distanceFromUserKm returns a finite distance when a user location is given", () => {
  const incident = { position: { x: 50, y: 50 } };
  const user = mapPositionToCoordinates({ x: 20, y: 80 });

  assert.equal(distanceFromUserKm(incident, null), null);
  const distance = distanceFromUserKm(incident, user);
  assert.ok(Number.isFinite(distance) && distance > 0);
});

test("a non-JSON upstream page is reported as sem-dados, not erro", async () => {
  const result = await fetchIncidents({
    env: {},
    fetchImpl: async (url) => {
      if (url.includes("apiprevmet3.inmet.gov.br")) {
        return {
          ok: true,
          text: async () => "Você está sendo redirecionado...<html></html>",
        };
      }

      return { ok: true, text: async () => JSON.stringify({ items: [] }) };
    },
  });

  const inmet = result.sources.find((source) => source.id === "inmet-alertas");
  assert.equal(inmet.status, "sem-dados");
  assert.doesNotMatch(inmet.detail, /Você está/);
  assert.doesNotMatch(inmet.detail, /JSON/);
});

test("a real HTTP failure is still reported as erro", async () => {
  const result = await fetchIncidents({
    env: {},
    fetchImpl: async (url) => {
      if (url.includes("apiprevmet3.inmet.gov.br")) {
        return { ok: false, status: 502, text: async () => "" };
      }

      return { ok: true, text: async () => JSON.stringify({ items: [] }) };
    },
  });

  const inmet = result.sources.find((source) => source.id === "inmet-alertas");
  assert.equal(inmet.status, "erro");
  assert.match(inmet.detail, /HTTP 502/);
});
