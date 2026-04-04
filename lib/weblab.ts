import type { ArticleContent, UserRole } from "@/lib/types";

export function normalizeInviteCode(value: string) {
  return value.trim().toUpperCase().replace(/\s+/g, "-");
}

export function generateInviteCode(teamName: string) {
  const base = teamName
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 12);

  const suffix = Math.random().toString(36).slice(2, 8).toUpperCase();
  return normalizeInviteCode(`${base || "WEBLAB"}-${suffix}`);
}

export function formatRoleLabel(role: UserRole) {
  switch (role) {
    case "coordenador":
      return "Coordenador";
    case "coordenador_geral":
      return "Coordenador geral";
    default:
      return "Pesquisador";
  }
}

export function formatStatusLabel(status: "aprovado" | "em_rascunho" | "submetido") {
  switch (status) {
    case "aprovado":
      return "Aprovado";
    case "submetido":
      return "Submetido";
    default:
      return "Em rascunho";
  }
}

export function countArticleWords(content: ArticleContent | null) {
  if (!content?.content?.length) {
    return 0;
  }

  const text = collectText(content.content);
  const tokens = text.trim().split(/\s+/).filter(Boolean);
  return tokens.length;
}

function collectText(nodes: Array<Record<string, unknown>>): string {
  return nodes
    .map((node) => {
      const record = node as {
        text?: string;
        content?: Array<Record<string, unknown>>;
      };

      const current = record.text ?? "";
      const nested: string = record.content?.length ? collectText(record.content) : "";
      return `${current} ${nested}`.trim();
    })
    .join(" ")
    .trim();
}

export function formatRelativeUpdate(value: string | null) {
  if (!value) {
    return "Ainda sem edicoes registradas";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "Atualizacao indisponivel";
  }

  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "medium",
    timeStyle: "short"
  }).format(date);
}

type CitationAuthor = {
  display_name?: string;
};

type CitationWork = {
  title?: string;
  publication_year?: number;
  authorships?: Array<{
    author?: CitationAuthor;
  }>;
  primary_location?: {
    source?: {
      display_name?: string;
    };
  };
  biblio?: {
    first_page?: string;
    last_page?: string;
    volume?: string;
    issue?: string;
  };
  doi?: string;
};

function formatAuthorName(name: string) {
  const parts = name.trim().split(/\s+/);
  if (parts.length === 0) {
    return "";
  }

  const lastName = parts[parts.length - 1]?.toUpperCase() ?? "";
  const initials = parts
    .slice(0, -1)
    .map((part) => part.charAt(0).toUpperCase())
    .filter(Boolean)
    .join(". ");

  return initials ? `${lastName}, ${initials}.` : `${lastName}.`;
}

export function formatAbntCitation(work: CitationWork) {
  const authors = (work.authorships ?? [])
    .map((entry) => entry.author?.display_name ?? "")
    .filter(Boolean)
    .slice(0, 3)
    .map(formatAuthorName);

  const authorsText =
    authors.length > 0 ? authors.join("; ") : "AUTORIA NAO INFORMADA.";
  const title = work.title?.trim() || "Titulo nao informado";
  const source = work.primary_location?.source?.display_name?.trim() || "Fonte nao informada";
  const year = work.publication_year ? String(work.publication_year) : "s.d.";
  const volume = work.biblio?.volume ? `v. ${work.biblio.volume}` : "";
  const issue = work.biblio?.issue ? `n. ${work.biblio.issue}` : "";
  const pages =
    work.biblio?.first_page && work.biblio?.last_page
      ? `p. ${work.biblio.first_page}-${work.biblio.last_page}`
      : "";
  const doi = work.doi ? ` DOI: ${work.doi.replace(/^https?:\/\/doi.org\//i, "")}.` : "";

  const detailParts = [volume, issue, pages, year].filter(Boolean).join(", ");
  return `${authorsText} ${title}. ${source}${detailParts ? `, ${detailParts}` : `, ${year}`}.${doi}`.replace(
    /\s+/g,
    " "
  );
}
