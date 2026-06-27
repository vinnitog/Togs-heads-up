import { useEffect, useMemo, useState } from "react";
import {
  Activity,
  AlertTriangle,
  BarChart3,
  BellRing,
  Car,
  Clock,
  Database,
  Gauge,
  MapPin,
  Navigation,
  Radio,
  RefreshCw,
  Route,
  Search,
  ShieldAlert,
  Smartphone,
  Wifi,
  WifiOff,
} from "lucide-react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { SEED_INCIDENTS, SOURCE_STATUS } from "./data/incidents.js";
import {
  STATUS_LABELS,
  SEVERITY_LABELS,
  TYPE_LABELS,
  calculateRiskScore,
  createIncidentSummary,
  filterIncidents,
  formatAge,
  getHotspots,
  getIncidentAgeMinutes,
  getRiskBand,
  getTimeWindowData,
  getTypeChartData,
  sortIncidentsByRisk,
} from "./utils/incidents.js";

const CHART_COLORS = ["#ef4444", "#2563eb", "#f59e0b", "#0f766e", "#7c3aed"];
const DATA_DISCLOSURE =
  "Os alertas exibidos sao demonstrativos. Nenhuma API real esta conectada neste momento.";

const INCIDENT_ICONS = {
  acidente: Car,
  policial: ShieldAlert,
  risco: AlertTriangle,
  rodovia: Route,
  historico: Database,
};

function App() {
  const [filters, setFilters] = useState({ type: "todos", status: "todos", severity: "todas", query: "" });
  const [selectedId, setSelectedId] = useState(SEED_INCIDENTS[0]?.id);
  const [lastSync, setLastSync] = useState(new Date());
  const [isOnline, setIsOnline] = useState(() => navigator.onLine);
  const [notice, setNotice] = useState("");

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  useEffect(() => {
    if (!notice) return undefined;
    const timeoutId = window.setTimeout(() => setNotice(""), 2600);
    return () => window.clearTimeout(timeoutId);
  }, [notice]);

  const incidents = useMemo(() => sortIncidentsByRisk(SEED_INCIDENTS), []);
  const filteredIncidents = useMemo(() => filterIncidents(incidents, filters), [incidents, filters]);
  const selectedIncident = incidents.find((incident) => incident.id === selectedId) ?? incidents[0];
  const summary = useMemo(() => createIncidentSummary(incidents), [incidents]);
  const typeChartData = useMemo(() => getTypeChartData(incidents), [incidents]);
  const timeWindowData = useMemo(() => getTimeWindowData(incidents), [incidents]);
  const hotspots = useMemo(() => getHotspots(incidents), [incidents]);

  function updateFilter(key, value) {
    setFilters((current) => ({ ...current, [key]: value }));
  }

  function refreshFeed() {
    setLastSync(new Date());
    setNotice("Consulta atualizada localmente");
  }

  return (
    <div className="app-shell">
      <header className="topbar">
        <div>
          <p className="eyebrow">Marilia-SP</p>
          <h1>Togs Heads Up</h1>
          <p className="topbar-copy">Painel preventivo de consulta sobre acidentes, ocorrencias e pontos de atencao.</p>
        </div>

        <div className="topbar-actions">
          <span className="data-pill">
            <Database size={16} />
            Dados demo
          </span>
          <span className={`connection-pill ${isOnline ? "online" : "offline"}`}>
            {isOnline ? <Wifi size={16} /> : <WifiOff size={16} />}
            {isOnline ? "Online" : "Offline"}
          </span>
          <button className="icon-button" type="button" onClick={refreshFeed} aria-label="Atualizar feed">
            <RefreshCw size={18} />
          </button>
        </div>
      </header>

      <main>
        <section className="data-disclaimer" aria-label="Aviso sobre a origem dos dados">
          <Database size={18} />
          <span>{DATA_DISCLOSURE}</span>
        </section>

        <section className="metric-grid" aria-label="Resumo dos alertas">
          <MetricCard icon={Radio} label="Alertas ativos" value={summary.active} tone="danger" />
          <MetricCard icon={BellRing} label="Risco critico" value={summary.critical} tone="warning" />
          <MetricCard icon={Clock} label="Ultima hora" value={summary.recent} tone="info" />
          <MetricCard icon={Gauge} label="Indice medio" value={summary.averageRisk} tone="success" />
        </section>

        <section className="dashboard-grid">
          <MapPanel incidents={incidents} selectedIncident={selectedIncident} onSelect={setSelectedId} />

          <IncidentFeed
            incidents={filteredIncidents}
            filters={filters}
            onFilterChange={updateFilter}
            onSelect={setSelectedId}
            selectedId={selectedIncident?.id}
          />
        </section>

        <section className="insight-grid">
          <AnalyticsPanel typeChartData={typeChartData} timeWindowData={timeWindowData} />
          <HotspotsPanel hotspots={hotspots} />
          <SourcesPanel sources={SOURCE_STATUS} />
        </section>
      </main>

      <nav className="bottom-nav" aria-label="Navegacao principal">
        <a href="#mapa">
          <MapPin size={18} />
          Mapa
        </a>
        <a href="#alertas">
          <Activity size={18} />
          Alertas
        </a>
        <a href="#dados">
          <BarChart3 size={18} />
          Dados
        </a>
      </nav>

      {notice && <div className="toast">{notice}</div>}

      <footer className="app-footer">
        <Smartphone size={16} />
        Modo consulta. Cache {lastSync.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}.
      </footer>
    </div>
  );
}

function MetricCard({ icon: Icon, label, value, tone }) {
  return (
    <article className={`metric-card ${tone}`}>
      <div className="metric-icon">
        <Icon size={20} />
      </div>
      <div>
        <span>{label}</span>
        <strong>{value}</strong>
      </div>
    </article>
  );
}

function MapPanel({ incidents, selectedIncident, onSelect }) {
  return (
    <section className="panel map-panel" id="mapa">
      <div className="panel-heading">
        <div>
          <p className="eyebrow">Mapa preventivo</p>
          <h2>Marilia em observacao</h2>
        </div>
        <Navigation size={22} />
      </div>

      <div className="city-map" role="group" aria-label="Mapa preventivo de Marilia com marcadores de alerta">
        <span className="map-road horizontal" />
        <span className="map-road vertical" />
        <span className="map-road diagonal" />
        <span className="map-label center">Centro</span>
        <span className="map-label north">Aquarius</span>
        <span className="map-label south">BR-153</span>
        {incidents.map((incident) => {
          const Icon = INCIDENT_ICONS[incident.type] ?? AlertTriangle;
          const risk = calculateRiskScore(incident);
          const band = getRiskBand(risk);

          return (
            <button
              className={`map-marker ${band} ${selectedIncident?.id === incident.id ? "selected" : ""}`}
              style={{ left: `${incident.position.x}%`, top: `${incident.position.y}%` }}
              type="button"
              key={incident.id}
              onClick={() => onSelect(incident.id)}
              aria-label={`${incident.title}, risco ${risk}`}
            >
              <Icon size={16} />
            </button>
          );
        })}
      </div>

      {selectedIncident && <IncidentDetails incident={selectedIncident} />}
    </section>
  );
}

function IncidentDetails({ incident }) {
  const risk = calculateRiskScore(incident);
  const age = getIncidentAgeMinutes(incident);
  const Icon = INCIDENT_ICONS[incident.type] ?? AlertTriangle;

  return (
    <article className="incident-details">
      <div className="incident-main">
        <span className={`incident-icon ${incident.type}`}>
          <Icon size={18} />
        </span>
        <div>
          <h3>{incident.title}</h3>
          <p>{incident.location}</p>
        </div>
      </div>
      <div className="detail-grid">
        <span>{TYPE_LABELS[incident.type]}</span>
        <span>{incident.neighborhood}</span>
        <span>{formatAge(age)}</span>
        <RiskPill risk={risk} />
      </div>
    </article>
  );
}

function IncidentFeed({ incidents, filters, onFilterChange, onSelect, selectedId }) {
  return (
    <section className="panel feed-panel" id="alertas">
      <div className="panel-heading compact">
        <div>
          <p className="eyebrow">Feed priorizado</p>
          <h2>Alertas</h2>
        </div>
        <span className="counter">{incidents.length}</span>
      </div>

      <div className="search-row">
        <Search size={18} />
        <input
          value={filters.query}
          onChange={(event) => onFilterChange("query", event.target.value)}
          placeholder="Buscar bairro, via ou fonte"
          aria-label="Buscar alertas"
        />
      </div>

      <div className="filter-stack">
        <SegmentedControl
          label="Tipo"
          value={filters.type}
          options={Object.entries(TYPE_LABELS)}
          onChange={(value) => onFilterChange("type", value)}
        />
        <SegmentedControl
          label="Status"
          value={filters.status}
          options={Object.entries(STATUS_LABELS)}
          onChange={(value) => onFilterChange("status", value)}
        />
        <select
          className="select-input"
          value={filters.severity}
          onChange={(event) => onFilterChange("severity", event.target.value)}
          aria-label="Filtrar por severidade"
        >
          <option value="todas">Todas as severidades</option>
          {Object.entries(SEVERITY_LABELS).map(([value, label]) => (
            <option value={value} key={value}>
              {label}
            </option>
          ))}
        </select>
      </div>

      <div className="incident-list">
        {incidents.length === 0 ? (
          <div className="empty-state">Nenhum alerta no filtro atual.</div>
        ) : (
          incidents.map((incident) => (
            <IncidentRow
              key={incident.id}
              incident={incident}
              selected={selectedId === incident.id}
              onClick={() => onSelect(incident.id)}
            />
          ))
        )}
      </div>
    </section>
  );
}

function SegmentedControl({ label, options, value, onChange }) {
  return (
    <div className="segmented-control" aria-label={label}>
      {options.map(([optionValue, optionLabel]) => (
        <button
          type="button"
          key={optionValue}
          className={value === optionValue ? "active" : ""}
          onClick={() => onChange(optionValue)}
        >
          {optionLabel}
        </button>
      ))}
    </div>
  );
}

function IncidentRow({ incident, selected, onClick }) {
  const risk = calculateRiskScore(incident);
  const age = getIncidentAgeMinutes(incident);
  const Icon = INCIDENT_ICONS[incident.type] ?? AlertTriangle;

  return (
    <button className={`incident-row ${selected ? "selected" : ""}`} type="button" onClick={onClick}>
      <span className={`incident-icon ${incident.type}`}>
        <Icon size={18} />
      </span>
      <span className="incident-copy">
        <strong>{incident.title}</strong>
        <small>{incident.location}</small>
      </span>
      <span className="incident-meta">
        <RiskPill risk={risk} />
        <small>{formatAge(age)}</small>
      </span>
    </button>
  );
}

function RiskPill({ risk }) {
  const band = getRiskBand(risk);
  const labels = {
    critico: "Critico",
    alto: "Alto",
    moderado: "Medio",
    baixo: "Baixo",
  };

  return (
    <span className={`risk-pill ${band}`}>
      {labels[band]} {risk}
    </span>
  );
}

function AnalyticsPanel({ typeChartData, timeWindowData }) {
  return (
    <section className="panel analytics-panel" id="dados">
      <div className="panel-heading">
        <div>
          <p className="eyebrow">Tendencia</p>
          <h2>Distribuicao dos alertas</h2>
        </div>
        <BarChart3 size={22} />
      </div>

      <div className="chart-block">
        <ResponsiveContainer width="100%" height={210}>
          <BarChart data={typeChartData}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e5e7eb" />
            <XAxis dataKey="type" tickLine={false} axisLine={false} fontSize={12} />
            <YAxis allowDecimals={false} tickLine={false} axisLine={false} fontSize={12} width={28} />
            <Tooltip cursor={{ fill: "#f3f4f6" }} />
            <Bar dataKey="total" radius={[6, 6, 0, 0]}>
              {typeChartData.map((entry, index) => (
                <Cell key={entry.type} fill={CHART_COLORS[index % CHART_COLORS.length]} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      <div className="chart-block">
        <ResponsiveContainer width="100%" height={190}>
          <AreaChart data={timeWindowData}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e5e7eb" />
            <XAxis dataKey="janela" tickLine={false} axisLine={false} fontSize={12} />
            <YAxis allowDecimals={false} tickLine={false} axisLine={false} fontSize={12} width={28} />
            <Tooltip />
            <Area type="monotone" dataKey="alertas" stroke="#2563eb" fill="#bfdbfe" strokeWidth={2} />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </section>
  );
}

function HotspotsPanel({ hotspots }) {
  return (
    <section className="panel hotspots-panel">
      <div className="panel-heading">
        <div>
          <p className="eyebrow">Prioridade</p>
          <h2>Pontos de atencao</h2>
        </div>
        <MapPin size={22} />
      </div>

      <div className="hotspot-list">
        {hotspots.map((hotspot) => (
          <div className="hotspot-row" key={hotspot.neighborhood}>
            <div>
              <strong>{hotspot.neighborhood}</strong>
              <small>
                {hotspot.total} alertas, {hotspot.active} ativos
              </small>
            </div>
            <RiskPill risk={hotspot.risk} />
          </div>
        ))}
      </div>
    </section>
  );
}

function SourcesPanel({ sources }) {
  return (
    <section className="panel sources-panel">
      <div className="panel-heading">
        <div>
          <p className="eyebrow">Fontes</p>
          <h2>Integracoes</h2>
        </div>
        <Database size={22} />
      </div>

      <div className="source-list">
        {sources.map((source) => (
          <article className="source-row" key={source.id}>
            <div>
              <strong>{source.name}</strong>
              <small>{source.detail}</small>
            </div>
            <span className={`source-status ${source.status}`}>{source.cadence}</span>
          </article>
        ))}
      </div>
    </section>
  );
}

export default App;
