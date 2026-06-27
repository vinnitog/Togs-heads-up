import { useCallback, useEffect, useMemo, useState } from "react";
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
import { fetchIncidents, getSourceStatuses } from "./services/incidentsApi.js";
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
  "Os alertas exibidos vem somente das APIs configuradas. Sem fonte ativa, nenhum dado e inventado.";
const SOURCE_BADGE_LABELS = {
  conectado: "Conectada",
  pendente: "Pendente",
  erro: "Erro",
  "sem-dados": "Sem dados",
};

const INCIDENT_ICONS = {
  acidente: Car,
  policial: ShieldAlert,
  risco: AlertTriangle,
  rodovia: Route,
  historico: Database,
};

function App() {
  const [filters, setFilters] = useState({ type: "todos", status: "todos", severity: "todas", query: "" });
  const [incidents, setIncidents] = useState([]);
  const [selectedId, setSelectedId] = useState("");
  const [sources, setSources] = useState(() => getSourceStatuses());
  const [lastSync, setLastSync] = useState(null);
  const [isOnline, setIsOnline] = useState(() => navigator.onLine);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [notice, setNotice] = useState("");

  const loadIncidentFeed = useCallback(async ({ signal, showNotice = false } = {}) => {
    setIsLoading(true);
    setLoadError("");

    try {
      const result = await fetchIncidents({ signal });
      const nextIncidents = sortIncidentsByRisk(result.incidents);

      setIncidents(nextIncidents);
      setSources(result.sources);
      setLastSync(new Date(result.fetchedAt));
      setSelectedId((currentId) => {
        if (nextIncidents.some((incident) => incident.id === currentId)) return currentId;
        return nextIncidents[0]?.id ?? "";
      });

      if (result.warnings.length > 0) {
        setLoadError(result.warnings.join(" "));
      }

      if (showNotice) {
        setNotice(`${nextIncidents.length} alerta(s) real(is) carregado(s)`);
      }
    } catch (error) {
      if (error?.name === "AbortError") return;
      setLoadError(error?.message || "Nao foi possivel consultar as APIs.");
      if (showNotice) setNotice("Falha ao atualizar as APIs");
    } finally {
      if (!signal?.aborted) setIsLoading(false);
    }
  }, []);

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
    const controller = new AbortController();
    loadIncidentFeed({ signal: controller.signal });
    return () => controller.abort();
  }, [loadIncidentFeed]);

  useEffect(() => {
    if (!notice) return undefined;
    const timeoutId = window.setTimeout(() => setNotice(""), 2600);
    return () => window.clearTimeout(timeoutId);
  }, [notice]);

  const filteredIncidents = useMemo(() => filterIncidents(incidents, filters), [incidents, filters]);
  const selectedIncident = incidents.find((incident) => incident.id === selectedId) ?? incidents[0];
  const summary = useMemo(() => createIncidentSummary(incidents), [incidents]);
  const typeChartData = useMemo(() => getTypeChartData(incidents), [incidents]);
  const timeWindowData = useMemo(() => getTimeWindowData(incidents), [incidents]);
  const hotspots = useMemo(() => getHotspots(incidents), [incidents]);
  const hasConfiguredSource = sources.some((source) => source.status !== "pendente");

  function updateFilter(key, value) {
    setFilters((current) => ({ ...current, [key]: value }));
  }

  function refreshFeed() {
    loadIncidentFeed({ showNotice: true });
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
            {hasConfiguredSource ? "APIs reais" : "APIs pendentes"}
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
          {loadError ? <AlertTriangle size={18} /> : <Database size={18} />}
          <span>{DATA_DISCLOSURE}</span>
        </section>

        {(isLoading || loadError) && (
          <section className={`feed-state ${loadError ? "warning" : ""}`} aria-live="polite">
            <RefreshCw size={18} className={isLoading ? "spin" : ""} />
            <span>{isLoading ? "Consultando APIs de ocorrencias..." : loadError}</span>
          </section>
        )}

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
            isLoading={isLoading}
            onFilterChange={updateFilter}
            onSelect={setSelectedId}
            selectedId={selectedIncident?.id}
          />
        </section>

        <section className="insight-grid">
          <AnalyticsPanel typeChartData={typeChartData} timeWindowData={timeWindowData} />
          <HotspotsPanel hotspots={hotspots} />
          <SourcesPanel sources={sources} />
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
        Ultima consulta{" "}
        {lastSync ? lastSync.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }) : "pendente"}.
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
        {incidents.length === 0 && <div className="map-empty">Nenhum alerta real retornado pelas APIs.</div>}
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

      {selectedIncident ? (
        <IncidentDetails incident={selectedIncident} />
      ) : (
        <div className="empty-state compact">Aguardando alertas reais para detalhar.</div>
      )}
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

function IncidentFeed({ incidents, filters, isLoading, onFilterChange, onSelect, selectedId }) {
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
        {isLoading ? (
          <div className="empty-state">Carregando alertas das APIs...</div>
        ) : incidents.length === 0 ? (
          <div className="empty-state">Nenhum alerta real no filtro atual.</div>
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
  const hasChartData = typeChartData.length > 0 || timeWindowData.some((item) => item.alertas > 0);

  return (
    <section className="panel analytics-panel" id="dados">
      <div className="panel-heading">
        <div>
          <p className="eyebrow">Tendencia</p>
          <h2>Distribuicao dos alertas</h2>
        </div>
        <BarChart3 size={22} />
      </div>

      {hasChartData ? (
        <>
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
        </>
      ) : (
        <div className="empty-state chart-empty">Graficos aguardando dados reais das APIs.</div>
      )}
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
        {hotspots.length === 0 ? (
          <div className="empty-state compact">Sem pontos de atencao retornados.</div>
        ) : (
          hotspots.map((hotspot) => (
            <div className="hotspot-row" key={hotspot.neighborhood}>
              <div>
                <strong>{hotspot.neighborhood}</strong>
                <small>
                  {hotspot.total} alertas, {hotspot.active} ativos
                </small>
              </div>
              <RiskPill risk={hotspot.risk} />
            </div>
          ))
        )}
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
            <span className={`source-status ${source.status}`}>
              {SOURCE_BADGE_LABELS[source.status] ?? source.cadence}
            </span>
          </article>
        ))}
      </div>
    </section>
  );
}

export default App;
