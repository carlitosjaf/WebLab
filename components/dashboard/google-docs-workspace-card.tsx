"use client";

import Link from "next/link";
import type { Route } from "next";
import { useMemo, useState } from "react";

import {
  buildGoogleDocCreateUrl,
  buildGoogleDocUrl,
  extractGoogleDocId,
  formatGoogleDocSyncLabel,
  inferGoogleDocSyncStatus,
} from "@/lib/google-docs";
import type { ArticleRow } from "@/lib/types";
import { formatRelativeUpdate, formatStatusLabel } from "@/lib/weblab";

type GoogleDocsWorkspaceCardProps = {
  article: ArticleRow;
  canEdit: boolean;
  onLinkDocument: (payload: { docId: string; docUrl: string }) => Promise<void>;
  onMarkSynced: () => Promise<void>;
};

export function GoogleDocsWorkspaceCard({
  article,
  canEdit,
  onLinkDocument,
  onMarkSynced,
}: GoogleDocsWorkspaceCardProps) {
  const [docInput, setDocInput] = useState(article.google_doc_url ?? article.google_doc_id ?? "");
  const [message, setMessage] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const docUrl = buildGoogleDocUrl(article.google_doc_id) ?? article.google_doc_url;
  const syncStatus = inferGoogleDocSyncStatus(article.google_doc_id, article.google_last_synced_at);
  const syncLabel = formatGoogleDocSyncLabel(syncStatus);

  const checklist = useMemo(
    () => [
      {
        label: "Documento Google vinculado",
        done: Boolean(article.google_doc_id),
        detail: article.google_doc_id ? "O manuscrito já abre no Google Docs." : "Crie um documento e cole o link aqui.",
      },
      {
        label: "Última sincronização",
        done: Boolean(article.google_last_synced_at),
        detail: article.google_last_synced_at
          ? `Registrada em ${formatRelativeUpdate(article.google_last_synced_at)}`
          : "Ainda não registrada.",
      },
      {
        label: "Editor clássico",
        done: true,
        detail: "Continua disponível como fallback enquanto refinamos a integração.",
      },
    ],
    [article.google_doc_id, article.google_last_synced_at]
  );

  const handleLink = async () => {
    const docId = extractGoogleDocId(docInput);
    if (!docId) {
      setMessage("Cole um link válido do Google Docs ou o ID do documento.");
      return;
    }

    setIsSaving(true);
    setMessage(null);
    try {
      await onLinkDocument({
        docId,
        docUrl: buildGoogleDocUrl(docId) ?? docInput.trim(),
      });
      setMessage("Documento Google vinculado ao manuscrito.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Não foi possível salvar o vínculo agora.");
    } finally {
      setIsSaving(false);
    }
  };

  const handleMarkSynced = async () => {
    setIsSaving(true);
    setMessage(null);
    try {
      await onMarkSynced();
      setMessage("Sincronização marcada no WebLab.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Não foi possível registrar a sincronização.");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <section className="docs-workspace-card">
      <div className="docs-workspace-card__content">
        <div className="docs-workspace-card__eyebrow-row">
          <span className="eyebrow">manuscrito conectado</span>
          <span className={`docs-sync-chip docs-sync-chip--${syncStatus}`}>{syncLabel}</span>
        </div>

        <h2>Escreva no Google Docs. Decida no WebLab.</h2>
        <p>
          O WebLab vira a mesa de comando do manuscrito: leitura cognitiva, radar editorial, triagem,
          referências e submissão. O Google Docs fica responsável pela escrita, autosave e colaboração.
        </p>

        <div className="docs-workspace-card__meta">
          <span>{formatStatusLabel(article.status)}</span>
          <span>{article.google_doc_id ? "Documento vinculado" : "Documento ainda não vinculado"}</span>
          <span>
            {article.google_last_synced_at
              ? `Sincronizado em ${formatRelativeUpdate(article.google_last_synced_at)}`
              : "Sem sincronização registrada"}
          </span>
        </div>

        <div className="docs-workspace-card__actions">
          <a
            className="lovable-primary-link"
            href={docUrl ?? buildGoogleDocCreateUrl()}
            rel="noreferrer"
            target="_blank"
          >
            {docUrl ? "Abrir no Google Docs" : "Criar no Google Docs"}
          </a>
          <button className="lovable-small-button" disabled={!article.google_doc_id || isSaving} onClick={() => void handleMarkSynced()} type="button">
            Marcar sincronização
          </button>
          <Link className="lovable-small-button" href={`/editor/${article.id}` as Route}>
            Abrir editor clássico
          </Link>
        </div>

        <div className="docs-link-panel">
          <div className="docs-link-panel__head">
            <strong>Vincular documento Google</strong>
            <span className="muted">Cole o link do documento ou o ID depois de criar o arquivo.</span>
          </div>
          <div className="docs-link-panel__row">
            <input
              className="field"
              disabled={!canEdit || isSaving}
              onChange={(event) => setDocInput(event.target.value)}
              placeholder="https://docs.google.com/document/d/..."
              value={docInput}
            />
            <button className="button button-primary" disabled={!canEdit || isSaving} onClick={() => void handleLink()} type="button">
              {isSaving ? "Salvando..." : "Vincular"}
            </button>
          </div>
          {message ? <p className="muted">{message}</p> : null}
        </div>

        <div className="docs-check-grid">
          {checklist.map((item) => (
            <article className="docs-check-card" key={item.label}>
              <strong>{item.done ? "OK" : "Ajustar"}</strong>
              <span>{item.label}</span>
              <small>{item.detail}</small>
            </article>
          ))}
        </div>
      </div>

      <aside className="docs-preview-shell" aria-label="Prévia do fluxo Google Docs com WebLab">
        <div className="docs-preview-browser">
          <div className="docs-preview-browser__bar">
            <span />
            <span />
            <span />
          </div>
          <div className="docs-preview-browser__body">
            <div className="docs-preview-doc">
              <div className="docs-preview-doc__header">
                <strong>{article.titulo}</strong>
                <small>Google Docs · Conta da equipe</small>
              </div>
              <div className="docs-preview-doc__toolbar">
                <span>Arquivo</span>
                <span>Editar</span>
                <span>Inserir</span>
                <span>Formatar</span>
                <span>Ferramentas</span>
              </div>
              <div className="docs-preview-doc__page">
                <h3>Introdução</h3>
                <p>
                  Produzir e compartilhar conhecimento para o fortalecimento do SUS exige escrita clara,
                  método consistente e diálogo com evidências...
                </p>
                <h3>Objetivo</h3>
                <p>Analisar de que maneira a pandemia de COVID-19 intensificou desigualdades estruturais.</p>
              </div>
            </div>

            <div className="docs-preview-sidebar">
              <div className="docs-preview-sidebar__tabs">
                <span className="active">Leitura</span>
                <span>Referências</span>
                <span>Radar</span>
              </div>
              <div className="docs-preview-sidebar__panel">
                <strong>WebLab</strong>
                <div>
                  <span>Resumo incompleto</span>
                  <small>Falta objetivo, método e conclusão.</small>
                </div>
                <div>
                  <span>4 afirmações sem citação</span>
                  <small>Sugira fontes com um clique.</small>
                </div>
                <div>
                  <span>Revistas promissoras</span>
                  <small>3 candidatas fortes na shortlist.</small>
                </div>
              </div>
            </div>
          </div>
        </div>
      </aside>
    </section>
  );
}
