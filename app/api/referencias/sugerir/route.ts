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

function buildSearchQuery(claim: string, context: string) {
  const stopwords = new Set([
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
    "das",
    "que",
    "por",
    "de",
    "da",
    "do",
    "em",
    "no",
    "na"
  ]);

  const haystack = `${claim} ${context}`.toLowerCase();
  const words = haystack.match(/[\p{L}\p{N}]{4,}/gu) ?? [];
  const counts = new Map<string, number>();

  words.forEach((word) => {
    const normalized = word
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase();

    if (!stopwords.has(normalized)) {
      counts.set(normalized, (counts.get(normalized) ?? 0) + 1);
    }
  });

  const keywords = Array.from(counts.entries())
    .sort((left, right) => right[1] - left[1])
    .slice(0, 6)
    .map(([word]) => word);

  return keywords.length > 0 ? keywords.join(" ") : claim;
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

  const url = new URL(OPENALEX_ENDPOINT);
  url.searchParams.set("search", buildSearchQuery(claim, context));
  url.searchParams.set("per-page", "6");
  url.searchParams.set("filter", "type:article");
  url.searchParams.set("sort", "relevance_score:desc");

  const response = await fetch(url, {
    headers: {
      Accept: "application/json"
    },
    next: { revalidate: 60 * 60 }
  });

  if (!response.ok) {
    return NextResponse.json(
      {
        works: [],
        message: `OpenAlex respondeu ${response.status}.`
      },
      { status: 502 }
    );
  }

  const payload = (await response.json()) as { results?: OpenAlexWork[] };
  const works =
    payload.results?.filter((work) => Boolean(work.title) && Boolean(work.authorships?.length)).slice(0, 5) ?? [];

  return NextResponse.json({ works });
}
