"use client";

import { useState } from "react";

import type { ArticleRow } from "@/lib/types";

export function LattesExportCard({ article }: { article: ArticleRow }) {
  const [copiedField, setCopiedField] = useState<string | null>(null);

  const currentYear = new Date().getFullYear();
  const authorsPlaceholder = "Preencha com os autores na ordem correta";
  const journalPlaceholder = "Preencha com o nome real do periódico";
  const doiPlaceholder = "Preencha com DOI ou URL final da publicação";

  const abntDraft = `${authorsPlaceholder}. ${article.titulo}. ${journalPlaceholder}, ${currentYear}. DOI/URL: ${doiPlaceholder}.`;

  const copyToClipboard = async (text: string, fieldName: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedField(fieldName);
      setTimeout(() => setCopiedField(null), 2000);
    } catch {
      alert("Falha ao copiar texto. Verifique as permissões do navegador.");
    }
  };

  return (
    <article className="glass-card" style={{ padding: "24px", display: "grid", gap: "20px" }}>
      <div style={{ display: "grid", gap: "6px" }}>
        <h3 style={{ margin: 0, fontSize: "1.2rem", lineHeight: 1.3 }}>{article.titulo}</h3>
        <span className="muted" style={{ fontSize: "0.85rem", textTransform: "uppercase" }}>
          ID interno: {article.id.slice(0, 8)}...
        </span>
      </div>

      <div
        style={{
          display: "grid",
          gap: "10px",
          background: "rgba(255,255,255,0.4)",
          padding: "16px",
          borderRadius: "16px",
          border: "1px dashed rgba(36,26,19,0.15)"
        }}
      >
        <strong>Rascunho assistido para o Lattes</strong>
        <p style={{ margin: 0, fontSize: "0.95rem", lineHeight: 1.5, color: "var(--foreground)" }}>
          {abntDraft}
        </p>
        <span className="muted" style={{ fontSize: "0.85rem" }}>
          Os campos de autores, periódico e DOI ainda dependem de preenchimento manual com os
          metadados reais da publicação.
        </span>
        <button
          className="button button-primary"
          style={{ width: "100%", fontWeight: 600, padding: "14px" }}
          onClick={() => void copyToClipboard(abntDraft, "abnt")}
          type="button"
        >
          {copiedField === "abnt" ? "Rascunho copiado" : "Copiar rascunho ABNT"}
        </button>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px" }}>
        {[
          ["titulo", "Título integral", article.titulo],
          ["ano", "Ano de publicação", currentYear.toString()],
          ["autores", "Autores", authorsPlaceholder],
          ["doi", "DOI ou link", doiPlaceholder]
        ].map(([field, label, value]) => (
          <div key={field} style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
            <span className="muted" style={{ fontSize: "0.8rem" }}>
              {label}
            </span>
            <button
              className="button button-secondary"
              style={{ fontSize: "0.85rem", padding: "8px" }}
              onClick={() => void copyToClipboard(value, field)}
              type="button"
            >
              {copiedField === field ? "Copiado" : `Copiar ${label.toLowerCase()}`}
            </button>
          </div>
        ))}
      </div>
    </article>
  );
}
