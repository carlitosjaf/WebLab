import { NextRequest, NextResponse } from "next/server";

import {
  buildGoogleAuthorizationUrl,
  createGoogleDocumentFromTemplate,
  isGoogleDocsConfigured,
} from "@/lib/google-docs-server";
import { getSupabaseAdminClient, getSupabaseServerClient } from "@/lib/supabase/admin";
import type { ArticleRow, UserRole } from "@/lib/types";

async function getAuthenticatedUser(request: NextRequest) {
  const authorization = request.headers.get("authorization");
  const token = authorization?.startsWith("Bearer ") ? authorization.slice(7) : null;

  if (!token) {
    return null;
  }

  const supabase = getSupabaseServerClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser(token);

  if (error || !user) {
    return null;
  }

  return user;
}

export async function POST(request: NextRequest) {
  try {
    if (!isGoogleDocsConfigured()) {
      return NextResponse.json(
        {
          error:
            "A integração com Google Docs ainda não está configurada no servidor. Faltam as credenciais do Google Cloud.",
        },
        { status: 503 }
      );
    }

    const user = await getAuthenticatedUser(request);
    if (!user) {
      return NextResponse.json({ error: "Sessão inválida." }, { status: 401 });
    }

    const body = (await request.json()) as { articleId?: string; title?: string };
    if (!body.articleId) {
      return NextResponse.json({ error: "Informe o artigo para abrir o fluxo do Google Docs." }, { status: 400 });
    }

    const admin = getSupabaseAdminClient();
    const [{ data: profile }, { data: article }] = await Promise.all([
      admin.from("perfis").select("id, equipe_id, role").eq("id", user.id).maybeSingle(),
      admin
        .from("artigos")
        .select(
          "id, titulo, status, conteudo_json, autor_id, equipe_id, google_doc_id, google_doc_url, google_last_synced_at, updated_at, last_editor_id"
        )
        .eq("id", body.articleId)
        .maybeSingle(),
    ]);

    if (!profile || !article) {
      return NextResponse.json({ error: "Não foi possível localizar o manuscrito ou o perfil." }, { status: 404 });
    }

    const canEdit =
      (profile.role as UserRole) === "coordenador_geral" ||
      (profile.equipe_id && profile.equipe_id === (article as ArticleRow).equipe_id);

    if (!canEdit) {
      return NextResponse.json(
        { error: "Apenas a equipe autora pode conectar o Google Docs deste manuscrito." },
        { status: 403 }
      );
    }

    const { data: integration } = await admin
      .from("google_integracoes")
      .select("*")
      .eq("user_id", user.id)
      .maybeSingle();

    if (!integration?.refresh_token) {
      const authUrl = buildGoogleAuthorizationUrl({
        uid: user.id,
        articleId: body.articleId,
        title: body.title ?? (article as ArticleRow).titulo,
        returnTo: `/dashboard/artigos/${body.articleId}`,
        createdAt: Date.now(),
      });

      return NextResponse.json({
        mode: "authorize" as const,
        authUrl,
      });
    }

    const created = await createGoogleDocumentFromTemplate({
      accessToken: integration.access_token,
      refreshToken: integration.refresh_token,
      expiryDate: integration.expiry_date ? new Date(integration.expiry_date).getTime() : null,
      title: body.title ?? (article as ArticleRow).titulo,
    });

    await admin
      .from("artigos")
      .update({
        google_doc_id: created.documentId,
        google_doc_url: created.documentUrl,
        google_last_synced_at: created.syncedAt,
        updated_at: new Date().toISOString(),
      })
      .eq("id", body.articleId);

    return NextResponse.json({
      mode: "created" as const,
      docId: created.documentId,
      docUrl: created.documentUrl,
      syncedAt: created.syncedAt,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Não foi possível abrir o fluxo do Google Docs.",
      },
      { status: 500 }
    );
  }
}
