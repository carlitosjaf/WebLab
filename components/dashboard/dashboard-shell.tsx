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
      return "Visao consolidada de todas as equipes vinculadas ao laboratorio.";
    }

    return "Projetos visiveis para a sua equipe, respeitando o isolamento configurado no banco.";
  }, [role]);

  const handleCreateArticle = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!title.trim()) {
      setErrorMessage("Digite um titulo para criar o artigo.");
      return;
    }

    setErrorMessage(null);

    startCreateTransition(async () => {
      const supabase = getSupabaseClient();
      const {
        data: { user }
      } = await supabase.auth.getUser();

      if (!user) {
        setErrorMessage("Sua sessao expirou. Entre novamente para criar artigos.");
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
          className="glass-card"
          style={{
            padding: "28px",
            display: "flex",
            justifyContent: "space-between",
            gap: "24px",
            flexWrap: "wrap"
          }}
        >
          <div style={{ display: "grid", gap: "10px" }}>
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
              {teamName}
            </span>
            <div>
              <h1 style={{ margin: 0, fontSize: "clamp(2rem, 5vw, 3rem)" }}>
                Projetos da equipe
              </h1>
              <p className="muted" style={{ marginBottom: 0 }}>
                {scopeDescription}
              </p>
            </div>
            <span className="muted">
              {profileName} · {formatRoleLabel(role)}
            </span>
          </div>

          <div style={{ display: "flex", gap: "12px", alignItems: "center", flexWrap: "wrap" }}>
            <button
              className="button button-primary"
              onClick={() => router.push("/dashboard/assistente-lattes" as Route)}
              type="button"
              style={{ background: "#4a3c31" }}
            >
              Assistente Lattes
            </button>
            <button
              className="button button-primary"
              onClick={() => router.push("/dashboard/plataforma-brasil" as Route)}
              type="button"
              style={{ background: "var(--accent-strong)" }}
            >
              Plataforma Brasil
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
            ["Em rascunho", draftedCount, "Textos em desenvolvimento ativo."],
            ["Submetidos", submittedCount, "Artigos em revisao ou circulacao interna."],
            ["Aprovados", approvedCount, "Textos finalizados para referencia da equipe."]
          ].map(([label, value, description]) => (
            <article
              key={label}
              className="glass-card"
              style={{
                padding: "22px",
                display: "grid",
                gap: "8px"
              }}
            >
              <span className="muted" style={{ fontSize: "0.9rem" }}>
                {label}
              </span>
              <strong style={{ fontSize: "2.2rem", lineHeight: 1 }}>{value}</strong>
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
              <h2 style={{ margin: 0 }}>Novo artigo</h2>
              <p className="muted" style={{ margin: 0 }}>
                Comece com o titulo. O restante do conteudo pode ser desenvolvido dentro do editor.
              </p>
            </div>

            <form onSubmit={handleCreateArticle} style={{ display: "grid", gap: "16px" }}>
              <div className="field">
                <label htmlFor="title">Titulo do artigo</label>
                <input
                  id="title"
                  onChange={(event) => setTitle(event.target.value)}
                  placeholder="Ex.: Efeitos da vigilancia integrada em arboviroses"
                  value={title}
                />
              </div>

              {errorMessage ? (
                <p className="danger" style={{ margin: 0 }}>
                  {errorMessage}
                </p>
              ) : null}

              <button className="button button-primary" disabled={isCreating} type="submit">
                {isCreating ? "Criando..." : "Criar e abrir editor"}
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
              <div>
                <h2 style={{ margin: "0 0 6px 0" }}>
                  {role === "coordenador_geral" ? "Artigos do laboratorio" : "Artigos da equipe"}
                </h2>
                <p className="muted" style={{ margin: 0 }}>
                  {localArticles.length} artigo(s) carregado(s) com status, ultima atualizacao e autoria
                  recente.
                </p>
              </div>
            </div>

            <div style={{ display: "grid", gap: "14px" }}>
              {localArticles.length === 0 ? (
                <div
                  style={{
                    padding: "28px",
                    borderRadius: "24px",
                    background: "rgba(255,255,255,0.7)",
                    border: "1px dashed rgba(36,26,19,0.14)"
                  }}
                >
                  <strong style={{ display: "block", marginBottom: "8px" }}>
                    Nenhum artigo encontrado
                  </strong>
                  <span className="muted">
                    Crie o primeiro rascunho usando o formulario ao lado.
                  </span>
                </div>
              ) : (
                localArticles.map((article) => (
                  <article
                    key={article.id}
                    style={{
                      display: "grid",
                      gridTemplateColumns: "minmax(0, 1fr) auto",
                      gap: "12px",
                      padding: "18px",
                      borderRadius: "24px",
                      background: "rgba(255,255,255,0.76)",
                      border: "1px solid rgba(36,26,19,0.08)"
                    }}
                  >
                    <div style={{ display: "grid", gap: "10px" }}>
                      <strong style={{ fontSize: "1.05rem" }}>{article.titulo}</strong>
                      <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
                        <span
                          style={{
                            padding: "6px 10px",
                            borderRadius: "999px",
                            background:
                              article.status === "aprovado"
                                ? "rgba(13,122,105,0.14)"
                                : article.status === "submetido"
                                  ? "rgba(196,125,54,0.14)"
                                  : "rgba(36,26,19,0.06)",
                            color:
                              article.status === "aprovado"
                                ? "var(--accent-strong)"
                                : article.status === "submetido"
                                  ? "#9a5f16"
                                  : "var(--foreground)",
                            fontSize: "0.88rem",
                            fontWeight: 600
                          }}
                        >
                          {formatStatusLabel(article.status)}
                        </span>
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
                          <span
                            className="muted"
                            style={{
                              fontSize: "0.85rem",
                              padding: "4px 8px",
                              background: "rgba(36,26,19,0.04)",
                              borderRadius: "99px"
                            }}
                          >
                            {article.team_name ?? "Equipe"}
                          </span>
                        ) : null}
                      </div>
                    </div>

                    <div style={{ display: "grid", gap: "10px", alignContent: "start" }}>
                      <button
                        className="button button-secondary"
                        onClick={() => router.push(`/editor/${article.id}`)}
                        type="button"
                      >
                        Abrir artigo
                      </button>

                      {canDeleteArticle(article) ? (
                        <button
                          className="button"
                          disabled={articlePendingId === article.id}
                          onClick={() => handleDeleteArticle(article)}
                          style={{
                            background: "rgba(196, 69, 54, 0.12)",
                            color: "var(--danger)",
                            border: "1px solid rgba(196, 69, 54, 0.18)"
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
