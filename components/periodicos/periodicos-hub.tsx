"use client";

import Link from "next/link";
import type { Route } from "next";
import { useEffect, useMemo, useState } from "react";

import { getArticleEditorHref, getManuscriptPanelHref } from "@/lib/article-intelligence";
import {
  INDEXER_OPTIONS,
  INDEXER_STRATEGY,
  buildIndexerSearchLinks,
  buildKeywordQuery,
  calculateEditorialScore,
  extractPlainText,
  formatIndexerEvidence,
  formatRecommendationLevel,
  getIndexerCoverageSummary,
  inferIndexerSignals,
  inferRecommendationLevel,
  type IndexerName
} from "@/lib/periodicos";
import { getSupabaseClient } from "@/lib/supabaseClient";
import type {
  ArticleContent,
  ArticleRow,
  Database,
  RecommendationLevel
} from "@/lib/types";
import { formatAbntCitation, formatRelativeUpdate } from "@/lib/weblab";

type SavedShortlist = Database["public"]["Tables"]["periodicos_shortlists"]["Row"];
type ShortlistUpdate = Database["public"]["Tables"]["periodicos_shortlists"]["Update"];
type ShortlistChecklistKey =
  | "escopo_conferido"
  | "indexadores_confirmados"
  | "taxas_conferidas"
  | "diretrizes_conferidas"
  | "acesso_aberto_conferido"
  | "template_conferido";

type OpenAlexSource = {
  id: string;
  display_name: string;
  host_organization_name?: string;
  is_oa?: boolean;
  summary_stats?: {
    h_index?: number;
  };
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
    source?: OpenAlexSource;
  };
  authorships?: Array<{
    author?: {
      display_name?: string;
    };
  }>;
};

type JournalCandidate = {
  id: string;
  title: string;
  hostName: string | null;
  landingPageUrl: string | null;
  isOpenAccess: boolean;
  hIndex?: number;
  matchCount: number;
  detectedIndexers: IndexerName[];
  matchedSelectedIndexers: IndexerName[];
  editorialScore: number;
  recommendationLevel: RecommendationLevel;
};

type LicensedJournalCandidate = {
  id: string;
  title: string;
  hostName: string | null;
  landingPageUrl: string | null;
  isOpenAccess: boolean;
  matchCount: number;
  detectedIndexers: IndexerName[];
};

type RadarSourceStatus = {
  source: "OpenAlex" | "Scopus" | "Web of Science";
  status: "active" | "missing_key" | "error";
  message: string;
};

type RadarApiResponse = {
  works: OpenAlexWork[];
  licensedJournals: LicensedJournalCandidate[];
  sourceStatus: RadarSourceStatus[];
};

type JournalComparisonEntry = {
  id: string;
  title: string;
  hostName: string | null;
  recommendationLevel: RecommendationLevel;
  editorialScore: number;
  isChosen: boolean;
  matchedIndexers: IndexerName[];
  detectedIndexers: IndexerName[];
  isOpenAccess: boolean;
  matchCount: number;
  hIndex?: number;
  readinessPercent?: number;
  readinessLabel?: string;
  notes?: string | null;
  sourceUrl: string | null;
};

type PeriodicosHubProps = {
  articles: ArticleRow[];
};

const EMPTY_DOC: ArticleContent = {
  type: "doc",
  content: []
};

const DEFAULT_INDEXERS = [
  "Scopus",
  "Web of Science",
  "SciELO",
  "DOAJ",
  "Portal CAPES"
] as const satisfies readonly IndexerName[];

const SHORTLIST_CHECKLIST: Array<{ key: ShortlistChecklistKey; label: string }> = [
  { key: "escopo_conferido", label: "Escopo conferido" },
  { key: "indexadores_confirmados", label: "Indexadores confirmados" },
  { key: "taxas_conferidas", label: "Taxas/APC conferidas" },
  { key: "diretrizes_conferidas", label: "Diretrizes abertas" },
  { key: "acesso_aberto_conferido", label: "Acesso aberto/política conferidos" },
  { key: "template_conferido", label: "Template ou normas baixadas" }
];

function getChecklistProgress(entry: SavedShortlist) {
  const completed = SHORTLIST_CHECKLIST.filter((item) => Boolean(entry[item.key])).length;
  return {
    completed,
    total: SHORTLIST_CHECKLIST.length
  };
}

function getSubmissionReadiness(entry: SavedShortlist) {
  const progress = getChecklistProgress(entry);
  const percent = Math.round((progress.completed / progress.total) * 100);

  if (percent >= 84) {
    return {
      percent,
      label: "quase pronta",
      tone: "strong"
    };
  }

  if (percent >= 50) {
    return {
      percent,
      label: "em validação",
      tone: "medium"
    };
  }

  return {
    percent,
    label: "triagem inicial",
    tone: "low"
  };
}

function sortShortlistEntries(entries: SavedShortlist[]) {
  return [...entries].sort((left, right) => {
    if (left.chosen_for_submission !== right.chosen_for_submission) {
      return Number(right.chosen_for_submission) - Number(left.chosen_for_submission);
    }

    if (left.is_favorite !== right.is_favorite) {
      return Number(right.is_favorite) - Number(left.is_favorite);
    }

    return right.editorial_score - left.editorial_score;
  });
}

function formatAccessModel(accessModel: (typeof INDEXER_STRATEGY)[number]["accessModel"]) {
  switch (accessModel) {
    case "api_publica":
      return "Automatizável";
    case "licenca_institucional":
      return "Depende de licença";
    default:
      return "Verificação assistida";
  }
}

function formatSourceStatusLabel(status: RadarSourceStatus["status"]) {
  switch (status) {
    case "active":
      return "Ativa";
    case "missing_key":
      return "Chave ausente";
    default:
      return "Atenção";
  }
}

function slugifyFileName(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 70);
}

function buildShortlistReport(article: ArticleRow | null, entries: SavedShortlist[]) {
  const title = article?.titulo ?? "Manuscrito sem título";
  const generatedAt = new Date().toLocaleString("pt-BR");

  const body = entries
    .map((entry, index) => {
      const progress = getChecklistProgress(entry);
      const checklist = SHORTLIST_CHECKLIST.map((item) => {
        const mark = entry[item.key] ? "x" : " ";
        return `- [${mark}] ${item.label}`;
      }).join("\n");
      const indexers =
        entry.matched_indexers.length > 0
          ? entry.matched_indexers.join(", ")
          : "Nenhum indexador priorizado confirmado no radar";

      return [
        `## ${index + 1}. ${entry.journal_title}`,
        `- Nível: ${formatRecommendationLevel(entry.recommendation_level)}`,
        `- Score editorial: ${entry.editorial_score}`,
        `- Host: ${entry.host_name ?? "Não informado"}`,
        `- Indexadores priorizados: ${indexers}`,
        `- Revista-alvo: ${entry.chosen_for_submission ? "sim" : "não"}`,
        `- Favorita: ${entry.is_favorite ? "sim" : "não"}`,
        `- Checklist: ${progress.completed}/${progress.total}`,
        entry.source_url ? `- Fonte: ${entry.source_url}` : "- Fonte: não informada",
        "",
        "### Notas da equipe",
        entry.editorial_notes?.trim() ? entry.editorial_notes.trim() : "Sem notas registradas.",
        "",
        "### Checklist de submissão",
        checklist
      ].join("\n");
    })
    .join("\n\n---\n\n");

  return [
    `# Relatório editorial - ${title}`,
    "",
    `Gerado em: ${generatedAt}`,
    `Revistas na shortlist: ${entries.length}`,
    "",
    body || "Nenhuma revista salva na shortlist."
  ].join("\n");
}

function buildSubmissionDossier(article: ArticleRow | null, entry: SavedShortlist) {
  const title = article?.titulo ?? "Manuscrito sem título";
  const generatedAt = new Date().toLocaleString("pt-BR");
  const progress = getChecklistProgress(entry);
  const readiness = getSubmissionReadiness(entry);
  const checklist = SHORTLIST_CHECKLIST.map((item) => {
    const mark = entry[item.key] ? "x" : " ";
    return `- [${mark}] ${item.label}`;
  }).join("\n");
  const confirmedIndexers =
    entry.matched_indexers.length > 0 ? entry.matched_indexers.join(", ") : "Nenhum indexador priorizado confirmado";
  const detectedIndexers =
    entry.detected_indexers.length > 0 ? entry.detected_indexers.join(", ") : "Nenhum sinal adicional detectado";

  return [
    `# Dossiê de submissão - ${entry.journal_title}`,
    "",
    `Gerado em: ${generatedAt}`,
    `Manuscrito: ${title}`,
    `Revista: ${entry.journal_title}`,
    `Host/editora: ${entry.host_name ?? "Não informado"}`,
    `Fonte: ${entry.source_url ?? "Não informada"}`,
    "",
    "## Leitura editorial",
    `- Nível atual: ${formatRecommendationLevel(entry.recommendation_level)}`,
    `- Score editorial: ${entry.editorial_score}`,
    `- Prontidão: ${readiness.percent}% (${readiness.label})`,
    `- Checklist: ${progress.completed}/${progress.total}`,
    `- Revista-alvo: ${entry.chosen_for_submission ? "sim" : "não"}`,
    `- Favorita: ${entry.is_favorite ? "sim" : "não"}`,
    "",
    "## Indexadores",
    `- Priorizados confirmados: ${confirmedIndexers}`,
    `- Sinais detectados: ${detectedIndexers}`,
    "",
    "## Notas da equipe",
    entry.editorial_notes?.trim() ? entry.editorial_notes.trim() : "Sem notas registradas.",
    "",
    "## Checklist de submissão",
    checklist,
    "",
    "## Próxima decisão sugerida",
    readiness.percent >= 84
      ? "Se escopo, taxas, diretrizes e indexadores estiverem confirmados, esta revista pode ir para decisão final de submissão."
      : readiness.percent >= 50
        ? "Avance nas pendências do checklist antes de tratar esta revista como candidata final."
        : "Use esta revista como hipótese inicial: valide escopo, indexadores, taxas e diretrizes antes de priorizar."
  ].join("\n");
}

function buildRecommendationReasons(journal: JournalCandidate, selectedIndexers: IndexerName[]) {
  const reasons: string[] = [];

  if (journal.matchedSelectedIndexers.length > 0) {
    reasons.push(`cobre ${journal.matchedSelectedIndexers.length} indexador(es) priorizados: ${journal.matchedSelectedIndexers.join(", ")}`);
  }

  if (journal.matchCount >= 3) {
    reasons.push(`apareceu em ${journal.matchCount} resultado(s) relacionados ao manuscrito`);
  }

  if (journal.hIndex && journal.hIndex >= 20) {
    reasons.push(`tem sinal bibliométrico relevante no OpenAlex (h-index ${journal.hIndex})`);
  }

  if (journal.isOpenAccess) {
    reasons.push("tem sinal de acesso aberto");
  }

  if (reasons.length === 0 && selectedIndexers.length > 0) {
    reasons.push("apareceu por aderência temática, mas ainda precisa de validação forte nos indexadores escolhidos");
  }

  return reasons.slice(0, 3);
}

function buildSubmissionAdjustments(journal: JournalCandidate, selectedIndexers: IndexerName[]) {
  const missingIndexers = selectedIndexers.filter((indexer) => !journal.detectedIndexers.includes(indexer)).slice(0, 3);
  const adjustments = [
    "confirmar escopo, tipo de artigo aceito e diretrizes aos autores no site da revista",
    "ajustar título, resumo e palavras-chave para explicitar o recorte central do manuscrito"
  ];

  if (missingIndexers.length > 0) {
    adjustments.push(`validar manualmente ${missingIndexers.join(", ")} antes de tratar como candidata final`);
  }

  if (!journal.isOpenAccess) {
    adjustments.push("checar política de acesso aberto, APC e condições institucionais de publicação");
  }

  return adjustments.slice(0, 4);
}

function buildReferenceList(citation: string) {
  return {
    type: "bulletList",
    content: [
      {
        type: "listItem",
        content: [
          {
            type: "paragraph",
            content: [{ type: "text", text: citation }]
          }
        ]
      }
    ]
  };
}

function extractNodeText(node: Record<string, unknown>): string {
  const currentText = typeof node.text === "string" ? node.text : "";
  const nested =
    Array.isArray(node.content) && node.content.length > 0
      ? node.content
          .map((child) => {
            if (child && typeof child === "object") {
              return extractNodeText(child as Record<string, unknown>);
            }
            return "";
          })
          .join(" ")
      : "";

  return `${currentText} ${nested}`.trim();
}

function appendCitationToContent(content: ArticleContent | null, citation: string): ArticleContent {
  const clonedContent = content?.content
    ? (JSON.parse(JSON.stringify(content.content)) as Array<Record<string, unknown>>)
    : [];

  const referencesIndex = clonedContent.findIndex((node) => {
    return (
      node.type === "heading" &&
      extractNodeText(node)
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/\s+/g, " ")
        .trim() === "referencias"
    );
  });

  if (referencesIndex === -1) {
    return {
      type: "doc",
      content: [
        ...clonedContent,
        {
          type: "heading",
          attrs: { level: 2 },
          content: [{ type: "text", text: "Referências" }]
        },
        buildReferenceList(citation) as Record<string, unknown>
      ]
    };
  }

  const nextNode = clonedContent[referencesIndex + 1];
  if (nextNode?.type === "bulletList" && Array.isArray(nextNode.content)) {
    nextNode.content.push({
      type: "listItem",
      content: [
        {
          type: "paragraph",
          content: [{ type: "text", text: citation }]
        }
      ]
    });
  } else {
    clonedContent.splice(referencesIndex + 1, 0, buildReferenceList(citation) as Record<string, unknown>);
  }

  return {
    type: "doc",
    content: clonedContent
  };
}

export function PeriodicosHub({ articles }: PeriodicosHubProps) {
  const [articleSnapshots, setArticleSnapshots] = useState<ArticleRow[]>(articles);
  const [selectedArticleId, setSelectedArticleId] = useState(articles[0]?.id ?? "");
  const [selectedIndexers, setSelectedIndexers] = useState<IndexerName[]>([...DEFAULT_INDEXERS]);
  const [comparedJournalIds, setComparedJournalIds] = useState<string[]>([]);
  const [searchInput, setSearchInput] = useState("");
  const [hostFilter, setHostFilter] = useState("");
  const [onlyOpenAccess, setOnlyOpenAccess] = useState(false);
  const [minimumMatchedIndexers, setMinimumMatchedIndexers] = useState(1);
  const [showOnlyFavorites, setShowOnlyFavorites] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [loadingShortlist, setLoadingShortlist] = useState(false);
  const [searchMessage, setSearchMessage] = useState<string | null>(null);
  const [citationMessage, setCitationMessage] = useState<string | null>(null);
  const [savingJournalId, setSavingJournalId] = useState<string | null>(null);
  const [savedShortlist, setSavedShortlist] = useState<SavedShortlist[]>([]);
  const [journalResults, setJournalResults] = useState<JournalCandidate[]>([]);
  const [relatedWorks, setRelatedWorks] = useState<OpenAlexWork[]>([]);
  const [sourceStatus, setSourceStatus] = useState<RadarSourceStatus[]>([]);

  useEffect(() => {
    setArticleSnapshots(articles);
    if (!selectedArticleId && articles[0]?.id) {
      setSelectedArticleId(articles[0].id);
    }
  }, [articles, selectedArticleId]);

  const selectedArticle = useMemo(
    () => articleSnapshots.find((article) => article.id === selectedArticleId) ?? articleSnapshots[0] ?? null,
    [articleSnapshots, selectedArticleId]
  );

  useEffect(() => {
    let isMounted = true;

    const loadShortlist = async () => {
      if (!selectedArticle?.id) {
        if (isMounted) {
          setSavedShortlist([]);
        }
        return;
      }

      setLoadingShortlist(true);
      const supabase = getSupabaseClient();
      const { data, error } = await supabase
        .from("periodicos_shortlists")
        .select("*")
        .eq("artigo_id", selectedArticle.id)
        .order("editorial_score", { ascending: false });

      if (!isMounted) {
        return;
      }

      if (error) {
        setSearchMessage(error.message);
        setSavedShortlist([]);
      } else {
        setSavedShortlist(sortShortlistEntries(data ?? []));
      }

      setLoadingShortlist(false);
    };

    void loadShortlist();

    return () => {
      isMounted = false;
    };
  }, [selectedArticle?.id]);

  const shortlistedByJournalId = useMemo(() => {
    return new Map(savedShortlist.map((entry) => [entry.journal_id, entry]));
  }, [savedShortlist]);

  const filteredJournalResults = useMemo(() => {
    return journalResults.filter((journal) => {
      if (onlyOpenAccess && !journal.isOpenAccess) {
        return false;
      }

      if (journal.matchedSelectedIndexers.length < minimumMatchedIndexers) {
        return false;
      }

      if (hostFilter.trim()) {
        const haystack = `${journal.title} ${journal.hostName ?? ""}`.toLowerCase();
        if (!haystack.includes(hostFilter.trim().toLowerCase())) {
          return false;
        }
      }

      if (showOnlyFavorites) {
        return Boolean(shortlistedByJournalId.get(journal.id)?.is_favorite);
      }

      return true;
    });
  }, [
    hostFilter,
    journalResults,
    minimumMatchedIndexers,
    onlyOpenAccess,
    shortlistedByJournalId,
    showOnlyFavorites
  ]);

  const favoriteCount = savedShortlist.filter((entry) => entry.is_favorite).length;
  const chosenCount = savedShortlist.filter((entry) => entry.chosen_for_submission).length;
  const strongCandidateCount = filteredJournalResults.filter(
    (journal) => journal.recommendationLevel === "candidata_forte"
  ).length;
  const needsValidationCount = filteredJournalResults.filter(
    (journal) => journal.recommendationLevel === "precisa_validar"
  ).length;
  const topRecommendations = filteredJournalResults.slice(0, 3);
  const comparedJournals = useMemo(() => {
    const shortlistMap = new Map<string, JournalComparisonEntry>(
      savedShortlist.map((entry) => {
        const readiness = getSubmissionReadiness(entry);
        return [
          entry.journal_id,
          {
            id: entry.journal_id,
            title: entry.journal_title,
            hostName: entry.host_name,
            recommendationLevel: entry.recommendation_level,
            editorialScore: entry.editorial_score,
            isChosen: entry.chosen_for_submission,
            matchedIndexers: entry.matched_indexers as IndexerName[],
            detectedIndexers: entry.detected_indexers as IndexerName[],
            isOpenAccess: Boolean(entry.acesso_aberto_conferido),
            matchCount: 0,
            hIndex: undefined,
            readinessPercent: readiness.percent,
            readinessLabel: readiness.label,
            notes: entry.editorial_notes,
            sourceUrl: entry.source_url
          } satisfies JournalComparisonEntry
        ];
      })
    );
    const journalMap = new Map<string, JournalComparisonEntry>(
      filteredJournalResults.map((journal) => [
        journal.id,
        {
          id: journal.id,
          title: journal.title,
          hostName: journal.hostName,
          recommendationLevel: journal.recommendationLevel,
          editorialScore: journal.editorialScore,
          isChosen: false,
          matchedIndexers: journal.matchedSelectedIndexers,
          detectedIndexers: journal.detectedIndexers,
          isOpenAccess: journal.isOpenAccess,
          matchCount: journal.matchCount,
          hIndex: journal.hIndex,
          readinessPercent: undefined,
          readinessLabel: undefined,
          notes: null,
          sourceUrl: journal.landingPageUrl
        } satisfies JournalComparisonEntry
      ])
    );

    return comparedJournalIds
      .map((id) => shortlistMap.get(id) ?? journalMap.get(id) ?? null)
      .filter((entry): entry is JournalComparisonEntry => entry !== null);
  }, [comparedJournalIds, filteredJournalResults, savedShortlist]);

  const toggleIndexer = (indexer: IndexerName) => {
    setSelectedIndexers((current) =>
      current.includes(indexer) ? current.filter((item) => item !== indexer) : [...current, indexer]
    );
  };

  const toggleJournalComparison = (journalId: string) => {
    setComparedJournalIds((current) => {
      if (current.includes(journalId)) {
        return current.filter((id) => id !== journalId);
      }

      return [...current, journalId].slice(-3);
    });
  };

  const searchJournals = async () => {
    if (!selectedArticle) {
      setSearchMessage("Selecione um artigo para buscar revistas e referências.");
      return;
    }

    setIsLoading(true);
    setSearchMessage(null);
    setCitationMessage(null);

    try {
      const articleText = extractPlainText(selectedArticle.conteudo_json);
      const querySeed = searchInput.trim() || selectedArticle.titulo;
      const keywordQuery = buildKeywordQuery(querySeed, articleText);
      const response = await fetch("/api/periodicos/radar", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          query: keywordQuery
        })
      });

      if (!response.ok) {
        throw new Error("Não foi possível consultar as fontes editoriais agora.");
      }

      const payload = (await response.json()) as RadarApiResponse;
      const works = payload.works ?? [];
      setSourceStatus(payload.sourceStatus ?? []);

      const journalMap = new Map<string, JournalCandidate>();

      works.forEach((work) => {
        const source = work.primary_location?.source;
        if (!source?.id || !source.display_name) {
          return;
        }

        const detectedIndexers = inferIndexerSignals(source);
        const coverage = getIndexerCoverageSummary(detectedIndexers, selectedIndexers);
        const current = journalMap.get(source.id);

        if (!current) {
          const editorialScore = calculateEditorialScore({
            matchedSelectedIndexers: coverage.matched.length,
            detectedIndexers: detectedIndexers.length,
            matchCount: 1,
            hIndex: source.summary_stats?.h_index,
            isOpenAccess: source.is_oa
          });

          journalMap.set(source.id, {
            id: source.id,
            title: source.display_name,
            hostName: source.host_organization_name ?? null,
            landingPageUrl: work.primary_location?.landing_page_url ?? null,
            isOpenAccess: Boolean(source.is_oa),
            hIndex: source.summary_stats?.h_index,
            matchCount: 1,
            detectedIndexers,
            matchedSelectedIndexers: coverage.matched,
            editorialScore,
            recommendationLevel: inferRecommendationLevel(editorialScore, coverage.matched.length)
          });
          return;
        }

        current.matchCount += 1;
        current.editorialScore = calculateEditorialScore({
          matchedSelectedIndexers: current.matchedSelectedIndexers.length,
          detectedIndexers: current.detectedIndexers.length,
          matchCount: current.matchCount,
          hIndex: current.hIndex,
          isOpenAccess: current.isOpenAccess
        });
        current.recommendationLevel = inferRecommendationLevel(
          current.editorialScore,
          current.matchedSelectedIndexers.length
        );
      });

      (payload.licensedJournals ?? []).forEach((journal) => {
        const detectedIndexers = journal.detectedIndexers.filter((indexer): indexer is IndexerName =>
          INDEXER_OPTIONS.includes(indexer)
        );
        const coverage = getIndexerCoverageSummary(detectedIndexers, selectedIndexers);
        const current = journalMap.get(journal.id);

        if (current) {
          const mergedIndexers = Array.from(new Set([...current.detectedIndexers, ...detectedIndexers]));
          const mergedCoverage = getIndexerCoverageSummary(mergedIndexers, selectedIndexers);
          current.detectedIndexers = mergedIndexers;
          current.matchedSelectedIndexers = mergedCoverage.matched;
          current.matchCount += journal.matchCount;
          current.landingPageUrl = current.landingPageUrl ?? journal.landingPageUrl;
          current.hostName = current.hostName ?? journal.hostName;
          current.editorialScore = calculateEditorialScore({
            matchedSelectedIndexers: current.matchedSelectedIndexers.length,
            detectedIndexers: current.detectedIndexers.length,
            matchCount: current.matchCount,
            hIndex: current.hIndex,
            isOpenAccess: current.isOpenAccess || journal.isOpenAccess
          });
          current.recommendationLevel = inferRecommendationLevel(
            current.editorialScore,
            current.matchedSelectedIndexers.length
          );
          return;
        }

        const editorialScore = calculateEditorialScore({
          matchedSelectedIndexers: coverage.matched.length,
          detectedIndexers: detectedIndexers.length,
          matchCount: journal.matchCount,
          isOpenAccess: journal.isOpenAccess
        });

        journalMap.set(journal.id, {
          id: journal.id,
          title: journal.title,
          hostName: journal.hostName,
          landingPageUrl: journal.landingPageUrl,
          isOpenAccess: journal.isOpenAccess,
          matchCount: journal.matchCount,
          detectedIndexers,
          matchedSelectedIndexers: coverage.matched,
          editorialScore,
          recommendationLevel: inferRecommendationLevel(editorialScore, coverage.matched.length)
        });
      });

      setJournalResults(
        Array.from(journalMap.values()).sort((left, right) => {
          if (right.editorialScore !== left.editorialScore) {
            return right.editorialScore - left.editorialScore;
          }
          return right.matchCount - left.matchCount;
        })
      );

      setRelatedWorks(
        works.filter((work) => work.title && work.authorships?.length).slice(0, 8)
      );
    } catch (error) {
      setSearchMessage(error instanceof Error ? error.message : "Erro inesperado na consulta editorial.");
      setJournalResults([]);
      setRelatedWorks([]);
      setSourceStatus([]);
    } finally {
      setIsLoading(false);
    }
  };

  const saveToShortlist = async (journal: JournalCandidate) => {
    if (!selectedArticle) {
      return;
    }

    setSavingJournalId(journal.id);
    setSearchMessage(null);

    try {
      const supabase = getSupabaseClient();
      const {
        data: { user }
      } = await supabase.auth.getUser();

      if (!user) {
        throw new Error("Sessão expirada. Entre novamente para salvar revistas.");
      }

      const payload: Database["public"]["Tables"]["periodicos_shortlists"]["Insert"] = {
        artigo_id: selectedArticle.id,
        journal_id: journal.id,
        journal_title: journal.title,
        host_name: journal.hostName,
        source_url: journal.landingPageUrl,
        recommendation_level: journal.recommendationLevel,
        matched_indexers: journal.matchedSelectedIndexers,
        detected_indexers: journal.detectedIndexers,
        editorial_score: journal.editorialScore,
        is_favorite: shortlistedByJournalId.get(journal.id)?.is_favorite ?? false,
        chosen_for_submission: shortlistedByJournalId.get(journal.id)?.chosen_for_submission ?? false,
        chosen_at: shortlistedByJournalId.get(journal.id)?.chosen_at ?? null,
        created_by: user.id
      };

      const { data, error } = await supabase
        .from("periodicos_shortlists")
        .upsert(payload, { onConflict: "artigo_id,journal_id" })
        .select("*")
        .single();

      if (error || !data) {
        throw new Error(error?.message ?? "Não foi possível salvar a revista.");
      }

      setSavedShortlist((current) => {
        const next = current.filter((entry) => entry.id !== data.id && entry.journal_id !== data.journal_id);
        return sortShortlistEntries([data, ...next]);
      });
    } catch (error) {
      setSearchMessage(error instanceof Error ? error.message : "Erro ao salvar shortlist.");
    } finally {
      setSavingJournalId(null);
    }
  };

  const updateShortlistEntry = async (
    entryId: string,
    patch: ShortlistUpdate
  ) => {
    const supabase = getSupabaseClient();
    const { data, error } = await supabase
      .from("periodicos_shortlists")
      .update({
        ...patch,
        updated_at: new Date().toISOString()
      })
      .eq("id", entryId)
      .select("*")
      .single();

    if (error || !data) {
      throw new Error(error?.message ?? "Não foi possível atualizar a shortlist.");
    }

    setSavedShortlist((current) =>
      sortShortlistEntries(current.map((entry) => (entry.id === entryId ? data : entry)))
    );
  };

  const removeShortlistEntry = async (entryId: string) => {
    const supabase = getSupabaseClient();
    const { error } = await supabase.from("periodicos_shortlists").delete().eq("id", entryId);

    if (error) {
      throw new Error(error.message);
    }

    setSavedShortlist((current) => sortShortlistEntries(current.filter((entry) => entry.id !== entryId)));
  };

  const chooseSubmissionTarget = async (entry: SavedShortlist) => {
    if (!selectedArticle) {
      return;
    }

    const supabase = getSupabaseClient();
    const chosenAt = new Date().toISOString();

    const { error: clearError } = await supabase
      .from("periodicos_shortlists")
      .update({
        chosen_for_submission: false,
        updated_at: chosenAt
      })
      .eq("artigo_id", selectedArticle.id)
      .neq("id", entry.id);

    if (clearError) {
      throw new Error(clearError.message);
    }

    await updateShortlistEntry(entry.id, {
      chosen_for_submission: true,
      chosen_at: chosenAt,
      is_favorite: true
    });
  };

  const handleCopyShortlistReport = async () => {
    const report = buildShortlistReport(selectedArticle, savedShortlist);
    await navigator.clipboard.writeText(report);
    setCitationMessage("Relatório editorial copiado para a área de transferência.");
  };

  const handleDownloadShortlistReport = () => {
    const report = buildShortlistReport(selectedArticle, savedShortlist);
    const blob = new Blob([report], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    const fileName = slugifyFileName(selectedArticle?.titulo ?? "relatorio-editorial");

    link.href = url;
    link.download = `${fileName || "relatorio-editorial"}-shortlist.md`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
    setCitationMessage("Relatório editorial baixado em Markdown.");
  };

  const handleCopySubmissionDossier = async (entry: SavedShortlist) => {
    const dossier = buildSubmissionDossier(selectedArticle, entry);
    await navigator.clipboard.writeText(dossier);
    setCitationMessage(`Dossiê de ${entry.journal_title} copiado para a área de transferência.`);
  };

  const handleDownloadSubmissionDossier = (entry: SavedShortlist) => {
    const dossier = buildSubmissionDossier(selectedArticle, entry);
    const blob = new Blob([dossier], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    const articleName = slugifyFileName(selectedArticle?.titulo ?? "manuscrito");
    const journalName = slugifyFileName(entry.journal_title);

    link.href = url;
    link.download = `${articleName || "manuscrito"}-${journalName || "revista"}-dossie-submissao.md`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
    setCitationMessage(`Dossiê de ${entry.journal_title} baixado em Markdown.`);
  };

  const handleDownloadSubmissionDocx = async (entry: SavedShortlist) => {
    if (!selectedArticle) {
      setCitationMessage("Selecione um manuscrito antes de baixar o pacote de submissão.");
      return;
    }

    const readiness = getSubmissionReadiness(entry);
    const { exportSubmissionDocx } = await import("@/lib/docx-export");
    await exportSubmissionDocx(selectedArticle.titulo, selectedArticle.conteudo_json ?? EMPTY_DOC, {
      journalTitle: entry.journal_title,
      hostName: entry.host_name,
      recommendationLabel: formatRecommendationLevel(entry.recommendation_level),
      readinessLabel: readiness.label,
      readinessPercent: readiness.percent,
      editorialScore: entry.editorial_score,
      indexers: entry.matched_indexers,
      notes: entry.editorial_notes,
      checklist: SHORTLIST_CHECKLIST.map((item) => ({
        label: item.label,
        checked: Boolean(entry[item.key])
      })),
      sourceUrl: entry.source_url
    });
    setCitationMessage(`Pacote DOCX de ${entry.journal_title} gerado com ficha editorial e manuscrito.`);
  };

  const handleCopyCitation = async (work: OpenAlexWork) => {
    const citation = formatAbntCitation(work);
    await navigator.clipboard.writeText(citation);
    setCitationMessage("Referência copiada para a área de transferência.");
  };

  const handleInsertCitation = async (work: OpenAlexWork) => {
    if (!selectedArticle) {
      return;
    }

    const citation = formatAbntCitation(work);
    const nextContent = appendCitationToContent(selectedArticle.conteudo_json ?? EMPTY_DOC, citation);
    const supabase = getSupabaseClient();
    const {
      data: { user }
    } = await supabase.auth.getUser();

    const { error } = await supabase
      .from("artigos")
      .update({
        conteudo_json: nextContent,
        updated_at: new Date().toISOString(),
        last_editor_id: user?.id ?? selectedArticle.last_editor_id ?? selectedArticle.autor_id
      })
      .eq("id", selectedArticle.id);

    if (error) {
      setCitationMessage(error.message);
      return;
    }

    setArticleSnapshots((current) =>
      current.map((article) =>
        article.id === selectedArticle.id
          ? {
              ...article,
              conteudo_json: nextContent,
              updated_at: new Date().toISOString(),
              last_editor_id: user?.id ?? article.last_editor_id
            }
          : article
      )
    );
    setCitationMessage("Referência enviada para o artigo selecionado.");
  };

  return (
    <main className="shell">
      <div className="container" style={{ display: "grid", gap: "20px" }}>
        <section className="hero-panel" style={{ display: "grid", gap: "12px" }}>
          <span className="eyebrow">radar editorial</span>
          <h1 className="section-title" style={{ fontSize: "clamp(2.2rem, 4.2vw, 3.3rem)" }}>
            Encontre as revistas mais promissoras para submeter seu manuscrito.
          </h1>
          <p className="section-lead">
            O radar editorial cruza tema, indexadores e sinais de aderência para ajudar a decidir onde vale
            investir submissão. Referências ficam como apoio; o centro é escolher o periódico certo.
          </p>
          <div className="periodicos-hero-metrics" aria-label="Resumo do radar editorial">
            <article>
              <strong>{journalResults.length}</strong>
              <span>revistas mapeadas</span>
            </article>
            <article>
              <strong>{strongCandidateCount}</strong>
              <span>candidatas fortes</span>
            </article>
            <article>
              <strong>{savedShortlist.length}</strong>
              <span>na shortlist</span>
            </article>
            <article>
              <strong>{favoriteCount}</strong>
              <span>favoritas</span>
            </article>
            <article>
              <strong>{chosenCount}</strong>
              <span>revista-alvo</span>
            </article>
            <article>
              <strong>{needsValidationCount}</strong>
              <span>a validar</span>
            </article>
          </div>
        </section>

        <section className="glass-card" style={{ padding: "24px", display: "grid", gap: "18px" }}>
          <div style={{ display: "grid", gap: "8px" }}>
            <strong>1. Protocolo de busca</strong>
            <span className="muted">
              Escolha o manuscrito, refine o recorte temático e diga ao WebLab quais indexadores pesam mais na decisão.
            </span>
          </div>

          <div style={{ display: "grid", gap: "14px", gridTemplateColumns: "minmax(280px, 1.4fr) minmax(240px, 1fr)" }}>
            <div style={{ display: "grid", gap: "10px" }}>
              <select
                value={selectedArticle?.id ?? ""}
                onChange={(event) => setSelectedArticleId(event.target.value)}
                disabled={articleSnapshots.length === 0}
                style={{
                  borderRadius: "18px",
                  padding: "14px 16px"
                }}
              >
                {articleSnapshots.length === 0 ? <option>Nenhum artigo disponível</option> : null}
                {articleSnapshots.map((article) => (
                  <option key={article.id} value={article.id}>
                    {article.titulo}
                  </option>
                ))}
              </select>

              <input
                className="field"
                placeholder="Opcional: refine com palavras-chave, tema ou recorte"
                value={searchInput}
                onChange={(event) => setSearchInput(event.target.value)}
              />
            </div>

            <div
              style={{
                display: "grid",
                gap: "8px",
                padding: "16px 18px",
                borderRadius: "20px",
                background: "rgba(255,255,255,0.04)",
                border: "1px solid rgba(255,255,255,0.08)"
              }}
            >
              <strong>{selectedArticle?.titulo ?? "Nenhum manuscrito selecionado"}</strong>
              <span className="muted">Última edição: {formatRelativeUpdate(selectedArticle?.updated_at ?? null)}</span>
              <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                <Link
                  href={selectedArticle ? getManuscriptPanelHref(selectedArticle.id) : ("/dashboard" as Route)}
                  className="button button-secondary"
                >
                  {selectedArticle ? "Abrir painel do artigo" : "Ir para Home"}
                </Link>
                <Link
                  href={selectedArticle ? getArticleEditorHref(selectedArticle.id) : ("/dashboard" as Route)}
                  className="button button-secondary"
                >
                  {selectedArticle ? "Abrir manuscrito no editor" : "Criar manuscrito"}
                </Link>
              </div>
            </div>
          </div>

          <div style={{ display: "grid", gap: "10px" }}>
            <strong>2. Prioridades de indexação</strong>
            <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
              {INDEXER_OPTIONS.map((indexer) => {
                const active = selectedIndexers.includes(indexer);
                return (
                  <button
                    key={indexer}
                    type="button"
                    className="button"
                    onClick={() => toggleIndexer(indexer)}
                    style={{
                      background: active ? "rgba(214,255,247,0.18)" : "rgba(255,255,255,0.04)",
                      color: "var(--foreground)",
                      border: active ? "1px solid rgba(214,255,247,0.22)" : "1px solid rgba(255,255,255,0.08)"
                    }}
                  >
                    {indexer}
                  </button>
                );
              })}
            </div>
          </div>

          <div style={{ display: "grid", gap: "12px", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))" }}>
            <label style={{ display: "grid", gap: "8px" }}>
              <span className="muted">Filtrar por nome da revista ou host</span>
              <input className="field" value={hostFilter} onChange={(event) => setHostFilter(event.target.value)} />
            </label>

            <label style={{ display: "grid", gap: "8px" }}>
              <span className="muted">Mínimo de indexadores priorizados</span>
              <select
                value={minimumMatchedIndexers}
                onChange={(event) => setMinimumMatchedIndexers(Number(event.target.value))}
                style={{
                  borderRadius: "18px",
                  padding: "14px 16px"
                }}
              >
                {[0, 1, 2, 3, 4].map((value) => (
                  <option key={value} value={value}>
                    {value === 0 ? "Sem corte mínimo" : `${value} ou mais`}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div style={{ display: "flex", gap: "12px", flexWrap: "wrap" }}>
            <button className="button button-primary" type="button" onClick={() => void searchJournals()} disabled={isLoading}>
              {isLoading ? "Varredura em andamento..." : "Rodar varredura editorial"}
            </button>

            <button
              className="button button-secondary"
              type="button"
              onClick={() => setOnlyOpenAccess((current) => !current)}
            >
              {onlyOpenAccess ? "Mostrando apenas acesso aberto" : "Restringir a acesso aberto"}
            </button>

            <button
              className="button button-secondary"
              type="button"
              onClick={() => setShowOnlyFavorites((current) => !current)}
            >
              {showOnlyFavorites ? `Somente favoritas (${favoriteCount})` : `Filtrar favoritas (${favoriteCount})`}
            </button>
          </div>

          {searchMessage ? (
            <p className="danger" style={{ margin: 0 }}>
              {searchMessage}
            </p>
          ) : null}

          {citationMessage ? (
            <p className="muted" style={{ margin: 0 }}>
              {citationMessage}
            </p>
          ) : null}

          <div className="periodicos-integrity-note">
            <strong>Como ler os indexadores?</strong>
            <span>
              O WebLab usa sinais bibliográficos para sugerir revistas e abre a verificação nas fontes oficiais.
              Antes de submeter, confirme escopo, indexação ativa, APC e instruções aos autores.
            </span>
          </div>

          {sourceStatus.length > 0 ? (
            <div className="periodicos-source-status" aria-label="Status das fontes do radar">
              {sourceStatus.map((source) => (
                <article key={source.source} data-status={source.status}>
                  <div>
                    <strong>{source.source}</strong>
                    <span>{formatSourceStatusLabel(source.status)}</span>
                  </div>
                  <p>{source.message}</p>
                </article>
              ))}
            </div>
          ) : null}

          <div className="periodicos-source-strategy">
            <div>
              <strong>Plano de validação</strong>
              <span>
                O radar separa fontes automatizáveis, catálogos de conferência e bases que dependem de licença institucional.
              </span>
            </div>
            <div className="periodicos-source-grid">
              {INDEXER_STRATEGY.map((source) => (
                <article key={source.indexer}>
                  <div>
                    <strong>{source.indexer}</strong>
                    <span>{formatAccessModel(source.accessModel)}</span>
                  </div>
                  <p>{source.note}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section className="glass-card" style={{ padding: "24px", display: "grid", gap: "14px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: "12px", flexWrap: "wrap" }}>
            <div style={{ display: "grid", gap: "4px" }}>
              <strong>Caderno de shortlist</strong>
              <span className="muted">
                Salve revistas por manuscrito, marque favoritas e deixe claro quais são as candidatas mais fortes.
              </span>
            </div>
            <div className="periodicos-report-actions">
              <span className="muted">
                {loadingShortlist ? "Carregando shortlist..." : `${savedShortlist.length} revista(s) salvas`}
              </span>
              {savedShortlist.length > 0 ? (
                <>
                  <button className="button button-secondary" onClick={() => void handleCopyShortlistReport()} type="button">
                    Copiar relatório
                  </button>
                  <button className="button button-secondary" onClick={handleDownloadShortlistReport} type="button">
                    Baixar Markdown
                  </button>
                </>
              ) : null}
            </div>
          </div>

          {savedShortlist.length > 0 ? (
            <div className="periodicos-shortlist-summary" aria-label="Resumo da shortlist">
              <span>{savedShortlist.filter((entry) => entry.recommendation_level === "candidata_forte").length} fortes</span>
              <span>{savedShortlist.filter((entry) => entry.recommendation_level === "candidata_moderada").length} moderadas</span>
              <span>{savedShortlist.filter((entry) => entry.recommendation_level === "precisa_validar").length} a validar</span>
              <span>{favoriteCount} favoritas</span>
              <span>{chosenCount} revista-alvo</span>
            </div>
          ) : null}

          {savedShortlist.length === 0 ? (
            <div
              className="muted"
              style={{ padding: "18px", borderRadius: "18px", background: "rgba(255,255,255,0.04)" }}
            >
              Nenhuma revista foi salva ainda. Use o radar abaixo para montar sua shortlist de submissão.
            </div>
          ) : (
            <div style={{ display: "grid", gap: "12px" }}>
              {savedShortlist.map((entry) => {
                const progress = getChecklistProgress(entry);
                const readiness = getSubmissionReadiness(entry);

                return (
                  <article
                    key={entry.id}
                    style={{
                      display: "grid",
                      gap: "12px",
                      padding: "18px",
                      borderRadius: "20px",
                      background: "rgba(255,255,255,0.04)",
                      border: "1px solid rgba(255,255,255,0.08)"
                    }}
                  >
                  <div style={{ display: "flex", justifyContent: "space-between", gap: "12px", flexWrap: "wrap" }}>
                    <div style={{ display: "grid", gap: "6px" }}>
                      <strong>{entry.journal_title}</strong>
                      <span className="muted">{entry.host_name ?? "Host não informado"}</span>
                    </div>
                    <span
                      style={{
                        padding: "8px 12px",
                        borderRadius: "999px",
                        background:
                          entry.recommendation_level === "candidata_forte"
                            ? "rgba(72, 158, 132, 0.16)"
                            : entry.recommendation_level === "candidata_moderada"
                              ? "rgba(209, 162, 84, 0.16)"
                              : "rgba(255, 255, 255, 0.06)",
                        fontWeight: 700
                      }}
                    >
                      {formatRecommendationLevel(entry.recommendation_level)}
                    </span>
                  </div>

                  <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
                    <span className="muted">Score editorial: {entry.editorial_score}</span>
                    <span className="muted">Indexadores priorizados: {entry.matched_indexers.length}</span>
                    <span className="muted">{entry.is_favorite ? "Favorita" : "Ainda não favorita"}</span>
                    <span className="muted">
                      {entry.chosen_for_submission ? "Revista-alvo definida" : "Ainda não definida como alvo"}
                    </span>
                    <span className="muted">
                      Checklist: {progress.completed}/{progress.total}
                    </span>
                  </div>

                  <div className="periodicos-submission-readiness" data-tone={readiness.tone}>
                    <div>
                      <strong>{readiness.percent}%</strong>
                      <span>{readiness.label}</span>
                    </div>
                    <p>
                      {readiness.percent >= 84
                        ? "Dossiê quase pronto para decisão final da equipe."
                        : readiness.percent >= 50
                          ? "Ainda há pendências, mas a revista já pode ser comparada com outras candidatas."
                          : "Revista em triagem: valide o básico antes de priorizar submissão."}
                    </p>
                  </div>

                  <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                    {entry.matched_indexers.map((indexer) => (
                      <span key={indexer} className="status-chip">
                        {indexer}
                      </span>
                    ))}
                  </div>

                  <div className="periodicos-decision-workbench">
                    <label>
                      <span>Notas da equipe</span>
                      <textarea
                        defaultValue={entry.editorial_notes ?? ""}
                        onBlur={(event) => {
                          const nextNotes = event.currentTarget.value.trim();

                          if (nextNotes !== (entry.editorial_notes ?? "")) {
                            void updateShortlistEntry(entry.id, { editorial_notes: nextNotes });
                          }
                        }}
                        placeholder="Ex.: escopo parece aderente, verificar APC, confirmar se aceita artigo em português..."
                      />
                    </label>

                    <div className="periodicos-checklist-box">
                      <div>
                        <strong>Checklist de submissão</strong>
                        <span>
                          {progress.completed}/{progress.total} conferências concluídas
                        </span>
                      </div>
                      <div className="periodicos-checklist-grid">
                        {SHORTLIST_CHECKLIST.map((item) => (
                          <label key={item.key}>
                            <input
                              checked={Boolean(entry[item.key])}
                              onChange={(event) =>
                                void updateShortlistEntry(entry.id, {
                                  [item.key]: event.currentTarget.checked
                                })
                              }
                              type="checkbox"
                            />
                            <span>{item.label}</span>
                          </label>
                        ))}
                      </div>
                    </div>
                  </div>

                  <details className="periodicos-validation-details">
                    <summary>Verificação nos indexadores</summary>
                    <div className="periodicos-validation-grid">
                      {buildIndexerSearchLinks(entry.journal_title, selectedIndexers).map((link) => (
                        <a href={link.href} key={link.indexer} rel="noreferrer" target="_blank">
                          <span>{link.indexer}</span>
                          <small>{formatIndexerEvidence(link.indexer, entry.detected_indexers as IndexerName[])}</small>
                        </a>
                      ))}
                    </div>
                  </details>

                  <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
                    <select
                      value={entry.recommendation_level}
                      onChange={(event) =>
                        void updateShortlistEntry(entry.id, {
                          recommendation_level: event.target.value as RecommendationLevel
                        })
                      }
                      style={{
                        borderRadius: "999px",
                        border: "1px solid rgba(255,255,255,0.08)",
                        background: "rgba(255,255,255,0.05)",
                        color: "var(--foreground)",
                        padding: "10px 14px"
                      }}
                    >
                      <option value="candidata_forte">Candidata forte</option>
                      <option value="candidata_moderada">Candidata moderada</option>
                      <option value="precisa_validar">Precisa validar</option>
                    </select>

                    <button
                      className="button button-secondary"
                      type="button"
                      onClick={() => void updateShortlistEntry(entry.id, { is_favorite: !entry.is_favorite })}
                    >
                      {entry.is_favorite ? "Remover favorita" : "Marcar favorita"}
                    </button>

                    <button
                      className={entry.chosen_for_submission ? "button button-primary" : "button button-secondary"}
                      type="button"
                      onClick={() => void chooseSubmissionTarget(entry)}
                    >
                      {entry.chosen_for_submission ? "Revista-alvo definida" : "Definir como revista-alvo"}
                    </button>

                    <button
                      className="button button-secondary"
                      type="button"
                      onClick={() => toggleJournalComparison(entry.journal_id)}
                    >
                      {comparedJournalIds.includes(entry.journal_id) ? "Remover da comparação" : "Comparar"}
                    </button>

                    <button
                      className="button button-secondary"
                      type="button"
                      onClick={() => void removeShortlistEntry(entry.id)}
                    >
                      Remover da shortlist
                    </button>

                    <button
                      className="button button-secondary"
                      type="button"
                      onClick={() => void handleCopySubmissionDossier(entry)}
                    >
                      Copiar dossiê
                    </button>

                    <button
                      className="button button-secondary"
                      type="button"
                      onClick={() => handleDownloadSubmissionDossier(entry)}
                    >
                      Baixar dossiê
                    </button>

                    <button
                      className="button button-primary"
                      type="button"
                      onClick={() => void handleDownloadSubmissionDocx(entry)}
                    >
                      Baixar pacote DOCX
                    </button>

                    {entry.source_url ? (
                      <a className="button button-secondary" href={entry.source_url} rel="noreferrer" target="_blank">
                        Abrir fonte
                      </a>
                    ) : null}
                  </div>
                  </article>
                );
              })}
            </div>
          )}
        </section>

        <section className="glass-card" style={{ padding: "24px", display: "grid", gap: "14px" }}>
          <div style={{ display: "grid", gap: "4px" }}>
            <strong>Revistas candidatas</strong>
            <span className="muted">
              O ranking combina aderência temática, peso dos indexadores escolhidos, acesso aberto e sinais editoriais detectados.
            </span>
          </div>

          {topRecommendations.length > 0 ? (
            <div className="periodicos-decision-board" aria-label="Top recomendações editoriais">
              <div>
                <span className="eyebrow">decisão editorial</span>
                <strong>Top 3 para olhar primeiro</strong>
                <p>
                  O WebLab não promete aceite: ele organiza onde vale gastar energia de validação antes da submissão.
                </p>
              </div>

              <div className="periodicos-recommendation-grid">
                {topRecommendations.map((journal, index) => {
                  const reasons = buildRecommendationReasons(journal, selectedIndexers);
                  const adjustments = buildSubmissionAdjustments(journal, selectedIndexers);
                  const savedEntry = shortlistedByJournalId.get(journal.id);

                  return (
                    <article key={journal.id}>
                      <div className="periodicos-recommendation-rank">
                        <span>{String(index + 1).padStart(2, "0")}</span>
                        <strong>{formatRecommendationLevel(journal.recommendationLevel)}</strong>
                      </div>
                      <h3>{journal.title}</h3>
                      <p>{journal.hostName ?? "Host não informado"}</p>

                      <div className="periodicos-recommendation-section">
                        <strong>Por que apareceu</strong>
                        <ul>
                          {reasons.map((reason) => (
                            <li key={reason}>{reason}</li>
                          ))}
                        </ul>
                      </div>

                      <div className="periodicos-recommendation-section">
                        <strong>Ajustes antes de submeter</strong>
                        <ul>
                          {adjustments.map((adjustment) => (
                            <li key={adjustment}>{adjustment}</li>
                          ))}
                        </ul>
                      </div>

                      <div className="periodicos-recommendation-actions">
                        <button
                          className="button button-primary"
                          disabled={savingJournalId === journal.id}
                          onClick={() => void saveToShortlist(journal)}
                          type="button"
                        >
                          {savingJournalId === journal.id
                            ? "Salvando..."
                            : savedEntry
                              ? "Atualizar shortlist"
                              : "Salvar na shortlist"}
                        </button>
                        <button
                          className="button button-secondary"
                          onClick={() => toggleJournalComparison(journal.id)}
                          type="button"
                        >
                          {comparedJournalIds.includes(journal.id) ? "Remover da comparação" : "Comparar"}
                        </button>
                        {journal.landingPageUrl ? (
                          <a className="button button-secondary" href={journal.landingPageUrl} rel="noreferrer" target="_blank">
                            Abrir fonte
                          </a>
                        ) : null}
                      </div>
                    </article>
                  );
                })}
              </div>
            </div>
          ) : null}

          {comparedJournals.length > 0 ? (
            <div className="periodicos-comparison-board">
              <div style={{ display: "grid", gap: "4px" }}>
                <span className="eyebrow">comparação</span>
                <strong>Comparar candidatas lado a lado</strong>
                <span className="muted">Use esta mesa para decidir onde vale aprofundar validação editorial.</span>
              </div>
              <div className="periodicos-comparison-grid">
                {comparedJournals.map((journal) => (
                  <article key={`compare-${journal.id}`}>
                    <div style={{ display: "grid", gap: "4px" }}>
                      <strong>{journal.title}</strong>
                      <span className="muted">{journal.hostName ?? "Host não informado"}</span>
                    </div>
                    <div className="periodicos-comparison-metrics">
                      <span>Score {journal.editorialScore}</span>
                      <span>{formatRecommendationLevel(journal.recommendationLevel)}</span>
                      <span>OA {journal.isOpenAccess ? "sim" : "não"}</span>
                      {journal.readinessPercent !== undefined ? <span>Prontidão {journal.readinessPercent}%</span> : null}
                      <span>{journal.isChosen ? "Revista-alvo" : "Comparação"}</span>
                    </div>
                    <div style={{ display: "grid", gap: "6px" }}>
                      <strong>Indexadores aderentes</strong>
                      <p>{journal.matchedIndexers.length ? journal.matchedIndexers.join(", ") : "Nenhum confirmado ainda"}</p>
                    </div>
                    <div style={{ display: "grid", gap: "6px" }}>
                      <strong>Sinais adicionais</strong>
                      <p>{journal.detectedIndexers.length ? journal.detectedIndexers.join(", ") : "Nenhum sinal adicional detectado"}</p>
                    </div>
                    <div style={{ display: "grid", gap: "6px" }}>
                      <strong>Indicadores</strong>
                      <p>
                        {journal.hIndex ? `H-index ${journal.hIndex}` : "H-index não informado"}
                        {journal.matchCount ? ` · ${journal.matchCount} ocorrência(s)` : ""}
                      </p>
                    </div>
                    {journal.notes ? (
                      <div style={{ display: "grid", gap: "6px" }}>
                        <strong>Notas da equipe</strong>
                        <p>{journal.notes}</p>
                      </div>
                    ) : null}
                    <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                      <button className="button button-secondary" onClick={() => toggleJournalComparison(journal.id)} type="button">
                        Remover da comparação
                      </button>
                      {journal.sourceUrl ? (
                        <a className="button button-secondary" href={journal.sourceUrl} rel="noreferrer" target="_blank">
                          Abrir fonte
                        </a>
                      ) : null}
                    </div>
                  </article>
                ))}
              </div>
            </div>
          ) : null}

          {filteredJournalResults.length === 0 ? (
            <div className="muted" style={{ padding: "18px", borderRadius: "18px", background: "rgba(255,255,255,0.04)" }}>
              {isLoading
                ? "Consultando bases e organizando revistas candidatas..."
                : "Nenhuma revista apareceu com os filtros atuais. Tente ampliar termos, afrouxar os filtros ou rodar uma nova busca."}
            </div>
          ) : (
            <div style={{ display: "grid", gap: "14px" }}>
              {filteredJournalResults.map((journal) => {
                const savedEntry = shortlistedByJournalId.get(journal.id);
                const validationLinks = buildIndexerSearchLinks(journal.title, selectedIndexers);

                return (
                  <article
                    key={journal.id}
                    style={{
                      display: "grid",
                      gap: "12px",
                      padding: "18px",
                      borderRadius: "20px",
                      background: "rgba(255,255,255,0.04)",
                      border: "1px solid rgba(255,255,255,0.08)"
                    }}
                  >
                    <div style={{ display: "flex", justifyContent: "space-between", gap: "12px", flexWrap: "wrap" }}>
                      <div style={{ display: "grid", gap: "6px" }}>
                        <strong>{journal.title}</strong>
                        <span className="muted">{journal.hostName ?? "Host não informado"}</span>
                      </div>
                      <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
                        <span className="status-chip">Score {journal.editorialScore}</span>
                        <span className="status-chip">{formatRecommendationLevel(journal.recommendationLevel)}</span>
                      </div>
                    </div>

                    <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
                      <span className="muted">H-index: {journal.hIndex ?? "Não informado"}</span>
                      <span className="muted">Acesso aberto: {journal.isOpenAccess ? "sim" : "não"}</span>
                      <span className="muted">Ocorrências relacionadas: {journal.matchCount}</span>
                      <span className="muted">Indexadores aderentes: {journal.matchedSelectedIndexers.length}</span>
                    </div>

                    <div className="periodicos-decision-line">
                      <strong>Leitura editorial:</strong>
                      <span>
                        {journal.recommendationLevel === "candidata_forte"
                          ? "priorize validação de escopo e instruções aos autores."
                          : journal.recommendationLevel === "candidata_moderada"
                            ? "boa para comparação, mas confirme aderência e indexação."
                            : "mantenha como hipótese; ainda precisa de confirmação manual forte."}
                      </span>
                    </div>

                    <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                      {journal.matchedSelectedIndexers.length > 0 ? (
                        journal.matchedSelectedIndexers.map((indexer) => (
                          <span key={indexer} className="status-chip">
                            {indexer}
                          </span>
                        ))
                      ) : (
                        <span className="muted">Sem indexadores priorizados detectados automaticamente</span>
                      )}
                    </div>

                    <details className="periodicos-validation-details">
                      <summary>Verificar indexadores prioritários</summary>
                      <div className="periodicos-validation-grid">
                        {validationLinks.map((link) => (
                          <a href={link.href} key={link.indexer} rel="noreferrer" target="_blank">
                            <span>{link.indexer}</span>
                            <small>{formatIndexerEvidence(link.indexer, journal.detectedIndexers)}</small>
                          </a>
                        ))}
                      </div>
                    </details>

                    <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                      {journal.detectedIndexers
                        .filter((indexer) => !journal.matchedSelectedIndexers.includes(indexer))
                        .map((indexer) => (
                          <span key={indexer} className="muted">
                            {indexer}
                          </span>
                        ))}
                    </div>

                    <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
                      <button
                        className="button button-primary"
                        type="button"
                        onClick={() => void saveToShortlist(journal)}
                        disabled={savingJournalId === journal.id}
                      >
                        {savingJournalId === journal.id
                          ? "Salvando..."
                          : savedEntry
                            ? "Atualizar shortlist"
                            : "Salvar na shortlist"}
                      </button>
                      <button
                        className="button button-secondary"
                        type="button"
                        onClick={() => toggleJournalComparison(journal.id)}
                      >
                        {comparedJournalIds.includes(journal.id) ? "Remover da comparação" : "Comparar"}
                      </button>

                      {journal.landingPageUrl ? (
                        <a className="button button-secondary" href={journal.landingPageUrl} target="_blank" rel="noreferrer">
                          Abrir fonte
                        </a>
                      ) : null}
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </section>

        <section className="glass-card" style={{ padding: "24px", display: "grid", gap: "14px" }}>
          <div style={{ display: "grid", gap: "4px" }}>
            <strong>Referências de apoio</strong>
            <span className="muted">
              Quando a decisão editorial estiver encaminhada, use esta área para puxar referências relacionadas para o manuscrito.
            </span>
          </div>

          {relatedWorks.length === 0 ? (
            <div className="muted" style={{ padding: "18px", borderRadius: "18px", background: "rgba(255,255,255,0.04)" }}>
              Rode uma busca editorial para carregar referências relacionadas ao manuscrito.
            </div>
          ) : (
            <div style={{ display: "grid", gap: "12px" }}>
              {relatedWorks.map((work) => (
                <article
                  key={work.id}
                  style={{
                    display: "grid",
                    gap: "10px",
                    padding: "16px",
                    borderRadius: "16px",
                    background: "rgba(255,255,255,0.04)",
                    border: "1px solid rgba(255,255,255,0.08)"
                  }}
                >
                  <div style={{ display: "grid", gap: "6px" }}>
                    <strong>{work.title ?? "Título não informado"}</strong>
                    <span className="muted" style={{ fontSize: "0.9rem" }}>
                      {work.primary_location?.source?.display_name ?? "Fonte não informada"} -{" "}
                      {work.publication_year ?? "Ano não informado"}
                    </span>
                  </div>

                  <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
                    <button className="button button-primary" type="button" onClick={() => void handleInsertCitation(work)}>
                      Citar este artigo
                    </button>
                    <button className="button button-secondary" type="button" onClick={() => void handleCopyCitation(work)}>
                      Copiar ABNT
                    </button>
                    {work.primary_location?.landing_page_url ? (
                      <a
                        className="button button-secondary"
                        href={work.primary_location.landing_page_url}
                        rel="noreferrer"
                        target="_blank"
                      >
                        Abrir fonte
                      </a>
                    ) : null}
                  </div>

                  <p className="muted" style={{ margin: 0, fontSize: "0.88rem" }}>
                    {formatAbntCitation(work)}
                  </p>
                </article>
              ))}
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
