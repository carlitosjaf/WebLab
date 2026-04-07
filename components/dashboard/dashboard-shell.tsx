"use client";

import type { Route } from "next";
import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";

import { newsItems } from "@/lib/public-site";
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

const articleImages = [
  "https://images.pexels.com/photos/3825527/pexels-photo-3825527.jpeg?auto=compress&cs=tinysrgb&w=900",
  "https://images.pexels.com/photos/2280571/pexels-photo-2280571.jpeg?auto=compress&cs=tinysrgb&w=900",
  "https://images.pexels.com/photos/3938022/pexels-photo-3938022.jpeg?auto=compress&cs=tinysrgb&w=900"
];

function StatIcon({ name }: { name: "users" | "book" | "flask" | "dollar" }) {
  const commonProps = {
    fill: "none",
    stroke: "currentColor",
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    strokeWidth: 2,
    viewBox: "0 0 24 24"
  };

  if (name === "users") {
    return (
      <svg aria-hidden="true" {...commonProps}>
        <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
        <circle cx="9" cy="7" r="4" />
        <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
        <path d="M16 3.13a4 4 0 0 1 0 7.75" />
      </svg>
    );
  }

  if (name === "book") {
    return (
      <svg aria-hidden="true" {...commonProps}>
        <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
        <path d="M4 4.5A2.5 2.5 0 0 1 6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5z" />
      </svg>
    );
  }

  if (name === "flask") {
    return (
      <svg aria-hidden="true" {...commonProps}>
        <path d="M9 2h6" />
        <path d="M10 2v6.5L4.8 19a2 2 0 0 0 1.8 3h10.8a2 2 0 0 0 1.8-3L14 8.5V2" />
        <path d="M7 16h10" />
      </svg>
    );
  }

  return (
    <svg aria-hidden="true" {...commonProps}>
      <path d="M12 2v20" />
      <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7H14a3.5 3.5 0 0 1 0 7H6" />
    </svg>
  );
}

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
  const featuredArticles = localArticles.slice(0, 3);

  const dashboardStats = [
    { icon: "users" as const, value: "01", label: "Equipe ativa" },
    { icon: "book" as const, value: approvedCount.toString().padStart(2, "0"), label: "Publicações" },
    { icon: "flask" as const, value: localArticles.length.toString().padStart(2, "0"), label: "Artigos em projeto" },
    { icon: "dollar" as const, value: submittedCount.toString().padStart(2, "0"), label: "Submissões" }
  ];

  const handleCreateArticle = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!title.trim()) {
      setErrorMessage("Digite um título para iniciar o manuscrito.");
      return;
    }

    setErrorMessage(null);

    startCreateTransition(async () => {
      const supabase = getSupabaseClient();
      const {
        data: { user }
      } = await supabase.auth.getUser();

      if (!user) {
        setErrorMessage("Sua sessão expirou. Entre novamente para criar manuscritos.");
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
            ? "O banco ainda não recebeu os campos de última edição do WebLab. Rode a migração de consolidação."
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
      `Excluir o artigo "${article.titulo}"? Essa ação não pode ser desfeita.`
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
            ? "Sua policy atual de exclusão no Supabase ainda não permite apagar este artigo. Rode novamente o SQL de segurança multi-tenant."
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
    <main className="lovable-home dashboard-home">
      <section className="lovable-hero dashboard-home-hero" aria-labelledby="dashboard-home-title">
        <div className="lovable-hero-image" aria-hidden="true" />
        <div className="lovable-container lovable-hero-inner">
          <div className="lovable-hero-copy">
            <h1 id="dashboard-home-title">Fé Eterna na Ciência</h1>
            <p>
              Producizir e compartilhar conhecimento, para o fortalecimento do sistema (sus) e por
              uma sociedade mais saudável, democrática e justa.
            </p>
            <div className="lovable-actions">
              <button
                className="lovable-button lovable-button-primary"
                onClick={() => router.push("/dashboard/artigos" as Route)}
                type="button"
              >
                Explore os Artigos
                <span aria-hidden="true">→</span>
              </button>
              <button
                className="lovable-button lovable-button-outline"
                onClick={() => router.push("/dashboard/equipe" as Route)}
                type="button"
              >
                Nossa Equipe
              </button>
            </div>
          </div>
        </div>
      </section>

      <section className="lovable-stats" aria-label="Indicadores do laboratório">
        <div className="lovable-container lovable-stats-grid">
          {dashboardStats.map((stat) => (
            <article className="lovable-stat" key={stat.label}>
              <span className="lovable-stat-icon">
                <StatIcon name={stat.icon} />
              </span>
              <strong>{stat.value}</strong>
              <span>{stat.label}</span>
            </article>
          ))}
        </div>
      </section>

      <section className="lovable-section" aria-labelledby="published-articles-title">
        <div className="lovable-container">
          <div className="lovable-section-heading">
            <h2 id="published-articles-title">Artigos Publicados</h2>
            <p>
              Manuscritos da equipe, com acesso rápido ao editor, memória de edição e estado de
              submissão.
            </p>
          </div>

          {featuredArticles.length > 0 ? (
            <div className="lovable-card-grid">
              {featuredArticles.map((article, index) => (
                <article className="lovable-research-card" key={article.id}>
                  <img alt="" src={articleImages[index % articleImages.length]} />
                  <div className="lovable-research-body">
                    <span className="lovable-research-icon" aria-hidden="true">
                      {index === 0 ? "✣" : index === 1 ? "◌" : "◎"}
                    </span>
                    <h3>{article.titulo}</h3>
                    <p>
                      {formatStatusLabel(article.status)} · {countArticleWords(article.conteudo_json)}{" "}
                      palavra(s). Última edição: {formatRelativeUpdate(article.updated_at)}.
                    </p>
                    <p className="dashboard-home-editor-line">
                      Último editor: {article.last_editor_name ?? "Ainda não identificado"}
                      {role === "coordenador_geral" && article.team_name ? ` · ${article.team_name}` : ""}
                    </p>
                    <div className="dashboard-home-card-actions">
                      <button
                        className="lovable-small-button"
                        onClick={() => router.push(`/editor/${article.id}`)}
                        type="button"
                      >
                        Abrir no editor
                      </button>
                      {canDeleteArticle(article) ? (
                        <button
                          className="lovable-small-button dashboard-home-delete"
                          disabled={articlePendingId === article.id}
                          onClick={() => handleDeleteArticle(article)}
                          type="button"
                        >
                          {articlePendingId === article.id ? "Excluindo..." : "Excluir"}
                        </button>
                      ) : null}
                    </div>
                  </div>
                </article>
              ))}
            </div>
          ) : (
            <article className="lovable-research-card dashboard-home-empty-card">
              <div className="lovable-research-body">
                <span className="lovable-research-icon" aria-hidden="true">
                  ✣
                </span>
                <h3>Nenhum manuscrito ativo</h3>
                <p>Crie o primeiro artigo da equipe e leve o texto para o editor vivo do WebLab.</p>
              </div>
            </article>
          )}
        </div>
      </section>

      <section className="lovable-news" aria-labelledby="recent-news-title">
        <div className="lovable-container">
          <div className="lovable-news-head">
            <h2 id="recent-news-title">Avisos Recentes</h2>
            <button
              className="lovable-small-button"
              onClick={() => router.push("/dashboard/avisos" as Route)}
              type="button"
            >
              Ver todos
            </button>
          </div>

          <div className="lovable-news-list">
            {newsItems.slice(0, 3).map((item) => (
              <article className="lovable-news-item" key={item.title}>
                <div>
                  <div className="lovable-news-meta">
                    <span>{item.category}</span>
                    <time>{item.date}</time>
                  </div>
                  <p>{item.title}</p>
                </div>
                <span aria-hidden="true">→</span>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="lovable-cta" aria-labelledby="new-manuscript-title">
        <div className="lovable-container">
          <div className="lovable-cta-panel">
            <span className="dashboard-home-profile">
              {teamName} · {profileName} · {formatRoleLabel(role)}
            </span>
            <h2 id="new-manuscript-title">Explore nossa pesquisa</h2>
            <p>Crie um manuscrito, abra o editor e siga do texto à submissão no mesmo fluxo.</p>
            <form className="dashboard-home-create-form" onSubmit={handleCreateArticle}>
              <input
                aria-label="Título do manuscrito"
                onChange={(event) => setTitle(event.target.value)}
                placeholder="Título do novo manuscrito"
                value={title}
              />
              <button className="lovable-button lovable-button-outline" disabled={isCreating} type="submit">
                {isCreating ? "Criando..." : "Criar manuscrito"}
              </button>
            </form>
            {errorMessage ? <p className="dashboard-home-error">{errorMessage}</p> : null}
          </div>
        </div>
      </section>

      <footer className="lovable-footer">
        <div className="lovable-container lovable-footer-grid">
          <div>
            <div className="lovable-brand lovable-brand-footer">
              <span className="lovable-brand-icon">W</span>
              WebLab
            </div>
            <p>Escreva, organize e submeta com segurança.</p>
          </div>
          <div>
            <h3>Atalhos</h3>
            <button className="dashboard-home-footer-link" onClick={() => router.push("/dashboard" as Route)} type="button">
              Home
            </button>
            <button className="dashboard-home-footer-link" onClick={() => router.push("/dashboard/equipe" as Route)} type="button">
              Equipe
            </button>
            <button className="dashboard-home-footer-link" onClick={() => router.push("/dashboard/artigos" as Route)} type="button">
              Artigos
            </button>
            <button className="dashboard-home-footer-link" onClick={() => router.push("/dashboard/avisos" as Route)} type="button">
              Avisos
            </button>
          </div>
          <div>
            <h3>Ferramentas</h3>
            <button
              className="dashboard-home-footer-link"
              onClick={() => router.push("/dashboard/periodicos" as Route)}
              type="button"
            >
              Radar de periódicos
            </button>
            <button
              className="dashboard-home-footer-link"
              onClick={() => router.push("/dashboard/plataforma-brasil" as Route)}
              type="button"
            >
              Plataforma Brasil
            </button>
            <button
              className="dashboard-home-footer-link"
              onClick={() => router.push("/dashboard/assistente-lattes" as Route)}
              type="button"
            >
              Assistente Lattes
            </button>
          </div>
          <div>
            <h3>Laboratório</h3>
            <p>{teamName}</p>
            <p>{profileName} · {formatRoleLabel(role)}</p>
          </div>
        </div>
        <p className="lovable-footer-copy">© 2026 WebLab. Plataforma de escrita e publicação científica.</p>
      </footer>
    </main>
  );
}
