export const TYPE_LABELS = {
  todos: "Todos",
  acidente: "Acidentes",
  policial: "Policial",
  risco: "Riscos",
  rodovia: "Rodovias",
  historico: "Histórico",
};

export const STATUS_LABELS = {
  todos: "Todos",
  ativo: "Ativos",
  monitorado: "Monitorados",
  historico: "Históricos",
};

export const SEVERITY_LABELS = {
  baixa: "Baixa",
  media: "Média",
  alta: "Alta",
};

const SEVERITY_BASE = {
  baixa: 30,
  media: 58,
  alta: 84,
};

const STATUS_WEIGHT = {
  ativo: 8,
  monitorado: 3,
  historico: -6,
};

export function clamp(value, min = 0, max = 100) {
  return Math.min(max, Math.max(min, value));
}

export function getIncidentAgeMinutes(incident, now = new Date()) {
  if (!incident.occurredAt) {
    return Number.POSITIVE_INFINITY;
  }

  const occurredAt = new Date(incident.occurredAt);
  if (Number.isNaN(occurredAt.getTime())) {
    return Number.POSITIVE_INFINITY;
  }

  return Math.max(0, Math.round((now.getTime() - occurredAt.getTime()) / 60000));
}

export function calculateRiskScore(incident, now = new Date()) {
  const age = getIncidentAgeMinutes(incident, now);
  const recencyBoost = age <= 30 ? 12 : age <= 90 ? 5 : age <= 240 ? 0 : -10;
  const confidence = clamp(Number(incident.confidence ?? 5), 0, 10) * 3;
  const severity = SEVERITY_BASE[incident.severity] ?? SEVERITY_BASE.media;
  const status = STATUS_WEIGHT[incident.status] ?? 0;

  return clamp(Math.round(severity + confidence + recencyBoost + status));
}

export function getRiskBand(score) {
  if (score >= 85) return "critico";
  if (score >= 68) return "alto";
  if (score >= 45) return "moderado";
  return "baixo";
}

export function formatAge(minutes) {
  if (!Number.isFinite(minutes)) return "sem horário";
  if (minutes < 1) return "agora";
  if (minutes < 60) return `${minutes} min`;

  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest ? `${hours}h ${rest}min` : `${hours}h`;
}

export function formatDistance(km) {
  if (!Number.isFinite(km)) return "";
  if (km < 1) return `${Math.round(km * 1000)} m`;
  if (km < 10) return `${km.toFixed(1)} km`;
  return `${Math.round(km)} km`;
}

export function filterIncidents(incidents, filters) {
  const query = (filters.query ?? "").trim().toLocaleLowerCase("pt-BR");

  return incidents.filter((incident) => {
    const matchesType = !filters.type || filters.type === "todos" || incident.type === filters.type;
    const matchesStatus = !filters.status || filters.status === "todos" || incident.status === filters.status;
    const matchesSeverity =
      !filters.severity || filters.severity === "todas" || incident.severity === filters.severity;
    const haystack = [incident.title, incident.location, incident.neighborhood, incident.source]
      .join(" ")
      .toLocaleLowerCase("pt-BR");

    return matchesType && matchesStatus && matchesSeverity && (!query || haystack.includes(query));
  });
}

export function sortIncidentsByRisk(incidents, now = new Date()) {
  return [...incidents].sort((a, b) => {
    const riskDiff = calculateRiskScore(b, now) - calculateRiskScore(a, now);
    if (riskDiff !== 0) return riskDiff;
    return getIncidentAgeMinutes(a, now) - getIncidentAgeMinutes(b, now);
  });
}

export function sortIncidentsByOccurredAt(incidents) {
  return incidents
    .map((incident, index) => {
      const occurredAt = incident?.occurredAt;
      const timestamp = occurredAt === null || occurredAt === undefined || String(occurredAt).trim() === ""
        ? Number.NaN
        : new Date(occurredAt).getTime();

      return { incident, index, timestamp };
    })
    .sort((a, b) => {
      const aTime = Number.isNaN(a.timestamp) ? Number.NEGATIVE_INFINITY : a.timestamp;
      const bTime = Number.isNaN(b.timestamp) ? Number.NEGATIVE_INFINITY : b.timestamp;
      return bTime - aTime || a.index - b.index;
    })
    .map(({ incident }) => incident);
}

export function createIncidentSummary(incidents, now = new Date()) {
  const total = incidents.length;
  const active = incidents.filter((incident) => incident.status === "ativo").length;
  const critical = incidents.filter((incident) => calculateRiskScore(incident, now) >= 85).length;
  const recent = incidents.filter((incident) => getIncidentAgeMinutes(incident, now) <= 60).length;
  const averageRisk = total
    ? Math.round(incidents.reduce((sum, incident) => sum + calculateRiskScore(incident, now), 0) / total)
    : 0;

  return {
    total,
    active,
    critical,
    recent,
    averageRisk,
  };
}

export function getTypeChartData(incidents) {
  return Object.entries(TYPE_LABELS)
    .filter(([key]) => key !== "todos")
    .map(([key, label]) => ({
      type: label,
      total: incidents.filter((incident) => incident.type === key).length,
    }))
    .filter((item) => item.total > 0);
}

export function getTimeWindowData(incidents, now = new Date()) {
  const windows = [
    { label: "0-30m", max: 30 },
    { label: "30-60m", min: 31, max: 60 },
    { label: "1-2h", min: 61, max: 120 },
    { label: "2h+", min: 121 },
  ];

  return windows.map((window) => ({
    janela: window.label,
    alertas: incidents.filter((incident) => {
      const age = getIncidentAgeMinutes(incident, now);
      const min = window.min ?? 0;
      const max = window.max ?? Number.POSITIVE_INFINITY;
      return age >= min && age <= max;
    }).length,
  }));
}

export function getHotspots(incidents, now = new Date()) {
  const grouped = new Map();

  for (const incident of incidents) {
    const key = incident.neighborhood || "Sem bairro";
    const current = grouped.get(key) ?? { neighborhood: key, total: 0, risk: 0, active: 0 };
    const score = calculateRiskScore(incident, now);

    grouped.set(key, {
      neighborhood: key,
      total: current.total + 1,
      risk: Math.max(current.risk, score),
      active: current.active + (incident.status === "ativo" ? 1 : 0),
    });
  }

  return [...grouped.values()].sort((a, b) => b.risk - a.risk || b.active - a.active).slice(0, 5);
}
