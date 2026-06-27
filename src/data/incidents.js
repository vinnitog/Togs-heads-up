const rss2json = (rssUrl) => `https://api.rss2json.com/v1/api.json?rss_url=${encodeURIComponent(rssUrl)}`;

const G1_RSS_JSON_URL = rss2json("https://g1.globo.com/rss/g1/sp/bauru-marilia/");
const GIRO_MARILIA_RSS_JSON_URL = rss2json("https://www.giromarilia.com.br/feed/");
const GMC_ONLINE_RSS_JSON_URL = rss2json("https://www.gmconline.com.br/feed/");

export const INCIDENT_API_SOURCES = [
  {
    id: "g1-bauru-marilia",
    name: "G1 Bauru e Marília",
    cadence: "30 min",
    url: G1_RSS_JSON_URL,
    parser: "rss2json",
    detail: "Feed regional real do G1 convertido para JSON, filtrado por ocorrências em Marília.",
  },
  {
    id: "giro-marilia",
    name: "Giro Marília",
    cadence: "30 min",
    url: GIRO_MARILIA_RSS_JSON_URL,
    parser: "rss2json",
    detail: "Portal local de Marília convertido para JSON, filtrado por ocorrências de segurança e trânsito.",
  },
  {
    id: "gmc-online",
    name: "GMC Online",
    cadence: "30 min",
    url: GMC_ONLINE_RSS_JSON_URL,
    parser: "rss2json",
    detail: "Jornal local de Marília convertido para JSON, filtrado por ocorrências de segurança e trânsito.",
  },
  {
    id: "inmet-alertas",
    name: "INMET Avisos Meteorológicos",
    cadence: "operacional",
    url: "https://apiprevmet3.inmet.gov.br/avisos/ativos",
    parser: "inmet",
    detail: "Avisos meteorológicos oficiais ativos filtrados pelo geocódigo de Marília.",
  },
  {
    id: "alerts",
    name: "API de alertas",
    cadence: "tempo real",
    envKey: "VITE_INCIDENTS_API_URL",
    parser: "generic",
    detail: "Endpoint JSON próprio ou proxy operacional com alertas normalizados.",
  },
  {
    id: "infosiga",
    name: "INFOSIGA DETRAN-SP",
    cadence: "histórico",
    envKey: "VITE_INFOSIGA_API_URL",
    parser: "generic",
    detail: "Base histórica pública de sinistros de trânsito por município.",
  },
];
