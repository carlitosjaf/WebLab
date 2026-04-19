"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import { TriagemHub } from "@/components/triagem/triagem-hub";
import { getSupabaseClient } from "@/lib/supabaseClient";
import type { ArticleRow, UserRole } from "@/lib/types";

export default function TriagemPage() {
  const router = useRouter();
  const [articles, setArticles] = useState<ArticleRow[]>([]);
  const [profileId, setProfileId] = useState("");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let isMounted = true;

    const loadArticles = async () => {
      try {
        const supabase = getSupabaseClient();
        const {
          data: { user }
        } = await supabase.auth.getUser();

        if (!user) {
          router.replace("/");
          return;
        }

        const { data: profile, error: profileError } = await supabase
          .from("perfis")
          .select("id, equipe_id, role")
          .eq("id", user.id)
          .single();

        if (profileError || !profile) {
          if (isMounted) {
            setErrorMessage(profileError?.message ?? "Não foi possível carregar o perfil.");
            setIsLoading(false);
          }
          return;
        }

        let query = supabase
          .from("artigos")
          .select(
            "id, titulo, status, conteudo_json, autor_id, equipe_id, google_doc_id, google_doc_url, google_last_synced_at, updated_at, last_editor_id"
          )
          .order("updated_at", { ascending: false, nullsFirst: false });

        if ((profile.role as UserRole) !== "coordenador_geral" && profile.equipe_id) {
          query = query.eq("equipe_id", profile.equipe_id);
        }

        const { data, error } = await query;

        if (!isMounted) {
          return;
        }

        if (error) {
          setErrorMessage(error.message);
        } else {
          setArticles((data ?? []) as ArticleRow[]);
          setProfileId(profile.id);
          setErrorMessage(null);
        }

        setIsLoading(false);
      } catch (error) {
        if (isMounted) {
          setErrorMessage(error instanceof Error ? error.message : "Erro inesperado ao carregar a triagem.");
          setIsLoading(false);
        }
      }
    };

    void loadArticles();

    return () => {
      isMounted = false;
    };
  }, [router]);

  if (isLoading) {
    return (
      <main className="shell">
        <div className="container glass-card" style={{ padding: "32px" }}>
          <p className="muted" style={{ margin: 0 }}>
            Carregando triagem de evidências...
          </p>
        </div>
      </main>
    );
  }

  if (errorMessage) {
    return (
      <main className="shell">
        <div className="container glass-card" style={{ padding: "32px", display: "grid", gap: "12px" }}>
          <h1 style={{ margin: 0 }}>Não foi possível abrir a triagem</h1>
          <p className="danger" style={{ margin: 0 }}>
            {errorMessage}
          </p>
        </div>
      </main>
    );
  }

  if (articles.length === 0) {
    return (
      <main className="shell">
        <div className="container glass-card" style={{ padding: "32px", display: "grid", gap: "12px" }}>
          <h1 style={{ margin: 0 }}>Crie um manuscrito antes da triagem</h1>
          <p className="muted" style={{ margin: 0 }}>
            A triagem de evidências precisa estar vinculada a um artigo ou projeto da equipe.
          </p>
        </div>
      </main>
    );
  }

  return <TriagemHub articles={articles} profileId={profileId} />;
}
