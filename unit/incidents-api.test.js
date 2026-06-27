import test from "node:test";
import assert from "node:assert/strict";
import {
  fetchIncidents,
  getSourceStatuses,
  normalizeGenericPayload,
  normalizeInmetPayload,
  normalizeRss2JsonPayload,
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
  assert.equal(incidents[0].location, "Marilia-SP");
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
  assert.equal(incident.location, "Marilia-SP");
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
  assert.equal(result.incidents[0].source, "G1 Bauru e Marilia");
  assert.equal(result.sources.find((source) => source.id === "g1-bauru-marilia").status, "conectado");
});

test("fetchIncidents consults configured sources without fake fallback", async () => {
  const result = await fetchIncidents({
    env: {
      VITE_WAZE_FEED_URL: "https://example.test/waze.json",
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

  assert.equal(statuses.find((source) => source.id === "g1-bauru-marilia").status, "conectado");
  assert.equal(statuses.find((source) => source.id === "giro-marilia").status, "conectado");
  assert.equal(statuses.find((source) => source.id === "gmc-online").status, "conectado");
  assert.equal(statuses.find((source) => source.id === "inmet-alertas").status, "conectado");
  assert.equal(statuses.find((source) => source.id === "alerts").status, "conectado");
});

test("official-only sources are marked indisponivel, not pendente", () => {
  const statuses = getSourceStatuses({});

  for (const id of ["waze", "artesp", "sinesp"]) {
    const source = statuses.find((item) => item.id === id);
    assert.equal(source.status, "indisponivel");
    assert.notEqual(source.detail, "Aguardando endpoint de integracao.");
  }

  // INFOSIGA is a configurable env source, so it stays pendente until a URL is provided.
  assert.equal(statuses.find((source) => source.id === "infosiga").status, "pendente");
});

test("an official source upgrades to conectado when an endpoint is configured", () => {
  const statuses = getSourceStatuses({ VITE_WAZE_FEED_URL: "https://example.test/waze.json" });
  assert.equal(statuses.find((source) => source.id === "waze").status, "conectado");
});
