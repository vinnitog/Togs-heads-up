import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Activity,
  AlertTriangle,
  Aperture,
  CalendarDays,
  CloudRain,
  CloudSun,
  Database,
  Droplets,
  ExternalLink,
  Flame,
  Gauge,
  Globe2,
  Image as ImageIcon,
  LocateFixed,
  MapPin,
  MoonStar,
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

const EMPTY_DASHBOARD = {
  weather: null,
  cptec: null,
  apod: null,
  neows: null,
  cad: [],
  fireballs: [],
  marsPhotos: [],
  nasaImages: [],
  sources: [],
  warnings: [],
  fetchedAt: null,
};

const SOURCE_LABELS = {
  online: "Online",
  erro: "Erro",
  "sem-dados": "Sem dados",
};

function App() {
  const [location, setLocation] = useState(DEFAULT_LOCATION);
  const [locationQuery, setLocationQuery] = useState("Marilia-SP");
  const [locationResults, setLocationResults] = useState([]);
  const [imageDraft, setImageDraft] = useState("earth from space");
  const [imageQuery, setImageQuery] = useState("earth from space");
  const [dashboard, setDashboard] = useState(EMPTY_DASHBOARD);
  const [isLoading, setIsLoading] = useState(true);
  const [isSearching, setIsSearching] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [notice, setNotice] = useState("");
  const [isOnline, setIsOnline] = useState(() => (typeof navigator === "undefined" ? true : navigator.onLine));
  const requestIdRef = useRef(0);

  const loadDashboard = useCallback(
    async ({ signal, showNotice = false } = {}) => {
      const requestId = requestIdRef.current + 1;
      requestIdRef.current = requestId;
      setIsLoading(true);
      setLoadError("");

      try {
        const result = await fetchEarthSpaceDashboard({
          location,
          imageQuery,
          env: import.meta.env,
          signal,
        });

        if (signal?.aborted || requestId !== requestIdRef.current) return;

        setDashboard(result);
        if (showNotice) setNotice("Dados atualizados");
      } catch (error) {
        if (error?.name === "AbortError") return;
        if (requestId !== requestIdRef.current) return;
        setLoadError(error?.message || "Nao foi possivel consultar as APIs.");
        if (showNotice) setNotice("Falha ao atualizar");
      } finally {
        if (!signal?.aborted && requestId === requestIdRef.current) setIsLoading(false);
      }
    },
    [imageQuery, location],
  );

  useEffect(() => {
    const controller = new AbortController();
    loadDashboard({ signal: controller.signal });
    return () => controller.abort();
  }, [loadDashboard]);

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

  const metrics = useMemo(() => createMetrics(dashboard), [dashboard]);

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

  function refreshDashboard() {
    loadDashboard({ showNotice: true });
  }

  function handleImageSearch(event) {
    event.preventDefault();
    const nextQuery = imageDraft.trim();
    if (!nextQuery) return;
    setImageQuery(nextQuery);
    setNotice(`NASA Library: ${nextQuery}`);
  }

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="topbar-copy">
          <p className="eyebrow">Marilia-SP por padrao</p>
          <h1>Monitor Terra + Espaco</h1>
          <p>Clima local/global, previsao nacional e sinais astronomicos publicos em uma unica leitura.</p>
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

          <button className="icon-button" type="button" onClick={refreshDashboard} aria-label="Atualizar painel">
            <RefreshCw size={18} className={isLoading ? "spin" : ""} />
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

      <main>
        {(isLoading || loadError || dashboard.warnings.length > 0) && (
          <section className={`feed-state ${loadError || dashboard.warnings.length > 0 ? "warning" : ""}`} aria-live="polite">
            <RefreshCw size={18} className={isLoading ? "spin" : ""} />
            <span>{getStatusMessage(isLoading, loadError, dashboard.warnings)}</span>
          </section>
        )}

        <section className="metric-grid" aria-label="Resumo operacional">
          {metrics.map((metric) => (
            <MetricCard key={metric.label} {...metric} />
          ))}
        </section>

        <section className="dashboard-grid">
          <WeatherPanel weather={dashboard.weather} cptec={dashboard.cptec} location={location} />
          <ApodPanel apod={dashboard.apod} neows={dashboard.neows} />
        </section>

        <section className="analysis-grid">
          <WeatherChart weather={dashboard.weather} />
          <DailyForecast weather={dashboard.weather} cptec={dashboard.cptec} />
        </section>

        <section className="space-grid">
          <NearEarthPanel neows={dashboard.neows} cad={dashboard.cad} />
          <FireballPanel fireballs={dashboard.fireballs} />
        </section>

        <section className="media-grid">
          <MarsPanel photos={dashboard.marsPhotos} />
          <NasaLibraryPanel
            images={dashboard.nasaImages}
            imageDraft={imageDraft}
            onDraftChange={setImageDraft}
            onSubmit={handleImageSearch}
          />
        </section>

        <SourcesPanel sources={dashboard.sources} fetchedAt={dashboard.fetchedAt} />
      </main>

      {notice && <div className="toast">{notice}</div>}
    </div>
  );
}

function createMetrics(dashboard) {
  const current = dashboard.weather?.current;
  const today = dashboard.weather?.daily?.[0];
  const neows = dashboard.neows;
  const fireballs = dashboard.fireballs ?? [];

  return [
    {
      icon: Thermometer,
      label: "Temperatura",
      value: formatValue(current?.temperature, "C"),
      detail: current?.condition || "Open-Meteo",
      tone: "teal",
    },
    {
      icon: CloudRain,
      label: "Chuva hoje",
      value: formatValue(today?.rainProbability, "%"),
      detail: `${formatValue(today?.precipitation, " mm")} previstos`,
      tone: "blue",
    },
    {
      icon: Telescope,
      label: "NEOs 7 dias",
      value: formatInteger(neows?.count),
      detail: `${formatInteger(neows?.hazardousCount)} potencialmente perigosos`,
      tone: "amber",
    },
    {
      icon: Flame,
      label: "Fireballs",
      value: formatInteger(fireballs.length),
      detail: "Registros recentes CNEOS",
      tone: "rose",
    },
  ];
}

function getStatusMessage(isLoading, loadError, warnings) {
  if (isLoading) return "Consultando APIs publicas...";
  if (loadError) return loadError;
  if (warnings.length > 0) return warnings.slice(0, 2).join(" | ");
  return "";
}

function MetricCard({ icon: Icon, label, value, detail, tone }) {
  return (
    <article className={`metric-card ${tone}`}>
      <div className="metric-icon">
        <Icon size={20} />
      </div>
      <div>
        <span>{label}</span>
        <strong>{value}</strong>
        <small>{detail}</small>
      </div>
    </article>
  );
}

function WeatherPanel({ weather, cptec, location }) {
  const current = weather?.current;

  return (
    <section className="panel weather-panel">
      <div className="panel-heading">
        <div>
          <p className="eyebrow">Clima da Terra</p>
          <h2>{buildLocationLabel(location)}</h2>
        </div>
        <CloudSun size={24} />
      </div>

      {current ? (
        <>
          <div className="weather-current">
            <div className="weather-symbol">
              {current.isDay ? <Sun size={42} /> : <MoonStar size={42} />}
            </div>
            <div>
              <strong>{formatValue(current.temperature, "C")}</strong>
              <span>{current.condition}</span>
            </div>
          </div>

          <div className="detail-grid">
            <InfoChip icon={Thermometer} label="Sensacao" value={formatValue(current.apparentTemperature, "C")} />
            <InfoChip icon={Droplets} label="Umidade" value={formatValue(current.humidity, "%")} />
            <InfoChip icon={Wind} label="Vento" value={formatValue(current.windSpeed, " km/h")} />
            <InfoChip icon={Zap} label="Rajadas" value={formatValue(current.windGusts, " km/h")} />
            <InfoChip icon={Gauge} label="Pressao" value={formatValue(current.pressure, " hPa")} />
            <InfoChip icon={CloudRain} label="Agora" value={formatValue(current.precipitation, " mm")} />
          </div>
        </>
      ) : (
        <EmptyState text="Open-Meteo ainda nao retornou dados para este local." />
      )}

      <div className="cptec-strip">
        <div>
          <span>CPTEC/INPE</span>
          <strong>{cptec?.city ? `${cptec.city}-${cptec.uf}` : "Complemento nacional"}</strong>
        </div>
        <small>{cptec?.days?.[0]?.condition ?? "Disponivel para cidades brasileiras quando a fonte responder."}</small>
      </div>
    </section>
  );
}

function InfoChip({ icon: Icon, label, value }) {
  return (
    <span className="info-chip">
      <Icon size={16} />
      <span>{label}</span>
      <strong>{value}</strong>
    </span>
  );
}

function ApodPanel({ apod, neows }) {
  return (
    <section className="panel apod-panel">
      <div className="panel-heading">
        <div>
          <p className="eyebrow">NASA APOD</p>
          <h2>{apod?.title ?? "Imagem astronomica do dia"}</h2>
        </div>
        <Aperture size={24} />
      </div>

      {apod?.imageUrl ? (
        <figure className="apod-figure">
          <img src={apod.imageUrl} alt={apod.title} />
          <figcaption>
            <span>{formatDate(apod.date)}</span>
            {apod.url && (
              <a href={apod.url} target="_blank" rel="noreferrer" aria-label="Abrir APOD na NASA">
                <ExternalLink size={16} />
              </a>
            )}
          </figcaption>
        </figure>
      ) : (
        <EmptyState text="APOD indisponivel no momento." />
      )}

      <div className="neo-summary">
        <SummaryItem icon={Satellite} label="Mais proximo" value={formatDistanceKm(neows?.closest?.missDistanceKm)} />
        <SummaryItem icon={Activity} label="Maior estimado" value={formatValue(neows?.largest?.diameterM, " m")} />
        <SummaryItem icon={AlertTriangle} label="PHA" value={formatInteger(neows?.hazardousCount)} />
      </div>
    </section>
  );
}

function SummaryItem({ icon: Icon, label, value }) {
  return (
    <span className="summary-item">
      <Icon size={16} />
      <small>{label}</small>
      <strong>{value}</strong>
    </span>
  );
}

function WeatherChart({ weather }) {
  const data = weather?.hourly ?? [];

  return (
    <section className="panel chart-panel">
      <div className="panel-heading">
        <div>
          <p className="eyebrow">Proximas 24h</p>
          <h2>Temperatura e chuva</h2>
        </div>
        <Activity size={24} />
      </div>

      {data.length > 0 ? (
        <ResponsiveContainer width="100%" height={280}>
          <AreaChart data={data}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#d7dee8" />
            <XAxis dataKey="hour" tickLine={false} axisLine={false} fontSize={12} />
            <YAxis yAxisId="left" tickLine={false} axisLine={false} fontSize={12} width={32} />
            <YAxis yAxisId="right" orientation="right" tickLine={false} axisLine={false} fontSize={12} width={32} />
            <Tooltip />
            <Area
              yAxisId="left"
              type="monotone"
              dataKey="temperature"
              name="Temp. C"
              stroke="#0f766e"
              fill="#ccfbf1"
              strokeWidth={2}
            />
            <Area
              yAxisId="right"
              type="monotone"
              dataKey="rainProbability"
              name="Chuva %"
              stroke="#2563eb"
              fill="#dbeafe"
              strokeWidth={2}
            />
          </AreaChart>
        </ResponsiveContainer>
      ) : (
        <EmptyState text="Grafico aguardando dados horarios." />
      )}
    </section>
  );
}

function DailyForecast({ weather, cptec }) {
  const daily = weather?.daily ?? [];

  return (
    <section className="panel forecast-panel">
      <div className="panel-heading">
        <div>
          <p className="eyebrow">7 dias</p>
          <h2>Previsao consolidada</h2>
        </div>
        <CalendarDays size={24} />
      </div>

      {daily.length > 0 ? (
        <>
          <div className="forecast-list">
            {daily.map((day) => (
              <article className="forecast-day" key={day.date}>
                <div>
                  <strong>{formatWeekday(day.date)}</strong>
                  <span>{day.condition}</span>
                </div>
                <div className="forecast-values">
                  <span>{formatValue(day.max, "C")}</span>
                  <small>{formatValue(day.min, "C")}</small>
                </div>
                <div className="rain-bar" aria-label={`Chuva ${formatValue(day.rainProbability, "%")}`}>
                  <span style={{ width: `${Math.min(100, Number(day.rainProbability ?? 0))}%` }} />
                </div>
              </article>
            ))}
          </div>

          <div className="cptec-days">
            {(cptec?.days ?? []).slice(0, 4).map((day) => (
              <span key={day.date}>
                <strong>{formatShortDate(day.date)}</strong>
                {day.condition}
              </span>
            ))}
          </div>
        </>
      ) : (
        <EmptyState text="Previsao diaria indisponivel." />
      )}
    </section>
  );
}

function NearEarthPanel({ neows, cad }) {
  const neoItems = neows?.items ?? [];

  return (
    <section className="panel near-panel">
      <div className="panel-heading">
        <div>
          <p className="eyebrow">Asteroides e cometas</p>
          <h2>Aproximacoes da Terra</h2>
        </div>
        <Rocket size={24} />
      </div>

      <div className="approach-columns">
        <div>
          <h3>NeoWs</h3>
          <div className="event-list">
            {neoItems.length > 0 ? (
              neoItems.slice(0, 5).map((item) => <NeoRow key={item.id} item={item} />)
            ) : (
              <EmptyState text="NeoWs sem objetos no recorte atual." compact />
            )}
          </div>
        </div>

        <div>
          <h3>JPL CAD</h3>
          <div className="event-list">
            {cad.length > 0 ? (
              cad.slice(0, 5).map((item) => <CadRow key={`${item.designation}-${item.date}`} item={item} />)
            ) : (
              <EmptyState text="CAD sem aproximacoes no recorte atual." compact />
            )}
          </div>
        </div>
      </div>
    </section>
  );
}

function NeoRow({ item }) {
  return (
    <article className="event-row">
      <span className={`event-dot ${item.hazardous ? "danger" : ""}`} />
      <div>
        <strong>{item.name}</strong>
        <small>{item.approachDate}</small>
      </div>
      <div className="event-meta">
        <span>{formatDistanceKm(item.missDistanceKm)}</span>
        <small>{formatValue(item.velocityKmS, " km/s")}</small>
      </div>
    </article>
  );
}

function CadRow({ item }) {
  return (
    <article className="event-row">
      <span className="event-dot amber" />
      <div>
        <strong>{item.name}</strong>
        <small>{item.date}</small>
      </div>
      <div className="event-meta">
        <span>{formatValue(item.distanceAu, " au")}</span>
        <small>{formatValue(item.velocityKmS, " km/s")}</small>
      </div>
    </article>
  );
}

function FireballPanel({ fireballs }) {
  const chartData = fireballs.slice(0, 6).map((item, index) => ({
    name: `${index + 1}`,
    energia: item.impactEnergyKt ?? 0,
  }));

  return (
    <section className="panel fireball-panel">
      <div className="panel-heading">
        <div>
          <p className="eyebrow">Meteoros</p>
          <h2>Bolas de fogo recentes</h2>
        </div>
        <Flame size={24} />
      </div>

      {fireballs.length > 0 ? (
        <>
          <ResponsiveContainer width="100%" height={160}>
            <BarChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#d7dee8" />
              <XAxis dataKey="name" tickLine={false} axisLine={false} fontSize={12} />
              <YAxis tickLine={false} axisLine={false} fontSize={12} width={34} />
              <Tooltip />
              <Bar dataKey="energia" name="Impacto kt" fill="#f59e0b" radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>

          <div className="event-list">
            {fireballs.slice(0, 4).map((item) => (
              <article className="event-row" key={`${item.date}-${item.latitude}-${item.longitude}`}>
                <span className="event-dot rose" />
                <div>
                  <strong>{formatDateTime(item.date)}</strong>
                  <small>{formatCoordinates(item)}</small>
                </div>
                <div className="event-meta">
                  <span>{formatValue(item.impactEnergyKt, " kt")}</span>
                  <small>{formatValue(item.altitudeKm, " km alt.")}</small>
                </div>
              </article>
            ))}
          </div>
        </>
      ) : (
        <EmptyState text="Fireball API sem registros recentes no recorte atual." />
      )}
    </section>
  );
}

function MarsPanel({ photos }) {
  return (
    <section className="panel mars-panel">
      <div className="panel-heading">
        <div>
          <p className="eyebrow">Marte</p>
          <h2>Curiosity rover</h2>
        </div>
        <Rocket size={24} />
      </div>

      {photos.length > 0 ? (
        <div className="photo-grid">
          {photos.slice(0, 4).map((photo) => (
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
      ) : (
        <EmptyState text="Mars Rover Photos indisponivel no momento." />
      )}
    </section>
  );
}

function NasaLibraryPanel({ images, imageDraft, onDraftChange, onSubmit }) {
  return (
    <section className="panel library-panel">
      <div className="panel-heading">
        <div>
          <p className="eyebrow">NASA Image Library</p>
          <h2>Galeria pesquisavel</h2>
        </div>
        <ImageIcon size={24} />
      </div>

      <form className="library-search" onSubmit={onSubmit}>
        <Search size={18} />
        <input
          value={imageDraft}
          onChange={(event) => onDraftChange(event.target.value)}
          placeholder="Ex.: nebula, mars, earth"
          aria-label="Buscar imagens na NASA"
        />
        <button type="submit">Buscar</button>
      </form>

      {images.length > 0 ? (
        <div className="library-strip">
          {images.slice(0, 6).map((image) => (
            <figure className="media-tile compact" key={image.nasaId || image.imageUrl}>
              <img src={image.imageUrl} alt={image.title} loading="lazy" />
              <figcaption>
                <strong>{image.title}</strong>
                <span>{image.center || formatShortDate(image.date)}</span>
              </figcaption>
            </figure>
          ))}
        </div>
      ) : (
        <EmptyState text="Nenhuma imagem retornada para a busca atual." />
      )}
    </section>
  );
}

function SourcesPanel({ sources, fetchedAt }) {
  return (
    <section className="panel sources-panel">
      <div className="panel-heading">
        <div>
          <p className="eyebrow">Fontes</p>
          <h2>Integracoes ativas</h2>
        </div>
        <Database size={24} />
      </div>

      <div className="source-list">
        {sources.map((source) => (
          <article className="source-row" key={source.id}>
            <div>
              <strong>{source.label}</strong>
              <small>{source.detail}</small>
            </div>
            <span className={`source-status ${source.state}`}>{SOURCE_LABELS[source.state] ?? source.state}</span>
          </article>
        ))}
      </div>

      <footer className="panel-footer">
        <Globe2 size={16} />
        Ultima consulta {fetchedAt ? formatTime(fetchedAt) : "pendente"}
      </footer>
    </section>
  );
}

function EmptyState({ text, compact = false }) {
  return <div className={`empty-state ${compact ? "compact" : ""}`}>{text}</div>;
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

function formatWeekday(value) {
  if (!value) return "";
  const date = new Date(`${value}T12:00:00`);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString("pt-BR", { weekday: "short", day: "2-digit" });
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
