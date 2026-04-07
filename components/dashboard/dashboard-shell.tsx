"use client";

import type { Route } from "next";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState, useTransition } from "react";

import { getSupabaseClient } from "@/lib/supabaseClient";
import type { ArticleRow, UserRole } from "@/lib/types";
import {
  countArticleWords,
  formatRelativeUpdate,
  formatRoleLabel,
  formatStatusLabel
} from "@/lib/weblab";

export type DashboardArticle = ArticleRow & {
  team_name?: string;
  last_editor_name?: string | null;
};

type DashboardShellProps = {
  articles: DashboardArticle[];
  profileId: string;
  profileName: string;
  teamName: string;
  role: UserRole;
};

export function DashboardShell({
  articles,
  profileId,
  profileName,
  role,
  teamName
}: DashboardShellProps) {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [localArticles, setLocalArticles] = useState(articles);
  const [isCreating, startCreateTransition] = useTransition();
  const [articlePendingId, setArticlePendingId] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    setLocalArticles(articles);
  }, [articles]);

  const draftedCount = localArticles.filter((article) => article.status === "em_rascunho").length;
  const submittedCount = localArticles.filter((article) => article.status === "submetido").length;
  const approvedCount = localArticles.filter((article) => article.status === "aprovado").length;

  const scopeDescription = useMemo(() => {
    if (role === "coordenador_geral") {
      return "Visao consolidada das equipes, dos manuscritos ativos e da memoria editorial do laboratorio.";
    }

    return "Tudo o que a equipe precisa para abrir manuscritos, retomar contexto e mover a escrita com seguranca.";
  }, [role]);

  const handleCreateArticle = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!title.trim()) {
      setErrorMessage("Digite um titulo para iniciar o manuscrito.");
      return;
    }

    setErrorMessage(null);

    startCreateTransition(async () => {
      const supabase = getSupabaseClient();
      const {
        data: { user }
      } = await supabase.auth.getUser();

      if (!user) {
        setErrorMessage("Sua sessao expirou. Entre novamente para criar manuscritos.");
        router.replace("/");
        return;
      }

      const { data, error } = await supabase
        .from("artigos")
        .insert({
          titulo: title.trim(),
          autor_id: user.id,
          last_editor_id: user.id,
          updated_at: new Date().toISOString(),
          conteudo_json: {
            type: "doc",
            content: []
          },
          status: "em_rascunho"
        })
        .select("id")
        .single();

      if (error) {
        setErrorMessage(
          error.message.includes("last_editor_id") || error.message.includes("updated_at")
            ? "O banco ainda nao recebeu os campos de ultima edicao do WebLab. Rode a migracao de consolidacao."
            : error.message
        );
        return;
      }

      setTitle("");
      router.push(`/editor/${data.id}`);
      router.refresh();
    });
  };

  const handleDeleteArticle = (article: DashboardArticle) => {
    const confirmDelete = window.confirm(
      `Excluir o artigo "${article.titulo}"? Essa acao nao pode ser desfeita.`
    );

    if (!confirmDelete) {
      return;
    }

    setErrorMessage(null);
    setArticlePendingId(article.id);

    startCreateTransition(async () => {
      const supabase = getSupabaseClient();
      const { error } = await supabase.from("artigos").delete().eq("id", article.id);

      setArticlePendingId(null);

      if (error) {
        setErrorMessage(
          error.message.includes("row-level security")
            ? "Sua policy atual de exclusao no Supabase ainda nao permite apagar este artigo. Rode novamente o SQL de seguranca multi-tenant."
            : error.message
        );
        return;
      }

      setLocalArticles((current) => current.filter((item) => item.id !== article.id));
    });
  };

  const canDeleteArticle = (article: DashboardArticle) =>
    role === "coordenador_geral" || role === "coordenador" || article.autor_id === profileId;

  return (
    <main className="shell">
      <div className="container" style={{ display: "grid", gap: "24px" }}>
        <section
          className="hero-panel"
          style={{
            display: "flex",
            justifyContent: "space-between",
            gap: "24px",
            flexWrap: "wrap"
          }}
        >
          <div style={{ display: "grid", gap: "12px", maxWidth: "760px" }}>
            <span className="eyebrow">{teamName}</span>
            <div style={{ display: "grid", gap: "10px" }}>
              <h1 className="section-title" style={{ fontSize: "clamp(2.2rem, 4.5vw, 3.4rem)" }}>
                {role === "coordenador_geral" ? "Painel central do laboratorio" : "Nucleo de projetos"}
              </h1>
              <p className="section-lead">{scopeDescription}</p>
            </div>
            <span className="muted">Responsavel em foco: {profileName} - {formatRoleLabel(role)}</span>
          </div>

          <div style={{ display: "flex", gap: "12px", alignItems: "center", flexWrap: "wrap" }}>
            <button
              className="button button-primary"
              onClick={() => router.push("/dashboard/assistente-lattes" as Route)}
              type="button"
              style={{ background: "linear-gradient(135deg, var(--secondary-accent), #2f7ab4)" }}
            >
              Abrir Lattes
            </button>
            <button
              className="button button-primary"
              onClick={() => router.push("/dashboard/plataforma-brasil" as Route)}
              type="button"
              style={{ background: "linear-gradient(135deg, var(--accent-strong), var(--accent))" }}
            >
              Abrir Plataforma Brasil
            </button>
          </div>
        </section>

        <section
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
            gap: "16px"
          }}
        >
          {[
            ["Rascunhos ativos", draftedCount, "Textos em construcao dentro do laboratorio."],
            ["Em avaliacao", submittedCount, "Manuscritos em revisao, circulacao ou preparo de submissao."],
            ["Biblioteca valida", approvedCount, "Artigos consolidados para memoria e referencia da equipe."]
          ].map(([label, value, description]) => (
            <article key={label} className="metric-card">
              <span className="muted" style={{ fontSize: "0.9rem" }}>
                {label}
              </span>
              <strong className="metric-number">{value}</strong>
              <span className="muted">{description}</span>
            </article>
          ))}
        </section>

        <section
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))",
            gap: "24px"
          }}
        >
          <aside className="glass-card" style={{ padding: "24px", height: "fit-content" }}>
            <div style={{ display: "grid", gap: "12px", marginBottom: "20px" }}>
              <span className="eyebrow">iniciar manuscrito</span>
              <h2 style={{ margin: 0 }}>Abrir uma nova bancada de escrita</h2>
              <p className="muted" style={{ margin: 0, lineHeight: 1.65 }}>
                Comece pelo titulo e leve o texto para o editor vivo do WebLab, onde a estrutura,
                o autosave e o fluxo editorial continuam.
              </p>
            </div>

            <form onSubmit={handleCreateArticle} style={{ display: "grid", gap: "16px" }}>
              <div className="field">
                <label htmlFor="title">Titulo do manuscrito</label>
                <input
                  id="title"
                  onChange={(event) => setTitle(event.target.value)}
                  placeholder="Ex.: Vigilancia integrada e resposta territorial em arboviroses"
                  value={title}
                />
              </div>

              {errorMessage ? (
                <p className="danger" style={{ margin: 0 }}>
                  {errorMessage}
                </p>
              ) : null}

              <button className="button button-primary" disabled={isCreating} type="submit">
                {isCreating ? "Abrindo bancada..." : "Criar manuscrito"}
              </button>
            </form>
          </aside>

          <section className="glass-card" style={{ padding: "24px" }}>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                gap: "16px",
                alignItems: "center",
                marginBottom: "20px",
                flexWrap: "wrap"
              }}
            >
              <div style={{ display: "grid", gap: "6px" }}>
                <h2 style={{ margin: 0 }}>
                  {role === "coordenador_geral" ? "Acervo vivo do laboratorio" : "Caderno vivo da equipe"}
                </h2>
                <p className="muted" style={{ margin: 0 }}>
                  {localArticles.length} manuscrito(s) com status, memoria recente e acesso rapido ao editor.
                </p>
              </div>
            </div>

            <div style={{ display: "grid", gap: "14px" }}>
              {localArticles.length === 0 ? (
                <div
                  className="surface-muted"
                  style={{
                    padding: "28px",
                    borderStyle: "dashed",
                    borderColor: "rgba(16,40,52,0.16)"
                  }}
                >
                  <strong style={{ display: "block", marginBottom: "8px" }}>
                    Nenhum manuscrito encontrado
                  </strong>
                  <span className="muted">
                    Crie a primeira bancada de escrita usando o painel ao lado.
                  </span>
                </div>
              ) : (
                localArticles.map((article) => (
                  <article
                    key={article.id}
                    className="surface-muted"
                    style={{
                      display: "grid",
                      gridTemplateColumns: "minmax(0, 1fr) auto",
                      gap: "12px",
                      padding: "18px"
                    }}
                  >
                    <div style={{ display: "grid", gap: "10px" }}>
                      <strong style={{ fontSize: "1.05rem" }}>{article.titulo}</strong>
                      <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
                        <span className="status-chip">{formatStatusLabel(article.status)}</span>
                        <span className="muted" style={{ fontSize: "0.9rem" }}>
                          {countArticleWords(article.conteudo_json)} palavra(s)
                        </span>
                        <span className="muted" style={{ fontSize: "0.9rem" }}>
                          Ultima edicao: {formatRelativeUpdate(article.updated_at)}
                        </span>
                        <span className="muted" style={{ fontSize: "0.9rem" }}>
                          Ultimo editor: {article.last_editor_name ?? "Ainda nao identificado"}
                        </span>
                        {role === "coordenador_geral" ? (
                          <span className="status-chip">{article.team_name ?? "Equipe"}</span>
                        ) : null}
                      </div>
                    </div>

                    <div style={{ display: "grid", gap: "10px", alignContent: "start" }}>
                      <button
                        className="button button-secondary"
                        onClick={() => router.push(`/editor/${article.id}`)}
                        type="button"
                      >
                        Abrir no editor
                      </button>

                      {canDeleteArticle(article) ? (
                        <button
                          className="button"
                          disabled={articlePendingId === article.id}
                          onClick={() => handleDeleteArticle(article)}
                          style={{
                            background: "var(--danger-soft)",
                            color: "var(--danger)",
                            border: "1px solid rgba(180, 67, 56, 0.2)"
                          }}
                          type="button"
                        >
                          {articlePendingId === article.id ? "Excluindo..." : "Excluir"}
                        </button>
                      ) : null}
                    </div>
                  </article>
                ))
              )}
            </div>
          </section>
        </section>
      </div>
    </main>
  );
}
