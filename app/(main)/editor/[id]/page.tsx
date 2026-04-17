"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";

import { ArticleEditor } from "@/components/editor/article-editor";
import { getSupabaseClient } from "@/lib/supabaseClient";
import type { ArticleRow, UserRole } from "@/lib/types";

export default function EditorPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const [article, setArticle] = useState<ArticleRow | null>(null);
  const [canEdit, setCanEdit] = useState(true);
  const [readOnlyReason, setReadOnlyReason] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let isMounted = true;

    const loadArticle = async () => {
      const supabase = getSupabaseClient();
      setIsLoading(true);

      const {
        data: { user },
        error: userError
      } = await supabase.auth.getUser();

      if (userError || !user) {
        if (isMounted) {
          router.replace("/");
        }
        return;
      }

      const [{ data: profile, error: profileError }, { data, error }] = await Promise.all([
        supabase.from("perfis").select("equipe_id, role").eq("id", user.id).maybeSingle(),
        supabase
          .from("artigos")
          .select("id, titulo, status, conteudo_json, autor_id, equipe_id, updated_at, last_editor_id")
          .eq("id", params.id)
          .single()
      ]);

      if (profileError || !profile) {
        if (isMounted) {
          setErrorMessage(profileError?.message ?? "N?o foi poss?vel carregar seu perfil.");
          setIsLoading(false);
        }
        return;
      }

      if (error || !data) {
        if (isMounted) {
          setErrorMessage(error?.message ?? "Artigo n?o encontrado.");
          setIsLoading(false);
        }
        return;
      }

      const profileRole = profile.role as UserRole;
      const sameTeam = Boolean(profile.equipe_id) && profile.equipe_id === data.equipe_id;
      const allowEdit = profileRole === "coordenador_geral" || sameTeam;

      if (isMounted) {
        setArticle(data);
        setCanEdit(allowEdit);
        setReadOnlyReason(
          allowEdit
            ? null
            : "Este manuscrito foi compartilhado entre equipes apenas para leitura porque ja esta submetido ou aprovado."
        );
        setErrorMessage(null);
        setIsLoading(false);
      }
    };

    if (params.id) {
      void loadArticle();
    }

    return () => {
      isMounted = false;
    };
  }, [params.id, router]);

  if (isLoading) {
    return (
      <main className="shell">
        <div className="container glass-card" style={{ padding: "32px" }}>
          <p className="muted" style={{ margin: 0 }}>
            Carregando artigo...
          </p>
        </div>
      </main>
    );
  }

  if (errorMessage || !article) {
    return (
      <main className="shell">
        <div className="container glass-card" style={{ padding: "32px", display: "grid", gap: "12px" }}>
          <h1 style={{ margin: 0 }}>N?o foi poss?vel abrir o artigo</h1>
          <p className="danger" style={{ margin: 0 }}>
            {errorMessage ?? "Erro inesperado ao carregar o artigo."}
          </p>
        </div>
      </main>
    );
  }

  return <ArticleEditor article={article} canEdit={canEdit} readOnlyReason={readOnlyReason} />;
}
