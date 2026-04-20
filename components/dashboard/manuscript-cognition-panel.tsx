"use client";

import { startTransition, useDeferredValue, useEffect, useMemo, useState } from "react";

import { getSupabaseClient } from "@/lib/supabaseClient";
import type { ArticleContent, ArticleRow } from "@/lib/types";
import { formatAbntCitation, formatRelativeUpdate } from "@/lib/weblab";

type DeepSectionReview = {
  section: string;
  status: "forte" | "revisar" | "ausente";
  score: number;
  diagnosis: string;
  why: string[];
  suggestions: string[];
  evidence?: string;
};

type DeepManuscriptAnalysis = {
  mode: "heuristic";
  overallScore: number;
  summary: string;
  headings: string[];
  sectionReviews: DeepSectionReview[];
  priorities: Array<{
    section: string;
    action: string;
  }>;
  nextActions: string[];
};

type ManuscriptCognitionPanelProps = {
  article: ArticleRow;
  canEdit: boolean;
  onArticleSynced: (article: ArticleRow) => void;
};

type CitationGap = {
  id: string;
  section: string;
  text: string;
  context: string;
  signal: string;
};

type ReferenceSuggestion = {
  id: string;
  title?: string;
  publication_year?: number;
  doi?: string;
  matched_terms?: string[];
  match_reason?: string;
  section_signal?: string;
  evidence_hint?: string;
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
  biblio?: {
    volume?: string;
    issue?: string;
    first_page?: string;
    last_page?: string;
  };
};

function hasContent(content: ArticleContent | null) {
  return Boolean(content?.content?.length);
}

const claimMarkers = [
  "evidencia",
  "evidencias",
  "estudos",
  "pesquisas",
  "literatura",
  "dados",
  "resultados",
  "indicam",
  "mostram",
  "sugerem",
  "demonstram",
  "revelam",
  "apontam",
  "associado",
  "associada",
  "impacto",
  "prevalencia",
  "desigualdade",
  "fatores",
  "risco",
];

const citationPattern = /\([A-ZÀ-Ý][A-ZÀ-Ý\s;,&.-]+,\s*(?:19|20)\d{2}[a-z]?\)|\b(?:19|20)\d{2}\b.*\b[A-ZÀ-Ý][A-ZÀ-Ý]{2,}\b|\bdoi\b/i;
const evidenceVerbPattern = /\b(?:indica|indicam|mostra|mostram|revela|revelam|demonstra|demonstram|aponta|apontam|sugere|sugerem|associa|associam|corresponde|impacta|aumenta|reduz)\b/i;
const quantitativeClaimPattern = /\b\d+(?:[.,]\d+)?\s*(?:%|por cento|vezes|anos|meses|dias|casos|participantes|mulheres|homens)\b/i;

function normalizeSectionName(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function getNodeText(node: Record<string, unknown>): string {
  const text = typeof node.text === "string" ? node.text : "";
  const content = Array.isArray(node.content) ? node.content : [];
  const nested = content
    .filter((child): child is Record<string, unknown> => Boolean(child) && typeof child === "object")
    .map(getNodeText)
    .join(" ");

  return `${text} ${nested}`.replace(/\s+/g, " ").trim();
}

function detectSectionLabels(text: string) {
  const normalized = normalizeSectionName(text);

  if (!normalized) {
    return [] as string[];
  }

  const aliases: Array<[string, string[]]> = [
    ["Resumo", ["resumo", "abstract"]],
    ["Introducao", ["introducao", "introdução", "apresentacao", "apresentação"]],
    ["Metodologia", ["metodologia", "metodo", "método", "metodos", "métodos"]],
    ["Resultados", ["resultados", "achados"]],
    ["Discussao", ["discussao", "discussão", "resultados e discussão", "resultados e discussao"]],
    ["Conclusao", ["conclusao", "conclusão"]],
    ["Referencias", ["referencias", "referências", "bibliografia"]],
  ];

  return aliases
    .filter(([, values]) =>
      values.some((alias) => {
        const normalizedAlias = normalizeSectionName(alias);
        return (
          normalized === normalizedAlias ||
          normalized.startsWith(`${normalizedAlias}:`) ||
          normalized.startsWith(`${normalizedAlias} `)
        );
      })
    )
    .map(([label]) => label);
}

function includesAny(text: string, markers: string[]) {
  return markers.some((marker) => text.includes(marker));
}

function collectSectionContexts(content: ArticleContent | null) {
  const sectionTexts = new Map<string, string>();
  let currentSection = "Texto geral";

  (content?.content ?? []).forEach((node) => {
    const nodeText = getNodeText(node as Record<string, unknown>);
    const labels = detectSectionLabels(nodeText);

    if ((node as Record<string, unknown>).type === "heading" && labels.length > 0) {
      currentSection = labels[0] ?? currentSection;
      if (!sectionTexts.has(currentSection)) {
        sectionTexts.set(currentSection, "");
      }
      return;
    }

    if (nodeText) {
      sectionTexts.set(
        currentSection,
        `${sectionTexts.get(currentSection) ?? ""} ${nodeText}`.replace(/\s+/g, " ").trim()
      );
    }
  });

  return sectionTexts;
}

function detectCitationGaps(content: ArticleContent | null) {
  const sectionTexts = collectSectionContexts(content);
  const gaps: CitationGap[] = [];

  sectionTexts.forEach((sectionText, section) => {
    sectionText
      .split(/(?<=[.!?])\s+/)
      .map((sentence) => sentence.trim())
      .filter((sentence) => sentence.length > 80)
      .forEach((sentence, index) => {
        const lowered = sentence.toLowerCase();
        const asksForCitation =
          (includesAny(lowered, claimMarkers) || evidenceVerbPattern.test(lowered) || quantitativeClaimPattern.test(lowered)) &&
          !citationPattern.test(sentence);

        if (asksForCitation) {
          gaps.push({
            id: `${section}-${index}`,
            section,
            text: sentence,
            context: sectionText.slice(0, 1200),
            signal: "O trecho usa linguagem de achado, evidencia ou contraste e tende a pedir fonte.",
          });
        }
      });
  });

  return gaps.slice(0, 5);
}

export function ManuscriptCognitionPanel({
  article,
  canEdit,
  onArticleSynced,
}: ManuscriptCognitionPanelProps) {
  const [analysis, setAnalysis] = useState<DeepManuscriptAnalysis | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [activeGapId, setActiveGapId] = useState<string | null>(null);
  const [referenceSuggestions, setReferenceSuggestions] = useState<ReferenceSuggestion[]>([]);
  const [referenceMessage, setReferenceMessage] = useState<string | null>(null);
  const [isFetchingReferences, setIsFetchingReferences] = useState(false);
  const [copiedHint, setCopiedHint] = useState<string | null>(null);

  const deferredContent = useDeferredValue(article.conteudo_json);
  const availableContent = hasContent(deferredContent);
  const citationGaps = useMemo(() => detectCitationGaps(deferredContent), [deferredContent]);
  const activeGap = useMemo(
    () => citationGaps.find((gap) => gap.id === activeGapId) ?? citationGaps[0] ?? null,
    [activeGapId, citationGaps]
  );

  const runAnalysis = async (content: ArticleContent | null, preferredMessage?: string | null) => {
    if (!hasContent(content)) {
      setAnalysis(null);
      setMessage(preferredMessage ?? "Ainda nao ha conteudo suficiente para a leitura cognitiva.");
      return;
    }

    setIsAnalyzing(true);
    try {
      const response = await fetch("/api/manuscrito/analisar", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ content }),
      });

      const payload = (await response.json()) as DeepManuscriptAnalysis | { message?: string };
      if (!response.ok) {
        throw new Error("message" in payload && payload.message ? payload.message : "Nao foi possivel analisar o manuscrito.");
      }

      startTransition(() => {
        setAnalysis(payload as DeepManuscriptAnalysis);
        setMessage(preferredMessage ?? "Leitura cognitiva atualizada a partir do manuscrito conectado.");
      });
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Nao foi possivel atualizar a leitura cognitiva.");
    } finally {
      setIsAnalyzing(false);
    }
  };

  useEffect(() => {
    void runAnalysis(deferredContent, null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [article.id, article.updated_at, article.google_last_synced_at, deferredContent]);

  useEffect(() => {
    if (!activeGapId && citationGaps[0]) {
      setActiveGapId(citationGaps[0].id);
    }
  }, [activeGapId, citationGaps]);

  const handleSyncFromGoogle = async () => {
    setIsSyncing(true);
    setMessage(null);

    try {
      const supabase = getSupabaseClient();
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session?.access_token) {
        throw new Error("Sua sessao expirou. Entre novamente antes de sincronizar.");
      }

      const response = await fetch("/api/google/docs/sync", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ articleId: article.id }),
      });

      const payload = (await response.json()) as
        | { error?: string }
        | { article: ArticleRow; importedBlocks: number; syncedAt: string };

      if (!response.ok || !("article" in payload)) {
        throw new Error("error" in payload && payload.error ? payload.error : "Nao foi possivel sincronizar o manuscrito.");
      }

      onArticleSynced(payload.article);
      await runAnalysis(
        payload.article.conteudo_json,
        `Google Docs sincronizado com ${payload.importedBlocks} bloco(s) em ${formatRelativeUpdate(payload.syncedAt)}.`
      );
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Nao foi possivel sincronizar o manuscrito.");
    } finally {
      setIsSyncing(false);
    }
  };

  const handleCopy = async (label: string, value: string) => {
    try {
      await navigator.clipboard.writeText(value);
      setCopiedHint(label);
      window.setTimeout(() => setCopiedHint((current) => (current === label ? null : current)), 1800);
    } catch {
      setMessage("Nao consegui copiar automaticamente. Tente de novo em alguns segundos.");
    }
  };

  const handleFetchReferences = async (gap: CitationGap) => {
    setActiveGapId(gap.id);
    setIsFetchingReferences(true);
    setReferenceSuggestions([]);
    setReferenceMessage(null);

    try {
      const response = await fetch("/api/referencias/sugerir", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          claim: gap.text,
          section: gap.section,
          sectionContext: gap.context,
          context: JSON.stringify(article.conteudo_json).slice(0, 4000),
          usedReferences: [],
        }),
      });

      const payload = (await response.json()) as {
        works?: ReferenceSuggestion[];
        message?: string;
      };

      if (!response.ok) {
        throw new Error(payload.message ?? "Nao foi possivel buscar referencias agora.");
      }

      setReferenceSuggestions(payload.works ?? []);
      setReferenceMessage(
        payload.works?.length
          ? "Sugestoes carregadas a partir de fonte verificavel."
          : "Nao encontrei sugestoes fortes para esse trecho. Vale refinar o argumento ou ampliar o contexto."
      );
    } catch (error) {
      setReferenceMessage(error instanceof Error ? error.message : "Nao foi possivel buscar referencias.");
    } finally {
      setIsFetchingReferences(false);
    }
  };

  const buildSectionAction = (review: DeepSectionReview) => {
    const normalized = normalizeSectionName(review.section);
    if (normalized.includes("resumo")) {
      return "Resumo\n\nObjetivo:\nMetodo:\nAchado principal:\nContribuicao:";
    }
    if (normalized.includes("introdu")) {
      return "Introducao\n\nContexto do problema:\nLacuna da literatura:\nObjetivo do estudo:";
    }
    if (normalized.includes("metod")) {
      return "Metodologia\n\nFonte de dados ou participantes:\nProcedimentos de coleta:\nEstrategia analitica:";
    }
    if (normalized.includes("result")) {
      return "Resultados\n\nEixo 1:\nEixo 2:\nAchados centrais:";
    }
    if (normalized.includes("discuss")) {
      return "Discussao\n\nDialogo com a literatura:\nImplicacoes:\nLimitacoes:";
    }
    if (normalized.includes("conclus")) {
      return "Conclusao\n\nSintese final:\nContribuicao central:";
    }

    return `${review.section}\n\n${review.suggestions[0] ?? "Desenvolva esta secao com funcao cientifica clara."}`;
  };

  const sectionCounts = useMemo(() => {
    if (!analysis) {
      return {
        strong: 0,
        revise: 0,
        missing: 0,
      };
    }

    return analysis.sectionReviews.reduce(
      (accumulator, review) => {
        if (review.status === "forte") {
          accumulator.strong += 1;
        } else if (review.status === "revisar") {
          accumulator.revise += 1;
        } else {
          accumulator.missing += 1;
        }

        return accumulator;
      },
      { strong: 0, revise: 0, missing: 0 }
    );
  }, [analysis]);

  return (
    <section className="manuscript-cognition-shell">
      <div className="manuscript-cognition-shell__head">
        <div>
          <span className="eyebrow">leitura cognitiva</span>
          <h2>O manuscrito conectado ja pode ser lido aqui</h2>
          <p>
            Sincronize o texto do Google Docs e deixe o WebLab apontar lacunas estruturais, prioridades de revisao
            e proximo passo editorial sem precisar voltar para o editor antigo.
          </p>
        </div>

        <div className="manuscript-cognition-shell__actions">
          {article.google_doc_id && canEdit ? (
            <button
              className="lovable-primary-link manuscript-cognition-shell__button"
              disabled={isSyncing}
              onClick={() => void handleSyncFromGoogle()}
              type="button"
            >
              {isSyncing ? "Sincronizando..." : "Sincronizar do Google Docs"}
            </button>
          ) : null}
          <button
            className="lovable-small-button manuscript-cognition-shell__button"
            disabled={isAnalyzing || !availableContent}
            onClick={() => void runAnalysis(article.conteudo_json, "Leitura cognitiva atualizada.")}
            type="button"
          >
            {isAnalyzing ? "Lendo manuscrito..." : "Atualizar leitura"}
          </button>
        </div>
      </div>

      <div className="manuscript-cognition-shell__meta">
        <span className="status-chip">
          {analysis ? `Score estrutural ${analysis.overallScore}` : "Sem analise ativa"}
        </span>
        <span className="status-chip">{analysis ? `${analysis.headings.length} secoes detectadas` : "Sem secoes detectadas"}</span>
        <span className="status-chip">{analysis ? `${analysis.priorities.length} prioridade(s)` : "Sem prioridades"}</span>
        <span className="status-chip">
          {article.google_last_synced_at
            ? `Google Docs sincronizado em ${formatRelativeUpdate(article.google_last_synced_at)}`
            : "Google Docs ainda nao sincronizado"}
        </span>
      </div>

      {message ? <p className="manuscript-cognition-shell__message">{message}</p> : null}

      {!analysis ? (
        <div className="manuscript-cognition-empty">
          <strong>A leitura cognitiva ainda nao tem base suficiente.</strong>
          <p>
            {article.google_doc_id
              ? "Sincronize o documento para importar o texto real do Google Docs e destravar a analise."
              : "Crie ou vincule o Google Docs do manuscrito para comecar a leitura automatica."}
          </p>
        </div>
      ) : (
        <div className="manuscript-cognition-grid">
          <article className="manuscript-cognition-card">
            <span className="eyebrow">sintese</span>
            <h3>Panorama do manuscrito</h3>
            <p>{analysis.summary}</p>
            <div className="manuscript-cognition-stats">
              <div>
                <strong>{sectionCounts.strong}</strong>
                <span>fortes</span>
              </div>
              <div>
                <strong>{sectionCounts.revise}</strong>
                <span>em revisao</span>
              </div>
              <div>
                <strong>{sectionCounts.missing}</strong>
                <span>ausentes</span>
              </div>
            </div>
          </article>

          <article className="manuscript-cognition-card">
            <span className="eyebrow">proximos passos</span>
            <h3>O que atacar primeiro</h3>
            <div className="manuscript-cognition-list">
              {analysis.nextActions.slice(0, 4).map((action) => (
                <div key={action}>
                  <strong>{action}</strong>
                </div>
              ))}
            </div>
          </article>

          <article className="manuscript-cognition-card">
            <span className="eyebrow">referencias inteligentes</span>
            <h3>Trechos que ainda pedem fonte</h3>
            {activeGap ? (
              <>
                <div className="manuscript-cognition-gap">
                  <strong>{activeGap.section}</strong>
                  <p>{activeGap.text}</p>
                  <small>{activeGap.signal}</small>
                </div>
                <div className="manuscript-cognition-inline-actions">
                  <button
                    className="lovable-small-button manuscript-cognition-shell__button"
                    disabled={isFetchingReferences}
                    onClick={() => void handleFetchReferences(activeGap)}
                    type="button"
                  >
                    {isFetchingReferences ? "Buscando fontes..." : "Buscar fontes para este trecho"}
                  </button>
                  <button
                    className="lovable-small-button manuscript-cognition-shell__button"
                    onClick={() => void handleCopy("Trecho copiado", activeGap.text)}
                    type="button"
                  >
                    Copiar trecho
                  </button>
                </div>
                {referenceMessage ? <p className="manuscript-cognition-shell__message">{referenceMessage}</p> : null}
                {referenceSuggestions.length > 0 ? (
                  <div className="manuscript-cognition-reference-list">
                    {referenceSuggestions.map((suggestion) => (
                      <div className="manuscript-cognition-reference" key={suggestion.id}>
                        <div className="manuscript-cognition-reference__head">
                          <strong>{suggestion.title ?? "Paper sugerido"}</strong>
                          <span>{suggestion.publication_year ?? "s.d."}</span>
                        </div>
                        <small>
                          {suggestion.primary_location?.source?.display_name ?? "Fonte nao informada"}
                          {suggestion.match_reason ? ` · ${suggestion.match_reason}` : ""}
                        </small>
                        <div className="manuscript-cognition-inline-actions">
                          <button
                            className="lovable-small-button"
                            onClick={() => void handleCopy("Referencia ABNT copiada", formatAbntCitation(suggestion))}
                            type="button"
                          >
                            Copiar referencia ABNT
                          </button>
                          {suggestion.primary_location?.landing_page_url ? (
                            <a
                              className="lovable-small-button manuscript-cognition-link-button"
                              href={suggestion.primary_location.landing_page_url}
                              rel="noreferrer"
                              target="_blank"
                            >
                              Abrir paper
                            </a>
                          ) : null}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : null}
              </>
            ) : (
              <p>
                Ainda nao encontrei afirmacoes fortes sem citacao no texto sincronizado. Depois da proxima sincronizacao,
                essa bancada volta a observar lacunas de sustentacao.
              </p>
            )}
          </article>

          <article className="manuscript-cognition-card manuscript-cognition-card--wide">
            <span className="eyebrow">leitura por secao</span>
            <h3>Diagnostico estrutural</h3>
            <div className="manuscript-cognition-review-list">
              {analysis.sectionReviews.map((review) => (
                <div className={`manuscript-cognition-review manuscript-cognition-review--${review.status}`} key={review.section}>
                  <div className="manuscript-cognition-review__head">
                    <strong>{review.section}</strong>
                    <span>{review.status === "forte" ? "forte" : review.status === "revisar" ? "revisar" : "ausente"}</span>
                  </div>
                  <p>{review.diagnosis}</p>
                  {review.suggestions[0] ? <small>{review.suggestions[0]}</small> : null}
                  {review.status !== "forte" ? (
                    <div className="manuscript-cognition-inline-actions">
                      <button
                        className="lovable-small-button"
                        onClick={() => void handleCopy(`Bloco-guia de ${review.section} copiado`, buildSectionAction(review))}
                        type="button"
                      >
                        Copiar bloco-guia
                      </button>
                    </div>
                  ) : null}
                </div>
              ))}
            </div>
          </article>
        </div>
      )}
      {copiedHint ? <p className="manuscript-cognition-shell__message">{copiedHint}</p> : null}
    </section>
  );
}
