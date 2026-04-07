"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";

import { getSupabaseClient } from "@/lib/supabaseClient";
import type {
  ArticleRow,
  EvidenceScreeningDecision,
  EvidenceScreeningSetRow,
  EvidenceStudyRow
} from "@/lib/types";

type CaptureStudy = {
  external_id: string;
  source: string;
  titulo: string;
  autores: string[];
  ano: number | null;
  doi: string | null;
  periodico: string | null;
  resumo: string | null;
  url: string | null;
};

type TriagemHubProps = {
  articles: ArticleRow[];
  profileId: string;
};

const decisionLabels: Record<EvidenceScreeningDecision, string> = {
  pendente: "Pendente",
  incluir: "Incluir",
  excluir: "Excluir",
  talvez: "Talvez"
};

const exclusionReasons = [
  "Fora do escopo",
  "População inadequada",
  "Tipo de estudo inadequado",
  "Sem resumo suficiente",
  "Duplicado conceitual",
  "Outro motivo"
];

function buildSearchSeed(article: ArticleRow | null) {
  if (!article) {
    return "";
  }

  return article.titulo;
}

function countByDecision(studies: EvidenceStudyRow[]) {
  return studies.reduce(
    (summary, study) => ({
      ...summary,
      [study.decisao]: summary[study.decisao] + 1
    }),
    { pendente: 0, incluir: 0, excluir: 0, talvez: 0 } satisfies Record<EvidenceScreeningDecision, number>
  );
}

function buildScreeningReport(set: EvidenceScreeningSetRow | null, studies: EvidenceStudyRow[]) {
  const counts = countByDecision(studies);
  const rows = studies
    .map((study, index) =>
      [
        `${index + 1}. ${study.titulo}`,
        `- Decisão: ${decisionLabels[study.decisao]}`,
        `- Ano: ${study.ano ?? "s.d."}`,
        `- Periódico: ${study.periodico ?? "não informado"}`,
        `- DOI: ${study.doi ?? "não informado"}`,
        study.motivo_exclusao ? `- Motivo de exclusão: ${study.motivo_exclusao}` : null,
        study.notas ? `- Notas: ${study.notas}` : null,
        ""
      ]
        .filter(Boolean)
        .join("\n")
    )
    .join("\n");

  return [
    `# Triagem de evidências - ${set?.titulo ?? "Conjunto sem título"}`,
    "",
    `Pergunta: ${set?.pergunta || "não informada"}`,
    "",
    "## Resumo",
    `- Captados: ${studies.length}`,
    `- Pendentes: ${counts.pendente}`,
    `- Incluídos: ${counts.incluir}`,
    `- Talvez: ${counts.talvez}`,
    `- Excluídos: ${counts.excluir}`,
    "",
    "## Critérios",
    `- Inclusão: ${set?.criterios_inclusao || "não informado"}`,
    `- Exclusão: ${set?.criterios_exclusao || "não informado"}`,
    "",
    "## Estudos",
    rows || "Nenhum estudo salvo ainda."
  ].join("\n");
}

export function TriagemHub({ articles, profileId }: TriagemHubProps) {
  const [selectedArticleId, setSelectedArticleId] = useState(articles[0]?.id ?? "");
  const [sets, setSets] = useState<EvidenceScreeningSetRow[]>([]);
  const [activeSetId, setActiveSetId] = useState("");
  const [studies, setStudies] = useState<EvidenceStudyRow[]>([]);
  const [captureResults, setCaptureResults] = useState<CaptureStudy[]>([]);
  const [searchQuery, setSearchQuery] = useState(buildSearchSeed(articles[0] ?? null));
  const [setTitle, setSetTitle] = useState("Triagem inicial");
  const [question, setQuestion] = useState("");
  const [inclusionCriteria, setInclusionCriteria] = useState("");
  const [exclusionCriteria, setExclusionCriteria] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [isLoadingSets, setIsLoadingSets] = useState(false);
  const [isCapturing, setIsCapturing] = useState(false);

  const selectedArticle = articles.find((article) => article.id === selectedArticleId) ?? null;
  const activeSet = sets.find((set) => set.id === activeSetId) ?? null;
  const decisionSummary = useMemo(() => countByDecision(studies), [studies]);
  const savedExternalIds = useMemo(() => new Set(studies.map((study) => study.external_id)), [studies]);

  useEffect(() => {
    if (!selectedArticleId) {
      return;
    }

    const nextArticle = articles.find((article) => article.id === selectedArticleId) ?? null;
    setSearchQuery(buildSearchSeed(nextArticle));
  }, [articles, selectedArticleId]);

  useEffect(() => {
    let isMounted = true;

    const loadSets = async () => {
      if (!selectedArticleId) {
        return;
      }

      setIsLoadingSets(true);
      const supabase = getSupabaseClient();
      const { data, error } = await supabase
        .from("triagem_conjuntos")
        .select("*")
        .eq("artigo_id", selectedArticleId)
        .order("updated_at", { ascending: false, nullsFirst: false });

      if (!isMounted) {
        return;
      }

      if (error) {
        setMessage(
          error.message.includes("triagem_conjuntos")
            ? "Rode o SQL de triagem no Supabase para habilitar este módulo."
            : error.message
        );
        setSets([]);
        setActiveSetId("");
      } else {
        const nextSets = data ?? [];
        setSets(nextSets);
        setActiveSetId((current) => (nextSets.some((set) => set.id === current) ? current : nextSets[0]?.id ?? ""));
        setMessage(null);
      }

      setIsLoadingSets(false);
    };

    void loadSets();

    return () => {
      isMounted = false;
    };
  }, [selectedArticleId]);

  useEffect(() => {
    let isMounted = true;

    const loadStudies = async () => {
      if (!activeSetId) {
        setStudies([]);
        return;
      }

      const supabase = getSupabaseClient();
      const { data, error } = await supabase
        .from("triagem_estudos")
        .select("*")
        .eq("conjunto_id", activeSetId)
        .order("created_at", { ascending: false });

      if (!isMounted) {
        return;
      }

      if (error) {
        setMessage(error.message);
        setStudies([]);
      } else {
        setStudies(data ?? []);
      }
    };

    void loadStudies();

    return () => {
      isMounted = false;
    };
  }, [activeSetId]);

  const createScreeningSet = async () => {
    if (!selectedArticle) {
      return;
    }

    const supabase = getSupabaseClient();
    const { data, error } = await supabase
      .from("triagem_conjuntos")
      .insert({
        artigo_id: selectedArticle.id,
        equipe_id: selectedArticle.equipe_id,
        titulo: setTitle.trim() || `Triagem - ${selectedArticle.titulo}`,
        pergunta: question.trim(),
        criterios_inclusao: inclusionCriteria.trim(),
        criterios_exclusao: exclusionCriteria.trim(),
        created_by: profileId
      })
      .select("*")
      .single();

    if (error) {
      setMessage(error.message);
      return;
    }

    setSets((current) => [data, ...current]);
    setActiveSetId(data.id);
    setMessage("Conjunto de evidências criado.");
  };

  const captureStudies = async () => {
    if (!searchQuery.trim()) {
      setMessage("Informe termos de busca para captar estudos.");
      return;
    }

    setIsCapturing(true);
    setMessage(null);

    try {
      const response = await fetch("/api/triagem/captar", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ query: searchQuery })
      });

      if (!response.ok) {
        throw new Error("Não foi possível captar estudos agora.");
      }

      const payload = (await response.json()) as { studies?: CaptureStudy[] };
      setCaptureResults(payload.studies ?? []);
      setMessage(payload.studies?.length ? "Captação concluída com OpenAlex." : "Nenhum estudo encontrado.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Erro ao captar estudos.");
    } finally {
      setIsCapturing(false);
    }
  };

  const saveStudy = async (study: CaptureStudy) => {
    if (!activeSetId) {
      setMessage("Crie ou selecione um conjunto antes de salvar estudos.");
      return;
    }

    const supabase = getSupabaseClient();
    const { data, error } = await supabase
      .from("triagem_estudos")
      .upsert(
        {
          conjunto_id: activeSetId,
          external_id: study.external_id,
          source: study.source,
          titulo: study.titulo,
          autores: study.autores,
          ano: study.ano,
          doi: study.doi,
          periodico: study.periodico,
          resumo: study.resumo,
          url: study.url,
          added_by: profileId
        },
        { onConflict: "conjunto_id,external_id" }
      )
      .select("*")
      .single();

    if (error) {
      setMessage(error.message);
      return;
    }

    setStudies((current) => [data, ...current.filter((item) => item.id !== data.id)]);
    setMessage("Estudo salvo no conjunto.");
  };

  const updateDecision = async (
    study: EvidenceStudyRow,
    decisao: EvidenceScreeningDecision,
    motivo_exclusao = ""
  ) => {
    const supabase = getSupabaseClient();
    const { data, error } = await supabase
      .from("triagem_estudos")
      .update({
        decisao,
        motivo_exclusao: decisao === "excluir" ? motivo_exclusao : "",
        updated_at: new Date().toISOString()
      })
      .eq("id", study.id)
      .select("*")
      .single();

    if (error) {
      setMessage(error.message);
      return;
    }

    setStudies((current) => current.map((item) => (item.id === data.id ? data : item)));
  };

  const copyReport = async () => {
    const report = buildScreeningReport(activeSet, studies);
    await navigator.clipboard.writeText(report);
    setMessage("Relatório de triagem copiado.");
  };

  const downloadReport = () => {
    const report = buildScreeningReport(activeSet, studies);
    const blob = new Blob([report], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `triagem-${activeSet?.titulo ?? "weblab"}.md`.replace(/[^\w.-]+/g, "-");
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <main className="lovable-home triagem-page">
      <section className="hero-panel triagem-hero">
        <div className="hero-panel-content">
          <span className="eyebrow">triagem de evidências</span>
          <h1>Capture, deduplique e decida sem sair do WebLab.</h1>
          <p>
            Um primeiro fluxo interno para revisões: buscar estudos, salvar candidatos, registrar decisões
            e preparar números iniciais do PRISMA.
          </p>
        </div>
        <div className="periodicos-hero-metrics">
          <article>
            <strong>{studies.length}</strong>
            <span>captados</span>
          </article>
          <article>
            <strong>{decisionSummary.incluir}</strong>
            <span>incluídos</span>
          </article>
          <article>
            <strong>{decisionSummary.talvez}</strong>
            <span>talvez</span>
          </article>
          <article>
            <strong>{decisionSummary.excluir}</strong>
            <span>excluídos</span>
          </article>
        </div>
      </section>

      <section className="public-content-section">
        <div className="lovable-container triagem-grid">
          <aside className="triagem-control-panel">
            <label>
              Manuscrito
              <select value={selectedArticleId} onChange={(event) => setSelectedArticleId(event.target.value)}>
                {articles.map((article) => (
                  <option key={article.id} value={article.id}>
                    {article.titulo}
                  </option>
                ))}
              </select>
            </label>

            <div className="triagem-set-list">
              <div>
                <strong>Conjuntos</strong>
                <span>{isLoadingSets ? "carregando..." : `${sets.length} conjunto(s)`}</span>
              </div>
              {sets.length === 0 ? <p className="muted">Crie um conjunto para iniciar a triagem.</p> : null}
              {sets.map((set) => (
                <button
                  className={set.id === activeSetId ? "active" : ""}
                  key={set.id}
                  onClick={() => setActiveSetId(set.id)}
                  type="button"
                >
                  {set.titulo}
                </button>
              ))}
            </div>

            <div className="triagem-create-card">
              <strong>Novo conjunto</strong>
              <input value={setTitle} onChange={(event) => setSetTitle(event.target.value)} placeholder="Nome do conjunto" />
              <textarea value={question} onChange={(event) => setQuestion(event.target.value)} placeholder="Pergunta de revisão" />
              <textarea
                value={inclusionCriteria}
                onChange={(event) => setInclusionCriteria(event.target.value)}
                placeholder="Critérios de inclusão"
              />
              <textarea
                value={exclusionCriteria}
                onChange={(event) => setExclusionCriteria(event.target.value)}
                placeholder="Critérios de exclusão"
              />
              <button className="button button-primary" disabled={!selectedArticle} onClick={createScreeningSet} type="button">
                Criar conjunto
              </button>
            </div>
          </aside>

          <div className="triagem-workspace">
            <section className="triagem-search-card">
              <div>
                <span className="eyebrow">captação</span>
                <h2>Buscar estudos candidatos</h2>
                <p>Hoje a captação usa OpenAlex. Dimensions, Scopus e WoS entram depois como fontes premium.</p>
              </div>
              <div className="triagem-search-row">
                <input value={searchQuery} onChange={(event) => setSearchQuery(event.target.value)} placeholder="Tema, descritores ou pergunta" />
                <button className="button button-primary" disabled={isCapturing} onClick={() => void captureStudies()} type="button">
                  {isCapturing ? "Captando..." : "Captar estudos"}
                </button>
              </div>
              {message ? <p className="muted">{message}</p> : null}
            </section>

            {activeSet ? (
              <section className="triagem-prisma-card">
                <div>
                  <span className="eyebrow">caderno da revisão</span>
                  <h2>{activeSet.titulo}</h2>
                  <p>{activeSet.pergunta || "Pergunta ainda não informada."}</p>
                </div>
                <div className="triagem-prisma-stats">
                  <span>Captados {studies.length}</span>
                  <span>Pendentes {decisionSummary.pendente}</span>
                  <span>Incluídos {decisionSummary.incluir}</span>
                  <span>Excluídos {decisionSummary.excluir}</span>
                </div>
                <div className="triagem-actions">
                  <button className="button button-secondary" onClick={() => void copyReport()} type="button">
                    Copiar relatório
                  </button>
                  <button className="button button-secondary" onClick={downloadReport} type="button">
                    Baixar Markdown
                  </button>
                  <Link className="button button-secondary" href={`/editor/${activeSet.artigo_id}`}>
                    Abrir manuscrito
                  </Link>
                </div>
              </section>
            ) : null}

            <section className="triagem-results-grid">
              <div className="triagem-column">
                <h2>Resultados captados</h2>
                {captureResults.length === 0 ? <p className="muted">A busca aparecerá aqui.</p> : null}
                {captureResults.map((study) => (
                  <article className="triagem-study-card" key={study.external_id}>
                    <span>{study.source} · {study.ano ?? "s.d."}</span>
                    <h3>{study.titulo}</h3>
                    <p>{study.periodico ?? "Periódico não informado"}</p>
                    <small>{study.resumo?.slice(0, 360) ?? "Sem resumo disponível."}</small>
                    <button
                      className="button button-secondary"
                      disabled={savedExternalIds.has(study.external_id)}
                      onClick={() => void saveStudy(study)}
                      type="button"
                    >
                      {savedExternalIds.has(study.external_id) ? "Salvo" : "Salvar no conjunto"}
                    </button>
                  </article>
                ))}
              </div>

              <div className="triagem-column">
                <h2>Triagem do conjunto</h2>
                {studies.length === 0 ? <p className="muted">Salve estudos captados para iniciar as decisões.</p> : null}
                {studies.map((study) => (
                  <article className="triagem-study-card" data-decision={study.decisao} key={study.id}>
                    <span>{decisionLabels[study.decisao]} · {study.ano ?? "s.d."}</span>
                    <h3>{study.titulo}</h3>
                    <p>{study.periodico ?? "Periódico não informado"}</p>
                    <small>{study.resumo?.slice(0, 420) ?? "Sem resumo disponível."}</small>
                    {study.motivo_exclusao ? <em>Motivo: {study.motivo_exclusao}</em> : null}
                    <div className="triagem-decision-row">
                      <button onClick={() => void updateDecision(study, "incluir")} type="button">
                        Incluir
                      </button>
                      <button onClick={() => void updateDecision(study, "talvez")} type="button">
                        Talvez
                      </button>
                      {exclusionReasons.slice(0, 3).map((reason) => (
                        <button key={reason} onClick={() => void updateDecision(study, "excluir", reason)} type="button">
                          {reason}
                        </button>
                      ))}
                    </div>
                    {study.url ? (
                      <a href={study.url} rel="noreferrer" target="_blank">
                        Abrir fonte
                      </a>
                    ) : null}
                  </article>
                ))}
              </div>
            </section>
          </div>
        </div>
      </section>
    </main>
  );
}
