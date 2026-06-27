const G1_BAURU_MARILIA_RSS_URL = "https://g1.globo.com/rss/g1/sp/bauru-marilia/";
const G1_RSS_JSON_URL = `https://api.rss2json.com/v1/api.json?rss_url=${encodeURIComponent(G1_BAURU_MARILIA_RSS_URL)}`;

export const INCIDENT_API_SOURCES = [
  {
    id: "g1-bauru-marilia",
    name: "G1 Bauru e Marilia",
    cadence: "30 min",
    url: G1_RSS_JSON_URL,
    parser: "rss2json",
    detail: "Feed regional real do G1 convertido para JSON, filtrado por ocorrencias em Marilia.",
  },
  {
    id: "inmet-alertas",
    name: "INMET Avisos Meteorologicos",
    cadence: "operacional",
    url: "https://apiprevmet3.inmet.gov.br/avisos/ativos",
    parser: "inmet",
    detail: "Avisos meteorologicos oficiais ativos filtrados pelo geocode de Marilia.",
  },
  {
    id: "alerts",
    name: "API de alertas",
    cadence: "tempo real",
    envKey: "VITE_INCIDENTS_API_URL",
    parser: "generic",
    detail: "Endpoint JSON proprio ou proxy operacional com alertas normalizados.",
  },
  {
    id: "waze",
    name: "Waze Partner Feed",
    cadence: "2 min",
    envKey: "VITE_WAZE_FEED_URL",
    parser: "waze",
    detail: "Feed JSON do Waze for Cities para alertas e ocorrencias de trafego.",
  },
  {
    id: "artesp",
    name: "ARTESP CCM",
    cadence: "operacional",
    envKey: "VITE_ARTESP_API_URL",
    parser: "generic",
    detail: "API/proxy de ocorrencias rodoviarias concedidas no estado de Sao Paulo.",
  },
  {
    id: "infosiga",
    name: "INFOSIGA DETRAN-SP",
    cadence: "historico",
    envKey: "VITE_INFOSIGA_API_URL",
    parser: "generic",
    detail: "Base historica publica de sinistros de transito por municipio.",
  },
  {
    id: "sinesp",
    name: "SINESP",
    cadence: "historico",
    envKey: "VITE_SINESP_API_URL",
    parser: "generic",
    detail: "Indicadores agregados de seguranca publica quando houver endpoint configurado.",
  },
];
