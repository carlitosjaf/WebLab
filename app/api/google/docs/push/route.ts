import { NextRequest, NextResponse } from "next/server";

import { isGoogleDocsConfigured, pushArticleContentToGoogleDocument } from "@/lib/google-docs-server";
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
      return NextResponse.json({ error: "A integracao com Google Docs ainda nao esta configurada." }, { status: 503 });
    }

    const user = await getAuthenticatedUser(request);
    if (!user) {
      return NextResponse.json({ error: "Sessao invalida." }, { status: 401 });
    }

    const body = (await request.json()) as { articleId?: string };
    if (!body.articleId) {
      return NextResponse.json({ error: "Informe o artigo para enviar ao Google Docs." }, { status: 400 });
    }

    const admin = getSupabaseAdminClient();
    const [{ data: profile }, { data: article }, { data: integration }] = await Promise.all([
      admin.from("perfis").select("id, equipe_id, role").eq("id", user.id).maybeSingle(),
      admin
        .from("artigos")
        .select(
          "id, titulo, status, conteudo_json, autor_id, equipe_id, google_doc_id, google_doc_url, google_last_synced_at, updated_at, last_editor_id"
        )
        .eq("id", body.articleId)
        .maybeSingle(),
      admin.from("google_integracoes").select("*").eq("user_id", user.id).maybeSingle(),
    ]);

    if (!profile || !article) {
      return NextResponse.json({ error: "Nao foi possivel localizar o manuscrito ou o perfil." }, { status: 404 });
    }

    const canEdit =
      (profile.role as UserRole) === "coordenador_geral" ||
      (profile.equipe_id && profile.equipe_id === (article as ArticleRow).equipe_id);

    if (!canEdit) {
      return NextResponse.json({ error: "Apenas a equipe autora pode atualizar o Google Docs deste manuscrito." }, { status: 403 });
    }

    if (!article.google_doc_id) {
      return NextResponse.json({ error: "Este manuscrito ainda nao tem um documento Google vinculado." }, { status: 400 });
    }

    if (!integration?.refresh_token) {
      return NextResponse.json({ error: "Conecte sua conta Google antes de enviar o manuscrito." }, { status: 400 });
    }

    const pushed = await pushArticleContentToGoogleDocument({
      documentId: article.google_doc_id,
      title: article.titulo,
      content: article.conteudo_json,
      accessToken: integration.access_token,
      refreshToken: integration.refresh_token,
      expiryDate: integration.expiry_date ? new Date(integration.expiry_date).getTime() : null,
    });

    const { data: updatedArticle, error: updateError } = await admin
      .from("artigos")
      .update({
        google_doc_url: pushed.documentUrl,
        google_last_synced_at: pushed.syncedAt,
        updated_at: pushed.syncedAt,
        last_editor_id: user.id,
      })
      .eq("id", article.id)
      .select(
        "id, titulo, status, conteudo_json, autor_id, equipe_id, google_doc_id, google_doc_url, google_last_synced_at, updated_at, last_editor_id"
      )
      .single();

    if (updateError || !updatedArticle) {
      return NextResponse.json({ error: updateError?.message ?? "Nao foi possivel salvar o checkpoint local." }, { status: 500 });
    }

    return NextResponse.json({
      article: updatedArticle,
      syncedAt: pushed.syncedAt,
      docUrl: pushed.documentUrl,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Nao foi possivel enviar o manuscrito ao Google Docs." },
      { status: 500 }
    );
  }
}
