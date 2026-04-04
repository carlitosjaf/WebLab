"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

import { LattesExportCard } from "@/components/lattes/lattes-export-card";
import { getSupabaseClient } from "@/lib/supabaseClient";
import type { ArticleRow, UserRole } from "@/lib/types";

export default function LattesAssistantPage() {
  const router = useRouter();
  const [articles, setArticles] = useState<ArticleRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let isMounted = true;

    const loadApprovedArticles = async () => {
      const supabase = getSupabaseClient();
      setIsLoading(true);

      const {
        data: { user }
      } = await supabase.auth.getUser();

      if (!user) {
        if (isMounted) {
          router.replace("/");
        }
        return;
      }

      const { data: profile } = await supabase
        .from("perfis")
        .select("equipe_id, role")
        .eq("id", user.id)
        .single();

      if (profile?.equipe_id || profile?.role === "coordenador_geral") {
        let lattesQuery = supabase
          .from("artigos")
          .select("id, titulo, status, conteudo_json, autor_id, equipe_id, updated_at, last_editor_id")
          .eq("status", "aprovado")
          .order("titulo", { ascending: true });

        if ((profile.role as UserRole) !== "coordenador_geral" && profile.equipe_id) {
          lattesQuery = lattesQuery.eq("equipe_id", profile.equipe_id);
        }

        const { data: teamArticles } = await lattesQuery;

        if (isMounted && teamArticles) {
          setArticles(teamArticles);
        }
      }

      if (isMounted) {
        setIsLoading(false);
      }
    };

    void loadApprovedArticles();

    return () => {
      isMounted = false;
    };
  }, [router]);

  return (
    <main className="shell">
      <div className="container" style={{ display: "grid", gap: "32px", padding: "12px 0" }}>
        <div className="glass-card" style={{ padding: "32px", display: "grid", gap: "16px" }}>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "flex-start",
              flexWrap: "wrap",
              gap: "16px"
            }}
          >
            <div style={{ display: "grid", gap: "8px" }}>
              <span
                className="muted"
                style={{
                  fontWeight: 600,
                  textTransform: "uppercase",
                  fontSize: "0.85rem",
                  letterSpacing: "0.05em"
                }}
              >
                CNPq
              </span>
              <h1 style={{ margin: 0 }}>Assistente Lattes</h1>
              <p className="muted" style={{ margin: 0, maxWidth: "60ch" }}>
                Esta area organiza os artigos aprovados para facilitar o preenchimento manual do
                Lattes. Onde ainda faltarem metadados reais do periodico, o WebLab deixa isso
                explicito como rascunho assistido.
              </p>
            </div>
            <Link href="/dashboard" className="button button-secondary" style={{ textDecoration: "none" }}>
              Voltar ao dashboard
            </Link>
          </div>
        </div>

        {isLoading ? (
          <p className="muted" style={{ padding: "0 12px" }}>
            Buscando publicacoes aprovadas...
          </p>
        ) : (
          <div style={{ display: "grid", gap: "24px" }}>
            <h2 style={{ padding: "0 12px", margin: "12px 0 0" }}>
              Artigos prontos para organizar no Lattes ({articles.length})
            </h2>

            {articles.length === 0 ? (
              <div className="glass-card" style={{ padding: "32px", textAlign: "center" }}>
                Nenhum artigo foi marcado como aprovado ainda.
              </div>
            ) : (
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fit, minmax(400px, 1fr))",
                  gap: "24px"
                }}
              >
                {articles.map((article) => (
                  <LattesExportCard key={article.id} article={article} />
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </main>
  );
}
