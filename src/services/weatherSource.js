// Fonte meteorologica em tempo real para Marilia-SP via Open-Meteo.
//
// Open-Meteo e gratuita, nao exige chave de API e tem CORS liberado, por isso
// funciona direto do front-end (sem backend/proxy). Complementa o INMET: o INMET
// publica avisos oficiais (perigo/grande perigo), enquanto o Open-Meteo entrega a
// condicao observada/prevista da proxima hora e permite gerar uma "ocorrencia"
// meteorologica quando ha chuva forte, tempestade ou vento intenso.
//
// Este modulo e intencionalmente isolado e sem dependencias internas para poder
// ser plugado no registro central (src/data/incidents.js + parseBySource em
// src/services/incidentsApi.js) sem acoplar a refatoracoes em andamento.

// Coordenadas do centro de Marilia-SP.
export const MARILIA_COORDS = { lat: -22.2171, lng: -49.9501 };

// Posicao default no mapa (centro), no mesmo formato usado pelos demais incidentes.
const MARILIA_DEFAULT_POSITION = { x: 50, y: 50 };

// Descricao curta por codigo WMO (apenas condicoes relevantes de alerta).
const WMO_DESCRIPTIONS = {
  45: "Nevoeiro",
  48: "Nevoeiro com deposito de gelo",
  51: "Garoa fraca",
  53: "Garoa moderada",
  55: "Garoa intensa",
  56: "Garoa congelante fraca",
  57: "Garoa congelante intensa",
  61: "Chuva fraca",
  63: "Chuva moderada",
  65: "Chuva forte",
  66: "Chuva congelante fraca",
  67: "Chuva congelante forte",
  71: "Neve fraca",
  73: "Neve moderada",
  75: "Neve intensa",
  80: "Pancadas de chuva fracas",
  81: "Pancadas de chuva moderadas",
  82: "Pancadas de chuva violentas",
  85: "Pancadas de neve fracas",
  86: "Pancadas de neve intensas",
  95: "Tempestade com trovoadas",
  96: "Tempestade com granizo",
  99: "Tempestade com granizo intenso",
};

// Limiares (km/h para vento, mm para precipitacao na janela atual).
const ALTA_CODES = new Set([65, 67, 82, 95, 96, 99]);
const MEDIA_CODES = new Set([55, 57, 63, 73, 75, 81, 85, 86]);
const GUST_ALTA = 90;
const GUST_MEDIA = 62;
const RAIN_ALTA_MM = 10;
const RAIN_MEDIA_MM = 5;

// So vira ocorrencia a partir de garoa/nevoeiro denso, alguma precipitacao ou rajada.
const MIN_ALERT_CODE = 45;
const MIN_RAIN_MM = 1;
const MIN_GUST_KMH = 50;

export function buildOpenMeteoUrl({ lat, lng } = MARILIA_COORDS) {
  const params = new URLSearchParams({
    latitude: String(lat),
    longitude: String(lng),
    current: "temperature_2m,precipitation,weather_code,wind_speed_10m,wind_gusts_10m",
    timezone: "America/Sao_Paulo",
  });

  return `https://api.open-meteo.com/v1/forecast?${params.toString()}`;
}

// Descritor pronto para ser adicionado a INCIDENT_API_SOURCES.
export const OPEN_METEO_SOURCE = {
  id: "open-meteo",
  name: "Open-Meteo (tempo real)",
  cadence: "15 min",
  url: buildOpenMeteoUrl(),
  parser: "openmeteo",
  detail:
    "Condicao meteorologica observada/prevista para Marilia-SP via Open-Meteo (gratuita, sem chave, CORS). Gera alerta em chuva forte, tempestade ou vento intenso.",
};

function toFiniteNumber(value, fallback = 0) {
  const num = Number(value);
  return Number.isFinite(num) ? num : fallback;
}

function parseTimestamp(value) {
  if (!value) return new Date().toISOString();
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? new Date().toISOString() : date.toISOString();
}

function describeWeather(code, precipitation, gusts) {
  const base = WMO_DESCRIPTIONS[code];
  if (base) return base;
  if (precipitation >= RAIN_MEDIA_MM) return "Chuva significativa";
  if (gusts >= MIN_GUST_KMH) return "Vento intenso";
  return "Condicao meteorologica adversa";
}

function classifySeverity(code, precipitation, gusts) {
  if (ALTA_CODES.has(code) || precipitation >= RAIN_ALTA_MM || gusts >= GUST_ALTA) {
    return "alta";
  }
  if (MEDIA_CODES.has(code) || precipitation >= RAIN_MEDIA_MM || gusts >= GUST_MEDIA) {
    return "media";
  }
  return "baixa";
}

function isAlertWorthy(code, precipitation, gusts) {
  return code >= MIN_ALERT_CODE || precipitation >= MIN_RAIN_MM || gusts >= MIN_GUST_KMH;
}

// Converte a resposta do Open-Meteo em 0 ou 1 incidente, no mesmo formato dos demais.
export function normalizeOpenMeteoPayload(payload, source = OPEN_METEO_SOURCE) {
  const current = payload && typeof payload === "object" ? payload.current : null;
  if (!current || typeof current !== "object") return [];

  const code = Math.round(toFiniteNumber(current.weather_code, 0));
  const precipitation = toFiniteNumber(current.precipitation, 0);
  const gusts = toFiniteNumber(current.wind_gusts_10m, 0);
  const wind = toFiniteNumber(current.wind_speed_10m, 0);
  const temperature = toFiniteNumber(current.temperature_2m, NaN);

  if (!isAlertWorthy(code, precipitation, gusts)) return [];

  const description = describeWeather(code, precipitation, gusts);
  const severity = classifySeverity(code, precipitation, gusts);
  const occurredAt = parseTimestamp(current.time);

  const detailParts = [];
  if (precipitation > 0) detailParts.push(`Precipitacao ${precipitation.toFixed(1)} mm`);
  if (gusts > 0) detailParts.push(`Rajadas ${Math.round(gusts)} km/h`);
  if (wind > 0) detailParts.push(`Vento ${Math.round(wind)} km/h`);
  if (Number.isFinite(temperature)) detailParts.push(`Temp. ${temperature.toFixed(1)} C`);

  return [
    {
      id: `${source.id}-${occurredAt}`,
      type: "risco",
      title: `${description} em Marilia-SP`,
      location: "Marilia-SP",
      neighborhood: "Marilia-SP",
      source: source.name,
      status: "ativo",
      severity,
      confidence: 8,
      occurredAt,
      position: MARILIA_DEFAULT_POSITION,
      url: "https://open-meteo.com/",
      detail: detailParts.join(" | ") || description,
    },
  ];
}

// Permite consultar a fonte de forma autonoma, sem depender do loop central.
export async function fetchWeatherIncidents({
  fetchImpl = globalThis.fetch,
  signal,
  timeoutMs = 10000,
  coords = MARILIA_COORDS,
} = {}) {
  if (typeof fetchImpl !== "function") {
    throw new Error("Fetch API indisponivel neste ambiente.");
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  if (signal) {
    if (signal.aborted) controller.abort();
    else signal.addEventListener("abort", () => controller.abort(), { once: true });
  }

  try {
    const response = await fetchImpl(buildOpenMeteoUrl(coords), {
      headers: { Accept: "application/json" },
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const payload = await response.json();
    return normalizeOpenMeteoPayload(payload, OPEN_METEO_SOURCE);
  } finally {
    clearTimeout(timeoutId);
  }
}
