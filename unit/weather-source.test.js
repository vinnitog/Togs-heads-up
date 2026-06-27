import test from "node:test";
import assert from "node:assert/strict";
import {
  OPEN_METEO_SOURCE,
  buildOpenMeteoUrl,
  fetchWeatherIncidents,
  normalizeOpenMeteoPayload,
} from "../src/services/weatherSource.js";

test("buildOpenMeteoUrl targets Marilia coordinates without an API key", () => {
  const url = buildOpenMeteoUrl();
  assert.match(url, /api\.open-meteo\.com/);
  assert.match(url, /latitude=-22\.2171/);
  assert.match(url, /longitude=-49\.9501/);
  assert.doesNotMatch(url, /key|apikey|token/i);
});

test("clear weather produces no incident", () => {
  const incidents = normalizeOpenMeteoPayload({
    current: { time: "2026-06-27T16:15", weather_code: 0, precipitation: 0, wind_gusts_10m: 12, wind_speed_10m: 7 },
  });
  assert.equal(incidents.length, 0);
});

test("thunderstorm is normalized as a high severity weather risk", () => {
  const [incident] = normalizeOpenMeteoPayload({
    current: {
      time: "2026-06-27T18:00",
      weather_code: 95,
      precipitation: 12.4,
      wind_gusts_10m: 70,
      wind_speed_10m: 30,
      temperature_2m: 21.3,
    },
  });

  assert.ok(incident);
  assert.equal(incident.type, "risco");
  assert.equal(incident.severity, "alta");
  assert.equal(incident.status, "ativo");
  assert.equal(incident.location, "Marilia-SP");
  assert.equal(incident.source, OPEN_METEO_SOURCE.name);
  assert.match(incident.title, /Tempestade/);
  assert.match(incident.detail, /Precipitacao 12\.4 mm/);
  assert.match(incident.detail, /Rajadas 70 km\/h/);
  assert.ok(incident.position.x >= 0 && incident.position.x <= 100);
});

test("strong wind gusts alone trigger a medium severity alert", () => {
  const [incident] = normalizeOpenMeteoPayload({
    current: { time: "2026-06-27T18:00", weather_code: 1, precipitation: 0, wind_gusts_10m: 65, wind_speed_10m: 40 },
  });

  assert.ok(incident);
  assert.equal(incident.severity, "media");
  assert.match(incident.detail, /Rajadas 65 km\/h/);
});

test("light rain is kept as a low severity advisory", () => {
  const [incident] = normalizeOpenMeteoPayload({
    current: { time: "2026-06-27T18:00", weather_code: 61, precipitation: 1.2, wind_gusts_10m: 18, wind_speed_10m: 9 },
  });

  assert.ok(incident);
  assert.equal(incident.severity, "baixa");
  assert.match(incident.title, /Chuva fraca/);
});

test("malformed payloads are ignored safely", () => {
  assert.deepEqual(normalizeOpenMeteoPayload(null), []);
  assert.deepEqual(normalizeOpenMeteoPayload({}), []);
  assert.deepEqual(normalizeOpenMeteoPayload({ current: null }), []);
});

test("fetchWeatherIncidents consults Open-Meteo and normalizes the response", async () => {
  const requestedUrls = [];
  const incidents = await fetchWeatherIncidents({
    fetchImpl: async (url) => {
      requestedUrls.push(url);
      return {
        ok: true,
        json: async () => ({
          current: {
            time: "2026-06-27T18:00",
            weather_code: 82,
            precipitation: 15,
            wind_gusts_10m: 55,
            wind_speed_10m: 25,
            temperature_2m: 20,
          },
        }),
      };
    },
  });

  assert.ok(requestedUrls.some((url) => url.includes("api.open-meteo.com")));
  assert.equal(incidents.length, 1);
  assert.equal(incidents[0].severity, "alta");
});

test("fetchWeatherIncidents surfaces HTTP errors", async () => {
  await assert.rejects(
    fetchWeatherIncidents({ fetchImpl: async () => ({ ok: false, status: 503, json: async () => ({}) }) }),
    /HTTP 503/,
  );
});
