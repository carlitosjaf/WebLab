export type ImportedEvidenceStudy = {
  external_id: string;
  source: string;
  titulo: string;
  autores: string[];
  ano: number | null;
  doi: string | null;
  periodico: string | null;
  resumo: string | null;
  url: string | null;
};

export type ImportedEvidencePayload = {
  format: "csv" | "ris" | "bibtex";
  studies: ImportedEvidenceStudy[];
};

function normalizeWhitespace(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

function parseYear(value: string | null | undefined) {
  if (!value) {
    return null;
  }

  const match = value.match(/(19|20)\d{2}/);
  return match ? Number.parseInt(match[0], 10) : null;
}

function buildExternalId(source: string, study: Omit<ImportedEvidenceStudy, "external_id">, index: number) {
  const fingerprint = study.doi
    ? study.doi
    : `${study.titulo}-${study.ano ?? "sd"}-${study.autores.slice(0, 2).join("-")}`;

  return `${source}:${normalizeWhitespace(fingerprint).toLowerCase().replace(/[^a-z0-9]+/g, "-") || index}`;
}

function splitAuthors(value: string) {
  return value
    .split(/\s*(?:;|\band\b|\n)\s*/i)
    .map((author) => normalizeWhitespace(author))
    .filter(Boolean);
}

function finalizeStudy(source: ImportedEvidenceStudy["source"], study: Omit<ImportedEvidenceStudy, "external_id">, index: number) {
  if (!study.titulo) {
    return null;
  }

  return {
    ...study,
    external_id: buildExternalId(source, study, index)
  } satisfies ImportedEvidenceStudy;
}

function splitCsvLine(line: string) {
  const cells: string[] = [];
  let current = "";
  let isQuoted = false;

  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    const next = line[index + 1];

    if (char === '"') {
      if (isQuoted && next === '"') {
        current += '"';
        index += 1;
      } else {
        isQuoted = !isQuoted;
      }

      continue;
    }

    if (char === "," && !isQuoted) {
      cells.push(current);
      current = "";
      continue;
    }

    current += char;
  }

  cells.push(current);
  return cells.map((cell) => normalizeWhitespace(cell));
}

function parseCsv(content: string) {
  const lines = content
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  if (lines.length < 2) {
    return [] as ImportedEvidenceStudy[];
  }

  const headers = splitCsvLine(lines[0]).map((header) => header.toLowerCase());
  const headerIndex = (aliases: string[]) => headers.findIndex((header) => aliases.includes(header));

  const titleIndex = headerIndex(["titulo", "title", "document title"]);
  const authorsIndex = headerIndex(["autores", "authors", "author"]);
  const yearIndex = headerIndex(["ano", "year", "publication year", "published"]);
  const doiIndex = headerIndex(["doi"]);
  const journalIndex = headerIndex(["periodico", "journal", "source title", "revista"]);
  const abstractIndex = headerIndex(["resumo", "abstract", "summary"]);
  const urlIndex = headerIndex(["url", "link", "source url"]);

  return lines
    .slice(1)
    .map((line, index) => {
      const cells = splitCsvLine(line);

      return finalizeStudy(
        "CSV",
        {
          source: "CSV",
          titulo: titleIndex >= 0 ? cells[titleIndex] ?? "" : "",
          autores: authorsIndex >= 0 ? splitAuthors(cells[authorsIndex] ?? "") : [],
          ano: yearIndex >= 0 ? parseYear(cells[yearIndex]) : null,
          doi: doiIndex >= 0 ? cells[doiIndex] || null : null,
          periodico: journalIndex >= 0 ? cells[journalIndex] || null : null,
          resumo: abstractIndex >= 0 ? cells[abstractIndex] || null : null,
          url: urlIndex >= 0 ? cells[urlIndex] || null : null
        },
        index
      );
    })
    .filter((study): study is ImportedEvidenceStudy => Boolean(study));
}

function parseRis(content: string) {
  const normalized = content.replace(/\r/g, "");
  const rawRecords = normalized
    .split(/\nER\s{0,2}-.*(?:\n|$)/)
    .map((record) => record.trim())
    .filter(Boolean);

  return rawRecords
    .map((record, index) => {
      const fieldMap = new Map<string, string[]>();

      record.split("\n").forEach((line) => {
        const match = line.match(/^([A-Z0-9]{2})\s{0,2}-\s?(.*)$/);

        if (!match) {
          return;
        }

        const [, tag, value] = match;
        fieldMap.set(tag, [...(fieldMap.get(tag) ?? []), value.trim()]);
      });

      return finalizeStudy(
        "RIS",
        {
          source: "RIS",
          titulo:
            fieldMap.get("TI")?.[0] ??
            fieldMap.get("T1")?.[0] ??
            fieldMap.get("CT")?.[0] ??
            "",
          autores: [...(fieldMap.get("AU") ?? []), ...(fieldMap.get("A1") ?? [])].map((author) =>
            normalizeWhitespace(author)
          ),
          ano: parseYear(fieldMap.get("PY")?.[0] ?? fieldMap.get("Y1")?.[0] ?? fieldMap.get("DA")?.[0] ?? null),
          doi: fieldMap.get("DO")?.[0] ?? null,
          periodico:
            fieldMap.get("JO")?.[0] ??
            fieldMap.get("JF")?.[0] ??
            fieldMap.get("T2")?.[0] ??
            fieldMap.get("JA")?.[0] ??
            null,
          resumo: fieldMap.get("AB")?.[0] ?? fieldMap.get("N2")?.[0] ?? null,
          url: fieldMap.get("UR")?.[0] ?? fieldMap.get("L1")?.[0] ?? null
        },
        index
      );
    })
    .filter((study): study is ImportedEvidenceStudy => Boolean(study));
}

function extractBibtexField(entry: string, field: string) {
  const regex = new RegExp(`${field}\\s*=\\s*(?:\\{([\\s\\S]*?)\\}|\"([\\s\\S]*?)\")`, "i");
  const match = entry.match(regex);
  return normalizeWhitespace(match?.[1] ?? match?.[2] ?? "");
}

function parseBibtex(content: string) {
  const entries = content.match(/@\w+\s*\{[\s\S]*?\n\}/g) ?? [];

  return entries
    .map((entry, index) => {
      const authors = splitAuthors(extractBibtexField(entry, "author").replace(/\s+and\s+/gi, "; "));

      return finalizeStudy(
        "BibTeX",
        {
          source: "BibTeX",
          titulo: extractBibtexField(entry, "title").replace(/[{}]/g, ""),
          autores: authors,
          ano: parseYear(extractBibtexField(entry, "year")),
          doi: extractBibtexField(entry, "doi") || null,
          periodico: extractBibtexField(entry, "journal") || extractBibtexField(entry, "booktitle") || null,
          resumo: extractBibtexField(entry, "abstract") || null,
          url: extractBibtexField(entry, "url") || null
        },
        index
      );
    })
    .filter((study): study is ImportedEvidenceStudy => Boolean(study));
}

export function parseEvidenceImport(content: string, fileName = ""): ImportedEvidencePayload {
  const normalized = content.trim();
  const lowerName = fileName.toLowerCase();

  if (!normalized) {
    return { format: "csv", studies: [] };
  }

  if (lowerName.endsWith(".ris") || /^TY\s{0,2}-/m.test(normalized)) {
    return { format: "ris", studies: parseRis(normalized) };
  }

  if (lowerName.endsWith(".bib") || lowerName.endsWith(".bibtex") || /@\w+\s*\{/.test(normalized)) {
    return { format: "bibtex", studies: parseBibtex(normalized) };
  }

  return { format: "csv", studies: parseCsv(normalized) };
}
