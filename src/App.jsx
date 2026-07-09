import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Activity,
  Aperture,
  CloudRain,
  CloudSun,
  Database,
  Droplets,
  ExternalLink,
  Flame,
  Gauge,
  Globe2,
  LocateFixed,
  MapPin,
  MoonStar,
  Newspaper,
  RefreshCw,
  Rocket,
  Satellite,
  Search,
  Sun,
  Telescope,
  Thermometer,
  WifiOff,
  Wind,
  Zap,
} from "lucide-react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  DEFAULT_LOCATION,
  buildLocationLabel,
  fetchEarthSpaceDashboard,
  searchLocations,
} from "./services/earthSpaceApi.js";
import { fetchIncidents } from "./services/incidentsApi.js";
import { formatAge, getIncidentAgeMinutes, sortIncidentsByRisk } from "./utils/incidents.js";

const EMPTY_DASHBOARD = {
  weather: null,
  cptec: null,
  apod: null,
  neows: null,
  cad: [],
  fireballs: [],
  marsPhotos: [],
  sources: [],
  warnings: [],
  fetchedAt: null,
};

const EMPTY_LOCAL_FEED = {
  incidents: [],
  sources: [],
  warnings: [],
  fetchedAt: null,
};

const VIEW_GROUPS = [
  {
    title: "Terra",
    items: [
      { id: "overview", label: "Resumo", icon: Activity },
      { id: "weather", label: "Open-Meteo", icon: CloudSun },
      { id: "cptec", label: "CPTEC/INPE", icon: CloudRain },
      { id: "local", label: "Noticias locais", icon: Newspaper },
    ],
  },
  {
    title: "Espaco",
    items: [
      { id: "apod", label: "NASA APOD", icon: Aperture },
      { id: "neows", label: "NASA NeoWs", icon: Satellite },
      { id: "cad", label: "JPL CAD", icon: Telescope },
      { id: "fireballs", label: "Fireball", icon: Flame },
      { id: "mars", label: "Marte", icon: Rocket },
    ],
  },
  {
    title: "Sistema",
    items: [{ id: "sources", label: "Fontes", icon: Database }],
  },
];

const SOURCE_LABELS = {
  online: "Online",
  conectado: "Online",
  erro: "Erro",
  pendente: "Pendente",
  "sem-dados": "Sem dados",
};

const INCIDENT_TYPE_LABELS = {
  acidente: "Acidente",
  policial: "Policial",
  risco: "Risco",
  rodovia: "Rodovia",
  historico: "Historico",
};

function App() {
  const [activeView, setActiveView] = useState("overview");
  const [location, setLocation] = useState(DEFAULT_LOCATION);
  const [locationQuery, setLocationQuery] = useState("Marilia-SP");
  const [locationResults, setLocationResults] = useState([]);
  const [dashboard, setDashboard] = useState(EMPTY_DASHBOARD);
  const [localFeed, setLocalFeed] = useState(EMPTY_LOCAL_FEED);
  const [isLoading, setIsLoading] = useState(true);
  const [isLocalLoading, setIsLocalLoading] = useState(true);
  const [isSearching, setIsSearching] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [localError, setLocalError] = useState("");
  const [notice, setNotice] = useState("");
  const [isOnline, setIsOnline] = useState(() => (typeof navigator === "undefined" ? true : navigator.onLine));
  const requestIdRef = useRef(0);
  const localRequestIdRef = useRef(0);

  const loadDashboard = useCallback(
    async ({ signal, showNotice = false } = {}) => {
      const requestId = requestIdRef.current + 1;
      requestIdRef.current = requestId;
      setIsLoading(true);
      setLoadError("");

      try {
        const result = await fetchEarthSpaceDashboard({
          location,
          env: import.meta.env,
          signal,
        });

        if (signal?.aborted || requestId !== requestIdRef.current) return;
        setDashboard(result);
        if (showNotice) setNotice("Dados de clima e espaco atualizados");
      } catch (error) {
        if (error?.name === "AbortError" || requestId !== requestIdRef.current) return;
        setLoadError(error?.message || "Nao foi possivel consultar as APIs.");
        if (showNotice) setNotice("Falha ao atualizar clima e espaco");
      } finally {
        if (!signal?.aborted && requestId === requestIdRef.current) setIsLoading(false);
      }
    },
    [location],
  );

  const loadLocalFeed = useCallback(async ({ signal, showNotice = false } = {}) => {
    const requestId = localRequestIdRef.current + 1;
    localRequestIdRef.current = requestId;
    setIsLocalLoading(true);
    setLocalError("");

    try {
      const result = await fetchIncidents({ env: import.meta.env, signal });
      if (signal?.aborted || requestId !== localRequestIdRef.current) return;

      setLocalFeed({
        ...result,
        incidents: sortIncidentsByRisk(result.incidents),
      });
      if (showNotice) setNotice("Noticias locais atualizadas");
    } catch (error) {
      if (error?.name === "AbortError" || requestId !== localRequestIdRef.current) return;
      setLocalError(error?.message || "Nao foi possivel consultar as noticias locais.");
      if (showNotice) setNotice("Falha ao atualizar noticias locais");
    } finally {
      if (!signal?.aborted && requestId === localRequestIdRef.current) setIsLocalLoading(false);
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    loadDashboard({ signal: controller.signal });
    return () => controller.abort();
  }, [loadDashboard]);

  useEffect(() => {
    const controller = new AbortController();
    loadLocalFeed({ signal: controller.signal });
    return () => controller.abort();
  }, [loadLocalFeed]);

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

  const currentView = useMemo(
    () => VIEW_GROUPS.flatMap((group) => group.items).find((item) => item.id === activeView),
    [activeView],
  );

  async function handleLocationSubmit(event) {
    event.preventDefault();
    const query = locationQuery.trim();
    if (!query) return;

    setIsSearching(true);
    setLoadError("");

    try {
      const results = await searchLocations(query);
      if (results.length === 0) {
        setLocationResults([]);
        setNotice("Nenhum local encontrado");
        return;
      }

      setLocationResults(results);
      if (results.length === 1) {
        selectLocation(results[0]);
      } else {
        setNotice("Escolha uma das opcoes encontradas.");
      }
    } catch (error) {
      setLoadError(error?.message || "Falha ao buscar local.");
    } finally {
      setIsSearching(false);
    }
  }

  function selectLocation(nextLocation) {
    setLocation(nextLocation);
    setLocationQuery(buildLocationLabel(nextLocation));
    setLocationResults([]);
    setNotice(`Local: ${buildLocationLabel(nextLocation)}`);
  }

  function resetLocation() {
    setLocation(DEFAULT_LOCATION);
    setLocationQuery("Marilia-SP");
    setLocationResults([]);
    setNotice("Local: Marilia-SP");
  }

  function refreshAll() {
    loadDashboard({ showNotice: true });
    loadLocalFeed({ showNotice: true });
  }

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="topbar-copy">
          <p className="eyebrow">Painel pessoal</p>
          <h1>Togs Heads-UP</h1>
          <p>Clima, noticias de Marilia-SP e eventos espaciais reunidos em um so lugar, cada fonte com seu proprio espaco.</p>
        </div>

        <div className="topbar-actions">
          {!isOnline && (
            <span className="connection-pill offline">
              <WifiOff size={16} />
              Offline
            </span>
          )}

          <form className="location-search" onSubmit={handleLocationSubmit}>
            <Search size={18} />
            <input
              value={locationQuery}
              onChange={(event) => setLocationQuery(event.target.value)}
              placeholder="Buscar cidade ou local"
              aria-label="Buscar cidade ou local"
            />
            <button type="submit" disabled={isSearching}>
              {isSearching ? "Buscando" : "Buscar"}
            </button>
          </form>

          <button className="ghost-button" type="button" onClick={resetLocation}>
            <LocateFixed size={16} />
            Marilia
          </button>

          <button className="icon-button" type="button" onClick={refreshAll} aria-label="Atualizar painel">
            <RefreshCw size={18} className={isLoading || isLocalLoading ? "spin" : ""} />
          </button>
        </div>

        {locationResults.length > 1 && (
          <div className="location-results" aria-label="Resultados de localizacao">
            {locationResults.slice(0, 5).map((result) => (
              <button type="button" key={result.id} onClick={() => selectLocation(result)}>
                <MapPin size={14} />
                {buildLocationLabel(result)}
              </button>
            ))}
          </div>
        )}
      </header>

      <main className="workspace">
        <aside className="api-menu" aria-label="Menu de fontes">
          {VIEW_GROUPS.map((group) => (
            <div className="menu-group" key={group.title}>
              <span>{group.title}</span>
              {group.items.map((item) => {
                const Icon = item.icon;
                return (
                  <button
                    type="button"
                    key={item.id}
                    className={activeView === item.id ? "active" : ""}
                    onClick={() => setActiveView(item.id)}
                  >
                    <Icon size={17} />
                    {item.label}
                  </button>
                );
              })}
            </div>
          ))}
        </aside>

        <section className="screen-shell">
          <ScreenHeading view={currentView} activeView={activeView} dashboard={dashboard} localFeed={localFeed} />
          <ScreenAlert state={getViewState(activeView, { dashboard, localFeed, loadError, localError, isLoading, isLocalLoading })} />
          {activeView === "overview" && <OverviewScreen dashboard={dashboard} localFeed={localFeed} />}
          {activeView === "weather" && <WeatherScreen weather={dashboard.weather} location={location} />}
          {activeView === "cptec" && <CptecScreen cptec={dashboard.cptec} location={location} />}
          {activeView === "local" && <LocalNewsScreen localFeed={localFeed} isLoading={isLocalLoading} />}
          {activeView === "apod" && <ApodScreen apod={dashboard.apod} />}
          {activeView === "neows" && <NeoWsScreen neows={dashboard.neows} />}
          {activeView === "cad" && <CadScreen cad={dashboard.cad} />}
          {activeView === "fireballs" && <FireballScreen fireballs={dashboard.fireballs} />}
          {activeView === "mars" && <MarsScreen photos={dashboard.marsPhotos} />}
          {activeView === "sources" && <SourcesScreen dashboard={dashboard} localFeed={localFeed} />}
        </section>
      </main>

      {notice && <div className="toast">{notice}</div>}
    </div>
  );
}

function ScreenHeading({ view, activeView, dashboard, localFeed }) {
  const updatedAt = getViewUpdatedAt(activeView, dashboard, localFeed);

  return (
    <header className="screen-heading">
      <div>
        <p className="eyebrow">{view?.label ?? "Painel"}</p>
        <h2>{getScreenTitle(view?.id)}</h2>
      </div>
      <div className="screen-meta">
        <Globe2 size={16} />
        <span>Atualizado {updatedAt ? formatTime(updatedAt) : "pendente"}</span>
      </div>
    </header>
  );
}

function ScreenAlert({ state }) {
  if (!state) return null;

  return (
    <div className={`screen-alert ${state.tone}`} role={state.tone === "error" ? "alert" : "status"} aria-live="polite">
      <RefreshCw size={16} className={state.tone === "loading" ? "spin" : ""} />
      <span>{state.message}</span>
    </div>
  );
}

function OverviewScreen({ dashboard, localFeed }) {
  const current = dashboard.weather?.current;
  const today = dashboard.weather?.daily?.[0];
  const neows = dashboard.neows;
  const latestLocal = localFeed.incidents[0];

  return (
    <div className="screen-grid overview-grid">
      <section className="data-section">
        <h3>Leitura rapida</h3>
        <div className="summary-list">
          <SummaryLine icon={Thermometer} label="Open-Meteo" value={formatValue(current?.temperature, "C")} detail={current?.condition} />
          <SummaryLine icon={CloudRain} label="Chuva hoje" value={formatValue(today?.rainProbability, "%")} detail={`${formatValue(today?.precipitation, " mm")} previstos`} />
          <SummaryLine icon={Newspaper} label="Noticias locais" value={formatInteger(localFeed.incidents.length)} detail={latestLocal?.title ?? "Sem item local no filtro atual"} />
          <SummaryLine icon={Satellite} label="NeoWs 7 dias" value={formatInteger(neows?.count)} detail={`${formatInteger(neows?.hazardousCount)} potencialmente perigosos`} />
          <SummaryLine icon={Flame} label="Fireball" value={formatInteger(dashboard.fireballs.length)} detail="Registros recentes CNEOS" />
        </div>
      </section>

      <section className="data-section">
        <h3>Proximas acoes</h3>
        <div className="plain-list">
          <p>Use o menu para abrir uma fonte por vez.</p>
          <p>Busque outra cidade no topo para atualizar Open-Meteo e CPTEC/INPE quando disponivel.</p>
          <p>As noticias locais continuam focadas em Marilia-SP pelas fontes regionais antigas.</p>
        </div>
      </section>
    </div>
  );
}

function SummaryLine({ icon: Icon, label, value, detail }) {
  return (
    <div className="summary-line">
      <Icon size={18} />
      <span>{label}</span>
      <strong>{value}</strong>
      <small>{detail || "--"}</small>
    </div>
  );
}

function WeatherScreen({ weather, location }) {
  const current = weather?.current;
  const data = weather?.hourly ?? [];

  if (!current) return <EmptyState text="Open-Meteo ainda nao retornou dados para este local." />;

  return (
    <div className="screen-grid">
      <section className="data-section weather-focus">
        <div className="weather-current">
          <div className="weather-symbol">{current.isDay ? <Sun size={42} /> : <MoonStar size={42} />}</div>
          <div>
            <span>{buildLocationLabel(location)}</span>
            <strong>{formatValue(current.temperature, "C")}</strong>
            <small>{current.condition}</small>
          </div>
        </div>

        <div className="data-table compact">
          <InfoRow icon={Thermometer} label="Sensacao" value={formatValue(current.apparentTemperature, "C")} />
          <InfoRow icon={Droplets} label="Umidade" value={formatValue(current.humidity, "%")} />
          <InfoRow icon={Wind} label="Vento" value={formatValue(current.windSpeed, " km/h")} />
          <InfoRow icon={Zap} label="Rajadas" value={formatValue(current.windGusts, " km/h")} />
          <InfoRow icon={Gauge} label="Pressao" value={formatValue(current.pressure, " hPa")} />
          <InfoRow icon={CloudRain} label="Precipitacao agora" value={formatValue(current.precipitation, " mm")} />
        </div>
      </section>

      <section className="data-section chart-section">
        <h3>Proximas 24h</h3>
        {data.length > 0 ? (
          <ResponsiveContainer width="100%" height={300}>
            <AreaChart data={data}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#d7dee8" />
              <XAxis dataKey="hour" tickLine={false} axisLine={false} fontSize={12} />
              <YAxis yAxisId="left" tickLine={false} axisLine={false} fontSize={12} width={32} />
              <YAxis yAxisId="right" orientation="right" tickLine={false} axisLine={false} fontSize={12} width={32} />
              <Tooltip />
              <Area yAxisId="left" type="monotone" dataKey="temperature" name="Temp. C" stroke="#0f766e" fill="#ccfbf1" strokeWidth={2} />
              <Area yAxisId="right" type="monotone" dataKey="rainProbability" name="Chuva %" stroke="#2563eb" fill="#dbeafe" strokeWidth={2} />
            </AreaChart>
          </ResponsiveContainer>
        ) : (
          <EmptyState text="Grafico aguardando dados horarios." compact />
        )}
      </section>
    </div>
  );
}

function InfoRow({ icon: Icon, label, value }) {
  return (
    <div className="info-row">
      <Icon size={16} />
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function CptecScreen({ cptec, location }) {
  if (!cptec) {
    return <EmptyState text={`CPTEC/INPE nao retornou previsao para ${buildLocationLabel(location)}.`} />;
  }

  return (
    <section className="data-section">
      <div className="section-title">
        <h3>{cptec.city ? `${cptec.city}-${cptec.uf}` : "Previsao nacional"}</h3>
        <span>Atualizacao {cptec.updatedAt || "pendente"}</span>
      </div>
      <div className="data-table">
        {(cptec.days ?? []).map((day) => (
          <div className="data-row" key={day.date}>
            <span>{formatShortDate(day.date)}</span>
            <strong>{day.condition}</strong>
            <small>
              {formatValue(day.min, "C")} / {formatValue(day.max, "C")} | UV {formatValue(day.uv)}
            </small>
          </div>
        ))}
      </div>
    </section>
  );
}

function LocalNewsScreen({ localFeed, isLoading }) {
  const incidents = localFeed.incidents ?? [];

  return (
    <section className="data-section">
      <div className="section-title">
        <h3>Fontes locais antigas mantidas</h3>
        <span>{isLoading ? "Atualizando..." : `${incidents.length} item(ns) filtrado(s)`}</span>
      </div>

      {incidents.length === 0 ? (
        <EmptyState text="As fontes locais responderam sem noticias/alertas filtrados para Marilia-SP." />
      ) : (
        <div className="news-list">
          {incidents.map((incident) => (
            <article className="news-row" key={incident.id}>
              <span className={`severity-dot ${incident.severity}`} />
              <div className="news-body">
                <strong>{incident.title}</strong>
                <small>
                  {incident.source} | {INCIDENT_TYPE_LABELS[incident.type] ?? "Local"} | {incident.neighborhood} |{" "}
                  {formatAge(getIncidentAgeMinutes(incident))}
                </small>
                {incident.detail && <p>{incident.detail}</p>}
              </div>
              {incident.url && (
                <a href={incident.url} target="_blank" rel="noreferrer" aria-label="Abrir noticia">
                  <ExternalLink size={16} />
                </a>
              )}
            </article>
          ))}
        </div>
      )}
    </section>
  );
}

function ApodScreen({ apod }) {
  if (!apod) return <EmptyState text="APOD indisponivel no momento." />;

  return (
    <section className="data-section apod-layout">
      {apod.imageUrl ? <img src={apod.imageUrl} alt={apod.title} /> : <EmptyState text="APOD sem imagem para hoje." compact />}
      <div>
        <h3>{apod.title}</h3>
        <p>{formatDate(apod.date)}</p>
        <p>{apod.explanation || "Sem descricao retornada pela NASA."}</p>
        {apod.url && (
          <a className="source-link" href={apod.url} target="_blank" rel="noreferrer">
            Abrir APOD <ExternalLink size={16} />
          </a>
        )}
      </div>
    </section>
  );
}

function NeoWsScreen({ neows }) {
  const items = neows?.items ?? [];

  return (
    <section className="data-section">
      <div className="section-title">
        <h3>Objetos proximos nos proximos 7 dias</h3>
        <span>{formatInteger(neows?.hazardousCount)} potencialmente perigosos</span>
      </div>
      {items.length === 0 ? (
        <EmptyState text="NeoWs sem objetos no recorte atual." />
      ) : (
        <div className="data-table">
          {items.map((item) => (
            <div className="data-row" key={item.id}>
              <span>{item.approachDate}</span>
              <strong>{item.name}</strong>
              <small>
                {formatDistanceKm(item.missDistanceKm)} | {formatValue(item.velocityKmS, " km/s")} |{" "}
                {formatValue(item.diameterM, " m")}
                {item.hazardous ? " | PHA" : ""}
              </small>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

function CadScreen({ cad }) {
  return (
    <section className="data-section">
      <div className="section-title">
        <h3>Close-Approach Data</h3>
        <span>{cad.length} aproximacao(oes)</span>
      </div>
      {cad.length === 0 ? (
        <EmptyState text="JPL CAD sem aproximacoes no recorte atual." />
      ) : (
        <div className="data-table">
          {cad.map((item) => (
            <div className="data-row" key={`${item.designation}-${item.date}`}>
              <span>{item.date}</span>
              <strong>{item.name}</strong>
              <small>
                {formatValue(item.distanceAu, " au")} | {formatValue(item.velocityKmS, " km/s")} | H {formatValue(item.magnitudeH)}
              </small>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

function FireballScreen({ fireballs }) {
  const chartData = fireballs.slice(0, 6).map((item, index) => ({
    name: `${index + 1}`,
    energia: item.impactEnergyKt ?? 0,
  }));

  return (
    <div className="screen-grid">
      <section className="data-section chart-section">
        <h3>Energia de impacto estimada</h3>
        {fireballs.length > 0 ? (
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#d7dee8" />
              <XAxis dataKey="name" tickLine={false} axisLine={false} fontSize={12} />
              <YAxis tickLine={false} axisLine={false} fontSize={12} width={34} />
              <Tooltip />
              <Bar dataKey="energia" name="Impacto kt" fill="#d97706" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        ) : (
          <EmptyState text="Fireball API sem registros recentes no recorte atual." compact />
        )}
      </section>

      <section className="data-section">
        <h3>Registros recentes</h3>
        <div className="data-table">
          {fireballs.map((item) => (
            <div className="data-row" key={`${item.date}-${item.latitude}-${item.longitude}`}>
              <span>{formatDateTime(item.date)}</span>
              <strong>{formatCoordinates(item)}</strong>
              <small>
                {formatValue(item.impactEnergyKt, " kt")} | {formatValue(item.altitudeKm, " km alt.")}
              </small>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

function MarsScreen({ photos }) {
  return (
    <section className="data-section">
      <div className="section-title">
        <h3>Curiosity rover</h3>
        <span>{photos.length} foto(s)</span>
      </div>
      {photos.length === 0 ? (
        <EmptyState text="Mars Rover Photos indisponivel no momento." />
      ) : (
        <div className="photo-grid">
          {photos.slice(0, 6).map((photo) => (
            <figure className="media-tile" key={photo.id}>
              <img src={photo.imageUrl} alt={`${photo.rover} ${photo.camera}`} loading="lazy" />
              <figcaption>
                <strong>{photo.camera}</strong>
                <span>
                  Sol {photo.sol} | {formatShortDate(photo.earthDate)}
                </span>
              </figcaption>
            </figure>
          ))}
        </div>
      )}
    </section>
  );
}

function SourcesScreen({ dashboard, localFeed }) {
  return (
    <div className="screen-grid">
      <SourceGroup title="Clima e espaco" sources={dashboard.sources} />
      <SourceGroup title="Noticias locais antigas" sources={localFeed.sources} local />
    </div>
  );
}

function SourceGroup({ title, sources, local = false }) {
  return (
    <section className="data-section">
      <h3>{title}</h3>
      <div className="source-list">
        {sources.map((source) => (
          <article className="source-row" key={source.id}>
            <div>
              <strong>{source.label ?? source.name}</strong>
              <small>{source.detail}</small>
            </div>
            <span className={`source-status ${source.state ?? source.status}`}>
              {SOURCE_LABELS[source.state ?? source.status] ?? (local ? source.cadence : "Fonte")}
            </span>
          </article>
        ))}
      </div>
    </section>
  );
}

function EmptyState({ text, compact = false }) {
  return <div className={`empty-state ${compact ? "compact" : ""}`}>{text}</div>;
}

function getScreenTitle(id) {
  const titles = {
    overview: "Visao geral",
    weather: "Clima atual e proximas 24h",
    cptec: "Previsao nacional brasileira",
    local: "Noticias e alertas regionais",
    apod: "Imagem astronomica do dia",
    neows: "Asteroides proximos",
    cad: "Aproximacoes JPL",
    fireballs: "Meteoros e bolas de fogo",
    mars: "Fotos de Marte",
    sources: "Estado das integracoes",
  };
  return titles[id] ?? "Painel";
}

const DASHBOARD_VIEW_SOURCE = {
  weather: "weather",
  cptec: "cptec",
  apod: "apod",
  neows: "neows",
  cad: "cad",
  fireballs: "fireballs",
  mars: "marsPhotos",
};

function getViewState(activeView, ctx) {
  const { dashboard, localFeed, loadError, localError, isLoading, isLocalLoading } = ctx;

  if (activeView === "local") {
    if (isLocalLoading) return { tone: "loading", message: "Atualizando noticias locais..." };
    if (localError) return { tone: "error", message: localError };
    if (localFeed.warnings.length > 0) return { tone: "warning", message: localFeed.warnings.slice(0, 2).join(" | ") };
    return null;
  }

  if (activeView === "overview" || activeView === "sources") return null;

  const sourceKey = DASHBOARD_VIEW_SOURCE[activeView];
  if (!sourceKey) return null;

  if (isLoading) return { tone: "loading", message: "Consultando fonte..." };
  if (loadError) return { tone: "error", message: loadError };

  const source = dashboard.sources.find((item) => item.id === sourceKey);
  if (source?.state === "erro") {
    return { tone: "error", message: source.detail || `${source.label}: falha ao consultar` };
  }
  if (source?.state === "sem-dados") {
    return { tone: "warning", message: source.detail || `${source.label}: sem dados no recorte atual` };
  }
  return null;
}

function getViewUpdatedAt(activeView, dashboard, localFeed) {
  if (activeView === "local") return localFeed.fetchedAt;
  if (activeView === "overview" || activeView === "sources") {
    return [dashboard.fetchedAt, localFeed.fetchedAt].filter(Boolean).sort().slice(-1)[0] ?? null;
  }
  return dashboard.fetchedAt;
}

function formatValue(value, suffix = "") {
  const number = Number(value);
  if (!Number.isFinite(number)) return "--";
  return `${number.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}${suffix}`;
}

function formatInteger(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return "--";
  return number.toLocaleString("pt-BR", { maximumFractionDigits: 0 });
}

function formatDistanceKm(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return "--";
  if (number >= 1000000) return `${(number / 1000000).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} mi km`;
  return `${Math.round(number).toLocaleString("pt-BR")} km`;
}

function formatDate(value) {
  if (!value) return "";
  const date = new Date(`${value}T12:00:00`);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString("pt-BR", { day: "2-digit", month: "long", year: "numeric" });
}

function formatShortDate(value) {
  if (!value) return "";
  const date = new Date(value.includes("T") ? value : `${value}T12:00:00`);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
}

function formatTime(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "pendente";
  return date.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
}

function formatDateTime(value) {
  if (!value) return "--";
  const date = new Date(value.replace(" ", "T"));
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatCoordinates(item) {
  if (!Number.isFinite(item.latitude) || !Number.isFinite(item.longitude)) return "Local nao informado";
  return `${Math.abs(item.latitude).toFixed(1)}${item.latitude < 0 ? "S" : "N"}, ${Math.abs(item.longitude).toFixed(1)}${
    item.longitude < 0 ? "W" : "E"
  }`;
}

export default App;
