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
  "intensificou",
  "intensificam",
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

function normalizeTerm(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
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
    .slice(0, 7)
    .map(([word]) => word);
}

function buildSearchQuery(claim: string, keywords: string[]) {
  return keywords.length > 0 ? keywords.join(" ") : claim;
}

async function fetchOpenAlexWorks(search: string) {
  const url = new URL(OPENALEX_ENDPOINT);
  url.searchParams.set("search", search);
  url.searchParams.set("per-page", "6");
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
  return payload.results?.filter((work) => Boolean(work.title) && Boolean(work.authorships?.length)).slice(0, 5) ?? [];
}

function enrichWork(work: OpenAlexWork, keywords: string[], query: string): EnrichedOpenAlexWork {
  const searchable = normalizeTerm(
    `${work.title ?? ""} ${work.primary_location?.source?.display_name ?? ""}`
  );
  const matchedTerms = keywords.filter((keyword) => searchable.includes(keyword)).slice(0, 5);
  const matchReason =
    matchedTerms.length > 1
      ? `Sugerido porque o resultado cruza termos do trecho: ${matchedTerms.join(", ")}.`
      : matchedTerms.length === 1
        ? `Sugerido por proximidade com "${matchedTerms[0]}"; confira resumo e método antes de citar.`
        : `Resultado OpenAlex para a busca contextual "${query}". Valide aderência antes de usar.`;

  return {
    ...work,
    matched_terms: matchedTerms,
    match_reason: matchReason
  };
}

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as {
    claim?: unknown;
    context?: unknown;
  } | null;

  const claim = sanitizeText(body?.claim);
  const context = sanitizeText(body?.context);

  if (!claim) {
    return NextResponse.json({ works: [] }, { status: 400 });
  }

  const keywords = extractKeywords(claim, context);
  let query = buildSearchQuery(claim, keywords);
  let rawWorks: OpenAlexWork[] = [];

  try {
    rawWorks = await fetchOpenAlexWorks(query);

    if (rawWorks.length === 0 && claim !== query) {
      query = claim;
      rawWorks = await fetchOpenAlexWorks(query);
    }

    if (rawWorks.length === 0 && context) {
      query = `${claim} ${context}`.slice(0, 260);
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

  const works = rawWorks.map((work) => enrichWork(work, keywords, query));

  return NextResponse.json({ works, query, keywords });
}
