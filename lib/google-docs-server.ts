import { createHmac, timingSafeEqual } from "node:crypto";

import { google } from "googleapis";

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
    throw new Error(`A variável ${name} precisa estar definida para ativar a integração com Google Docs.`);
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
    throw new Error("State do Google inválido.");
  }

  const expected = signState(payload);
  const provided = Buffer.from(signature, "utf8");
  const reference = Buffer.from(expected, "utf8");

  if (provided.length !== reference.length || !timingSafeEqual(provided, reference)) {
    throw new Error("Assinatura do state do Google inválida.");
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

export async function createGoogleDocumentFromTemplate(input: {
  accessToken?: string | null;
  refreshToken?: string | null;
  expiryDate?: number | null;
  title: string;
}) {
  const oauth = createGoogleOAuthClient();
  oauth.setCredentials({
    access_token: input.accessToken ?? undefined,
    refresh_token: input.refreshToken ?? undefined,
    expiry_date: input.expiryDate ?? undefined,
  });

  const docs = google.docs({ auth: oauth, version: "v1" });

  const created = await docs.documents.create({
    requestBody: {
      title: input.title,
    },
  });

  const documentId = created.data.documentId;
  if (!documentId) {
    throw new Error("O Google Docs não retornou um documentId.");
  }

  const text = [
    input.title,
    "",
    "Resumo",
    "Objetivo:",
    "Método:",
    "Achado principal:",
    "Contribuição:",
    "",
    "Introdução",
    "Contextualize o problema, explicite a lacuna e feche com o objetivo do estudo.",
    "",
    "Metodologia",
    "Descreva fonte de dados, participantes, procedimentos e estratégia analítica.",
    "",
    "Resultados",
    "Organize achados por eixo, categoria ou bloco lógico.",
    "",
    "Discussão",
    "Conecte os resultados à literatura, às implicações e às limitações.",
    "",
    "Conclusão",
    "Retome o objetivo e declare a contribuição central do manuscrito.",
    "",
    "Referências",
  ].join("\n");

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
