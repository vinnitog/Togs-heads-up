const rss2json = (rssUrl) => `https://api.rss2json.com/v1/api.json?rss_url=${encodeURIComponent(rssUrl)}`;

const G1_RSS_JSON_URL = rss2json("https://g1.globo.com/rss/g1/sp/bauru-marilia/");
const GIRO_MARILIA_RSS_JSON_URL = rss2json("https://www.giromarilia.com.br/feed/");
const GMC_ONLINE_RSS_JSON_URL = rss2json("https://www.gmconline.com.br/feed/");

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
    id: "giro-marilia",
    name: "Giro Marilia",
    cadence: "30 min",
    url: GIRO_MARILIA_RSS_JSON_URL,
    parser: "rss2json",
    detail: "Portal local de Marilia convertido para JSON, filtrado por ocorrencias de seguranca e transito.",
  },
  {
    id: "gmc-online",
    name: "GMC Online",
    cadence: "30 min",
    url: GMC_ONLINE_RSS_JSON_URL,
    parser: "rss2json",
    detail: "Jornal local de Marilia convertido para JSON, filtrado por ocorrencias de seguranca e transito.",
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
    access: "oficial",
    detail: "Feed JSON do Waze for Cities para alertas e ocorrencias de trafego.",
    accessNote: "Requer parceria Waze for Cities (feed privado por orgao). Indisponivel para uso pessoal sem convenio.",
  },
  {
    id: "artesp",
    name: "ARTESP CCM",
    cadence: "operacional",
    envKey: "VITE_ARTESP_API_URL",
    parser: "generic",
    access: "oficial",
    detail: "API/proxy de ocorrencias rodoviarias concedidas no estado de Sao Paulo.",
    accessNote: "Sem API publica em tempo real. Depende de acesso oficial ou proxy proprio.",
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
    access: "oficial",
    detail: "Indicadores agregados de seguranca publica quando houver endpoint configurado.",
    accessNote: "Dados agregados de acesso restrito. Sem endpoint publico por municipio em tempo real.",
  },
];
