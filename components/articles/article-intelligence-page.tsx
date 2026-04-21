"use client";

import { useMemo, useRef, useState } from "react";

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

type CognitiveSignal = {
  title: string;
  detail: string;
  tone: "stable" | "watch" | "critical";
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
    /\b(comprova|demonstra|evidencia|prova|sem dúvida|inegavelmente|claramente|todos|sempre|nunca|necessariamente|definitivamente|revela de forma inequívoca)\b/i;
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
          ? "O trecho contém dado quantitativo sem sinal explícito de fonte ou ancoragem bibliográfica."
          : "A formulação assume tom assertivo forte sem sustentação aparente no próprio período."
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
      /\b(portanto|além disso|por outro lado|nesse sentido|assim|contudo|todavia|desse modo|em contrapartida|logo|por fim|ademais|de outro lado|em seguida)\b/gi
    ) ?? []
  ).length;
  const citationCount = (
    text.match(/\(([^)]*(19|20)\d{2}[^)]*)\)|\[[0-9,\s\-]+\]|et al\.?/gi) ?? []
  ).length;
  const methodologySignals = (
    text.match(
      /\b(método|metodologia|amostra|participantes|análise|analise|procedimento|instrumento|coleta|dados|resultados|discussão|discussao|delineamento)\b/gi
    ) ?? []
  ).length;

  let clarity = 7.3;
  if (averageSentenceLength > 30) {
    clarity -= 1.2;
  } else if (averageSentenceLength > 24) {
    clarity -= 0.6;
  }

  if (paragraphs.length >= 5) {
    clarity += 0.2;
  }

  if (text.length < 2500) {
    clarity -= 0.5;
  }

  let cohesion = 6.7;
  cohesion += Math.min(transitionCount * 0.13, 1.1);
  if (paragraphs.length < 4) {
    cohesion -= 0.6;
  }
  if (paragraphs.length > 10) {
    cohesion += 0.3;
  }

  let argumentation = 6.2;
  argumentation += Math.min(citationCount * 0.08, 1.2);
  argumentation += Math.min(methodologySignals * 0.05, 0.7);
  argumentation -= weakClaims.length * 0.3;

  return {
    clarity: Number(clamp(clarity, 4.8, 9.4).toFixed(1)),
    cohesion: Number(clamp(cohesion, 4.8, 9.4).toFixed(1)),
    argumentation: Number(clamp(argumentation, 4.8, 9.4).toFixed(1))
  };
}

function improveAbstractFromText(text: string) {
  const paragraphs = splitIntoParagraphs(text);
  const abstract = detectInitialAbstract(text);
  const lowerCaseText = text.toLowerCase();
  const objectiveHint =
    paragraphs.find((paragraph) =>
      /\b(objetivo|objetivou|visa|pretende|busca analisar|analisa)\b/i.test(paragraph)
    ) ?? "";
  const methodHint =
    paragraphs.find((paragraph) =>
      /\b(método|metodologia|amostra|participantes|análise|analise|procedimento|estudo)\b/i.test(
        paragraph
      )
    ) ?? "";
  const resultHint =
    paragraphs.find((paragraph) =>
      /\b(resultado|resultados|evidenciou|indicou|apontou|revelou|mostrou)\b/i.test(paragraph)
    ) ?? "";
  const discussionHint =
    paragraphs.find((paragraph) =>
      /\b(conclusão|conclusao|implicações|implicacoes|discussão|discussao|sugere)\b/i.test(
        paragraph
      )
    ) ?? "";

  const area =
    /\bsaúde|saude|pandemia|psicologia|epidemiologia|cuidado\b/i.test(lowerCaseText)
      ? "no campo da saúde e das ciências humanas"
      : "no campo acadêmico em questão";

  const objectiveSentence = objectiveHint
    ? `O presente estudo tem por objetivo ${normalizeWhitespace(
        objectiveHint
          .replace(/^.*?\b(objetivo|objetivou|visa|pretende|busca analisar|analisa)\b/i, "")
          .replace(/\.+$/, "")
      ).toLowerCase()}.`
    : `O presente manuscrito examina um problema relevante ${area}, buscando delimitar seu objeto, sua inscrição institucional e suas implicações analíticas.`;

  const methodSentence = methodHint
    ? `Do ponto de vista metodológico, o manuscrito mobiliza ${normalizeWhitespace(
        methodHint.replace(/\.+$/, "")
      ).toLowerCase()}.`
    : "Em termos metodológicos, o texto articula leitura analítica e base empírica com atenção à consistência entre objetivo, método e discussão.";

  const resultSentence = resultHint
    ? `Os achados indicam que ${normalizeWhitespace(
        resultHint
          .replace(/^.*?\b(resultado|resultados|evidenciou|indicou|apontou|revelou|mostrou)\b/i, "")
          .replace(/\.+$/, "")
      ).toLowerCase()}.`
    : "Os resultados sugerem que o fenômeno investigado exige leitura contextual, relacional e teoricamente sustentada para evitar simplificações interpretativas.";

  const finalSentence = discussionHint
    ? `Em síntese, ${normalizeWhitespace(
        discussionHint
          .replace(/^.*?\b(conclusão|conclusao|implicações|implicacoes|discussão|discussao|sugere)\b/i, "")
          .replace(/\.+$/, "")
      ).toLowerCase()}.`
    : "Conclui-se que o estudo contribui para qualificar o debate, oferecendo elementos consistentes para aprofundamento teórico, metodológico e institucional.";

  const improved = [objectiveSentence, methodSentence, resultSentence, finalSentence]
    .map((sentence) => sentence.replace(/\s+/g, " ").trim())
    .join(" ");

  return improved.length > 120 ? improved : abstract;
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

  if (!/\b(objetivo|método|metodologia|resultado|resultados|conclui|conclusão|conclusao)\b/i.test(abstractText)) {
    readiness -= 6;
  }

  return Math.round(clamp(readiness, 38, 94));
}

function getRiskLabel(readiness: number) {
  if (readiness < 60) {
    return "alto";
  }
  if (readiness < 75) {
    return "médio";
  }
  return "baixo";
}

function getNextStep(readiness: number, weakClaims: WeakClaim[], abstractText: string) {
  if (abstractText.length < 450) {
    return {
      title: "Consolidar um resumo com densidade editorial",
      description:
        "A entrada do texto ainda não traduz, com segurança, a qualidade do manuscrito. Reescrever o resumo costuma melhorar de imediato a leitura da triagem editorial.",
      action: "Gerar nova versão do resumo"
    };
  }

  if (weakClaims.length > 0) {
    return {
      title: "Reforçar trechos com sustentação insuficiente",
      description:
        "Há afirmações relevantes que ainda pedem marca mais explícita de fonte, prudência argumentativa ou densidade metodológica.",
      action: "Revisar trechos frágeis"
    };
  }

  if (readiness < 75) {
    return {
      title: "Refinar a costura argumentativa",
      description:
        "O manuscrito já possui base consistente, mas ainda pode ganhar em progressão analítica, transição entre blocos e fechamento das seções centrais.",
      action: "Revisar estrutura final"
    };
  }

  return {
    title: "Preparar a submissão",
    description:
      "O manuscrito se encontra em faixa competitiva para avaliação inicial. O próximo passo é validar escopo, consistência formal e checklist de envio.",
    action: "Entrar no modo submissão"
  };
}

function suggestJournals(text: string): JournalSuggestion[] {
  const lowerCaseText = text.toLowerCase();

  if (/\bsaúde|saude|pandemia|política pública|politica publica|epidemiologia|cuidado\b/.test(lowerCaseText)) {
    return [
      {
        name: "Saúde em Debate",
        fit: "alto",
        rationale:
          "Boa aderência a discussões críticas, institucionais e de política em saúde."
      },
      {
        name: "Interface – Comunicação, Saúde, Educação",
        fit: "medio",
        rationale:
          "Compatível com manuscritos interdisciplinares que articulam saúde, educação e experiência social."
      },
      {
        name: "Physis: Revista de Saúde Coletiva",
        fit: "reserva",
        rationale:
          "Alternativa consistente para uma versão mais amadurecida e teoricamente densificada."
      }
    ];
  }

  if (/\bpsicologia|subjetividade|saúde mental|sofrimento psíquico\b/.test(lowerCaseText)) {
    return [
      {
        name: "Psicologia & Sociedade",
        fit: "alto",
        rationale:
          "Aderente a análises psicossociais e críticas sobre experiência, desigualdade e instituições."
      },
      {
        name: "Estudos de Psicologia",
        fit: "medio",
        rationale:
          "Boa possibilidade, desde que o texto apresente amarração metodológica bastante clara."
      },
      {
        name: "Fractal: Revista de Psicologia",
        fit: "reserva",
        rationale:
          "Pode funcionar bem em versão mais lapidada do ponto de vista discursivo."
      }
    ];
  }

  return [
    {
      name: "Revista interdisciplinar de escopo analítico",
      fit: "alto",
      rationale:
        "Boa compatibilidade com manuscritos de abordagem ampla, problema bem delimitado e articulação entre áreas."
    },
    {
      name: "Periódico temático com foco metodológico",
      fit: "medio",
      rationale:
        "Viável caso o artigo explicite com maior precisão desenho analítico, corpus e trajetória argumentativa."
    },
    {
      name: "Revista de reserva estratégica",
      fit: "reserva",
      rationale:
        "Alternativa prudente para segunda rodada, após ganho de densidade textual e revisão dirigida."
    }
  ];
}

function getCognitiveSignals(text: string, abstractText: string, weakClaims: WeakClaim[], scores: Scores) {
  const paragraphs = splitIntoParagraphs(text);
  const sentences = splitIntoSentences(text);
  const averageSentenceLength =
    sentences.length > 0
      ? sentences.reduce((accumulator, sentence) => accumulator + sentence.split(/\s+/).length, 0) /
        sentences.length
      : 0;
  const methodologyPresence = /\b(método|metodologia|amostra|participantes|delineamento|procedimento)\b/i.test(
    text
  );
  const conclusionPresence = /\b(conclusão|conclusao|conclui|sugere|implicações|implicacoes)\b/i.test(
    text
  );

  const signals: CognitiveSignal[] = [
    {
      title: "Entrada editorial",
      detail:
        abstractText.length >= 450
          ? "O resumo já apresenta densidade suficiente para apoiar triagem inicial sem perda imediata de contexto."
          : "O resumo ainda resume demais. Há risco de o manuscrito parecer menos robusto do que realmente é na primeira leitura.",
      tone: abstractText.length >= 450 ? "stable" : "critical"
    },
    {
      title: "Respiração sintática",
      detail:
        averageSentenceLength <= 24
          ? "As sentenças permanecem em faixa legível e favorecem absorção progressiva do argumento."
          : "Os períodos estão mais longos do que o ideal e podem reduzir clareza em leitura editorial acelerada.",
      tone: averageSentenceLength <= 24 ? "stable" : "watch"
    },
    {
      title: "Ancoragem metodológica",
      detail: methodologyPresence
        ? "O texto já oferece sinais metodológicos suficientes para sustentar a leitura da proposta."
        : "A camada metodológica ainda aparece de forma tímida e tende a enfraquecer a confiança na argumentação.",
      tone: methodologyPresence ? "stable" : "critical"
    },
    {
      title: "Fechamento analítico",
      detail: conclusionPresence
        ? "Há sinal de fechamento interpretativo e implicação analítica reconhecível no corpo do manuscrito."
        : "O manuscrito ainda pede fechamento mais explícito entre resultados, interpretação e implicações.",
      tone: conclusionPresence ? "stable" : "watch"
    },
    {
      title: "Pressão de sustentação",
      detail:
        weakClaims.length === 0
          ? "Nenhum trecho crítico foi sinalizado pela leitura heurística local."
          : `Foram localizados ${weakClaims.length} trechos com provável necessidade de prudência formular, citação ou reforço argumentativo.`,
      tone: weakClaims.length === 0 ? "stable" : weakClaims.length >= 4 ? "critical" : "watch"
    }
  ];

  if (paragraphs.length < 4 || scores.cohesion < 6.5) {
    signals.push({
      title: "Encadeamento entre blocos",
      detail:
        "A progressão entre seções ainda parece comprimida. Vale reforçar transições e explicitar como cada parte empurra a tese adiante.",
      tone: "watch"
    });
  }

  return signals.slice(0, 6);
}

function formatSyncLabel(value?: string) {
  if (!value) {
    return "Sincronização ainda não registrada";
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

export function ArticleIntelligencePage({
  title,
  areaLabel = "Pós-graduação e pesquisa",
  stageLabel = "Em revisão editorial",
  manuscriptText,
  googleDocsUrl,
  lastSyncAt
}: ArticleIntelligencePageProps) {
  const diagnosticsRef = useRef<HTMLDivElement | null>(null);
  const initialAbstract = useMemo(() => detectInitialAbstract(manuscriptText), [manuscriptText]);
  const weakClaims = useMemo(() => detectWeakClaims(manuscriptText), [manuscriptText]);
  const scores = useMemo(() => calculateScores(manuscriptText, weakClaims), [manuscriptText, weakClaims]);
  const journals = useMemo(() => suggestJournals(manuscriptText), [manuscriptText]);
  const [generatedAbstract, setGeneratedAbstract] = useState(initialAbstract);
  const [showWeakClaims, setShowWeakClaims] = useState(false);
  const [submissionMode, setSubmissionMode] = useState(false);

  const readiness = useMemo(
    () => computeReadiness(scores, weakClaims, generatedAbstract),
    [generatedAbstract, scores, weakClaims]
  );
  const nextStep = useMemo(
    () => getNextStep(readiness, weakClaims, generatedAbstract),
    [generatedAbstract, readiness, weakClaims]
  );
  const risk = useMemo(() => getRiskLabel(readiness), [readiness]);
  const readinessTone = readiness >= 75 ? "ready" : readiness >= 60 ? "steady" : "fragile";
  const lastSyncLabel = useMemo(() => formatSyncLabel(lastSyncAt), [lastSyncAt]);
  const cognitiveSignals = useMemo(
    () => getCognitiveSignals(manuscriptText, generatedAbstract, weakClaims, scores),
    [generatedAbstract, manuscriptText, scores, weakClaims]
  );

  const summaryChecklist = [
    {
      done: generatedAbstract.length >= 450,
      label: "Resumo com densidade compatível com leitura editorial inicial."
    },
    {
      done: /\b(objetivo|objetiv)/i.test(generatedAbstract),
      label: "Objetivo explicitado com precisão."
    },
    {
      done: /\b(método|metodologia|procedimento|amostra|participantes)\b/i.test(generatedAbstract),
      label: "Método ou delineamento minimamente indicado."
    },
    {
      done: /\b(resultado|resultados|achados|indicam|sugerem)\b/i.test(generatedAbstract),
      label: "Achados ou direção interpretativa apresentados."
    },
    {
      done: /\b(conclui|conclusão|conclusao|contribui)\b/i.test(generatedAbstract),
      label: "Fechamento com implicação analítica ou institucional."
    }
  ];

  function handleGenerateAbstract() {
    setGeneratedAbstract(improveAbstractFromText(manuscriptText));
  }

  function handleScrollToDiagnostics() {
    diagnosticsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function handleNextStep() {
    if (nextStep.action.includes("resumo")) {
      handleGenerateAbstract();
      return;
    }

    if (nextStep.action.includes("trechos")) {
      setShowWeakClaims(true);
      return;
    }

    if (nextStep.action.includes("submissão")) {
      setSubmissionMode(true);
      return;
    }

    handleScrollToDiagnostics();
  }

  return (
    <div className="page">
      <section className="hero">
        <div className="hero-content">
          <div className="eyebrow-row">
            <span className="pill pill-primary">Inteligência editorial</span>
            <span className="pill pill-soft">{areaLabel}</span>
            <span className="pill pill-success">{stageLabel}</span>
          </div>

          <h1>{title}</h1>

          <p className="lead">
            Uma mesa editorial assistiva para leitura técnica, diagnóstico argumentativo e
            preparação de submissão. Em vez de distribuir métricas vazias, esta interface
            procura tornar visível o que já está sólido, o que ainda fragiliza o manuscrito e
            qual intervenção tende a gerar avanço real agora.
          </p>

          <div className="hero-actions">
            {googleDocsUrl ? (
              <a className="button button-primary" href={googleDocsUrl} target="_blank" rel="noreferrer">
                Abrir documento vinculado
              </a>
            ) : (
              <button className="button button-primary" type="button">
                Documento ainda não vinculado
              </button>
            )}

            <button className="button button-secondary" type="button" onClick={handleGenerateAbstract}>
              Gerar resumo editorialmente fortalecido
            </button>

            <button className="button button-secondary" type="button" onClick={handleScrollToDiagnostics}>
              Ver diagnóstico do manuscrito
            </button>

            <button
              className="button button-soft"
              type="button"
              onClick={() => setSubmissionMode((currentValue) => !currentValue)}
            >
              {submissionMode ? "Sair do modo submissão" : "Entrar no modo submissão"}
            </button>
          </div>

          <div className="sync-row">
            <span className="sync-label">Última sincronização registrada</span>
            <strong>{lastSyncLabel}</strong>
          </div>
        </div>

        <aside className="hero-aside">
          <div className="hero-aside__top">
            <span className={`tone-badge tone-${readinessTone}`}>Prontidão para submissão</span>
            <div className="readiness-value">{readiness}%</div>
            <p className="readiness-copy">
              {readiness >= 75
                ? "O manuscrito já se apresenta em faixa competitiva para triagem inicial, com necessidade de conferência final rigorosa."
                : readiness >= 60
                  ? "Há base consistente para prosseguir, mas ainda com pontos que interferem diretamente na recepção editorial."
                  : "O texto ainda transmite fragilidades visíveis na entrada, na sustentação ou na costura argumentativa."}
            </p>
          </div>

          <div className="meter">
            <span style={{ width: `${readiness}%` }} />
          </div>

          <div className="hero-stats">
            <article className="mini-stat">
              <strong>{weakClaims.length}</strong>
              <span>trechos frágeis</span>
            </article>
            <article className="mini-stat">
              <strong>{risk}</strong>
              <span>risco editorial</span>
            </article>
            <article className="mini-stat">
              <strong>{journals.length}</strong>
              <span>rotas possíveis</span>
            </article>
          </div>
        </aside>
      </section>

      <section className="next-step">
        <div className="next-step__copy">
          <span className="pill pill-dark">Próximo passo recomendado</span>
          <h2>{nextStep.title}</h2>
          <p>{nextStep.description}</p>
        </div>

        <div className="next-step__actions">
          <button className="button button-white" type="button" onClick={handleNextStep}>
            {nextStep.action}
          </button>
          <button className="button button-outline-light" type="button" onClick={handleScrollToDiagnostics}>
            Analisar fundamentos
          </button>
        </div>
      </section>

      <div className="layout">
        <main className="main-column">
          <section className="panel" ref={diagnosticsRef}>
            <div className="panel-header">
              <div>
                <span className="panel-kicker">Diagnóstico técnico</span>
                <h3>Diagnóstico do manuscrito</h3>
                <p>
                  O foco aqui é oferecer uma leitura rápida, mas intelectualmente útil, sobre
                  legibilidade, progressão argumentativa e força de sustentação.
                </p>
              </div>
              <span className="pill pill-primary">Leitura estrutural</span>
            </div>

            <div className="score-grid">
              <article className="score-card">
                <span className="score-label">Clareza</span>
                <strong>{scores.clarity.toFixed(1)}</strong>
                <p>Mede legibilidade global, extensão dos períodos e inteligibilidade da tese.</p>
              </article>

              <article className="score-card">
                <span className="score-label">Coesão</span>
                <strong>{scores.cohesion.toFixed(1)}</strong>
                <p>Estima progressão entre blocos, costura lógica e presença de conectores analíticos.</p>
              </article>

              <article className="score-card">
                <span className="score-label">Argumentação</span>
                <strong>{scores.argumentation.toFixed(1)}</strong>
                <p>Considera densidade de sustentação, sinais metodológicos e fragilidade de afirmações.</p>
              </article>
            </div>
          </section>

          <section className="panel">
            <div className="panel-header">
              <div>
                <span className="panel-kicker">Leitura cognitiva</span>
                <h3>Painel de leitura cognitiva</h3>
                <p>
                  Em vez de apenas listar pendências, este painel resume como o manuscrito tende a
                  ser percebido por uma leitura editorial exigente.
                </p>
              </div>
              <span className="pill pill-soft">Mapa de atenção</span>
            </div>

            <div className="cognition-grid">
              {cognitiveSignals.map((signal) => (
                <article key={signal.title} className={`signal-card signal-${signal.tone}`}>
                  <div className="signal-head">
                    <strong>{signal.title}</strong>
                    <span>{signal.tone === "stable" ? "estável" : signal.tone === "watch" ? "vigiar" : "crítico"}</span>
                  </div>
                  <p>{signal.detail}</p>
                </article>
              ))}
            </div>
          </section>

          <section className="panel">
            <div className="panel-header">
              <div>
                <span className="panel-kicker">Resumo</span>
                <h3>Resumo editorialmente fortalecido</h3>
                <p>
                  A versão abaixo pode ser usada como base de reescrita. O objetivo da heurística é
                  melhorar entrada, método, achados e fechamento sem transformar o texto em peça genérica.
                </p>
              </div>
              <span className="pill pill-success">Versão assistida</span>
            </div>

            <div className="abstract-box">{generatedAbstract || "Nenhum resumo detectado."}</div>

            <div className="panel-actions">
              <button className="button button-secondary" type="button" onClick={handleGenerateAbstract}>
                Regerar versão do resumo
              </button>
            </div>

            <div className="checklist">
              {summaryChecklist.map((item) => (
                <div key={item.label} className="check-item">
                  <span className={`check-bullet ${item.done ? "done" : "todo"}`}>{item.done ? "✓" : "•"}</span>
                  <span>{item.label}</span>
                </div>
              ))}
            </div>
          </section>

          <section className="panel">
            <div className="panel-header">
              <div>
                <span className="panel-kicker">Sustentação</span>
                <h3>Trechos potencialmente frágeis</h3>
                <p>
                  Esta leitura não substitui revisão acadêmica criteriosa. Ela apenas antecipa pontos em
                  que a formulação pode soar assertiva demais ou quantitativamente carregada sem apoio explícito.
                </p>
              </div>
              <span className="pill pill-warning">Pontos de atenção</span>
            </div>

            <div className="panel-actions">
              <button
                className="button button-secondary"
                type="button"
                onClick={() => setShowWeakClaims((currentValue) => !currentValue)}
              >
                {showWeakClaims ? "Ocultar trechos" : `Exibir ${weakClaims.length} trechos`}
              </button>
            </div>

            {showWeakClaims ? (
              <div className="weak-claims">
                {weakClaims.length === 0 ? (
                  <article className="weak-card weak-card-ok">
                    <strong>Nenhum trecho crítico foi sinalizado pela leitura heurística local.</strong>
                    <p>
                      Isso não elimina a necessidade de revisão acadêmica, mas sugere um nível razoável de prudência
                      formular no estado atual do texto.
                    </p>
                  </article>
                ) : (
                  weakClaims.map((claim, index) => (
                    <article key={`${claim.sentence.slice(0, 48)}-${index}`} className="weak-card">
                      <div className="weak-card__head">
                        <strong>Trecho {index + 1}</strong>
                        <span className={`severity severity-${claim.severity}`}>{claim.severity}</span>
                      </div>
                      <p className="sentence">“{claim.sentence}”</p>
                      <p className="reason">{claim.reason}</p>
                    </article>
                  ))
                )}
              </div>
            ) : (
              <div className="muted-box">
                Os trechos críticos ficam recolhidos por padrão para manter o foco na leitura global do manuscrito.
              </div>
            )}
          </section>

          <section className="panel">
            <div className="panel-header">
              <div>
                <span className="panel-kicker">Submissão</span>
                <h3>Modo submissão</h3>
                <p>
                  Quando ativado, o painel passa a enfatizar apenas critérios de fechamento e elegibilidade editorial.
                </p>
              </div>
              <span className="pill pill-soft">{submissionMode ? "Ativado" : "Disponível"}</span>
            </div>

            {submissionMode ? (
              <div className="submission-box">
                <div className="submission-checklist">
                  <div className="check-item">
                    <span className={`check-bullet ${generatedAbstract.length >= 450 ? "done" : "todo"}`}>
                      {generatedAbstract.length >= 450 ? "✓" : "•"}
                    </span>
                    <span>Resumo com densidade e fechamento compatíveis com triagem editorial.</span>
                  </div>
                  <div className="check-item">
                    <span className={`check-bullet ${weakClaims.length <= 1 ? "done" : "todo"}`}>
                      {weakClaims.length <= 1 ? "✓" : "•"}
                    </span>
                    <span>Afirmações de maior impacto revisadas quanto à sustentação.</span>
                  </div>
                  <div className="check-item">
                    <span className={`check-bullet ${scores.argumentation >= 6.8 ? "done" : "todo"}`}>
                      {scores.argumentation >= 6.8 ? "✓" : "•"}
                    </span>
                    <span>Eixo argumentativo suficientemente robusto para avaliação inicial.</span>
                  </div>
                  <div className="check-item">
                    <span className={`check-bullet ${readiness >= 75 ? "done" : "todo"}`}>
                      {readiness >= 75 ? "✓" : "•"}
                    </span>
                    <span>Patamar geral do manuscrito adequado para submissão.</span>
                  </div>
                </div>

                <div className="submission-decision">
                  <strong>Recomendação atual</strong>
                  <p>
                    {readiness >= 75
                      ? "A submissão já pode ser considerada, desde que haja conferência final de forma, referências e aderência ao periódico-alvo."
                      : "Ainda não é o melhor momento para enviar. Uma revisão dirigida do resumo, dos trechos frágeis e do fechamento analítico tende a elevar bastante a recepção editorial do manuscrito."}
                  </p>
                </div>
              </div>
            ) : (
              <div className="muted-box">
                O modo submissão ainda não está ativo. Ao acioná-lo, a interface passa a enfatizar critérios finais de consistência e elegibilidade.
              </div>
            )}
          </section>
        </main>

        <aside className="side-column">
          <section className="panel side-panel">
            <div className="panel-header">
              <div>
                <span className="panel-kicker">Decisão editorial</span>
                <h3>Painel lateral de decisão</h3>
                <p>
                  Esta área concentra o que interessa do ponto de vista prático: revisar, submeter ou interromper o fluxo para fortalecer o texto.
                </p>
              </div>
            </div>

            <div className="decision-card">
              <strong>Se o texto for enviado agora</strong>
              <p>
                {risk === "alto"
                  ? "A chance de recepção negativa é significativa, sobretudo por fragilidade de entrada e sustentação parcial."
                  : risk === "médio"
                    ? "Há base para avaliação inicial, mas ainda com pontos que tendem a reduzir a força do manuscrito perante a triagem."
                    : "O texto já se encontra em faixa mais segura, embora ainda dependa de revisão final rigorosa."}
              </p>
            </div>

            <div className="decision-card">
              <strong>Se a revisão sugerida for incorporada</strong>
              <p>
                A tendência é de melhora na apresentação global do manuscrito, na consistência do resumo e na percepção de maturidade argumentativa.
              </p>
            </div>

            <div className="risk-stack">
              <div className="risk-head">
                <span>Risco editorial atual</span>
                <strong>{risk}</strong>
              </div>
              <div className="risk-track">
                <span
                  className={risk === "alto" ? "risk-high" : risk === "médio" ? "risk-mid" : "risk-low"}
                  style={{ width: risk === "alto" ? "78%" : risk === "médio" ? "52%" : "26%" }}
                />
              </div>
            </div>
          </section>

          <section className="panel side-panel">
            <div className="panel-header">
              <div>
                <span className="panel-kicker">Rotas de submissão</span>
                <h3>Periódicos sugeridos</h3>
                <p>
                  As sugestões abaixo são indicativas e servem para orientar a reflexão estratégica sobre escopo, maturidade e aderência temática.
                </p>
              </div>
            </div>

            <div className="journal-list">
              {journals.map((journal) => (
                <article key={journal.name} className="journal-card">
                  <div>
                    <strong>{journal.name}</strong>
                    <p>{journal.rationale}</p>
                  </div>
                  <span className={`tag tag-${journal.fit}`}>
                    {journal.fit === "alto" ? "melhor aderência" : journal.fit === "medio" ? "exige ajuste" : "rota de reserva"}
                  </span>
                </article>
              ))}
            </div>
          </section>

          <section className="panel side-panel dark-panel">
            <span className="panel-kicker">Observação final</span>
            <h3>Uma leitura para orientar ação, não para decorar o problema</h3>
            <p>
              O objetivo desta página é transformar revisão difusa em decisão concreta: o que já está sólido, o que enfraquece o manuscrito e o que precisa ser feito agora para elevar a chance de uma boa recepção editorial.
            </p>
          </section>
        </aside>
      </div>

      <style jsx>{`
        .page {
          --ink: #14252d;
          --muted: #5f6f76;
          --muted-soft: #7a8a91;
          --line: rgba(18, 37, 45, 0.1);
          --line-strong: rgba(18, 37, 45, 0.16);
          --surface-strong: #ffffff;
          --accent: #0f8b8d;
          --accent-deep: #0b6c6e;
          --warm: #a26d1c;
          --success: #1d8f5f;
          background:
            radial-gradient(circle at top left, rgba(15, 139, 141, 0.08), transparent 22%),
            radial-gradient(circle at top right, rgba(162, 109, 28, 0.08), transparent 18%),
            linear-gradient(180deg, #f4f7f8 0%, #eef2f4 100%);
          color: var(--ink);
          min-height: 100vh;
          padding: 32px;
          font-family: var(--font-editor-sans, "Atkinson Hyperlegible", "Segoe UI", sans-serif);
        }

        .hero,
        .panel,
        .next-step {
          border: 1px solid var(--line);
          box-shadow: 0 18px 48px rgba(14, 27, 32, 0.08);
        }

        .hero {
          display: grid;
          gap: 28px;
          grid-template-columns: minmax(0, 1.35fr) minmax(320px, 0.88fr);
          padding: 30px;
          border-radius: 32px;
          background: linear-gradient(180deg, rgba(255, 255, 255, 0.96), rgba(251, 253, 253, 0.94));
          position: relative;
          overflow: hidden;
        }

        .hero::after {
          content: "";
          position: absolute;
          inset: auto -80px -120px auto;
          width: 260px;
          height: 260px;
          border-radius: 50%;
          background: radial-gradient(circle, rgba(15, 139, 141, 0.12), rgba(15, 139, 141, 0));
          pointer-events: none;
        }

        .hero-content,
        .hero-aside {
          position: relative;
          z-index: 1;
        }

        .eyebrow-row,
        .hero-actions,
        .panel-actions {
          display: flex;
          gap: 12px;
          flex-wrap: wrap;
        }

        h1,
        h2,
        h3 {
          font-family: var(--font-editor-serif, "Crimson Pro", Georgia, serif);
          letter-spacing: -0.035em;
          color: #10252d;
          margin: 0;
        }

        .hero-content h1 {
          margin-top: 18px;
          font-size: clamp(2.7rem, 4vw, 4.35rem);
          line-height: 0.96;
          max-width: 12ch;
        }

        .lead,
        .panel-header p,
        .next-step p,
        .decision-card p,
        .journal-card p,
        .readiness-copy,
        .score-card p,
        .signal-card p,
        .weak-card p,
        .muted-box,
        .submission-decision p,
        .dark-panel p {
          color: var(--muted);
          line-height: 1.72;
          font-size: 0.95rem;
        }

        .lead {
          margin: 18px 0 0;
          max-width: 72ch;
          font-size: 1.01rem;
        }

        .sync-row {
          margin-top: 18px;
          display: flex;
          gap: 12px;
          align-items: center;
          flex-wrap: wrap;
          font-size: 0.9rem;
          color: var(--muted-soft);
        }

        .sync-label,
        .panel-kicker,
        .score-label {
          text-transform: uppercase;
          letter-spacing: 0.08em;
          font-size: 0.72rem;
          font-weight: 800;
          color: var(--accent);
        }

        .pill,
        .tag,
        .tone-badge {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          min-height: 32px;
          padding: 0 12px;
          border-radius: 999px;
          font-size: 0.72rem;
          font-weight: 800;
          letter-spacing: 0.04em;
          text-transform: uppercase;
          border: 1px solid transparent;
          white-space: nowrap;
        }

        .pill-primary {
          background: rgba(15, 139, 141, 0.1);
          border-color: rgba(15, 139, 141, 0.16);
          color: var(--accent);
        }

        .pill-success {
          background: rgba(29, 143, 95, 0.12);
          border-color: rgba(29, 143, 95, 0.16);
          color: var(--success);
        }

        .pill-warning {
          background: rgba(162, 109, 28, 0.11);
          border-color: rgba(162, 109, 28, 0.16);
          color: var(--warm);
        }

        .pill-soft {
          background: rgba(18, 37, 45, 0.05);
          border-color: rgba(18, 37, 45, 0.08);
          color: #58686f;
        }

        .pill-dark {
          background: rgba(255, 255, 255, 0.1);
          border-color: rgba(255, 255, 255, 0.14);
          color: #ffffff;
        }

        .button {
          min-height: 48px;
          border-radius: 14px;
          padding: 0 18px;
          font-size: 0.93rem;
          font-weight: 800;
          letter-spacing: -0.01em;
          border: 1px solid transparent;
          cursor: pointer;
          transition:
            transform 180ms ease,
            border-color 180ms ease,
            background-color 180ms ease,
            color 180ms ease,
            box-shadow 180ms ease;
          text-decoration: none;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          font-family: inherit;
        }

        .button:hover {
          transform: translateY(-1px);
        }

        .button-primary {
          background: linear-gradient(135deg, var(--accent) 0%, var(--accent-deep) 100%);
          color: #ffffff;
          box-shadow: 0 14px 28px rgba(15, 139, 141, 0.18);
        }

        .button-secondary {
          background: rgba(255, 255, 255, 0.88);
          border-color: var(--line-strong);
          color: var(--ink);
        }

        .button-soft {
          background: rgba(15, 139, 141, 0.08);
          border-color: rgba(15, 139, 141, 0.12);
          color: var(--accent);
        }

        .button-white {
          background: rgba(255, 255, 255, 0.94);
          color: var(--accent-deep);
        }

        .button-outline-light {
          background: rgba(255, 255, 255, 0.05);
          border-color: rgba(255, 255, 255, 0.15);
          color: #ffffff;
        }

        .hero-aside {
          display: flex;
          flex-direction: column;
          gap: 20px;
          padding: 22px;
          border-radius: 26px;
          border: 1px solid var(--line);
          background: linear-gradient(180deg, rgba(255, 255, 255, 0.96), rgba(248, 251, 252, 0.98));
        }

        .hero-aside__top {
          display: grid;
          gap: 14px;
        }

        .tone-badge {
          width: fit-content;
        }

        .tone-ready {
          background: rgba(29, 143, 95, 0.12);
          color: var(--success);
          border-color: rgba(29, 143, 95, 0.15);
        }

        .tone-steady {
          background: rgba(162, 109, 28, 0.12);
          color: var(--warm);
          border-color: rgba(162, 109, 28, 0.16);
        }

        .tone-fragile {
          background: rgba(180, 76, 76, 0.12);
          color: #aa4a4a;
          border-color: rgba(180, 76, 76, 0.16);
        }

        .readiness-value {
          font-family: var(--font-editor-serif, "Crimson Pro", Georgia, serif);
          font-size: clamp(3.4rem, 6vw, 5.1rem);
          line-height: 0.9;
          letter-spacing: -0.07em;
        }

        .meter,
        .risk-track {
          width: 100%;
          height: 12px;
          border-radius: 999px;
          overflow: hidden;
          background: rgba(18, 37, 45, 0.08);
        }

        .meter span,
        .risk-track span {
          display: block;
          height: 100%;
          border-radius: inherit;
        }

        .meter span {
          background: linear-gradient(90deg, #6fd1c5, #0f8b8d 70%, #0b6c6e 100%);
        }

        .hero-stats {
          display: grid;
          gap: 14px;
          grid-template-columns: repeat(3, 1fr);
        }

        .mini-stat,
        .score-card,
        .signal-card,
        .decision-card,
        .journal-card,
        .weak-card,
        .abstract-box,
        .submission-box,
        .muted-box {
          border: 1px solid var(--line);
          border-radius: 18px;
          background: var(--surface-strong);
        }

        .mini-stat,
        .score-card,
        .signal-card,
        .decision-card,
        .journal-card,
        .weak-card,
        .abstract-box,
        .submission-box,
        .muted-box,
        .panel {
          padding: 18px;
        }

        .mini-stat strong,
        .score-card strong {
          display: block;
          line-height: 1;
          margin-bottom: 8px;
        }

        .mini-stat strong {
          font-size: 1.7rem;
        }

        .mini-stat span {
          color: var(--muted-soft);
          font-size: 0.8rem;
        }

        .next-step {
          margin-top: 24px;
          padding: 26px;
          border-radius: 28px;
          background: linear-gradient(135deg, #10252d 0%, #18333c 100%);
          color: #ffffff;
          display: grid;
          gap: 18px;
          grid-template-columns: minmax(0, 1fr) auto;
          align-items: end;
        }

        .next-step h2 {
          margin-top: 14px;
          font-size: clamp(2rem, 3vw, 3rem);
          line-height: 0.98;
          color: #ffffff;
          max-width: 12ch;
        }

        .next-step p {
          margin-top: 10px;
          color: rgba(255, 255, 255, 0.82);
          max-width: 68ch;
        }

        .next-step__actions {
          display: flex;
          gap: 12px;
          flex-wrap: wrap;
          justify-content: flex-end;
        }

        .layout {
          display: grid;
          grid-template-columns: minmax(0, 1.45fr) minmax(320px, 0.92fr);
          gap: 24px;
          margin-top: 24px;
          align-items: start;
        }

        .main-column,
        .side-column,
        .score-grid,
        .cognition-grid,
        .checklist,
        .weak-claims,
        .journal-list,
        .risk-stack,
        .submission-checklist {
          display: grid;
          gap: 12px;
        }

        .main-column,
        .side-column {
          gap: 24px;
        }

        .panel {
          border-radius: 26px;
          background: rgba(255, 255, 255, 0.94);
          backdrop-filter: blur(10px);
        }

        .panel-header {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          gap: 18px;
          margin-bottom: 20px;
        }

        .panel-header h3,
        .dark-panel h3 {
          font-size: clamp(1.6rem, 2.4vw, 2.1rem);
          line-height: 1.02;
        }

        .score-grid {
          grid-template-columns: repeat(3, minmax(0, 1fr));
        }

        .score-card strong {
          font-family: var(--font-editor-serif, "Crimson Pro", Georgia, serif);
          font-size: 2.3rem;
          letter-spacing: -0.05em;
        }

        .cognition-grid {
          grid-template-columns: repeat(2, minmax(0, 1fr));
        }

        .signal-head,
        .weak-card__head,
        .risk-head {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
        }

        .signal-head {
          margin-bottom: 10px;
        }

        .signal-head strong,
        .decision-card strong,
        .journal-card strong,
        .weak-card strong,
        .submission-decision strong {
          font-size: 0.95rem;
        }

        .signal-head span,
        .severity {
          font-size: 0.72rem;
          font-weight: 800;
          text-transform: uppercase;
          letter-spacing: 0.08em;
        }

        .signal-stable .signal-head span {
          color: var(--success);
        }

        .signal-watch .signal-head span,
        .severity-moderada {
          color: var(--warm);
        }

        .signal-critical .signal-head span,
        .severity-elevada {
          color: #aa4a4a;
        }

        .abstract-box {
          color: #243b43;
          white-space: pre-wrap;
          line-height: 1.9;
          font-size: 0.98rem;
        }

        .check-item {
          display: flex;
          gap: 12px;
          align-items: flex-start;
          font-size: 0.94rem;
          line-height: 1.58;
          color: #234049;
        }

        .check-bullet {
          width: 22px;
          height: 22px;
          border-radius: 999px;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          flex: 0 0 22px;
          margin-top: 1px;
          font-size: 0.74rem;
          font-weight: 900;
        }

        .check-bullet.done {
          background: rgba(29, 143, 95, 0.12);
          color: var(--success);
        }

        .check-bullet.todo {
          background: rgba(18, 37, 45, 0.07);
          color: var(--muted-soft);
        }

        .weak-card-ok {
          background: linear-gradient(180deg, rgba(246, 252, 249, 1), rgba(241, 249, 244, 1));
        }

        .sentence {
          color: #1b3139;
          font-weight: 500;
        }

        .reason {
          color: var(--muted-soft);
        }

        .submission-decision {
          margin-top: 16px;
          padding: 16px;
          border-radius: 16px;
          border: 1px solid var(--line);
          background: rgba(255, 255, 255, 0.98);
        }

        .risk-head {
          margin-bottom: 8px;
          font-size: 0.82rem;
          font-weight: 800;
          color: #223e46;
        }

        .risk-high {
          background: linear-gradient(90deg, #e6a4a4, #c14646);
        }

        .risk-mid {
          background: linear-gradient(90deg, #efd28d, #b7791f);
        }

        .risk-low {
          background: linear-gradient(90deg, #9fe0c0, #1f9d68);
        }

        .journal-card {
          display: flex;
          justify-content: space-between;
          gap: 14px;
          align-items: flex-start;
        }

        .tag-alto {
          background: rgba(29, 143, 95, 0.12);
          color: var(--success);
        }

        .tag-medio {
          background: rgba(162, 109, 28, 0.12);
          color: var(--warm);
        }

        .tag-reserva {
          background: rgba(18, 37, 45, 0.08);
          color: #5c6f76;
        }

        .dark-panel {
          background: linear-gradient(135deg, #10252d 0%, #18333c 100%);
          border-color: rgba(255, 255, 255, 0.06);
          color: #ffffff;
        }

        .dark-panel .panel-kicker {
          color: rgba(152, 225, 222, 0.88);
        }

        .dark-panel h3,
        .dark-panel p {
          color: #ffffff;
        }

        .dark-panel p {
          color: rgba(255, 255, 255, 0.8);
        }

        @media (max-width: 1180px) {
          .hero,
          .layout,
          .next-step,
          .score-grid,
          .hero-stats,
          .cognition-grid {
            grid-template-columns: 1fr;
          }

          .next-step__actions {
            justify-content: flex-start;
          }
        }

        @media (max-width: 760px) {
          .page {
            padding: 18px;
          }

          .hero,
          .panel,
          .next-step {
            padding: 20px;
            border-radius: 22px;
          }

          .hero-content h1 {
            max-width: none;
          }

          .button {
            width: 100%;
          }
        }

        @media (prefers-reduced-motion: reduce) {
          .button {
            transition: none;
          }
        }
      `}</style>
    </div>
  );
}

export default ArticleIntelligencePage;
