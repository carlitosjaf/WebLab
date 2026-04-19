"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import { PeriodicosHub } from "@/components/periodicos/periodicos-hub";
import { getSupabaseClient } from "@/lib/supabaseClient";
import type { ArticleRow, UserRole } from "@/lib/types";

export default function PeriodicosPage() {
  const router = useRouter();
  const [articles, setArticles] = useState<ArticleRow[]>([]);
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
          if (isMounted) {
            router.replace("/");
          }
          return;
        }

        const { data: profile, error: profileError } = await supabase
          .from("perfis")
          .select("equipe_id, role")
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

        if (error) {
          if (isMounted) {
            setErrorMessage(error.message);
            setIsLoading(false);
          }
          return;
        }

        if (isMounted) {
          setArticles(data ?? []);
          setErrorMessage(null);
          setIsLoading(false);
        }
      } catch (error) {
        if (isMounted) {
          setErrorMessage(
            error instanceof Error ? error.message : "Erro inesperado ao carregar os artigos."
          );
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
            Carregando módulo de periódicos...
          </p>
        </div>
      </main>
    );
  }

  if (errorMessage) {
    return (
      <main className="shell">
        <div className="container glass-card" style={{ padding: "32px", display: "grid", gap: "12px" }}>
          <h1 style={{ margin: 0 }}>Não foi possível abrir o localizador de revistas</h1>
          <p className="danger" style={{ margin: 0 }}>
            {errorMessage}
          </p>
        </div>
      </main>
    );
  }

  return <PeriodicosHub articles={articles} />;
}
