"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { Route } from "next";

import { getArticleEditorHref } from "@/lib/article-intelligence";
import { buildGoogleDocUrl } from "@/lib/google-docs";
import { getSupabaseClient } from "@/lib/supabaseClient";
import type { ArticleRow, Database, EvidenceScreeningSetRow } from "@/lib/types";
import { countArticleWords, formatRelativeUpdate, formatStatusLabel } from "@/lib/weblab";

type ShortlistRow = Database["public"]["Tables"]["periodicos_shortlists"]["Row"];
type TeamRow = Database["public"]["Tables"]["equipes"]["Row"];

type SelectedArticleSummary = {
  stageNumber: string;
  stageTitle: string;
  stageDescription: string;
  readiness: number;
  priority: string;
  nextStep: string;
  checklist: string[];
};

function inferSectionCount(article: ArticleRow) {
  return (article.conteudo_json?.content ?? []).filter((node) => node.type === "heading").length;
}

function inferSelectedArticleSummary(input: {
  article: ArticleRow | null;
  shortlistCount: number;
  screeningCount: number;
}) {
  const { article, shortlistCount, screeningCount } = input;

  if (!article) {
    return {
      stageNumber: "01",
      stageTitle: "Criacao do manuscrito",
      stageDescription: "Abra um artigo em andamento ou inicie um novo manuscrito para ativar a central.",
      readiness: 16,
      priority: "Iniciar um novo artigo",
      nextStep: "Criar manuscrito",
      checklist: [
        "Definir o titulo de trabalho.",
        "Abrir o writer principal.",
        "Escolher a primeira estrutura editorial."
      ]
    } satisfies SelectedArticleSummary;
  }

  const wordCount = countArticleWords(article.conteudo_json);
  const hasGoogle = Boolean(article.google_doc_id);
  const synced = Boolean(article.google_last_synced_at);

  if (wordCount < 450) {
    return {
      stageNumber: "01",
      stageTitle: "Escrita inicial",
      stageDescription: "O manuscrito ainda esta em fase de abertura e precisa ganhar corpo antes da revisao editorial.",
      readiness: 28,
      priority: "Estruturar o texto base",
      nextStep: "Continuar escrevendo no editor",
      checklist: [
        "Abrir resumo, introducao e objetivo.",
        "Montar a estrutura principal do artigo.",
        hasGoogle ? "Sincronizar o rascunho com o Google Docs." : "Conectar o Google Docs da equipe."
      ]
    } satisfies SelectedArticleSummary;
  }

  if (!hasGoogle || !synced) {
    return {
      stageNumber: "02",
      stageTitle: "Conexao editorial",
      stageDescription: "O texto ja tem base suficiente para trabalhar com sincronizacao, checkpoints e leitura assistida.",
      readiness: 54,
      priority: !hasGoogle ? "Conectar Google Docs" : "Registrar o primeiro checkpoint",
      nextStep: !hasGoogle ? "Vincular documento da equipe" : "Sincronizar manuscrito",
      checklist: [
        "Garantir uma superficie unica de escrita.",
        "Conectar o documento Google da equipe.",
        "Preparar o texto para leitura cognitiva."
      ]
    } satisfies SelectedArticleSummary;
  }

  if (shortlistCount === 0 || screeningCount === 0) {
    return {
      stageNumber: "03",
      stageTitle: "Revisao editorial",
      stageDescription: "O manuscrito ja pode ser lido com mais criterio, e agora precisa ganhar sustentacao e rota editorial.",
      readiness: 72,
      priority: shortlistCount === 0 ? "Abrir o radar editorial" : "Amarrar evidencias e triagem",
      nextStep: shortlistCount === 0 ? "Definir revista-alvo" : "Conectar triagem ao manuscrito",
      checklist: [
        "Revisar resumo e costura argumentativa.",
        shortlistCount === 0 ? "Gerar shortlist editorial." : "Validar shortlist atual.",
        screeningCount === 0 ? "Criar conjunto de triagem." : "Atualizar evidencias vinculadas."
      ]
    } satisfies SelectedArticleSummary;
  }

  return {
    stageNumber: "04",
    stageTitle: "Preparacao para submissao",
    stageDescription: "O manuscrito ja conversa com o ecossistema editorial e pode ser refinado para decisao final.",
    readiness: 84,
    priority: "Lapidar fechamento e submissao",
    nextStep: "Entrar no editor e revisar os pontos finais",
    checklist: [
      "Conferir sustentacao das secoes mais criticas.",
      "Validar checklist de submissao.",
      "Decidir a revista principal."
    ]
  } satisfies SelectedArticleSummary;
}

export function CentralEditorialShell() {
  const router = useRouter();
  const [articles, setArticles] = useState<ArticleRow[]>([]);
  const [teamsById, setTeamsById] = useState<Record<string, string>>({});
  const [shortlists, setShortlists] = useState<ShortlistRow[]>([]);
  const [screeningSets, setScreeningSets] = useState<EvidenceScreeningSetRow[]>([]);
  const [selectedArticleId, setSelectedArticleId] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isCreating, startCreateTransition] = useTransition();

  useEffect(() => {
    let isMounted = true;

    const loadCentral = async () => {
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
          .select(
            "id, titulo, conteudo_json, status, autor_id, equipe_id, google_doc_id, google_doc_url, google_last_synced_at, updated_at, last_editor_id"
          )
          .order("updated_at", { ascending: false }),
        supabase.from("equipes").select("id, nome, codigo_convite")
      ]);

      const nextArticles = (data ?? []) as ArticleRow[];
      const nextTeamsById = ((teams as TeamRow[] | null) ?? []).reduce<Record<string, string>>((acc, team) => {
        acc[team.id] = team.nome;
        return acc;
      }, {});

      let nextShortlists: ShortlistRow[] = [];
      let nextScreeningSets: EvidenceScreeningSetRow[] = [];

      if (!error && nextArticles.length > 0) {
        const articleIds = nextArticles.map((article) => article.id);
        const [{ data: shortlistData }, { data: screeningData }] = await Promise.all([
          supabase.from("periodicos_shortlists").select("*").in("artigo_id", articleIds),
          supabase.from("triagem_conjuntos").select("*").in("artigo_id", articleIds)
        ]);

        nextShortlists = (shortlistData ?? []) as ShortlistRow[];
        nextScreeningSets = (screeningData ?? []) as EvidenceScreeningSetRow[];
      }

      if (!isMounted) {
        return;
      }

      setArticles(nextArticles);
      setTeamsById(nextTeamsById);
      setShortlists(nextShortlists);
      setScreeningSets(nextScreeningSets);
      setSelectedArticleId((current) => current ?? nextArticles[0]?.id ?? null);
      setErrorMessage(error?.message ?? null);
      setIsLoading(false);
    };

    void loadCentral();

    return () => {
      isMounted = false;
    };
  }, [router]);

  const selectedArticle = useMemo(
    () => articles.find((article) => article.id === selectedArticleId) ?? articles[0] ?? null,
    [articles, selectedArticleId]
  );

  const selectedShortlist = useMemo(
    () => shortlists.filter((entry) => entry.artigo_id === selectedArticle?.id),
    [selectedArticle?.id, shortlists]
  );

  const selectedScreeningSets = useMemo(
    () => screeningSets.filter((entry) => entry.artigo_id === selectedArticle?.id),
    [screeningSets, selectedArticle?.id]
  );

  const summary = useMemo(
    () =>
      inferSelectedArticleSummary({
        article: selectedArticle,
        shortlistCount: selectedShortlist.length,
        screeningCount: selectedScreeningSets.length
      }),
    [selectedArticle, selectedScreeningSets.length, selectedShortlist.length]
  );

  const readyCount = articles.filter((article) => countArticleWords(article.conteudo_json) >= 450).length;
  const linkedCount = articles.filter((article) => article.google_doc_id).length;
  const selectedWordCount = selectedArticle ? countArticleWords(selectedArticle.conteudo_json) : 0;
  const selectedSectionCount = selectedArticle ? inferSectionCount(selectedArticle) : 0;
  const selectedGoogleHref = selectedArticle
    ? buildGoogleDocUrl(selectedArticle.google_doc_id) ?? selectedArticle.google_doc_url
    : null;
  const selectedChosenJournal =
    selectedShortlist.find((entry) => entry.chosen_for_submission) ??
    selectedShortlist.find((entry) => entry.is_favorite) ??
    null;
  const selectedGoogleState = selectedArticle
    ? !selectedArticle.google_doc_id
      ? "Ainda sem documento vinculado"
      : selectedArticle.google_last_synced_at
        ? `Sync registrada ${formatRelativeUpdate(selectedArticle.google_last_synced_at)}`
        : "Documento vinculado, sem sync registrada"
    : "Selecione um manuscrito";

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
        .select(
          "id, titulo, conteudo_json, status, autor_id, equipe_id, google_doc_id, google_doc_url, google_last_synced_at, updated_at, last_editor_id"
        )
        .single();

      if (error || !data) {
        setErrorMessage(
          error?.message.includes("last_editor_id") || error?.message.includes("updated_at")
            ? "O banco ainda nao recebeu os campos de ultima edicao do WebLab. Rode a migracao de consolidacao."
            : error?.message ?? "Nao foi possivel criar o manuscrito agora."
        );
        return;
      }

      setArticles((current) => [data as ArticleRow, ...current]);
      setSelectedArticleId(data.id);
      setTitle("");
      router.push(getArticleEditorHref(data.id));
      router.refresh();
    });
  };

  return (
    <main className="editor-central-page">
      <section className="editor-central-hero">
        <div className="editor-central-hero__main">
          <span className="editor-central-pill">Nucleo editorial unificado</span>
          <h1>Uma unica experiencia para escrever, revisar e preparar submissao.</h1>
          <p>
            A Central Editorial organiza o ciclo do manuscrito em um fluxo continuo. O texto continua sendo o centro,
            e o restante do sistema existe para orientar decisao, sincronizacao e prontidao.
          </p>
          <div className="editor-central-actions">
            <button
              className="editor-central-button editor-central-button--primary"
              disabled={!selectedArticle}
              onClick={() => selectedArticle && router.push(getArticleEditorHref(selectedArticle.id))}
              type="button"
            >
              {selectedArticle ? "Continuar manuscrito" : "Criar primeiro manuscrito"}
            </button>
            {selectedGoogleHref ? (
              <a
                className="editor-central-button"
                href={selectedGoogleHref}
                rel="noreferrer"
                target="_blank"
              >
                Abrir documento vinculado
              </a>
            ) : (
              <button
                className="editor-central-button"
                disabled={!selectedArticle}
                onClick={() => selectedArticle && router.push(getArticleEditorHref(selectedArticle.id))}
                type="button"
              >
                Conectar Google Docs
              </button>
            )}
            <button
              className="editor-central-button"
              disabled={!selectedArticle}
              onClick={() => router.push("/dashboard/periodicos" as Route)}
              type="button"
            >
              Ver checklist editorial
            </button>
          </div>
        </div>

        <div className="editor-central-hero__stats">
          <article>
            <span>Etapa atual</span>
            <strong>{summary.stageNumber}</strong>
            <p>{summary.stageTitle}</p>
          </article>
          <article>
            <span>Prontidao</span>
            <strong>{summary.readiness}%</strong>
            <p>Leitura pratica do estado do manuscrito selecionado.</p>
          </article>
          <article>
            <span>Prioridade</span>
            <strong>{summary.priority}</strong>
            <p>O sistema aponta um unico alvo central, sem sinais competindo.</p>
          </article>
          <article>
            <span>Proximo passo</span>
            <strong>{summary.nextStep}</strong>
            <p>O fluxo conduz a proxima acao em vez de espalhar paineis.</p>
          </article>
        </div>
      </section>

      <section className="editor-central-workflow">
        <aside className="editor-central-steps">
          <h2>Fluxo da funcao</h2>
          <article className={`editor-central-step ${summary.stageNumber === "01" ? "is-active" : ""}`}>
            <span>01</span>
            <strong>Escrita</strong>
            <p>Produzir o texto, abrir a estrutura e consolidar o manuscrito vivo.</p>
          </article>
          <article className={`editor-central-step ${summary.stageNumber === "02" || summary.stageNumber === "03" ? "is-active" : ""}`}>
            <span>02</span>
            <strong>Revisao editorial</strong>
            <p>Refinar argumento, integrar Google Docs e preparar leitura assistida.</p>
          </article>
          <article className={`editor-central-step ${summary.stageNumber === "04" ? "is-active" : ""}`}>
            <span>03</span>
            <strong>Submissao</strong>
            <p>Amarrar radar, triagem e checklist final antes da decisao de envio.</p>
          </article>
        </aside>

        <div className="editor-central-main">
          <section className="editor-central-card editor-central-card--composer">
            <div className="editor-central-card__head">
              <div>
                <span className="editor-central-kicker">Central Editorial</span>
                <h2>Artigos em andamento</h2>
              </div>
              <span className="editor-central-chip">{articles.length} manuscrito(s)</span>
            </div>

            <form className="editor-central-create" onSubmit={handleCreateArticle}>
              <input
                onChange={(event) => setTitle(event.target.value)}
                placeholder="Titulo do novo manuscrito"
                value={title}
              />
              <button className="editor-central-button editor-central-button--primary" disabled={isCreating} type="submit">
                {isCreating ? "Criando..." : "Novo artigo"}
              </button>
            </form>

            {errorMessage ? <p className="editor-central-error">{errorMessage}</p> : null}

            <div className="editor-central-article-list">
              {isLoading ? (
                <div className="editor-central-empty">
                  <strong>Carregando manuscritos...</strong>
                  <p>Sincronizando o estado editorial da equipe.</p>
                </div>
              ) : articles.length === 0 ? (
                <div className="editor-central-empty">
                  <strong>Nenhum manuscrito ativo.</strong>
                  <p>Crie o primeiro artigo da equipe para ativar a Central Editorial.</p>
                </div>
              ) : (
                articles.map((article) => {
                  const isActive = article.id === selectedArticle?.id;

                  return (
                    <button
                      className={`editor-central-article ${isActive ? "is-active" : ""}`}
                      key={article.id}
                      onClick={() => setSelectedArticleId(article.id)}
                      type="button"
                    >
                      <div className="editor-central-article__meta">
                        <span>{formatStatusLabel(article.status)}</span>
                        <span>{teamsById[article.equipe_id] ?? "Equipe WebLab"}</span>
                      </div>
                      <strong>{article.titulo}</strong>
                      <p>
                        {countArticleWords(article.conteudo_json)} palavras · atualizacao {formatRelativeUpdate(article.updated_at)}
                      </p>
                    </button>
                  );
                })
              )}
            </div>
          </section>

          <section className="editor-central-card">
            <div className="editor-central-card__head">
              <div>
                <span className="editor-central-kicker">Manuscrito selecionado</span>
                <h2>{selectedArticle?.titulo ?? "Selecione um manuscrito"}</h2>
              </div>
              {selectedArticle ? (
                <span className="editor-central-chip">
                  {selectedArticle.google_doc_id ? "Google Docs vinculado" : "Sem Google Docs"}
                </span>
              ) : null}
            </div>

            {selectedArticle ? (
              <div className="editor-central-summary-grid">
                <article>
                  <span>Status</span>
                  <strong>{formatStatusLabel(selectedArticle.status)}</strong>
                  <p>{summary.stageDescription}</p>
                </article>
                <article>
                  <span>Texto</span>
                  <strong>{selectedWordCount} palavras</strong>
                  <p>{selectedSectionCount} bloco(s) estruturados no manuscrito.</p>
                </article>
                <article>
                  <span>Radar</span>
                  <strong>{selectedChosenJournal?.journal_title ?? `${selectedShortlist.length} rota(s)`}</strong>
                  <p>
                    {selectedChosenJournal
                      ? "Existe uma revista em destaque para decisao editorial."
                      : "Revistas salvas e sinais editoriais vinculados a este artigo."}
                  </p>
                </article>
                <article>
                  <span>Sincronizacao</span>
                  <strong>{selectedArticle.google_doc_id ? "Google ativo" : "WebLab puro"}</strong>
                  <p>{selectedGoogleState}</p>
                </article>
              </div>
            ) : (
              <div className="editor-central-empty">
                <strong>Sem contexto ativo.</strong>
                <p>Escolha um artigo na lista para ver prioridade, prontidao e proximo passo.</p>
              </div>
            )}

            {selectedArticle ? (
              <div className="editor-central-focus">
                <div>
                  <span>Principal ajuste recomendado</span>
                  <strong>{summary.priority}</strong>
                  <p>{summary.nextStep}</p>
                </div>
                <div className="editor-central-focus__actions">
                  <button
                    className="editor-central-button editor-central-button--primary"
                    onClick={() => router.push(getArticleEditorHref(selectedArticle.id))}
                    type="button"
                  >
                    Abrir editor
                  </button>
                  <button
                    className="editor-central-button"
                    onClick={() =>
                      router.push(
                        selectedScreeningSets.length > 0
                          ? ("/dashboard/triagem" as Route)
                          : ("/dashboard/periodicos" as Route)
                      )
                    }
                    type="button"
                  >
                    {selectedScreeningSets.length > 0 ? "Abrir triagem vinculada" : "Abrir radar editorial"}
                  </button>
                </div>
              </div>
            ) : null}
          </section>
        </div>

        <aside className="editor-central-assistant">
          <section className="editor-central-card">
            <div className="editor-central-card__head">
              <div>
                <span className="editor-central-kicker">Painel lateral inteligente</span>
                <h2>Estado do laboratorio</h2>
              </div>
            </div>
            <div className="editor-central-progress">
              <div>
                <strong>{readyCount}</strong>
                <span>texto(s) com base editorial</span>
              </div>
              <div>
                <strong>{linkedCount}</strong>
                <span>documento(s) Google vinculados</span>
              </div>
              <div>
                <strong>{shortlists.filter((entry) => entry.chosen_for_submission).length}</strong>
                <span>revista(s)-alvo definidas</span>
              </div>
              <div>
                <strong>{screeningSets.length}</strong>
                <span>caderno(s) de triagem ativos</span>
              </div>
            </div>
          </section>

          <section className="editor-central-card">
            <div className="editor-central-card__head">
              <div>
                <span className="editor-central-kicker">Checklist curto</span>
                <h2>O que importa agora</h2>
              </div>
            </div>
            <div className="editor-central-checklist">
              {summary.checklist.map((item) => (
                <article key={item}>
                  <strong>{item}</strong>
                </article>
              ))}
            </div>
          </section>

          <section className="editor-central-card">
            <div className="editor-central-card__head">
              <div>
                <span className="editor-central-kicker">Acao seguinte</span>
                <h2>Conducao editorial</h2>
              </div>
            </div>
            <div className="editor-central-highlight">
              <strong>{summary.nextStep}</strong>
              <p>
                O fluxo deixa de espalhar paineis e transforma o estado do manuscrito em uma acao unica e clara.
              </p>
            </div>
          </section>
        </aside>
      </section>

      <style jsx>{`
        .editor-central-page {
          display: grid;
          gap: 20px;
          padding: 22px 0 38px;
        }

        .editor-central-hero,
        .editor-central-card,
        .editor-central-step {
          background: rgba(255, 255, 255, 0.84);
          border: 1px solid rgba(191, 216, 218, 0.9);
          box-shadow: 0 18px 50px rgba(14, 48, 56, 0.08);
        }

        .editor-central-hero {
          display: grid;
          grid-template-columns: 1.3fr 0.9fr;
          gap: 18px;
          padding: 24px;
          border-radius: 24px;
          background:
            linear-gradient(135deg, rgba(223, 243, 240, 0.8), rgba(255, 255, 255, 0.9)),
            radial-gradient(circle at right top, rgba(43, 140, 134, 0.1), transparent 35%);
        }

        .editor-central-hero__main {
          display: grid;
          gap: 14px;
        }

        .editor-central-pill,
        .editor-central-chip,
        .editor-central-article__meta span {
          display: inline-flex;
          align-items: center;
          min-height: 32px;
          width: fit-content;
          padding: 0 12px;
          border-radius: 999px;
          border: 1px solid rgba(191, 216, 218, 0.9);
          background: rgba(255, 255, 255, 0.86);
          color: #2b6b71;
          font-size: 12px;
          font-weight: 800;
          letter-spacing: 0.02em;
          text-transform: uppercase;
        }

        h1,
        h2 {
          margin: 0;
          color: #14323b;
        }

        h1 {
          max-width: 840px;
          font-size: clamp(2.9rem, 4vw, 4.35rem);
          line-height: 0.98;
          letter-spacing: -0.04em;
          font-family: var(--font-editor-serif), Georgia, serif;
        }

        .editor-central-hero p,
        .editor-central-step p,
        .editor-central-article p,
        .editor-central-summary-grid p,
        .editor-central-highlight p,
        .editor-central-empty p {
          margin: 0;
          color: #5d7880;
          line-height: 1.6;
          font-size: 14px;
        }

        .editor-central-actions {
          display: flex;
          gap: 10px;
          flex-wrap: wrap;
        }

        .editor-central-button {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          min-height: 46px;
          padding: 0 16px;
          border-radius: 14px;
          border: 1px solid rgba(191, 216, 218, 0.9);
          background: rgba(255, 255, 255, 0.9);
          color: #14323b;
          font-size: 14px;
          font-weight: 800;
          text-decoration: none;
          transition: transform 180ms ease, box-shadow 180ms ease, background 180ms ease;
        }

        .editor-central-button:hover {
          transform: translateY(-1px);
          box-shadow: 0 14px 28px rgba(15, 23, 42, 0.08);
        }

        .editor-central-button--primary {
          background: #2b8c86;
          color: white;
          border-color: transparent;
        }

        .editor-central-hero__stats {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 12px;
        }

        .editor-central-hero__stats article,
        .editor-central-summary-grid article {
          display: grid;
          gap: 8px;
          padding: 16px;
          border-radius: 18px;
          background: #ffffff;
          border: 1px solid rgba(215, 231, 232, 1);
        }

        .editor-central-hero__stats span,
        .editor-central-summary-grid span,
        .editor-central-kicker {
          font-size: 12px;
          color: #5d7880;
          text-transform: uppercase;
          letter-spacing: 0.06em;
          font-weight: 800;
        }

        .editor-central-hero__stats strong,
        .editor-central-summary-grid strong,
        .editor-central-progress strong {
          font-size: 28px;
          line-height: 1;
          color: #14323b;
        }

        .editor-central-workflow {
          display: grid;
          grid-template-columns: 280px 1fr 340px;
          gap: 18px;
          align-items: start;
        }

        .editor-central-steps {
          display: grid;
          gap: 10px;
          position: sticky;
          top: 92px;
        }

        .editor-central-steps h2 {
          font-size: 15px;
          text-transform: uppercase;
          letter-spacing: 0.06em;
          color: #5d7880;
        }

        .editor-central-step {
          padding: 14px;
          border-radius: 18px;
        }

        .editor-central-step.is-active {
          border-color: rgba(43, 140, 134, 0.8);
          background: linear-gradient(180deg, #f7fffe 0, #ffffff 100%);
        }

        .editor-central-step span {
          display: grid;
          place-items: center;
          width: 28px;
          height: 28px;
          margin-bottom: 10px;
          border-radius: 10px;
          background: #eff9f9;
          color: #2b8c86;
          font-size: 13px;
          font-weight: 800;
        }

        .editor-central-step strong,
        .editor-central-article strong,
        .editor-central-highlight strong,
        .editor-central-empty strong,
        .editor-central-checklist strong {
          display: block;
          margin-bottom: 6px;
          color: #14323b;
        }

        .editor-central-main,
        .editor-central-assistant {
          display: grid;
          gap: 18px;
        }

        .editor-central-card {
          display: grid;
          gap: 18px;
          padding: 18px;
          border-radius: 22px;
        }

        .editor-central-card__head {
          display: flex;
          justify-content: space-between;
          gap: 12px;
          align-items: flex-start;
        }

        .editor-central-card__head h2 {
          font-size: 1.8rem;
          line-height: 1.04;
          letter-spacing: -0.03em;
        }

        .editor-central-create {
          display: flex;
          gap: 10px;
          flex-wrap: wrap;
        }

        .editor-central-create input {
          flex: 1 1 280px;
          min-height: 48px;
          border-radius: 16px;
          border: 1px solid rgba(191, 216, 218, 0.9);
          padding: 0 16px;
          font-size: 15px;
          color: #14323b;
          background: rgba(255, 255, 255, 0.96);
        }

        .editor-central-create input:focus {
          outline: 2px solid rgba(43, 140, 134, 0.2);
          border-color: rgba(43, 140, 134, 0.66);
        }

        .editor-central-error {
          margin: 0;
          color: #b42318;
          font-weight: 700;
        }

        .editor-central-article-list,
        .editor-central-checklist {
          display: grid;
          gap: 12px;
        }

        .editor-central-article {
          display: grid;
          gap: 8px;
          padding: 16px;
          border-radius: 18px;
          border: 1px solid rgba(215, 231, 232, 1);
          background: #ffffff;
          text-align: left;
          transition: transform 180ms ease, border-color 180ms ease, box-shadow 180ms ease;
        }

        .editor-central-article:hover,
        .editor-central-article.is-active {
          transform: translateY(-1px);
          border-color: rgba(43, 140, 134, 0.68);
          box-shadow: 0 14px 28px rgba(15, 23, 42, 0.06);
        }

        .editor-central-article__meta {
          display: flex;
          gap: 8px;
          flex-wrap: wrap;
        }

        .editor-central-summary-grid {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 12px;
        }

        .editor-central-focus,
        .editor-central-highlight {
          display: grid;
          gap: 12px;
          padding: 16px;
          border-radius: 18px;
          border: 1px solid rgba(191, 216, 218, 1);
          background: #eff9f8;
        }

        .editor-central-focus span,
        .editor-central-highlight span {
          font-size: 12px;
          color: #2b6b71;
          text-transform: uppercase;
          letter-spacing: 0.06em;
          font-weight: 800;
        }

        .editor-central-focus__actions {
          display: flex;
          gap: 10px;
          flex-wrap: wrap;
        }

        .editor-central-progress {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 12px;
        }

        .editor-central-progress div,
        .editor-central-checklist article,
        .editor-central-empty {
          padding: 14px;
          border-radius: 16px;
          border: 1px solid rgba(215, 231, 232, 1);
          background: #ffffff;
        }

        .editor-central-progress span {
          color: #5d7880;
          line-height: 1.5;
          font-size: 13px;
        }

        @media (max-width: 1240px) {
          .editor-central-workflow {
            grid-template-columns: 1fr;
          }

          .editor-central-steps {
            position: static;
          }
        }

        @media (max-width: 980px) {
          .editor-central-hero,
          .editor-central-summary-grid,
          .editor-central-progress {
            grid-template-columns: 1fr;
          }
        }

        @media (max-width: 720px) {
          .editor-central-page {
            padding: 16px 0 32px;
          }

          .editor-central-card__head {
            flex-direction: column;
          }

          h1 {
            font-size: 2.4rem;
          }
        }
      `}</style>
    </main>
  );
}
