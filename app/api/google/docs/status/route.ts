import { NextRequest, NextResponse } from "next/server";

import { isGoogleDocsConfigured } from "@/lib/google-docs-server";
import { getSupabaseAdminClient, getSupabaseServerClient } from "@/lib/supabase/admin";

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

export async function GET(request: NextRequest) {
  const user = await getAuthenticatedUser(request);

  if (!user) {
    return NextResponse.json({ error: "Sessão inválida." }, { status: 401 });
  }

  const admin = getSupabaseAdminClient();
  const { data: integration } = await admin
    .from("google_integracoes")
    .select("google_email, updated_at")
    .eq("user_id", user.id)
    .maybeSingle();

  return NextResponse.json({
    configured: isGoogleDocsConfigured(),
    connected: Boolean(integration),
    googleEmail: integration?.google_email ?? null,
    updatedAt: integration?.updated_at ?? null,
  });
}
