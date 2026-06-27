import { INCIDENT_API_SOURCES } from "../data/incidents.js";

const DEFAULT_TIMEOUT_MS = 10000;
const MARILIA_BOUNDS = {
  minLat: -22.36,
  maxLat: -22.08,
  minLng: -50.08,
  maxLng: -49.74,
};

function readViteEnv() {
  return typeof import.meta !== "undefined" && import.meta.env ? import.meta.env : {};
}

function clamp(value, min = 0, max = 100) {
  return Math.min(max, Math.max(min, value));
}

function normalizeText(value, fallback = "") {
  if (value === null || value === undefined) return fallback;
  return String(value).trim() || fallback;
}

function firstReadableText(...values) {
  for (const value of values) {
    if (typeof value !== "string" && typeof value !== "number") continue;
    const text = normalizeText(value);
    if (text) return text;
  }

  return "";
}

function toArray(payload) {
  if (Array.isArray(payload)) return payload;
  if (!payload || typeof payload !== "object") return [];

  for (const key of ["incidents", "alerts", "items", "data", "results", "features"]) {
    if (Array.isArray(payload[key])) return payload[key];
  }

  return [];
}

function hashText(value) {
  let hash = 0;
  const text = String(value);

  for (let index = 0; index < text.length; index += 1) {
    hash = (hash << 5) - hash + text.charCodeAt(index);
    hash |= 0;
  }

  return Math.abs(hash).toString(36);
}

function parseTimestamp(value) {
  if (!value && value !== 0) return new Date().toISOString();

  if (typeof value === "number") {
    const millis = value > 100000000000 ? value : value * 1000;
    return new Date(millis).toISOString();
  }

  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? new Date().toISOString() : date.toISOString();
}

function normalizeType(value = "") {
  const type = String(value).toLocaleLowerCase("pt-BR");

  if (type.includes("accident") || type.includes("acidente") || type.includes("crash") || type.includes("colis")) {
    return "acidente";
  }

  if (type.includes("police") || type.includes("policial") || type.includes("crime") || type.includes("seguranca")) {
    return "policial";
  }

  if (type.includes("road") || type.includes("jam") || type.includes("traffic") || type.includes("rodovia")) {
    return "rodovia";
  }

  if (type.includes("history") || type.includes("histor")) {
    return "historico";
  }

  return "risco";
}

function normalizeSeverity(value) {
  if (typeof value === "number") {
    if (value >= 7) return "alta";
    if (value >= 4) return "media";
    return "baixa";
  }

  const severity = String(value ?? "").toLocaleLowerCase("pt-BR");

  if (["alta", "alto", "high", "severe", "critical", "grave", "major"].some((item) => severity.includes(item))) {
    return "alta";
  }

  if (["baixa", "baixo", "low", "minor", "leve"].some((item) => severity.includes(item))) {
    return "baixa";
  }

  return "media";
}

function normalizeStatus(value) {
  const status = String(value ?? "").toLocaleLowerCase("pt-BR");

  if (["ativo", "active", "open", "aberto", "ongoing", "em andamento"].some((item) => status.includes(item))) {
    return "ativo";
  }

  if (["historico", "history", "closed", "resolvido", "encerrado", "inactive"].some((item) => status.includes(item))) {
    return "historico";
  }

  return "monitorado";
}

function normalizeConfidence(value) {
  const confidence = Number(value);
  if (!Number.isFinite(confidence)) return 6;
  return clamp(confidence > 10 ? confidence / 10 : confidence, 0, 10);
}

function readCoordinates(raw) {
  const location = raw.location ?? raw.geometry?.coordinates ?? raw.coordinates ?? raw.position ?? {};

  if (Array.isArray(location) && location.length >= 2) {
    return { lng: Number(location[0]), lat: Number(location[1]) };
  }

  const lat =
    raw.lat ??
    raw.latitude ??
    raw.y ??
    location.lat ??
    location.latitude ??
    location.y ??
    raw.geometry?.lat ??
    raw.geometry?.latitude;
  const lng =
    raw.lng ??
    raw.lon ??
    raw.longitude ??
    raw.x ??
    location.lng ??
    location.lon ??
    location.longitude ??
    location.x ??
    raw.geometry?.lng ??
    raw.geometry?.longitude;

  return {
    lat: Number(lat),
    lng: Number(lng),
  };
}

function isInsideMarilia({ lat, lng }) {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return true;

  return lat >= MARILIA_BOUNDS.minLat && lat <= MARILIA_BOUNDS.maxLat && lng >= MARILIA_BOUNDS.minLng && lng <= MARILIA_BOUNDS.maxLng;
}

function projectToMapPosition({ lat, lng }) {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return {
      x: 50,
      y: 50,
    };
  }

  const x = ((lng - MARILIA_BOUNDS.minLng) / (MARILIA_BOUNDS.maxLng - MARILIA_BOUNDS.minLng)) * 100;
  const y = ((MARILIA_BOUNDS.maxLat - lat) / (MARILIA_BOUNDS.maxLat - MARILIA_BOUNDS.minLat)) * 100;

  return {
    x: clamp(Math.round(x), 8, 92),
    y: clamp(Math.round(y), 8, 92),
  };
}

function getPropertyBag(raw) {
  return raw.properties && typeof raw.properties === "object" ? { ...raw.properties, ...raw } : raw;
}

function buildTitle(raw, type) {
  const street = firstReadableText(raw.street, raw.road, raw.address, raw.locationName);
  const typeLabel = {
    acidente: "Acidente",
    policial: "Ocorrencia policial",
    risco: "Risco reportado",
    rodovia: "Ocorrencia rodoviaria",
    historico: "Registro historico",
  }[type];

  return street ? `${typeLabel} em ${street}` : typeLabel;
}

export function normalizeGenericPayload(payload, source) {
  return toArray(payload)
    .map((item, index) => {
      const raw = getPropertyBag(item);
      const type = normalizeType(raw.type ?? raw.kind ?? raw.category ?? raw.subtype ?? raw.eventType);
      const coordinates = readCoordinates(raw);

      if (!isInsideMarilia(coordinates)) return null;

      const title = firstReadableText(raw.title, raw.name, raw.description, raw.summary) || buildTitle(raw, type);
      const location =
        firstReadableText(raw.locationText, raw.location_name, raw.address, raw.street, raw.road, raw.locationName) ||
        "Marilia-SP";
      const occurredAt = parseTimestamp(
        raw.occurredAt ?? raw.createdAt ?? raw.updatedAt ?? raw.date ?? raw.timestamp ?? raw.pubMillis,
      );
      const id = normalizeText(raw.id ?? raw.uuid ?? raw.externalId, `${source.id}-${hashText(`${title}-${location}-${occurredAt}`)}`);

      return {
        id,
        type,
        title,
        location,
        neighborhood: firstReadableText(raw.neighborhood, raw.district, raw.bairro, raw.city) || "Marilia-SP",
        source: source.name,
        status: normalizeStatus(raw.status ?? raw.state),
        severity: normalizeSeverity(raw.severity ?? raw.level ?? raw.impact ?? raw.reportRating),
        confidence: normalizeConfidence(raw.confidence ?? raw.reliability ?? raw.reportRating),
        occurredAt,
        position: projectToMapPosition(coordinates),
      };
    })
    .filter(Boolean);
}

export function normalizeWazePayload(payload, source) {
  return toArray(payload)
    .map((alert, index) => {
      const raw = getPropertyBag(alert);
      const coordinates = readCoordinates(raw);
      const city = normalizeText(raw.city ?? raw.location?.city);

      if (city && !city.toLocaleLowerCase("pt-BR").includes("mar")) return null;
      if (!isInsideMarilia(coordinates)) return null;

      const type = normalizeType(`${raw.type ?? ""} ${raw.subtype ?? ""}`);
      const street = normalizeText(raw.street ?? raw.road, "Marilia-SP");
      const occurredAt = parseTimestamp(raw.pubMillis ?? raw.createdAt ?? raw.updatedAt);
      const title = normalizeText(raw.reportDescription ?? raw.description, buildTitle({ street }, type));

      return {
        id: normalizeText(raw.uuid ?? raw.id, `${source.id}-${index}-${hashText(`${title}-${occurredAt}`)}`),
        type,
        title,
        location: street,
        neighborhood: normalizeText(raw.city, "Marilia-SP"),
        source: source.name,
        status: "ativo",
        severity: normalizeSeverity(raw.reportRating ?? raw.reliability),
        confidence: normalizeConfidence(raw.confidence ?? raw.reliability ?? raw.reportRating),
        occurredAt,
        position: projectToMapPosition(coordinates),
      };
    })
    .filter(Boolean);
}

export function getConfiguredSources(env = readViteEnv()) {
  return INCIDENT_API_SOURCES.map((source) => ({
    ...source,
    url: normalizeText(env[source.envKey]),
  }));
}

export function getSourceStatuses(env = readViteEnv()) {
  return getConfiguredSources(env).map((source) => ({
    id: source.id,
    name: source.name,
    cadence: source.cadence,
    status: source.url ? "conectado" : "pendente",
    detail: source.url ? `${source.detail} Cadencia esperada: ${source.cadence}.` : "Aguardando endpoint de integracao.",
  }));
}

function mergeSignals(parentSignal, timeoutMs) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  function abort() {
    controller.abort();
  }

  if (parentSignal) {
    if (parentSignal.aborted) {
      controller.abort();
    } else {
      parentSignal.addEventListener("abort", abort, { once: true });
    }
  }

  return {
    signal: controller.signal,
    cleanup() {
      clearTimeout(timeoutId);
      parentSignal?.removeEventListener?.("abort", abort);
    },
  };
}

async function fetchJson(source, { fetchImpl, signal, timeoutMs }) {
  const request = mergeSignals(signal, timeoutMs);

  try {
    const response = await fetchImpl(source.url, {
      headers: {
        Accept: "application/json",
      },
      signal: request.signal,
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    return response.json();
  } finally {
    request.cleanup();
  }
}

function parseBySource(payload, source) {
  if (source.parser === "waze") {
    return normalizeWazePayload(payload, source);
  }

  return normalizeGenericPayload(payload, source);
}

function dedupeIncidents(incidents) {
  const seen = new Set();
  const unique = [];

  for (const incident of incidents) {
    const key = incident.id || `${incident.title}-${incident.location}-${incident.occurredAt}`;
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(incident);
  }

  return unique;
}

export async function fetchIncidents({
  env = readViteEnv(),
  fetchImpl = globalThis.fetch,
  signal,
  timeoutMs = DEFAULT_TIMEOUT_MS,
} = {}) {
  if (typeof fetchImpl !== "function") {
    throw new Error("Fetch API indisponivel neste ambiente.");
  }

  const configuredSources = getConfiguredSources(env).filter((source) => source.url);
  const baseStatuses = getSourceStatuses(env);

  if (configuredSources.length === 0) {
    return {
      incidents: [],
      sources: baseStatuses,
      fetchedAt: new Date().toISOString(),
      warnings: ["Nenhuma API real configurada."],
    };
  }

  const responses = await Promise.allSettled(
    configuredSources.map(async (source) => {
      const payload = await fetchJson(source, { fetchImpl, signal, timeoutMs });
      return {
        source,
        incidents: parseBySource(payload, source),
      };
    }),
  );

  const sourceResults = new Map();
  const incidents = [];

  for (const response of responses) {
    if (response.status === "fulfilled") {
      incidents.push(...response.value.incidents);
      sourceResults.set(response.value.source.id, {
        status: response.value.incidents.length > 0 ? "conectado" : "sem-dados",
        detail:
          response.value.incidents.length > 0
            ? `${response.value.incidents.length} alerta(s) real(is) recebido(s).`
            : "API respondeu, mas nao retornou alertas para Marilia-SP.",
      });
      continue;
    }

    const failedSource = configuredSources[responses.indexOf(response)];
    sourceResults.set(failedSource.id, {
      status: "erro",
      detail: `Falha ao consultar ${failedSource.name}: ${response.reason?.message ?? "erro desconhecido"}.`,
    });
  }

  return {
    incidents: dedupeIncidents(incidents),
    sources: baseStatuses.map((source) => ({
      ...source,
      ...(sourceResults.get(source.id) ?? {}),
    })),
    fetchedAt: new Date().toISOString(),
    warnings: incidents.length === 0 ? ["As APIs configuradas nao retornaram alertas reais para Marilia-SP."] : [],
  };
}
