"use client";

import Link from "next/link";
import type { Route } from "next";
import { useEffect, useMemo, useState } from "react";

import {
  buildGoogleDocCreateUrl,
  buildGoogleDocUrl,
  extractGoogleDocId,
  formatGoogleDocSyncLabel,
  inferGoogleDocSyncStatus,
} from "@/lib/google-docs";
import { getSupabaseClient } from "@/lib/supabaseClient";
import type { ArticleRow } from "@/lib/types";
import { formatRelativeUpdate, formatStatusLabel } from "@/lib/weblab";

type GoogleDocsWorkspaceCardProps = {
  article: ArticleRow;
  canEdit: boolean;
  onLinkDocument: (payload: { docId: string; docUrl: string }) => Promise<void>;
  onMarkSynced: () => Promise<void>;
  onClearGoogleDoc: () => Promise<void>;
  onApplyGoogleDocMeta: (payload: {
    docId: string;
    docUrl: string;
    syncedAt: string;
  }) => void;
};

export function GoogleDocsWorkspaceCard({
  article,
  canEdit,
  onLinkDocument,
  onMarkSynced,
  onClearGoogleDoc,
  onApplyGoogleDocMeta,
}: GoogleDocsWorkspaceCardProps) {
  const [docInput, setDocInput] = useState(article.google_doc_url ?? article.google_doc_id ?? "");
  const [message, setMessage] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [copiedHint, setCopiedHint] = useState<string | null>(null);
  const [isProvisioning, setIsProvisioning] = useState(false);
  const [googleStatus, setGoogleStatus] = useState<{
    configured: boolean;
    connected: boolean;
    googleEmail: string | null;
    updatedAt: string | null;
  } | null>(null);

  const docUrl = buildGoogleDocUrl(article.google_doc_id) ?? article.google_doc_url;
  const syncStatus = inferGoogleDocSyncStatus(article.google_doc_id, article.google_last_synced_at, article.updated_at);
  const syncLabel = formatGoogleDocSyncLabel(syncStatus);
  const bootBriefing = useMemo(
    () =>
      [
        article.titulo,
        "",
        "Resumo",
        "Objetivo:",
        "Método:",
        "Achado principal:",
        "Contribuição:",
        "",
        "Próximos passos no WebLab",
        "- revisar leitura cognitiva",
        "- validar referências",
        "- rodar radar editorial",
        "- fechar checklist de submissão",
      ].join("\n"),
    [article.titulo]
  );

  const checklist = useMemo(
    () => [
      {
        label: "Criar o documento",
        done: Boolean(article.google_doc_id),
        detail: article.google_doc_id ? "O manuscrito já tem um documento principal." : "Abra o Docs, gere o arquivo e volte com o link.",
      },
      {
        label: "Vincular ao WebLab",
        done: Boolean(article.google_doc_id),
        detail: article.google_doc_id ? "O WebLab já sabe qual documento acompanhar." : "Cole o link do Google Docs para conectar o manuscrito.",
      },
      {
        label: "Registrar checkpoint",
        done: Boolean(article.google_last_synced_at),
        detail: article.google_last_synced_at
          ? `Ultimo checkpoint em ${formatRelativeUpdate(article.google_last_synced_at)}`
          : "Use a leitura cognitiva para sincronizar o texto real do Google Docs.",
      },
      {
        label: "Editor clássico",
        done: true,
        detail: "Continua disponível como fallback enquanto refinamos a integração.",
      },
    ],
    [article.google_doc_id, article.google_last_synced_at]
  );

  useEffect(() => {
    setDocInput(article.google_doc_url ?? article.google_doc_id ?? "");
  }, [article.google_doc_id, article.google_doc_url]);

  useEffect(() => {
    let isMounted = true;

    const loadGoogleStatus = async () => {
      try {
        const supabase = getSupabaseClient();
        const {
          data: { session },
        } = await supabase.auth.getSession();

        if (!session?.access_token) {
          return;
        }

        const response = await fetch("/api/google/docs/status", {
          headers: {
            authorization: `Bearer ${session.access_token}`,
          },
        });

        if (!response.ok) {
          return;
        }

        const payload = (await response.json()) as {
          configured: boolean;
          connected: boolean;
          googleEmail: string | null;
          updatedAt: string | null;
        };

        if (isMounted) {
          setGoogleStatus(payload);
        }
      } catch {
        // keep silent, the panel already has local fallback states
      }
    };

    void loadGoogleStatus();

    return () => {
      isMounted = false;
    };
  }, []);

  const handleCopy = async (label: string, value: string) => {
    try {
      await navigator.clipboard.writeText(value);
      setCopiedHint(label);
      window.setTimeout(() => setCopiedHint((current) => (current === label ? null : current)), 1800);
    } catch {
      setMessage("Não consegui copiar automaticamente. Tente de novo em alguns segundos.");
    }
  };

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

  const handleOpenGoogleFlow = async () => {
    if (docUrl) {
      window.open(docUrl, "_blank", "noopener,noreferrer");
      return;
    }

    if (!canEdit) {
      setMessage("Somente a equipe autora pode conectar ou criar o documento Google.");
      return;
    }

    setIsProvisioning(true);
    setMessage(null);

    try {
      const supabase = getSupabaseClient();
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session?.access_token) {
        throw new Error("Sua sessão expirou. Entre novamente antes de conectar o Google Docs.");
      }

      const response = await fetch("/api/google/docs/connect", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          articleId: article.id,
          title: article.titulo,
        }),
      });

      const payload = (await response.json()) as
        | { error?: string; mode?: never }
        | { mode: "authorize"; authUrl: string }
        | { mode: "created"; docId: string; docUrl: string; syncedAt: string };

      if (!response.ok) {
        throw new Error("error" in payload && payload.error ? payload.error : "Não foi possível abrir o fluxo do Google Docs.");
      }

      if ("mode" in payload && payload.mode === "authorize") {
        window.location.assign(payload.authUrl);
        return;
      }

      if ("mode" in payload && payload.mode === "created") {
        onApplyGoogleDocMeta({
          docId: payload.docId,
          docUrl: payload.docUrl,
          syncedAt: payload.syncedAt,
        });
        window.open(payload.docUrl, "_blank", "noopener,noreferrer");
        setMessage("Documento criado e conectado automaticamente.");
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Não foi possível abrir o fluxo do Google Docs.");
    } finally {
      setIsProvisioning(false);
    }
  };

  const handleDisconnectGoogle = async () => {
    setIsProvisioning(true);
    setMessage(null);

    try {
      const supabase = getSupabaseClient();
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session?.access_token) {
        throw new Error("Sua sessão expirou. Entre novamente antes de desconectar o Google.");
      }

      const response = await fetch("/api/google/docs/disconnect", {
        method: "POST",
        headers: {
          authorization: `Bearer ${session.access_token}`,
        },
      });

      const payload = (await response.json()) as { error?: string; ok?: boolean };
      if (!response.ok) {
        throw new Error(payload.error ?? "Não foi possível desconectar a conta Google.");
      }

      setGoogleStatus((current) =>
        current
          ? {
              ...current,
              connected: false,
              googleEmail: null,
              updatedAt: null,
            }
          : {
              configured: true,
              connected: false,
              googleEmail: null,
              updatedAt: null,
            }
      );
      setMessage("Conta Google desconectada do WebLab.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Não foi possível desconectar a conta Google.");
    } finally {
      setIsProvisioning(false);
    }
  };

  const handleClearArticleLink = async () => {
    setIsSaving(true);
    setMessage(null);

    try {
      await onClearGoogleDoc();
      setDocInput("");
      setMessage("Documento desvinculado deste manuscrito.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Não foi possível desvincular o documento.");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <section className="manuscript-hub">
      <div className="manuscript-hub__content">
        <div className="manuscript-hub__eyebrow-row">
          <span className="eyebrow">manuscrito conectado</span>
          <span className={`manuscript-sync-chip manuscript-sync-chip--${syncStatus}`}>{syncLabel}</span>
        </div>

        <h2>Escreva no Google Docs. Coordene tudo aqui.</h2>
        <p>
          O Google Docs assume a escrita, o autosave e a colaboração. O WebLab fica com a parte inteligente:
          leitura cognitiva, triagem, referências, radar editorial e decisão de submissão.
        </p>

        <div className="manuscript-hub__meta">
          <span>{formatStatusLabel(article.status)}</span>
          <span>{article.google_doc_id ? "Documento vinculado" : "Aguardando vínculo"}</span>
          {googleStatus?.connected ? <span>Conta Google: {googleStatus.googleEmail ?? "Conectada"}</span> : null}
          {googleStatus && !googleStatus.connected ? (
            <span className={!googleStatus.configured ? "is-warning" : undefined}>
              {!googleStatus.configured ? "Integração Google ainda não configurada" : "Conta Google ainda não conectada"}
            </span>
          ) : null}
          <span className={syncStatus === "atualizacao_pendente" ? "is-warning" : undefined}>
            {article.google_last_synced_at
              ? `Sincronizado em ${formatRelativeUpdate(article.google_last_synced_at)}`
              : "Sem sincronização registrada"}
          </span>
        </div>

        <div className="manuscript-hub__actions">
          <button
            className="lovable-primary-link manuscript-hub__primary-action"
            disabled={isProvisioning}
            onClick={() => void handleOpenGoogleFlow()}
            type="button"
          >
            {isProvisioning
              ? "Preparando Google Docs..."
              : docUrl
                ? "Abrir no Google Docs"
                : "Criar no Google Docs"}
          </button>
          <button className="lovable-small-button" disabled={!article.google_doc_id || isSaving} onClick={() => void handleMarkSynced()} type="button">
            Registrar checkpoint
          </button>
          <button
            className="lovable-small-button"
            disabled={!googleStatus?.connected || isProvisioning}
            onClick={() => void handleDisconnectGoogle()}
            type="button"
          >
            Desconectar Google
          </button>
          <Link className="lovable-small-button" href={`/editor/${article.id}` as Route}>
            Abrir editor clássico
          </Link>
        </div>

        <div className="manuscript-hub__assist-row">
          <button className="lovable-small-button" onClick={() => void handleCopy("Título copiado", article.titulo)} type="button">
            Copiar título
          </button>
          <button className="lovable-small-button" onClick={() => void handleCopy("Briefing copiado", bootBriefing)} type="button">
            Copiar briefing inicial
          </button>
          {article.google_doc_id ? (
            <button className="lovable-small-button" disabled={isSaving} onClick={() => void handleClearArticleLink()} type="button">
              Desvincular documento
            </button>
          ) : null}
          {copiedHint ? <span className="manuscript-hub__copied">{copiedHint}</span> : null}
        </div>

        <div className="manuscript-steps">
          {checklist.map((item, index) => (
            <article className="manuscript-step-card" key={item.label}>
              <span className="manuscript-step-card__index">0{index + 1}</span>
              <strong>{item.label}</strong>
              <p>{item.detail}</p>
              <span className={`manuscript-step-card__status ${item.done ? "is-done" : "is-pending"}`}>
                {item.done ? "Feito" : "Pendente"}
              </span>
            </article>
          ))}
        </div>

        <div className="manuscript-link-panel">
          <div className="manuscript-link-panel__head">
            <strong>Vincular documento Google</strong>
            <span className="muted">
              {canEdit
                ? "Cole o link do documento ou o ID depois de criar o arquivo."
                : "Somente a equipe autora pode alterar o vínculo do Google Docs."}
            </span>
          </div>
          <div className="manuscript-link-panel__row">
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
          <div className="manuscript-link-panel__footer">
            {docUrl ? (
              <a href={docUrl} rel="noreferrer" target="_blank">
                Abrir documento vinculado →
              </a>
            ) : (
              <span>No primeiro uso, o WebLab pedirá autorização da sua conta Google e voltará já com o documento conectado.</span>
            )}
            {message ? <p className="muted">{message}</p> : null}
          </div>
        </div>
      </div>

      <aside className="manuscript-preview" aria-label="Prévia do fluxo Google Docs com WebLab">
        <div className="manuscript-preview__browser">
          <div className="manuscript-preview__bar">
            <span />
            <span />
            <span />
          </div>
          <div className="manuscript-preview__body">
            <div className="manuscript-preview__doc">
              <div className="manuscript-preview__header">
                <strong>{article.titulo}</strong>
                <small>Google Docs · Conta da equipe</small>
              </div>
              <div className="manuscript-preview__toolbar">
                <span>Arquivo</span>
                <span>Editar</span>
                <span>Inserir</span>
                <span>Formatar</span>
                <span>Ferramentas</span>
              </div>
              <div className="manuscript-preview__page">
                <h3>Introdução</h3>
                <p>
                  Produzir e compartilhar conhecimento para o fortalecimento do SUS exige escrita clara,
                  método consistente e diálogo com evidências...
                </p>
                <h3>Objetivo</h3>
                <p>Analisar de que maneira a pandemia de COVID-19 intensificou desigualdades estruturais.</p>
              </div>
            </div>

            <div className="manuscript-preview__sidebar">
              <div className="manuscript-preview__tabs">
                <span className="active">Leitura</span>
                <span>Referências</span>
                <span>Radar</span>
              </div>
              <div className="manuscript-preview__panel">
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
