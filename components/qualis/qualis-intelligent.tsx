"use client";

import { useState } from "react";

import { formatAbntCitation } from "@/lib/weblab";

type OpenAlexSource = {
  id: string;
  display_name: string;
  host_organization_name?: string;
  is_oa?: boolean;
  summary_stats?: {
    h_index: number;
    i10_index: number;
  };
  apc_usd?: number;
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

type QualisResult = {
  source: OpenAlexSource;
  qualisEstimate: string;
  matchCount: number;
};

function estimateQualis(hIndex?: number) {
  if (!hIndex) return "Desconhecido";
  if (hIndex >= 50) return "A1";
  if (hIndex >= 25) return "A2";
  if (hIndex >= 12) return "B1";
  if (hIndex >= 5) return "B2";
  return "B3";
}

function buildKeywordQuery(query: string, articleContent?: string) {
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

  return mainKeywords.length > 0 ? mainKeywords.slice(0, 2).join(" ") : query;
}

type QualisIntelligentProps = {
  articleTitle: string;
  articleContent?: string;
  onInsertCitation?: (citation: string) => void;
};

export function QualisIntelligent({
  articleTitle,
  articleContent,
  onInsertCitation
}: QualisIntelligentProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [results, setResults] = useState<QualisResult[]>([]);
  const [relatedWorks, setRelatedWorks] = useState<OpenAlexWork[]>([]);
  const [customSearch, setCustomSearch] = useState("");
  const [copyMessage, setCopyMessage] = useState<string | null>(null);

  const searchJournals = async (query: string) => {
    if (!query.trim()) {
      return;
    }

    setIsLoading(true);
    setResults([]);
    setRelatedWorks([]);
    setCopyMessage(null);

    try {
      const finalQuery = buildKeywordQuery(query, articleContent);
      const response = await fetch(
        `https://api.openalex.org/works?search=${encodeURIComponent(finalQuery)}&per-page=40`
      );
      const data = await response.json();

      const works: OpenAlexWork[] = data.results || [];
      const sourcesMap = new Map<string, QualisResult>();

      for (const work of works) {
        const source = work.primary_location?.source;
        if (!source?.id || !source.display_name) {
          continue;
        }

        if (!sourcesMap.has(source.id)) {
          sourcesMap.set(source.id, {
            source,
            qualisEstimate: estimateQualis(source.summary_stats?.h_index),
            matchCount: 1
          });
        } else {
          sourcesMap.get(source.id)!.matchCount += 1;
        }
      }

      const parsedResults = Array.from(sourcesMap.values())
        .sort((a, b) => b.matchCount - a.matchCount)
        .slice(0, 8);

      setResults(parsedResults);
      setRelatedWorks(
        works
          .filter((work) => work.title && work.authorships?.length)
          .slice(0, 6)
      );
    } catch (error) {
      console.error(error);
      alert("Erro ao consultar o OpenAlex.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleInitialOpen = () => {
    setIsOpen(true);
    if (!results.length && articleTitle.length > 5) {
      void searchJournals(articleTitle);
    }
  };

  const handleInsert = async (work: OpenAlexWork) => {
    const citation = formatAbntCitation(work);

    if (onInsertCitation) {
      onInsertCitation(citation);
      setCopyMessage("Referência enviada para o editor.");
      return;
    }

    await navigator.clipboard.writeText(citation);
    setCopyMessage("Referência copiada para a área de transferência.");
  };

  if (!isOpen) {
    return (
      <button
        onClick={handleInitialOpen}
        className="button button-primary"
        style={{ background: "#205942", fontWeight: 600 }}
        type="button"
      >
        Encontrar periódicos e referências
      </button>
    );
  }

  return (
    <div
      className="glass-card"
      style={{ padding: "20px", marginTop: "24px", border: "2px solid #205942" }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: "16px",
          gap: "16px",
          flexWrap: "wrap"
        }}
      >
        <div style={{ display: "grid", gap: "4px" }}>
          <h3 style={{ margin: 0 }}>Motor Qualis e referências</h3>
          <p className="muted" style={{ margin: 0, fontSize: "0.9rem", maxWidth: "72ch" }}>
            O WebLab usa o OpenAlex para sugerir periódicos próximos do tema e artigos relacionados
            que podem virar citação ABNT diretamente dentro do editor.
          </p>
        </div>
        <button className="button button-secondary" onClick={() => setIsOpen(false)} type="button">
          Fechar
        </button>
      </div>

      <div style={{ display: "flex", gap: "10px", marginBottom: "20px", flexWrap: "wrap" }}>
        <input
          className="field"
          style={{
            flex: 1,
            padding: "10px",
            borderRadius: "8px",
            border: "1px solid rgba(0,0,0,0.1)",
            minWidth: "280px"
          }}
          value={customSearch || articleTitle}
          onChange={(event) => setCustomSearch(event.target.value)}
          placeholder="Palavras-chave ou título da pesquisa"
        />
        <button
          className="button button-primary"
          onClick={() => void searchJournals(customSearch || articleTitle)}
          disabled={isLoading}
          type="button"
        >
          {isLoading ? "Consultando..." : "Analisar"}
        </button>
      </div>

      {copyMessage ? (
        <p className="muted" style={{ margin: "0 0 16px 0" }}>
          {copyMessage}
        </p>
      ) : null}

      {isLoading ? (
        <div style={{ padding: "30px", textAlign: "center" }} className="muted">
          Extraindo contexto do título e do texto para localizar periódicos e trabalhos próximos do
          seu tema.
        </div>
      ) : (
        <div style={{ display: "grid", gap: "20px" }}>
          <section style={{ display: "grid", gap: "12px" }}>
            <div style={{ display: "grid", gap: "4px" }}>
              <strong>Periódicos sugeridos</strong>
              <span className="muted">
                Sinais de aderência temática com uma estimativa simples baseada em indexação e
                impacto.
              </span>
            </div>

            {results.length === 0 ? (
              <div
                className="muted"
                style={{
                  padding: "18px",
                  textAlign: "center",
                  background: "rgba(0,0,0,0.02)",
                  borderRadius: "12px"
                }}
              >
                Nenhum periódico encontrado ainda. Tente refinar a busca com termos mais específicos
                do seu tema.
              </div>
            ) : (
              <div style={{ display: "grid", gap: "12px" }}>
                {results.map((result) => (
                  <div
                    key={result.source.id}
                    style={{
                      display: "grid",
                      gap: "10px",
                      padding: "16px",
                      background: "rgba(255,255,255,0.6)",
                      borderRadius: "12px",
                      border: "1px dashed rgba(0,0,0,0.08)"
                    }}
                  >
                    <div style={{ display: "flex", justifyContent: "space-between", gap: "12px" }}>
                      <div style={{ display: "grid", gap: "4px" }}>
                        <strong style={{ fontSize: "1.05rem" }}>{result.source.display_name}</strong>
                        <span className="muted" style={{ fontSize: "0.85rem" }}>
                          {result.source.host_organization_name
                            ? `Host: ${result.source.host_organization_name}`
                            : "Fonte sem host identificado"}
                        </span>
                      </div>
                      <div
                        style={{
                          background:
                            result.qualisEstimate === "A1"
                              ? "#1e523f"
                              : result.qualisEstimate === "A2"
                                ? "#287556"
                                : result.qualisEstimate === "B1"
                                  ? "#c47d36"
                                  : "#4a3c31",
                          color: "white",
                          padding: "6px 14px",
                          borderRadius: "99px",
                          fontWeight: "bold",
                          fontSize: "1rem"
                        }}
                      >
                        {result.qualisEstimate}
                      </div>
                    </div>

                    <div style={{ display: "flex", gap: "12px", fontSize: "0.82rem", flexWrap: "wrap" }}>
                      <span className="muted">
                        H-index: {result.source.summary_stats?.h_index ?? "Não informado"}
                      </span>
                      <span className="muted">
                        Open access: {result.source.is_oa ? "sim" : "não"}
                      </span>
                      <span className="muted">Ocorrências relacionadas: {result.matchCount}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>

          <section style={{ display: "grid", gap: "12px" }}>
            <div style={{ display: "grid", gap: "4px" }}>
              <strong>Artigos para citar</strong>
              <span className="muted">
                Clique em citar para gerar a referência em ABNT e inserir direto no texto.
              </span>
            </div>

            {relatedWorks.length === 0 ? (
              <div
                className="muted"
                style={{
                  padding: "18px",
                  textAlign: "center",
                  background: "rgba(0,0,0,0.02)",
                  borderRadius: "12px"
                }}
              >
                Nenhum artigo relacionado apareceu ainda para esse conjunto de termos.
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
                      background: "rgba(255,255,255,0.72)",
                      border: "1px solid rgba(36,26,19,0.08)"
                    }}
                  >
                    <div style={{ display: "grid", gap: "6px" }}>
                      <strong>{work.title ?? "Título não informado"}</strong>
                      <span className="muted" style={{ fontSize: "0.9rem" }}>
                        {work.primary_location?.source?.display_name ?? "Fonte não informada"} ·{" "}
                        {work.publication_year ?? "Ano não informado"}
                      </span>
                    </div>

                    <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
                      <button
                        className="button button-primary"
                        onClick={() => void handleInsert(work)}
                        type="button"
                      >
                        Citar este artigo
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
      )}
    </div>
  );
}
