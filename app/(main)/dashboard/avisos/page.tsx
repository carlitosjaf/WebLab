"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import { PublicPageHero } from "@/components/public/public-layout";
import { getSupabaseClient } from "@/lib/supabaseClient";
import type { TeamNoticeRow, UserRole } from "@/lib/types";

const categories = ["Todos", "Aviso", "Evento", "Publicação", "Prazo"] as const;

function formatNoticeDate(notice: TeamNoticeRow) {
  const date = notice.data_evento ?? notice.publicado_em;

  if (!date) {
    return "Sem data";
  }

  return new Date(notice.data_evento ? `${date}T00:00:00` : date).toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "short",
    year: "numeric"
  });
}

export default function NewsPage() {
  const router = useRouter();
  const [notices, setNotices] = useState<TeamNoticeRow[]>([]);
  const [activeCategory, setActiveCategory] = useState<(typeof categories)[number]>("Todos");
  const [canManageNotices, setCanManageNotices] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;

    const loadNotices = async () => {
      const supabase = getSupabaseClient();
      const {
        data: { user }
      } = await supabase.auth.getUser();

      if (!user) {
        router.replace("/");
        return;
      }

      const { data: profile } = await supabase
        .from("perfis")
        .select("equipe_id, role")
        .eq("id", user.id)
        .maybeSingle();

      if (!profile?.equipe_id) {
        if (isMounted) {
          setIsLoading(false);
          setMessage("Seu perfil ainda não está vinculado a uma equipe.");
        }
        return;
      }

      const role = profile.role as UserRole;

      const { data, error } = await supabase
        .from("avisos_equipe")
        .select("id, equipe_id, titulo, texto, categoria, data_evento, link_url, created_by, publicado_em, updated_at")
        .eq("equipe_id", profile.equipe_id)
        .order("publicado_em", { ascending: false });

      if (isMounted) {
        setNotices((data as TeamNoticeRow[] | null) ?? []);
        setCanManageNotices(role === "coordenador" || role === "coordenador_geral");
        setMessage(
          error?.message.includes("avisos_equipe")
            ? "A área de avisos ainda precisa da migração de configurações no Supabase."
            : error?.message ?? null
        );
        setIsLoading(false);
      }
    };

    void loadNotices();

    return () => {
      isMounted = false;
    };
  }, [router]);

  const filteredNotices =
    activeCategory === "Todos"
      ? notices
      : notices.filter((notice) => notice.categoria === activeCategory);

  return (
    <main className="lovable-home">
      <PublicPageHero
        description="Comunicados, prazos e eventos publicados pela coordenação da equipe."
        title="Avisos e eventos"
      />

      <section className="public-content-section">
        <div className="lovable-container">
          <div className="public-filter-row" aria-label="Categorias de avisos">
            {categories.map((category) => (
              <button
                className={category === activeCategory ? "public-filter active" : "public-filter"}
                key={category}
                onClick={() => setActiveCategory(category)}
                type="button"
              >
                {category}
              </button>
            ))}
          </div>

          {isLoading ? <p className="muted">Carregando avisos...</p> : null}
          {message ? <p className="muted">{message}</p> : null}

          <div className="news-page-list">
            {!isLoading && filteredNotices.length === 0 ? (
              <article className="news-page-item">
                <div>
                  <div className="lovable-news-meta">
                    <span>Avisos</span>
                    <time>WebLab</time>
                  </div>
                  <h2>Nenhum aviso publicado ainda</h2>
                  <p>Quando a coordenação publicar eventos, prazos ou novidades, eles aparecem aqui.</p>
                  {canManageNotices ? (
                    <Link className="public-inline-link" href="/configuracoes">
                      Publicar primeiro aviso →
                    </Link>
                  ) : null}
                </div>
              </article>
            ) : null}

            {filteredNotices.map((notice) => (
              <article className="news-page-item" key={notice.id}>
                <div>
                  <div className="lovable-news-meta">
                    <span>{notice.categoria}</span>
                    <time>{formatNoticeDate(notice)}</time>
                  </div>
                  <h2>{notice.titulo}</h2>
                  <p>{notice.texto}</p>
                  {notice.link_url ? (
                    <a className="public-inline-link" href={notice.link_url} rel="noreferrer" target="_blank">
                      Abrir link
                    </a>
                  ) : null}
                </div>
                <span aria-hidden="true">→</span>
              </article>
            ))}
          </div>
        </div>
      </section>
    </main>
  );
}
