import { NextResponse } from "next/server";

import type { IndexerName } from "@/lib/periodicos";

const OPENALEX_ENDPOINT = "https://api.openalex.org/works";
const SCOPUS_ENDPOINT = "https://api.elsevier.com/content/search/scopus";
const DEFAULT_WOS_ENDPOINT = "https://wos-api.clarivate.com/api/wos";

type SourceStatus = {
  source: "OpenAlex" | "Scopus" | "Web of Science";
  status: "active" | "missing_key" | "error";
  message: string;
};

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
      id: string;
      display_name: string;
      host_organization_name?: string;
      is_oa?: boolean;
      summary_stats?: {
        h_index?: number;
      };
    };
  };
  authorships?: Array<{
    author?: {
      display_name?: string;
    };
  }>;
};

type LicensedJournal = {
  id: string;
  title: string;
  hostName: string | null;
  landingPageUrl: string | null;
  isOpenAccess: boolean;
  matchCount: number;
  detectedIndexers: IndexerName[];
};

type RadarResponse = {
  works: OpenAlexWork[];
  licensedJournals: LicensedJournal[];
  sourceStatus: SourceStatus[];
};

type ScopusEntry = Record<string, unknown>;
type WosRecord = Record<string, unknown>;

function sanitizeQuery(value: unknown) {
  if (typeof value !== "string") {
    return "";
  }

  return value.replace(/[^\p{L}\p{N}\s\-_,.;:()]/gu, " ").replace(/\s+/g, " ").trim().slice(0, 240);
}

function normalizeTitle(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 90);
}

function readString(record: Record<string, unknown>, key: string) {
  const value = record[key];
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function readScopusLink(entry: ScopusEntry) {
  const links = entry.link;
  if (!Array.isArray(links)) {
    return null;
  }

  const preferred = links.find((link) => {
    return (
      link &&
      typeof link === "object" &&
      (link as Record<string, unknown>)["@ref"] === "scopus"
    );
  });
  const fallback = preferred ?? links[0];

  if (!fallback || typeof fallback !== "object") {
    return null;
  }

  const href = (fallback as Record<string, unknown>)["@href"];
  return typeof href === "string" ? href : null;
}

function getWosSourceTitle(record: WosRecord) {
  const staticData = record.static_data;
  if (!staticData || typeof staticData !== "object") {
    return null;
  }

  const summary = (staticData as Record<string, unknown>).summary;
  if (!summary || typeof summary !== "object") {
    return null;
  }

  const titles = (summary as Record<string, unknown>).titles;
  if (!titles || typeof titles !== "object") {
    return null;
  }

  const title = (titles as Record<string, unknown>).title;
  const titleArray = Array.isArray(title) ? title : title ? [title] : [];

  for (const item of titleArray) {
    if (!item || typeof item !== "object") {
      continue;
    }

    const itemRecord = item as Record<string, unknown>;
    const type = itemRecord.type ?? itemRecord["@type"];
    const content = itemRecord.content ?? itemRecord._ ?? itemRecord.value;

    if (type === "source" && typeof content === "string" && content.trim()) {
      return content.trim();
    }
  }

  return null;
}

function collectWosRecords(payload: unknown): WosRecord[] {
  if (!payload || typeof payload !== "object") {
    return [];
  }

  const root = payload as Record<string, unknown>;
  const data = root.Data;
  const records = data && typeof data === "object" ? (data as Record<string, unknown>).Records : root.Records;
  const recordsObject = records && typeof records === "object" ? (records as Record<string, unknown>).records : null;
  const rec = recordsObject && typeof recordsObject === "object" ? (recordsObject as Record<string, unknown>).REC : root.REC;

  if (Array.isArray(rec)) {
    return rec.filter((item): item is WosRecord => Boolean(item) && typeof item === "object");
  }

  if (rec && typeof rec === "object") {
    return [rec as WosRecord];
  }

  return [];
}

async function fetchOpenAlex(query: string): Promise<{ works: OpenAlexWork[]; status: SourceStatus }> {
  const url = new URL(OPENALEX_ENDPOINT);
  url.searchParams.set("search", query);
  url.searchParams.set("per-page", "40");
  url.searchParams.set("select", "id,title,publication_year,doi,biblio,primary_location,authorships");

  const response = await fetch(url, {
    headers: {
      Accept: "application/json"
    },
    cache: "no-store"
  });

  if (!response.ok) {
    return {
      works: [],
      status: {
        source: "OpenAlex",
        status: "error",
        message: `OpenAlex respondeu ${response.status}.`
      }
    };
  }

  const payload = (await response.json()) as { results?: OpenAlexWork[] };
  return {
    works: payload.results ?? [],
    status: {
      source: "OpenAlex",
      status: "active",
      message: "Busca aberta ativa."
    }
  };
}

async function fetchScopus(query: string): Promise<{ journals: LicensedJournal[]; status: SourceStatus }> {
  const apiKey = process.env.ELSEVIER_API_KEY;

  if (!apiKey) {
    return {
      journals: [],
      status: {
        source: "Scopus",
        status: "missing_key",
        message: "Configure ELSEVIER_API_KEY para ativar a verificação licenciada."
      }
    };
  }

  const url = new URL(SCOPUS_ENDPOINT);
  url.searchParams.set("query", `TITLE-ABS-KEY(${query})`);
  url.searchParams.set("count", "25");

  const response = await fetch(url, {
    headers: {
      Accept: "application/json",
      "X-ELS-APIKey": apiKey
    },
    cache: "no-store"
  });

  if (!response.ok) {
    return {
      journals: [],
      status: {
        source: "Scopus",
        status: "error",
        message: `Scopus respondeu ${response.status}. Verifique a chave e o acesso institucional.`
      }
    };
  }

  const payload = (await response.json()) as {
    "search-results"?: {
      entry?: ScopusEntry[];
    };
  };

  const journals = new Map<string, LicensedJournal>();
  const entries = payload["search-results"]?.entry ?? [];

  entries.forEach((entry) => {
    const title = readString(entry, "prism:publicationName");
    if (!title) {
      return;
    }

    const id = `scopus:${normalizeTitle(title)}`;
    const current = journals.get(id);

    if (current) {
      current.matchCount += 1;
      return;
    }

    journals.set(id, {
      id,
      title,
      hostName: "Scopus / Elsevier",
      landingPageUrl: readScopusLink(entry),
      isOpenAccess: readString(entry, "openaccess") === "1",
      matchCount: 1,
      detectedIndexers: ["Scopus"]
    });
  });

  return {
    journals: Array.from(journals.values()),
    status: {
      source: "Scopus",
      status: "active",
      message: `${journals.size} periódico(s) detectados via Scopus.`
    }
  };
}

async function fetchWebOfScience(query: string): Promise<{ journals: LicensedJournal[]; status: SourceStatus }> {
  const apiKey = process.env.CLARIVATE_API_KEY;

  if (!apiKey) {
    return {
      journals: [],
      status: {
        source: "Web of Science",
        status: "missing_key",
        message: "Configure CLARIVATE_API_KEY para ativar a verificação WoS."
      }
    };
  }

  const endpoint = process.env.CLARIVATE_WOS_API_URL || DEFAULT_WOS_ENDPOINT;
  const url = new URL(endpoint);
  url.searchParams.set("databaseId", "WOS");
  url.searchParams.set("usrQuery", `TS=(${query})`);
  url.searchParams.set("count", "25");
  url.searchParams.set("firstRecord", "1");

  const response = await fetch(url, {
    headers: {
      Accept: "application/json",
      "X-ApiKey": apiKey
    },
    cache: "no-store"
  });

  if (!response.ok) {
    return {
      journals: [],
      status: {
        source: "Web of Science",
        status: "error",
        message: `Web of Science respondeu ${response.status}. Verifique endpoint, chave e licença.`
      }
    };
  }

  const payload = await response.json();
  const journals = new Map<string, LicensedJournal>();

  collectWosRecords(payload).forEach((record) => {
    const title = getWosSourceTitle(record);
    if (!title) {
      return;
    }

    const id = `wos:${normalizeTitle(title)}`;
    const current = journals.get(id);

    if (current) {
      current.matchCount += 1;
      return;
    }

    journals.set(id, {
      id,
      title,
      hostName: "Web of Science / Clarivate",
      landingPageUrl: null,
      isOpenAccess: false,
      matchCount: 1,
      detectedIndexers: ["Web of Science"]
    });
  });

  return {
    journals: Array.from(journals.values()),
    status: {
      source: "Web of Science",
      status: "active",
      message: `${journals.size} periódico(s) detectados via Web of Science.`
    }
  };
}

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as { query?: unknown } | null;
  const query = sanitizeQuery(body?.query);

  if (!query) {
    return NextResponse.json(
      {
        works: [],
        licensedJournals: [],
        sourceStatus: [
          {
            source: "OpenAlex",
            status: "error",
            message: "Informe um termo de busca válido."
          }
        ]
      } satisfies RadarResponse,
      { status: 400 }
    );
  }

  const [openAlexResult, scopusResult, webOfScienceResult] = await Promise.allSettled([
    fetchOpenAlex(query),
    fetchScopus(query),
    fetchWebOfScience(query)
  ]);

  const openAlex =
    openAlexResult.status === "fulfilled"
      ? openAlexResult.value
      : {
          works: [],
          status: {
            source: "OpenAlex",
            status: "error",
            message: "OpenAlex não respondeu agora."
          } satisfies SourceStatus
        };
  const scopus =
    scopusResult.status === "fulfilled"
      ? scopusResult.value
      : {
          journals: [],
          status: {
            source: "Scopus",
            status: "error",
            message: "Scopus não respondeu agora."
          } satisfies SourceStatus
        };
  const webOfScience =
    webOfScienceResult.status === "fulfilled"
      ? webOfScienceResult.value
      : {
          journals: [],
          status: {
            source: "Web of Science",
            status: "error",
            message: "Web of Science não respondeu agora."
          } satisfies SourceStatus
        };

  return NextResponse.json({
    works: openAlex.works,
    licensedJournals: [...scopus.journals, ...webOfScience.journals],
    sourceStatus: [openAlex.status, scopus.status, webOfScience.status]
  } satisfies RadarResponse);
}
