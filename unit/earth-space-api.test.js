import test from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_LOCATION,
  buildApodUrl,
  buildCptecForecastUrl,
  buildFireballUrl,
  buildGeocodingUrl,
  buildJplCloseApproachUrl,
  buildMarsRoverPhotosUrl,
  buildNasaImageSearchUrl,
  buildNeoWsUrl,
  buildOpenMeteoForecastUrl,
  fetchEarthSpaceDashboard,
  getNasaApiKey,
  normalizeApodPayload,
  normalizeCptecCitySearchXml,
  normalizeCptecForecastXml,
  normalizeFireballPayload,
  normalizeGeocodingResults,
  normalizeJplCadPayload,
  normalizeMarsRoverPayload,
  normalizeNasaImagePayload,
  normalizeNeoWsPayload,
  normalizeWeatherPayload,
} from "../src/services/earthSpaceApi.js";

test("Open-Meteo URLs use coordinates and no API key", () => {
  const forecastUrl = buildOpenMeteoForecastUrl(DEFAULT_LOCATION);
  const geocodingUrl = buildGeocodingUrl("Marilia");

  assert.match(forecastUrl, /api\.open-meteo\.com/);
  assert.match(forecastUrl, /latitude=-22\.2171/);
  assert.match(forecastUrl, /longitude=-49\.9501/);
  assert.doesNotMatch(forecastUrl, /api_key|apikey|token/i);
  assert.match(geocodingUrl, /geocoding-api\.open-meteo\.com/);
  assert.match(geocodingUrl, /name=Marilia/);
});

test("geocoding payload becomes selectable locations", () => {
  const [place] = normalizeGeocodingResults({
    results: [
      {
        id: 1,
        name: "Marilia",
        admin1: "Sao Paulo",
        country: "Brazil",
        country_code: "BR",
        latitude: -22.217,
        longitude: -49.95,
        timezone: "America/Sao_Paulo",
      },
    ],
  });

  assert.equal(place.id, "1");
  assert.equal(place.countryCode, "BR");
  assert.equal(place.timezone, "America/Sao_Paulo");
});

test("weather payload is normalized for current, daily and hourly views", () => {
  const weather = normalizeWeatherPayload(
    {
      current: {
        time: "2026-07-09T12:00",
        temperature_2m: 27.5,
        apparent_temperature: 28.1,
        relative_humidity_2m: 62,
        weather_code: 95,
        precipitation: 4.2,
        wind_gusts_10m: 54,
      },
      daily: {
        time: ["2026-07-09"],
        weather_code: [95],
        temperature_2m_max: [29],
        temperature_2m_min: [18],
        precipitation_probability_max: [80],
        precipitation_sum: [11.2],
        uv_index_max: [6.4],
        wind_speed_10m_max: [34],
        sunrise: ["2026-07-09T06:50"],
        sunset: ["2026-07-09T17:42"],
      },
      hourly: {
        time: ["2026-07-09T12:00"],
        temperature_2m: [27.5],
        precipitation_probability: [78],
        precipitation: [2],
        cloud_cover: [88],
        wind_gusts_10m: [54],
      },
    },
    DEFAULT_LOCATION,
  );

  assert.equal(weather.current.condition, "Tempestade");
  assert.equal(weather.current.temperature, 27.5);
  assert.equal(weather.daily[0].rainProbability, 80);
  assert.equal(weather.hourly[0].hour, "12:00");
});

test("CPTEC XML search and forecast are normalized", () => {
  const cities = normalizeCptecCitySearchXml(`
    <cidades><cidade><nome>Marilia</nome><uf>SP</uf><id>244</id></cidade></cidades>
  `);
  const forecast = normalizeCptecForecastXml(`
    <cidade>
      <nome>Marilia</nome><uf>SP</uf><atualizacao>2026-07-09</atualizacao>
      <previsao><dia>2026-07-09</dia><tempo>pn</tempo><maxima>28</maxima><minima>16</minima><iuv>5.0</iuv></previsao>
    </cidade>
  `);

  assert.equal(cities[0].id, "244");
  assert.equal(forecast.city, "Marilia");
  assert.equal(forecast.days[0].condition, "Parcialmente nublado");
  assert.equal(forecast.days[0].uv, 5);
});

test("NeoWs payload summarizes closest and hazardous asteroids", () => {
  const neows = normalizeNeoWsPayload({
    element_count: 2,
    near_earth_objects: {
      "2026-07-09": [
        {
          id: "1",
          name: "(2026 AA)",
          is_potentially_hazardous_asteroid: true,
          estimated_diameter: { meters: { estimated_diameter_min: 20, estimated_diameter_max: 40 } },
          close_approach_data: [
            {
              close_approach_date_full: "2026-Jul-09 10:00",
              relative_velocity: { kilometers_per_second: "12.34" },
              miss_distance: { kilometers: "1200000" },
            },
          ],
        },
      ],
      "2026-07-10": [
        {
          id: "2",
          name: "(2026 BB)",
          estimated_diameter: { meters: { estimated_diameter_min: 60, estimated_diameter_max: 80 } },
          close_approach_data: [{ miss_distance: { kilometers: "800000" } }],
        },
      ],
    },
  });

  assert.equal(neows.count, 2);
  assert.equal(neows.hazardousCount, 1);
  assert.equal(neows.closest.id, "2");
  assert.equal(neows.largest.id, "2");
});

test("JPL CAD URL keeps encoded relative date and payload maps field arrays", () => {
  const url = buildJplCloseApproachUrl();
  const [approach] = normalizeJplCadPayload({
    fields: ["des", "cd", "dist", "v_rel", "h", "diameter", "fullname"],
    data: [["2026 AB", "2026-Jul-09 13:00", "0.03456", "15.8", "21.2", "0.12", "2026 AB"]],
  });

  assert.match(url, /date-max=%2B30/);
  assert.equal(approach.name, "2026 AB");
  assert.equal(approach.distanceAu, 0.03456);
  assert.equal(approach.velocityKmS, 15.8);
});

test("NASA and CPTEC builders encode keys, dates and search text", () => {
  const neowsUrl = buildNeoWsUrl("abc123", new Date("2026-07-09T00:00:00Z"));

  assert.match(buildApodUrl("abc123"), /planetary\/apod\?api_key=abc123&thumbs=true/);
  assert.match(neowsUrl, /start_date=2026-07-09/);
  assert.match(neowsUrl, /end_date=2026-07-16/);
  assert.match(neowsUrl, /api_key=abc123/);
  assert.match(buildCptecForecastUrl("244"), /cidade\/244\/previsao\.xml/);
  assert.match(buildFireballUrl(12), /fireball\.api\?limit=12&req-loc=true/);
  assert.match(buildMarsRoverPhotosUrl("abc123"), /mars-photos\/api\/v1\/rovers\/curiosity\/photos/);
  assert.match(buildMarsRoverPhotosUrl("abc123"), /api_key=abc123/);
  assert.match(buildNasaImageSearchUrl("mars weather"), /q=mars\+weather/);
  assert.equal(getNasaApiKey({}), "DEMO_KEY");
  assert.equal(getNasaApiKey({ VITE_NASA_API_KEY: "real-key" }), "real-key");
});

test("APOD and Mars rover payloads handle media variants safely", () => {
  const video = normalizeApodPayload({
    title: "Solar video",
    date: "2026-07-09",
    media_type: "video",
    thumbnail_url: "https://example.test/thumb.jpg",
    url: "https://example.test/video",
  });
  const [latestPhoto] = normalizeMarsRoverPayload({
    latest_photos: [
      {
        id: 99,
        img_src: "http://mars.nasa.gov/photo.jpg",
        earth_date: "2026-07-09",
        sol: 1000,
        rover: { name: "Curiosity" },
        camera: { full_name: "Front Hazard Avoidance Camera" },
      },
    ],
  });

  assert.equal(normalizeApodPayload(null), null);
  assert.equal(video.imageUrl, "https://example.test/thumb.jpg");
  assert.equal(video.mediaType, "video");
  assert.equal(latestPhoto.id, "99");
  assert.match(latestPhoto.imageUrl, /^https:\/\//);
  assert.equal(latestPhoto.camera, "Front Hazard Avoidance Camera");
});

test("fireball payload converts coordinates by hemisphere", () => {
  const [fireball] = normalizeFireballPayload({
    fields: ["date", "lat", "lat-dir", "lon", "lon-dir", "alt", "energy", "impact-e"],
    data: [["2026-07-08 12:00:00", "22.1", "S", "49.5", "W", "31.2", "2.3", "0.08"]],
  });

  assert.equal(fireball.latitude, -22.1);
  assert.equal(fireball.longitude, -49.5);
  assert.equal(fireball.altitudeKm, 31.2);
});

test("NASA image library payload keeps preview image metadata", () => {
  const [image] = normalizeNasaImagePayload({
    collection: {
      items: [
        {
          data: [{ nasa_id: "img-1", title: "Earth", center: "GSFC", date_created: "2026-07-09T00:00:00Z" }],
          links: [{ href: "http://images-assets.nasa.gov/image/img-1/thumb.jpg", render: "image" }],
        },
      ],
    },
  });

  assert.equal(image.nasaId, "img-1");
  assert.match(image.imageUrl, /^https:\/\//);
});

test("fetchEarthSpaceDashboard aggregates sources without live network", async () => {
  const requestedUrls = [];
  const result = await fetchEarthSpaceDashboard({
    now: new Date("2026-07-09T12:00:00Z"),
    fetchImpl: async (url) => {
      requestedUrls.push(url);

      if (url.includes("api.open-meteo.com")) {
        return { ok: true, json: async () => ({ current: { weather_code: 0, temperature_2m: 24 }, daily: { time: [] }, hourly: { time: [] } }) };
      }

      if (url.includes("servicos.cptec.inpe.br")) {
        return {
          ok: true,
          text: async () => `
            <cidade><nome>Marilia</nome><uf>SP</uf>
              <previsao><dia>2026-07-09</dia><tempo>ps</tempo><maxima>28</maxima><minima>15</minima><iuv>6</iuv></previsao>
            </cidade>
          `,
        };
      }

      if (url.includes("planetary/apod")) {
        return { ok: true, json: async () => ({ title: "APOD", media_type: "image", url: "https://example.test/apod.jpg" }) };
      }

      if (url.includes("neo/rest")) {
        return { ok: true, json: async () => ({ element_count: 0, near_earth_objects: {} }) };
      }

      if (url.includes("cad.api")) {
        return { ok: true, json: async () => ({ fields: ["des"], data: [] }) };
      }

      if (url.includes("fireball.api")) {
        return { ok: true, json: async () => ({ fields: ["date"], data: [] }) };
      }

      if (url.includes("mars-photos")) {
        return { ok: true, json: async () => ({ photos: [] }) };
      }

      if (url.includes("images-api.nasa.gov")) {
        return { ok: true, json: async () => ({ collection: { items: [] } }) };
      }

      return { ok: false, status: 404, json: async () => ({}) };
    },
  });

  assert.ok(requestedUrls.some((url) => url.includes("api.open-meteo.com")));
  assert.ok(requestedUrls.some((url) => url.includes("planetary/apod")));
  assert.ok(result.weather.current);
  assert.equal(result.cptec.city, "Marilia");
  assert.equal(result.sources.find((source) => source.id === "weather").state, "online");
});

test("fetchEarthSpaceDashboard keeps useful data when one space source fails", async () => {
  const result = await fetchEarthSpaceDashboard({
    now: new Date("2026-07-09T12:00:00Z"),
    fetchImpl: async (url) => {
      if (url.includes("api.open-meteo.com")) {
        return { ok: true, json: async () => ({ current: { weather_code: 1, temperature_2m: 23 }, daily: { time: [] }, hourly: { time: [] } }) };
      }

      if (url.includes("servicos.cptec.inpe.br")) {
        return { ok: true, text: async () => "<cidade><nome>Marilia</nome><uf>SP</uf></cidade>" };
      }

      if (url.includes("planetary/apod")) {
        return { ok: false, status: 500, json: async () => ({}) };
      }

      if (url.includes("neo/rest")) {
        return { ok: true, json: async () => ({ element_count: 0, near_earth_objects: {} }) };
      }

      if (url.includes("cad.api") || url.includes("fireball.api")) {
        return { ok: true, json: async () => ({ fields: ["date"], data: [] }) };
      }

      if (url.includes("mars-photos")) {
        return { ok: true, json: async () => ({ photos: [] }) };
      }

      if (url.includes("images-api.nasa.gov")) {
        return { ok: true, json: async () => ({ collection: { items: [] } }) };
      }

      return { ok: false, status: 404, json: async () => ({}) };
    },
  });

  assert.equal(result.weather.current.temperature, 23);
  assert.equal(result.apod, null);
  assert.equal(result.sources.find((source) => source.id === "apod").state, "erro");
  assert.equal(result.sources.find((source) => source.id === "cad").state, "sem-dados");
  assert.ok(result.warnings.some((warning) => warning.includes("NASA APOD")));
});
