"use client";

import { startTransition, useEffect, useMemo, useState } from "react";

import { getSupabaseClient } from "@/lib/supabaseClient";
import type { ArticleContent, ArticleRow } from "@/lib/types";
import { formatRelativeUpdate } from "@/lib/weblab";

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

function hasContent(content: ArticleContent | null) {
  return Boolean(content?.content?.length);
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

  const availableContent = hasContent(article.conteudo_json);

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
    void runAnalysis(article.conteudo_json, null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [article.id, article.updated_at, article.google_last_synced_at]);

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
                </div>
              ))}
            </div>
          </article>
        </div>
      )}
    </section>
  );
}
