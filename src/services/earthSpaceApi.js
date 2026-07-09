export const NASA_DEMO_KEY = "DEMO_KEY";

export const DEFAULT_LOCATION = {
  id: "marilia-sp",
  name: "Marilia",
  admin1: "Sao Paulo",
  country: "Brasil",
  countryCode: "BR",
  latitude: -22.2171,
  longitude: -49.9501,
  timezone: "America/Sao_Paulo",
  cptecId: "244",
};

const DEFAULT_TIMEOUT_MS = 12000;
const CPTEC_BASE_URL = "https://servicos.cptec.inpe.br/XML";
const NASA_API_BASE_URL = "https://api.nasa.gov";
const JPL_SSD_BASE_URL = "https://ssd-api.jpl.nasa.gov";

const WMO_DESCRIPTIONS = {
  0: "Ceu limpo",
  1: "Poucas nuvens",
  2: "Parcialmente nublado",
  3: "Nublado",
  45: "Nevoeiro",
  48: "Nevoeiro intenso",
  51: "Garoa fraca",
  53: "Garoa moderada",
  55: "Garoa forte",
  61: "Chuva fraca",
  63: "Chuva moderada",
  65: "Chuva forte",
  80: "Pancadas fracas",
  81: "Pancadas moderadas",
  82: "Pancadas fortes",
  95: "Tempestade",
  96: "Tempestade com granizo",
  99: "Tempestade severa",
};

const CPTEC_DESCRIPTIONS = {
  ec: "Encoberto com chuva isolada",
  ci: "Chuvas isoladas",
  c: "Chuva",
  in: "Instavel",
  pp: "Possibilidade de pancadas",
  cm: "Chuva pela manha",
  cn: "Chuva a noite",
  pt: "Pancadas a tarde",
  pm: "Pancadas pela manha",
  np: "Nublado com pancadas",
  pc: "Pancadas de chuva",
  pn: "Parcialmente nublado",
  cv: "Chuvisco",
  ch: "Chuvoso",
  t: "Tempestade",
  ps: "Predominio de sol",
  e: "Encoberto",
  n: "Nublado",
  cl: "Ceu claro",
  nv: "Nevoeiro",
  g: "Geada",
  ne: "Neve",
  nd: "Nao definido",
  pnt: "Pancadas a noite",
  psc: "Possibilidade de chuva",
  pcm: "Possibilidade de chuva pela manha",
  pct: "Possibilidade de chuva a tarde",
  pcn: "Possibilidade de chuva a noite",
  npt: "Nublado com pancadas a tarde",
  npn: "Nublado com pancadas a noite",
  ncn: "Nublado com chuva a noite",
  nct: "Nublado com chuva a tarde",
  ncm: "Nublado com chuva pela manha",
  npm: "Nublado com pancadas pela manha",
  npp: "Nublado com possibilidade de chuva",
  vn: "Variacao de nebulosidade",
  ct: "Chuva a tarde",
  ppn: "Possibilidade de pancadas a noite",
  ppt: "Possibilidade de pancadas a tarde",
  ppm: "Possibilidade de pancadas pela manha",
};

const BRAZIL_STATE_CODES = {
  acre: "AC",
  alagoas: "AL",
  amapa: "AP",
  amazonas: "AM",
  bahia: "BA",
  ceara: "CE",
  "distrito federal": "DF",
  "espirito santo": "ES",
  goias: "GO",
  maranhao: "MA",
  "mato grosso": "MT",
  "mato grosso do sul": "MS",
  "minas gerais": "MG",
  para: "PA",
  paraiba: "PB",
  parana: "PR",
  pernambuco: "PE",
  piaui: "PI",
  "rio de janeiro": "RJ",
  "rio grande do norte": "RN",
  "rio grande do sul": "RS",
  rondonia: "RO",
  roraima: "RR",
  "santa catarina": "SC",
  "sao paulo": "SP",
  sergipe: "SE",
  tocantins: "TO",
};

function readViteEnv() {
  return typeof import.meta !== "undefined" && import.meta.env ? import.meta.env : {};
}

function toFiniteNumber(value, fallback = null) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function normalizeText(value, fallback = "") {
  if (value === null || value === undefined) return fallback;
  return String(value).trim() || fallback;
}

function normalizeSearchText(value) {
  return normalizeText(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("pt-BR");
}

function compactNumber(value, digits = 0) {
  const number = toFiniteNumber(value);
  if (number === null) return null;
  return Number(number.toFixed(digits));
}

function dateToParam(date) {
  return date.toISOString().slice(0, 10);
}

function addDays(date, days) {
  const next = new Date(date);
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

function mergeSignals(parentSignal, timeoutMs) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  function abort() {
    controller.abort();
  }

  if (parentSignal) {
    if (parentSignal.aborted) controller.abort();
    else parentSignal.addEventListener("abort", abort, { once: true });
  }

  return {
    signal: controller.signal,
    cleanup() {
      clearTimeout(timeoutId);
      parentSignal?.removeEventListener?.("abort", abort);
    },
  };
}

async function request(url, { fetchImpl, signal, timeoutMs, accept }) {
  const requestSignal = mergeSignals(signal, timeoutMs);

  try {
    const response = await fetchImpl(url, {
      headers: { Accept: accept },
      signal: requestSignal.signal,
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    return response;
  } finally {
    requestSignal.cleanup();
  }
}

async function fetchJson(url, options) {
  const response = await request(url, { ...options, accept: "application/json" });
  if (typeof response.json === "function") return response.json();
  return JSON.parse(await response.text());
}

async function fetchText(url, options) {
  const response = await request(url, { ...options, accept: "application/xml,text/xml,text/plain" });
  if (typeof response.text === "function") return response.text();
  return "";
}

function getWeatherDescription(code) {
  return WMO_DESCRIPTIONS[Math.round(Number(code))] ?? "Condicao variavel";
}

function getCptecDescription(code) {
  return CPTEC_DESCRIPTIONS[normalizeText(code).toLocaleLowerCase("pt-BR")] ?? "Previsao nacional";
}

function readIndexed(source, index, fallback = null) {
  return Array.isArray(source) && index >= 0 ? source[index] ?? fallback : fallback;
}

function indexOfField(fields, name) {
  return Array.isArray(fields) ? fields.indexOf(name) : -1;
}

function decodeXml(value) {
  return normalizeText(value)
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

function getXmlTag(block, tag) {
  const match = String(block).match(new RegExp(`<${tag}>([\\s\\S]*?)<\\/${tag}>`, "i"));
  return decodeXml(match?.[1] ?? "");
}

function getXmlBlocks(xml, tag) {
  return [...String(xml).matchAll(new RegExp(`<${tag}>([\\s\\S]*?)<\\/${tag}>`, "gi"))].map((match) => match[1]);
}

function createSourceStatus(id, label, state, detail) {
  return { id, label, state, detail };
}

function hasUsefulData(value) {
  if (!value) return false;
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value !== "object") return true;

  return Object.values(value).some((entry) => {
    if (Array.isArray(entry)) return entry.length > 0;
    return entry !== null && entry !== undefined && entry !== "";
  });
}

function locationMatchesMarilia(location) {
  return (
    normalizeSearchText(location?.name).includes("marilia") &&
    normalizeSearchText(location?.admin1).includes("sao paulo")
  );
}

export function getNasaApiKey(env = readViteEnv()) {
  return normalizeText(env.VITE_NASA_API_KEY, NASA_DEMO_KEY);
}

export function buildLocationLabel(location = DEFAULT_LOCATION) {
  return [location.name, location.admin1, location.country].filter(Boolean).join(", ");
}

export function buildOpenMeteoForecastUrl(location = DEFAULT_LOCATION) {
  const params = new URLSearchParams({
    latitude: String(location.latitude),
    longitude: String(location.longitude),
    current:
      "temperature_2m,relative_humidity_2m,apparent_temperature,is_day,precipitation,rain,weather_code,cloud_cover,pressure_msl,wind_speed_10m,wind_direction_10m,wind_gusts_10m",
    hourly: "temperature_2m,precipitation_probability,precipitation,cloud_cover,wind_gusts_10m",
    daily:
      "weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max,precipitation_sum,uv_index_max,wind_speed_10m_max,sunrise,sunset",
    wind_speed_unit: "kmh",
    precipitation_unit: "mm",
    timezone: location.timezone || "auto",
    forecast_days: "7",
  });

  return `https://api.open-meteo.com/v1/forecast?${params.toString()}`;
}

export function buildGeocodingUrl(query) {
  const params = new URLSearchParams({
    name: normalizeText(query),
    count: "6",
    language: "pt",
    format: "json",
  });

  return `https://geocoding-api.open-meteo.com/v1/search?${params.toString()}`;
}

export function buildCptecCitySearchUrl(query) {
  return `${CPTEC_BASE_URL}/listaCidades?city=${encodeURIComponent(normalizeText(query))}`;
}

export function buildCptecForecastUrl(cityId = DEFAULT_LOCATION.cptecId) {
  return `${CPTEC_BASE_URL}/cidade/${encodeURIComponent(cityId)}/previsao.xml`;
}

export function buildApodUrl(apiKey = NASA_DEMO_KEY) {
  const params = new URLSearchParams({ api_key: apiKey, thumbs: "true" });
  return `${NASA_API_BASE_URL}/planetary/apod?${params.toString()}`;
}

export function buildNeoWsUrl(apiKey = NASA_DEMO_KEY, now = new Date()) {
  const params = new URLSearchParams({
    start_date: dateToParam(now),
    end_date: dateToParam(addDays(now, 7)),
    api_key: apiKey,
  });

  return `${NASA_API_BASE_URL}/neo/rest/v1/feed?${params.toString()}`;
}

export function buildJplCloseApproachUrl() {
  const params = new URLSearchParams({
    "date-min": "now",
    "date-max": "+30",
    "dist-max": "0.2",
    sort: "date",
    limit: "8",
    fullname: "true",
  });

  return `${JPL_SSD_BASE_URL}/cad.api?${params.toString()}`;
}

export function buildFireballUrl(limit = 8) {
  const params = new URLSearchParams({ limit: String(limit), "req-loc": "true" });
  return `${JPL_SSD_BASE_URL}/fireball.api?${params.toString()}`;
}

export function buildMarsRoverPhotosUrl(apiKey = NASA_DEMO_KEY) {
  const params = new URLSearchParams({ sol: "1000", camera: "fhaz", page: "1", api_key: apiKey });
  return `${NASA_API_BASE_URL}/mars-photos/api/v1/rovers/curiosity/photos?${params.toString()}`;
}

export function normalizeGeocodingResults(payload) {
  return (Array.isArray(payload?.results) ? payload.results : []).map((place) => ({
    id: String(place.id ?? `${place.latitude}-${place.longitude}`),
    name: normalizeText(place.name),
    admin1: normalizeText(place.admin1),
    country: normalizeText(place.country),
    countryCode: normalizeText(place.country_code),
    latitude: toFiniteNumber(place.latitude, DEFAULT_LOCATION.latitude),
    longitude: toFiniteNumber(place.longitude, DEFAULT_LOCATION.longitude),
    timezone: normalizeText(place.timezone, "auto"),
  }));
}

export function normalizeWeatherPayload(payload, location = DEFAULT_LOCATION) {
  const current = payload?.current ?? {};
  const daily = payload?.daily ?? {};
  const hourly = payload?.hourly ?? {};

  return {
    location,
    current: {
      time: normalizeText(current.time),
      temperature: compactNumber(current.temperature_2m, 1),
      apparentTemperature: compactNumber(current.apparent_temperature, 1),
      humidity: compactNumber(current.relative_humidity_2m),
      precipitation: compactNumber(current.precipitation, 1),
      rain: compactNumber(current.rain, 1),
      weatherCode: compactNumber(current.weather_code),
      condition: getWeatherDescription(current.weather_code),
      cloudCover: compactNumber(current.cloud_cover),
      pressure: compactNumber(current.pressure_msl),
      windSpeed: compactNumber(current.wind_speed_10m),
      windDirection: compactNumber(current.wind_direction_10m),
      windGusts: compactNumber(current.wind_gusts_10m),
      isDay: current.is_day === 1,
    },
    daily: (daily.time ?? []).map((date, index) => ({
      date,
      condition: getWeatherDescription(readIndexed(daily.weather_code, index)),
      max: compactNumber(readIndexed(daily.temperature_2m_max, index), 1),
      min: compactNumber(readIndexed(daily.temperature_2m_min, index), 1),
      rainProbability: compactNumber(readIndexed(daily.precipitation_probability_max, index)),
      precipitation: compactNumber(readIndexed(daily.precipitation_sum, index), 1),
      uv: compactNumber(readIndexed(daily.uv_index_max, index), 1),
      wind: compactNumber(readIndexed(daily.wind_speed_10m_max, index)),
      sunrise: normalizeText(readIndexed(daily.sunrise, index)),
      sunset: normalizeText(readIndexed(daily.sunset, index)),
    })),
    hourly: (hourly.time ?? []).slice(0, 24).map((time, index) => ({
      time,
      hour: normalizeText(time).slice(11, 16),
      temperature: compactNumber(readIndexed(hourly.temperature_2m, index), 1),
      rainProbability: compactNumber(readIndexed(hourly.precipitation_probability, index)),
      precipitation: compactNumber(readIndexed(hourly.precipitation, index), 1),
      cloudCover: compactNumber(readIndexed(hourly.cloud_cover, index)),
      gusts: compactNumber(readIndexed(hourly.wind_gusts_10m, index)),
    })),
  };
}

export function normalizeCptecCitySearchXml(xml) {
  return getXmlBlocks(xml, "cidade").map((block) => ({
    id: getXmlTag(block, "id"),
    name: getXmlTag(block, "nome"),
    uf: getXmlTag(block, "uf"),
  }));
}

export function normalizeCptecForecastXml(xml) {
  const cityBlock = String(xml);
  const days = getXmlBlocks(xml, "previsao").map((block) => {
    const code = getXmlTag(block, "tempo");
    return {
      date: getXmlTag(block, "dia"),
      code,
      condition: getCptecDescription(code),
      max: toFiniteNumber(getXmlTag(block, "maxima")),
      min: toFiniteNumber(getXmlTag(block, "minima")),
      uv: toFiniteNumber(getXmlTag(block, "iuv")),
    };
  });

  return {
    city: getXmlTag(cityBlock, "nome"),
    uf: getXmlTag(cityBlock, "uf"),
    updatedAt: getXmlTag(cityBlock, "atualizacao"),
    days,
  };
}

export function normalizeApodPayload(payload) {
  if (!payload || typeof payload !== "object") return null;

  return {
    title: normalizeText(payload.title, "Astronomy Picture of the Day"),
    date: normalizeText(payload.date),
    mediaType: normalizeText(payload.media_type, "image"),
    imageUrl: normalizeText(payload.media_type) === "video" ? normalizeText(payload.thumbnail_url) : normalizeText(payload.hdurl || payload.url),
    url: normalizeText(payload.url),
    copyright: normalizeText(payload.copyright),
    explanation: normalizeText(payload.explanation),
  };
}

export function normalizeNeoWsPayload(payload) {
  const byDate = payload?.near_earth_objects ?? {};
  const items = Object.entries(byDate).flatMap(([date, objects]) =>
    (Array.isArray(objects) ? objects : []).map((object) => {
      const approach = object.close_approach_data?.[0] ?? {};
      const diameter = object.estimated_diameter?.meters ?? {};
      const minDiameter = toFiniteNumber(diameter.estimated_diameter_min, 0);
      const maxDiameter = toFiniteNumber(diameter.estimated_diameter_max, 0);

      return {
        id: normalizeText(object.id),
        name: normalizeText(object.name),
        date,
        approachDate: normalizeText(approach.close_approach_date_full || approach.close_approach_date, date),
        velocityKmS: compactNumber(approach.relative_velocity?.kilometers_per_second, 2),
        missDistanceKm: compactNumber(approach.miss_distance?.kilometers),
        diameterM: compactNumber((minDiameter + maxDiameter) / 2, 1),
        hazardous: Boolean(object.is_potentially_hazardous_asteroid),
        nasaUrl: normalizeText(object.nasa_jpl_url),
      };
    }),
  );

  items.sort((a, b) => (a.missDistanceKm ?? Number.POSITIVE_INFINITY) - (b.missDistanceKm ?? Number.POSITIVE_INFINITY));

  return {
    count: toFiniteNumber(payload?.element_count, items.length) ?? items.length,
    hazardousCount: items.filter((item) => item.hazardous).length,
    closest: items[0] ?? null,
    largest: [...items].sort((a, b) => (b.diameterM ?? 0) - (a.diameterM ?? 0))[0] ?? null,
    items: items.slice(0, 8),
  };
}

export function normalizeJplCadPayload(payload) {
  const fields = payload?.fields ?? [];
  const data = Array.isArray(payload?.data) ? payload.data : [];

  return data.map((row) => ({
    designation: normalizeText(readIndexed(row, indexOfField(fields, "des"))),
    name: normalizeText(readIndexed(row, indexOfField(fields, "fullname"))) || normalizeText(readIndexed(row, indexOfField(fields, "des"))),
    date: normalizeText(readIndexed(row, indexOfField(fields, "cd"))),
    distanceAu: compactNumber(readIndexed(row, indexOfField(fields, "dist")), 5),
    velocityKmS: compactNumber(readIndexed(row, indexOfField(fields, "v_rel")), 2),
    magnitudeH: compactNumber(readIndexed(row, indexOfField(fields, "h")), 1),
    diameterKm: compactNumber(readIndexed(row, indexOfField(fields, "diameter")), 3),
  }));
}

export function normalizeFireballPayload(payload) {
  const fields = payload?.fields ?? [];
  const data = Array.isArray(payload?.data) ? payload.data : [];

  return data.map((row) => {
    const lat = toFiniteNumber(readIndexed(row, indexOfField(fields, "lat")));
    const lon = toFiniteNumber(readIndexed(row, indexOfField(fields, "lon")));
    const latDir = normalizeText(readIndexed(row, indexOfField(fields, "lat-dir")));
    const lonDir = normalizeText(readIndexed(row, indexOfField(fields, "lon-dir")));

    return {
      date: normalizeText(readIndexed(row, indexOfField(fields, "date"))),
      latitude: lat === null ? null : lat * (latDir === "S" ? -1 : 1),
      longitude: lon === null ? null : lon * (lonDir === "W" ? -1 : 1),
      altitudeKm: compactNumber(readIndexed(row, indexOfField(fields, "alt")), 1),
      energy: compactNumber(readIndexed(row, indexOfField(fields, "energy")), 1),
      impactEnergyKt: compactNumber(readIndexed(row, indexOfField(fields, "impact-e")), 3),
    };
  });
}

export function normalizeMarsRoverPayload(payload) {
  const photos = Array.isArray(payload?.latest_photos) ? payload.latest_photos : payload?.photos;

  return (Array.isArray(photos) ? photos : []).slice(0, 6).map((photo) => ({
    id: String(photo.id ?? photo.img_src),
    rover: normalizeText(photo.rover?.name, "Curiosity"),
    camera: normalizeText(photo.camera?.full_name || photo.camera?.name, "Camera"),
    earthDate: normalizeText(photo.earth_date),
    sol: toFiniteNumber(photo.sol),
    imageUrl: normalizeText(photo.img_src).replace(/^http:\/\//i, "https://"),
  }));
}

async function fetchCptecForecastForLocation(location, options) {
  if (location.countryCode && location.countryCode !== "BR") {
    return null;
  }

  let cityId = location.cptecId;

  if (!cityId && locationMatchesMarilia(location)) {
    cityId = DEFAULT_LOCATION.cptecId;
  }

  if (!cityId) {
    const cityXml = await fetchText(buildCptecCitySearchUrl(location.name), options);
    const cities = normalizeCptecCitySearchXml(cityXml);
    const state = BRAZIL_STATE_CODES[normalizeSearchText(location.admin1)] ?? normalizeText(location.admin1).toUpperCase();
    const city = cities.find((item) => normalizeText(item.uf).toUpperCase() === state) ?? cities[0];
    cityId = city?.id;
  }

  if (!cityId) return null;

  const forecastXml = await fetchText(buildCptecForecastUrl(cityId), options);
  return normalizeCptecForecastXml(forecastXml);
}

export async function searchLocations(query, { fetchImpl = globalThis.fetch, signal, timeoutMs = DEFAULT_TIMEOUT_MS } = {}) {
  if (!normalizeText(query)) return [];
  if (typeof fetchImpl !== "function") throw new Error("Fetch API indisponivel neste ambiente.");

  const payload = await fetchJson(buildGeocodingUrl(query), { fetchImpl, signal, timeoutMs });
  return normalizeGeocodingResults(payload);
}

export async function fetchEarthSpaceDashboard({
  location = DEFAULT_LOCATION,
  env = readViteEnv(),
  fetchImpl = globalThis.fetch,
  signal,
  timeoutMs = DEFAULT_TIMEOUT_MS,
  now = new Date(),
} = {}) {
  if (typeof fetchImpl !== "function") throw new Error("Fetch API indisponivel neste ambiente.");

  const apiKey = getNasaApiKey(env);
  const options = { fetchImpl, signal, timeoutMs };
  const tasks = [
    {
      key: "weather",
      label: "Open-Meteo",
      run: async () => normalizeWeatherPayload(await fetchJson(buildOpenMeteoForecastUrl(location), options), location),
    },
    {
      key: "cptec",
      label: "CPTEC/INPE",
      run: async () => fetchCptecForecastForLocation(location, options),
    },
    {
      key: "apod",
      label: "NASA APOD",
      run: async () => normalizeApodPayload(await fetchJson(buildApodUrl(apiKey), options)),
    },
    {
      key: "neows",
      label: "NASA NeoWs",
      run: async () => normalizeNeoWsPayload(await fetchJson(buildNeoWsUrl(apiKey, now), options)),
    },
    {
      key: "cad",
      label: "NASA/JPL Close-Approach",
      run: async () => normalizeJplCadPayload(await fetchJson(buildJplCloseApproachUrl(), options)),
    },
    {
      key: "fireballs",
      label: "NASA/JPL Fireball",
      run: async () => normalizeFireballPayload(await fetchJson(buildFireballUrl(), options)),
    },
    {
      key: "marsPhotos",
      label: "NASA Mars Rover Photos",
      run: async () => normalizeMarsRoverPayload(await fetchJson(buildMarsRoverPhotosUrl(apiKey), options)),
    },
  ];

  const settled = await Promise.allSettled(tasks.map((task) => task.run()));
  const data = {};
  const sources = [];
  const warnings = [];

  settled.forEach((result, index) => {
    const task = tasks[index];

    if (result.status === "fulfilled") {
      data[task.key] = result.value;
      sources.push(
        createSourceStatus(
          task.key,
          task.label,
          hasUsefulData(result.value) ? "online" : "sem-dados",
          hasUsefulData(result.value) ? "Dados recebidos" : "Fonte respondeu sem dados para o recorte atual",
        ),
      );
      return;
    }

    data[task.key] = ["weather", "cptec", "apod", "neows"].includes(task.key) ? null : [];
    sources.push(createSourceStatus(task.key, task.label, "erro", result.reason?.message ?? "Falha desconhecida"));
    warnings.push(`${task.label}: ${result.reason?.message ?? "falha ao consultar"}`);
  });

  return {
    location,
    ...data,
    sources,
    warnings,
    fetchedAt: new Date().toISOString(),
  };
}
