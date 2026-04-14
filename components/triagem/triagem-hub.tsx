"use client";

import { useEffect, useMemo, useState, type ChangeEvent } from "react";
import Link from "next/link";

import { getSupabaseClient } from "@/lib/supabaseClient";
import { parseEvidenceImport } from "@/lib/triagem-import";
import type {
  ArticleRow,
  EvidenceScreeningDecision,
  EvidenceScreeningSetRow,
  EvidenceStudyReviewRow,
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

function countAggregateDecisions(
  studies: EvidenceStudyRow[],
  reviewsByStudy: Map<string, EvidenceStudyReviewRow[]>
) {
  return studies.reduce(
    (summary, study) => {
      const aggregateDecision = getAggregateDecision(study, getReviewMeta(reviewsByStudy.get(study.id) ?? []));

      return {
        ...summary,
        [aggregateDecision]: summary[aggregateDecision] + 1
      };
    },
    { pendente: 0, incluir: 0, excluir: 0, talvez: 0 } satisfies Record<EvidenceScreeningDecision, number>
  );
}

function getReviewMeta(reviews: EvidenceStudyReviewRow[]) {
  const decisions = reviews
    .map((review) => review.decisao)
    .filter((decision) => decision !== "pendente");
  const uniqueDecisions = Array.from(new Set(decisions));

  return {
    reviewersCount: reviews.length,
    hasConflict: uniqueDecisions.length > 1,
    consensus: uniqueDecisions.length === 1 ? uniqueDecisions[0] : null
  };
}

function getAggregateDecision(
  study: Pick<EvidenceStudyRow, "decisao" | "decisao_final">,
  reviewMeta: ReturnType<typeof getReviewMeta>
) {
  if (study.decisao_final) {
    return study.decisao_final;
  }

  if (reviewMeta.consensus) {
    return reviewMeta.consensus;
  }

  return study.decisao;
}

function normalizeFingerprint(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function getStudyDuplicateKey(study: Pick<EvidenceStudyRow | CaptureStudy, "doi" | "titulo" | "ano">) {
  if (study.doi) {
    return `doi:${normalizeFingerprint(study.doi)}`;
  }

  const titleKey = normalizeFingerprint(study.titulo)
    .split(" ")
    .filter((word) => word.length > 2)
    .slice(0, 14)
    .join(" ");

  return titleKey ? `title:${titleKey}:${study.ano ?? "sd"}` : "";
}

function getDuplicateKeys(studies: Array<Pick<EvidenceStudyRow | CaptureStudy, "doi" | "titulo" | "ano">>) {
  const counts = new Map<string, number>();

  studies.forEach((study) => {
    const key = getStudyDuplicateKey(study);

    if (key) {
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
  });

  return new Set(Array.from(counts.entries()).filter(([, count]) => count > 1).map(([key]) => key));
}

function summarizeExclusionReasons(
  studies: EvidenceStudyRow[],
  reviewsByStudy: Map<string, EvidenceStudyReviewRow[]>
) {
  const counts = new Map<string, number>();

  studies.forEach((study) => {
    const aggregateDecision = getAggregateDecision(study, getReviewMeta(reviewsByStudy.get(study.id) ?? []));

    if (aggregateDecision !== "excluir") {
      return;
    }

    const reason = study.motivo_exclusao || study.motivo_resolucao || "Sem motivo registrado";
    counts.set(reason, (counts.get(reason) ?? 0) + 1);
  });

  return Array.from(counts.entries())
    .map(([reason, total]) => ({ reason, total }))
    .sort((left, right) => right.total - left.total);
}

function buildPrismaSnapshot(
  studies: EvidenceStudyRow[],
  reviewsByStudy: Map<string, EvidenceStudyReviewRow[]>,
  duplicateStudyIds: Set<string>,
  conflictStudyIds: Set<string>
) {
  const aggregate = countAggregateDecisions(studies, reviewsByStudy);
  const resolved = studies.filter((study) => Boolean(study.decisao_final)).length;
  const finalIncluded = studies.filter((study) => getAggregateDecision(study, getReviewMeta(reviewsByStudy.get(study.id) ?? [])) === "incluir").length;

  return {
    captados: studies.length,
    duplicados: duplicateStudyIds.size,
    triados: Math.max(studies.length - duplicateStudyIds.size, 0),
    excluidos: aggregate.excluir,
    talvez: aggregate.talvez,
    pendentes: aggregate.pendente,
    incluidos: aggregate.incluir,
    conflitos: conflictStudyIds.size,
    resolvidos: resolved,
    finalIncluded
  };
}

function buildScreeningCsv(
  studies: EvidenceStudyRow[],
  reviewsByStudy: Map<string, EvidenceStudyReviewRow[]>
) {
  const escapeCell = (value: string) => `"${value.replace(/"/g, '""')}"`;

  const header = [
    "titulo",
    "ano",
    "periodico",
    "doi",
    "decisao_atual",
    "decisao_final",
    "revisores",
    "conflito",
    "motivo_exclusao",
    "motivo_resolucao",
    "url"
  ];

  const rows = studies.map((study) => {
    const reviewMeta = getReviewMeta(reviewsByStudy.get(study.id) ?? []);
    const aggregateDecision = getAggregateDecision(study, reviewMeta);

    return [
      study.titulo,
      String(study.ano ?? ""),
      study.periodico ?? "",
      study.doi ?? "",
      decisionLabels[aggregateDecision],
      study.decisao_final ? decisionLabels[study.decisao_final] : "",
      String(reviewMeta.reviewersCount),
      reviewMeta.hasConflict ? "sim" : "nao",
      study.motivo_exclusao ?? "",
      study.motivo_resolucao ?? "",
      study.url ?? ""
    ]
      .map(escapeCell)
      .join(",");
  });

  return [header.join(","), ...rows].join("\n");
}

function buildScreeningReport(
  set: EvidenceScreeningSetRow | null,
  studies: EvidenceStudyRow[],
  reviewsByStudy: Map<string, EvidenceStudyReviewRow[]>
) {
  const counts = countAggregateDecisions(studies, reviewsByStudy);
  const duplicateKeys = getDuplicateKeys(studies);
  const conflictCount = studies.filter((study) => getReviewMeta(reviewsByStudy.get(study.id) ?? []).hasConflict).length;
  const prismaSnapshot = buildPrismaSnapshot(studies, reviewsByStudy, getDuplicateKeys(studies).size ? new Set(
    studies.filter((study) => duplicateKeys.has(getStudyDuplicateKey(study))).map((study) => study.id)
  ) : new Set<string>(), new Set(
    studies.filter((study) => getReviewMeta(reviewsByStudy.get(study.id) ?? []).hasConflict).map((study) => study.id)
  ));
  const exclusionSummary = summarizeExclusionReasons(studies, reviewsByStudy);
  const rows = studies
    .map((study, index) => {
      const reviewMeta = getReviewMeta(reviewsByStudy.get(study.id) ?? []);
      const aggregateDecision = getAggregateDecision(study, reviewMeta);

      return [
        `${index + 1}. ${study.titulo}`,
        `- Decisão atual: ${decisionLabels[aggregateDecision]}`,
        study.decisao_final ? `- Decisão final da equipe: ${decisionLabels[study.decisao_final]}` : null,
        `- Revisores: ${reviewMeta.reviewersCount}`,
        reviewMeta.hasConflict
          ? "- Estado de revisão: conflito entre revisores"
          : reviewMeta.consensus
            ? `- Estado de revisão: consenso em ${decisionLabels[reviewMeta.consensus]}`
            : null,
        `- Ano: ${study.ano ?? "s.d."}`,
        `- Periódico: ${study.periodico ?? "não informado"}`,
        `- DOI: ${study.doi ?? "não informado"}`,
        study.motivo_exclusao ? `- Motivo de exclusão: ${study.motivo_exclusao}` : null,
        study.notas ? `- Notas: ${study.notas}` : null,
        ""
      ]
        .filter(Boolean)
        .join("\n");
    })
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
    `- Possíveis duplicados: ${duplicateKeys.size}`,
    `- Conflitos entre revisores: ${conflictCount}`,
    `- Incluídos finais: ${prismaSnapshot.finalIncluded}`,
    "",
    "## Critérios",
    `- Inclusão: ${set?.criterios_inclusao || "não informado"}`,
    `- Exclusão: ${set?.criterios_exclusao || "não informado"}`,
    exclusionSummary.length ? "" : null,
    exclusionSummary.length ? "## Motivos frequentes de exclusão" : null,
    ...exclusionSummary.slice(0, 5).map((item) => `- ${item.reason}: ${item.total}`),
    "",
    "## Estudos",
    rows || "Nenhum estudo salvo ainda."
  ].join("\n");
}

export function TriagemHub({ articles, profileId }: TriagemHubProps) {
  const [studyFilter, setStudyFilter] = useState<
    "todos" | EvidenceScreeningDecision | "conflito" | "duplicado" | "incluidos_finais"
  >("todos");
  const [selectedStudyIds, setSelectedStudyIds] = useState<string[]>([]);
  const [selectedArticleId, setSelectedArticleId] = useState(articles[0]?.id ?? "");
  const [sets, setSets] = useState<EvidenceScreeningSetRow[]>([]);
  const [activeSetId, setActiveSetId] = useState("");
  const [studies, setStudies] = useState<EvidenceStudyRow[]>([]);
  const [reviews, setReviews] = useState<EvidenceStudyReviewRow[]>([]);
  const [captureResults, setCaptureResults] = useState<CaptureStudy[]>([]);
  const [searchQuery, setSearchQuery] = useState(buildSearchSeed(articles[0] ?? null));
  const [setTitle, setSetTitle] = useState("Triagem inicial");
  const [question, setQuestion] = useState("");
  const [inclusionCriteria, setInclusionCriteria] = useState("");
  const [exclusionCriteria, setExclusionCriteria] = useState("");
  const [importText, setImportText] = useState("");
  const [importLabel, setImportLabel] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [isLoadingSets, setIsLoadingSets] = useState(false);
  const [isCapturing, setIsCapturing] = useState(false);
  const [isImporting, setIsImporting] = useState(false);

  const selectedArticle = articles.find((article) => article.id === selectedArticleId) ?? null;
  const activeSet = sets.find((set) => set.id === activeSetId) ?? null;
  const reviewsByStudy = useMemo(() => {
    const grouped = new Map<string, EvidenceStudyReviewRow[]>();

    reviews.forEach((review) => {
      grouped.set(review.estudo_id, [...(grouped.get(review.estudo_id) ?? []), review]);
    });

    return grouped;
  }, [reviews]);
  const savedExternalIds = useMemo(() => new Set(studies.map((study) => study.external_id)), [studies]);
  const savedDuplicateKeys = useMemo(() => new Set(studies.map(getStudyDuplicateKey).filter(Boolean)), [studies]);
  const duplicateKeys = useMemo(() => getDuplicateKeys(studies), [studies]);
  const duplicateStudyIds = useMemo(
    () =>
      new Set(
        studies
          .filter((study) => duplicateKeys.has(getStudyDuplicateKey(study)))
          .map((study) => study.id)
      ),
    [duplicateKeys, studies]
  );
  const conflictStudyIds = useMemo(
    () =>
      new Set(
        studies
          .filter((study) => getReviewMeta(reviewsByStudy.get(study.id) ?? []).hasConflict)
          .map((study) => study.id)
      ),
    [reviewsByStudy, studies]
  );
  const unresolvedConflicts = useMemo(
    () =>
      studies.filter((study) => conflictStudyIds.has(study.id) && !study.decisao_final),
    [conflictStudyIds, studies]
  );
  const decisionSummary = useMemo(
    () => countAggregateDecisions(studies, reviewsByStudy),
    [reviewsByStudy, studies]
  );
  const prismaSnapshot = useMemo(
    () => buildPrismaSnapshot(studies, reviewsByStudy, duplicateStudyIds, conflictStudyIds),
    [conflictStudyIds, duplicateStudyIds, reviewsByStudy, studies]
  );
  const exclusionSummary = useMemo(
    () => summarizeExclusionReasons(studies, reviewsByStudy),
    [reviewsByStudy, studies]
  );
  const filteredStudies = useMemo(() => {
    return studies.filter((study) => {
      const reviewMeta = getReviewMeta(reviewsByStudy.get(study.id) ?? []);
      const aggregateDecision = getAggregateDecision(study, reviewMeta);
      const isDuplicate = duplicateStudyIds.has(study.id);
      const isConflict = conflictStudyIds.has(study.id);

      switch (studyFilter) {
        case "conflito":
          return isConflict;
        case "duplicado":
          return isDuplicate;
        case "incluidos_finais":
          return aggregateDecision === "incluir" && Boolean(study.decisao_final || reviewMeta.consensus);
        case "todos":
          return true;
        default:
          return aggregateDecision === studyFilter;
      }
    });
  }, [conflictStudyIds, duplicateStudyIds, reviewsByStudy, studies, studyFilter]);

  useEffect(() => {
    if (!selectedArticleId) {
      return;
    }

    const nextArticle = articles.find((article) => article.id === selectedArticleId) ?? null;
    setSearchQuery(buildSearchSeed(nextArticle));
  }, [articles, selectedArticleId]);

  useEffect(() => {
    setSelectedStudyIds((current) => current.filter((id) => filteredStudies.some((study) => study.id === id)));
  }, [filteredStudies]);

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
        setReviews([]);
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

  useEffect(() => {
    let isMounted = true;

    const loadReviews = async () => {
      if (!studies.length) {
        setReviews([]);
        return;
      }

      const supabase = getSupabaseClient();
      const { data, error } = await supabase
        .from("triagem_avaliacoes")
        .select("*")
        .in(
          "estudo_id",
          studies.map((study) => study.id)
        )
        .order("updated_at", { ascending: false });

      if (!isMounted) {
        return;
      }

      if (error) {
        setMessage(
          error.message.includes("triagem_avaliacoes")
            ? "Rode o SQL atualizado da triagem no Supabase para habilitar duplo revisor."
            : error.message
        );
        setReviews([]);
      } else {
        setReviews(data ?? []);
      }
    };

    void loadReviews();

    return () => {
      isMounted = false;
    };
  }, [studies]);

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
      mergeCaptureResults(payload.studies ?? []);
      setMessage(payload.studies?.length ? "Captação concluída com OpenAlex." : "Nenhum estudo encontrado.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Erro ao captar estudos.");
    } finally {
      setIsCapturing(false);
    }
  };

  const mergeCaptureResults = (nextStudies: CaptureStudy[]) => {
    setCaptureResults((current) => {
      const merged = new Map<string, CaptureStudy>();

      [...nextStudies, ...current].forEach((study, index) => {
        const key = study.external_id || getStudyDuplicateKey(study) || `capture-${index}`;

        if (!merged.has(key)) {
          merged.set(key, study);
        }
      });

      return Array.from(merged.values());
    });
  };

  const importStudiesFromText = (content: string, label?: string) => {
    if (!content.trim()) {
      setMessage("Cole um arquivo RIS, BibTeX ou CSV para importar estudos.");
      return;
    }

    setIsImporting(true);

    try {
      const payload = parseEvidenceImport(content, label ?? "");

      if (!payload.studies.length) {
        setMessage("Nenhum estudo legivel foi encontrado no arquivo importado.");
        return;
      }

      mergeCaptureResults(payload.studies);
      setImportLabel(label ?? `Texto colado (${payload.format.toUpperCase()})`);
      setImportText("");
      setMessage(`${payload.studies.length} estudo(s) importado(s) via ${payload.format.toUpperCase()}.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Nao foi possivel importar a base agora.");
    } finally {
      setIsImporting(false);
    }
  };

  const handleImportFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];

    if (!file) {
      return;
    }

    try {
      const content = await file.text();
      importStudiesFromText(content, file.name);
    } finally {
      event.target.value = "";
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
    const now = new Date().toISOString();
    const currentReviews = reviewsByStudy.get(study.id) ?? [];

    const { data: reviewData, error: reviewError } = await supabase
      .from("triagem_avaliacoes")
      .upsert(
        {
          estudo_id: study.id,
          reviewer_id: profileId,
          decisao,
          motivo_exclusao: decisao === "excluir" ? motivo_exclusao : "",
          updated_at: now
        },
        { onConflict: "estudo_id,reviewer_id" }
      )
      .select("*")
      .single();

    if (reviewError) {
      setMessage(
        reviewError.message.includes("triagem_avaliacoes")
          ? "Rode o SQL atualizado da triagem no Supabase para habilitar duplo revisor."
          : reviewError.message
      );
      return;
    }

    const nextReviews = [reviewData, ...currentReviews.filter((item) => item.id !== reviewData.id)];
    const reviewMeta = getReviewMeta(nextReviews);
    const aggregateDecision = study.decisao_final ?? reviewMeta.consensus ?? "pendente";

    const { data, error } = await supabase
      .from("triagem_estudos")
      .update({
        decisao: aggregateDecision,
        motivo_exclusao: aggregateDecision === "excluir" && !study.decisao_final ? motivo_exclusao : "",
        updated_at: now
      })
      .eq("id", study.id)
      .select("*")
      .single();

    if (error) {
      setMessage(error.message);
      return;
    }

    setStudies((current) => current.map((item) => (item.id === data.id ? data : item)));
    setReviews((current) => [reviewData, ...current.filter((item) => item.id !== reviewData.id)]);
    return true;
  };

  const resolveConflict = async (
    study: EvidenceStudyRow,
    decisaoFinal: EvidenceScreeningDecision,
    motivoResolucao = "Conflito resolvido pela equipe."
  ) => {
    const supabase = getSupabaseClient();
    const now = new Date().toISOString();
    const { data, error } = await supabase
      .from("triagem_estudos")
      .update({
        decisao: decisaoFinal,
        decisao_final: decisaoFinal,
        motivo_exclusao: decisaoFinal === "excluir" ? motivoResolucao : "",
        motivo_resolucao: motivoResolucao,
        resolvido_por: profileId,
        resolvido_em: now,
        updated_at: now
      })
      .eq("id", study.id)
      .select("*")
      .single();

    if (error) {
      setMessage(error.message);
      return;
    }

    setStudies((current) => current.map((item) => (item.id === data.id ? data : item)));
    setMessage("Conflito consolidado no caderno de triagem.");
  };

  const toggleStudySelection = (studyId: string) => {
    setSelectedStudyIds((current) =>
      current.includes(studyId) ? current.filter((id) => id !== studyId) : [...current, studyId]
    );
  };

  const toggleSelectAllFiltered = () => {
    const filteredIds = filteredStudies.map((study) => study.id);
    const allSelected = filteredIds.length > 0 && filteredIds.every((id) => selectedStudyIds.includes(id));

    setSelectedStudyIds((current) => {
      if (allSelected) {
        return current.filter((id) => !filteredIds.includes(id));
      }

      return Array.from(new Set([...current, ...filteredIds]));
    });
  };

  const applyDecisionBatch = async (
    decisao: EvidenceScreeningDecision,
    motivoExclusao = decisao === "excluir" ? "Fora do escopo" : ""
  ) => {
    const targets = studies.filter((study) => selectedStudyIds.includes(study.id));

    if (targets.length === 0) {
      setMessage("Selecione pelo menos um estudo para aplicar decisão em lote.");
      return;
    }

    setMessage(`Aplicando decisão em ${targets.length} estudo(s)...`);

    for (const study of targets) {
      await updateDecision(study, decisao, motivoExclusao);
    }

    setSelectedStudyIds([]);
    setMessage(`Decisão em lote aplicada em ${targets.length} estudo(s).`);
  };

  const copyReport = async () => {
    const report = buildScreeningReport(activeSet, studies, reviewsByStudy);
    await navigator.clipboard.writeText(report);
    setMessage("Relatório de triagem copiado.");
  };

  const downloadReport = () => {
    const report = buildScreeningReport(activeSet, studies, reviewsByStudy);
    const blob = new Blob([report], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `triagem-${activeSet?.titulo ?? "weblab"}.md`.replace(/[^\w.-]+/g, "-");
    link.click();
    URL.revokeObjectURL(url);
  };

  const downloadCsv = () => {
    const csv = buildScreeningCsv(studies, reviewsByStudy);
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `triagem-${activeSet?.titulo ?? "weblab"}.csv`.replace(/[^\w.-]+/g, "-");
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
            <strong>{prismaSnapshot.captados}</strong>
            <span>captados</span>
          </article>
          <article>
            <strong>{prismaSnapshot.triados}</strong>
            <span>triados</span>
          </article>
          <article>
            <strong>{prismaSnapshot.finalIncluded}</strong>
            <span>incluídos finais</span>
          </article>
          <article>
            <strong>{prismaSnapshot.duplicados}</strong>
            <span>duplicados</span>
          </article>
          <article>
            <strong>{prismaSnapshot.conflitos}</strong>
            <span>conflitos</span>
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

            <section className="triagem-search-card triagem-import-card">
              <div>
                <span className="eyebrow">importação</span>
                <h2>Trazer resultados de outras bases</h2>
                <p>Importe RIS, BibTeX ou CSV para continuar a triagem sem sair do WebLab.</p>
              </div>
              <div className="triagem-import-actions">
                <label className="button button-secondary triagem-file-button">
                  Selecionar arquivo
                  <input accept=".csv,.ris,.bib,.bibtex,.txt" onChange={handleImportFile} type="file" />
                </label>
                {importLabel ? <span className="triagem-import-label">Ultima base: {importLabel}</span> : null}
              </div>
              <textarea
                className="triagem-import-textarea"
                onChange={(event) => setImportText(event.target.value)}
                placeholder="Cole aqui o conteudo RIS, BibTeX ou CSV exportado da sua base."
                value={importText}
              />
              <div className="triagem-import-actions">
                <button
                  className="button button-secondary"
                  disabled={isImporting || !importText.trim()}
                  onClick={() => importStudiesFromText(importText)}
                  type="button"
                >
                  {isImporting ? "Importando..." : "Importar texto colado"}
                </button>
              </div>
            </section>

            {activeSet ? (
              <section className="triagem-prisma-card">
                <div>
                  <span className="eyebrow">caderno da revisão</span>
                  <h2>{activeSet.titulo}</h2>
                  <p>{activeSet.pergunta || "Pergunta ainda não informada."}</p>
                </div>
                <div className="triagem-prisma-stats">
                  <span>Captados {prismaSnapshot.captados}</span>
                  <span>Triados {prismaSnapshot.triados}</span>
                  <span>Pendentes {prismaSnapshot.pendentes}</span>
                  <span>Incluídos {prismaSnapshot.incluidos}</span>
                  <span>Excluídos {prismaSnapshot.excluidos}</span>
                  <span>Duplicados {prismaSnapshot.duplicados}</span>
                  <span>Conflitos {prismaSnapshot.conflitos}</span>
                  <span>Incluídos finais {prismaSnapshot.finalIncluded}</span>
                </div>
                <div className="triagem-actions">
                  <button className="button button-secondary" onClick={() => void copyReport()} type="button">
                    Copiar relatório
                  </button>
                  <button className="button button-secondary" onClick={downloadReport} type="button">
                    Baixar Markdown
                  </button>
                  <button className="button button-secondary" onClick={downloadCsv} type="button">
                    Baixar CSV
                  </button>
                  <Link className="button button-secondary" href={`/editor/${activeSet.artigo_id}`}>
                    Abrir manuscrito
                  </Link>
                </div>
              </section>
            ) : null}

            {activeSet ? (
              <section className="triagem-prisma-card triagem-prisma-flow-card">
                <div>
                  <span className="eyebrow">prisma</span>
                  <h2>Fluxo da triagem</h2>
                  <p>Um retrato rápido do funil atual do conjunto, com foco em decisão e rastreabilidade.</p>
                </div>
                <div className="triagem-prisma-flow-grid">
                  <article>
                    <strong>{prismaSnapshot.captados}</strong>
                    <span>Registros captados</span>
                  </article>
                  <article>
                    <strong>{prismaSnapshot.duplicados}</strong>
                    <span>Duplicados prováveis</span>
                  </article>
                  <article>
                    <strong>{prismaSnapshot.triados}</strong>
                    <span>Registros triados</span>
                  </article>
                  <article>
                    <strong>{prismaSnapshot.excluidos}</strong>
                    <span>Excluídos</span>
                  </article>
                  <article>
                    <strong>{prismaSnapshot.talvez}</strong>
                    <span>Talvez</span>
                  </article>
                  <article>
                    <strong>{prismaSnapshot.finalIncluded}</strong>
                    <span>Incluídos finais</span>
                  </article>
                </div>
                {exclusionSummary.length ? (
                  <div className="triagem-exclusion-summary">
                    <strong>Motivos mais frequentes de exclusão</strong>
                    <div className="triagem-prisma-stats">
                      {exclusionSummary.slice(0, 5).map((item) => (
                        <span key={item.reason}>
                          {item.reason} · {item.total}
                        </span>
                      ))}
                    </div>
                  </div>
                ) : null}
              </section>
            ) : null}

            {unresolvedConflicts.length ? (
              <section className="triagem-prisma-card triagem-conflicts-card">
                <div>
                  <span className="eyebrow">conflitos</span>
                  <h2>Resolver divergências do conjunto</h2>
                  <p>Consolide uma decisão final da equipe para os estudos em desacordo.</p>
                </div>
                <div className="triagem-conflict-list">
                  {unresolvedConflicts.map((study) => (
                    <article className="triagem-conflict-item" key={`conflict-${study.id}`}>
                      <div>
                        <strong>{study.titulo}</strong>
                        <span>{study.periodico ?? "Periódico não informado"} · {study.ano ?? "s.d."}</span>
                      </div>
                      <div className="triagem-decision-row">
                        <button onClick={() => void resolveConflict(study, "incluir")} type="button">
                          Fechar em incluir
                        </button>
                        <button onClick={() => void resolveConflict(study, "talvez")} type="button">
                          Fechar em talvez
                        </button>
                        <button onClick={() => void resolveConflict(study, "excluir", "Excluído após resolução de conflito.")} type="button">
                          Fechar em excluir
                        </button>
                      </div>
                    </article>
                  ))}
                </div>
              </section>
            ) : null}

            <section className="triagem-results-grid">
              <div className="triagem-column">
                <h2>Resultados captados</h2>
                {captureResults.length === 0 ? <p className="muted">A busca aparecerá aqui.</p> : null}
                {captureResults.map((study) => {
                  const possibleDuplicate = savedDuplicateKeys.has(getStudyDuplicateKey(study));

                  return (
                    <article className="triagem-study-card" data-duplicate={possibleDuplicate} key={study.external_id}>
                      <span>{study.source} · {study.ano ?? "s.d."}</span>
                      <h3>{study.titulo}</h3>
                      <p>{study.periodico ?? "Periódico não informado"}</p>
                      <small>{study.resumo?.slice(0, 360) ?? "Sem resumo disponível."}</small>
                      {possibleDuplicate ? (
                        <em className="triagem-duplicate-flag">Possível duplicado de estudo já salvo.</em>
                      ) : null}
                      <button
                        className="button button-secondary"
                        disabled={savedExternalIds.has(study.external_id)}
                        onClick={() => void saveStudy(study)}
                        type="button"
                      >
                        {savedExternalIds.has(study.external_id) ? "Salvo" : "Salvar no conjunto"}
                      </button>
                    </article>
                  );
                })}
              </div>

              <div className="triagem-column">
                <h2>Triagem do conjunto</h2>
                <div className="triagem-filter-bar">
                  {[
                    ["todos", "Todos"],
                    ["pendente", "Pendentes"],
                    ["talvez", "Talvez"],
                    ["incluir", "Incluir"],
                    ["excluir", "Excluir"],
                    ["conflito", "Conflitos"],
                    ["duplicado", "Duplicados"]
                  ].map(([value, label]) => (
                    <button
                      key={value}
                      className={studyFilter === value ? "active" : ""}
                      onClick={() => setStudyFilter(value as typeof studyFilter)}
                      type="button"
                    >
                      {label}
                    </button>
                  ))}
                </div>
                {studies.length > 0 ? (
                  <div className="triagem-bulk-bar">
                    <button className="button button-secondary" onClick={toggleSelectAllFiltered} type="button">
                      {filteredStudies.length > 0 &&
                      filteredStudies.every((study) => selectedStudyIds.includes(study.id))
                        ? "Limpar seleção do filtro"
                        : "Selecionar filtrados"}
                    </button>
                    <span>{selectedStudyIds.length} estudo(s) selecionado(s)</span>
                    <button className="button button-secondary" onClick={() => void applyDecisionBatch("incluir")} type="button">
                      Incluir em lote
                    </button>
                    <button className="button button-secondary" onClick={() => void applyDecisionBatch("talvez")} type="button">
                      Talvez em lote
                    </button>
                    <button
                      className="button button-secondary"
                      onClick={() => void applyDecisionBatch("excluir", "Fora do escopo")}
                      type="button"
                    >
                      Excluir em lote
                    </button>
                  </div>
                ) : null}
                {studies.length === 0 ? <p className="muted">Salve estudos captados para iniciar as decisões.</p> : null}
                {filteredStudies.map((study) => {
                  const possibleDuplicate = duplicateStudyIds.has(study.id);
                  const reviewMeta = getReviewMeta(reviewsByStudy.get(study.id) ?? []);
                  const ownReview = (reviewsByStudy.get(study.id) ?? []).find((review) => review.reviewer_id === profileId);
                  const hasConflict = conflictStudyIds.has(study.id);
                  const aggregateDecision = getAggregateDecision(study, reviewMeta);

                  return (
                    <article
                      className="triagem-study-card"
                      data-decision={study.decisao}
                      data-conflict={hasConflict}
                      data-duplicate={possibleDuplicate}
                      key={study.id}
                    >
                      <label className="triagem-study-select">
                        <input
                          checked={selectedStudyIds.includes(study.id)}
                          onChange={() => toggleStudySelection(study.id)}
                          type="checkbox"
                        />
                        <span>Selecionar estudo</span>
                      </label>
                      <span>{decisionLabels[aggregateDecision]} · {study.ano ?? "s.d."}</span>
                      <h3>{study.titulo}</h3>
                      <p>{study.periodico ?? "Periódico não informado"}</p>
                      <small>{study.resumo?.slice(0, 420) ?? "Sem resumo disponível."}</small>
                      <div className="triagem-review-meta">
                        <strong>{ownReview ? `Sua avaliação: ${decisionLabels[ownReview.decisao]}` : "Sua avaliação: pendente"}</strong>
                        <span>
                          {study.decisao_final
                            ? `Decisão final da equipe: ${decisionLabels[study.decisao_final]}`
                            : hasConflict
                            ? "Conflito entre revisores"
                            : reviewMeta.consensus
                              ? `Consenso atual: ${decisionLabels[reviewMeta.consensus]}`
                              : `${reviewMeta.reviewersCount} revisor(es)`}
                        </span>
                      </div>
                      {possibleDuplicate ? (
                        <em className="triagem-duplicate-flag">Possível duplicado por DOI ou título semelhante.</em>
                      ) : null}
                      {hasConflict ? (
                        <em className="triagem-conflict-flag">Há decisões divergentes para este estudo.</em>
                      ) : null}
                      {study.decisao_final && study.motivo_resolucao ? (
                        <em>Resolução: {study.motivo_resolucao}</em>
                      ) : null}
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
                        {possibleDuplicate ? (
                          <button onClick={() => void updateDecision(study, "excluir", "Duplicado conceitual")} type="button">
                            Marcar duplicado
                          </button>
                        ) : null}
                      </div>
                      {study.url ? (
                        <a href={study.url} rel="noreferrer" target="_blank">
                          Abrir fonte
                        </a>
                      ) : null}
                    </article>
                  );
                })}
              </div>
            </section>
          </div>
        </div>
      </section>
    </main>
  );
}
