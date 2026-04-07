import {
  AlignmentType,
  Document,
  HeadingLevel,
  PageBreak,
  Packer,
  Paragraph,
  TextRun,
  convertInchesToTwip
} from "docx";
import type { JSONContent } from "@tiptap/react";

function textFromNode(node: JSONContent | undefined): string {
  if (!node) {
    return "";
  }

  if (node.type === "text") {
    return node.text ?? "";
  }

  return (node.content ?? []).map((child) => textFromNode(child)).join("");
}

function runsFromNode(node: JSONContent): TextRun[] {
  if (node.type === "text") {
    const marks = node.marks ?? [];
    const isBold = marks.some((mark) => mark.type === "bold");
    const isItalic = marks.some((mark) => mark.type === "italic");
    return [
      new TextRun({
        text: node.text ?? "",
        bold: isBold,
        italics: isItalic
      })
    ];
  }

  return (node.content ?? []).flatMap((child) => runsFromNode(child));
}

function paragraphFromNode(node: JSONContent): Paragraph[] {
  switch (node.type) {
    case "heading": {
      const level = Number(node.attrs?.level ?? 2);
      const heading =
        level === 1
          ? HeadingLevel.HEADING_1
          : level === 2
            ? HeadingLevel.HEADING_2
            : level === 3
              ? HeadingLevel.HEADING_3
              : level === 4
                ? HeadingLevel.HEADING_4
                : HeadingLevel.HEADING_2;

      return [
        new Paragraph({
          heading,
          spacing: { after: 180 },
          children: runsFromNode(node)
        })
      ];
    }
    case "paragraph":
      return [
        new Paragraph({
          spacing: { after: 180, line: 360 },
          indent: { firstLine: convertInchesToTwip(0.5) },
          alignment: AlignmentType.JUSTIFIED,
          children:
            runsFromNode(node).length > 0 ? runsFromNode(node) : [new TextRun({ text: "" })]
        })
      ];
    case "bulletList":
      return (node.content ?? []).flatMap((child) => paragraphFromNode(child));
    case "listItem":
      return [
        new Paragraph({
          spacing: { after: 120, line: 360 },
          bullet: { level: 0 },
          alignment: AlignmentType.JUSTIFIED,
          children: [
            new TextRun({
              text: textFromNode(node).trim()
            })
          ]
        })
      ];
    case "blockquote":
      return [
        new Paragraph({
          spacing: { after: 180, line: 360 },
          indent: { left: convertInchesToTwip(0.4) },
          border: {
            left: {
              color: "B9A68E",
              size: 12,
              space: 8,
              style: "single"
            }
          },
          children: [new TextRun({ text: textFromNode(node).trim(), italics: true })]
        })
      ];
    default:
      return (node.content ?? []).flatMap((child) => paragraphFromNode(child));
  }
}

export async function exportArticleToDocx(title: string, content: JSONContent) {
  const safeTitle = title.trim() || "Artigo WebLab";
  const body = (content.content ?? []).flatMap((node) => paragraphFromNode(node));

  const wordDocument = new Document({
    sections: [
      {
        properties: {
          page: {
            margin: {
              top: convertInchesToTwip(1.18),
              right: convertInchesToTwip(1.18),
              bottom: convertInchesToTwip(0.79),
              left: convertInchesToTwip(1.18)
            }
          }
        },
        children: [
          new Paragraph({
            text: safeTitle,
            heading: HeadingLevel.TITLE,
            alignment: AlignmentType.CENTER,
            spacing: { after: 320 }
          }),
          ...body
        ]
      }
    ]
  });

  const blob = await Packer.toBlob(wordDocument);
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `${safeTitle.replace(/[^\w\- ]+/g, "").trim() || "artigo-weblab"}.docx`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

type SubmissionChecklistItem = {
  label: string;
  checked: boolean;
};

type SubmissionDocxTarget = {
  journalTitle: string;
  hostName?: string | null;
  recommendationLabel: string;
  readinessLabel: string;
  readinessPercent: number;
  editorialScore: number;
  indexers: string[];
  notes?: string | null;
  checklist: SubmissionChecklistItem[];
  sourceUrl?: string | null;
};

function metadataParagraph(label: string, value: string) {
  return new Paragraph({
    spacing: { after: 90, line: 300 },
    children: [
      new TextRun({ text: `${label}: `, bold: true }),
      new TextRun({ text: value || "Não informado" })
    ]
  });
}

export async function exportSubmissionDocx(title: string, content: JSONContent, target: SubmissionDocxTarget) {
  const safeTitle = title.trim() || "Artigo WebLab";
  const journalTitle = target.journalTitle.trim() || "Revista selecionada";
  const body = (content.content ?? []).flatMap((node) => paragraphFromNode(node));
  const indexers =
    target.indexers.length > 0
      ? target.indexers.join(", ")
      : "Nenhum indexador priorizado confirmado no radar";

  const dossier = [
    new Paragraph({
      text: "Ficha de submissão WebLab",
      heading: HeadingLevel.TITLE,
      alignment: AlignmentType.CENTER,
      spacing: { after: 320 }
    }),
    metadataParagraph("Manuscrito", safeTitle),
    metadataParagraph("Revista", journalTitle),
    metadataParagraph("Host/editora", target.hostName ?? "Não informado"),
    metadataParagraph("Nível editorial", target.recommendationLabel),
    metadataParagraph("Prontidão", `${target.readinessPercent}% (${target.readinessLabel})`),
    metadataParagraph("Score editorial", String(target.editorialScore)),
    metadataParagraph("Indexadores priorizados", indexers),
    metadataParagraph("Fonte", target.sourceUrl ?? "Não informada"),
    new Paragraph({
      text: "Notas da equipe",
      heading: HeadingLevel.HEADING_2,
      spacing: { before: 260, after: 140 }
    }),
    new Paragraph({
      spacing: { after: 180, line: 320 },
      alignment: AlignmentType.JUSTIFIED,
      children: [new TextRun({ text: target.notes?.trim() || "Sem notas registradas." })]
    }),
    new Paragraph({
      text: "Checklist de submissão",
      heading: HeadingLevel.HEADING_2,
      spacing: { before: 260, after: 140 }
    }),
    ...target.checklist.map(
      (item) =>
        new Paragraph({
          spacing: { after: 90, line: 300 },
          children: [
            new TextRun({ text: item.checked ? "[x] " : "[ ] ", bold: true }),
            new TextRun({ text: item.label })
          ]
        })
    ),
    new Paragraph({
      children: [new PageBreak()]
    }),
    new Paragraph({
      text: safeTitle,
      heading: HeadingLevel.TITLE,
      alignment: AlignmentType.CENTER,
      spacing: { after: 320 }
    })
  ];

  const wordDocument = new Document({
    sections: [
      {
        properties: {
          page: {
            margin: {
              top: convertInchesToTwip(1.18),
              right: convertInchesToTwip(1.18),
              bottom: convertInchesToTwip(0.79),
              left: convertInchesToTwip(1.18)
            }
          }
        },
        children: [...dossier, ...body]
      }
    ]
  });

  const blob = await Packer.toBlob(wordDocument);
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  const fileBase = `${safeTitle}-${journalTitle}`.replace(/[^\w\- ]+/g, "").trim() || "pacote-submissao-weblab";

  link.href = url;
  link.download = `${fileBase}-submissao.docx`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
