import type { ArticleContent, RecommendationLevel } from "@/lib/types";

export const INDEXER_OPTIONS = [
  "Scopus",
  "Web of Science",
  "Portal CAPES",
  "SciELO",
  "Educ@",
  "ERIC",
  "Redalyc",
  "Latindex",
  "DOAJ",
  "Google Scholar",
  "Diadorim",
  "AURA"
] as const;

export type IndexerName = (typeof INDEXER_OPTIONS)[number];

export type IndexerSearchLink = {
  indexer: IndexerName;
  href: string;
  label: string;
};

export type IndexerAccessModel = "api_publica" | "linkout_catalogo" | "licenca_institucional";

export type IndexerStrategy = {
  indexer: IndexerName;
  accessModel: IndexerAccessModel;
  priority: "alta" | "media";
  note: string;
};

export const INDEXER_STRATEGY: IndexerStrategy[] = [
  {
    indexer: "DOAJ",
    accessModel: "api_publica",
    priority: "alta",
    note: "Boa fonte para confirmar acesso aberto e metadados de periódicos."
  },
  {
    indexer: "SciELO",
    accessModel: "api_publica",
    priority: "alta",
    note: "Prioritária para periódicos latino-americanos e produção em saúde pública."
  },
  {
    indexer: "ERIC",
    accessModel: "linkout_catalogo",
    priority: "media",
    note: "Útil quando o manuscrito cruza educação, ensino e formação em saúde."
  },
  {
    indexer: "Latindex",
    accessModel: "linkout_catalogo",
    priority: "media",
    note: "Boa camada de conferência editorial para periódicos ibero-americanos."
  },
  {
    indexer: "Diadorim",
    accessModel: "linkout_catalogo",
    priority: "media",
    note: "Ajuda a verificar políticas editoriais e acesso aberto no contexto brasileiro."
  },
  {
    indexer: "Scopus",
    accessModel: "licenca_institucional",
    priority: "alta",
    note: "Integração completa depende de acesso institucional/API Elsevier."
  },
  {
    indexer: "Web of Science",
    accessModel: "licenca_institucional",
    priority: "alta",
    note: "Integração completa depende de licença paga/API Clarivate."
  },
  {
    indexer: "Portal CAPES",
    accessModel: "linkout_catalogo",
    priority: "alta",
    note: "Essencial como verificação de acesso e disponibilidade institucional."
  }
];

type OpenAlexSourceLike = {
  display_name?: string;
  host_organization_name?: string;
  is_oa?: boolean;
  summary_stats?: {
    h_index?: number;
  };
};

export function buildKeywordQuery(query: string, articleContent?: string) {
  const stopwords = [
    " de ",
    " da ",
    " do ",
    " na ",
    " no ",
    " para ",
    " em ",
    " com ",
    " os ",
    " as ",
    " a ",
    " o ",
    " e ",
    " dos ",
    " das ",
    " um ",
    " uma ",
    " que "
  ];

  const fullText = ` ${query.toLowerCase()} ${articleContent ? articleContent.toLowerCase() : ""} `;
  let cleanQuery = fullText;

  stopwords.forEach((stopword) => {
    cleanQuery = cleanQuery.split(stopword).join(" ");
  });

  const wordsArray = cleanQuery.match(/[a-zA-ZÀ-ÿ]{4,}/g) || [];
  const wordCounts: Record<string, number> = {};

  wordsArray.forEach((word) => {
    wordCounts[word] = (wordCounts[word] || 0) + 1;
  });

  const mainKeywords = Object.entries(wordCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 4)
    .map(([word]) => word);

  return mainKeywords.length > 0 ? mainKeywords.slice(0, 3).join(" ") : query;
}

export function inferIndexerSignals(source: OpenAlexSourceLike): IndexerName[] {
  const haystack = `${source.display_name ?? ""} ${source.host_organization_name ?? ""}`.toLowerCase();
  const detected = new Set<IndexerName>();

  if (haystack.includes("scielo")) detected.add("SciELO");
  if (haystack.includes("eric")) detected.add("ERIC");
  if (haystack.includes("redalyc")) detected.add("Redalyc");
  if (haystack.includes("latindex")) detected.add("Latindex");
  if (haystack.includes("diadorim")) detected.add("Diadorim");
  if (haystack.includes("educ")) detected.add("Educ@");
  if (haystack.includes("capes")) detected.add("Portal CAPES");
  if (haystack.includes("aura")) detected.add("AURA");
  if (source.is_oa) detected.add("DOAJ");

  if (source.summary_stats?.h_index && source.summary_stats.h_index >= 15) {
    detected.add("Google Scholar");
  }

  return Array.from(detected);
}

export function buildIndexerSearchLinks(journalTitle: string, indexers: IndexerName[]): IndexerSearchLink[] {
  const query = encodeURIComponent(journalTitle);
  const normalized = encodeURIComponent(`"${journalTitle}"`);

  const links: Record<IndexerName, string> = {
    Scopus: `https://www.scopus.com/sources.uri`,
    "Web of Science": `https://mjl.clarivate.com/search-results?issn=&hide_exact_match_fl=true&utm_source=mjl&utm_medium=share-by-link&utm_campaign=search-results-share-this-journal`,
    "Portal CAPES": `https://www.periodicos.capes.gov.br/index.php/acervo/buscador.html?q=${query}`,
    SciELO: `https://search.scielo.org/?q=${query}&lang=pt`,
    "Educ@": `https://www.fcc.org.br/fcc/educ/?s=${query}`,
    ERIC: `https://eric.ed.gov/?q=${query}`,
    Redalyc: `https://www.redalyc.org/busquedaArticuloFiltros.oa?q=${query}`,
    Latindex: `https://www.latindex.org/latindex/bAvanzada`,
    DOAJ: `https://doaj.org/search/journals?source=%7B%22query%22%3A%7B%22query_string%22%3A%7B%22query%22%3A${normalized}%2C%22default_operator%22%3A%22AND%22%7D%7D%7D`,
    "Google Scholar": `https://scholar.google.com/scholar?q=${query}`,
    Diadorim: `https://diadorim.ibict.br/vufind/Search/Results?lookfor=${query}&type=AllFields`,
    AURA: "https://aura.amelica.org/"
  };

  return indexers.map((indexer) => ({
    indexer,
    href: links[indexer],
    label: `Verificar em ${indexer}`
  }));
}

export function formatIndexerEvidence(indexer: IndexerName, detectedIndexers: IndexerName[]) {
  if (detectedIndexers.includes(indexer)) {
    return "Sinal detectado";
  }

  return "Validar manualmente";
}

export function extractPlainText(content: ArticleContent | null) {
  if (!content?.content?.length) {
    return "";
  }

  return collectText(content.content);
}

function collectText(nodes: Array<Record<string, unknown>>): string {
  return nodes
    .map((node) => {
      const record = node as {
        text?: string;
        content?: Array<Record<string, unknown>>;
      };

      const current = record.text ?? "";
      const nested = record.content?.length ? collectText(record.content) : "";
      return `${current} ${nested}`.trim();
    })
    .join(" ")
    .trim();
}

export function getIndexerCoverageSummary(
  detected: IndexerName[],
  selected: IndexerName[]
) {
  if (selected.length === 0) {
    return {
      matched: detected,
      missing: []
    };
  }

  return {
    matched: selected.filter((item) => detected.includes(item)),
    missing: selected.filter((item) => !detected.includes(item))
  };
}

export function calculateEditorialScore(input: {
  matchedSelectedIndexers: number;
  detectedIndexers: number;
  matchCount: number;
  hIndex?: number;
  isOpenAccess?: boolean;
}) {
  const hIndexContribution = Math.min(input.hIndex ?? 0, 60) * 0.35;
  const oaContribution = input.isOpenAccess ? 4 : 0;

  return Number(
    (
      input.matchedSelectedIndexers * 18 +
      input.detectedIndexers * 3 +
      input.matchCount * 1.5 +
      hIndexContribution +
      oaContribution
    ).toFixed(1)
  );
}

export function inferRecommendationLevel(score: number, matchedSelectedIndexers: number): RecommendationLevel {
  if (matchedSelectedIndexers >= 3 || score >= 58) {
    return "candidata_forte";
  }

  if (matchedSelectedIndexers >= 1 || score >= 30) {
    return "candidata_moderada";
  }

  return "precisa_validar";
}

export function formatRecommendationLevel(level: RecommendationLevel) {
  switch (level) {
    case "candidata_forte":
      return "Candidata forte";
    case "candidata_moderada":
      return "Candidata moderada";
    default:
      return "Precisa validar";
  }
}
