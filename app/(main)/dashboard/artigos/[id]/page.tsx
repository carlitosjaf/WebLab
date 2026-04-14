"use client";

import Link from "next/link";
import type { Route } from "next";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

import { formatRecommendationLevel } from "@/lib/periodicos";
import { getSupabaseClient } from "@/lib/supabaseClient";
import type {
  ArticleCommentRow,
  ArticleRow,
  ArticleVersionRow,
  Database,
  EvidenceScreeningSetRow
} from "@/lib/types";
import {
  countArticleWords,
  formatRelativeUpdate,
  formatStatusLabel,
  getTeamBadgeTone
} from "@/lib/weblab";

type SavedShortlist = Database["public"]["Tables"]["periodicos_shortlists"]["Row"];
type TeamRow = Database["public"]["Tables"]["equipes"]["Row"];
type ChecklistRow = Database["public"]["Tables"]["plataforma_brasil_checklists"]["Row"];

type ReviewComment = ArticleCommentRow & {
  authorName?: string | null;
};

type VersionSnapshot = ArticleVersionRow & {
  authorName?: string | null;
};

function getChecklistProgress(entry: SavedShortlist) {
  const items = [
    entry.escopo_conferido,
    entry.indexadores_confirmados,
    entry.taxas_conferidas,
    entry.diretrizes_conferidas,
    entry.acesso_aberto_conferido,
    entry.template_conferido
  ];

  const completed = items.filter(Boolean).length;
  return {
    completed,
    total: items.length
  };
}

function getSubmissionReadiness(entry: SavedShortlist) {
  const progress = getChecklistProgress(entry);
  const percent = Math.round((progress.completed / progress.total) * 100);

  if (percent >= 84) {
    return { percent, label: "quase pronta" };
  }

  if (percent >= 50) {
    return { percent, label: "em validacao" };
  }

  return { percent, label: "triagem inicial" };
}

export default function ArticleSubmissionPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const [article, setArticle] = useState<ArticleRow | null>(null);
  const [teamName, setTeamName] = useState<string | null>(null);
  const [canEdit, setCanEdit] = useState(false);
  const [shortlist, setShortlist] = useState<SavedShortlist[]>([]);
  const [screeningSets, setScreeningSets] = useState<EvidenceScreeningSetRow[]>([]);
  const [comments, setComments] = useState<ReviewComment[]>([]);
  const [versions, setVersions] = useState<VersionSnapshot[]>([]);
  const [checklist, setChecklist] = useState<ChecklistRow | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;

    const loadSubmissionPanel = async () => {
      const supabase = getSupabaseClient();
      setIsLoading(true);

      const {
        data: { user },
        error: userError
      } = await supabase.auth.getUser();

      if (userError || !user) {
        if (isMounted) {
          router.replace("/");
        }
        return;
      }

      const [{ data: profile }, articleResult] = await Promise.all([
        supabase.from("perfis").select("id, equipe_id, role").eq("id", user.id).maybeSingle(),
        supabase
          .from("artigos")
          .select("id, titulo, status, conteudo_json, autor_id, equipe_id, updated_at, last_editor_id")
          .eq("id", params.id)
          .maybeSingle()
      ]);

      if (!articleResult.data || articleResult.error) {
        if (isMounted) {
          setErrorMessage(articleResult.error?.message ?? "Nao foi possivel carregar o manuscrito.");
          setIsLoading(false);
        }
        return;
      }

      const articleData = articleResult.data as ArticleRow;
      const allowEdit =
        profile?.role === "coordenador_geral" || (Boolean(profile?.equipe_id) && profile?.equipe_id === articleData.equipe_id);

      const [teamsResult, shortlistResult, screeningResult, commentsResult, versionsResult, checklistResult] =
        await Promise.all([
          supabase.from("equipes").select("id, nome, codigo_convite").eq("id", articleData.equipe_id).maybeSingle(),
          supabase
            .from("periodicos_shortlists")
            .select("*")
            .eq("artigo_id", articleData.id)
            .order("is_favorite", { ascending: false })
            .order("editorial_score", { ascending: false }),
          supabase
            .from("triagem_conjuntos")
            .select("*")
            .eq("artigo_id", articleData.id)
            .order("updated_at", { ascending: false, nullsFirst: false }),
          supabase
            .from("artigo_comentarios")
            .select("*")
            .eq("artigo_id", articleData.id)
            .order("created_at", { ascending: false }),
          allowEdit
            ? supabase
                .from("artigo_versoes")
                .select("*")
                .eq("artigo_id", articleData.id)
                .order("created_at", { ascending: false })
                .limit(8)
            : Promise.resolve({ data: [] as ArticleVersionRow[], error: null }),
          allowEdit
            ? supabase.from("plataforma_brasil_checklists").select("*").eq("equipe_id", articleData.equipe_id).maybeSingle()
            : Promise.resolve({ data: null as ChecklistRow | null, error: null })
        ]);

      const profileIds = Array.from(
        new Set(
          (commentsResult.data ?? [])
            .map((entry) => entry.created_by)
            .concat((versionsResult.data ?? []).map((entry) => entry.created_by))
            .filter(Boolean)
        )
      );

      const { data: people } = profileIds.length
        ? await supabase.from("perfis").select("id, nome_completo").in("id", profileIds)
        : { data: [] as Array<{ id: string; nome_completo: string | null }> };

      const names = new Map((people ?? []).map((person) => [person.id, person.nome_completo ?? "Membro da equipe"]));

      if (!isMounted) {
        return;
      }

      setArticle(articleData);
      setCanEdit(Boolean(allowEdit));
      setTeamName((teamsResult.data as TeamRow | null)?.nome ?? null);
      setShortlist((shortlistResult.data ?? []) as SavedShortlist[]);
      setScreeningSets((screeningResult.data ?? []) as EvidenceScreeningSetRow[]);
      setComments(
        ((commentsResult.data ?? []) as ArticleCommentRow[]).map((entry) => ({
          ...entry,
          authorName: names.get(entry.created_by) ?? "Membro da equipe"
        }))
      );
      setVersions(
        ((versionsResult.data ?? []) as ArticleVersionRow[]).map((entry) => ({
          ...entry,
          authorName: names.get(entry.created_by) ?? "Membro da equipe"
        }))
      );
      setChecklist((checklistResult.data as ChecklistRow | null) ?? null);
      setErrorMessage(null);
      setIsLoading(false);
    };

    if (params.id) {
      void loadSubmissionPanel();
    }

    return () => {
      isMounted = false;
    };
  }, [params.id, router]);

  const prioritizedJournal = useMemo(() => {
    if (shortlist.length === 0) {
      return null;
    }

    return [...shortlist].sort((left, right) => {
      if (left.is_favorite !== right.is_favorite) {
        return Number(right.is_favorite) - Number(left.is_favorite);
      }

      const readinessDelta = getSubmissionReadiness(right).percent - getSubmissionReadiness(left).percent;
      if (readinessDelta !== 0) {
        return readinessDelta;
      }

      return right.editorial_score - left.editorial_score;
    })[0];
  }, [shortlist]);

  const unresolvedComments = comments.filter((comment) => !comment.resolvido_em);
  const teamBadgeTone = getTeamBadgeTone(teamName);
  const editorialProgress = prioritizedJournal ? getSubmissionReadiness(prioritizedJournal) : null;
  const wordCount = article ? countArticleWords(article.conteudo_json) : 0;
  const summarySteps = [
    {
      label: "Manuscrito ativo",
      done: Boolean(article),
      detail: article ? `${formatStatusLabel(article.status)} · ${wordCount} palavras` : "Sem manuscrito carregado"
    },
    {
      label: "Revista priorizada",
      done: Boolean(prioritizedJournal),
      detail: prioritizedJournal ? prioritizedJournal.journal_title : "Ainda sem candidata principal"
    },
    {
      label: "Checklist editorial",
      done: Boolean(editorialProgress && editorialProgress.percent >= 84),
      detail: editorialProgress ? `${editorialProgress.percent}% · ${editorialProgress.label}` : "Ainda nao iniciado"
    },
    {
      label: "Triagem vinculada",
      done: screeningSets.length > 0,
      detail: screeningSets.length > 0 ? `${screeningSets.length} conjunto(s) conectado(s)` : "Nenhuma triagem ligada ao artigo"
    },
    {
      label: "Comentarios pendentes",
      done: unresolvedComments.length === 0,
      detail: unresolvedComments.length === 0 ? "Sem pontos abertos" : `${unresolvedComments.length} comentario(s) em aberto`
    },
    {
      label: "Plataforma Brasil",
      done: Boolean(
        checklist && checklist.tcle_gerado && checklist.cronograma_pronto && checklist.orcamento_detalhado
      ),
      detail: checklist
        ? [
            checklist.tcle_gerado ? "TCLE" : null,
            checklist.cronograma_pronto ? "Cronograma" : null,
            checklist.orcamento_detalhado ? "Orcamento" : null
          ]
            .filter(Boolean)
            .join(" · ") || "Checklist ainda nao preenchido"
        : canEdit
          ? "Checklist ainda nao preenchido"
          : "Visivel apenas para a equipe autora"
    }
  ];

  if (isLoading) {
    return (
      <main className="lovable-home">
        <section className="public-content-section">
          <div className="lovable-container">
            <article className="project-public-card">
              <div className="project-public-body">
                <h3>Carregando painel de submissao...</h3>
                <p>Organizando revista-alvo, revisao, triagem e prontidao do manuscrito.</p>
              </div>
            </article>
          </div>
        </section>
      </main>
    );
  }

  if (errorMessage || !article) {
    return (
      <main className="lovable-home">
        <section className="public-content-section">
          <div className="lovable-container">
            <article className="project-public-card">
              <div className="project-public-body">
                <h3>Nao foi possivel abrir o painel</h3>
                <p>{errorMessage ?? "Erro inesperado ao carregar o manuscrito."}</p>
                <div className="project-public-actions">
                  <Link href="/dashboard/artigos">Voltar para artigos →</Link>
                </div>
              </div>
            </article>
          </div>
        </section>
      </main>
    );
  }

  return (
    <main className="lovable-home">
      <section className="public-content-section">
        <div className="lovable-container" style={{ display: "grid", gap: "18px" }}>
          <div className="public-section-head-row">
            <div>
              <span className="eyebrow">painel de submissao</span>
              <h1 className="public-section-title" style={{ marginTop: "8px" }}>
                {article.titulo}
              </h1>
              <p className="public-section-kicker">
                Um lugar para decidir revista-alvo, acompanhar triagem, fechar revisao e reduzir atrito antes da submissao.
              </p>
            </div>
            <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
              <Link className="lovable-small-button" href={`/editor/${article.id}` as Route}>
                Abrir no editor
              </Link>
              <Link className="lovable-small-button" href="/dashboard/periodicos">
                Radar editorial
              </Link>
              <Link className="lovable-small-button" href="/dashboard/triagem">
                Triagem
              </Link>
            </div>
          </div>

          <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
            <span className="status-chip">{formatStatusLabel(article.status)}</span>
            {teamName ? (
              <span
                className="dashboard-team-badge"
                style={{
                  background: teamBadgeTone.background,
                  borderColor: teamBadgeTone.border,
                  color: teamBadgeTone.text
                }}
              >
                <span
                  aria-hidden="true"
                  className="dashboard-team-badge-dot"
                  style={{ background: teamBadgeTone.text }}
                />
                {teamName}
              </span>
            ) : null}
            <span className="status-chip">{wordCount} palavras</span>
            <span className="status-chip">Atualizado {formatRelativeUpdate(article.updated_at)}</span>
            {!canEdit ? <span className="status-chip">Somente leitura</span> : null}
          </div>

          <div className="lovable-stats-grid">
            <article className="lovable-stat-card">
              <strong>{shortlist.length}</strong>
              <span>revistas na shortlist</span>
            </article>
            <article className="lovable-stat-card">
              <strong>{shortlist.filter((entry) => entry.recommendation_level === "candidata_forte").length}</strong>
              <span>candidatas fortes</span>
            </article>
            <article className="lovable-stat-card">
              <strong>{screeningSets.length}</strong>
              <span>conjuntos de triagem</span>
            </article>
            <article className="lovable-stat-card">
              <strong>{unresolvedComments.length}</strong>
              <span>comentarios em aberto</span>
            </article>
          </div>
        </div>
      </section>

      <section className="public-content-section public-muted-section">
        <div className="lovable-container">
          <div className="publication-featured-grid">
            <article className="publication-feature-card">
              <span className="eyebrow">revista alvo</span>
              <h2>{prioritizedJournal ? prioritizedJournal.journal_title : "Defina uma candidata principal"}</h2>
              <p>
                {prioritizedJournal
                  ? `Hoje o WebLab colocaria essa revista na frente da fila por favoritação, score e prontidao editorial.`
                  : "Ainda nao existe uma revista priorizada. O proximo melhor passo e salvar candidatas na shortlist do radar."}
              </p>
              {prioritizedJournal ? (
                <div style={{ display: "grid", gap: "10px" }}>
                  <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                    <span className="status-chip">{formatRecommendationLevel(prioritizedJournal.recommendation_level)}</span>
                    <span className="status-chip">Score {prioritizedJournal.editorial_score}</span>
                    {editorialProgress ? (
                      <span className="status-chip">
                        Prontidao {editorialProgress.percent}% · {editorialProgress.label}
                      </span>
                    ) : null}
                  </div>
                  <p style={{ margin: 0 }}>
                    {prioritizedJournal.editorial_notes?.trim()
                      ? prioritizedJournal.editorial_notes
                      : "Ainda nao ha notas da equipe sobre essa candidata."}
                  </p>
                  <div className="project-public-actions">
                    <Link href="/dashboard/periodicos">Abrir shortlist →</Link>
                    <Link href={`/editor/${article.id}` as Route}>Voltar ao manuscrito →</Link>
                  </div>
                </div>
              ) : (
                <div className="project-public-actions">
                  <Link href="/dashboard/periodicos">Escolher revista no radar →</Link>
                </div>
              )}
            </article>

            <article className="publication-feature-card">
              <span className="eyebrow">cadeia de prontidao</span>
              <h2>O que ainda falta fechar</h2>
              <div className="knowledge-connection-list">
                {summarySteps.map((step) => (
                  <div key={step.label}>
                    <strong>{step.done ? "OK" : "Ajustar"} · {step.label}</strong>
                    <small>{step.detail}</small>
                  </div>
                ))}
              </div>
            </article>
          </div>
        </div>
      </section>

      <section className="public-content-section">
        <div className="lovable-container">
          <div className="public-section-head-row">
            <div>
              <h2 className="public-section-title">Evidencias e revisao</h2>
              <p className="public-section-kicker">O que ja foi triado e o que ainda esta aberto no manuscrito.</p>
            </div>
          </div>

          <div className="knowledge-network-grid">
            <article className="knowledge-panel">
              <span className="eyebrow">triagem</span>
              <h3>Conjuntos vinculados</h3>
              {screeningSets.length === 0 ? (
                <p className="muted">Nenhuma triagem vinculada ainda. Vale capturar evidencias para sustentar introducao e discussao.</p>
              ) : (
                <div className="knowledge-connection-list">
                  {screeningSets.map((set) => (
                    <div key={set.id}>
                      <strong>{set.titulo}</strong>
                      <small>{formatRelativeUpdate(set.updated_at)} · {set.pergunta || "Sem pergunta registrada."}</small>
                    </div>
                  ))}
                </div>
              )}
            </article>

            <article className="knowledge-panel">
              <span className="eyebrow">revisao</span>
              <h3>Comentarios em aberto</h3>
              {comments.length === 0 ? (
                <p className="muted">Ainda nao ha comentarios nesse manuscrito.</p>
              ) : (
                <div className="knowledge-connection-list">
                  {comments.slice(0, 5).map((comment) => (
                    <div key={comment.id}>
                      <strong>{comment.authorName ?? "Membro da equipe"}</strong>
                      <small>
                        {comment.resolvido_em ? "Resolvido" : "Aberto"} · {comment.comentario}
                      </small>
                    </div>
                  ))}
                </div>
              )}
            </article>
          </div>
        </div>
      </section>

      <section className="public-content-section public-muted-section">
        <div className="lovable-container">
          <div className="public-section-head-row">
            <div>
              <h2 className="public-section-title">Historico e submissao</h2>
              <p className="public-section-kicker">Versoes salvas, checklist institucional e proximos movimentos.</p>
            </div>
          </div>

          <div className="lab-memory-grid">
            <article className="lab-memory-card">
              <span className="eyebrow">versoes</span>
              <strong>{versions.length}</strong>
              <p>Snapshots salvos do manuscrito. Esse historico detalhado aparece apenas para a equipe autora.</p>
              {versions.length > 0 ? (
                <div className="lab-memory-list">
                  {versions.slice(0, 4).map((version) => (
                    <span key={version.id}>
                      {version.observacao || "Versao manual"} · {formatRelativeUpdate(version.created_at)}
                    </span>
                  ))}
                </div>
              ) : null}
            </article>

            <article className="lab-memory-card">
              <span className="eyebrow">plataforma brasil</span>
              <strong>
                {checklist
                  ? [checklist.tcle_gerado, checklist.cronograma_pronto, checklist.orcamento_detalhado].filter(Boolean).length
                  : 0}
                /3
              </strong>
              <p>
                {canEdit
                  ? "TCLE, cronograma e orcamento ajudam a fechar o lado burocratico antes de submeter."
                  : "Esse checklist institucional fica reservado para a equipe autora."}
              </p>
              <div className="lab-memory-list">
                <span>TCLE {checklist?.tcle_gerado ? "ok" : "pendente"}</span>
                <span>Cronograma {checklist?.cronograma_pronto ? "ok" : "pendente"}</span>
                <span>Orcamento {checklist?.orcamento_detalhado ? "ok" : "pendente"}</span>
              </div>
            </article>

            <article className="lab-memory-card">
              <span className="eyebrow">proximo passo</span>
              <strong>
                {prioritizedJournal
                  ? editorialProgress && editorialProgress.percent >= 84
                    ? "Decidir submissao"
                    : "Fechar checklist editorial"
                  : "Escolher revista"}
              </strong>
              <p>
                {prioritizedJournal
                  ? editorialProgress && editorialProgress.percent >= 84
                    ? "A candidata principal ja esta quase pronta. Vale revisar comentarios finais e fechar a decisao."
                    : "A revista-alvo ja existe, mas ainda faltam validacoes antes da decisao final."
                  : "O artigo ja tem base suficiente para rodar uma busca mais seria no radar de periodicos."}
              </p>
              <div className="project-public-actions">
                <Link href="/dashboard/periodicos">Abrir radar editorial →</Link>
              </div>
            </article>
          </div>
        </div>
      </section>
    </main>
  );
}
