import { NextResponse } from "next/server";

type JsonNode = {
  type?: string;
  text?: string;
  attrs?: {
    level?: unknown;
  };
  content?: JsonNode[];
};

type SectionStatus = "forte" | "revisar" | "ausente";

type SectionReview = {
  section: string;
  status: SectionStatus;
  score: number;
  diagnosis: string;
  why: string[];
  suggestions: string[];
  evidence?: string;
};

const EXPECTED_SECTIONS = [
  "Resumo",
  "Introdução",
  "Metodologia",
  "Resultados",
  "Discussão",
  "Conclusão",
  "Referências"
];

// Simple in-memory cache for manuscript analyses keyed by content signature.
const ANALYSIS_CACHE = new Map<string, { created: number; payload: unknown }>();
const ANALYSIS_TTL_MS = 1000 * 60 * 10; // 10 minutes

const SECTION_ALIASES: Record<string, string[]> = {
  Resumo: ["resumo", "abstract"],
  Introdução: ["introducao", "introdução", "apresentacao", "apresentação", "contextualizacao", "contextualização"],
  Metodologia: ["metodologia", "metodo", "método", "metodos", "métodos", "procedimentos", "materiais e metodos", "materiais e métodos"],
  Resultados: ["resultados", "achados", "analise dos resultados", "análise dos resultados"],
  Discussão: ["discussao", "discussão", "debate", "resultados e discussao", "resultados e discussão"],
  Conclusão: ["conclusao", "conclusão", "consideracoes finais", "considerações finais"],
  Referências: ["referencias", "referências", "bibliografia"]
};

function normalize(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[:\-–—]+$/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function getNodeText(node: JsonNode | undefined): string {
  if (!node) {
    return "";
  }

  const current = typeof node.text === "string" ? node.text : "";
  const nested = (node.content ?? []).map((child) => getNodeText(child)).join(" ");

  return `${current} ${nested}`.replace(/\s+/g, " ").trim();
}

function wordCount(text: string) {
  return text.match(/[\p{L}\p{N}]+/gu)?.length ?? 0;
}

function includesAny(text: string, markers: string[]) {
  const normalized = normalize(text);
  return markers.some((marker) => normalized.includes(normalize(marker)));
}

function excerpt(text: string) {
  return text.replace(/\s+/g, " ").trim().slice(0, 240);
}

function sectionMatches(title: string, expected: string) {
  const normalizedTitle = normalize(title);
  return SECTION_ALIASES[expected].some((alias) => normalizedTitle.includes(normalize(alias)));
}

function detectSectionLabels(text: string) {
  const normalized = normalize(text);

  if (!normalized) {
    return [] as string[];
  }

  return EXPECTED_SECTIONS.filter((section) =>
    SECTION_ALIASES[section].some((alias) => {
      const normalizedAlias = normalize(alias);
      return (
        normalized === normalizedAlias ||
        normalized.startsWith(`${normalizedAlias}:`) ||
        normalized.startsWith(`${normalizedAlias} -`) ||
        normalized.startsWith(`${normalizedAlias} –`) ||
        normalized.startsWith(`${normalizedAlias} `)
      );
    })
  );
}

function splitDetectedSection(text: string) {
  const labels = detectSectionLabels(text);

  if (labels.length === 0) {
    return { labels, remainder: text.trim() };
  }

  let remainder = text.trim();
  const normalized = normalize(text);

  labels.forEach((label) => {
    SECTION_ALIASES[label].forEach((alias) => {
      const aliasPattern = new RegExp(`^${normalize(alias)}\\s*[:\\-–—]?\\s*`, "i");
      if (aliasPattern.test(normalized)) {
        remainder = remainder.replace(new RegExp(`^${alias}\\s*[:\\-–—]?\\s*`, "i"), "").trim();
      }
    });
  });

  return { labels, remainder };
}

function extractSections(content: JsonNode | null) {
  const sections = new Map<string, string>();
  const headings: string[] = [];
  let currentSections = ["Texto sem seção"];

  (content?.content ?? []).forEach((node) => {
    const text = getNodeText(node);
    const detected = splitDetectedSection(text);

    if ((node.type === "heading" || (node.type === "paragraph" && detected.labels.length > 0)) && text) {
      const labels = detected.labels.length > 0 ? detected.labels : [text];
      currentSections = labels;
      labels.forEach((label) => {
        headings.push(label);
        if (!sections.has(label)) {
          sections.set(label, "");
        }
      });

      if (!detected.remainder || normalize(detected.remainder) === normalize(text)) {
        return;
      }
    }

    const contentText =
      detected.labels.length > 0 && detected.remainder && detected.remainder !== text ? detected.remainder : text;

    if (contentText) {
      currentSections.forEach((sectionName) => {
        sections.set(sectionName, `${sections.get(sectionName) ?? ""} ${contentText}`.trim());
      });
    }
  });

  return {
    headings,
    sections
  };
}

function getExpectedSectionText(sections: Map<string, string>, expected: string) {
  const found = Array.from(sections.entries()).find(([title]) => sectionMatches(title, expected));
  return {
    title: found?.[0] ?? expected,
    text: found?.[1] ?? ""
  };
}

function reviewExpectedSection(expected: string, sections: Map<string, string>): SectionReview {
  const { title, text } = getExpectedSectionText(sections, expected);
  const words = wordCount(text);
  const why: string[] = [];
  const suggestions: string[] = [];

  if (!text) {
    return {
      section: expected,
      status: "ausente",
      score: 0,
      diagnosis: `Não encontrei uma seção reconhecível de ${expected}.`,
      why: ["A análise depende de títulos ou marcadores claros para separar as funções científicas do manuscrito."],
      suggestions: [`Use um título como “${expected}”, mesmo em parágrafo simples, ou transforme o bloco em H2 para facilitar o reconhecimento.`]
    };
  }

  if (words < 45 && expected !== "Referências") {
    why.push(`A seção tem apenas ${words} palavra(s), então ainda parece rascunho.`);
    suggestions.push("Desenvolva a seção com pelo menos um parágrafo analítico antes de tratá-la como finalizada.");
  }

  if (expected === "Resumo") {
    const checks = [
      ["objetivo", includesAny(text, ["objetivo", "analisar", "investigar", "descrever", "compreender"])],
      ["método", includesAny(text, ["método", "metodologia", "dados", "participantes", "corpus", "questionário"])],
      ["resultado", includesAny(text, ["resultado", "achado", "evidência", "identificou", "mostrou"])],
      ["conclusão", includesAny(text, ["conclusão", "conclui", "contribui", "implicação"])]
    ] as const;
    const missing = checks.filter(([, ok]) => !ok).map(([label]) => label);
    if (missing.length > 0) {
      why.push(`Faltam sinais de ${missing.join(", ")}.`);
      suggestions.push("Reescreva o resumo em quatro movimentos: objetivo, método, principal achado e contribuição.");
    }
  }

  if (expected === "Introdução") {
    if (!includesAny(text, ["lacuna", "escasso", "escassa", "faltam", "poucos estudos", "ainda não", "ainda nao"])) {
      why.push("A lacuna da literatura não está explícita.");
      suggestions.push("Inclua uma frase mostrando o que os estudos existentes ainda não explicam.");
    }
    if (!includesAny(text, ["objetivo", "este estudo", "este artigo", "analisar", "investigar", "compreender"])) {
      why.push("O objetivo do estudo não aparece de forma direta.");
      suggestions.push("Feche a introdução com uma frase do tipo: “Este estudo tem como objetivo...”.");
    }
  }

  if (expected === "Metodologia") {
    if (!includesAny(text, ["participantes", "amostra", "corpus", "documentos", "dados", "questionário", "coleta"])) {
      why.push("A fonte de dados, corpus ou participantes ainda não está clara.");
      suggestions.push("Explique quem/que dados foram analisados e como foram obtidos.");
    }
    if (!includesAny(text, ["análise", "analise", "estatística", "estatistica", "temática", "tematica", "procedimento", "categoria"])) {
      why.push("A estratégia de análise ainda parece vaga.");
      suggestions.push("Descreva como os dados foram tratados, categorizados, comparados ou interpretados.");
    }
  }

  if (expected === "Resultados") {
    if (!includesAny(text, ["tabela", "figura", "%", "n=", "categoria", "eixo", "achado", "resultado", "observou", "identificou"])) {
      why.push("Ainda não há sinais claros de achados organizados.");
      suggestions.push("Apresente os achados por eixo, categoria, tabela, figura ou indicador.");
    }
  }

  if (expected === "Discussão") {
    if (!includesAny(text, ["literatura", "estudos", "autores", "evidências", "evidencias", "compar", "dialoga"])) {
      why.push("A seção ainda não dialoga claramente com a literatura.");
      suggestions.push("Compare seus achados com estudos anteriores e explicite convergências ou tensões.");
    }
    if (!includesAny(text, ["limite", "limitação", "limitacao", "implicação", "implicacao", "recomenda"])) {
      why.push("Limitações, implicações ou próximos passos ainda não aparecem.");
      suggestions.push("Inclua limites do estudo e implicações para pesquisa, prática ou política.");
    }
  }

  if (expected === "Conclusão") {
    if (!includesAny(text, ["conclui", "conclusão", "síntese", "sintese", "contribui", "implica"])) {
      why.push("A conclusão ainda não explicita síntese ou contribuição.");
      suggestions.push("Retome o objetivo e declare a contribuição principal sem repetir toda a discussão.");
    }
  }

  if (expected === "Referências") {
    const referenceLines = text
      .split(/(?<=[.!?])\s+|\n+/)
      .map((line) => line.trim())
      .filter((line) => line.length > 30);
    if (referenceLines.length < 6) {
      why.push(`Foram detectadas apenas ${referenceLines.length} referência(s) prováveis.`);
      suggestions.push("Use a aba Referências para ampliar a base bibliográfica antes de fechar introdução e discussão.");
    }
  }

  if (why.length === 0) {
    return {
      section: title,
      status: "forte",
      score: 100,
      diagnosis: "A seção cumpre os sinais mínimos esperados nesta leitura automática.",
      why: ["Foram encontrados elementos compatíveis com a função científica da seção."],
      suggestions: ["Revise agora qualidade argumentativa, precisão dos termos e aderência à revista escolhida."],
      evidence: excerpt(text)
    };
  }

  const score = Math.max(30, 100 - why.length * 25 - (words < 45 ? 20 : 0));

  return {
    section: title,
    status: "revisar",
    score,
    diagnosis: "A seção existe, mas ainda tem lacunas funcionais para cumprir melhor seu papel científico.",
    why,
    suggestions,
    evidence: excerpt(text)
  };
}

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as {
    content?: JsonNode;
  } | null;

  if (!body?.content || body.content.type !== "doc") {
    return NextResponse.json(
      {
        message: "Envie um documento TipTap válido para análise."
      },
      { status: 400 }
    );
  }

  try {
    const signature = JSON.stringify(body.content).slice(0, 20000);
    const cached = ANALYSIS_CACHE.get(signature);
    if (cached && Date.now() - cached.created < ANALYSIS_TTL_MS) {
      return NextResponse.json(cached.payload as any);
    }

    // proceed to compute and store
    const { headings, sections } = extractSections(body.content);
    const sectionReviews = EXPECTED_SECTIONS.map((section) => reviewExpectedSection(section, sections));
    const revisionCount = sectionReviews.filter((review) => review.status !== "forte").length;
    const overallScore = Math.round(
      sectionReviews.reduce((sum, review) => sum + review.score, 0) / sectionReviews.length
    );
    const priorities = sectionReviews
      .filter((review) => review.status !== "forte")
      .sort((left, right) => left.score - right.score)
      .slice(0, 4)
      .map((review) => ({
        section: review.section,
        action: review.suggestions[0] ?? "Revisar a função científica da seção."
      }));

    const payload = {
      mode: "heuristic",
      overallScore,
      summary:
        revisionCount === 0
          ? "O manuscrito contém sinais estruturais mínimos nas seções principais. Ainda assim, revise argumento, evidências e aderência à revista."
          : `Encontrei ${revisionCount} seção(ões) que precisam de revisão estrutural antes de tratar o manuscrito como pronto.`,
      headings,
      sectionReviews,
      priorities,
      nextActions:
        priorities.length > 0
          ? priorities.map((priority) => `${priority.section}: ${priority.action}`)
          : ["Escolha a revista-alvo e faça uma revisão fina de estilo, referências e diretrizes aos autores."]
    };

    ANALYSIS_CACHE.set(signature, { created: Date.now(), payload });
    return NextResponse.json(payload);
  } catch (err) {
    return NextResponse.json({ message: err instanceof Error ? err.message : "Erro na análise." }, { status: 500 });
  }
}
