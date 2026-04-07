import type { Database, TeamSiteMember } from "@/lib/types";

export type TeamSiteContentRow =
  Database["public"]["Tables"]["conteudos_site_equipe"]["Row"];

export type TeamSiteContentState = {
  tituloPublico: string;
  resumoPublico: string;
  integrantes: TeamSiteMember[];
};

export const defaultTeamSiteContent: TeamSiteContentState = {
  tituloPublico: "Nossa equipe",
  resumoPublico:
    "Um grupo de pesquisadores conectado por ciência, formação e produção de conhecimento em saúde.",
  integrantes: []
};

export function normalizeTeamSiteMembers(value: unknown): TeamSiteMember[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.reduce<TeamSiteMember[]>((members, member) => {
    if (!member || typeof member !== "object") {
      return members;
    }

    const record = member as Record<string, unknown>;
    const nome = typeof record.nome === "string" ? record.nome.trim() : "";
    const funcao = typeof record.funcao === "string" ? record.funcao.trim() : "";
    const categoria = typeof record.categoria === "string" ? record.categoria.trim() : "";
    const email = typeof record.email === "string" ? record.email.trim() : null;
    const imagem = typeof record.imagem === "string" ? record.imagem.trim() : null;

    if (!nome || !funcao || !categoria) {
      return members;
    }

    return [
      ...members,
      {
        nome,
        funcao,
        categoria,
        email,
        imagem
      }
    ];
  }, []);
}

export function getTeamSiteContentFromRow(
  row: TeamSiteContentRow | null,
  fallbackTitle = defaultTeamSiteContent.tituloPublico
): TeamSiteContentState {
  if (!row) {
    return {
      ...defaultTeamSiteContent,
      tituloPublico: fallbackTitle || defaultTeamSiteContent.tituloPublico
    };
  }

  const integrantes = normalizeTeamSiteMembers(row.integrantes);

  return {
    tituloPublico:
      row.titulo_publico?.trim() || fallbackTitle || defaultTeamSiteContent.tituloPublico,
    resumoPublico: row.resumo_publico?.trim() || defaultTeamSiteContent.resumoPublico,
    integrantes
  };
}

export function groupTeamMembersByCategory(members: TeamSiteMember[]) {
  return members.reduce<Record<string, TeamSiteMember[]>>((groups, member) => {
    const category = member.categoria || "Equipe";
    groups[category] = [...(groups[category] ?? []), member];
    return groups;
  }, {});
}
