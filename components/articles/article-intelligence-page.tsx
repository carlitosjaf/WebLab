"use client";

import { useEffect, useMemo, useRef, useState } from "react";

type ArticleIntelligencePageProps = {
  title: string;
  areaLabel?: string;
  stageLabel?: string;
  manuscriptText: string;
  googleDocsUrl?: string;
  lastSyncAt?: string;
};

type Scores = {
  clarity: number;
  cohesion: number;
  argumentation: number;
};

type WeakClaim = {
  sentence: string;
  reason: string;
  severity: "moderada" | "elevada";
};

type JournalSuggestion = {
  name: string;
  fit: "alto" | "medio" | "reserva";
  rationale: string;
};

type ToolbarButton = {
  label: string;
  onClick: () => void;
  accent?: boolean;
};

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function normalizeWhitespace(text: string) {
  return text.replace(/\s+/g, " ").trim();
}

function splitIntoParagraphs(text: string) {
  return text
    .split(/\n{2,}/)
    .map((paragraph) => normalizeWhitespace(paragraph))
    .filter(Boolean);
}

function splitIntoSentences(text: string) {
  return text
    .split(/(?<=[.!?])\s+/)
    .map((sentence) => normalizeWhitespace(sentence))
    .filter(Boolean);
}

function detectInitialAbstract(text: string) {
  const paragraphs = splitIntoParagraphs(text);
  const explicitAbstract = paragraphs.find((paragraph) =>
    /^resumo[:\s]|^abstract[:\s]/i.test(paragraph)
  );

  if (explicitAbstract) {
    return explicitAbstract;
  }

  const firstLongParagraph = paragraphs.find((paragraph) => paragraph.length > 320);
  if (firstLongParagraph) {
    return firstLongParagraph;
  }

  return paragraphs[0] ?? "";
}

function detectWeakClaims(text: string): WeakClaim[] {
  const sentences = splitIntoSentences(text);
  const citationRegex =
    /\(([^)]*(19|20)\d{2}[^)]*)\)|\[[0-9,\s\-]+\]|(?:et al\.?,?\s*(19|20)\d{2})/i;
  const strongClaimRegex =
    /\b(comprova|demonstra|evidencia|prova|sem duvida|inegavelmente|claramente|todos|sempre|nunca|necessariamente|definitivamente)\b/i;
  const numericClaimRegex = /\b\d+(?:[.,]\d+)?%|\b\d+(?:[.,]\d+)?\b/;

  const weakClaims: WeakClaim[] = [];

  for (const sentence of sentences) {
    const hasCitation = citationRegex.test(sentence);
    const hasStrongClaim = strongClaimRegex.test(sentence);
    const hasNumericClaim = numericClaimRegex.test(sentence);

    if ((hasStrongClaim || hasNumericClaim) && !hasCitation && sentence.length > 60) {
      weakClaims.push({
        sentence,
        severity: hasNumericClaim ? "elevada" : "moderada",
        reason: hasNumericClaim
          ? "O trecho traz dado quantitativo sem fonte explicitada no proprio periodo."
          : "A formulacao assume tom assertivo forte sem sustentacao aparente no trecho."
      });
    }
  }

  return weakClaims.slice(0, 6);
}

function calculateScores(text: string, weakClaims: WeakClaim[]): Scores {
  const paragraphs = splitIntoParagraphs(text);
  const sentences = splitIntoSentences(text);
  const averageSentenceLength =
    sentences.length > 0
      ? sentences.reduce((accumulator, sentence) => accumulator + sentence.split(/\s+/).length, 0) /
        sentences.length
      : 0;

  const transitionCount = (
    text.match(
      /\b(portanto|alem disso|por outro lado|nesse sentido|assim|contudo|todavia|desse modo|em contrapartida|logo|por fim|ademais)\b/gi
    ) ?? []
  ).length;

  const citationCount = (
    text.match(/\(([^)]*(19|20)\d{2}[^)]*)\)|\[[0-9,\s\-]+\]|et al\.?/gi) ?? []
  ).length;

  const methodologySignals = (
    text.match(
      /\b(metodo|metodologia|amostra|participantes|analise|procedimento|instrumento|coleta|dados|resultados|discussao|delineamento)\b/gi
    ) ?? []
  ).length;

  let clarity = 7.4;
  if (averageSentenceLength > 30) {
    clarity -= 1.2;
  } else if (averageSentenceLength > 24) {
    clarity -= 0.55;
  }

  if (paragraphs.length >= 5) {
    clarity += 0.2;
  }

  if (text.length < 2500) {
    clarity -= 0.45;
  }

  let cohesion = 6.7;
  cohesion += Math.min(transitionCount * 0.12, 1.1);
  if (paragraphs.length < 4) {
    cohesion -= 0.55;
  }
  if (paragraphs.length > 10) {
    cohesion += 0.25;
  }

  let argumentation = 6.2;
  argumentation += Math.min(citationCount * 0.08, 1.2);
  argumentation += Math.min(methodologySignals * 0.05, 0.65);
  argumentation -= weakClaims.length * 0.3;

  return {
    clarity: Number(clamp(clarity, 4.8, 9.4).toFixed(1)),
    cohesion: Number(clamp(cohesion, 4.8, 9.4).toFixed(1)),
    argumentation: Number(clamp(argumentation, 4.8, 9.4).toFixed(1))
  };
}

function finalizeSentence(text: string) {
  const cleaned = normalizeWhitespace(text).replace(/[;,:-]+$/, "");
  if (!cleaned) {
    return "";
  }

  return /[.!?]$/.test(cleaned) ? cleaned : `${cleaned}.`;
}

function findFirstMatchingSentence(text: string, pattern: RegExp) {
  return splitIntoSentences(text).find((sentence) => pattern.test(sentence)) ?? "";
}

function improveAbstractConservatively(text: string) {
  const detectedAbstract = detectInitialAbstract(text);
  const objectiveSentence =
    findFirstMatchingSentence(text, /\b(objetivo|objetivou|visa|pretende|busca analisar|analisa)\b/i) ||
    "O objetivo central do estudo ainda nao aparece com nitidez suficiente no manuscrito.";
  const methodSentence =
    findFirstMatchingSentence(
      text,
      /\b(metodo|metodologia|amostra|participantes|analise|procedimento|delineamento|coleta)\b/i
    ) || "O metodo ainda precisa ser descrito com mais precisao para sustentar a leitura editorial.";
  const resultSentence =
    findFirstMatchingSentence(
      text,
      /\b(resultado|resultados|achados|evidenciou|indicou|apontou|revelou|mostrou|sugere|sugerem)\b/i
    ) || "Os achados principais ainda nao estao suficientemente explicitos no corpo do manuscrito.";
  const conclusionSentence =
    findFirstMatchingSentence(
      text,
      /\b(conclusao|conclui|contribui|implicacoes|sintese)\b/i
    ) || "A conclusao ainda pede um fechamento mais nitido sobre a contribuicao do estudo.";

  const improved = [
    finalizeSentence(objectiveSentence),
    finalizeSentence(methodSentence),
    finalizeSentence(resultSentence),
    finalizeSentence(conclusionSentence)
  ]
    .filter(Boolean)
    .filter((sentence, index, allSentences) => allSentences.indexOf(sentence) === index)
    .join(" ");

  return improved.length > 120 ? improved : finalizeSentence(detectedAbstract);
}

function computeReadiness(scores: Scores, weakClaims: WeakClaim[], abstractText: string) {
  const average = (scores.clarity + scores.cohesion + scores.argumentation) / 3;
  let readiness = average * 10;

  if (weakClaims.length >= 4) {
    readiness -= 9;
  } else if (weakClaims.length >= 2) {
    readiness -= 5;
  }

  if (abstractText.length < 450) {
    readiness -= 7;
  }

  if (!/\b(objetivo|metodo|metodologia|resultado|resultados|conclui|conclusao)\b/i.test(abstractText)) {
    readiness -= 6;
  }

  return Math.round(clamp(readiness, 38, 94));
}

function getRiskLabel(readiness: number) {
  if (readiness < 60) {
    return "alto";
  }
  if (readiness < 75) {
    return "medio";
  }
  return "baixo";
}

function getNextStep(readiness: number, weakClaims: WeakClaim[], abstractText: string) {
  if (abstractText.length < 450) {
    return {
      title: "Consolidar um resumo mais forte",
      description:
        "A entrada do texto ainda nao traduz toda a qualidade do manuscrito. Melhorar o resumo costuma alterar a percepcao editorial imediatamente.",
      action: "Gerar nova versao do resumo"
    };
  }

  if (weakClaims.length > 0) {
    return {
      title: "Reforcar trechos com sustentacao insuficiente",
      description:
        "Ha afirmacoes relevantes que ainda pedem fonte, prudencia formular ou explicacao metodologica mais clara.",
      action: "Revisar trechos frageis"
    };
  }

  if (readiness < 75) {
    return {
      title: "Refinar a costura argumentativa",
      description:
        "O texto ja tem base consistente, mas ainda pode ganhar em progressao entre secoes e fechamento interpretativo.",
      action: "Revisar estrutura final"
    };
  }

  return {
    title: "Preparar submissao",
    description:
      "O manuscrito ja se encontra em faixa competitiva para avaliacao inicial. O proximo passo e conferir aderencia formal e checklist final.",
    action: "Entrar no modo submissao"
  };
}

function suggestJournals(text: string): JournalSuggestion[] {
  const lowerCaseText = text.toLowerCase();

  if (/\bsaude|pandemia|politica publica|epidemiologia|cuidado\b/.test(lowerCaseText)) {
    return [
      {
        name: "Saude em Debate",
        fit: "alto",
        rationale:
          "Boa aderencia a discussoes criticas, institucionais e de politica em saude."
      },
      {
        name: "Interface - Comunicacao, Saude, Educacao",
        fit: "medio",
        rationale:
          "Compatibilidade alta com manuscritos interdisciplinares que articulam saude, educacao e experiencia social."
      },
      {
        name: "Physis: Revista de Saude Coletiva",
        fit: "reserva",
        rationale:
          "Alternativa consistente para uma versao mais amadurecida e teoricamente densificada."
      }
    ];
  }

  if (/\bpsicologia|subjetividade|saude mental|sofrimento psiquico\b/.test(lowerCaseText)) {
    return [
      {
        name: "Psicologia & Sociedade",
        fit: "alto",
        rationale:
          "Aderente a analises psicossociais e criticas sobre experiencia, desigualdade e instituicoes."
      },
      {
        name: "Estudos de Psicologia",
        fit: "medio",
        rationale:
          "Boa possibilidade se o texto apresentar costura metodologica bastante clara."
      },
      {
        name: "Fractal: Revista de Psicologia",
        fit: "reserva",
        rationale:
          "Pode funcionar bem em versao mais lapidada do ponto de vista discursivo."
      }
    ];
  }

  return [
    {
      name: "Revista interdisciplinar de escopo analitico",
      fit: "alto",
      rationale:
        "Boa compatibilidade com manuscritos de abordagem ampla, objeto bem delimitado e articulacao entre areas."
    },
    {
      name: "Periodico tematico com foco metodologico",
      fit: "medio",
      rationale:
        "Viavel se o artigo explicitar melhor desenho analitico, corpus e percurso argumentativo."
    },
    {
      name: "Revista de reserva estrategica",
      fit: "reserva",
      rationale:
        "Alternativa prudente para uma segunda rodada, apos ganho de densidade textual."
    }
  ];
}

function formatSyncLabel(value?: string) {
  if (!value) {
    return "Sincronizacao ainda nao registrada";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "medium",
    timeStyle: "short"
  }).format(date);
}

function inferTags(text: string, areaLabel: string) {
  const lowerCaseText = text.toLowerCase();
  const tags = new Set<string>();

  if (/\brevisao sistematica\b/.test(lowerCaseText)) {
    tags.add("Revisao sistematica");
  }

  if (/\bepidemiologia|saude publica|saude coletiva\b/.test(lowerCaseText) || /saude/i.test(areaLabel)) {
    tags.add("Saude coletiva");
  }

  if (/\bqualitativ|analitico|experiencia|subjetividade\b/.test(lowerCaseText)) {
    tags.add("Analise qualitativa");
  }

  tags.add("PT-BR");

  return Array.from(tags).slice(0, 4);
}

function escapeHtml(text: string) {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function isHeadingParagraph(paragraph: string) {
  const normalized = paragraph
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();

  return [
    "introducao",
    "metodo",
    "metodos",
    "materiais e metodos",
    "resultados",
    "discussao",
    "conclusao",
    "objetivo",
    "referencias"
  ].includes(normalized);
}

function buildEditorMarkup(text: string) {
  const paragraphs = splitIntoParagraphs(text);

  return paragraphs
    .map((paragraph) => {
      const safe = escapeHtml(paragraph);

      if (isHeadingParagraph(paragraph) || (paragraph.length < 72 && !/[.!?]/.test(paragraph))) {
        return `<h2>${safe}</h2>`;
      }

      if (/^resumo[:\s]/i.test(paragraph)) {
        return `<p class="lead-paragraph">${safe}</p>`;
      }

      return `<p>${safe}</p>`;
    })
    .join("");
}

function getWordCount(text: string) {
  return normalizeWhitespace(text).split(/\s+/).filter(Boolean).length;
}

function getSectionCount(text: string) {
  return splitIntoParagraphs(text).filter((paragraph) => isHeadingParagraph(paragraph)).length;
}

type AccordionKey = "cognition" | "references" | "submission" | "actions";

export function ArticleIntelligencePage({
  title,
  areaLabel = "Pos-graduacao e pesquisa",
  stageLabel = "Em revisao editorial",
  manuscriptText,
  googleDocsUrl,
  lastSyncAt
}: ArticleIntelligencePageProps) {
  const editorRef = useRef<HTMLDivElement | null>(null);
  const weakClaimsRef = useRef<HTMLDivElement | null>(null);
  const [editorText, setEditorText] = useState(manuscriptText);
  const [generatedAbstract, setGeneratedAbstract] = useState(detectInitialAbstract(manuscriptText));
  const [showWeakClaims, setShowWeakClaims] = useState(false);
  const [submissionMode, setSubmissionMode] = useState(false);
  const [openAccordions, setOpenAccordions] = useState<Record<AccordionKey, boolean>>({
    cognition: true,
    references: true,
    submission: true,
    actions: true
  });

  useEffect(() => {
    setEditorText(manuscriptText);
    setGeneratedAbstract(detectInitialAbstract(manuscriptText));

    if (editorRef.current) {
      editorRef.current.innerHTML = buildEditorMarkup(manuscriptText);
    }
  }, [manuscriptText]);

  const weakClaims = useMemo(() => detectWeakClaims(editorText), [editorText]);
  const scores = useMemo(() => calculateScores(editorText, weakClaims), [editorText, weakClaims]);
  const journals = useMemo(() => suggestJournals(editorText), [editorText]);
  const readiness = useMemo(
    () => computeReadiness(scores, weakClaims, generatedAbstract),
    [generatedAbstract, scores, weakClaims]
  );
  const risk = useMemo(() => getRiskLabel(readiness), [readiness]);
  const nextStep = useMemo(
    () => getNextStep(readiness, weakClaims, generatedAbstract),
    [generatedAbstract, readiness, weakClaims]
  );
  const tags = useMemo(() => inferTags(editorText, areaLabel), [areaLabel, editorText]);
  const syncLabel = useMemo(() => formatSyncLabel(lastSyncAt), [lastSyncAt]);
  const wordCount = useMemo(() => getWordCount(editorText), [editorText]);
  const sectionCount = useMemo(() => getSectionCount(editorText), [editorText]);

  const summaryChecklist = [
    {
      done: generatedAbstract.length >= 450,
      label: "Resumo com densidade minima para triagem editorial."
    },
    {
      done: /\b(objetivo|objetiv)/i.test(generatedAbstract),
      label: "Objetivo explicitado com precisao."
    },
    {
      done: /\b(metodo|metodologia|procedimento|amostra|participantes)\b/i.test(generatedAbstract),
      label: "Metodo ou delineamento indicado."
    },
    {
      done: /\b(resultado|resultados|achados|indicam|sugerem)\b/i.test(generatedAbstract),
      label: "Achados ou direcao interpretativa apresentados."
    },
    {
      done: /\b(conclui|conclusao|contribui)\b/i.test(generatedAbstract),
      label: "Fechamento com implicacao analitica."
    }
  ];

  const submissionChecklist = [
    {
      done: generatedAbstract.length >= 450,
      label: "Resumo pronto para leitura de triagem."
    },
    {
      done: weakClaims.length <= 1,
      label: "Trechos de maior impacto revisados quanto a sustentacao."
    },
    {
      done: scores.argumentation >= 6.8,
      label: "Eixo argumentativo suficientemente robusto."
    },
    {
      done: readiness >= 75,
      label: "Patamar geral do manuscrito adequado para submissao."
    }
  ];

  const toolbarButtons: ToolbarButton[] = [
    { label: "Desfazer", onClick: () => runEditorCommand("undo", editorRef) },
    { label: "Refazer", onClick: () => runEditorCommand("redo", editorRef) },
    { label: "Negrito", onClick: () => runEditorCommand("bold", editorRef) },
    { label: "Italico", onClick: () => runEditorCommand("italic", editorRef) },
    { label: "Texto", onClick: () => runEditorCommand("formatBlock", editorRef, "p"), accent: true },
    { label: "H2", onClick: () => runEditorCommand("formatBlock", editorRef, "h2") },
    { label: "H3", onClick: () => runEditorCommand("formatBlock", editorRef, "h3") },
    { label: "Lista", onClick: () => runEditorCommand("insertUnorderedList", editorRef) },
    { label: "1.", onClick: () => runEditorCommand("insertOrderedList", editorRef) },
    {
      label: "Citar",
      onClick: () => {
        const reference = window.prompt("Cole a citacao ou referencia que deseja inserir:");
        if (reference) {
          runEditorCommand("insertText", editorRef, ` (${reference})`);
        }
      }
    },
    {
      label: "Comentar",
      onClick: () => {
        const comment = window.prompt("Registre o comentario editorial para este ponto:");
        if (comment) {
          runEditorCommand("insertText", editorRef, ` [Comentario editorial: ${comment}] `);
        }
      }
    }
  ];

  function syncEditorText() {
    if (!editorRef.current) {
      return;
    }

    setEditorText(editorRef.current.innerText.replace(/\n{3,}/g, "\n\n").trim());
  }

  function handleGenerateAbstract() {
    setGeneratedAbstract(improveAbstractConservatively(editorText));
  }

  function handleNextStep() {
    if (nextStep.action.includes("resumo")) {
      handleGenerateAbstract();
      return;
    }

    if (nextStep.action.includes("trechos")) {
      setShowWeakClaims(true);
      weakClaimsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      return;
    }

    if (nextStep.action.includes("submissao")) {
      setSubmissionMode(true);
      setOpenAccordions((current) => ({ ...current, submission: true }));
      return;
    }

    weakClaimsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function toggleAccordion(key: AccordionKey) {
    setOpenAccordions((current) => ({ ...current, [key]: !current[key] }));
  }

  return (
    <div className="page">
      <div className="status-rail">
        <div className="status-rail__left">
          <span className="context-pill context-pill-primary">{stageLabel}</span>
          <span className="context-pill">{areaLabel}</span>
          <span className="context-pill">Ultima leitura: {syncLabel}</span>
        </div>
        <div className="status-rail__right">
          <span className={`readiness-chip readiness-chip-${risk}`}>{readiness}% de prontidao</span>
          {googleDocsUrl ? (
            <a className="ghost-link" href={googleDocsUrl} rel="noreferrer" target="_blank">
              Abrir Google Docs
            </a>
          ) : null}
        </div>
      </div>

      <div className="workspace">
        <main className="document-column">
          <section className="document-stage">
            <div className="document-header">
              <div className="document-header__copy">
                <h1>{title}</h1>
                <div className="tag-row">
                  {tags.map((tag) => (
                    <span className="tag" key={tag}>
                      {tag}
                    </span>
                  ))}
                </div>
              </div>

              <div className="hero-metrics">
                <article>
                  <strong>{wordCount}</strong>
                  <span>palavras</span>
                </article>
                <article>
                  <strong>{sectionCount || 1}</strong>
                  <span>blocos</span>
                </article>
                <article>
                  <strong>{weakClaims.length}</strong>
                  <span>alertas</span>
                </article>
              </div>
            </div>

            <div className="next-step">
              <div>
                <span className="section-kicker">Proximo passo recomendado</span>
                <strong>{nextStep.title}</strong>
                <p>{nextStep.description}</p>
              </div>
              <div className="next-step__actions">
                <button className="button button-primary" onClick={handleNextStep} type="button">
                  {nextStep.action}
                </button>
                <button
                  className="button button-secondary"
                  onClick={() => setSubmissionMode((current) => !current)}
                  type="button"
                >
                  {submissionMode ? "Sair do modo submissao" : "Entrar no modo submissao"}
                </button>
              </div>
            </div>

            <div className="toolbar">
              {toolbarButtons.map((button) => (
                <button
                  className={`toolbar-button ${button.accent ? "toolbar-button-accent" : ""}`}
                  key={button.label}
                  onClick={button.onClick}
                  type="button"
                >
                  {button.label}
                </button>
              ))}
            </div>

            <article className="document-shell">
              <div className="document-shell__guide" />
              <div
                className="document-editor"
                contentEditable
                onInput={syncEditorText}
                ref={editorRef}
                suppressContentEditableWarning
              />
            </article>

            <section className="support-grid">
              <article className="surface-card">
                <div className="surface-card__head">
                  <div>
                    <span className="section-kicker">Resumo fortalecido</span>
                    <h2>Versao assistida do resumo</h2>
                  </div>
                  <button className="button button-secondary" onClick={handleGenerateAbstract} type="button">
                    Regerar
                  </button>
                </div>

                <p className="abstract-box">{generatedAbstract || "Nenhum resumo detectado."}</p>

                <div className="checklist">
                  {summaryChecklist.map((item) => (
                    <div className="check-item" key={item.label}>
                      <span className={`check-bullet ${item.done ? "done" : "todo"}`}>{item.done ? "✓" : "•"}</span>
                      <span>{item.label}</span>
                    </div>
                  ))}
                </div>
              </article>

              <article className="surface-card" ref={weakClaimsRef}>
                <div className="surface-card__head">
                  <div>
                    <span className="section-kicker">Trechos frageis</span>
                    <h2>Leitura critica do texto</h2>
                  </div>
                  <button
                    className="button button-secondary"
                    onClick={() => setShowWeakClaims((current) => !current)}
                    type="button"
                  >
                    {showWeakClaims ? "Ocultar" : `Exibir ${weakClaims.length}`}
                  </button>
                </div>

                {showWeakClaims ? (
                  <div className="weak-claims">
                    {weakClaims.length === 0 ? (
                      <article className="weak-card weak-card-ok">
                        <strong>Nenhum trecho critico foi sinalizado pela leitura local.</strong>
                        <p>
                          Isso nao substitui revisao academica criteriosa, mas sugere um nivel razoavel de prudencia
                          formular no estado atual do texto.
                        </p>
                      </article>
                    ) : (
                      weakClaims.map((claim, index) => (
                        <article className="weak-card" key={`${claim.sentence.slice(0, 32)}-${index}`}>
                          <div className="weak-card__head">
                            <strong>Trecho {index + 1}</strong>
                            <span className={`severity severity-${claim.severity}`}>{claim.severity}</span>
                          </div>
                          <p className="weak-card__sentence">"{claim.sentence}"</p>
                          <p className="weak-card__reason">{claim.reason}</p>
                        </article>
                      ))
                    )}
                  </div>
                ) : (
                  <div className="collapsed-state">
                    Os alertas ficam recolhidos por padrao para preservar foco na escrita e abrir somente quando necessario.
                  </div>
                )}
              </article>
            </section>
          </section>
        </main>

        <aside className="inspector">
          <section className="inspector-card inspector-card-hero">
            <span className="section-kicker">Painel do pesquisador</span>
            <h2>Leitura editorial em tempo real</h2>
            <p>
              O WebLab nao fica ao lado do manuscrito apenas para observar. Ele sintetiza o estado do texto,
              aponta risco e organiza o proximo movimento editorial.
            </p>
          </section>

          <section className="inspector-card">
            <button className="accordion-head" onClick={() => toggleAccordion("cognition")} type="button">
              <span>Leitura Cognitiva</span>
              <strong>{openAccordions.cognition ? "−" : "+"}</strong>
            </button>
            {openAccordions.cognition ? (
              <div className="accordion-body">
                <div className="score-list">
                  <div className="score-row">
                    <span>Clareza</span>
                    <strong>{scores.clarity.toFixed(1)}</strong>
                  </div>
                  <div className="score-row">
                    <span>Coesao</span>
                    <strong>{scores.cohesion.toFixed(1)}</strong>
                  </div>
                  <div className="score-row">
                    <span>Argumentacao</span>
                    <strong>{scores.argumentation.toFixed(1)}</strong>
                  </div>
                </div>
                <ul className="insight-list">
                  <li>{readiness >= 75 ? "Entrada editorial competitiva para triagem inicial." : "A entrada ainda pode parecer mais fraca do que o manuscrito realmente e."}</li>
                  <li>{weakClaims.length > 0 ? `${weakClaims.length} trecho(s) pedem sustentacao adicional ou prudencia formular.` : "Nenhum trecho critico foi sinalizado pela heuristica local."}</li>
                  <li>{scores.cohesion >= 6.7 ? "A progressao entre blocos se mantem coerente." : "Vale reforcar transicoes entre secoes e fechamento analitico."}</li>
                </ul>
              </div>
            ) : null}
          </section>

          <section className="inspector-card">
            <button className="accordion-head" onClick={() => toggleAccordion("references")} type="button">
              <span>Referencias Inteligentes</span>
              <strong>{openAccordions.references ? "−" : "+"}</strong>
            </button>
            {openAccordions.references ? (
              <div className="accordion-body">
                <div className="reference-callout">
                  <strong>{weakClaims.length > 0 ? `${weakClaims.length} citacoes relevantes a validar` : "Base argumentativa em faixa estavel"}</strong>
                  <p>
                    O painel usa sinais do proprio manuscrito para estimar onde referencias ou precisao metodologica tendem a fortalecer o texto.
                  </p>
                </div>
                <ul className="insight-list">
                  <li>Revise trechos com dados numericos sem fonte explicita.</li>
                  <li>Evite afirmacoes universais sem apoio bibliografico.</li>
                  <li>Priorize referencias nas secoes de resultados e discussao.</li>
                </ul>
              </div>
            ) : null}
          </section>

          <section className="inspector-card">
            <button className="accordion-head" onClick={() => toggleAccordion("submission")} type="button">
              <span>Pronto para Submissao</span>
              <strong>{openAccordions.submission ? "−" : "+"}</strong>
            </button>
            {openAccordions.submission ? (
              <div className="accordion-body">
                <div className="submission-meter">
                  <div className="submission-meter__track">
                    <span style={{ width: `${readiness}%` }} />
                  </div>
                  <div className="submission-meter__meta">
                    <strong>{readiness}%</strong>
                    <span>Risco editorial {risk}</span>
                  </div>
                </div>
                <div className="checklist compact">
                  {submissionChecklist.map((item) => (
                    <div className="check-item" key={item.label}>
                      <span className={`check-bullet ${item.done ? "done" : "todo"}`}>{item.done ? "✓" : "•"}</span>
                      <span>{item.label}</span>
                    </div>
                  ))}
                </div>
                {submissionMode ? (
                  <p className="submission-note">
                    Modo submissao ativo: a interface passa a enfatizar fechamento, consistencia formal e aderencia editorial.
                  </p>
                ) : null}
              </div>
            ) : null}
          </section>

          <section className="inspector-card">
            <button className="accordion-head" onClick={() => toggleAccordion("actions")} type="button">
              <span>Proxima Acao</span>
              <strong>{openAccordions.actions ? "−" : "+"}</strong>
            </button>
            {openAccordions.actions ? (
              <div className="accordion-body">
                <ul className="action-list">
                  <li className="action-item action-item-primary">
                    <strong>{nextStep.title}</strong>
                    <p>{nextStep.description}</p>
                  </li>
                  <li className="action-item">
                    <strong>Revisar a camada de resultados</strong>
                    <p>Fortaleca o vinculo entre achados, sustentacao empirica e interpretacao final.</p>
                  </li>
                  <li className="action-item">
                    <strong>Conferir resumo e palavras-chave</strong>
                    <p>Essa entrada continua sendo uma das areas com maior impacto na triagem editorial.</p>
                  </li>
                </ul>
              </div>
            ) : null}
          </section>
        </aside>
      </div>

      <section className="bottom-grid">
        <article className="surface-card">
          <div className="surface-card__head">
            <div>
              <span className="section-kicker">Radar Editorial</span>
              <h2>Rotas de submissao sugeridas</h2>
            </div>
          </div>
          <div className="journal-list">
            {journals.map((journal) => (
              <article className="journal-card" key={journal.name}>
                <div>
                  <strong>{journal.name}</strong>
                  <p>{journal.rationale}</p>
                </div>
                <span className={`fit-tag fit-${journal.fit}`}>{journal.fit === "alto" ? "melhor aderencia" : journal.fit === "medio" ? "exige ajuste" : "rota de reserva"}</span>
              </article>
            ))}
          </div>
        </article>

        <article className="surface-card">
          <div className="surface-card__head">
            <div>
              <span className="section-kicker">Resumo da Triagem</span>
              <h2>Panorama de prontidao</h2>
            </div>
          </div>
          <div className="triage-grid">
            <div className="triage-stat">
              <strong>{summaryChecklist.filter((item) => item.done).length}</strong>
              <span>itens do resumo fechados</span>
            </div>
            <div className="triage-stat">
              <strong>{submissionChecklist.filter((item) => item.done).length}</strong>
              <span>criterios de submissao atendidos</span>
            </div>
            <div className="triage-stat">
              <strong>{Math.max(0, 4 - weakClaims.length)}</strong>
              <span>margem de seguranca argumentativa</span>
            </div>
          </div>
          <div className="triage-summary">
            <p>
              {risk === "alto"
                ? "O manuscrito ainda transmite fragilidades perceptiveis de entrada ou sustentacao. Vale amadurecer o texto antes de tratar a submissao como proximo passo."
                : risk === "medio"
                  ? "Ha base consistente para avancar, mas o texto ainda pede revisao dirigida em pontos que influenciam diretamente a leitura da triagem."
                  : "O texto ja entrou numa faixa mais segura. O foco agora passa a ser aderencia ao periodico e fechamento formal."}
            </p>
          </div>
        </article>
      </section>

      <style jsx>{`
        .page {
          display: grid;
          gap: 22px;
          padding: 28px 0 56px;
          color: #123040;
        }

        .status-rail,
        .document-stage,
        .surface-card,
        .inspector-card {
          border: 1px solid rgba(202, 214, 223, 0.92);
          box-shadow: 0 18px 42px rgba(15, 23, 42, 0.06);
        }

        .status-rail {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 16px;
          flex-wrap: wrap;
          padding: 14px 18px;
          border-radius: 18px;
          background: linear-gradient(180deg, rgba(255, 255, 255, 0.96), rgba(248, 251, 252, 0.92));
        }

        .status-rail__left,
        .status-rail__right,
        .tag-row,
        .toolbar,
        .next-step__actions {
          display: flex;
          align-items: center;
          gap: 10px;
          flex-wrap: wrap;
        }

        .context-pill,
        .tag,
        .readiness-chip,
        .fit-tag {
          display: inline-flex;
          align-items: center;
          min-height: 32px;
          padding: 0 12px;
          border-radius: 999px;
          font-size: 12px;
          font-weight: 800;
          border: 1px solid rgba(202, 214, 223, 0.9);
          background: rgba(255, 255, 255, 0.82);
        }

        .context-pill-primary {
          color: #0f766e;
          background: rgba(221, 250, 244, 0.98);
          border-color: rgba(95, 196, 178, 0.28);
        }

        .readiness-chip {
          color: #0f766e;
          background: rgba(239, 252, 249, 0.98);
        }

        .readiness-chip-alto {
          color: #9a3412;
          background: rgba(255, 237, 213, 0.98);
        }

        .readiness-chip-medio {
          color: #9a6700;
          background: rgba(255, 244, 206, 0.98);
        }

        .ghost-link {
          font-size: 13px;
          font-weight: 700;
          color: #225c70;
        }

        .workspace {
          display: grid;
          grid-template-columns: minmax(0, 1.72fr) minmax(320px, 0.68fr);
          gap: 22px;
          align-items: start;
        }

        .document-stage,
        .surface-card,
        .inspector-card {
          background: linear-gradient(180deg, rgba(255, 255, 255, 0.98), rgba(249, 251, 252, 0.96));
          border-radius: 24px;
        }

        .document-stage {
          display: grid;
          gap: 22px;
          padding: 26px;
        }

        .document-header {
          display: grid;
          grid-template-columns: minmax(0, 1fr) minmax(280px, 320px);
          gap: 18px;
          align-items: start;
        }

        .document-header__copy {
          display: grid;
          gap: 16px;
        }

        h1,
        h2 {
          margin: 0;
          letter-spacing: -0.045em;
        }

        h1 {
          font-size: clamp(2.75rem, 4.2vw, 4.4rem);
          line-height: 0.96;
          font-family: var(--editor-display, "Iowan Old Style", "Book Antiqua", Georgia, serif);
          color: #123040;
          text-wrap: balance;
        }

        h2 {
          font-size: 1.9rem;
          line-height: 1.02;
        }

        .hero-metrics {
          display: grid;
          grid-template-columns: repeat(3, minmax(0, 1fr));
          gap: 10px;
        }

        .hero-metrics article,
        .triage-stat {
          display: grid;
          gap: 4px;
          padding: 16px 14px;
          border-radius: 18px;
          border: 1px solid rgba(216, 226, 233, 0.95);
          background: rgba(247, 250, 252, 0.96);
        }

        .hero-metrics strong,
        .triage-stat strong {
          font-size: 1.65rem;
          line-height: 1;
        }

        .hero-metrics span,
        .triage-stat span,
        .section-kicker {
          font-size: 0.78rem;
          letter-spacing: 0.11em;
          text-transform: uppercase;
          color: #5a7180;
          font-weight: 800;
        }

        .next-step {
          display: grid;
          grid-template-columns: minmax(0, 1fr) auto;
          gap: 18px;
          align-items: end;
          padding: 18px 20px;
          border-radius: 20px;
          background: linear-gradient(135deg, #f6fbfb 0%, #ecf7f4 100%);
          border: 1px solid rgba(182, 219, 213, 0.86);
        }

        .next-step strong {
          display: block;
          margin: 6px 0 8px;
          font-size: 1.35rem;
          line-height: 1.08;
        }

        .next-step p,
        .abstract-box,
        .weak-card__reason,
        .inspector-card p,
        .journal-card p,
        .triage-summary p,
        .submission-note,
        .collapsed-state,
        .action-item p {
          margin: 0;
          color: #5d7482;
          font-size: 14px;
          line-height: 1.72;
        }

        .toolbar {
          padding: 10px 14px;
          border-radius: 20px;
          border: 1px solid rgba(211, 220, 228, 0.95);
          background: rgba(255, 255, 255, 0.98);
          overflow-x: auto;
          flex-wrap: nowrap;
        }

        .toolbar-button,
        .button {
          border: 1px solid rgba(202, 214, 223, 0.94);
          background: rgba(255, 255, 255, 0.94);
          color: #15384b;
          border-radius: 999px;
          min-height: 42px;
          padding: 0 16px;
          font-size: 14px;
          font-weight: 800;
          transition: background 180ms ease, transform 180ms ease, box-shadow 180ms ease;
        }

        .toolbar-button {
          min-height: 38px;
          white-space: nowrap;
          font-size: 13px;
        }

        .toolbar-button:hover,
        .button:hover {
          transform: translateY(-1px);
          box-shadow: 0 12px 22px rgba(15, 23, 42, 0.08);
        }

        .toolbar-button-accent {
          background: rgba(226, 250, 245, 0.98);
          border-color: rgba(95, 196, 178, 0.3);
          color: #0f766e;
        }

        .button-primary {
          background: linear-gradient(135deg, #195d76 0%, #1e7d7a 100%);
          color: white;
          border-color: transparent;
        }

        .button-secondary {
          background: rgba(255, 255, 255, 0.9);
        }

        .document-shell {
          position: relative;
          display: grid;
          grid-template-columns: 62px minmax(0, 1fr);
          min-height: 860px;
          border-radius: 24px;
          border: 1px solid rgba(211, 220, 228, 0.95);
          background:
            linear-gradient(90deg, rgba(249, 251, 252, 0.98) 0 62px, rgba(255, 255, 255, 0.985) 62px 100%);
          overflow: hidden;
        }

        .document-shell__guide {
          border-right: 1px solid rgba(221, 229, 235, 0.96);
          background:
            linear-gradient(180deg, rgba(247, 250, 252, 0.98), rgba(243, 248, 250, 0.98));
        }

        .document-editor {
          padding: 64px 72px 72px;
          outline: none;
          font-family: var(--editor-display, "Iowan Old Style", "Book Antiqua", Georgia, serif);
          color: #183543;
          line-height: 1.74;
          font-size: 1.18rem;
        }

        .document-editor :global(h2) {
          margin: 0 0 20px;
          padding-top: 26px;
          border-top: 1px solid rgba(220, 228, 233, 0.96);
          font-size: 2rem;
          line-height: 1.04;
          letter-spacing: -0.03em;
          font-family: var(--editor-display, "Iowan Old Style", "Book Antiqua", Georgia, serif);
          color: #153545;
        }

        .document-editor :global(h2:first-child) {
          padding-top: 0;
          border-top: none;
        }

        .document-editor :global(h3) {
          margin: 28px 0 10px;
          font-size: 1.35rem;
          color: #173b4e;
          font-family: var(--editor-sans, var(--font-sans), "Segoe UI", sans-serif);
        }

        .document-editor :global(p) {
          margin: 0 0 24px;
        }

        .document-editor :global(.lead-paragraph) {
          font-size: 1.2rem;
          line-height: 1.8;
          color: #26465a;
        }

        .document-editor :global(blockquote) {
          margin: 0 0 24px;
          padding: 0 0 0 18px;
          border-left: 3px solid rgba(80, 159, 151, 0.52);
          color: #406172;
        }

        .document-editor :global(ul),
        .document-editor :global(ol) {
          margin: 0 0 24px 20px;
          padding: 0 0 0 18px;
        }

        .document-editor :global(a) {
          color: #16627c;
          text-decoration: underline;
        }

        .support-grid,
        .bottom-grid {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 18px;
        }

        .surface-card,
        .inspector-card {
          padding: 22px;
        }

        .surface-card {
          display: grid;
          gap: 18px;
        }

        .surface-card__head {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          gap: 16px;
        }

        .abstract-box {
          padding: 18px 18px 2px;
          border-radius: 18px;
          border: 1px solid rgba(221, 229, 235, 0.96);
          background: rgba(248, 251, 252, 0.94);
          white-space: pre-wrap;
        }

        .checklist,
        .journal-list,
        .weak-claims,
        .action-list {
          display: grid;
          gap: 12px;
        }

        .checklist.compact {
          gap: 10px;
        }

        .check-item {
          display: flex;
          gap: 10px;
          align-items: flex-start;
          color: #264455;
          font-size: 14px;
          line-height: 1.55;
        }

        .check-bullet {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          width: 20px;
          height: 20px;
          border-radius: 999px;
          flex: 0 0 20px;
          margin-top: 1px;
          font-size: 12px;
          font-weight: 900;
        }

        .check-bullet.done {
          background: rgba(222, 250, 240, 0.98);
          color: #0f766e;
        }

        .check-bullet.todo {
          background: rgba(236, 241, 244, 0.98);
          color: #6a8290;
        }

        .weak-card,
        .journal-card,
        .action-item,
        .reference-callout {
          padding: 16px;
          border-radius: 18px;
          border: 1px solid rgba(221, 229, 235, 0.96);
          background: rgba(255, 255, 255, 0.94);
        }

        .weak-card-ok {
          background: linear-gradient(180deg, rgba(245, 252, 249, 0.98), rgba(240, 249, 245, 0.96));
        }

        .weak-card__head,
        .journal-card,
        .accordion-head,
        .score-row {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          gap: 12px;
        }

        .weak-card__sentence {
          margin: 8px 0;
          color: #19394b;
          font-weight: 600;
          line-height: 1.6;
        }

        .severity {
          display: inline-flex;
          align-items: center;
          min-height: 28px;
          padding: 0 10px;
          border-radius: 999px;
          font-size: 11px;
          font-weight: 800;
          text-transform: uppercase;
          letter-spacing: 0.08em;
        }

        .severity-moderada {
          background: rgba(255, 243, 209, 0.98);
          color: #9a6700;
        }

        .severity-elevada {
          background: rgba(255, 232, 232, 0.98);
          color: #b42318;
        }

        .collapsed-state,
        .submission-note {
          padding: 16px;
          border-radius: 16px;
          border: 1px dashed rgba(211, 220, 228, 0.98);
          background: rgba(248, 251, 252, 0.94);
        }

        .inspector {
          display: grid;
          gap: 16px;
          position: sticky;
          top: 96px;
        }

        .inspector-card {
          display: grid;
          gap: 14px;
        }

        .inspector-card-hero {
          background: linear-gradient(180deg, rgba(250, 252, 253, 0.99), rgba(243, 248, 250, 0.96));
        }

        .accordion-head {
          width: 100%;
          padding: 0;
          border: none;
          background: transparent;
          color: #15384b;
          font-size: 1rem;
          font-weight: 800;
          text-align: left;
        }

        .accordion-body,
        .score-list,
        .triage-grid {
          display: grid;
          gap: 12px;
        }

        .score-row {
          padding-bottom: 10px;
          border-bottom: 1px solid rgba(229, 235, 239, 0.98);
          font-size: 14px;
          color: #264455;
        }

        .score-row:last-child {
          border-bottom: none;
          padding-bottom: 0;
        }

        .score-row strong {
          font-size: 1.1rem;
        }

        .insight-list {
          display: grid;
          gap: 10px;
          margin: 0;
          padding: 0;
          list-style: none;
          color: #375265;
          font-size: 14px;
          line-height: 1.65;
        }

        .insight-list li {
          padding-top: 10px;
          border-top: 1px solid rgba(229, 235, 239, 0.98);
        }

        .insight-list li:first-child {
          padding-top: 0;
          border-top: none;
        }

        .submission-meter {
          display: grid;
          gap: 10px;
        }

        .submission-meter__track {
          width: 100%;
          height: 10px;
          border-radius: 999px;
          background: rgba(230, 236, 241, 0.98);
          overflow: hidden;
        }

        .submission-meter__track span {
          display: block;
          height: 100%;
          border-radius: inherit;
          background: linear-gradient(90deg, #4aa89a 0%, #195d76 100%);
        }

        .submission-meter__meta {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
          font-size: 14px;
          color: #3d596a;
        }

        .action-item-primary {
          background: linear-gradient(180deg, rgba(241, 249, 248, 0.98), rgba(236, 245, 244, 0.98));
        }

        .action-item strong,
        .reference-callout strong,
        .journal-card strong {
          display: block;
          margin-bottom: 6px;
          font-size: 15px;
          color: #143447;
        }

        .fit-alto {
          color: #0f766e;
          background: rgba(222, 250, 240, 0.98);
        }

        .fit-medio {
          color: #9a6700;
          background: rgba(255, 243, 209, 0.98);
        }

        .fit-reserva {
          color: #5f7280;
          background: rgba(236, 241, 244, 0.98);
        }

        .triage-grid {
          grid-template-columns: repeat(3, minmax(0, 1fr));
        }

        @media (max-width: 1180px) {
          .workspace,
          .support-grid,
          .bottom-grid,
          .document-header,
          .next-step {
            grid-template-columns: 1fr;
          }

          .inspector {
            position: static;
          }
        }

        @media (max-width: 820px) {
          .page {
            padding: 18px 0 40px;
          }

          .document-stage {
            padding: 18px;
          }

          .document-shell {
            grid-template-columns: 18px minmax(0, 1fr);
            min-height: 620px;
          }

          .document-editor {
            padding: 34px 24px 36px;
            font-size: 1.04rem;
          }

          .hero-metrics,
          .triage-grid {
            grid-template-columns: 1fr;
          }
        }
      `}</style>
    </div>
  );
}

function runEditorCommand(
  command: string,
  editorRef: { current: HTMLDivElement | null },
  value?: string
) {
  editorRef.current?.focus();
  const richDocument = document as Document & {
    execCommand?: (commandId: string, showUI?: boolean, value?: string) => boolean;
  };

  richDocument.execCommand?.(command, false, value);
}
