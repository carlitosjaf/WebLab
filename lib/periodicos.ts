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
