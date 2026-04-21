import { createHmac, timingSafeEqual } from "node:crypto";

import { google, type docs_v1 } from "googleapis";

import type { ArticleContent } from "@/lib/types";

type GoogleOAuthState = {
  uid: string;
  articleId?: string;
  title?: string;
  returnTo?: string;
  createdAt: number;
};

const GOOGLE_DOC_SCOPES = [
  "openid",
  "email",
  "profile",
  "https://www.googleapis.com/auth/documents",
  "https://www.googleapis.com/auth/drive.file",
];

function getRequiredEnv(name: string) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`A variavel ${name} precisa estar definida para ativar a integracao com Google Docs.`);
  }

  return value;
}

export function isGoogleDocsConfigured() {
  return Boolean(
    process.env.GOOGLE_CLIENT_ID &&
      process.env.GOOGLE_CLIENT_SECRET &&
      process.env.GOOGLE_REDIRECT_URI &&
      process.env.GOOGLE_STATE_SECRET
  );
}

export function createGoogleOAuthClient() {
  return new google.auth.OAuth2(
    getRequiredEnv("GOOGLE_CLIENT_ID"),
    getRequiredEnv("GOOGLE_CLIENT_SECRET"),
    getRequiredEnv("GOOGLE_REDIRECT_URI")
  );
}

function createAuthorizedDocsClient(input: {
  accessToken?: string | null;
  refreshToken?: string | null;
  expiryDate?: number | null;
}) {
  const oauth = createGoogleOAuthClient();
  oauth.setCredentials({
    access_token: input.accessToken ?? undefined,
    refresh_token: input.refreshToken ?? undefined,
    expiry_date: input.expiryDate ?? undefined,
  });

  return {
    oauth,
    docs: google.docs({ auth: oauth, version: "v1" }),
    drive: google.drive({ auth: oauth, version: "v3" }),
  };
}

function signState(payload: string) {
  return createHmac("sha256", getRequiredEnv("GOOGLE_STATE_SECRET")).update(payload).digest("base64url");
}

export function encodeGoogleOAuthState(state: GoogleOAuthState) {
  const payload = Buffer.from(JSON.stringify(state), "utf8").toString("base64url");
  const signature = signState(payload);
  return `${payload}.${signature}`;
}

export function decodeGoogleOAuthState(rawState: string) {
  const [payload, signature] = rawState.split(".");

  if (!payload || !signature) {
    throw new Error("State do Google invalido.");
  }

  const expected = signState(payload);
  const provided = Buffer.from(signature, "utf8");
  const reference = Buffer.from(expected, "utf8");

  if (provided.length !== reference.length || !timingSafeEqual(provided, reference)) {
    throw new Error("Assinatura do state do Google invalida.");
  }

  const parsed = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as GoogleOAuthState;

  if (!parsed.uid || !parsed.createdAt) {
    throw new Error("State do Google incompleto.");
  }

  return parsed;
}

export function buildGoogleAuthorizationUrl(state: GoogleOAuthState) {
  const oauth = createGoogleOAuthClient();

  return oauth.generateAuthUrl({
    access_type: "offline",
    include_granted_scopes: true,
    prompt: "consent",
    scope: GOOGLE_DOC_SCOPES,
    state: encodeGoogleOAuthState(state),
  });
}

export async function exchangeGoogleCode(code: string) {
  const oauth = createGoogleOAuthClient();
  const { tokens } = await oauth.getToken(code);
  oauth.setCredentials(tokens);

  const oauth2 = google.oauth2({ auth: oauth, version: "v2" });
  const profile = await oauth2.userinfo.get();

  return {
    tokens,
    profile,
  };
}

function textNode(text: string) {
  return {
    type: "text",
    text,
  };
}

function paragraphNode(text: string) {
  return {
    type: "paragraph",
    content: [textNode(text)],
  };
}

function headingNode(level: 2 | 3, text: string) {
  return {
    type: "heading",
    attrs: { level },
    content: [textNode(text)],
  };
}

function cleanGoogleText(text: string) {
  return text.replace(/\r/g, "").replace(/\n/g, " ").replace(/\s+/g, " ").trim();
}

function tiptapTextFromContent(content: ArticleContent | null | undefined) {
  const collect = (nodes: Array<Record<string, unknown>> | undefined): string[] => {
    if (!nodes?.length) {
      return [];
    }

    return nodes.flatMap((node) => {
      const currentText = typeof node.text === "string" ? [node.text] : [];
      const nested = Array.isArray(node.content)
        ? collect(node.content as Array<Record<string, unknown>>)
        : [];
      const type = typeof node.type === "string" ? node.type : "";

      if (type === "heading") {
        return [[...currentText, ...nested].join(" ").replace(/\s+/g, " ").trim(), ""].filter(Boolean);
      }

      if (type === "paragraph" || type === "blockquote" || type === "listItem") {
        return [[...currentText, ...nested].join(" ").replace(/\s+/g, " ").trim(), ""].filter(Boolean);
      }

      return [...currentText, ...nested];
    });
  };

  return collect(content?.content as Array<Record<string, unknown>> | undefined)
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function buildDefaultGoogleDocText(title: string) {
  return [
    title,
    "",
    "Resumo",
    "Objetivo:",
    "Metodo:",
    "Achado principal:",
    "Contribuicao:",
    "",
    "Introducao",
    "Contextualize o problema, explicite a lacuna e feche com o objetivo do estudo.",
    "",
    "Metodologia",
    "Descreva fonte de dados, participantes, procedimentos e estrategia analitica.",
    "",
    "Resultados",
    "Organize achados por eixo, categoria ou bloco logico.",
    "",
    "Discussao",
    "Conecte os resultados a literatura, implicacoes e limitacoes.",
    "",
    "Conclusao",
    "Retome o objetivo e declare a contribuicao central do manuscrito.",
    "",
    "Referencias",
  ].join("\n");
}

function pickInitialDocumentText(title: string, seedContent?: ArticleContent | null) {
  const imported = tiptapTextFromContent(seedContent);
  if (imported) {
    return imported.startsWith(title) ? imported : `${title}\n\n${imported}`;
  }

  return buildDefaultGoogleDocText(title);
}

function mapNamedStyleToLevel(namedStyleType?: string | null): 2 | 3 | null {
  switch (namedStyleType) {
    case "TITLE":
    case "HEADING_1":
    case "HEADING_2":
      return 2;
    case "HEADING_3":
    case "HEADING_4":
      return 3;
    default:
      return null;
  }
}

function getParagraphText(paragraph?: docs_v1.Schema$Paragraph | null) {
  if (!paragraph?.elements?.length) {
    return "";
  }

  return cleanGoogleText(
    paragraph.elements
      .map((element) => element.textRun?.content ?? "")
      .join("")
  );
}

function appendStructuralElementNodes(
  target: Array<Record<string, unknown>>,
  element?: docs_v1.Schema$StructuralElement | null
) {
  if (!element) {
    return;
  }

  if (element.paragraph) {
    const text = getParagraphText(element.paragraph);
    if (!text) {
      return;
    }

    const headingLevel = mapNamedStyleToLevel(element.paragraph.paragraphStyle?.namedStyleType ?? null);
    target.push(headingLevel ? headingNode(headingLevel, text) : paragraphNode(text));
    return;
  }

  if (element.table?.tableRows?.length) {
    element.table.tableRows.forEach((row) => {
      row.tableCells?.forEach((cell) => {
        cell.content?.forEach((child) => appendStructuralElementNodes(target, child));
      });
    });
  }
}

export async function syncGoogleDocumentToArticleContent(input: {
  documentId: string;
  accessToken?: string | null;
  refreshToken?: string | null;
  expiryDate?: number | null;
}) {
  const { docs } = createAuthorizedDocsClient(input);
  const response = await docs.documents.get({
    documentId: input.documentId,
  });

  const document = response.data;
  const nodes: Array<Record<string, unknown>> = [];
  document.body?.content?.forEach((element) => appendStructuralElementNodes(nodes, element));

  return {
    title: document.title?.trim() || "Documento Google",
    content: {
      type: "doc",
      content: nodes.length > 0 ? nodes : [paragraphNode("Documento Google conectado, mas sem conteudo textual legivel ainda.")],
    } as ArticleContent,
    importedBlocks: nodes.length,
    syncedAt: new Date().toISOString(),
  };
}

export async function createGoogleDocumentFromTemplate(input: {
  accessToken?: string | null;
  refreshToken?: string | null;
  expiryDate?: number | null;
  title: string;
  seedContent?: ArticleContent | null;
}) {
  const { docs } = createAuthorizedDocsClient(input);

  const created = await docs.documents.create({
    requestBody: {
      title: input.title,
    },
  });

  const documentId = created.data.documentId;
  if (!documentId) {
    throw new Error("O Google Docs nao retornou um documentId.");
  }

  const text = pickInitialDocumentText(input.title, input.seedContent);

  await docs.documents.batchUpdate({
    documentId,
    requestBody: {
      requests: [
        {
          insertText: {
            endOfSegmentLocation: {},
            text,
          },
        },
      ],
    },
  });

  return {
    documentId,
    documentUrl: `https://docs.google.com/document/d/${documentId}/edit`,
    syncedAt: new Date().toISOString(),
  };
}

export async function pushArticleContentToGoogleDocument(input: {
  documentId: string;
  title: string;
  content: ArticleContent | null | undefined;
  accessToken?: string | null;
  refreshToken?: string | null;
  expiryDate?: number | null;
}) {
  const { docs, drive } = createAuthorizedDocsClient(input);
  const current = await docs.documents.get({
    documentId: input.documentId,
  });

  const documentText = pickInitialDocumentText(input.title, input.content);
  const lastEndIndex =
    current.data.body?.content?.[current.data.body.content.length - 1]?.endIndex ?? 1;

  const requests: docs_v1.Schema$Request[] = [];

  if (lastEndIndex > 1) {
    requests.push({
      deleteContentRange: {
        range: {
          startIndex: 1,
          endIndex: lastEndIndex - 1,
        },
      },
    });
  }

  requests.push({
    insertText: {
      location: {
        index: 1,
      },
      text: documentText,
    },
  });

  await docs.documents.batchUpdate({
    documentId: input.documentId,
    requestBody: {
      requests,
    },
  });

  await drive.files.update({
    fileId: input.documentId,
    requestBody: {
      name: input.title,
    },
  });

  return {
    documentId: input.documentId,
    documentUrl: `https://docs.google.com/document/d/${input.documentId}/edit`,
    syncedAt: new Date().toISOString(),
  };
}
