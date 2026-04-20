import type { ArticleContent, Database } from "@/lib/types";
import { countArticleWords } from "@/lib/weblab";

type SavedShortlist = Database["public"]["Tables"]["periodicos_shortlists"]["Row"];

type SubmissionAlignment = {
  score: number;
  summary: string;
  strengths: string[];
  gaps: string[];
  actions: string[];
};

const EXPECTED_SECTIONS = [
  { label: "Resumo", aliases: ["resumo", "abstract"] },
  { label: "Introducao", aliases: ["introducao", "introdução", "apresentacao", "apresentação"] },
  { label: "Metodologia", aliases: ["metodologia", "metodo", "método", "metodos", "métodos"] },
  { label: "Resultados", aliases: ["resultados", "achados"] },
  { label: "Discussao", aliases: ["discussao", "discussão", "resultados e discussão", "resultados e discussao"] },
  { label: "Conclusao", aliases: ["conclusao", "conclusão"] },
  { label: "Referencias", aliases: ["referencias", "referências", "bibliografia"] },
];

function normalize(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function getNodeText(node: Record<string, unknown>): string {
  const text = typeof node.text === "string" ? node.text : "";
  const content = Array.isArray(node.content) ? node.content : [];
  const nested = content
    .filter((child): child is Record<string, unknown> => Boolean(child) && typeof child === "object")
    .map(getNodeText)
    .join(" ");

  return `${text} ${nested}`.replace(/\s+/g, " ").trim();
}

function detectHeadings(content: ArticleContent | null) {
  return (content?.content ?? [])
    .filter((node) => (node as Record<string, unknown>).type === "heading" || (node as Record<string, unknown>).type === "paragraph")
    .map((node) => getNodeText(node as Record<string, unknown>))
    .filter(Boolean);
}

function detectMissingSections(content: ArticleContent | null) {
  const headings = detectHeadings(content).map((heading) => normalize(heading));

  return EXPECTED_SECTIONS.filter(({ aliases }) => {
    return !aliases.some((alias) => {
      const normalizedAlias = normalize(alias);
      return headings.some(
        (heading) =>
          heading === normalizedAlias ||
          heading.startsWith(`${normalizedAlias}:`) ||
          heading.startsWith(`${normalizedAlias} `)
      );
    });
  }).map((section) => section.label);
}

function countReferenceSignals(content: ArticleContent | null) {
  const fullText = JSON.stringify(content ?? {}).toLowerCase();
  return (fullText.match(/\b(?:19|20)\d{2}\b/g) ?? []).length;
}

export function getSubmissionAlignment(
  articleTitle: string,
  content: ArticleContent | null,
  targetJournal: SavedShortlist | null
): SubmissionAlignment | null {
  if (!targetJournal) {
    return null;
  }

  const strengths: string[] = [];
  const gaps: string[] = [];
  const actions: string[] = [];
  let score = 20;

  const wordCount = countArticleWords(content);
  const missingSections = detectMissingSections(content);
  const referenceSignals = countReferenceSignals(content);
  const normalizedTitle = normalize(articleTitle);

  if (wordCount >= 1800) {
    score += 15;
    strengths.push(`o manuscrito ja tem corpo suficiente para dialogar com a revista-alvo (${wordCount} palavras)`);
  } else {
    gaps.push(`o texto ainda parece curto para submissao seria (${wordCount} palavras)`);
    actions.push("expandir o manuscrito antes de tratar a revista-alvo como decisao final");
  }

  if (missingSections.length === 0) {
    score += 20;
    strengths.push("as secoes cientificas principais ja aparecem no manuscrito");
  } else {
    gaps.push(`faltam secoes reconheciveis: ${missingSections.join(", ")}`);
    actions.push(`fechar primeiro as secoes ${missingSections.slice(0, 3).join(", ")}`);
  }

  if (referenceSignals >= 6) {
    score += 12;
    strengths.push("ha sinais de base bibliografica minima para sustentar o envio");
  } else {
    gaps.push("a sustentacao bibliografica ainda parece curta para a fase de submissao");
    actions.push("reforcar referencias em introducao, discussao e trechos com afirmacoes fortes");
  }

  if (targetJournal.chosen_for_submission) {
    score += 10;
    strengths.push("a equipe ja assumiu esta revista como alvo principal");
  } else {
    actions.push("definir a revista-alvo explicitamente na shortlist para organizar a decisao final");
  }

  if (targetJournal.escopo_conferido) {
    score += 10;
    strengths.push("o escopo da revista ja foi conferido");
  } else {
    gaps.push("o escopo da revista ainda nao foi validado no fluxo editorial");
    actions.push("conferir se o recorte do manuscrito cabe claramente no escopo da revista");
  }

  if (targetJournal.indexadores_confirmados) {
    score += 8;
    strengths.push("os indexadores priorizados ja foram confirmados");
  } else {
    gaps.push("os indexadores da revista ainda pedem validacao final");
    actions.push("validar indexadores e cobertura institucional antes da decisao final");
  }

  if (targetJournal.diretrizes_conferidas) {
    score += 8;
    strengths.push("as diretrizes aos autores ja entraram no radar da equipe");
  } else {
    gaps.push("as diretrizes aos autores ainda nao foram trazidas para o fluxo");
    actions.push("abrir as diretrizes e ajustar titulo, resumo e formato do manuscrito");
  }

  if (targetJournal.template_conferido) {
    score += 6;
    strengths.push("o template ou as normas da revista ja foram checados");
  } else {
    actions.push("baixar template ou normas da revista antes da ultima rodada de acabamento");
  }

  if (targetJournal.taxas_conferidas) {
    score += 4;
    strengths.push("taxas e APC ja foram verificados");
  } else {
    actions.push("confirmar taxas, APC e politicas de acesso antes de submeter");
  }

  if (normalize(targetJournal.journal_title).includes("education") || normalize(targetJournal.journal_title).includes("educ")) {
    if (normalizedTitle.includes("ensino") || normalizedTitle.includes("educ") || normalizedTitle.includes("formacao")) {
      score += 7;
      strengths.push("o proprio titulo do manuscrito conversa com o foco educacional da revista");
    } else {
      actions.push("explicitar melhor o recorte educacional no titulo, resumo e palavras-chave, se essa for a revista-alvo");
    }
  }

  score = Math.max(18, Math.min(96, score));

  const summary =
    score >= 80
      ? "O manuscrito ja esta perto de um encaixe editorial convincente para esta revista."
      : score >= 60
        ? "A revista-alvo faz sentido, mas ainda ha ajustes importantes antes de tratar a submissao como pronta."
        : "A revista-alvo ainda funciona mais como hipotese orientadora do que como decisao fechada.";

  return {
    score,
    summary,
    strengths: strengths.slice(0, 4),
    gaps: gaps.slice(0, 4),
    actions: Array.from(new Set(actions)).slice(0, 5),
  };
}
