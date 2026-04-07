"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { Route } from "next";
import { EditorContent, JSONContent, useEditor } from "@tiptap/react";
import Placeholder from "@tiptap/extension-placeholder";
import StarterKit from "@tiptap/starter-kit";

import { exportArticleToDocx } from "@/lib/docx-export";
import { getSupabaseClient } from "@/lib/supabaseClient";
import type { ArticleContent, ArticleRow, ArticleStatus } from "@/lib/types";
import { countArticleWords, formatRelativeUpdate } from "@/lib/weblab";

type SaveState = "idle" | "saving" | "saved" | "error";

type ArticleEditorProps = {
  article: ArticleRow;
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
        content: [{ type: "paragraph", content: [{ type: "text", text: "Contextualize o tema: apresente o problema, sua relevancia social, cientifica ou institucional e situe o leitor no debate." }] }]
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
        content: [{ type: "paragraph", content: [{ type: "text", text: "Explique como o estudo se conecta ao presente, mostrando a atualidade do problema e sua relevancia analitica." }] }]
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
  { type: "heading", attrs: { level: 2 }, content: [{ type: "text", text: "Apresentacao do caso" }] },
  {
    type: "bulletList",
    content: [
      { type: "listItem", content: [{ type: "paragraph", content: [{ type: "text", text: "Contexto geral e identificacao do caso" }] }] },
      { type: "listItem", content: [{ type: "paragraph", content: [{ type: "text", text: "Historia clinica e cronologia" }] }] },
      { type: "listItem", content: [{ type: "paragraph", content: [{ type: "text", text: "Exames, hipóteses diagnósticas e conduta" }] }] },
      { type: "listItem", content: [{ type: "paragraph", content: [{ type: "text", text: "Desfecho, seguimento e situacao atual" }] }] }
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
      { type: "listItem", content: [{ type: "paragraph", content: [{ type: "text", text: "Intervencoes e comparadores" }] }] },
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

export function ArticleEditor({ article }: ArticleEditorProps) {
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

  const persistDraft = async (content: JSONContent) => {
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
    editorProps: {
      attributes: {
        class: "weblab-editor"
      }
    },
    onUpdate({ editor: currentEditor }) {
      scheduleSave(currentEditor.getJSON());
    }
  });

  useEffect(() => {
    if (!editor) {
      return;
    }

    scheduleSave(editor.getJSON());
  }, [editor, title, status]);

  useEffect(() => {
    return () => {
      if (debounceTimer.current) {
        clearTimeout(debounceTimer.current);
      }
    };
  }, []);

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

  const insertScientificSection = (blocks: JSONContent[]) => {
    if (!editor) {
      return;
    }

    editor.chain().focus("end").insertContent(blocks).run();
  };

  const applyCompleteTemplate = () => {
    if (!editor) {
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
              disabled={isUpdatingStatus}
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

            <Link className="button editor-radar-link" href={"/dashboard/periodicos" as Route}>
              Radar editorial
            </Link>

            <button
              className="button"
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

          <div
            className="editor-toolbar"
            style={{
              display: "flex",
              gap: "10px",
              flexWrap: "wrap",
              paddingBottom: "16px",
              borderBottom: "1px solid rgba(255,255,255,0.08)"
            }}
          >
            {[
              {
                label: "Desfazer",
                action: () => editor?.chain().focus().undo().run(),
                active: false,
                disabled: !editor?.can().chain().focus().undo().run()
              },
              {
                label: "Refazer",
                action: () => editor?.chain().focus().redo().run(),
                active: false,
                disabled: !editor?.can().chain().focus().redo().run()
              },
              {
                label: "Negrito",
                action: () => editor?.chain().focus().toggleBold().run(),
                active: editor?.isActive("bold"),
                disabled: false
              },
              {
                label: "Italico",
                action: () => editor?.chain().focus().toggleItalic().run(),
                active: editor?.isActive("italic"),
                disabled: false
              },
              {
                label: "Texto",
                action: () => editor?.chain().focus().setParagraph().run(),
                active: editor?.isActive("paragraph"),
                disabled: false
              },
              {
                label: "H2",
                action: () => editor?.chain().focus().toggleHeading({ level: 2 }).run(),
                active: editor?.isActive("heading", { level: 2 }),
                disabled: false
              },
              {
                label: "H3",
                action: () => editor?.chain().focus().toggleHeading({ level: 3 }).run(),
                active: editor?.isActive("heading", { level: 3 }),
                disabled: false
              },
              {
                label: "Lista",
                action: () => editor?.chain().focus().toggleBulletList().run(),
                active: editor?.isActive("bulletList"),
                disabled: false
              },
              {
                label: "1.",
                action: () => editor?.chain().focus().toggleOrderedList().run(),
                active: editor?.isActive("orderedList"),
                disabled: false
              },
              {
                label: "Citar",
                action: () => editor?.chain().focus().toggleBlockquote().run(),
                active: editor?.isActive("blockquote"),
                disabled: false
              }
            ].map((item) => (
              <button
                key={item.label}
                className="button"
                disabled={item.disabled}
                onClick={item.action}
                style={{
                  background: item.disabled
                    ? "rgba(255,255,255,0.03)"
                    : item.active
                      ? "rgba(214,255,247,0.18)"
                      : "rgba(255,255,255,0.05)",
                  color: item.disabled
                    ? "rgba(245,245,247,0.35)"
                    : "var(--foreground)",
                  border: item.active
                    ? "1px solid rgba(214,255,247,0.22)"
                    : "1px solid rgba(255,255,255,0.08)",
                  padding: "10px 14px"
                }}
                type="button"
              >
                {item.label}
              </button>
            ))}
          </div>

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
                <button className="button button-primary" onClick={applyCompleteTemplate} type="button">
                  Montar estrutura completa
                </button>

                <button
                  className="button button-secondary"
                  onClick={() => insertScientificSection(activeTemplate.content)}
                  type="button"
                >
                  Inserir no fim do texto
                </button>
              </div>
            </div>

            <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
              <button
                className="button button-secondary"
                onClick={applyCompleteTemplate}
                type="button"
              >
                Reaplicar template selecionado
              </button>

              <select
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
        </section>
      </div>
    </main>
  );
}
