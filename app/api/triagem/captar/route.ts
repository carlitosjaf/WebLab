import { NextResponse } from "next/server";

const OPENALEX_ENDPOINT = "https://api.openalex.org/works";

type OpenAlexAuthor = {
  author?: {
    display_name?: string;
  };
};

type OpenAlexWork = {
  id: string;
  title?: string;
  publication_year?: number;
  doi?: string;
  abstract_inverted_index?: Record<string, number[]>;
  primary_location?: {
    landing_page_url?: string;
    source?: {
      display_name?: string;
    };
  };
  authorships?: OpenAlexAuthor[];
};

function sanitizeQuery(value: unknown) {
  if (typeof value !== "string") {
    return "";
  }

  return value
    .replace(/[^\p{L}\p{N}\s\-_,.;:()]/gu, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 420);
}

function rebuildAbstract(index?: Record<string, number[]>) {
  if (!index) {
    return "";
  }

  const words: Array<{ word: string; position: number }> = [];

  Object.entries(index).forEach(([word, positions]) => {
    positions.forEach((position) => {
      words.push({ word, position });
    });
  });

  return words
    .sort((left, right) => left.position - right.position)
    .map((item) => item.word)
    .join(" ")
    .slice(0, 1800);
}

function normalizeWork(work: OpenAlexWork) {
  const doi = work.doi?.replace(/^https:\/\/doi\.org\//i, "") ?? null;

  return {
    external_id: work.id,
    source: "OpenAlex",
    titulo: work.title ?? "Título não informado",
    autores: work.authorships?.map((item) => item.author?.display_name).filter(Boolean).slice(0, 12) ?? [],
    ano: work.publication_year ?? null,
    doi,
    periodico: work.primary_location?.source?.display_name ?? null,
    resumo: rebuildAbstract(work.abstract_inverted_index) || null,
    url: work.primary_location?.landing_page_url ?? work.doi ?? work.id
  };
}

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as {
    query?: unknown;
    yearFrom?: unknown;
    yearTo?: unknown;
  } | null;

  const query = sanitizeQuery(body?.query);

  if (!query) {
    return NextResponse.json({ studies: [], message: "Informe uma busca para captar estudos." }, { status: 400 });
  }

  const yearFrom = typeof body?.yearFrom === "number" ? body.yearFrom : null;
  const yearTo = typeof body?.yearTo === "number" ? body.yearTo : null;
  const filters = ["type:article"];

  if (yearFrom || yearTo) {
    const from = yearFrom ?? 1900;
    const to = yearTo ?? new Date().getFullYear();
    filters.push(`from_publication_date:${from}-01-01`);
    filters.push(`to_publication_date:${to}-12-31`);
  }

  const url = new URL(OPENALEX_ENDPOINT);
  url.searchParams.set("search", query);
  url.searchParams.set("per-page", "25");
  url.searchParams.set("filter", filters.join(","));
  url.searchParams.set("sort", "relevance_score:desc");
  url.searchParams.set(
    "select",
    "id,title,publication_year,doi,abstract_inverted_index,primary_location,authorships"
  );

  const response = await fetch(url, {
    headers: {
      Accept: "application/json"
    },
    cache: "no-store"
  });

  if (!response.ok) {
    return NextResponse.json(
      {
        studies: [],
        message: `OpenAlex respondeu ${response.status}.`
      },
      { status: 502 }
    );
  }

  const payload = (await response.json()) as { results?: OpenAlexWork[] };
  const studies = payload.results?.filter((work) => Boolean(work.title)).map(normalizeWork) ?? [];

  return NextResponse.json({
    studies,
    source: "OpenAlex",
    query
  });
}
