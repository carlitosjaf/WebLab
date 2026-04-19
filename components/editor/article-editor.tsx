"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { Route } from "next";
import { EditorContent, JSONContent, useEditor } from "@tiptap/react";
import Placeholder from "@tiptap/extension-placeholder";
import StarterKit from "@tiptap/starter-kit";
import { Redo2, Undo2 } from "lucide-react";

import { Toolbar } from "@/components/ui/toolbar";
import { exportArticleToDocx } from "@/lib/docx-export";
import { getSupabaseClient } from "@/lib/supabaseClient";
import type {
  ArticleCommentRow,
  ArticleContent,
  ArticleRow,
  ArticleStatus,
  ArticleVersionRow,
  UserRole
} from "@/lib/types";
import { countArticleWords, formatAbntCitation, formatRelativeUpdate } from "@/lib/weblab";

type SaveState = "idle" | "saving" | "saved" | "error";

type ArticleEditorProps = {
  article: ArticleRow;
  canEdit?: boolean;
  readOnlyReason?: string | null;
};

type EditorTemplate = {
  id: string;
  name: string;
  description: string;
  tips: string[];
  content: JSONContent[];
};

type SectionGroup = {
  id: string;
  label: string;
  sections: Array<{
    label: string;
    content: JSONContent[];
  }>;
};

type CognitiveTab = "referencias" | "estrutura" | "texto" | "revisao";

type ManuscriptHeading = {
  id: string;
  title: string;
  level: number;
};

type CitationGap = {
  id: string;
  text: string;
  section: string;
  context: string;
  signal: string;
};

type UsedReference = {
  id: string;
  text: string;
};

type SectionDiagnostic = {
  id: string;
  section: string;
  severity: "ok" | "warning";
  message: string;
  action: string;
};

type TextDiagnostic = {
  id: string;
  severity: "info" | "warning";
  title: string;
  message: string;
  action: string;
};

type ConceptSignal = {
  id: string;
  term: string;
  count: number;
  sections: string[];
};

type ManuscriptAnalysis = {
  headings: ManuscriptHeading[];
  missingSections: string[];
  citationGaps: CitationGap[];
  usedReferences: UsedReference[];
  sectionContexts: Record<string, string>;
  sectionDiagnostics: SectionDiagnostic[];
  textDiagnostics: TextDiagnostic[];
  conceptSignals: ConceptSignal[];
};

type DeepSectionReview = {
  section: string;
  status: "forte" | "revisar" | "ausente";
  score: number;
  diagnosis: string;
  why: string[];
  suggestions: string[];
  evidence?: string;
};

type DeepManuscriptAnalysis = {
  mode: "heuristic";
  overallScore: number;
  summary: string;
  headings: string[];
  sectionReviews: DeepSectionReview[];
  priorities: Array<{
    section: string;
    action: string;
  }>;
  nextActions: string[];
};

type ReferenceSuggestion = {
  id: string;
  title?: string;
  publication_year?: number;
  doi?: string;
  matched_terms?: string[];
  match_reason?: string;
  section_signal?: string;
  evidence_hint?: string;
  biblio?: {
    volume?: string;
    issue?: string;
    first_page?: string;
    last_page?: string;
  };
  primary_location?: {
    landing_page_url?: string;
    source?: {
      display_name?: string;
    };
  };
  authorships?: Array<{
    author?: {
      display_name?: string;
    };
  }>;
};

type ReferenceTriageStatus = "usada" | "revisar" | "descartada";

type CollaborationComment = ArticleCommentRow & {
  authorName: string;
  resolverName: string | null;
};

type VersionSnapshot = ArticleVersionRow & {
  authorName: string;
};

const EMPTY_DOC: ArticleContent = {
  type: "doc",
  content: []
};

const statusLabels: Record<ArticleStatus, string> = {
  aprovado: "Aprovado",
  em_rascunho: "Em rascunho",
  submetido: "Submetido"
};

const scientificSections: Array<{
  label: string;
  content: JSONContent[];
}> = [
  {
    label: "Resumo",
    content: [
      { type: "heading", attrs: { level: 2 }, content: [{ type: "text", text: "Resumo" }] },
      {
        type: "paragraph",
        content: [
          {
            type: "text",
            text: "Apresente objetivo, método principal, resultados centrais e conclusão em um único bloco-síntese."
          }
        ]
      }
    ]
  },
  {
    label: "Introdução",
    content: [
      { type: "heading", attrs: { level: 2 }, content: [{ type: "text", text: "Introdução" }] },
      {
        type: "paragraph",
        content: [
          {
            type: "text",
            text: "Contextualize o problema, a lacuna de conhecimento e a pergunta de pesquisa."
          }
        ]
      }
    ]
  },
  {
    label: "Metodologia",
    content: [
      { type: "heading", attrs: { level: 2 }, content: [{ type: "text", text: "Metodologia" }] },
      {
        type: "paragraph",
        content: [
          {
            type: "text",
            text: "Descreva desenho do estudo, participantes, fontes de dados, critérios e procedimentos analíticos."
          }
        ]
      }
    ]
  },
  {
    label: "Resultados",
    content: [
      { type: "heading", attrs: { level: 2 }, content: [{ type: "text", text: "Resultados" }] },
      {
        type: "paragraph",
        content: [
          {
            type: "text",
            text: "Organize os achados com objetividade, destacando evidências, tabelas e comparações relevantes."
          }
        ]
      }
    ]
  },
  {
    label: "Discussão",
    content: [
      { type: "heading", attrs: { level: 2 }, content: [{ type: "text", text: "Discussão" }] },
      {
        type: "paragraph",
        content: [
          {
            type: "text",
            text: "Interprete os resultados, compare com a literatura e destaque implicações, limites e próximos passos."
          }
        ]
      }
    ]
  },
  {
    label: "Referências",
    content: [
      { type: "heading", attrs: { level: 2 }, content: [{ type: "text", text: "Referências" }] },
      {
        type: "bulletList",
        content: [
          {
            type: "listItem",
            content: [{ type: "paragraph", content: [{ type: "text", text: "Autor, A. Título. Periódico, ano." }] }]
          }
        ]
      }
    ]
  }
];

const expectedScientificSections = [
  "Resumo",
  "Introdução",
  "Metodologia",
  "Resultados",
  "Discussão",
  "Referências"
];

const scientificSectionAliases: Record<string, string[]> = {
  Resumo: ["resumo", "abstract"],
  Introdução: ["introducao", "introdução", "apresentacao", "apresentação", "contextualizacao", "contextualização"],
  Metodologia: ["metodologia", "metodo", "método", "metodos", "métodos", "materiais e metodos", "materiais e métodos"],
  Resultados: ["resultados", "achados", "analise dos resultados", "análise dos resultados"],
  Discussão: ["discussao", "discussão", "resultados e discussao", "resultados e discussão"],
  Referências: ["referencias", "referências", "bibliografia"]
};

const claimMarkers = [
  "evidencia",
  "evidências",
  "estudos",
  "pesquisas",
  "literatura",
  "dados",
  "resultados",
  "indicam",
  "mostram",
  "sugerem",
  "demonstram",
  "revelam",
  "apontam",
  "associado",
  "associada",
  "impacto",
  "prevalência",
  "desigualdade",
  "fatores",
  "risco"
];

const citationPattern = /\([A-ZÀ-Ý][A-ZÀ-Ý\s;,&.-]+,\s*(?:19|20)\d{2}[a-z]?\)|\b(?:19|20)\d{2}\b.*\b[A-ZÀ-Ý][A-ZÀ-Ý]{2,}\b|\bdoi\b/i;

const narrativeCitationPattern = /\b[A-ZÀ-Ý][a-zà-ÿ]+(?:\s(?:et al\.|e\scolaboradores|e\scols\.))?\s*\(?\s*(?:19|20)\d{2}[a-z]?\s*\)?/i;
const quantitativeClaimPattern = /\b\d+(?:[.,]\d+)?\s*(?:%|por cento|vezes|anos|meses|dias|casos|participantes|mulheres|homens)\b/i;
const evidenceVerbPattern = /\b(?:indica|indicam|mostra|mostram|revela|revelam|demonstra|demonstram|aponta|apontam|sugere|sugerem|associa|associam|corresponde|impacta|aumenta|reduz)\b/i;
const contrastPattern = /\b(?:em comparacao|em comparação|diferentemente|por outro lado|em contraste|ao contrario|ao contrário)\b/i;
const weakClaimOpeners = ["neste estudo", "este artigo", "a seguir", "por fim", "neste trabalho", "a tabela", "a figura"];

function normalizeSectionName(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[:\-–—]+$/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function detectSectionLabels(text: string) {
  const normalized = normalizeSectionName(text);

  if (!normalized) {
    return [] as string[];
  }

  return expectedScientificSections.filter((section) =>
    scientificSectionAliases[section]?.some((alias) => {
      const normalizedAlias = normalizeSectionName(alias);
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
  const normalized = normalizeSectionName(text);
  const labels = detectSectionLabels(text);

  if (labels.length === 0) {
    return { labels, remainder: text.trim() };
  }

  let remainder = text.trim();

  labels.forEach((label) => {
    scientificSectionAliases[label]?.forEach((alias) => {
      const aliasPattern = new RegExp(`^${normalizeSectionName(alias)}\\s*[:\\-–—]?\\s*`, "i");
      if (aliasPattern.test(normalized)) {
        remainder = remainder.replace(new RegExp(`^${alias}\\s*[:\\-–—]?\\s*`, "i"), "").trim();
      }
    });
  });

  return { labels, remainder };
}

function includesAny(text: string, markers: string[]) {
  return markers.some((marker) => text.includes(marker));
}

const connectiveMarkers = [
  "além disso",
  "alem disso",
  "assim",
  "contudo",
  "desse modo",
  "dessa forma",
  "entretanto",
  "no entanto",
  "por outro lado",
  "portanto",
  "todavia"
];

const vagueArgumentMarkers = [
  "alguns autores",
  "diversos fatores",
  "é importante",
  "e importante",
  "muito relevante",
  "questão complexa",
  "questão complexa",
  "vários estudos",
  "varios estudos"
];

const conceptStopwords = new Set([
  "ainda",
  "alem",
  "além",
  "analise",
  "análise",
  "artigo",
  "assim",
  "atraves",
  "através",
  "brasil",
  "brasileira",
  "brasileiro",
  "dados",
  "dessa",
  "desse",
  "deste",
  "durante",
  "entre",
  "estudo",
  "forma",
  "foram",
  "maior",
  "menor",
  "mesmo",
  "muito",
  "neste",
  "parte",
  "pesquisa",
  "pode",
  "podem",
  "porque",
  "processo",
  "quando",
  "sobre",
  "tambem",
  "também",
  "texto"
]);

function getNodeText(node: Record<string, unknown>): string {
  const text = typeof node.text === "string" ? node.text : "";
  const content = Array.isArray(node.content) ? node.content : [];
  const nested = content
    .filter((child): child is Record<string, unknown> => Boolean(child) && typeof child === "object")
    .map(getNodeText)
    .join(" ");

  return `${text} ${nested}`.replace(/\s+/g, " ").trim();
}

function extractDocumentText(content: ArticleContent | null) {
  return (content?.content ?? [])
    .map((node) => getNodeText(node))
    .join(" ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 5000);
}

function buildSectionContext(text: string) {
  return text.replace(/\s+/g, " ").trim().slice(0, 1200);
}

function hasCitationSignal(sentence: string) {
  return citationPattern.test(sentence) || narrativeCitationPattern.test(sentence);
}

function detectClaimSignal(sentence: string, section: string) {
  const normalizedSentence = sentence.trim().toLowerCase();
  const normalizedSection = normalizeSectionName(section);

  if (
    normalizedSentence.length < 80 ||
    weakClaimOpeners.some((marker) => normalizedSentence.startsWith(marker)) ||
    normalizedSection === "referencias"
  ) {
    return null;
  }

  if (includesAny(normalizedSentence, claimMarkers)) {
    return "O trecho usa linguagem de achado, evidência ou associação e tende a pedir fonte.";
  }

  if (quantitativeClaimPattern.test(normalizedSentence) && evidenceVerbPattern.test(normalizedSentence)) {
    return "O trecho combina dado quantitativo com afirmação analítica e pede sustentação bibliográfica.";
  }

  if (contrastPattern.test(normalizedSentence) && normalizedSentence.length > 110) {
    return "O trecho compara cenários ou resultados e pode precisar de referência para sustentar a comparação.";
  }

  if (normalizedSection.includes("introdu") && evidenceVerbPattern.test(normalizedSentence)) {
    return "Na introdução, afirmações sobre estado da arte e lacuna costumam precisar de referência.";
  }

  return null;
}

function getReferenceItems(content: ArticleContent | null): UsedReference[] {
  const nodes = content?.content ?? [];
  const referencesIndex = nodes.findIndex((node) => {
    const text = getNodeText(node);
    return detectSectionLabels(text).includes("Referências");
  });

  if (referencesIndex === -1) {
    return [];
  }

  const referenceNodes = nodes.slice(referencesIndex + 1);
  const items: UsedReference[] = [];

  for (const node of referenceNodes) {
    if (node.type === "heading") {
      break;
    }

    if (node.type === "bulletList" && Array.isArray(node.content)) {
      node.content.forEach((item, index) => {
        if (item && typeof item === "object") {
          const text = getNodeText(item as Record<string, unknown>);
          if (text) {
            items.push({ id: `ref-${referencesIndex}-${index}`, text });
          }
        }
      });
      continue;
    }

    const text = getNodeText(node);
    if (text.length > 24) {
      items.push({ id: `ref-${referencesIndex}-${items.length}`, text });
    }
  }

  return items;
}

function getConceptTerms(text: string) {
  return (
    text
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .match(/[a-zA-ZÀ-ÿ]{5,}/g)
      ?.filter((word) => !conceptStopwords.has(word))
      .slice(0, 400) ?? []
  );
}

function detectConceptSignals(sectionTexts: Map<string, string>): ConceptSignal[] {
  const terms = new Map<string, { count: number; sections: Set<string> }>();

  sectionTexts.forEach((text, section) => {
    getConceptTerms(text).forEach((term) => {
      const current = terms.get(term) ?? { count: 0, sections: new Set<string>() };
      current.count += 1;
      current.sections.add(section);
      terms.set(term, current);
    });
  });

  return Array.from(terms.entries())
    .filter(([, data]) => data.count >= 3)
    .sort((a, b) => b[1].count - a[1].count)
    .slice(0, 8)
    .map(([term, data]) => ({
      id: `concept-${term}`,
      term,
      count: data.count,
      sections: Array.from(data.sections).slice(0, 4)
    }));
}

function diagnoseTextFlow(
  paragraphs: Array<{ id: string; section: string; text: string }>,
  sectionTexts: Map<string, string>,
  conceptSignals: ConceptSignal[]
): TextDiagnostic[] {
  const diagnostics: TextDiagnostic[] = [];
  const pushDiagnostic = (title: string, message: string, action: string, severity: TextDiagnostic["severity"] = "warning") => {
    diagnostics.push({
      id: `text-${diagnostics.length}`,
      severity,
      title,
      message,
      action
    });
  };

  const longParagraph = paragraphs.find((paragraph) => paragraph.text.split(/\s+/).length > 150);
  if (longParagraph) {
    pushDiagnostic(
      "Parágrafo muito denso",
      `Há um parágrafo longo em ${longParagraph.section}. Ele pode estar misturando contexto, argumento e evidência.`,
      "Divida em dois blocos: um para a ideia central e outro para evidência, dado ou consequência."
    );
  }

  const longSentence = paragraphs
    .flatMap((paragraph) =>
      paragraph.text
        .split(/(?<=[.!?])\s+/)
        .map((sentence) => ({ sentence, section: paragraph.section }))
    )
    .find((item) => item.sentence.split(/\s+/).length > 45);
  if (longSentence) {
    pushDiagnostic(
      "Frase longa",
      `Uma frase em ${longSentence.section} passa de 45 palavras e pode perder força argumentativa.`,
      "Separe causa, evidência e conclusão em frases diferentes."
    );
  }

  const fullText = Array.from(sectionTexts.values()).join(" ").toLowerCase();
  const connectiveCount = connectiveMarkers.filter((marker) => fullText.includes(marker)).length;
  if (paragraphs.length >= 5 && connectiveCount < 2) {
    pushDiagnostic(
      "Conexão entre ideias",
      "O texto tem vários parágrafos, mas poucos conectores argumentativos detectáveis.",
      "Use transições como “além disso”, “no entanto”, “portanto” ou “dessa forma” quando mudar de ideia ou evidência."
    );
  }

  const vagueMarker = vagueArgumentMarkers.find((marker) => fullText.includes(marker));
  if (vagueMarker) {
    pushDiagnostic(
      "Formulação genérica",
      `A expressão “${vagueMarker}” pode ficar vaga se não vier acompanhada de evidência.`,
      "Troque por uma afirmação mais específica ou acrescente dado, autor, período, população ou contexto."
    );
  }

  const repeatedConcept = conceptSignals.find((concept) => concept.count >= 8);
  if (repeatedConcept) {
    pushDiagnostic(
      "Conceito muito repetido",
      `“${repeatedConcept.term}” aparece muitas vezes no manuscrito.`,
      "Verifique se a repetição cria ênfase útil ou se pode ser substituída por termos mais precisos em alguns trechos.",
      "info"
    );
  }

  if (diagnostics.length === 0 && paragraphs.length > 0) {
    pushDiagnostic(
      "Fluxo textual estável",
      "Não encontrei sinais fortes de repetição, frase excessivamente longa ou quebra argumentativa nesta leitura.",
      "Use esta aba como revisão final depois de expandir novas seções.",
      "info"
    );
  }

  return diagnostics.slice(0, 6);
}

function diagnoseSections(sectionTexts: Map<string, string>, usedReferences: UsedReference[]): SectionDiagnostic[] {
  const diagnostics: SectionDiagnostic[] = [];

  const pushDiagnostic = (section: string, message: string, action: string, severity: SectionDiagnostic["severity"] = "warning") => {
    diagnostics.push({
      id: `${normalizeSectionName(section)}-${diagnostics.length}`,
      section,
      severity,
      message,
      action
    });
  };

  const getSectionText = (sectionName: string) => {
    const aliases = scientificSectionAliases[sectionName] ?? [sectionName];
    const entry = Array.from(sectionTexts.entries()).find(([section]) => {
      const normalizedSection = normalizeSectionName(section);
      return aliases.some((alias) => normalizedSection.includes(normalizeSectionName(alias)));
    });
    return entry?.[1].toLowerCase() ?? "";
  };

  const recognizedSectionCount = expectedScientificSections.filter((section) => Boolean(getSectionText(section))).length;

  const resumo = getSectionText("Resumo");
  if (resumo) {
    const hasSummaryCore =
      includesAny(resumo, ["objetivo", "analisar", "investigar", "descrever"]) &&
      includesAny(resumo, ["método", "metodo", "metodologia", "dados", "participantes"]) &&
      includesAny(resumo, ["resultado", "achado", "evidência", "evidencia"]) &&
      includesAny(resumo, ["conclusão", "conclusao", "contribui"]);
    if (!hasSummaryCore) {
      pushDiagnostic(
        "Resumo",
        "O resumo ainda não parece cobrir objetivo, método, resultados e contribuição.",
        "Inclua uma frase para cada função do resumo: objetivo, método, achado central e conclusão."
      );
    }
  }

  const introducao = getSectionText("Introdução");
  if (introducao) {
    if (!includesAny(introducao, ["lacuna", "escasso", "escassa", "faltam", "poucos estudos", "ainda não", "ainda nao"])) {
      pushDiagnostic(
        "Introdução",
        "A introdução ainda não deixa explícita a lacuna da literatura.",
        "Adicione um parágrafo curto mostrando o que os estudos existentes ainda não explicam."
      );
    }

    if (!includesAny(introducao, ["objetivo", "este estudo", "este artigo", "analisar", "investigar", "compreender"])) {
      pushDiagnostic(
        "Introdução",
        "Não encontrei uma formulação clara do objetivo na introdução.",
        "Feche a introdução com uma frase direta: “Este estudo tem como objetivo...”."
      );
    }
  }

  const metodologia = getSectionText("Metodologia") || getSectionText("Métodos");
  if (metodologia) {
    if (!includesAny(metodologia, ["participantes", "amostra", "corpus", "documentos", "dados", "questionário", "questionario"])) {
      pushDiagnostic(
        "Metodologia",
        "A metodologia ainda não identifica claramente fonte de dados, corpus ou participantes.",
        "Explique quem/que dados foram analisados e quais critérios de inclusão foram usados."
      );
    }

    if (!includesAny(metodologia, ["análise", "analise", "estatística", "estatistica", "temática", "tematica", "procedimento"])) {
      pushDiagnostic(
        "Metodologia",
        "A estratégia de análise ainda parece pouco explícita.",
        "Inclua como os dados foram tratados, codificados, comparados ou interpretados."
      );
    }
  }

  const resultados = getSectionText("Resultados");
  if (resultados) {
    if (!includesAny(resultados, ["tabela", "figura", "%", "n=", "categoria", "eixo", "achado", "resultado"])) {
      pushDiagnostic(
        "Resultados",
        "A seção de resultados ainda não mostra sinais claros de achados organizados.",
        "Organize os achados por tabela, figura, eixo analítico ou categoria."
      );
    }
  }

  const discussao = getSectionText("Discussão");
  if (discussao) {
    if (!includesAny(discussao, ["literatura", "estudos", "autores", "evidências", "evidencias", "compar"])) {
      pushDiagnostic(
        "Discussão",
        "A discussão ainda não parece dialogar com a literatura.",
        "Conecte os achados a estudos anteriores e explicite convergências ou tensões."
      );
    }

    if (!includesAny(discussao, ["limite", "limitação", "limitacao", "implicação", "implicacao", "recomenda"])) {
      pushDiagnostic(
        "Discussão",
        "Ainda faltam limites, implicações ou próximos passos.",
        "Feche a discussão indicando limites do estudo e implicações para pesquisa, prática ou política."
      );
    }
  }

  if (usedReferences.length > 0 && introducao && usedReferences.length < 4) {
    pushDiagnostic(
      "Referências",
      "O texto já usa referências, mas a base bibliográfica ainda parece curta para sustentar a introdução.",
      "Use a aba Referências para buscar papers relacionados às afirmações centrais."
    );
  }

  if (diagnostics.length === 0 && sectionTexts.size > 0) {
    if (recognizedSectionCount === 0) {
      pushDiagnostic(
        "Estrutura",
        "Ainda não reconheci seções científicas como Resumo, Introdução, Metodologia, Resultados, Discussão ou Referências.",
        "Use títulos ou marcadores claros como “Resumo”, “Introdução” e “Metodologia”. H2/H3 ajudam, mas a leitura também reconhece rótulos em parágrafo simples."
      );
      return diagnostics.slice(0, 8);
    }

    pushDiagnostic(
      "Estrutura",
      "A estrutura básica está coerente nesta leitura automática.",
      "Siga refinando argumento, evidências e aderência ao periódico escolhido.",
      "ok"
    );
  }

  return diagnostics.slice(0, 8);
}

function analyseManuscript(content: ArticleContent | null): ManuscriptAnalysis {
  const nodes = content?.content ?? [];
  const headings: ManuscriptHeading[] = [];
  const citationGaps: CitationGap[] = [];
  const sectionTexts = new Map<string, string>();
  const paragraphs: Array<{ id: string; section: string; text: string }> = [];
  let currentSections = ["Sem seção"];

  nodes.forEach((node, index) => {
    const text = getNodeText(node);
    const detected = splitDetectedSection(text);

    if ((node.type === "heading" || (node.type === "paragraph" && detected.labels.length > 0)) && text) {
      const level =
        node.attrs && typeof node.attrs === "object" && "level" in node.attrs
          ? Number((node.attrs as { level?: unknown }).level ?? 2)
          : 2;
      const sectionLabels = detected.labels.length > 0 ? detected.labels : [text];
      currentSections = sectionLabels;
      sectionLabels.forEach((sectionLabel, sectionIndex) => {
        if (!sectionTexts.has(sectionLabel)) {
          sectionTexts.set(sectionLabel, "");
        }
        if (!headings.some((heading) => heading.title === sectionLabel)) {
          headings.push({
            id: `heading-${index}-${sectionIndex}`,
            title: sectionLabel,
            level
          });
        }
      });

      if (!detected.remainder || normalizeSectionName(detected.remainder) === normalizeSectionName(text)) {
        return;
      }
    }

    const contentText =
      detected.labels.length > 0 && detected.remainder && detected.remainder !== text ? detected.remainder : text;
    const currentSectionLabel = currentSections.join(" / ");

    if (contentText && currentSectionLabel !== "Sem seção") {
      currentSections.forEach((sectionName) => {
        sectionTexts.set(sectionName, `${sectionTexts.get(sectionName) ?? ""} ${contentText}`.trim());
      });
    }

    if ((node.type === "paragraph" || node.type === "blockquote") && contentText.length > 90) {
      paragraphs.push({
        id: `paragraph-${index}`,
        section: currentSectionLabel,
        text: contentText
      });

      const sentences = contentText
        .split(/(?<=[.!?])\s+/)
        .map((sentence) => sentence.trim())
        .filter((sentence) => sentence.length > 90);

      sentences.forEach((sentence, sentenceIndex) => {
        const currentSectionContext = buildSectionContext(
          currentSections.map((sectionName) => sectionTexts.get(sectionName) ?? "").join(" ")
        );
        const claimSignal = detectClaimSignal(sentence, currentSectionLabel);
        const hasCitation = hasCitationSignal(sentence);

        if (claimSignal && !hasCitation && citationGaps.length < 6) {
          citationGaps.push({
            id: `gap-${index}-${sentenceIndex}`,
            text: sentence,
            section: currentSectionLabel,
            context: currentSectionContext,
            signal: claimSignal
          });
        }
      });
    }
  });

  const existingSections = new Set(Array.from(sectionTexts.keys()).map((section) => normalizeSectionName(section)));
  const missingSections = expectedScientificSections.filter(
    (section) => !existingSections.has(normalizeSectionName(section))
  );
  const usedReferences = getReferenceItems(content);
  const conceptSignals = detectConceptSignals(sectionTexts);

  return {
    headings,
    missingSections,
    citationGaps,
    usedReferences,
    sectionContexts: Object.fromEntries(
      Array.from(sectionTexts.entries()).map(([section, text]) => [section, buildSectionContext(text)])
    ),
    sectionDiagnostics: diagnoseSections(sectionTexts, usedReferences),
    textDiagnostics: diagnoseTextFlow(paragraphs, sectionTexts, conceptSignals),
    conceptSignals
  };
}

function buildReferenceList(citation: string) {
  return {
    type: "bulletList",
    content: [
      {
        type: "listItem",
        content: [
          {
            type: "paragraph",
            content: [{ type: "text", text: citation }]
          }
        ]
      }
    ]
  };
}

function appendReferenceToContent(content: ArticleContent | null, citation: string): ArticleContent {
  const clonedContent = content?.content
    ? (JSON.parse(JSON.stringify(content.content)) as Array<Record<string, unknown>>)
    : [];

  const alreadyExists = getReferenceItems({
    type: "doc",
    content: clonedContent
  }).some((reference) => reference.text === citation);

  if (alreadyExists) {
    return {
      type: "doc",
      content: clonedContent
    };
  }

  const referencesIndex = clonedContent.findIndex((node) => {
    return (
      node.type === "heading" &&
      normalizeSectionName(getNodeText(node)) === "referencias"
    );
  });

  if (referencesIndex === -1) {
    return {
      type: "doc",
      content: [
        ...clonedContent,
        {
          type: "heading",
          attrs: { level: 2 },
          content: [{ type: "text", text: "Referências" }]
        },
        buildReferenceList(citation) as Record<string, unknown>
      ]
    };
  }

  const nextNode = clonedContent[referencesIndex + 1];
  if (nextNode?.type === "bulletList" && Array.isArray(nextNode.content)) {
    nextNode.content.push({
      type: "listItem",
      content: [
        {
          type: "paragraph",
          content: [{ type: "text", text: citation }]
        }
      ]
    });
  } else {
    clonedContent.splice(referencesIndex + 1, 0, buildReferenceList(citation) as Record<string, unknown>);
  }

  return {
    type: "doc",
    content: clonedContent
  };
}

function formatInTextCitation(work: ReferenceSuggestion) {
  const firstAuthor = work.authorships?.[0]?.author?.display_name;
  const year = work.publication_year ? String(work.publication_year) : "s.d.";

  if (!firstAuthor) {
    return `AUTORIA NÃO INFORMADA, ${year}`;
  }

  const lastName = firstAuthor.trim().split(/\s+/).at(-1)?.toUpperCase() ?? "AUTORIA";
  return `${lastName}, ${year}`;
}

const sectionGroups: SectionGroup[] = [
  {
    id: "structure",
    label: "Estrutura",
    sections: scientificSections.filter((section) =>
      ["Resumo", "Introdução", "Metodologia", "Resultados", "Discussão", "Referências"].includes(
        section.label
      )
    )
  },
  {
    id: "support",
    label: "Apoio visual",
    sections: [
      {
        label: "Tabela",
        content: [
          { type: "heading", attrs: { level: 2 }, content: [{ type: "text", text: "Tabela X" }] },
          {
            type: "paragraph",
            content: [
              {
                type: "text",
                text: "Descreva aqui o que a tabela apresenta, sua finalidade analítica e a leitura esperada dos dados."
              }
            ]
          }
        ]
      },
      {
        label: "Figura",
        content: [
          { type: "heading", attrs: { level: 2 }, content: [{ type: "text", text: "Figura X" }] },
          {
            type: "paragraph",
            content: [
              {
                type: "text",
                text: "Explique o que a figura ilustra, por que ela é relevante e como dialoga com os resultados apresentados."
              }
            ]
          }
        ]
      },
      {
        label: "Quadro-síntese",
        content: [
          { type: "heading", attrs: { level: 2 }, content: [{ type: "text", text: "Quadro-síntese" }] },
          {
            type: "paragraph",
            content: [
              {
                type: "text",
                text: "Use este bloco para resumir categorias, achados, comparações ou etapas metodológicas de maneira visual."
              }
            ]
          }
        ]
      }
    ]
  }
];

const completeScientificTemplate: JSONContent[] = [
  { type: "heading", attrs: { level: 2 }, content: [{ type: "text", text: "Título do artigo" }] },
  {
    type: "paragraph",
    content: [
      {
        type: "text",
        text: "Escreva um título claro, específico e informativo. Ele deve indicar o tema central, o recorte do estudo e, quando fizer sentido, o contexto, a população ou o período analisado."
      }
    ]
  },
  { type: "heading", attrs: { level: 2 }, content: [{ type: "text", text: "Objetivo" }] },
  {
    type: "paragraph",
    content: [
      {
        type: "text",
        text: "Apresente, em uma frase direta, o que o estudo pretende analisar, compreender, descrever ou comparar. O objetivo deve ser coerente com o problema de pesquisa e suficientemente preciso para orientar todo o artigo."
      }
    ]
  },
  { type: "heading", attrs: { level: 2 }, content: [{ type: "text", text: "Resumo" }] },
  {
    type: "paragraph",
    content: [
      {
        type: "text",
        text: "Sintetize em 150 a 250 palavras o problema investigado, o objetivo do estudo, a abordagem metodológica, os principais resultados e a contribuição do trabalho. O resumo deve funcionar como uma visão rápida e completa do artigo."
      }
    ]
  },
  { type: "heading", attrs: { level: 2 }, content: [{ type: "text", text: "Palavras-chave" }] },
  {
    type: "paragraph",
    content: [
      {
        type: "text",
        text: "Liste de três a cinco termos que representem o tema central, os conceitos principais, o contexto empírico ou a abordagem do estudo."
      }
    ]
  },
  { type: "heading", attrs: { level: 2 }, content: [{ type: "text", text: "Introdução" }] },
  {
    type: "bulletList",
    content: [
      {
        type: "listItem",
        content: [{ type: "paragraph", content: [{ type: "text", text: "Contextualize o tema: apresente o problema, sua relevância social, científica ou institucional e situe o leitor no debate." }] }]
      },
      {
        type: "listItem",
        content: [{ type: "paragraph", content: [{ type: "text", text: "Apresente o que a literatura já discute sobre o tema e quais dimensões do problema são mais importantes para o seu argumento." }] }]
      },
      {
        type: "listItem",
        content: [{ type: "paragraph", content: [{ type: "text", text: "Construa o argumento central da introdução, mostrando por que o tema merece investigação e qual recorte o artigo assume." }] }]
      },
      {
        type: "listItem",
        content: [{ type: "paragraph", content: [{ type: "text", text: "Apresente a lacuna da literatura: o que ainda falta compreender, comparar, aprofundar ou sistematizar sobre esse objeto." }] }]
      },
      {
        type: "listItem",
        content: [{ type: "paragraph", content: [{ type: "text", text: "Explique como o estudo se conecta ao presente, mostrando a atualidade do problema e sua relevância analítica." }] }]
      },
      {
        type: "listItem",
        content: [{ type: "paragraph", content: [{ type: "text", text: "Feche a seção com o objetivo do artigo e, se couber, uma breve indicação da contribuição esperada." }] }]
      }
    ]
  },
  { type: "heading", attrs: { level: 2 }, content: [{ type: "text", text: "Metodologia" }] },
  {
    type: "heading",
    attrs: { level: 3 },
    content: [{ type: "text", text: "2.1 Desenho do estudo" }]
  },
  {
    type: "paragraph",
    content: [
      {
        type: "text",
        text: "Explique o tipo de estudo, a abordagem metodológica adotada e a lógica geral do desenho de pesquisa."
      }
    ]
  },
  {
    type: "heading",
    attrs: { level: 3 },
    content: [{ type: "text", text: "2.2 Participantes" }]
  },
  {
    type: "paragraph",
    content: [
      {
        type: "text",
        text: "Descreva quem participou da pesquisa, quantos participantes foram incluídos, quais critérios de inclusão ou exclusão foram adotados e qual o contexto da amostra."
      }
    ]
  },
  {
    type: "heading",
    attrs: { level: 3 },
    content: [{ type: "text", text: "2.3 Instrumento de coleta" }]
  },
  {
    type: "paragraph",
    content: [
      {
        type: "text",
        text: "Apresente os instrumentos, fontes ou procedimentos usados para produzir os dados: questionários, entrevistas, documentos, bancos secundários, observação, entre outros."
      }
    ]
  },
  {
    type: "heading",
    attrs: { level: 3 },
    content: [{ type: "text", text: "2.4 Procedimentos" }]
  },
  {
    type: "paragraph",
    content: [
      {
        type: "text",
        text: "Explique como a coleta foi realizada, em que período ocorreu e quais cuidados éticos ou operacionais foram tomados."
      }
    ]
  },
  {
    type: "heading",
    attrs: { level: 3 },
    content: [{ type: "text", text: "2.5 Análise quantitativa" }]
  },
  {
    type: "paragraph",
    content: [
      {
        type: "text",
        text: "Descreva como os dados numéricos foram tratados: estatística descritiva, testes, cruzamentos, indicadores ou outras técnicas utilizadas."
      }
    ]
  },
  {
    type: "heading",
    attrs: { level: 3 },
    content: [{ type: "text", text: "2.6 Análise qualitativa" }]
  },
  {
    type: "paragraph",
    content: [
      {
        type: "text",
        text: "Explique como os dados textuais, narrativos ou documentais foram interpretados, incluindo etapas de codificação, categorização ou tematização."
      }
    ]
  },
  {
    type: "heading",
    attrs: { level: 3 },
    content: [{ type: "text", text: "2.7 Integração dos dados" }]
  },
  {
    type: "paragraph",
    content: [
      {
        type: "text",
        text: "Mostre como as diferentes fontes e técnicas dialogam entre si para sustentar a interpretação final do artigo."
      }
    ]
  },
  { type: "heading", attrs: { level: 2 }, content: [{ type: "text", text: "Resultados e Discussão" }] },
  {
    type: "paragraph",
    content: [
      {
        type: "text",
        text: "Apresente os achados em uma sequência lógica, articulando descrição dos resultados e interpretação. Organize a seção por eixos temáticos, categorias analíticas ou perguntas de pesquisa."
      }
    ]
  },
  {
    type: "heading",
    attrs: { level: 3 },
    content: [{ type: "text", text: "4.1 Primeiro eixo analítico" }]
  },
  {
    type: "paragraph",
    content: [
      {
        type: "text",
        text: "Nomeie este eixo de acordo com a sua análise. Aqui você pode apresentar perfil da amostra, contexto inicial ou o primeiro conjunto de achados."
      }
    ]
  },
  {
    type: "heading",
    attrs: { level: 3 },
    content: [{ type: "text", text: "4.2 Segundo eixo analítico" }]
  },
  {
    type: "paragraph",
    content: [
      {
        type: "text",
        text: "Apresente aqui um segundo bloco de resultados, aprofundando relações, contrastes ou tendências observadas no material empírico."
      }
    ]
  },
  {
    type: "heading",
    attrs: { level: 3 },
    content: [{ type: "text", text: "4.3 Terceiro eixo analítico" }]
  },
  {
    type: "paragraph",
    content: [
      {
        type: "text",
        text: "Desenvolva um terceiro eixo, conectando os dados aos autores centrais e explicando o que esses achados revelam sobre o problema estudado."
      }
    ]
  },
  {
    type: "heading",
    attrs: { level: 3 },
    content: [{ type: "text", text: "4.4 Quarto eixo analítico" }]
  },
  {
    type: "paragraph",
    content: [
      {
        type: "text",
        text: "Use esta seção para um quarto eixo, caso sua análise exija mais uma camada temática ou interpretativa."
      }
    ]
  },
  {
    type: "heading",
    attrs: { level: 3 },
    content: [{ type: "text", text: "4.5 Quinto eixo analítico" }]
  },
  {
    type: "paragraph",
    content: [
      {
        type: "text",
        text: "Acrescente um quinto eixo quando o material tiver densidade suficiente para isso. Caso não precise, renomeie ou remova subseções."
      }
    ]
  },
  {
    type: "heading",
    attrs: { level: 3 },
    content: [{ type: "text", text: "4.6 Figuras, tabelas e síntese interpretativa" }]
  },
  {
    type: "paragraph",
    content: [
      {
        type: "text",
        text: "Indique onde entram tabelas, figuras, mapas, nuvens de palavras ou quadros-síntese, sempre acompanhados de interpretação e não apenas descrição."
      }
    ]
  },
  { type: "heading", attrs: { level: 2 }, content: [{ type: "text", text: "Conclusão" }] },
  {
    type: "paragraph",
    content: [
      {
        type: "text",
        text: "Retome o problema e o objetivo, sintetize os principais achados, destaque a contribuição do estudo e indique limites, implicações e possíveis desdobramentos."
      }
    ]
  },
  { type: "heading", attrs: { level: 2 }, content: [{ type: "text", text: "Referências" }] },
  {
    type: "bulletList",
    content: [
      {
        type: "listItem",
        content: [{ type: "paragraph", content: [{ type: "text", text: "Insira aqui as referências efetivamente citadas no texto, seguindo o estilo bibliográfico exigido pelo periódico." }] }]
      }
    ]
  }
];

const systematicReviewTemplate: JSONContent[] = [
  { type: "heading", attrs: { level: 2 }, content: [{ type: "text", text: "Título da revisão sistemática" }] },
  {
    type: "paragraph",
    content: [
      {
        type: "text",
        text: "Deixe claro o tema, o problema central e, quando pertinente, indique no título que se trata de uma revisão sistemática."
      }
    ]
  },
  { type: "heading", attrs: { level: 2 }, content: [{ type: "text", text: "Pergunta da revisão" }] },
  {
    type: "paragraph",
    content: [
      {
        type: "text",
        text: "Formule a pergunta orientadora da revisão. Se fizer sentido, use uma estrutura como PICO, PICo ou outra adaptada ao seu objeto."
      }
    ]
  },
  { type: "heading", attrs: { level: 2 }, content: [{ type: "text", text: "Resumo estruturado" }] },
  {
    type: "paragraph",
    content: [
      {
        type: "text",
        text: "Resuma objetivo, bases consultadas, critérios de elegibilidade, estratégia de busca, resultados principais e conclusão da revisão."
      }
    ]
  },
  { type: "heading", attrs: { level: 2 }, content: [{ type: "text", text: "Introdução" }] },
  {
    type: "paragraph",
    content: [
      {
        type: "text",
        text: "Apresente o contexto do tema, a relevância da revisão e a lacuna que justifica sintetizar as evidências disponíveis."
      }
    ]
  },
  { type: "heading", attrs: { level: 2 }, content: [{ type: "text", text: "Métodos" }] },
  {
    type: "bulletList",
    content: [
      { type: "listItem", content: [{ type: "paragraph", content: [{ type: "text", text: "Critérios de inclusão e exclusão dos estudos" }] }] },
      { type: "listItem", content: [{ type: "paragraph", content: [{ type: "text", text: "Bases de dados e período de busca" }] }] },
      { type: "listItem", content: [{ type: "paragraph", content: [{ type: "text", text: "Descritores, operadores booleanos e estratégia de busca" }] }] },
      { type: "listItem", content: [{ type: "paragraph", content: [{ type: "text", text: "Processo de triagem e seleção dos estudos" }] }] },
      { type: "listItem", content: [{ type: "paragraph", content: [{ type: "text", text: "Extração, síntese e avaliação da qualidade das evidências" }] }] }
    ]
  },
  { type: "heading", attrs: { level: 2 }, content: [{ type: "text", text: "Resultados" }] },
  {
    type: "paragraph",
    content: [
      {
        type: "text",
        text: "Apresente o fluxo dos estudos identificados e organizados, e depois sintetize os achados por tema, população, intervenção ou categoria."
      }
    ]
  },
  { type: "heading", attrs: { level: 2 }, content: [{ type: "text", text: "Discussão" }] },
  {
    type: "paragraph",
    content: [
      {
        type: "text",
        text: "Interprete o conjunto de evidências, discuta convergências e lacunas da literatura e destaque o que a revisão acrescenta ao debate."
      }
    ]
  },
  { type: "heading", attrs: { level: 2 }, content: [{ type: "text", text: "Conclusão" }] },
  {
    type: "paragraph",
    content: [
      {
        type: "text",
        text: "Feche retomando a pergunta da revisão e o que pode ser afirmado a partir das evidências reunidas."
      }
    ]
  }
];

const caseReportTemplate: JSONContent[] = [
  { type: "heading", attrs: { level: 2 }, content: [{ type: "text", text: "Título do relato de caso" }] },
  {
    type: "paragraph",
    content: [
      {
        type: "text",
        text: "Crie um título direto, destacando a condição, o evento clínico ou o aspecto singular do caso."
      }
    ]
  },
  { type: "heading", attrs: { level: 2 }, content: [{ type: "text", text: "Resumo" }] },
  {
    type: "paragraph",
    content: [
      {
        type: "text",
        text: "Sintetize a relevância do caso, os principais achados, a conduta adotada e a contribuição clínica ou científica do relato."
      }
    ]
  },
  { type: "heading", attrs: { level: 2 }, content: [{ type: "text", text: "Introdução" }] },
  {
    type: "paragraph",
    content: [
      {
        type: "text",
        text: "Explique por que o caso merece ser relatado: raridade, desafio diagnóstico, resposta terapêutica, desfecho atípico ou valor educacional."
      }
    ]
  },
  { type: "heading", attrs: { level: 2 }, content: [{ type: "text", text: "Apresentação do caso" }] },
  {
    type: "bulletList",
    content: [
      { type: "listItem", content: [{ type: "paragraph", content: [{ type: "text", text: "Contexto geral e identificação do caso" }] }] },
      { type: "listItem", content: [{ type: "paragraph", content: [{ type: "text", text: "História clínica e cronologia" }] }] },
      { type: "listItem", content: [{ type: "paragraph", content: [{ type: "text", text: "Exames, hipóteses diagnósticas e conduta" }] }] },
      { type: "listItem", content: [{ type: "paragraph", content: [{ type: "text", text: "Desfecho, seguimento e situação atual" }] }] }
    ]
  },
  { type: "heading", attrs: { level: 2 }, content: [{ type: "text", text: "Discussão" }] },
  {
    type: "paragraph",
    content: [
      {
        type: "text",
        text: "Compare o caso com a literatura e destaque o que ele ensina sobre diagnóstico, manejo, limites e aprendizados clínicos."
      }
    ]
  },
  { type: "heading", attrs: { level: 2 }, content: [{ type: "text", text: "Conclusão" }] },
  {
    type: "paragraph",
    content: [
      {
        type: "text",
        text: "Retome a principal mensagem do relato e o motivo pelo qual esse caso merece ser conhecido."
      }
    ]
  }
];

const clinicalTrialTemplate: JSONContent[] = [
  { type: "heading", attrs: { level: 2 }, content: [{ type: "text", text: "Título do ensaio clínico" }] },
  {
    type: "paragraph",
    content: [
      {
        type: "text",
        text: "Apresente a intervenção, a população ou o problema investigado, deixando claro que se trata de um ensaio clínico."
      }
    ]
  },
  { type: "heading", attrs: { level: 2 }, content: [{ type: "text", text: "Objetivo e hipótese" }] },
  {
    type: "paragraph",
    content: [
      {
        type: "text",
        text: "Declare qual efeito, comparação ou resultado o ensaio pretende testar e qual a hipótese principal do estudo."
      }
    ]
  },
  { type: "heading", attrs: { level: 2 }, content: [{ type: "text", text: "Resumo estruturado" }] },
  {
    type: "paragraph",
    content: [
      {
        type: "text",
        text: "Sintetize o contexto, o desenho do estudo, os participantes, a intervenção, os desfechos principais, os resultados e a conclusão."
      }
    ]
  },
  { type: "heading", attrs: { level: 2 }, content: [{ type: "text", text: "Introdução" }] },
  {
    type: "paragraph",
    content: [
      {
        type: "text",
        text: "Apresente o problema clínico, a justificativa da intervenção e a relevância do ensaio para o campo."
      }
    ]
  },
  { type: "heading", attrs: { level: 2 }, content: [{ type: "text", text: "Métodos" }] },
  {
    type: "bulletList",
    content: [
      { type: "listItem", content: [{ type: "paragraph", content: [{ type: "text", text: "Desenho do estudo e contexto" }] }] },
      { type: "listItem", content: [{ type: "paragraph", content: [{ type: "text", text: "Participantes e critérios de elegibilidade" }] }] },
      { type: "listItem", content: [{ type: "paragraph", content: [{ type: "text", text: "Intervenções e comparadores" }] }] },
      { type: "listItem", content: [{ type: "paragraph", content: [{ type: "text", text: "Desfechos primários e secundários" }] }] },
      { type: "listItem", content: [{ type: "paragraph", content: [{ type: "text", text: "Randomização, cegamento e análise estatística" }] }] }
    ]
  },
  { type: "heading", attrs: { level: 2 }, content: [{ type: "text", text: "Resultados" }] },
  {
    type: "paragraph",
    content: [
      {
        type: "text",
        text: "Apresente fluxo de participantes, características iniciais, resultados principais, estimativas de efeito e eventos adversos."
      }
    ]
  },
  { type: "heading", attrs: { level: 2 }, content: [{ type: "text", text: "Discussão" }] },
  {
    type: "paragraph",
    content: [
      {
        type: "text",
        text: "Interprete os resultados do ensaio, compare com a literatura e discuta limites, aplicabilidade e implicações clínicas."
      }
    ]
  },
  { type: "heading", attrs: { level: 2 }, content: [{ type: "text", text: "Conclusão" }] },
  {
    type: "paragraph",
    content: [
      {
        type: "text",
        text: "Feche destacando o que o ensaio permite afirmar sobre a intervenção e quais são os próximos passos recomendados."
      }
    ]
  }
];

const editorTemplates: EditorTemplate[] = [
  {
    id: "general",
    name: "Artigo científico geral",
    description: "Modelo mais flexível para estudos acadêmicos em geral.",
    tips: [
      "Use quando o artigo não se encaixa num gênero metodológico muito fechado.",
      "Na introdução, caminhe do contexto para a lacuna e só depois apresente o objetivo.",
      "Organize resultados e discussão por eixos ou categorias, não por acumulação de dados."
    ],
    content: completeScientificTemplate
  },
  {
    id: "systematic-review",
    name: "Revisão sistemática",
    description: "Estrutura voltada para pergunta de revisão, busca, elegibilidade e síntese das evidências.",
    tips: [
      "Deixe a pergunta da revisão muito clara logo no início.",
      "Descreva bases, descritores e critérios de seleção com transparência.",
      "Reserve um lugar claro para o fluxo PRISMA e para a síntese dos estudos incluídos."
    ],
    content: systematicReviewTemplate
  },
  {
    id: "case-report",
    name: "Relato de caso",
    description: "Modelo centrado em cronologia, singularidade do caso e aprendizado clínico.",
    tips: [
      "Valorize a sequência temporal do caso para facilitar a leitura.",
      "Explique cedo por que esse caso merece ser relatado.",
      "Na discussão, conecte o caso ao que a literatura já sabe e ao que ele acrescenta."
    ],
    content: caseReportTemplate
  },
  {
    id: "clinical-trial",
    name: "Ensaio clínico",
    description: "Modelo com foco em intervenção, comparador, desfechos e leitura transparente dos resultados.",
    tips: [
      "Seja muito claro sobre intervenção, grupo comparador e desfechos.",
      "Explique o desenho metodológico sem deixar lacunas sobre randomização e análise.",
      "Nos resultados, separe bem fluxo de participantes, achados principais e eventos adversos."
    ],
    content: clinicalTrialTemplate
  }
];

export function ArticleEditor({ article, canEdit = true, readOnlyReason = null }: ArticleEditorProps) {
  const router = useRouter();
  const [title, setTitle] = useState(article.titulo);
  const [status, setStatus] = useState<ArticleStatus>(article.status);
  const [selectedTemplateId, setSelectedTemplateId] = useState("general");
  const [selectedGroupId, setSelectedGroupId] = useState(sectionGroups[0]?.id ?? "");
  const [selectedSectionLabel, setSelectedSectionLabel] = useState(
    sectionGroups[0]?.sections[0]?.label ?? ""
  );
  const [abntMode, setAbntMode] = useState(false);
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [saveMessage, setSaveMessage] = useState("Sem alterações pendentes.");
  const [editorVersion, setEditorVersion] = useState(0);
  const [cognitiveTab, setCognitiveTab] = useState<CognitiveTab>("referencias");
  const [activeGapId, setActiveGapId] = useState<string | null>(null);
  const [referenceSuggestions, setReferenceSuggestions] = useState<ReferenceSuggestion[]>([]);
  const [referenceSearchContext, setReferenceSearchContext] = useState<{
    query?: string;
    keywords: string[];
    section?: string;
  } | null>(null);
  const [referenceTriage, setReferenceTriage] = useState<Record<string, ReferenceTriageStatus>>({});
  const [referenceMessage, setReferenceMessage] = useState<string | null>(null);
  const [isFetchingReferences, setIsFetchingReferences] = useState(false);
  const [deepAnalysis, setDeepAnalysis] = useState<DeepManuscriptAnalysis | null>(null);
  const [deepAnalysisMessage, setDeepAnalysisMessage] = useState<string | null>(null);
  const [isAnalyzingManuscript, setIsAnalyzingManuscript] = useState(false);
  const [currentUser, setCurrentUser] = useState<{
    id: string;
    nome: string | null;
    equipeId: string | null;
    role: UserRole;
  } | null>(null);
  const [comments, setComments] = useState<CollaborationComment[]>([]);
  const [versions, setVersions] = useState<VersionSnapshot[]>([]);
  const [selectedExcerpt, setSelectedExcerpt] = useState("");
  const [commentDraft, setCommentDraft] = useState("");
  const [commentMessage, setCommentMessage] = useState<string | null>(null);
  const [versionNote, setVersionNote] = useState("");
  const [versionMessage, setVersionMessage] = useState<string | null>(null);
  const [isLoadingReviewData, setIsLoadingReviewData] = useState(true);
  const [isSavingComment, setIsSavingComment] = useState(false);
  const [isSavingVersion, setIsSavingVersion] = useState(false);
  const [restoringVersionId, setRestoringVersionId] = useState<string | null>(null);
  const [isLeaving, setIsLeaving] = useState(false);
  const [isUpdatingStatus, setIsUpdatingStatus] = useState(false);
  const [isExportingDocx, setIsExportingDocx] = useState(false);
  const lastSavedSnapshot = useRef(
    JSON.stringify({
      titulo: article.titulo,
      conteudo_json: article.conteudo_json ?? EMPTY_DOC,
      status: article.status
    })
  );
  const titleRef = useRef(article.titulo);
  const statusRef = useRef<ArticleStatus>(article.status);
  const debounceTimer = useRef<NodeJS.Timeout | null>(null);
  titleRef.current = title;
  statusRef.current = status;

  const loadReviewData = async () => {
    const supabase = getSupabaseClient();
    setIsLoadingReviewData(true);

    const {
      data: { user },
      error: userError
    } = await supabase.auth.getUser();

    if (userError || !user) {
      setIsLoadingReviewData(false);
      return;
    }

    const [{ data: profile }, { data: rawComments, error: commentsError }, versionsResult] = await Promise.all([
      supabase.from("perfis").select("id, nome_completo, equipe_id, role").eq("id", user.id).maybeSingle(),
      supabase.from("artigo_comentarios").select("*").eq("artigo_id", article.id).order("created_at", { ascending: false }),
      canEdit
        ? supabase
            .from("artigo_versoes")
            .select("*")
            .eq("artigo_id", article.id)
            .order("created_at", { ascending: false })
            .limit(12)
        : Promise.resolve({ data: [] as ArticleVersionRow[], error: null })
    ]);

    if (profile) {
      setCurrentUser({
        id: user.id,
        nome: profile.nome_completo,
        equipeId: profile.equipe_id,
        role: profile.role
      });
    }

    if (commentsError || versionsResult.error) {
      setCommentMessage(commentsError?.message ?? versionsResult.error?.message ?? "Erro ao carregar revisão.");
      setIsLoadingReviewData(false);
      return;
    }

    const commentRows = rawComments ?? [];
    const versionRows = versionsResult.data ?? [];
    const profileIds = Array.from(
      new Set(
        [user.id]
          .concat(commentRows.map((entry) => entry.created_by))
          .concat(commentRows.map((entry) => entry.resolvido_por ?? ""))
          .concat(versionRows.map((entry) => entry.created_by))
          .filter(Boolean)
      )
    );

    const { data: people } = profileIds.length
      ? await supabase.from("perfis").select("id, nome_completo").in("id", profileIds)
      : { data: [] as Array<{ id: string; nome_completo: string | null }> };

    const names = new Map((people ?? []).map((person) => [person.id, person.nome_completo ?? "Membro da equipe"]));
    names.set(user.id, profile?.nome_completo ?? "Você");

    setComments(
      commentRows.map((entry) => ({
        ...entry,
        authorName: names.get(entry.created_by) ?? "Membro da equipe",
        resolverName: entry.resolvido_por ? (names.get(entry.resolvido_por) ?? "Membro da equipe") : null
      }))
    );
    setVersions(
      versionRows.map((entry) => ({
        ...entry,
        authorName: names.get(entry.created_by) ?? "Membro da equipe"
      }))
    );
    setIsLoadingReviewData(false);
  };

  const persistDraft = async (content: JSONContent) => {
    if (!canEdit) {
      return;
    }

    const supabase = getSupabaseClient();
    const normalizedTitle = titleRef.current.trim() || "Sem título";
    const snapshot = JSON.stringify({
      titulo: normalizedTitle,
      conteudo_json: content,
      status: statusRef.current
    });

    if (snapshot === lastSavedSnapshot.current) {
      setSaveState("saved");
      setSaveMessage("Sem alterações pendentes.");
      return;
    }

    setSaveState("saving");
    setSaveMessage("Salvando rascunho...");

    const {
      data: { user }
    } = await supabase.auth.getUser();

    const { error } = await supabase
      .from("artigos")
      .update({
        titulo: normalizedTitle,
        conteudo_json: content as ArticleContent,
        status: statusRef.current,
        updated_at: new Date().toISOString(),
        last_editor_id: user?.id ?? article.last_editor_id ?? article.autor_id
      })
      .eq("id", article.id);

    if (error) {
      setSaveState("error");
      setSaveMessage(
        error.message.includes("updated_at") || error.message.includes("last_editor_id")
          ? "O banco ainda não recebeu os campos de última edição. Rode a migração de consolidação."
          : error.message
      );
      return;
    }

    lastSavedSnapshot.current = snapshot;
    setSaveState("saved");
    setSaveMessage("Rascunho salvo automaticamente.");
  };

  const exportToDocx = async () => {
    if (!editor) {
      return;
    }

    try {
      setIsExportingDocx(true);
      await exportArticleToDocx(title, editor.getJSON());
    } finally {
      setIsExportingDocx(false);
    }
  };

  const scheduleSave = (content: JSONContent) => {
    if (!canEdit) {
      return;
    }

    if (debounceTimer.current) {
      clearTimeout(debounceTimer.current);
    }

    debounceTimer.current = setTimeout(() => {
      void persistDraft(content);
    }, 700);
  };

  const editor = useEditor({
    immediatelyRender: false,
    extensions: [
      StarterKit,
      Placeholder.configure({
      placeholder: "Descreva a pergunta de pesquisa, metodologia, resultados ou o próximo bloco do artigo."
      })
    ],
    content: article.conteudo_json ?? EMPTY_DOC,
    editable: canEdit,
    editorProps: {
      attributes: {
        class: "weblab-editor"
      }
    },
    onUpdate({ editor: currentEditor }) {
      setEditorVersion((current) => current + 1);
      scheduleSave(currentEditor.getJSON());
    }
  });

  useEffect(() => {
    if (!editor || !canEdit) {
      return;
    }

    scheduleSave(editor.getJSON());
  }, [canEdit, editor, title, status]);

  useEffect(() => {
    return () => {
      if (debounceTimer.current) {
        clearTimeout(debounceTimer.current);
      }
    };
  }, []);

  useEffect(() => {
    void loadReviewData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [article.id, canEdit]);

  const handleLeave = async () => {
    setIsLeaving(true);

    if (debounceTimer.current) {
      clearTimeout(debounceTimer.current);
    }

    if (!editor) {
      router.replace("/dashboard");
      return;
    }

    const content = editor.getJSON();
    const snapshot = JSON.stringify({
      titulo: title.trim() || "Sem título",
      conteudo_json: content,
      status
    });

    if (snapshot !== lastSavedSnapshot.current) {
      setSaveMessage("Salvando antes de sair...");
      await persistDraft(content);
    }

    router.replace("/dashboard");
  };

  const handleStatusChange = async (nextStatus: ArticleStatus) => {
    if (!canEdit) {
      return;
    }

    setStatus(nextStatus);
    statusRef.current = nextStatus;

    if (!editor) {
      return;
    }

    setIsUpdatingStatus(true);
    setSaveState("saving");
    setSaveMessage("Atualizando status do artigo...");

    await persistDraft(editor.getJSON());
    setIsUpdatingStatus(false);
  };

  const insertScientificSection = (blocks: JSONContent[], placement: "cursor" | "end" = "cursor") => {
    if (!editor || !canEdit) {
      return;
    }

    const chain = placement === "end" ? editor.chain().focus("end") : editor.chain().focus();
    chain.insertContent(blocks).run();
  };

  const applyCompleteTemplate = () => {
    if (!editor || !canEdit) {
      return;
    }

    const activeTemplate =
      editorTemplates.find((template) => template.id === selectedTemplateId) ?? editorTemplates[0];

    editor.commands.setContent({
      type: "doc",
      content: activeTemplate.content
    });
    editor.commands.focus("start");
  };

  const saveTone =
    saveState === "error"
      ? "var(--danger)"
      : saveState === "saving"
        ? "var(--accent-strong)"
        : "var(--muted)";
  const activeTemplate =
    editorTemplates.find((template) => template.id === selectedTemplateId) ?? editorTemplates[0];
  const activeSectionGroup =
    sectionGroups.find((group) => group.id === selectedGroupId) ?? sectionGroups[0];
  const selectedSection =
    activeSectionGroup?.sections.find((section) => section.label === selectedSectionLabel) ??
    activeSectionGroup?.sections[0];
  const currentContent = useMemo(() => {
    if (!editor) {
      return article.conteudo_json ?? EMPTY_DOC;
    }

    return editor.getJSON() as ArticleContent;
  }, [article.conteudo_json, editor, editorVersion]);
  const manuscriptAnalysis = useMemo(() => analyseManuscript(currentContent), [currentContent]);
  const activeGap =
    manuscriptAnalysis.citationGaps.find((gap) => gap.id === activeGapId) ??
    manuscriptAnalysis.citationGaps[0] ??
    null;
  const recognizedScientificSectionsCount =
    expectedScientificSections.length - manuscriptAnalysis.missingSections.length;
  const sectionCoveragePercent = Math.round(
    (recognizedScientificSectionsCount / expectedScientificSections.length) * 100
  );
  const structureWarningCount = manuscriptAnalysis.sectionDiagnostics.filter(
    (item) => item.severity === "warning"
  ).length;
  const textWarningCount = manuscriptAnalysis.textDiagnostics.filter(
    (item) => item.severity === "warning"
  ).length;
  const structureAlertCount = manuscriptAnalysis.missingSections.length + structureWarningCount;
  const triageSummary = Object.values(referenceTriage).reduce(
    (summary, status) => ({
      ...summary,
      [status]: summary[status] + 1
    }),
    { usada: 0, revisar: 0, descartada: 0 } satisfies Record<ReferenceTriageStatus, number>
  );
  const unresolvedComments = comments.filter((comment) => !comment.resolvido_em);
  const resolvedComments = comments.length - unresolvedComments.length;
  const cognitiveSnapshot = useMemo(() => {
    if (deepAnalysis) {
      if (deepAnalysis.overallScore >= 78) {
        return {
          tone: "stable" as const,
          label: "Base consistente",
          title: "O manuscrito já sustenta a espinha científica principal.",
          description:
            "Agora vale refinar precisão argumentativa, aderência ao periódico e densidade das referências."
        };
      }

      if (deepAnalysis.overallScore >= 45) {
        return {
          tone: "warning" as const,
          label: "Em desenvolvimento",
          title: "O manuscrito já tem forma, mas ainda pede reforço em pontos centrais.",
          description:
            "Use as prioridades abaixo para fortalecer seções frágeis antes de avançar para a submissão."
        };
      }

      return {
        tone: "critical" as const,
        label: "Estrutura frágil",
        title: "O texto ainda precisa montar a base científica antes de ganhar acabamento.",
        description:
          "Priorize seções ausentes, objetivo, método e sustentação bibliográfica antes de revisar estilo."
      };
    }

    if (recognizedScientificSectionsCount <= 1) {
      return {
        tone: "critical" as const,
        label: "Leitura inicial",
        title: "Ainda não encontrei uma arquitetura científica clara no manuscrito.",
        description:
          "Comece nomeando seções essenciais ou rode a análise completa para receber uma leitura mais profunda."
      };
    }

    if (structureAlertCount > 0 || manuscriptAnalysis.citationGaps.length > 0) {
      return {
        tone: "warning" as const,
        label: "Em revisão",
        title: "O manuscrito já tem direção, mas ainda há lacunas de estrutura e sustentação.",
        description:
          "Ajuste as prioridades de estrutura e as afirmações sem fonte para o WebLab começar a trabalhar a seu favor."
      };
    }

    return {
      tone: "stable" as const,
      label: "Leitura estável",
      title: "A leitura automática encontrou um manuscrito relativamente coerente.",
      description:
        "Agora o ganho está em aprofundar argumento, reduzir repetições e afinar a submissão."
    };
  }, [
    deepAnalysis,
    manuscriptAnalysis.citationGaps.length,
    recognizedScientificSectionsCount,
    structureAlertCount
  ]);
  const tabCounts: Record<CognitiveTab, number> = {
    referencias: manuscriptAnalysis.citationGaps.length,
    estrutura: structureAlertCount,
    texto: textWarningCount,
    revisao: unresolvedComments.length
  };
  const cognitiveActions = useMemo(() => {
    const actions: Array<
      | { id: "analisar"; label: string }
      | { id: "inserir_secao"; label: string; section: string }
      | { id: "buscar_fonte"; label: string }
      | { id: "revisar_texto"; label: string }
      | { id: "abrir_revisao"; label: string }
    > = [];

    if (!deepAnalysis) {
      actions.push({ id: "analisar", label: "Rodar análise completa" });
    }

    if (manuscriptAnalysis.missingSections[0]) {
      actions.push({
        id: "inserir_secao",
        label: `Inserir ${manuscriptAnalysis.missingSections[0]}`,
        section: manuscriptAnalysis.missingSections[0]
      });
    }

    if (activeGap) {
      actions.push({ id: "buscar_fonte", label: "Buscar fonte para o trecho" });
    } else if (textWarningCount > 0) {
      actions.push({ id: "revisar_texto", label: "Revisar clareza do texto" });
    }

    if (unresolvedComments.length > 0) {
      actions.push({ id: "abrir_revisao", label: "Ver comentários abertos" });
    }

    return actions.slice(0, 3);
  }, [
    activeGap,
    deepAnalysis,
    manuscriptAnalysis.missingSections,
    textWarningCount,
    unresolvedComments.length
  ]);
  const toolbarGroups = useMemo(
    () => [
      {
        id: "history",
        label: "Historico",
        items: [
          {
            id: "undo",
            label: "Desfazer",
            icon: Undo2,
            variant: "icon" as const,
            onClick: () => editor?.chain().focus().undo().run(),
            disabled: !editor?.can().chain().focus().undo().run() || !canEdit
          },
          {
            id: "redo",
            label: "Refazer",
            icon: Redo2,
            variant: "icon" as const,
            onClick: () => editor?.chain().focus().redo().run(),
            disabled: !editor?.can().chain().focus().redo().run() || !canEdit
          }
        ]
      },
      {
        id: "formatting",
        label: "Formatacao principal",
        items: [
          {
            id: "bold",
            label: "Negrito",
            variant: "text" as const,
            onClick: () => editor?.chain().focus().toggleBold().run(),
            isActive: !!editor?.isActive("bold"),
            disabled: !canEdit
          },
          {
            id: "italic",
            label: "Italico",
            variant: "text" as const,
            onClick: () => editor?.chain().focus().toggleItalic().run(),
            isActive: !!editor?.isActive("italic"),
            disabled: !canEdit
          },
          {
            id: "paragraph",
            label: "Texto",
            variant: "text" as const,
            onClick: () => editor?.chain().focus().setParagraph().run(),
            isActive: !!editor?.isActive("paragraph"),
            disabled: !canEdit
          },
          {
            id: "h2",
            label: "H2",
            variant: "text" as const,
            onClick: () => editor?.chain().focus().toggleHeading({ level: 2 }).run(),
            isActive: !!editor?.isActive("heading", { level: 2 }),
            disabled: !canEdit
          },
          {
            id: "h3",
            label: "H3",
            variant: "text" as const,
            onClick: () => editor?.chain().focus().toggleHeading({ level: 3 }).run(),
            isActive: !!editor?.isActive("heading", { level: 3 }),
            disabled: !canEdit
          },
          {
            id: "bulletList",
            label: "Lista",
            variant: "text" as const,
            onClick: () => editor?.chain().focus().toggleBulletList().run(),
            isActive: !!editor?.isActive("bulletList"),
            disabled: !canEdit
          },
          {
            id: "orderedList",
            label: "1.",
            variant: "text" as const,
            onClick: () => editor?.chain().focus().toggleOrderedList().run(),
            isActive: !!editor?.isActive("orderedList"),
            disabled: !canEdit
          },
          {
            id: "blockquote",
            label: "Citar",
            variant: "text" as const,
            onClick: () => editor?.chain().focus().toggleBlockquote().run(),
            isActive: !!editor?.isActive("blockquote"),
            disabled: !canEdit
          },
          {
            id: "comment",
            label: "Comentar",
            variant: "text" as const,
            onClick: () => captureSelectedExcerpt(),
            disabled: !editor
          }
        ]
      }
    ],
    [canEdit, editor]
  );

  const runDeepManuscriptAnalysis = async () => {
    setIsAnalyzingManuscript(true);
    setDeepAnalysisMessage(null);

    try {
      const content = editor ? (editor.getJSON() as ArticleContent) : currentContent;
      const response = await fetch("/api/manuscrito/analisar", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ content })
      });

      if (!response.ok) {
        throw new Error("Não foi possível analisar o manuscrito agora.");
      }

      const payload = (await response.json()) as DeepManuscriptAnalysis;
      setDeepAnalysis(payload);
      setDeepAnalysisMessage("Análise estrutural atualizada a partir do manuscrito completo.");
    } catch (error) {
      setDeepAnalysisMessage(error instanceof Error ? error.message : "Erro ao analisar o manuscrito.");
    } finally {
      setIsAnalyzingManuscript(false);
    }
  };

  const loadReferenceSuggestions = async (gap: CitationGap) => {
    setActiveGapId(gap.id);
    setIsFetchingReferences(true);
    setReferenceMessage(null);
    setReferenceSuggestions([]);
    setReferenceSearchContext(null);

    try {
      const response = await fetch("/api/referencias/sugerir", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          claim: gap.text,
          section: gap.section,
          sectionContext: gap.context,
          context: extractDocumentText(currentContent),
          usedReferences: manuscriptAnalysis.usedReferences.map((reference) => reference.text)
        })
      });

      if (!response.ok) {
        throw new Error("Não foi possível consultar referências agora.");
      }

      const payload = (await response.json()) as {
        works: ReferenceSuggestion[];
        query?: string;
        keywords: string[];
        section?: string;
      };
      setReferenceSuggestions(payload.works ?? []);
      setReferenceSearchContext({
        query: payload.query,
        keywords: payload.keywords,
        section: payload.section
      });
      /* Mensagem curta: as sugestões são triagem verificável, não citação automática. */
      setReferenceMessage(
        payload.works.length
          ? "Sugestões carregadas a partir de fonte verificável."
          : "Não encontrei sugestões fortes para esse trecho. Tente refinar o argumento ou buscar no Radar."
      );
    } catch (error) {
      setReferenceMessage(error instanceof Error ? error.message : "Erro ao buscar referências.");
    } finally {
      setIsFetchingReferences(false);
    }
  };

  const insertReferenceSuggestion = (work: ReferenceSuggestion) => {
    if (!editor || !canEdit) {
      return;
    }

    const inTextCitation = formatInTextCitation(work);
    const citation = formatAbntCitation(work);
    editor.chain().focus().insertContent(` (${inTextCitation})`).run();

    const nextContent = appendReferenceToContent(editor.getJSON() as ArticleContent, citation);
    editor.commands.setContent(nextContent);
    setEditorVersion((current) => current + 1);
    setReferenceTriage((current) => ({
      ...current,
      [work.id]: "usada"
    }));
    scheduleSave(nextContent);
    setReferenceMessage("Citação inserida no texto e referência adicionada à seção Referências.");
  };

  const captureSelectedExcerpt = () => {
    if (!editor) {
      setCommentMessage("Abra o manuscrito e selecione um trecho para comentar.");
      return;
    }

    const { from, to, empty } = editor.state.selection;
    if (empty) {
      setCommentMessage("Selecione um trecho do manuscrito para comentar.");
      setCognitiveTab("revisao");
      return;
    }

    const excerpt = editor.state.doc.textBetween(from, to, " ").replace(/\s+/g, " ").trim();
    if (!excerpt) {
      setCommentMessage("Não consegui capturar texto útil nessa seleção.");
      setCognitiveTab("revisao");
      return;
    }

    setSelectedExcerpt(excerpt.slice(0, 420));
    setCommentMessage("Trecho capturado. Agora escreva o comentário.");
    setCognitiveTab("revisao");
  };

  const saveComment = async () => {
    if (!currentUser) {
      setCommentMessage("Não consegui identificar seu usuário para salvar o comentário.");
      return;
    }

    const trimmedComment = commentDraft.trim();
    const excerpt = selectedExcerpt.trim();

    if (!excerpt) {
      setCommentMessage("Selecione um trecho do manuscrito antes de comentar.");
      return;
    }

    if (!trimmedComment) {
      setCommentMessage("Escreva o comentário antes de salvar.");
      return;
    }

    setIsSavingComment(true);
    setCommentMessage(null);

    const supabase = getSupabaseClient();
    const { error } = await supabase.from("artigo_comentarios").insert({
      artigo_id: article.id,
      trecho: excerpt,
      comentario: trimmedComment,
      created_by: currentUser.id
    });

    if (error) {
      setCommentMessage(error.message);
      setIsSavingComment(false);
      return;
    }

    setCommentDraft("");
    setSelectedExcerpt("");
    setCommentMessage("Comentário salvo na revisão do manuscrito.");
    await loadReviewData();
    setIsSavingComment(false);
  };

  const toggleCommentResolution = async (comment: CollaborationComment, resolve: boolean) => {
    if (!currentUser) {
      return;
    }

    const supabase = getSupabaseClient();
    const { error } = await supabase
      .from("artigo_comentarios")
      .update({
        resolvido_por: resolve ? currentUser.id : null,
        resolvido_em: resolve ? new Date().toISOString() : null,
        updated_at: new Date().toISOString()
      })
      .eq("id", comment.id);

    if (error) {
      setCommentMessage(error.message);
      return;
    }

    setCommentMessage(resolve ? "Comentário marcado como resolvido." : "Comentário reaberto.");
    await loadReviewData();
  };

  const saveVersionSnapshot = async (note?: string) => {
    if (!canEdit || !editor || !currentUser) {
      return false;
    }

    setIsSavingVersion(true);
    setVersionMessage(null);

    const supabase = getSupabaseClient();
    const { error } = await supabase.from("artigo_versoes").insert({
      artigo_id: article.id,
      titulo_snapshot: titleRef.current.trim() || "Sem titulo",
      conteudo_json: editor.getJSON() as ArticleContent,
      status_snapshot: statusRef.current,
      observacao: note?.trim() || "Snapshot manual do manuscrito.",
      created_by: currentUser.id
    });

    if (error) {
      setVersionMessage(error.message);
      setIsSavingVersion(false);
      return false;
    }

    setVersionMessage("Versão salva no histórico do manuscrito.");
    setVersionNote("");
    await loadReviewData();
    setIsSavingVersion(false);
    return true;
  };

  const restoreVersion = async (version: VersionSnapshot) => {
    if (!canEdit || !editor || !currentUser) {
      return;
    }

    setRestoringVersionId(version.id);
    setVersionMessage(null);

    await saveVersionSnapshot(
      `Backup automático antes de restaurar a versão de ${formatRelativeUpdate(version.created_at)}.`
    );

    const nextTitle = version.titulo_snapshot.trim() || "Sem titulo";
    const nextContent = version.conteudo_json ?? EMPTY_DOC;
    const nextStatus = version.status_snapshot;
    const supabase = getSupabaseClient();

    const { error } = await supabase
      .from("artigos")
      .update({
        titulo: nextTitle,
        conteudo_json: nextContent,
        status: nextStatus,
        updated_at: new Date().toISOString(),
        last_editor_id: currentUser.id
      })
      .eq("id", article.id);

    if (error) {
      setVersionMessage(error.message);
      setRestoringVersionId(null);
      return;
    }

    setTitle(nextTitle);
    titleRef.current = nextTitle;
    setStatus(nextStatus);
    statusRef.current = nextStatus;
    editor.commands.setContent(nextContent);
    setEditorVersion((current) => current + 1);
    lastSavedSnapshot.current = JSON.stringify({
      titulo: nextTitle,
      conteudo_json: nextContent,
      status: nextStatus
    });
    setVersionMessage("Versão restaurada com sucesso.");
    await loadReviewData();
    setRestoringVersionId(null);
  };

  return (
    <main className="shell editor-workspace">
      <div className="container editor-workspace-container" style={{ display: "grid", gap: "20px" }}>
        <section
          className="glass-card editor-command-bar"
          style={{
            padding: "22px 24px",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            gap: "16px",
            flexWrap: "wrap"
          }}
        >
          <div style={{ display: "grid", gap: "8px" }}>
            <Link href="/dashboard" className="muted">
              {"<- Voltar ao dashboard"}
            </Link>
            <div style={{ display: "flex", gap: "12px", alignItems: "center", flexWrap: "wrap" }}>
              <span
                style={{
                  padding: "8px 12px",
                  borderRadius: "999px",
                  background:
                    saveState === "error"
                      ? "rgba(196, 69, 54, 0.12)"
                      : saveState === "saving"
                        ? "var(--accent-soft)"
                        : "rgba(255,255,255,0.06)",
                  color: saveTone,
                  fontWeight: 700,
                  fontSize: "0.88rem",
                  border: "1px solid rgba(255,255,255,0.08)"
                }}
              >
                {saveState === "saving"
                  ? "Salvando"
                  : saveState === "error"
                    ? "Erro ao salvar"
                    : "Sincronizado"}
              </span>
              <span className="muted">{saveMessage}</span>
              <span className="editor-word-chip">
                {editor
                  ? countArticleWords(editor.getJSON() as ArticleContent)
                  : countArticleWords(article.conteudo_json)}{" "}
                palavras
              </span>
            </div>
          </div>

          <div style={{ display: "flex", gap: "12px", alignItems: "center", flexWrap: "wrap" }}>
            <label className="muted" htmlFor="articleStatus">
              Status
            </label>
            <select
              id="articleStatus"
              disabled={isUpdatingStatus || !canEdit}
              onChange={(event) => void handleStatusChange(event.target.value as ArticleStatus)}
              style={{
                borderRadius: "999px",
                border: "1px solid rgba(255,255,255,0.08)",
                background: "rgba(255,255,255,0.05)",
                color: "var(--foreground)",
                padding: "10px 14px"
              }}
              value={status}
            >
              {Object.entries(statusLabels).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>

            <button
              className="button button-secondary"
              disabled={isLeaving}
              onClick={handleLeave}
              type="button"
            >
              {isLeaving ? "Saindo..." : "Voltar e finalizar"}
            </button>

            <button
              className="button button-primary"
              disabled={isExportingDocx}
              onClick={() => void exportToDocx()}
              type="button"
            >
              {isExportingDocx ? "Gerando DOCX..." : "Exportar DOCX"}
            </button>

            <button
              className="button button-secondary"
              disabled={isSavingVersion || !canEdit}
              onClick={() => void saveVersionSnapshot(versionNote)}
              type="button"
            >
              {isSavingVersion ? "Salvando versão..." : "Salvar versão"}
            </button>

            <Link className="button editor-radar-link" href={"/dashboard/periodicos" as Route}>
              Radar editorial
            </Link>

            <button
              className="button"
              disabled={!canEdit}
              onClick={() => setAbntMode((current) => !current)}
              style={{
                background: abntMode ? "rgba(214,255,247,0.18)" : "rgba(255,255,255,0.05)",
                color: "var(--foreground)",
                border: abntMode ? "1px solid rgba(214,255,247,0.22)" : "1px solid rgba(255,255,255,0.08)"
              }}
              type="button"
            >
              {abntMode ? "ABNT ativa" : "Formatação ABNT"}
            </button>
          </div>
        </section>

        <section
          className="glass-card editor-document-layout"
          style={{
            padding: "26px",
            display: "grid",
            gap: "20px"
          }}
        >
          <div className="editor-paper-column">
          <div
            className="editor-status-card"
            style={{
              display: "grid",
              gap: "10px",
              padding: "18px 20px",
              borderRadius: "22px",
              background: "rgba(255,255,255,0.04)",
              border: "1px solid rgba(255,255,255,0.08)"
            }}
          >
            <strong>Artigo em {statusLabels[status].toLowerCase()}</strong>
            <span className="muted">
              Use o editor para desenvolver o texto e altere o status conforme o artigo evolui entre
              rascunho, submissão interna e aprovação.
            </span>
            {!canEdit ? (
              <span className="danger" style={{ fontSize: "0.92rem" }}>
                {readOnlyReason ?? "Leitura compartilhada: apenas a equipe autora pode editar este manuscrito."}
              </span>
            ) : null}
            <div style={{ display: "flex", gap: "14px", flexWrap: "wrap" }}>
              <span className="muted">
                {editor
                  ? countArticleWords(editor.getJSON() as ArticleContent)
                  : countArticleWords(article.conteudo_json)}{" "}
                palavra(s)
              </span>
              <span className="muted">Última edição: {formatRelativeUpdate(article.updated_at)}</span>
            </div>
          </div>

          <input
            className="editor-title-input"
            disabled={!canEdit}
            onChange={(event) => setTitle(event.target.value)}
            placeholder="Título do artigo"
            style={{
              width: "100%",
              border: "none",
              background: "transparent",
              fontSize: "clamp(2rem, 5vw, 3.4rem)",
              fontWeight: 700,
              color: "var(--foreground)"
            }}
            value={title}
          />

          <div
            className="editor-radar-card"
            style={{
              display: "grid",
              gap: "10px",
              padding: "18px 20px",
              borderRadius: "22px",
              background: "rgba(255,255,255,0.04)",
              border: "1px solid rgba(255,255,255,0.08)"
            }}
          >
            <strong>Revistas para submissão</strong>
            <span className="muted">
              Use o radar editorial quando for decidir submissão: o módulo cruza tema, indexadores e
              shortlist sem quebrar o fluxo do manuscrito.
            </span>
            <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
              <Link
                className="button button-primary"
                href={"/dashboard/periodicos" as Route}
                style={{ textDecoration: "none", width: "fit-content" }}
              >
                Abrir localizador de revistas
              </Link>
            </div>
          </div>

          <div className="editor-toolbar" role="toolbar" aria-label="Ferramentas de formatação do manuscrito">
            <div className="editor-toolbar-group" aria-label="Histórico">
              {[
                {
                  label: "Desfazer",
                  shortLabel: "↶",
                  action: () => editor?.chain().focus().undo().run(),
                  active: false,
                  disabled: !editor?.can().chain().focus().undo().run() || !canEdit
                },
                {
                  label: "Refazer",
                  shortLabel: "↷",
                  action: () => editor?.chain().focus().redo().run(),
                  active: false,
                  disabled: !editor?.can().chain().focus().redo().run() || !canEdit
                }
              ].map((item) => (
                <button
                  key={item.label}
                  className="editor-toolbar-button editor-toolbar-button-icon"
                  data-active={item.active ? "true" : "false"}
                  disabled={item.disabled}
                  onClick={item.action}
                  title={item.label}
                  type="button"
                >
                  <span aria-hidden="true">{item.shortLabel}</span>
                </button>
              ))}
            </div>

            <div className="editor-toolbar-divider" aria-hidden="true" />

            <div className="editor-toolbar-group" aria-label="Formatação básica">
              {[
                {
                  label: "Negrito",
                  action: () => editor?.chain().focus().toggleBold().run(),
                  active: editor?.isActive("bold"),
                  disabled: !canEdit
                },
                {
                  label: "Itálico",
                  action: () => editor?.chain().focus().toggleItalic().run(),
                  active: editor?.isActive("italic"),
                  disabled: !canEdit
                },
                {
                  label: "Texto",
                  action: () => editor?.chain().focus().setParagraph().run(),
                  active: editor?.isActive("paragraph"),
                  disabled: !canEdit
                },
                {
                  label: "H2",
                  action: () => editor?.chain().focus().toggleHeading({ level: 2 }).run(),
                  active: editor?.isActive("heading", { level: 2 }),
                  disabled: !canEdit
                },
                {
                  label: "H3",
                  action: () => editor?.chain().focus().toggleHeading({ level: 3 }).run(),
                  active: editor?.isActive("heading", { level: 3 }),
                  disabled: !canEdit
                },
                {
                  label: "Lista",
                  action: () => editor?.chain().focus().toggleBulletList().run(),
                  active: editor?.isActive("bulletList"),
                  disabled: !canEdit
                },
                {
                  label: "1.",
                  action: () => editor?.chain().focus().toggleOrderedList().run(),
                  active: editor?.isActive("orderedList"),
                  disabled: !canEdit
                },
                {
                  label: "Citar",
                  action: () => editor?.chain().focus().toggleBlockquote().run(),
                  active: editor?.isActive("blockquote"),
                  disabled: !canEdit
                },
                {
                  label: "Comentar",
                  action: captureSelectedExcerpt,
                  active: false,
                  disabled: !editor
                }
              ].map((item) => (
                <button
                  key={item.label}
                  className="editor-toolbar-button"
                  data-active={item.active ? "true" : "false"}
                  disabled={item.disabled}
                  onClick={item.action}
                  type="button"
                >
                  {item.label}
                </button>
              ))}
            </div>
          </div>

          <Toolbar groups={toolbarGroups} />

          <div
            className="editor-template-panel"
            style={{
              display: "grid",
              gap: "12px",
              padding: "18px 0 4px",
              borderBottom: "1px solid rgba(255,255,255,0.08)"
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", gap: "12px", flexWrap: "wrap" }}>
              <strong>Templates vivos</strong>
              <span className="muted">Escolha o tipo de estudo e monte uma estrutura guiada para esse formato.</span>
            </div>

            <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
              {editorTemplates.map((template) => (
                <button
                  key={template.id}
                  className="button"
                  onClick={() => setSelectedTemplateId(template.id)}
                  style={{
                    background:
                      selectedTemplateId === template.id ? "rgba(214,255,247,0.18)" : "rgba(255,255,255,0.05)",
                    color: "var(--foreground)",
                    border:
                      selectedTemplateId === template.id
                        ? "1px solid rgba(214,255,247,0.22)"
                        : "1px solid rgba(255,255,255,0.08)",
                    padding: "10px 14px"
                  }}
                  type="button"
                >
                  {template.name}
                </button>
              ))}
            </div>

            <div
              style={{
                display: "grid",
                gap: "10px",
                padding: "16px",
                borderRadius: "20px",
                background: "rgba(255,255,255,0.04)",
                border: "1px solid rgba(255,255,255,0.08)"
              }}
            >
              <div style={{ display: "grid", gap: "6px" }}>
                <strong>{activeTemplate.name}</strong>
                <span className="muted">{activeTemplate.description}</span>
              </div>

              <div style={{ display: "grid", gap: "8px" }}>
                {activeTemplate.tips.map((tip) => (
                  <span key={tip} className="muted">
                    • {tip}
                  </span>
                ))}
              </div>

              <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
                <button
                  className="button button-primary"
                  disabled={!canEdit}
                  onClick={applyCompleteTemplate}
                  type="button"
                >
                  Montar estrutura completa
                </button>

                <button
                  className="button button-secondary"
                  disabled={!canEdit}
                  onClick={() => insertScientificSection(activeTemplate.content, "end")}
                  type="button"
                >
                  Inserir no fim do texto
                </button>
              </div>
            </div>

            <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
              <button
                className="button button-secondary"
                disabled={!canEdit}
                onClick={applyCompleteTemplate}
                type="button"
              >
                Reaplicar template selecionado
              </button>

              <select
                disabled={!canEdit}
                onChange={(event) => {
                  const nextGroup =
                    sectionGroups.find((group) => group.id === event.target.value) ?? sectionGroups[0];
                  setSelectedGroupId(nextGroup.id);
                  setSelectedSectionLabel(nextGroup.sections[0]?.label ?? "");
                }}
                style={{
                  borderRadius: "999px",
                  border: "1px solid rgba(255,255,255,0.08)",
                  background: "rgba(255,255,255,0.05)",
                  color: "var(--foreground)",
                  padding: "10px 14px",
                  minWidth: "160px"
                }}
                value={selectedGroupId}
              >
                {sectionGroups.map((group) => (
                  <option key={group.id} value={group.id}>
                    {group.label}
                  </option>
                ))}
              </select>

              <select
                disabled={!canEdit}
                onChange={(event) => setSelectedSectionLabel(event.target.value)}
                style={{
                  borderRadius: "999px",
                  border: "1px solid rgba(255,255,255,0.08)",
                  background: "rgba(255,255,255,0.05)",
                  color: "var(--foreground)",
                  padding: "10px 14px",
                  minWidth: "220px"
                }}
                value={selectedSectionLabel}
              >
                {activeSectionGroup.sections.map((section) => (
                  <option key={section.label} value={section.label}>
                    {section.label}
                  </option>
                ))}
              </select>

              <button
                className="button button-secondary"
                disabled={!canEdit}
                onClick={() => selectedSection && insertScientificSection(selectedSection.content)}
                type="button"
              >
                Adicionar seção
              </button>
            </div>
          </div>

          <div
            className="editor-page-shell"
            style={{
              minHeight: "480px",
              padding: "8px 6px 20px"
            }}
          >
            <div className={abntMode ? "editor-surface editor-page abnt-mode" : "editor-surface editor-page"}>
              <EditorContent editor={editor} />
            </div>
          </div>
          </div>

          <aside className="editor-cognitive-sidebar-v2" aria-label="Sidebar cognitiva do manuscrito">
            <div className="cognitive-inspector">
              <div className="cognitive-inspector__header">
                <span className="eyebrow">leitura cognitiva</span>
                <div className="cognitive-inspector__header-copy">
                  <strong>Co-orientador do manuscrito</strong>
                  <p>
                    O WebLab observa estrutura, referências e clareza para mostrar o que ainda falta sustentar.
                  </p>
                </div>
              </div>

            <div className={`cognitive-inspector__overview tone-${cognitiveSnapshot.tone}`}>
              <div className="cognitive-inspector__overview-top">
                <div className="cognitive-inspector__overview-copy">
                  <span className="cognitive-inspector__pill">{cognitiveSnapshot.label}</span>
                  <strong>{cognitiveSnapshot.title}</strong>
                </div>
                <div className="cognitive-inspector__score">
                  {deepAnalysis ? `${deepAnalysis.overallScore}%` : `${sectionCoveragePercent}%`}
                </div>
              </div>
              <p>{cognitiveSnapshot.description}</p>
              {cognitiveActions.length > 0 ? (
                <div className="cognitive-inspector__actions">
                  {cognitiveActions.map((action) => (
                    <button
                      className="button button-secondary"
                      key={action.id}
                      onClick={() => {
                        if (action.id === "analisar") {
                          void runDeepManuscriptAnalysis();
                          setCognitiveTab("estrutura");
                          return;
                        }

                        if (action.id === "inserir_secao") {
                          const block = scientificSections.find((item) => item.label === action.section);
                          if (block) {
                            insertScientificSection(block.content);
                            setCognitiveTab("estrutura");
                          }
                          return;
                        }

                        if (action.id === "buscar_fonte" && activeGap) {
                          setCognitiveTab("referencias");
                          void loadReferenceSuggestions(activeGap);
                          return;
                        }

                        if (action.id === "revisar_texto") {
                          setCognitiveTab("texto");
                          return;
                        }

                        if (action.id === "abrir_revisao") {
                          setCognitiveTab("revisao");
                        }
                      }}
                      type="button"
                    >
                      {action.label}
                    </button>
                  ))}
                </div>
              ) : null}
              <div className="cognitive-inspector__stats">
                <article>
                  <strong>{recognizedScientificSectionsCount}/6</strong>
                  <span>Seções-base</span>
                </article>
                <article>
                  <strong>{manuscriptAnalysis.citationGaps.length}</strong>
                  <span>Lacunas de citação</span>
                </article>
                <article>
                  <strong>{textWarningCount}</strong>
                  <span>Alertas de texto</span>
                </article>
              </div>
            </div>

            <div className="cognitive-inspector__tabs" role="tablist" aria-label="Modo da sidebar">
              <button
                className={cognitiveTab === "referencias" ? "active" : ""}
                onClick={() => setCognitiveTab("referencias")}
                type="button"
              >
                <span>Referências</span>
                {tabCounts.referencias > 0 ? <small>{tabCounts.referencias}</small> : null}
              </button>
              <button
                className={cognitiveTab === "estrutura" ? "active" : ""}
                onClick={() => setCognitiveTab("estrutura")}
                type="button"
              >
                <span>Estrutura</span>
                {tabCounts.estrutura > 0 ? <small>{tabCounts.estrutura}</small> : null}
              </button>
              <button
                className={cognitiveTab === "texto" ? "active" : ""}
                onClick={() => setCognitiveTab("texto")}
                type="button"
              >
                <span>Texto</span>
                {tabCounts.texto > 0 ? <small>{tabCounts.texto}</small> : null}
              </button>
              <button
                className={cognitiveTab === "revisao" ? "active" : ""}
                onClick={() => setCognitiveTab("revisao")}
                type="button"
              >
                <span>Revisão</span>
                {tabCounts.revisao > 0 ? <small>{tabCounts.revisao}</small> : null}
              </button>
            </div>

            {cognitiveTab === "referencias" ? (
              <div className="cognitive-inspector__body">
                <div className="cognitive-inspector__section">
                  <div className="cognitive-inspector__section-head">
                    <strong>Onde a sustentação ainda está frágil</strong>
                    <span className="cognitive-inspector__meta-pill">
                      {manuscriptAnalysis.usedReferences.length} referência(s) detectada(s)
                    </span>
                  </div>

                  {activeGap ? (
                    <div className="cognitive-inspector__focus-card">
                      <span>{activeGap.section}</span>
                      <strong>{activeGap.signal}</strong>
                      <p>{activeGap.text}</p>
                      <div className="cognitive-inspector__inline-actions">
                        <button
                          className="button button-secondary"
                          disabled={isFetchingReferences}
                          onClick={() => void loadReferenceSuggestions(activeGap)}
                          type="button"
                        >
                          {isFetchingReferences ? "Buscando..." : "Buscar papers para este trecho"}
                        </button>
                      </div>
                    </div>
                  ) : (
                    <p className="cognitive-inspector__muted muted">
                      Nenhuma afirmação científica sem citação foi detectada nesta leitura.
                    </p>
                  )}

                  {manuscriptAnalysis.citationGaps.length > 0 ? (
                    <div className="cognitive-inspector__stack cognitive-inspector__gap-list">
                      {manuscriptAnalysis.citationGaps.map((gap) => (
                        <button
                          className={activeGap?.id === gap.id ? "active" : ""}
                          key={gap.id}
                          onClick={() => void loadReferenceSuggestions(gap)}
                          type="button"
                        >
                          <span>{gap.section}</span>
                          {gap.text}
                          <small>{gap.signal}</small>
                        </button>
                      ))}
                    </div>
                  ) : (
                    <p className="cognitive-inspector__muted muted">
                      Quando surgirem lacunas, elas vão aparecer aqui como prioridades de sustentação.
                    </p>
                  )}
                </div>

                <div className="cognitive-inspector__section">
                  <div className="cognitive-inspector__section-head">
                    <strong>Papers verificáveis para apoiar o argumento</strong>
                    {activeGap ? <span className="cognitive-inspector__meta-pill">foco atual: {activeGap.section}</span> : null}
                  </div>

                  {referenceMessage ? <p className="cognitive-inspector__muted muted">{referenceMessage}</p> : null}
                  {referenceSearchContext?.keywords.length ? (
                    <div className="cognitive-inspector__context-card">
                      <span>Busca contextual</span>
                      <strong>{referenceSearchContext.query ?? referenceSearchContext.keywords.join(" ")}</strong>
                      {referenceSearchContext.section ? <small>Seção: {referenceSearchContext.section}</small> : null}
                    </div>
                  ) : null}

                  {referenceSuggestions.length === 0 ? (
                    <p className="cognitive-inspector__muted muted">
                      Selecione uma afirmação acima para carregar papers relacionados ao trecho.
                    </p>
                  ) : (
                    <div className="cognitive-inspector__stack cognitive-inspector__suggestions">
                      {referenceSuggestions.map((work) => {
                        const triageStatus = referenceTriage[work.id];

                        return (
                          <article data-status={triageStatus ?? "nova"} key={work.id}>
                            <strong>{work.title ?? "Título não informado"}</strong>
                            <span>
                              {work.primary_location?.source?.display_name ?? "Fonte não informada"} ? {work.publication_year ?? "s.d."}
                            </span>
                            <p className="cognitive-inspector__reason">
                              {work.match_reason ??
                                "Resultado verificável encontrado para a afirmação selecionada. Confira a aderência antes de inserir."}
                            </p>
                            {work.evidence_hint ? <p className="cognitive-inspector__hint">{work.evidence_hint}</p> : null}
                            {work.matched_terms?.length ? (
                              <div className="cognitive-inspector__term-list">
                                {work.matched_terms.map((term) => (
                                  <span key={term}>{term}</span>
                                ))}
                              </div>
                            ) : null}
                            {triageStatus ? <span className="cognitive-inspector__meta-pill">Marcada como {triageStatus}</span> : null}
                            <div className="cognitive-inspector__inline-actions">
                              <button
                                className="button button-primary"
                                disabled={triageStatus === "descartada"}
                                onClick={() => insertReferenceSuggestion(work)}
                                type="button"
                              >
                                Inserir citação
                              </button>
                              <button
                                className="button button-secondary"
                                onClick={() =>
                                  setReferenceTriage((current) => ({
                                    ...current,
                                    [work.id]: "revisar"
                                  }))
                                }
                                type="button"
                              >
                                Revisar depois
                              </button>
                              <button
                                className="button button-secondary"
                                onClick={() =>
                                  setReferenceTriage((current) => ({
                                    ...current,
                                    [work.id]: "descartada"
                                  }))
                                }
                                type="button"
                              >
                                Descartar
                              </button>
                              {work.primary_location?.landing_page_url ? (
                                <a
                                  className="button button-secondary"
                                  href={work.primary_location.landing_page_url}
                                  rel="noreferrer"
                                  target="_blank"
                                >
                                  Abrir fonte
                                </a>
                              ) : null}
                            </div>
                          </article>
                        );
                      })}
                    </div>
                  )}
                </div>

                <div className="cognitive-inspector__section">
                  <strong>Bibliografia viva do manuscrito</strong>
                  <div className="cognitive-inspector__bibliography-status">
                    <span>{manuscriptAnalysis.usedReferences.length} no texto</span>
                    <span>{manuscriptAnalysis.citationGaps.length} lacunas abertas</span>
                    <span>{triageSummary.revisar} para revisar</span>
                  </div>
                  {manuscriptAnalysis.usedReferences.length === 0 ? (
                    <p className="cognitive-inspector__muted muted">A seção Referências ainda não tem itens detectáveis.</p>
                  ) : (
                    <ol className="cognitive-inspector__used-references">
                      {manuscriptAnalysis.usedReferences.slice(0, 8).map((reference) => (
                        <li key={reference.id}>{reference.text}</li>
                      ))}
                    </ol>
                  )}
                </div>
              </div>
            ) : cognitiveTab === "estrutura" ? (
              <div className="cognitive-inspector__body">
                <div className="cognitive-inspector__section">
                  <div className="cognitive-inspector__section-head">
                    <strong>Leitura estrutural completa</strong>
                    <button
                      className="button button-secondary"
                      disabled={isAnalyzingManuscript}
                      onClick={() => void runDeepManuscriptAnalysis()}
                      type="button"
                    >
                      {isAnalyzingManuscript ? "Analisando..." : "Analisar manuscrito"}
                    </button>
                  </div>
                  <p className="cognitive-inspector__muted muted">
                    Leia o manuscrito inteiro no servidor para sair da heurística rápida e receber critério, diagnóstico e prioridades.
                  </p>
                  {deepAnalysisMessage ? <p className="cognitive-inspector__muted muted">{deepAnalysisMessage}</p> : null}

                  {deepAnalysis ? (
                    <div className="cognitive-inspector__deep-analysis editor-deep-analysis">
                      <div className="cognitive-inspector__context-card editor-deep-analysis-score">
                        <strong>{deepAnalysis.overallScore}%</strong>
                        <span>{deepAnalysis.summary}</span>
                      </div>

                      {deepAnalysis.priorities.length > 0 ? (
                        <div className="cognitive-inspector__stack cognitive-inspector__priority-list">
                          {deepAnalysis.priorities.map((priority) => (
                            <article key={`${priority.section}-${priority.action}`}>
                              <strong>{priority.section}</strong>
                              <span>{priority.action}</span>
                            </article>
                          ))}
                        </div>
                      ) : null}

                      <div className="cognitive-inspector__stack cognitive-inspector__section-review-list">
                        {deepAnalysis.sectionReviews.map((review) => (
                          <article data-status={review.status} key={review.section}>
                            <div>
                              <strong>{review.section}</strong>
                              <span>{review.status === "forte" ? "forte" : review.status === "ausente" ? "ausente" : "revisar"}</span>
                            </div>
                            <p>{review.diagnosis}</p>
                            <small>Critério: {review.why.join(" ")}</small>
                            <small>Como melhorar: {review.suggestions.join(" ")}</small>
                          </article>
                        ))}
                      </div>
                    </div>
                  ) : null}
                </div>

                <div className="cognitive-inspector__section">
                  <div className="cognitive-inspector__section-head">
                    <strong>Mapa e lacunas da estrutura</strong>
                    <span className="cognitive-inspector__meta-pill">{recognizedScientificSectionsCount}/6 reconhecidas</span>
                  </div>
                  {manuscriptAnalysis.headings.length === 0 ? (
                    <p className="cognitive-inspector__muted muted">Use títulos ou marcadores claros de seção para o WebLab mapear a estrutura.</p>
                  ) : (
                    <ol className="cognitive-inspector__manuscript-map">
                      {manuscriptAnalysis.headings.map((heading) => (
                        <li data-level={heading.level} key={heading.id}>
                          {heading.title}
                        </li>
                      ))}
                    </ol>
                  )}

                  {manuscriptAnalysis.missingSections.length === 0 ? (
                    <p className="cognitive-inspector__muted muted">A estrutura científica básica está presente.</p>
                  ) : (
                      <div className="cognitive-inspector__stack cognitive-inspector__missing-list">
                      {manuscriptAnalysis.missingSections.map((section) => (
                        <button
                          key={section}
                          onClick={() => {
                            const block = scientificSections.find((item) => item.label === section);
                            if (block) {
                              insertScientificSection(block.content);
                            }
                          }}
                          type="button"
                        >
                          Adicionar {section}
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                <div className="cognitive-inspector__section">
                  <strong>Leitura por seção</strong>
                  {manuscriptAnalysis.sectionDiagnostics.length === 0 ? (
                    <p className="cognitive-inspector__muted muted">Ainda preciso de mais texto para avaliar a função científica das seções.</p>
                  ) : (
                    <div className="cognitive-inspector__stack cognitive-inspector__section-diagnostic-list">
                      {manuscriptAnalysis.sectionDiagnostics.map((diagnostic) => (
                        <article data-severity={diagnostic.severity} key={diagnostic.id}>
                          <div>
                            <strong>{diagnostic.section}</strong>
                            <span>{diagnostic.severity === "ok" ? "ok" : "atenção"}</span>
                          </div>
                          <p>{diagnostic.message}</p>
                          <small>{diagnostic.action}</small>
                        </article>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            ) : cognitiveTab === "revisao" ? (
              <div className="cognitive-inspector__body">
                <div className="cognitive-inspector__section">
                  <div className="cognitive-inspector__section-head">
                    <strong>Comentar trecho</strong>
                    <button className="button button-secondary" onClick={captureSelectedExcerpt} type="button">
                      Capturar seleção
                    </button>
                  </div>
                  <p className="cognitive-inspector__muted muted">
                    Selecione um trecho do manuscrito, capture a seleção e deixe uma observação objetiva para a equipe.
                  </p>
                  {selectedExcerpt ? (
                    <div className="cognitive-inspector__context-card cognitive-inspector__excerpt">
                      <span>Trecho selecionado</span>
                      <strong>{selectedExcerpt}</strong>
                    </div>
                  ) : (
                    <p className="cognitive-inspector__muted muted">Nenhum trecho capturado ainda.</p>
                  )}
                  <textarea
                    className="editor-inline-textarea"
                    onChange={(event) => setCommentDraft(event.target.value)}
                    placeholder="Ex.: justificar melhor este argumento, inserir fonte primária, rever recorte metodológico..."
                    rows={4}
                    value={commentDraft}
                  />
                  <div className="cognitive-inspector__review-actions">
                    <button
                      className="button button-primary"
                      disabled={isSavingComment}
                      onClick={() => void saveComment()}
                      type="button"
                    >
                      {isSavingComment ? "Salvando comentário..." : "Salvar comentário"}
                    </button>
                    {commentMessage ? <span className="cognitive-inspector__muted muted">{commentMessage}</span> : null}
                  </div>
                </div>

                <div className="cognitive-inspector__section">
                  <div className="cognitive-inspector__section-head">
                    <strong>Comentários do manuscrito</strong>
                    <span className="cognitive-inspector__meta-pill">
                      {unresolvedComments.length} abertos • {resolvedComments} resolvidos
                    </span>
                  </div>
                  {isLoadingReviewData ? (
                    <p className="cognitive-inspector__muted muted">Carregando comentários e versões...</p>
                  ) : comments.length === 0 ? (
                    <p className="cognitive-inspector__muted muted">Ainda não há comentários nesse manuscrito.</p>
                  ) : (
                    <div className="cognitive-inspector__stack cognitive-inspector__comment-list">
                      {comments.map((comment) => {
                        const canResolve =
                          currentUser &&
                          (canEdit || comment.created_by === currentUser.id || currentUser.role === "coordenador_geral");

                        return (
                          <article
                            className="cognitive-inspector__comment-card"
                            data-status={comment.resolvido_em ? "resolved" : "open"}
                            key={comment.id}
                          >
                              <div className="cognitive-inspector__meta-row">
                              <strong>{comment.authorName}</strong>
                              <span>{formatRelativeUpdate(comment.created_at)}</span>
                            </div>
                            <blockquote>{comment.trecho || "Trecho não informado."}</blockquote>
                            <p>{comment.comentario}</p>
                            {comment.resolvido_em ? (
                              <small>
                                Resolvido por {comment.resolverName ?? "membro da equipe"} em {" "}
                                {formatRelativeUpdate(comment.resolvido_em)}.
                              </small>
                            ) : (
                              <small>Aberto para revisão da equipe.</small>
                            )}
                            {canResolve ? (
                              <div className="cognitive-inspector__review-actions">
                                <button
                                  className="button button-secondary"
                                  onClick={() => void toggleCommentResolution(comment, !comment.resolvido_em)}
                                  type="button"
                                >
                                  {comment.resolvido_em ? "Reabrir" : "Marcar como resolvido"}
                                </button>
                              </div>
                            ) : null}
                          </article>
                        );
                      })}
                    </div>
                  )}
                </div>

                <div className="cognitive-inspector__section">
                  <div className="cognitive-inspector__section-head">
                    <strong>Histórico de versões</strong>
                    <button
                      className="button button-secondary"
                      disabled={isSavingVersion || !canEdit}
                      onClick={() => void saveVersionSnapshot(versionNote)}
                      type="button"
                    >
                      {isSavingVersion ? "Salvando..." : "Salvar versão atual"}
                    </button>
                  </div>
                  <input
                    className="editor-inline-input"
                    disabled={!canEdit}
                    onChange={(event) => setVersionNote(event.target.value)}
                    placeholder="Observação opcional da versão (ex.: revisão do resumo, ajuste metodológico...)"
                    value={versionNote}
                  />
                  {versionMessage ? <p className="cognitive-inspector__muted muted">{versionMessage}</p> : null}
                  {!canEdit ? (
                    <p className="cognitive-inspector__muted muted">O histórico detalhado de versões fica disponível apenas para a equipe autora.</p>
                  ) : versions.length === 0 ? (
                    <p className="cognitive-inspector__muted muted">Ainda não há snapshots salvos deste manuscrito.</p>
                  ) : (
                    <div className="cognitive-inspector__stack cognitive-inspector__version-list">
                      {versions.map((version) => (
                        <article className="cognitive-inspector__version-card" key={version.id}>
                          <div className="cognitive-inspector__meta-row">
                            <strong>{version.observacao || "Versão sem observação"}</strong>
                            <span>{formatRelativeUpdate(version.created_at)}</span>
                          </div>
                          <p>
                            {version.authorName} • {statusLabels[version.status_snapshot].toLowerCase()} •{" "}
                            {countArticleWords(version.conteudo_json)} palavras
                          </p>
                          <small>{version.titulo_snapshot}</small>
                          <div className="cognitive-inspector__review-actions">
                            <button
                              className="button button-secondary"
                              disabled={restoringVersionId === version.id}
                              onClick={() => void restoreVersion(version)}
                              type="button"
                            >
                              {restoringVersionId === version.id ? "Restaurando..." : "Restaurar versão"}
                            </button>
                          </div>
                        </article>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <div className="cognitive-inspector__body">
                <div className="cognitive-inspector__section">
                  <strong>Clareza e argumento</strong>
                  {manuscriptAnalysis.textDiagnostics.length === 0 ? (
                    <p className="cognitive-inspector__muted muted">Ainda preciso de mais texto para avaliar o fluxo argumentativo.</p>
                  ) : (
                    <div className="cognitive-inspector__stack cognitive-inspector__text-diagnostic-list">
                      {manuscriptAnalysis.textDiagnostics.map((diagnostic) => (
                        <article data-severity={diagnostic.severity} key={diagnostic.id}>
                          <div>
                            <strong>{diagnostic.title}</strong>
                            <span>{diagnostic.severity === "warning" ? "revisar" : "ok"}</span>
                          </div>
                          <p>{diagnostic.message}</p>
                          <small>{diagnostic.action}</small>
                        </article>
                      ))}
                    </div>
                  )}
                </div>

                <div className="cognitive-inspector__section">
                  <strong>Conexões conceituais</strong>
                  {manuscriptAnalysis.conceptSignals.length === 0 ? (
                    <p className="cognitive-inspector__muted muted">Quando o manuscrito crescer, o WebLab vai destacar conceitos recorrentes entre seções.</p>
                  ) : (
                    <div className="cognitive-inspector__stack cognitive-inspector__concept-list">
                      {manuscriptAnalysis.conceptSignals.map((concept) => (
                        <article key={concept.id}>
                          <div>
                            <strong>{concept.term}</strong>
                            <span>{concept.count} ocorrências</span>
                          </div>
                          <small>
                            Aparece em {concept.sections.join(", ")}. Use isso para conectar ideias ou cortar repetição.
                          </small>
                        </article>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}
            </div>
          </aside>
        </section>
      </div>
    </main>
  );
}
