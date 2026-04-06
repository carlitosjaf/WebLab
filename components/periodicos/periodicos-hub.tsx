"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

import { formatAbntCitation } from "@/lib/weblab";
import {
  buildKeywordQuery,
  extractPlainText,
  getIndexerCoverageSummary,
  INDEXER_OPTIONS,
  inferIndexerSignals,
  type IndexerName
} from "@/lib/periodicos";
import type { ArticleRow } from "@/lib/types";

type OpenAlexSource = {
  id: string;
  display_name: string;
  host_organization_name?: string;
  is_oa?: boolean;
  summary_stats?: {
    h_index: number;
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
  source: OpenAlexSource;
  matchCount: number;
  detectedIndexers: IndexerName[];
  matchedSelectedIndexers: IndexerName[];
  score: number;
};

type PeriodicosHubProps = {
  articles: ArticleRow[];
};

export function PeriodicosHub({ articles }: PeriodicosHubProps) {
  const [selectedArticleId, setSelectedArticleId] = useState(articles[0]?.id ?? "");
  const [selectedIndexers, setSelectedIndexers] = useState<IndexerName[]>([
    "Scopus",
    "Web of Science",
    "Portal CAPES",
    "SciELO",
    "DOAJ"
  ]);
  const [searchOverride, setSearchOverride] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [journalResults, setJournalResults] = useState<JournalCandidate[]>([]);
  const [relatedWorks, setRelatedWorks] = useState<OpenAlexWork[]>([]);
  const [feedback, setFeedback] = useState<string | null>(null);

  useEffect(() => {
    if (!selectedArticleId && articles[0]?.id) {
      setSelectedArticleId(articles[0].id);
    }
  }, [articles, selectedArticleId]);

  const selectedArticle =
    articles.find((article) => article.id === selectedArticleId) ?? articles[0] ?? null;
  const selectedArticleText = selectedArticle ? extractPlainText(selectedArticle.conteudo_json) : "";

  const selectedQuery = useMemo(() => {
    if (searchOverride.trim()) {
      return searchOverride.trim();
    }

    return selectedArticle?.titulo ?? "";
  }, [searchOverride, selectedArticle]);

  const toggleIndexer = (indexer: IndexerName) => {
    setSelectedIndexers((current) =>
      current.includes(indexer)
        ? current.filter((item) => item !== indexer)
        : [...current, indexer]
    );
  };

  const runSearch = async () => {
    if (!selectedArticle) {
      return;
    }

    setIsLoading(true);
    setFeedback(null);
    setJournalResults([]);
    setRelatedWorks([]);

    try {
      const finalQuery = buildKeywordQuery(selectedQuery, selectedArticleText);
      const response = await fetch(
        `https://api.openalex.org/works?search=${encodeURIComponent(finalQuery)}&per-page=50`
      );
      const data = await response.json();
      const works: OpenAlexWork[] = data.results || [];
      const aggregated = new Map<string, JournalCandidate>();

      works.forEach((work) => {
        const source = work.primary_location?.source;
        if (!source?.id || !source.display_name) {
          return;
        }

        const detected = inferIndexerSignals(source);
        const coverage = getIndexerCoverageSummary(detected, selectedIndexers);
        const score =
          coverage.matched.length * 10 +
          (source.summary_stats?.h_index ?? 0) * 0.1 +
          (source.is_oa ? 2 : 0);

        const existing = aggregated.get(source.id);

        if (!existing) {
          aggregated.set(source.id, {
            source,
            matchCount: 1,
            detectedIndexers: detected,
            matchedSelectedIndexers: coverage.matched,
            score
          });
          return;
        }

        existing.matchCount += 1;
        existing.score += 1;

        coverage.matched.forEach((indexer) => {
          if (!existing.matchedSelectedIndexers.includes(indexer)) {
            existing.matchedSelectedIndexers.push(indexer);
          }
        });

        detected.forEach((indexer) => {
          if (!existing.detectedIndexers.includes(indexer)) {
            existing.detectedIndexers.push(indexer);
          }
        });
      });

      const ranked = Array.from(aggregated.values())
        .sort((a, b) => {
          if (b.matchedSelectedIndexers.length !== a.matchedSelectedIndexers.length) {
            return b.matchedSelectedIndexers.length - a.matchedSelectedIndexers.length;
          }

          if (b.matchCount !== a.matchCount) {
            return b.matchCount - a.matchCount;
          }

          return b.score - a.score;
        })
        .slice(0, 10);

      const worksForCitation = works
        .filter((work) => work.title && work.authorships?.length)
        .slice(0, 6);

      setJournalResults(ranked);
      setRelatedWorks(worksForCitation);

      if (ranked.length === 0) {
        setFeedback(
          "Nenhuma revista foi priorizada com os indexadores escolhidos. Tente relaxar alguns filtros ou refinar o tema."
        );
      }
    } catch (error) {
      console.error(error);
      setFeedback("Nao foi possivel consultar as bases no momento.");
    } finally {
      setIsLoading(false);
    }
  };

  const copyCitation = async (work: OpenAlexWork) => {
    const citation = formatAbntCitation(work);
    await navigator.clipboard.writeText(citation);
    setFeedback("Referencia copiada para a area de transferencia.");
  };

  return (
    <main className="shell">
      <div className="container" style={{ display: "grid", gap: "24px" }}>
        <section className="glass-card" style={{ padding: "28px", display: "grid", gap: "12px" }}>
          <span
            style={{
              width: "fit-content",
              padding: "8px 12px",
              borderRadius: "999px",
              background: "var(--accent-soft)",
              color: "var(--accent-strong)",
              fontWeight: 700,
              fontSize: "0.88rem"
            }}
          >
            Submissao de periodicos
          </span>
          <h1 style={{ margin: 0 }}>Localizador de revistas</h1>
          <p className="muted" style={{ margin: 0, maxWidth: "76ch" }}>
            A prioridade deste modulo e encontrar revistas para publicar o seu artigo, destacando a
            aderencia ao tema e os indexadores editoriais que voce quer atender. As referencias
            relacionadas aparecem abaixo como apoio secundario de escrita.
          </p>
        </section>

        <section
          style={{
            display: "grid",
            gridTemplateColumns: "minmax(320px, 420px) minmax(0, 1fr)",
            gap: "24px"
          }}
        >
          <aside className="glass-card" style={{ padding: "24px", display: "grid", gap: "18px", height: "fit-content" }}>
            <div style={{ display: "grid", gap: "10px" }}>
              <h2 style={{ margin: 0 }}>Contexto da busca</h2>
              <p className="muted" style={{ margin: 0 }}>
                Selecione o artigo e os indexadores que mais importam para a sua estrategia de submissao.
              </p>
            </div>

            <div className="field">
              <label htmlFor="articleSelect">Artigo base</label>
              <select
                id="articleSelect"
                onChange={(event) => setSelectedArticleId(event.target.value)}
                value={selectedArticleId}
              >
                {articles.map((article) => (
                  <option key={article.id} value={article.id}>
                    {article.titulo}
                  </option>
                ))}
              </select>
            </div>

            <div className="field">
              <label htmlFor="searchOverride">Consulta principal</label>
              <input
                id="searchOverride"
                onChange={(event) => setSearchOverride(event.target.value)}
                placeholder="Opcional. Ajuste palavras-chave ou o titulo da busca."
                value={searchOverride}
              />
            </div>

            <div style={{ display: "grid", gap: "10px" }}>
              <strong>Indexadores priorizados</strong>
              <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                {INDEXER_OPTIONS.map((indexer) => {
                  const active = selectedIndexers.includes(indexer);
                  return (
                    <button
                      key={indexer}
                      className="button"
                      onClick={() => toggleIndexer(indexer)}
                      style={{
                        background: active ? "var(--accent)" : "rgba(255,255,255,0.85)",
                        color: active ? "white" : "var(--foreground)",
                        border: active ? "none" : "1px solid rgba(36,26,19,0.08)",
                        padding: "8px 12px"
                      }}
                      type="button"
                    >
                      {indexer}
                    </button>
                  );
                })}
              </div>
            </div>

            {selectedArticle ? (
              <div
                style={{
                  display: "grid",
                  gap: "8px",
                  padding: "16px",
                  borderRadius: "20px",
                  background: "rgba(255,255,255,0.72)",
                  border: "1px solid rgba(36,26,19,0.08)"
                }}
              >
                <strong>{selectedArticle.titulo}</strong>
                <span className="muted">
                  O WebLab vai cruzar o titulo e o texto do artigo para priorizar revistas e referencias relacionadas.
                </span>
                <Link
                  className="button button-secondary"
                  href={`/editor/${selectedArticle.id}`}
                  style={{ textDecoration: "none", width: "fit-content" }}
                >
                  Abrir artigo no editor
                </Link>
              </div>
            ) : null}

            <button className="button button-primary" disabled={isLoading || !selectedArticle} onClick={() => void runSearch()} type="button">
              {isLoading ? "Buscando revistas..." : "Buscar revistas para submissao"}
            </button>
          </aside>

          <section style={{ display: "grid", gap: "24px" }}>
            <section className="glass-card" style={{ padding: "24px", display: "grid", gap: "16px" }}>
              <div style={{ display: "grid", gap: "6px" }}>
                <h2 style={{ margin: 0 }}>Revistas recomendadas</h2>
                <p className="muted" style={{ margin: 0 }}>
                  Primeiro bloco do modulo: revistas para submissao, ranqueadas por aderencia tematica e cobertura dos indexadores que voce selecionou.
                </p>
              </div>

              {feedback ? (
                <p className="muted" style={{ margin: 0 }}>
                  {feedback}
                </p>
              ) : null}

              {journalResults.length === 0 ? (
                <div
                  style={{
                    padding: "22px",
                    borderRadius: "20px",
                    background: "rgba(255,255,255,0.74)",
                    border: "1px dashed rgba(36,26,19,0.14)"
                  }}
                >
                  <strong style={{ display: "block", marginBottom: "8px" }}>
                    Nenhuma analise rodada ainda
                  </strong>
                  <span className="muted">
                    Escolha o artigo, ajuste os indexadores e inicie a busca.
                  </span>
                </div>
              ) : (
                <div style={{ display: "grid", gap: "14px" }}>
                  {journalResults.map((journal) => (
                    <article
                      key={journal.source.id}
                      style={{
                        display: "grid",
                        gap: "12px",
                        padding: "18px",
                        borderRadius: "24px",
                        background: "rgba(255,255,255,0.78)",
                        border: "1px solid rgba(36,26,19,0.08)"
                      }}
                    >
                      <div style={{ display: "flex", justifyContent: "space-between", gap: "16px", flexWrap: "wrap" }}>
                        <div style={{ display: "grid", gap: "6px" }}>
                          <strong style={{ fontSize: "1.08rem" }}>{journal.source.display_name}</strong>
                          <span className="muted">
                            {journal.source.host_organization_name ?? "Editora ou host nao identificado"}
                          </span>
                        </div>
                        <div
                          style={{
                            padding: "8px 12px",
                            borderRadius: "999px",
                            background: "var(--accent-soft)",
                            color: "var(--accent-strong)",
                            fontWeight: 700
                          }}
                        >
                          {journal.matchedSelectedIndexers.length} indexador(es) priorizado(s)
                        </div>
                      </div>

                      <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
                        <span className="muted">
                          H-index: {journal.source.summary_stats?.h_index ?? "Nao informado"}
                        </span>
                        <span className="muted">
                          Open access: {journal.source.is_oa ? "sim" : "nao"}
                        </span>
                        <span className="muted">
                          Artigos relacionados encontrados: {journal.matchCount}
                        </span>
                      </div>

                      <div style={{ display: "grid", gap: "6px" }}>
                        <strong>Indexadores detectados no fluxo atual</strong>
                        <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                          {journal.detectedIndexers.length > 0 ? (
                            journal.detectedIndexers.map((indexer) => (
                              <span
                                key={indexer}
                                style={{
                                  background: "rgba(13,122,105,0.12)",
                                  color: "var(--accent-strong)",
                                  border: "1px solid rgba(13,122,105,0.18)",
                                  padding: "6px 10px",
                                  borderRadius: "999px",
                                  fontSize: "0.84rem",
                                  fontWeight: 600
                                }}
                              >
                                {indexer}
                              </span>
                            ))
                          ) : (
                            <span className="muted">
                              Sem sinal claro de indexacao nos metadados atuais. Verifique o portal oficial da revista antes de submeter.
                            </span>
                          )}
                        </div>
                      </div>

                      <div style={{ display: "grid", gap: "6px" }}>
                        <strong>Leitura editorial</strong>
                        <span className="muted">
                          Esta recomendacao e baseada no cruzamento do tema do artigo com periodicos encontrados pela base atual. Para indexadores fechados ou sem API publica estavel, trate a sugestao como triagem inicial e confirme no portal oficial.
                        </span>
                      </div>
                    </article>
                  ))}
                </div>
              )}
            </section>

            <section className="glass-card" style={{ padding: "24px", display: "grid", gap: "16px" }}>
              <div style={{ display: "grid", gap: "6px" }}>
                <h2 style={{ margin: 0 }}>Referencias relacionadas</h2>
                <p className="muted" style={{ margin: 0 }}>
                  Funcao secundaria do modulo: encontrar boas referencias para fortalecer o texto.
                </p>
              </div>

              {relatedWorks.length === 0 ? (
                <span className="muted">As referencias aparecem depois da busca por revistas.</span>
              ) : (
                <div style={{ display: "grid", gap: "12px" }}>
                  {relatedWorks.map((work) => (
                    <article
                      key={work.id}
                      style={{
                        display: "grid",
                        gap: "10px",
                        padding: "16px",
                        borderRadius: "18px",
                        background: "rgba(255,255,255,0.72)",
                        border: "1px solid rgba(36,26,19,0.08)"
                      }}
                    >
                      <div style={{ display: "grid", gap: "4px" }}>
                        <strong>{work.title ?? "Titulo nao informado"}</strong>
                        <span className="muted">
                          {work.primary_location?.source?.display_name ?? "Fonte nao informada"} ·{" "}
                          {work.publication_year ?? "Ano nao informado"}
                        </span>
                      </div>

                      <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
                        <button className="button button-secondary" onClick={() => void copyCitation(work)} type="button">
                          Copiar ABNT
                        </button>
                        {selectedArticle ? (
                          <Link
                            className="button button-primary"
                            href={`/editor/${selectedArticle.id}`}
                            style={{ textDecoration: "none" }}
                          >
                            Abrir artigo no editor
                          </Link>
                        ) : null}
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
          </section>
        </section>
      </div>
    </main>
  );
}
