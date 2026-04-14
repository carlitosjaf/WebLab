"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import type { Route } from "next";
import { useRouter } from "next/navigation";

import { PublicPageHero } from "@/components/public/public-layout";
import { buildTeamKnowledgeMap } from "@/lib/knowledge-network";
import { getSupabaseClient } from "@/lib/supabaseClient";
import type { ArticleRow, Database, EvidenceScreeningSetRow } from "@/lib/types";
import {
  countArticleWords,
  formatRelativeUpdate,
  formatStatusLabel,
  getTeamBadgeTone
} from "@/lib/weblab";
import { weblabTools } from "@/lib/public-site";

type SavedShortlist = Database["public"]["Tables"]["periodicos_shortlists"]["Row"];
type TeamRow = Database["public"]["Tables"]["equipes"]["Row"];

const articleImages = [
  "https://images.pexels.com/photos/3825527/pexels-photo-3825527.jpeg?auto=compress&cs=tinysrgb&w=900",
  "https://images.pexels.com/photos/2280571/pexels-photo-2280571.jpeg?auto=compress&cs=tinysrgb&w=900",
  "https://images.pexels.com/photos/3938022/pexels-photo-3938022.jpeg?auto=compress&cs=tinysrgb&w=900"
];

export default function ResearchPage() {
  const router = useRouter();
  const [articles, setArticles] = useState<ArticleRow[]>([]);
  const [teamsById, setTeamsById] = useState<Record<string, string>>({});
  const [shortlists, setShortlists] = useState<SavedShortlist[]>([]);
  const [screeningSets, setScreeningSets] = useState<EvidenceScreeningSetRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const knowledgeMap = useMemo(() => buildTeamKnowledgeMap(articles), [articles]);
  const labMemory = useMemo(() => {
    const uniqueJournals = Array.from(new Set(shortlists.map((entry) => entry.journal_title))).slice(0, 8);
    const favoriteJournals = shortlists.filter((entry) => entry.is_favorite).length;
    const strongCandidates = shortlists.filter((entry) => entry.recommendation_level === "candidata_forte").length;

    return {
      uniqueJournals,
      favoriteJournals,
      strongCandidates,
      screeningSetsCount: screeningSets.length,
      recurringConcepts: knowledgeMap.concepts.slice(0, 8)
    };
  }, [knowledgeMap.concepts, screeningSets.length, shortlists]);

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

      const [{ data, error }, { data: teams }] = await Promise.all([
        supabase
          .from("artigos")
          .select("id, titulo, conteudo_json, status, autor_id, equipe_id, updated_at, last_editor_id")
          .order("updated_at", { ascending: false }),
        supabase.from("equipes").select("id, nome, codigo_convite")
      ]);

      const nextArticles = (data ?? []) as ArticleRow[];
      const nextTeamsById = ((teams as TeamRow[] | null) ?? []).reduce<Record<string, string>>(
        (accumulator, team) => {
          accumulator[team.id] = team.nome;
          return accumulator;
        },
        {}
      );
      const articleIds = nextArticles.map((article) => article.id);
      let nextShortlists: SavedShortlist[] = [];
      let nextScreeningSets: EvidenceScreeningSetRow[] = [];

      if (!error && articleIds.length > 0) {
        const [{ data: shortlistData }, { data: screeningData }] = await Promise.all([
          supabase
            .from("periodicos_shortlists")
            .select("*")
            .in("artigo_id", articleIds)
            .order("updated_at", { ascending: false, nullsFirst: false }),
          supabase
            .from("triagem_conjuntos")
            .select("*")
            .in("artigo_id", articleIds)
            .order("updated_at", { ascending: false, nullsFirst: false })
        ]);

        nextShortlists = (shortlistData ?? []) as SavedShortlist[];
        nextScreeningSets = (screeningData ?? []) as EvidenceScreeningSetRow[];
      }

      if (isMounted) {
        setArticles(nextArticles);
        setTeamsById(nextTeamsById);
        setShortlists(nextShortlists);
        setScreeningSets(nextScreeningSets);
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
        description="Ferramentas para escrever, organizar, validar periÃ³dicos e preparar a submissÃ£o cientÃ­fica."
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

      <section className="public-content-section">
        <div className="lovable-container">
          <div className="public-section-head-row">
            <div>
              <h2 className="public-section-title">Rede de conhecimento</h2>
              <p className="public-section-kicker">
                Conceitos e pontes detectados nos manuscritos visÃ­veis para a equipe.
              </p>
            </div>
          </div>

          {articles.length < 2 ? (
            <article className="knowledge-empty-card">
              <strong>Rede em formaÃ§Ã£o</strong>
              <p>
                Quando houver pelo menos dois manuscritos acessÃ­veis, o WebLab comeÃ§arÃ¡ a sugerir
                relaÃ§Ãµes entre temas, conceitos e projetos.
              </p>
            </article>
          ) : (
            <div className="knowledge-network-grid">
              <article className="knowledge-panel">
                <span className="eyebrow">temas recorrentes</span>
                <h3>O que atravessa os manuscritos visÃ­veis</h3>
                {knowledgeMap.concepts.length === 0 ? (
                  <p className="muted">Ainda nÃ£o hÃ¡ termos recorrentes fortes entre os manuscritos.</p>
                ) : (
                  <div className="knowledge-chip-list">
                    {knowledgeMap.concepts.map((concept) => (
                      <span key={concept.term} title={concept.articleTitles.join(", ")}>
                        {concept.term} Â· {concept.articleIds.length} texto(s)
                      </span>
                    ))}
                  </div>
                )}
              </article>

              <article className="knowledge-panel">
                <span className="eyebrow">pontes entre artigos</span>
                <h3>Manuscritos que podem conversar</h3>
                {knowledgeMap.connections.length === 0 ? (
                  <p className="muted">NÃ£o encontrei conexÃµes fortes entre os artigos atuais.</p>
                ) : (
                  <div className="knowledge-connection-list">
                    {knowledgeMap.connections.map((connection) => (
                      <div key={connection.id}>
                        <strong>
                          {connection.leftArticle.titulo} â†” {connection.rightArticle.titulo}
                        </strong>
                        <small>{connection.sharedTerms.join(", ")}</small>
                        <div>
                          <Link href={`/editor/${connection.leftArticle.id}`}>Abrir primeiro</Link>
                          <Link href={`/editor/${connection.rightArticle.id}`}>Abrir segundo</Link>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </article>
            </div>
          )}
        </div>
      </section>

      <section className="public-content-section public-muted-section">
        <div className="lovable-container">
          <div className="public-section-head-row">
            <div>
              <h2 className="public-section-title">MemÃ³ria do laboratÃ³rio</h2>
              <p className="public-section-kicker">
                Um resumo vivo do que a equipe jÃ¡ escreveu, avaliou e comeÃ§ou a triar.
              </p>
            </div>
            <Link className="lovable-small-button" href="/dashboard/triagem">
              Abrir triagem
            </Link>
          </div>

          <div className="lab-memory-grid">
            <article className="lab-memory-card">
              <span className="eyebrow">temas recorrentes</span>
              <strong>{labMemory.recurringConcepts.length}</strong>
              <p>Conceitos detectados nos manuscritos acessÃ­veis.</p>
              {labMemory.recurringConcepts.length > 0 ? (
                <div className="knowledge-chip-list">
                  {labMemory.recurringConcepts.map((concept) => (
                    <span key={concept.term}>{concept.term}</span>
                  ))}
                </div>
              ) : null}
            </article>

            <article className="lab-memory-card">
              <span className="eyebrow">radar editorial</span>
              <strong>{labMemory.uniqueJournals.length}</strong>
              <p>
                Revistas jÃ¡ passaram pela shortlist. {labMemory.strongCandidates} aparecem como candidatas fortes e{" "}
                {labMemory.favoriteJournals} estÃ£o favoritas.
              </p>
              {labMemory.uniqueJournals.length > 0 ? (
                <div className="lab-memory-list">
                  {labMemory.uniqueJournals.map((journal) => (
                    <span key={journal}>{journal}</span>
                  ))}
                </div>
              ) : (
                <Link href="/dashboard/periodicos">Abrir radar editorial â†’</Link>
              )}
            </article>

            <article className="lab-memory-card">
              <span className="eyebrow">evidÃªncias</span>
              <strong>{labMemory.screeningSetsCount}</strong>
              <p>Conjuntos de triagem vinculados aos manuscritos da equipe.</p>
              {screeningSets.length > 0 ? (
                <div className="lab-memory-list">
                  {screeningSets.slice(0, 6).map((set) => (
                    <span key={set.id}>{set.titulo}</span>
                  ))}
                </div>
              ) : (
                <Link href="/dashboard/triagem">Criar conjunto de triagem â†’</Link>
              )}
            </article>
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
                <p>Sincronizando os manuscritos visÃ­veis para a equipe.</p>
              </div>
            </article>
          ) : null}

          {!isLoading && articles.length === 0 ? (
            <article className="project-public-card">
              <div className="project-public-body">
                <h3>Nenhum artigo acessÃ­vel</h3>
                <p>Crie o primeiro manuscrito pela Home ou acompanhe artigos compartilhados por outras equipes.</p>
                <div className="project-public-actions">
                  <Link href="/dashboard">Criar manuscrito â†’</Link>
                </div>
              </div>
            </article>
          ) : null}

          {!isLoading && articles.length > 0 ? (
            <div className="project-public-grid">
              {articles.map((article, index) => {
                const teamName = teamsById[article.equipe_id];
                const badgeTone = getTeamBadgeTone(teamName);

                return (
                  <article className="project-public-card" key={article.id}>
                    <img alt="" src={articleImages[index % articleImages.length]} />
                    <div className="project-public-body">
                      <div className="project-public-topline">
                        <h3>{article.titulo}</h3>
                        <span className="public-status-active">{formatStatusLabel(article.status)}</span>
                      </div>
                      <div className="project-public-meta">
                        <span>{countArticleWords(article.conteudo_json)} palavra(s)</span>
                        <span>â€¢</span>
                        <span>{formatRelativeUpdate(article.updated_at)}</span>
                      </div>
                      {teamName ? (
                        <span
                          className="dashboard-team-badge"
                          style={{
                            background: badgeTone.background,
                            borderColor: badgeTone.border,
                            color: badgeTone.text
                          }}
                        >
                          <span
                            aria-hidden="true"
                            className="dashboard-team-badge-dot"
                            style={{ background: badgeTone.text }}
                          />
                          {teamName}
                        </span>
                      ) : null}
                      <p>
                        {article.status === "em_rascunho"
                          ? "Rascunho privado da equipe autora."
                          : "Artigo compartilhado para leitura entre as equipes do WebLab."}
                      </p>
                      <div className="project-public-actions">
                        <Link href={`/editor/${article.id}`}>Abrir no editor â†’</Link>
                        <Link href="/dashboard/periodicos">Radar editorial â†’</Link>
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
          ) : null}
        </div>
      </section>
    </main>
  );
}
