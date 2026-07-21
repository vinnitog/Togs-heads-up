import { INCIDENT_API_SOURCES } from "../data/incidents.js";
import { normalizeOpenMeteoPayload } from "./weatherSource.js";

const DEFAULT_TIMEOUT_MS = 10000;
const MARILIA_IBGE_CODE = "3529005";
const MARILIA_BOUNDS = {
  minLat: -22.36,
  maxLat: -22.08,
  minLng: -50.08,
  maxLng: -49.74,
};
const MARILIA_DEFAULT_POSITION = { x: 50, y: 50 };
const NEIGHBORHOOD_POSITIONS = [
  { name: "Alto Cafezal", terms: ["alto cafezal"], position: { x: 45, y: 52 } },
  { name: "Centro", terms: ["centro"], position: { x: 49, y: 48 } },
  { name: "Jardim Aquarius", terms: ["jardim aquarius", "aquarius"], position: { x: 36, y: 35 } },
  { name: "Cascata", terms: ["cascata"], position: { x: 42, y: 64 } },
  { name: "Fragata", terms: ["fragata"], position: { x: 28, y: 58 } },
  { name: "Padre Nóbrega", terms: ["padre nobrega", "nobrega"], position: { x: 73, y: 31 } },
  { name: "Rodovia BR-153", terms: ["br-153", "rodovia transbrasiliana"], position: { x: 58, y: 67 } },
  { name: "SP-294", terms: ["sp-294", "comandante joao ribeiro de barros"], position: { x: 62, y: 45 } },
];
const RSS_SAFETY_TERMS = [
  "acidente",
  "atropel",
  "batida",
  "bloqueio",
  "capot",
  "colis",
  "congestion",
  "crime",
  "criminos",
  "desab",
  "furto",
  "homicidio",
  "interdit",
  "incendio",
  "morre",
  "morto",
  "ocorrencia",
  "policia",
  "policial",
  "preso",
  "prisao",
  "rodovia",
  "roubo",
  "suspeito",
  "tiro",
  "transito",
  "tomba",
  "vitima",
];

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

function normalizeSearchText(value) {
  return normalizeText(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("pt-BR");
}

function stripHtml(value) {
  return normalizeText(value)
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function cleanRssText(value) {
  return stripHtml(value)
    .replace(/Participe do canal.*?WhatsApp/gi, " ")
    .replace(/Initial plugin text.*$/i, " ")
    .replace(/Veja mais noticias.*$/i, " ")
    .replace(/Veja mais not.cias.*$/i, " ")
    .replace(/VIDEOS:.*$/i, " ")
    .replace(/V.DEOS:.*$/i, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function firstReadableText(...values) {
  for (const value of values) {
    if (typeof value !== "string" && typeof value !== "number") continue;
    const text = normalizeText(value);
    if (text) return text;
  }

  return "";
}

function textIncludesAny(text, terms) {
  const normalized = normalizeSearchText(text);
  return terms.some((term) => normalized.includes(normalizeSearchText(term)));
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
  if (!value && value !== 0) return null;

  if (typeof value === "number") {
    const millis = value > 100000000000 ? value : value * 1000;
    return new Date(millis).toISOString();
  }

  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}/.test(value)) {
    const date = new Date(`${value.replace(" ", "T")}Z`);
    return Number.isNaN(date.getTime()) ? null : date.toISOString();
  }

  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function normalizeType(value = "") {
  const type = String(value).toLocaleLowerCase("pt-BR");

  if (
    type.includes("accident") ||
    type.includes("acidente") ||
    type.includes("atropel") ||
    type.includes("batida") ||
    type.includes("capot") ||
    type.includes("crash") ||
    type.includes("colis") ||
    type.includes("tomba")
  ) {
    return "acidente";
  }

  if (
    type.includes("police") ||
    type.includes("policia") ||
    type.includes("policial") ||
    type.includes("crime") ||
    type.includes("preso") ||
    type.includes("prisao") ||
    type.includes("seguranca") ||
    type.includes("suspeito") ||
    type.includes("tiro")
  ) {
    return "policial";
  }

  if (
    type.includes("road") ||
    type.includes("jam") ||
    type.includes("traffic") ||
    type.includes("rodovia") ||
    type.includes("sp-") ||
    type.includes("br-") ||
    type.includes("transito")
  ) {
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
    return MARILIA_DEFAULT_POSITION;
  }

  const x = ((lng - MARILIA_BOUNDS.minLng) / (MARILIA_BOUNDS.maxLng - MARILIA_BOUNDS.minLng)) * 100;
  const y = ((MARILIA_BOUNDS.maxLat - lat) / (MARILIA_BOUNDS.maxLat - MARILIA_BOUNDS.minLat)) * 100;

  return {
    x: clamp(Math.round(x), 8, 92),
    y: clamp(Math.round(y), 8, 92),
  };
}

function inferNeighborhood(text) {
  const normalized = normalizeSearchText(text);
  return NEIGHBORHOOD_POSITIONS.find((item) => item.terms.some((term) => normalized.includes(term)));
}

function inferPositionFromText(text) {
  return inferNeighborhood(text)?.position ?? MARILIA_DEFAULT_POSITION;
}

function inferLocationFromText(text) {
  return inferNeighborhood(text)?.name ?? "Marília-SP";
}

function inferSeverityFromText(text) {
  const normalized = normalizeSearchText(text);

  if (
    ["morre", "morto", "grave", "homicidio", "tiro", "interdit", "desab", "incendio", "alagamento"].some((term) =>
      normalized.includes(term),
    )
  ) {
    return "alta";
  }

  if (["preso", "prisao", "suspeito", "roubo", "furto", "rodovia", "tomba"].some((term) => normalized.includes(term))) {
    return "media";
  }

  return "baixa";
}

function getPropertyBag(raw) {
  return raw.properties && typeof raw.properties === "object" ? { ...raw.properties, ...raw } : raw;
}

function buildTitle(raw, type) {
  const street = firstReadableText(raw.street, raw.road, raw.address, raw.locationName);
  const typeLabel = {
    acidente: "Acidente",
    policial: "Ocorrência policial",
    risco: "Risco reportado",
    rodovia: "Ocorrência rodoviária",
    historico: "Registro histórico",
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
        "Marília-SP";
      const occurredAt = parseTimestamp(
        raw.occurredAt ?? raw.createdAt ?? raw.updatedAt ?? raw.date ?? raw.timestamp ?? raw.pubMillis,
      );
      const id = normalizeText(raw.id ?? raw.uuid ?? raw.externalId, `${source.id}-${hashText(`${title}-${location}-${occurredAt}`)}`);

      return {
        id,
        type,
        title,
        location,
        neighborhood: firstReadableText(raw.neighborhood, raw.district, raw.bairro, raw.city) || "Marília-SP",
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

export function normalizeRss2JsonPayload(payload, source) {
  return toArray(payload)
    .map((item, index) => {
      const title = stripHtml(item.title);
      const summary = cleanRssText(item.description ?? item.content);
      const searchable = `${title} ${summary}`;

      if (!textIncludesAny(searchable, ["marilia", "marilia-sp", "alto cafezal", "br-153", "sp-294"])) return null;
      if (!textIncludesAny(searchable, RSS_SAFETY_TERMS)) return null;

      const type = normalizeType(searchable);
      const occurredAt = parseTimestamp(item.pubDate ?? item.isoDate ?? item.date);
      const location = inferLocationFromText(searchable);

      return {
        id: normalizeText(item.guid ?? item.link, `${source.id}-${index}-${hashText(`${title}-${occurredAt}`)}`),
        type,
        title,
        location,
        neighborhood: location,
        source: source.name,
        status: getIncidentAgeMinutesFromIso(occurredAt) <= 1440 ? "ativo" : "monitorado",
        severity: inferSeverityFromText(searchable),
        confidence: 7,
        occurredAt,
        position: inferPositionFromText(searchable),
        url: normalizeText(item.link),
      };
    })
    .filter(Boolean);
}

function normalizeInmetSeverity(alert) {
  const severityText = normalizeSearchText(`${alert.severidade ?? ""} ${alert.aviso_cor ?? ""}`);

  if (severityText.includes("grande perigo") || severityText.includes("ff0000")) return "alta";
  if (severityText.includes("perigo") || severityText.includes("ffa500")) return "media";
  return "baixa";
}

function getIncidentAgeMinutesFromIso(iso, now = new Date()) {
  if (!iso) return Number.POSITIVE_INFINITY;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return Number.POSITIVE_INFINITY;
  return Math.max(0, Math.round((now.getTime() - date.getTime()) / 60000));
}

export function normalizeInmetPayload(payload, source) {
  const alerts = [...toArray(payload?.hoje), ...toArray(payload?.amanha)];

  return alerts
    .filter((alert) => {
      const geocodes = normalizeText(alert.geocodes);
      const cities = normalizeSearchText(alert.municipios);
      return geocodes.split(",").includes(MARILIA_IBGE_CODE) || cities.includes("marilia - sp");
    })
    .map((alert) => {
      const startedAt = parseTimestamp(`${normalizeText(alert.data_inicio).slice(0, 10)} ${alert.hora_inicio ?? "00:00"}`);
      const finishedAt = parseTimestamp(`${normalizeText(alert.data_fim).slice(0, 10)} ${alert.hora_fim ?? "23:59"}`);
      const description = stripHtml(alert.descricao || "Aviso meteorológico");
      const risks = toArray(alert.riscos).join(" ");

      return {
        id: `${source.id}-${alert.codigo ?? alert.id}`,
        type: "risco",
        title: `${description} em Marília-SP`,
        location: "Marília-SP",
        neighborhood: "Marília-SP",
        source: source.name,
        status: new Date(finishedAt).getTime() >= Date.now() ? "ativo" : "historico",
        severity: normalizeInmetSeverity(alert),
        confidence: 9,
        occurredAt: startedAt,
        position: MARILIA_DEFAULT_POSITION,
        url: "https://portal.inmet.gov.br/avisosmeteorologicos",
        detail: risks || normalizeText(alert.severidade),
      };
    });
}

export function getConfiguredSources(env = readViteEnv()) {
  return INCIDENT_API_SOURCES.map((source) => ({
    ...source,
    url: normalizeText(source.url ?? env[source.envKey]),
  }));
}

export function getSourceStatuses(env = readViteEnv()) {
  return getConfiguredSources(env).map((source) => ({
    id: source.id,
    name: source.name,
    cadence: source.cadence,
    status: source.url ? "conectado" : "pendente",
    detail: source.url
      ? `${source.detail} Cadência esperada: ${source.cadence}.`
      : "Aguardando endpoint de integração.",
  }));
}

const EARTH_RADIUS_KM = 6371;

function toRadians(value) {
  return (value * Math.PI) / 180;
}

export function mapPositionToCoordinates({ x, y } = {}) {
  const px = clamp(Number(x));
  const py = clamp(Number(y));

  return {
    lng: MARILIA_BOUNDS.minLng + (px / 100) * (MARILIA_BOUNDS.maxLng - MARILIA_BOUNDS.minLng),
    lat: MARILIA_BOUNDS.maxLat - (py / 100) * (MARILIA_BOUNDS.maxLat - MARILIA_BOUNDS.minLat),
  };
}

export function coordinatesToMapPosition(coordinates) {
  return projectToMapPosition(coordinates ?? {});
}

export function haversineKm(from, to) {
  if (!from || !to) return null;
  if (![from.lat, from.lng, to.lat, to.lng].every((value) => Number.isFinite(Number(value)))) {
    return null;
  }

  const dLat = toRadians(to.lat - from.lat);
  const dLng = toRadians(to.lng - from.lng);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRadians(from.lat)) * Math.cos(toRadians(to.lat)) * Math.sin(dLng / 2) ** 2;

  return EARTH_RADIUS_KM * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export function distanceFromUserKm(incident, userLocation) {
  if (!userLocation || !incident?.position) return null;
  return haversineKm(userLocation, mapPositionToCoordinates(incident.position));
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

    if (typeof response.text !== "function") {
      return response.json();
    }

    const body = await response.text();
    if (!body.trim()) return null;

    try {
      return JSON.parse(body);
    } catch {
      // Algumas APIs publicas (ex.: INMET) devolvem, de forma intermitente, uma
      // pagina HTML/texto de bloqueio ou manutencao no lugar do JSON. Tratamos
      // isso como instabilidade transitoria, sem vazar o conteudo bruto para a UI.
      const transient = new Error("resposta em formato inesperado (servico instavel)");
      transient.transient = true;
      throw transient;
    }
  } finally {
    request.cleanup();
  }
}

function parseBySource(payload, source) {
  if (source.parser === "rss2json") {
    return normalizeRss2JsonPayload(payload, source);
  }

  if (source.parser === "inmet") {
    return normalizeInmetPayload(payload, source);
  }

  if (source.parser === "openmeteo") {
    return normalizeOpenMeteoPayload(payload, source);
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
    throw new Error("Fetch API indisponível neste ambiente.");
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
            : "API respondeu, mas não retornou alertas para Marília-SP.",
      });
      continue;
    }

    const failedSource = configuredSources[responses.indexOf(response)];
    const reason = response.reason;

    if (reason?.transient) {
      sourceResults.set(failedSource.id, {
        status: "sem-dados",
        detail: `${failedSource.name} indisponível no momento (instabilidade do serviço). Nova tentativa no próximo ciclo.`,
      });
      continue;
    }

    sourceResults.set(failedSource.id, {
      status: "erro",
      detail: `Falha ao consultar ${failedSource.name}: ${reason?.message ?? "erro desconhecido"}.`,
    });
  }

  return {
    incidents: dedupeIncidents(incidents),
    sources: baseStatuses.map((source) => ({
      ...source,
      ...(sourceResults.get(source.id) ?? {}),
    })),
    fetchedAt: new Date().toISOString(),
    warnings: incidents.length === 0 ? ["As APIs configuradas não retornaram alertas reais para Marília-SP."] : [],
  };
}
