export type GoogleDocSyncStatus = "nao_configurado" | "rascunho_local" | "sincronizado" | "atualizacao_pendente";

const GOOGLE_DOC_BASE = "https://docs.google.com/document/d";

export function extractGoogleDocId(value: string) {
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }

  const directMatch = trimmed.match(/\/document\/d\/([a-zA-Z0-9_-]+)/);
  if (directMatch?.[1]) {
    return directMatch[1];
  }

  if (/^[a-zA-Z0-9_-]{20,}$/.test(trimmed)) {
    return trimmed;
  }

  return null;
}

export function buildGoogleDocUrl(docId: string | null | undefined) {
  if (!docId) {
    return null;
  }

  return `${GOOGLE_DOC_BASE}/${docId}/edit`;
}

export function buildGoogleDocCreateUrl() {
  return "https://docs.new";
}

export function inferGoogleDocSyncStatus(
  docId: string | null | undefined,
  lastSyncedAt: string | null | undefined
): GoogleDocSyncStatus {
  if (!docId) {
    return "nao_configurado";
  }

  if (!lastSyncedAt) {
    return "rascunho_local";
  }

  const syncDate = new Date(lastSyncedAt);
  if (Number.isNaN(syncDate.getTime())) {
    return "rascunho_local";
  }

  const diffHours = Math.abs(Date.now() - syncDate.getTime()) / (1000 * 60 * 60);
  return diffHours <= 12 ? "sincronizado" : "atualizacao_pendente";
}

export function formatGoogleDocSyncLabel(status: GoogleDocSyncStatus) {
  switch (status) {
    case "sincronizado":
      return "Sincronizado";
    case "atualizacao_pendente":
      return "Atualização pendente";
    case "rascunho_local":
      return "Vinculado, aguardando sincronização";
    default:
      return "Ainda não vinculado";
  }
}
