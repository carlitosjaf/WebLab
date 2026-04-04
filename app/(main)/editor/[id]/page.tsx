"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";

import { ArticleEditor } from "@/components/editor/article-editor";
import { getSupabaseClient } from "@/lib/supabaseClient";
import type { ArticleRow } from "@/lib/types";

export default function EditorPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const [article, setArticle] = useState<ArticleRow | null>(null);
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

      const { data, error } = await supabase
        .from("artigos")
        .select("id, titulo, status, conteudo_json, autor_id, equipe_id, updated_at, last_editor_id")
        .eq("id", params.id)
        .single();

      if (error || !data) {
        if (isMounted) {
          setErrorMessage(error?.message ?? "Artigo nao encontrado.");
          setIsLoading(false);
        }
        return;
      }

      if (isMounted) {
        setArticle(data);
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
          <h1 style={{ margin: 0 }}>Nao foi possivel abrir o artigo</h1>
          <p className="danger" style={{ margin: 0 }}>
            {errorMessage ?? "Erro inesperado ao carregar o artigo."}
          </p>
        </div>
      </main>
    );
  }

  return <ArticleEditor article={article} />;
}
