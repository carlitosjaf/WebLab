"use client";

import Link from "next/link";
import type { Route } from "next";
import { useEffect, useMemo, useState } from "react";

import {
  INDEXER_OPTIONS,
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
      extractNodeText(node).toLowerCase().replace(/\s+/g, " ").trim() === "referencias"
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
          content: [{ type: "text", text: "Referencias" }]
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
        setSavedShortlist(data ?? []);
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
  const strongCandidateCount = filteredJournalResults.filter(
    (journal) => journal.recommendationLevel === "candidata_forte"
  ).length;
  const needsValidationCount = filteredJournalResults.filter(
    (journal) => journal.recommendationLevel === "precisa_validar"
  ).length;

  const toggleIndexer = (indexer: IndexerName) => {
    setSelectedIndexers((current) =>
      current.includes(indexer) ? current.filter((item) => item !== indexer) : [...current, indexer]
    );
  };

  const searchJournals = async () => {
    if (!selectedArticle) {
      setSearchMessage("Selecione um artigo para buscar revistas e referencias.");
      return;
    }

    setIsLoading(true);
    setSearchMessage(null);
    setCitationMessage(null);

    try {
      const articleText = extractPlainText(selectedArticle.conteudo_json);
      const querySeed = searchInput.trim() || selectedArticle.titulo;
      const keywordQuery = buildKeywordQuery(querySeed, articleText);
      const response = await fetch(
        `https://api.openalex.org/works?search=${encodeURIComponent(keywordQuery)}&per-page=40`
      );

      if (!response.ok) {
        throw new Error("Nao foi possivel consultar o OpenAlex agora.");
      }

      const payload = (await response.json()) as { results?: OpenAlexWork[] };
      const works = payload.results ?? [];
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
        throw new Error("Sessao expirada. Entre novamente para salvar revistas.");
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
        created_by: user.id
      };

      const { data, error } = await supabase
        .from("periodicos_shortlists")
        .upsert(payload, { onConflict: "artigo_id,journal_id" })
        .select("*")
        .single();

      if (error || !data) {
        throw new Error(error?.message ?? "Nao foi possivel salvar a revista.");
      }

      setSavedShortlist((current) => {
        const next = current.filter((entry) => entry.id !== data.id && entry.journal_id !== data.journal_id);
        return [data, ...next].sort((left, right) => right.editorial_score - left.editorial_score);
      });
    } catch (error) {
      setSearchMessage(error instanceof Error ? error.message : "Erro ao salvar shortlist.");
    } finally {
      setSavingJournalId(null);
    }
  };

  const updateShortlistEntry = async (
    entryId: string,
    patch: Database["public"]["Tables"]["periodicos_shortlists"]["Update"]
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
      throw new Error(error?.message ?? "Nao foi possivel atualizar a shortlist.");
    }

    setSavedShortlist((current) =>
      current
        .map((entry) => (entry.id === entryId ? data : entry))
        .sort((left, right) => right.editorial_score - left.editorial_score)
    );
  };

  const removeShortlistEntry = async (entryId: string) => {
    const supabase = getSupabaseClient();
    const { error } = await supabase.from("periodicos_shortlists").delete().eq("id", entryId);

    if (error) {
      throw new Error(error.message);
    }

    setSavedShortlist((current) => current.filter((entry) => entry.id !== entryId));
  };

  const handleCopyCitation = async (work: OpenAlexWork) => {
    const citation = formatAbntCitation(work);
    await navigator.clipboard.writeText(citation);
    setCitationMessage("Referencia copiada para a area de transferencia.");
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
    setCitationMessage("Referencia enviada para o artigo selecionado.");
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
              <strong>{needsValidationCount}</strong>
              <span>a validar</span>
            </article>
          </div>
        </section>

        <section className="glass-card" style={{ padding: "24px", display: "grid", gap: "18px" }}>
          <div style={{ display: "grid", gap: "8px" }}>
            <strong>1. Protocolo de busca</strong>
            <span className="muted">
              Escolha o manuscrito, refine o recorte tematico e diga ao WebLab quais indexadores pesam mais na decisao.
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
              <span className="muted">Ultima edicao: {formatRelativeUpdate(selectedArticle?.updated_at ?? null)}</span>
              <Link
                href={selectedArticle ? (`/editor/${selectedArticle.id}` as Route) : ("/dashboard" as Route)}
                className="muted"
              >
                {selectedArticle ? "Abrir manuscrito no editor" : "Criar manuscrito na Home"}
              </Link>
            </div>
          </div>

          <div style={{ display: "grid", gap: "10px" }}>
            <strong>2. Prioridades de indexacao</strong>
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
              <span className="muted">Minimo de indexadores priorizados</span>
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
                    {value === 0 ? "Sem corte minimo" : `${value} ou mais`}
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
        </section>

        <section className="glass-card" style={{ padding: "24px", display: "grid", gap: "14px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: "12px", flexWrap: "wrap" }}>
            <div style={{ display: "grid", gap: "4px" }}>
              <strong>Caderno de shortlist</strong>
              <span className="muted">
                Salve revistas por manuscrito, marque favoritas e deixe claro quais sao as candidatas mais fortes.
              </span>
            </div>
            <span className="muted">
              {loadingShortlist ? "Carregando shortlist..." : `${savedShortlist.length} revista(s) salvas`}
            </span>
          </div>

          {savedShortlist.length > 0 ? (
            <div className="periodicos-shortlist-summary" aria-label="Resumo da shortlist">
              <span>{savedShortlist.filter((entry) => entry.recommendation_level === "candidata_forte").length} fortes</span>
              <span>{savedShortlist.filter((entry) => entry.recommendation_level === "candidata_moderada").length} moderadas</span>
              <span>{savedShortlist.filter((entry) => entry.recommendation_level === "precisa_validar").length} a validar</span>
              <span>{favoriteCount} favoritas</span>
            </div>
          ) : null}

          {savedShortlist.length === 0 ? (
            <div
              className="muted"
              style={{ padding: "18px", borderRadius: "18px", background: "rgba(255,255,255,0.04)" }}
            >
              Nenhuma revista foi salva ainda. Use o radar abaixo para montar sua shortlist de submissao.
            </div>
          ) : (
            <div style={{ display: "grid", gap: "12px" }}>
              {savedShortlist.map((entry) => (
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
                      <span className="muted">{entry.host_name ?? "Host nao informado"}</span>
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
                    <span className="muted">{entry.is_favorite ? "Favorita" : "Ainda nao favorita"}</span>
                  </div>

                  <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                    {entry.matched_indexers.map((indexer) => (
                      <span key={indexer} className="status-chip">
                        {indexer}
                      </span>
                    ))}
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
                      className="button button-secondary"
                      type="button"
                      onClick={() => void removeShortlistEntry(entry.id)}
                    >
                      Remover da shortlist
                    </button>

                    {entry.source_url ? (
                      <a className="button button-secondary" href={entry.source_url} rel="noreferrer" target="_blank">
                        Abrir fonte
                      </a>
                    ) : null}
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>

        <section className="glass-card" style={{ padding: "24px", display: "grid", gap: "14px" }}>
          <div style={{ display: "grid", gap: "4px" }}>
            <strong>Revistas candidatas</strong>
            <span className="muted">
              O ranking combina aderencia tematica, peso dos indexadores escolhidos, acesso aberto e sinais editoriais detectados.
            </span>
          </div>

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
                        <span className="muted">{journal.hostName ?? "Host nao informado"}</span>
                      </div>
                      <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
                        <span className="status-chip">Score {journal.editorialScore}</span>
                        <span className="status-chip">{formatRecommendationLevel(journal.recommendationLevel)}</span>
                      </div>
                    </div>

                    <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
                      <span className="muted">H-index: {journal.hIndex ?? "Nao informado"}</span>
                      <span className="muted">Acesso aberto: {journal.isOpenAccess ? "sim" : "nao"}</span>
                      <span className="muted">Ocorrencias relacionadas: {journal.matchCount}</span>
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
            <strong>Referencias de apoio</strong>
            <span className="muted">
              Quando a decisao editorial estiver encaminhada, use esta area para puxar referencias relacionadas para o manuscrito.
            </span>
          </div>

          {relatedWorks.length === 0 ? (
            <div className="muted" style={{ padding: "18px", borderRadius: "18px", background: "rgba(255,255,255,0.04)" }}>
              Rode uma busca editorial para carregar referencias relacionadas ao manuscrito.
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
                    <strong>{work.title ?? "Titulo nao informado"}</strong>
                    <span className="muted" style={{ fontSize: "0.9rem" }}>
                      {work.primary_location?.source?.display_name ?? "Fonte nao informada"} -{" "}
                      {work.publication_year ?? "Ano nao informado"}
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
