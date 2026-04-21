import { NextRequest, NextResponse } from "next/server";

import {
  createGoogleDocumentFromTemplate,
  decodeGoogleOAuthState,
  exchangeGoogleCode,
  isGoogleDocsConfigured,
} from "@/lib/google-docs-server";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import type { UserRole } from "@/lib/types";

export async function GET(request: NextRequest) {
  const nextUrl = request.nextUrl;
  const origin = nextUrl.origin;
  const code = nextUrl.searchParams.get("code");
  const rawState = nextUrl.searchParams.get("state");
  const providerError = nextUrl.searchParams.get("error");

  const fallbackRedirect = new URL("/editor", origin);

  try {
    if (!isGoogleDocsConfigured()) {
      fallbackRedirect.searchParams.set("google", "not-configured");
      return NextResponse.redirect(fallbackRedirect);
    }

    if (providerError) {
      fallbackRedirect.searchParams.set("google", "denied");
      return NextResponse.redirect(fallbackRedirect);
    }

    if (!code || !rawState) {
      fallbackRedirect.searchParams.set("google", "invalid");
      return NextResponse.redirect(fallbackRedirect);
    }

    const state = decodeGoogleOAuthState(rawState);
    const { tokens, profile } = await exchangeGoogleCode(code);
    const admin = getSupabaseAdminClient();

    await admin.from("google_integracoes").upsert(
      {
        user_id: state.uid,
        google_email: profile.data.email ?? null,
        access_token: tokens.access_token ?? null,
        refresh_token: tokens.refresh_token ?? null,
        scope: tokens.scope ?? null,
        token_type: tokens.token_type ?? null,
        expiry_date: tokens.expiry_date ? new Date(tokens.expiry_date).toISOString() : null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id" }
    );

    let redirectTo = new URL(state.returnTo ?? "/editor", origin);

    if (state.articleId) {
      const [{ data: profileRow }, { data: article }] = await Promise.all([
        admin.from("perfis").select("id, equipe_id, role").eq("id", state.uid).maybeSingle(),
        admin
          .from("artigos")
          .select("id, titulo, equipe_id, conteudo_json")
          .eq("id", state.articleId)
          .maybeSingle(),
      ]);

      const canEdit =
        profileRow &&
        article &&
        ((profileRow.role as UserRole) === "coordenador_geral" || profileRow.equipe_id === article.equipe_id);

      if (canEdit && article) {
        const created = await createGoogleDocumentFromTemplate({
          accessToken: tokens.access_token ?? null,
          refreshToken: tokens.refresh_token ?? null,
          expiryDate: tokens.expiry_date ?? null,
          title: state.title ?? article.titulo,
          seedContent: article.conteudo_json,
        });

        await admin
          .from("artigos")
          .update({
            google_doc_id: created.documentId,
            google_doc_url: created.documentUrl,
            google_last_synced_at: created.syncedAt,
            updated_at: new Date().toISOString(),
          })
          .eq("id", article.id);

        redirectTo = new URL(`/editor/${article.id}`, origin);
        redirectTo.searchParams.set("google", "connected");
      } else {
        redirectTo.searchParams.set("google", "connected");
      }
    } else {
      redirectTo.searchParams.set("google", "connected");
    }

    return NextResponse.redirect(redirectTo);
  } catch {
    fallbackRedirect.searchParams.set("google", "error");
    return NextResponse.redirect(fallbackRedirect);
  }
}
