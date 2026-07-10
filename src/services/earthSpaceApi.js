export const NASA_DEMO_KEY = "DEMO_KEY";

export const DEFAULT_LOCATION = {
  id: "marilia-sp",
  name: "Marília",
  admin1: "São Paulo",
  country: "Brasil",
  countryCode: "BR",
  latitude: -22.2171,
  longitude: -49.9501,
  timezone: "America/Sao_Paulo",
  cptecId: "244",
};

const DEFAULT_TIMEOUT_MS = 12000;
// Requisicoes via proxy de CORS falham mais rapido: um proxy publico lento
// nao deve segurar o painel inteiro por 12s antes de cair para erro/cache.
const PROXY_TIMEOUT_MS = 8000;
const CPTEC_BASE_URL = "https://servicos.cptec.inpe.br/XML";
const NASA_API_BASE_URL = "https://api.nasa.gov";
const JPL_SSD_BASE_URL = "https://ssd-api.jpl.nasa.gov";

// Cache local (localStorage) para evitar rate limit e falhas transitorias.
// Cada fonte so vai a rede quando o cache "fresco" expira (TTL). Se a rede
// falhar, exibimos o ultimo valor bom enquanto ele nao estiver muito velho.
const CACHE_PREFIX = "togs-cache:v1:";
const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;

const CACHE_TTL_MS = {
  weather: 15 * MINUTE,
  cptec: 3 * HOUR,
  apod: 6 * HOUR,
  neows: 6 * HOUR,
  cad: 6 * HOUR,
  fireballs: 3 * HOUR,
  marsPhotos: 12 * HOUR,
};

// Ate quando um valor expirado ainda serve como fallback em caso de falha.
const CACHE_STALE_MAX_MS = 24 * HOUR;

// Proxy de CORS para fontes que nao enviam Access-Control-Allow-Origin
// (CPTEC/INPE e JPL SSD). Configuravel via VITE_CORS_PROXY; use {url} como
// marcador do endpoint alvo. Padrao: allorigins (GET publico, sem chave).
const DEFAULT_CORS_PROXY = "https://api.allorigins.win/raw?url={url}";

function getCorsProxy(env = readViteEnv()) {
  // String vazia desativa o proxy explicitamente.
  const configured = env.VITE_CORS_PROXY;
  if (configured === "" ) return "";
  return normalizeText(configured, DEFAULT_CORS_PROXY);
}

function buildProxiedUrl(targetUrl, proxyTemplate) {
  const template = normalizeText(proxyTemplate);
  if (!template) return null;
  const encoded = encodeURIComponent(targetUrl);
  return template.includes("{url}") ? template.replace("{url}", encoded) : `${template}${encoded}`;
}

function delay(ms, signal) {
  return new Promise((resolve, reject) => {
    const timeoutId = setTimeout(resolve, ms);
    if (signal) {
      if (signal.aborted) {
        clearTimeout(timeoutId);
        reject(signal.reason ?? new DOMException("Aborted", "AbortError"));
        return;
      }
      signal.addEventListener(
        "abort",
        () => {
          clearTimeout(timeoutId);
          reject(signal.reason ?? new DOMException("Aborted", "AbortError"));
        },
        { once: true },
      );
    }
  });
}

function getDefaultStorage() {
  try {
    if (typeof globalThis !== "undefined" && globalThis.localStorage) {
      return globalThis.localStorage;
    }
  } catch {
    // Acesso a localStorage pode lancar (modo privativo/SSR). Segue sem cache.
  }
  return null;
}

function readCacheEntry(storage, key) {
  if (!storage) return null;
  try {
    const raw = storage.getItem(CACHE_PREFIX + key);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed.storedAt !== "number") return null;
    return parsed;
  } catch {
    return null;
  }
}

function writeCacheEntry(storage, key, value) {
  if (!storage) return;
  try {
    storage.setItem(CACHE_PREFIX + key, JSON.stringify({ storedAt: Date.now(), value }));
  } catch {
    // Cota cheia ou storage indisponivel: ignora, cache e best-effort.
  }
}

function isRetriableError(error) {
  if (!error || error.name === "AbortError") return false;
  const status = error.status;
  // Sem status = falha de rede/CORS. 5xx transitorio. Nunca 429 (rate limit).
  return status === undefined || status === 502 || status === 503 || status === 504;
}

async function withRetry(fn, { retries = 1, baseDelayMs = 500, signal } = {}) {
  let attempt = 0;
  for (;;) {
    try {
      return await fn();
    } catch (error) {
      if (attempt >= retries || !isRetriableError(error)) throw error;
      attempt += 1;
      await delay(baseDelayMs * attempt, signal);
    }
  }
}

const WMO_DESCRIPTIONS = {
  0: "Céu limpo",
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
  in: "Instável",
  pp: "Possibilidade de pancadas",
  cm: "Chuva pela manhã",
  cn: "Chuva à noite",
  pt: "Pancadas à tarde",
  pm: "Pancadas pela manhã",
  np: "Nublado com pancadas",
  pc: "Pancadas de chuva",
  pn: "Parcialmente nublado",
  cv: "Chuvisco",
  ch: "Chuvoso",
  t: "Tempestade",
  ps: "Predomínio de sol",
  e: "Encoberto",
  n: "Nublado",
  cl: "Céu claro",
  nv: "Nevoeiro",
  g: "Geada",
  ne: "Neve",
  nd: "Não definido",
  pnt: "Pancadas à noite",
  psc: "Possibilidade de chuva",
  pcm: "Possibilidade de chuva pela manhã",
  pct: "Possibilidade de chuva à tarde",
  pcn: "Possibilidade de chuva à noite",
  npt: "Nublado com pancadas à tarde",
  npn: "Nublado com pancadas à noite",
  ncn: "Nublado com chuva à noite",
  nct: "Nublado com chuva à tarde",
  ncm: "Nublado com chuva pela manhã",
  npm: "Nublado com pancadas pela manhã",
  npp: "Nublado com possibilidade de chuva",
  vn: "Variação de nebulosidade",
  ct: "Chuva à tarde",
  ppn: "Possibilidade de pancadas à noite",
  ppt: "Possibilidade de pancadas à tarde",
  ppm: "Possibilidade de pancadas pela manhã",
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

async function rawRequest(url, { fetchImpl, signal, timeoutMs, accept }) {
  const requestSignal = mergeSignals(signal, timeoutMs);

  try {
    const response = await fetchImpl(url, {
      headers: { Accept: accept },
      signal: requestSignal.signal,
    });

    if (!response.ok) {
      const error = new Error(`HTTP ${response.status}`);
      error.status = response.status;
      throw error;
    }

    return response;
  } finally {
    requestSignal.cleanup();
  }
}

// Hosts conhecidos por nao enviarem cabecalhos CORS: vao direto pelo proxy,
// evitando o erro de CORS ruidoso no console antes de um fallback.
const NO_CORS_HOSTS = ["servicos.cptec.inpe.br", "ssd-api.jpl.nasa.gov"];

function needsProxy(url) {
  return NO_CORS_HOSTS.some((host) => url.includes(host));
}

// Erro de rede/CORS chega como TypeError sem status HTTP.
function isNetworkError(error) {
  return Boolean(error) && error.name !== "AbortError" && error.status === undefined;
}

async function request(url, options) {
  const proxied = options.viaProxy ? null : buildProxiedUrl(url, options.corsProxy);
  const proxyOptions = {
    ...options,
    viaProxy: true,
    timeoutMs: Math.min(options.timeoutMs ?? DEFAULT_TIMEOUT_MS, PROXY_TIMEOUT_MS),
  };

  // Fontes sem CORS (CPTEC/JPL): so pelo proxy. Tentar direto sempre falha por
  // CORS, poluindo o console e disparando retry a toa, entao nem tentamos.
  if (needsProxy(url) && proxied && proxied !== url) {
    return rawRequest(proxied, proxyOptions);
  }

  // Demais fontes: direto, com fallback para o proxy so em erro de rede/CORS.
  try {
    return await rawRequest(url, options);
  } catch (error) {
    if (isNetworkError(error) && proxied && proxied !== url) {
      return rawRequest(proxied, proxyOptions);
    }
    throw error;
  }
}

async function fetchJson(url, options) {
  const response = await request(url, { ...options, accept: "application/json" });
  if (typeof response.json === "function") return response.json();
  return JSON.parse(await response.text());
}

// O CPTEC serve XML em ISO-8859-1, mas o proxy de CORS costuma repassar o corpo
// sem o charset original. Sem isso, response.text() decodifica como UTF-8 e os
// acentos viram U+FFFD ("Sao Paulo" -> "S?o Paulo").
function decodeXmlBytes(buffer) {
  const utf8 = new TextDecoder("utf-8").decode(buffer);
  if (!utf8.includes("�")) return utf8;

  try {
    return new TextDecoder("iso-8859-1").decode(buffer);
  } catch {
    return utf8;
  }
}

async function fetchText(url, options) {
  const response = await request(url, { ...options, accept: "application/xml,text/xml,text/plain" });

  if (typeof response.arrayBuffer === "function" && typeof TextDecoder === "function") {
    return decodeXmlBytes(await response.arrayBuffer());
  }

  if (typeof response.text === "function") return response.text();
  return "";
}

function getWeatherDescription(code) {
  return WMO_DESCRIPTIONS[Math.round(Number(code))] ?? "Condição variável";
}

function getCptecDescription(code) {
  return CPTEC_DESCRIPTIONS[normalizeText(code).toLocaleLowerCase("pt-BR")] ?? "Condição não informada";
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
  // latest_photos e mais confiavel que photos?sol=...&camera=...: retorna as
  // fotos mais recentes disponiveis, sem 404 quando o sol/camera nao tem imagem.
  const params = new URLSearchParams({ api_key: apiKey });
  return `${NASA_API_BASE_URL}/mars-photos/api/v1/rovers/curiosity/latest_photos?${params.toString()}`;
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

// Number("") e Number("null") nao servem aqui: o primeiro vira 0 (temperatura
// falsa) e o segundo NaN. Campos vazios do CPTEC devem virar null.
function readXmlNumber(block, tag) {
  const raw = getXmlTag(block, tag);
  return raw === "" || raw === "null" ? null : toFiniteNumber(raw);
}

const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export function normalizeCptecForecastXml(xml) {
  const cityBlock = String(xml);
  const days = getXmlBlocks(xml, "previsao")
    .map((block) => {
      const code = getXmlTag(block, "tempo");
      return {
        date: getXmlTag(block, "dia"),
        code,
        condition: getCptecDescription(code),
        max: readXmlNumber(block, "maxima"),
        min: readXmlNumber(block, "minima"),
        uv: readXmlNumber(block, "iuv"),
      };
    })
    // O CPTEC as vezes devolve um bloco final sem dia/tempo ("<dia>null</dia>").
    .filter((day) => ISO_DATE_PATTERN.test(day.date));

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
  if (typeof fetchImpl !== "function") throw new Error("Fetch API indisponível neste ambiente.");

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
  storage = getDefaultStorage(),
  forceRefresh = false,
} = {}) {
  if (typeof fetchImpl !== "function") throw new Error("Fetch API indisponível neste ambiente.");

  const apiKey = getNasaApiKey(env);
  const options = { fetchImpl, signal, timeoutMs, corsProxy: getCorsProxy(env) };
  const locationScope = `${location.latitude},${location.longitude}`;
  const tasks = [
    {
      key: "weather",
      label: "Open-Meteo",
      scope: locationScope,
      run: async () => normalizeWeatherPayload(await fetchJson(buildOpenMeteoForecastUrl(location), options), location),
    },
    {
      key: "cptec",
      label: "CPTEC/INPE",
      scope: locationScope,
      proxyDependent: true,
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
      proxyDependent: true,
      run: async () => normalizeJplCadPayload(await fetchJson(buildJplCloseApproachUrl(), options)),
    },
    {
      key: "fireballs",
      label: "NASA/JPL Fireball",
      proxyDependent: true,
      run: async () => normalizeFireballPayload(await fetchJson(buildFireballUrl(), options)),
    },
    {
      key: "marsPhotos",
      label: "NASA Mars Rover Photos",
      run: async () => normalizeMarsRoverPayload(await fetchJson(buildMarsRoverPhotosUrl(apiKey), options)),
    },
  ];

  const outcomes = await Promise.all(
    tasks.map((task) => runDashboardTask(task, { storage, forceRefresh, signal })),
  );

  const data = {};
  const sources = [];
  const warnings = [];

  outcomes.forEach((outcome) => {
    data[outcome.key] = outcome.value;
    sources.push(createSourceStatus(outcome.key, outcome.label, outcome.state, outcome.detail));
    if (outcome.warning) warnings.push(outcome.warning);
  });

  return {
    location,
    ...data,
    sources,
    warnings,
    fetchedAt: new Date().toISOString(),
  };
}

const EMPTY_TASK_VALUE = { weather: null, cptec: null, apod: null, neows: null };

function emptyValueForTask(key) {
  return key in EMPTY_TASK_VALUE ? EMPTY_TASK_VALUE[key] : [];
}

async function runDashboardTask(task, { storage, forceRefresh, signal }) {
  const cacheKey = `${task.key}:${task.scope ?? "global"}`;
  const cached = readCacheEntry(storage, cacheKey);
  const ttl = CACHE_TTL_MS[task.key] ?? 0;
  const ageMs = cached ? Date.now() - cached.storedAt : Infinity;

  // Cache fresco: nao vai a rede (principal defesa contra rate limit).
  if (!forceRefresh && cached && ttl > 0 && ageMs < ttl) {
    return buildOutcome(task, cached.value, { fromCache: true });
  }

  try {
    const value = await withRetry(() => task.run(), { retries: 1, baseDelayMs: 500, signal });
    writeCacheEntry(storage, cacheKey, value);
    return buildOutcome(task, value, { fromCache: false });
  } catch (error) {
    // Aborto real (usuario/efeito trocou de local): descarta o painel inteiro.
    if (signal?.aborted) throw error;

    // AbortError aqui sem signal abortado = timeout DA PROPRIA requisicao.
    // Trata como falha isolada: as demais fontes continuam aparecendo.
    const message = error?.name === "AbortError" ? "tempo limite excedido" : error?.message ?? "falha ao consultar";

    // Falhou, mas temos cache ainda utilizavel: mostra o ultimo valor bom.
    if (cached && ageMs < CACHE_STALE_MAX_MS) {
      return {
        key: task.key,
        label: task.label,
        value: cached.value,
        state: "cache",
        detail: `Sem atualizar (${message}); exibindo último dado salvo`,
        warning: `${task.label}: ${message} (usando cache)`,
      };
    }

    // Fontes que dependem de proxy (CPTEC/JPL) degradam de forma suave: nao sao
    // um erro do app, e sim uma limitacao do navegador (sem CORS) ou do proxy.
    if (task.proxyDependent) {
      return {
        key: task.key,
        label: task.label,
        value: emptyValueForTask(task.key),
        state: "indisponivel",
        detail: "Indisponível no navegador (fonte sem CORS); requer proxy ativo",
        warning: null,
      };
    }

    return {
      key: task.key,
      label: task.label,
      value: emptyValueForTask(task.key),
      state: "erro",
      detail: message,
      warning: `${task.label}: ${message}`,
    };
  }
}

function buildOutcome(task, value, { fromCache }) {
  const useful = hasUsefulData(value);
  return {
    key: task.key,
    label: task.label,
    value,
    state: useful ? "online" : "sem-dados",
    detail: useful
      ? fromCache
        ? "Dados em cache (recentes)"
        : "Dados recebidos"
      : "Fonte respondeu sem dados para o recorte atual",
    warning: null,
  };
}
