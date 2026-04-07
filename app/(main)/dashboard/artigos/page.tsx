"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type { Route } from "next";
import { useRouter } from "next/navigation";

import { PublicPageHero } from "@/components/public/public-layout";
import { getSupabaseClient } from "@/lib/supabaseClient";
import type { ArticleRow, UserRole } from "@/lib/types";
import { countArticleWords, formatRelativeUpdate, formatStatusLabel } from "@/lib/weblab";
import { weblabTools } from "@/lib/public-site";

const articleImages = [
  "https://images.pexels.com/photos/3825527/pexels-photo-3825527.jpeg?auto=compress&cs=tinysrgb&w=900",
  "https://images.pexels.com/photos/2280571/pexels-photo-2280571.jpeg?auto=compress&cs=tinysrgb&w=900",
  "https://images.pexels.com/photos/3938022/pexels-photo-3938022.jpeg?auto=compress&cs=tinysrgb&w=900"
];

export default function ResearchPage() {
  const router = useRouter();
  const [articles, setArticles] = useState<ArticleRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;

    const loadArticles = async () => {
      const supabase = getSupabaseClient();
      const {
        data: { user }
      } = await supabase.auth.getUser();

      if (!user) {
        router.replace("/");
        return;
      }

      const { data: profile, error: profileError } = await supabase
        .from("perfis")
        .select("equipe_id, role")
        .eq("id", user.id)
        .maybeSingle();

      if (profileError || !profile) {
        if (isMounted) {
          setErrorMessage(profileError?.message ?? "Não foi possível carregar seu perfil.");
          setIsLoading(false);
        }
        return;
      }

      let query = supabase
        .from("artigos")
        .select("id, titulo, conteudo_json, status, autor_id, equipe_id, updated_at, last_editor_id")
        .order("updated_at", { ascending: false });

      if ((profile.role as UserRole) !== "coordenador_geral" && profile.equipe_id) {
        query = query.eq("equipe_id", profile.equipe_id);
      }

      const { data, error } = await query;

      if (isMounted) {
        setArticles((data ?? []) as ArticleRow[]);
        setErrorMessage(error?.message ?? null);
        setIsLoading(false);
      }
    };

    void loadArticles();

    return () => {
      isMounted = false;
    };
  }, [router]);

  return (
    <main className="lovable-home">
      <PublicPageHero
        description="Ferramentas para escrever, organizar, validar periódicos e preparar a submissão científica."
        title="Ferramentas do WebLab"
        variant="research"
      />

      <section className="public-content-section">
        <div className="lovable-container">
          <h2 className="public-section-title">Ferramentas do WebLab</h2>
          <div className="research-theme-grid">
            {weblabTools.map((tool) => {
              const toolHref =
                tool.label === "Editor vivo" && articles[0]
                  ? (`/editor/${articles[0].id}` as Route)
                  : (tool.href as Route);

              return (
                <Link className="research-theme-card" href={toolHref} key={tool.label}>
                  <span>{tool.icon}</span>
                  <h3>{tool.label}</h3>
                  <p>{tool.description}</p>
                </Link>
              );
            })}
          </div>
        </div>
      </section>

      <section className="public-content-section public-muted-section">
        <div className="lovable-container">
          <div className="public-section-head-row">
            <h2 className="public-section-title">Projetos atuais</h2>
            <Link className="lovable-small-button" href="/dashboard">
              Criar novo manuscrito
            </Link>
          </div>

          {errorMessage ? <p className="danger">{errorMessage}</p> : null}

          {isLoading ? (
            <article className="project-public-card">
              <div className="project-public-body">
                <h3>Carregando artigos...</h3>
                <p>Sincronizando os manuscritos da equipe.</p>
              </div>
            </article>
          ) : null}

          {!isLoading && articles.length === 0 ? (
            <article className="project-public-card">
              <div className="project-public-body">
                <h3>Nenhum artigo ativo</h3>
                <p>Crie o primeiro manuscrito pela Home e ele aparecerá aqui automaticamente.</p>
                <div className="project-public-actions">
                  <Link href="/dashboard">Criar manuscrito →</Link>
                </div>
              </div>
            </article>
          ) : null}

          {!isLoading && articles.length > 0 ? (
            <div className="project-public-grid">
              {articles.map((article, index) => (
                <article className="project-public-card" key={article.id}>
                  <img alt="" src={articleImages[index % articleImages.length]} />
                  <div className="project-public-body">
                    <div className="project-public-topline">
                      <h3>{article.titulo}</h3>
                      <span className="public-status-active">{formatStatusLabel(article.status)}</span>
                    </div>
                    <div className="project-public-meta">
                      <span>{countArticleWords(article.conteudo_json)} palavra(s)</span>
                      <span>•</span>
                      <span>{formatRelativeUpdate(article.updated_at)}</span>
                    </div>
                    <p>Manuscrito ativo no WebLab, pronto para continuar no editor vivo.</p>
                    <div className="project-public-actions">
                      <Link href={`/editor/${article.id}`}>Abrir no editor →</Link>
                      <Link href="/dashboard/periodicos">Radar editorial →</Link>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          ) : null}
        </div>
      </section>
    </main>
  );
}
