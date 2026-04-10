import { NextResponse } from "next/server";

const OPENALEX_ENDPOINT = "https://api.openalex.org/works";

type OpenAlexWork = {
  id: string;
  title?: string;
  publication_year?: number;
  doi?: string;
  biblio?: {
    volume?: string;
    issue?: string;
    first_page?: string;
    last_page?: string;
  };
  primary_location?: {
    landing_page_url?: string;
    source?: {
      display_name?: string;
    };
  };
  authorships?: Array<{
    author?: {
      display_name?: string;
    };
  }>;
};

type EnrichedOpenAlexWork = OpenAlexWork & {
  matched_terms: string[];
  match_reason: string;
  section_signal?: string;
  evidence_hint?: string;
};

const STOPWORDS = new Set([
  "para",
  "como",
  "pela",
  "pelo",
  "entre",
  "sobre",
  "mais",
  "menos",
  "isso",
  "esta",
  "este",
  "essa",
  "esse",
  "tambem",
  "estudo",
  "estudos",
  "pesquisa",
  "pesquisas",
  "literatura",
  "dados",
  "mostra",
  "mostram",
  "mostrou",
  "indica",
  "indicam",
  "indicou",
  "aponta",
  "apontam",
  "evidencia",
  "evidencias",
  "porque",
  "quando",
  "durante",
  "assim",
  "ainda",
  "foram",
  "sendo",
  "pode",
  "podem",
  "com",
  "dos",
  "das",
  "uma",
  "que",
  "por",
  "de",
  "da",
  "do",
  "em",
  "no",
  "na",
  "nos",
  "nas",
  "aos",
  "a",
  "o",
  "as",
  "os",
  "um"
]);

function sanitizeText(value: unknown) {
  if (typeof value !== "string") {
    return "";
  }

  return value
    .replace(/[^\p{L}\p{N}\s\-_,.;:()]/gu, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 520);
}

function sanitizeTextList(value: unknown) {
  if (!Array.isArray(value)) {
    return [] as string[];
  }

  return value
    .map((item) => sanitizeText(item))
    .filter((item) => item.length > 0)
    .slice(0, 24);
}

function normalizeTerm(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function normalizeReferenceHint(value: string) {
  return normalizeTerm(value)
    .replace(/\b(?:doi|https?|www|et al|vol|n|pp|revista|journal)\b/g, " ")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function extractKeywords(claim: string, context: string) {
  const haystack = `${claim} ${claim} ${context}`.toLowerCase();
  const words = haystack.match(/[\p{L}\p{N}]{3,}/gu) ?? [];
  const counts = new Map<string, number>();

  words.forEach((word) => {
    const normalized = normalizeTerm(word);

    if (!STOPWORDS.has(normalized)) {
      counts.set(normalized, (counts.get(normalized) ?? 0) + 1);
    }
  });

  return Array.from(counts.entries())
    .sort((left, right) => right[1] - left[1])
    .slice(0, 8)
    .map(([word]) => word);
}

function buildSearchQuery(claim: string, keywords: string[]) {
  return keywords.length > 0 ? keywords.join(" ") : claim;
}

function buildSectionSignal(section: string) {
  const normalized = normalizeTerm(section);

  if (normalized.includes("introdu")) {
    return "introdução";
  }

  if (normalized.includes("metod")) {
    return "metodologia";
  }

  if (normalized.includes("result")) {
    return "resultados";
  }

  if (normalized.includes("discuss")) {
    return "discussão";
  }

  if (normalized.includes("resumo") || normalized.includes("abstract")) {
    return "resumo";
  }

  return "trecho geral";
}

async function fetchOpenAlexWorks(search: string) {
  const url = new URL(OPENALEX_ENDPOINT);
  url.searchParams.set("search", search);
  url.searchParams.set("per-page", "8");
  url.searchParams.set("filter", "type:article");
  url.searchParams.set("sort", "relevance_score:desc");
  url.searchParams.set("select", "id,title,publication_year,doi,biblio,primary_location,authorships");

  const response = await fetch(url, {
    headers: {
      Accept: "application/json"
    },
    cache: "no-store"
  });

  if (!response.ok) {
    throw new Error(`OpenAlex respondeu ${response.status}.`);
  }

  const payload = (await response.json()) as { results?: OpenAlexWork[] };
  return payload.results?.filter((work) => Boolean(work.title) && Boolean(work.authorships?.length)) ?? [];
}

function isWorkAlreadyUsed(work: OpenAlexWork, usedReferences: string[]) {
  if (usedReferences.length === 0) {
    return false;
  }

  const normalizedTitle = normalizeReferenceHint(work.title ?? "");
  const normalizedDoi = normalizeTerm(work.doi ?? "");

  return usedReferences.some((reference) => {
    const normalizedReference = normalizeReferenceHint(reference);

    if (normalizedDoi && normalizedReference.includes(normalizedDoi)) {
      return true;
    }

    if (normalizedTitle && normalizedTitle.length > 20 && normalizedReference.includes(normalizedTitle)) {
      return true;
    }

    return false;
  });
}

function inferEvidenceHint(sectionSignal: string) {
  if (sectionSignal === "metodologia") {
    return "Leia resumo e método para confirmar desenho do estudo e aderência analítica.";
  }

  if (sectionSignal === "resultados") {
    return "Confira se o paper traz achados, indicadores ou desfechos comparáveis ao trecho.";
  }

  if (sectionSignal === "discussão") {
    return "Use este paper se ele ajudar a interpretar achados, contrastar literatura ou discutir implicações.";
  }

  if (sectionSignal === "introdução") {
    return "Priorize se o paper ajuda a contextualizar o problema ou explicitar a lacuna da literatura.";
  }

  if (sectionSignal === "resumo") {
    return "Valide se o paper resume objetivo, método e achado compatíveis com o foco do manuscrito.";
  }

  return "Confirme aderência temática no resumo antes de citar este paper.";
}

function enrichWork(
  work: OpenAlexWork,
  keywords: string[],
  query: string,
  sectionSignal: string
): EnrichedOpenAlexWork {
  const searchable = normalizeTerm(
    `${work.title ?? ""} ${work.primary_location?.source?.display_name ?? ""}`
  );
  const matchedTerms = keywords.filter((keyword) => searchable.includes(keyword)).slice(0, 5);

  let matchReason = `Resultado OpenAlex para a busca contextual "${query}". Valide aderência antes de usar.`;

  if (matchedTerms.length > 1) {
    matchReason = `Sugerido para ${sectionSignal} porque cruza termos do trecho: ${matchedTerms.join(", ")}.`;
  } else if (matchedTerms.length === 1) {
    matchReason = `Sugerido para ${sectionSignal} por proximidade com "${matchedTerms[0]}".`;
  }

  return {
    ...work,
    matched_terms: matchedTerms,
    match_reason: matchReason,
    section_signal: sectionSignal,
    evidence_hint: inferEvidenceHint(sectionSignal)
  };
}

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as {
    claim?: unknown;
    context?: unknown;
    section?: unknown;
    sectionContext?: unknown;
    usedReferences?: unknown;
  } | null;

  const claim = sanitizeText(body?.claim);
  const context = sanitizeText(body?.context);
  const section = sanitizeText(body?.section);
  const sectionContext = sanitizeText(body?.sectionContext);
  const usedReferences = sanitizeTextList(body?.usedReferences);

  if (!claim) {
    return NextResponse.json({ works: [] }, { status: 400 });
  }

  const contextualText = [sectionContext, context].filter(Boolean).join(" ").trim();
  const keywords = extractKeywords(claim, contextualText);
  const sectionSignal = buildSectionSignal(section);
  let query = buildSearchQuery(claim, keywords);
  let rawWorks: OpenAlexWork[] = [];

  try {
    rawWorks = await fetchOpenAlexWorks(query);

    if (rawWorks.length === 0 && claim !== query) {
      query = claim;
      rawWorks = await fetchOpenAlexWorks(query);
    }

    if (rawWorks.length === 0 && contextualText) {
      query = `${claim} ${contextualText}`.slice(0, 260);
      rawWorks = await fetchOpenAlexWorks(query);
    }
  } catch (error) {
    return NextResponse.json(
      {
        works: [],
        message: error instanceof Error ? error.message : "Falha ao consultar OpenAlex."
      },
      { status: 502 }
    );
  }

  const works = rawWorks
    .filter((work) => !isWorkAlreadyUsed(work, usedReferences))
    .slice(0, 5)
    .map((work) => enrichWork(work, keywords, query, sectionSignal));

  return NextResponse.json({
    works,
    query,
    keywords,
    section: sectionSignal
  });
}
