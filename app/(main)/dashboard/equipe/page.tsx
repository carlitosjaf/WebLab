"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import { PublicPageHero } from "@/components/public/public-layout";
import {
  defaultTeamSiteContent,
  getTeamSiteContentFromRow,
  groupTeamMembersByCategory,
  type TeamSiteContentRow,
  type TeamSiteContentState
} from "@/lib/site-content";
import { getSupabaseClient } from "@/lib/supabaseClient";

export default function TeamPage() {
  const router = useRouter();
  const [content, setContent] = useState<TeamSiteContentState>(defaultTeamSiteContent);
  const [isLoading, setIsLoading] = useState(true);
  const featuredMember =
    content.integrantes.find((member) => member.categoria.toLowerCase().includes("coord")) ??
    content.integrantes[0];
  const groupedMembers = groupTeamMembersByCategory(
    content.integrantes.filter((member) => member.nome !== featuredMember?.nome)
  );

  useEffect(() => {
    let isMounted = true;

    const loadTeamContent = async () => {
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

      const { data: profile } = await supabase
        .from("perfis")
        .select("equipe_id")
        .eq("id", user.id)
        .maybeSingle();

      if (!profile?.equipe_id) {
        if (isMounted) {
          setIsLoading(false);
        }
        return;
      }

      const { data: team } = await supabase
        .from("equipes")
        .select("nome")
        .eq("id", profile.equipe_id)
        .maybeSingle();

      const { data: loadedContent } = await supabase
        .from("conteudos_site_equipe")
        .select("id, equipe_id, titulo_publico, resumo_publico, integrantes, updated_at")
        .eq("equipe_id", profile.equipe_id)
        .maybeSingle();

      if (isMounted) {
        setContent(getTeamSiteContentFromRow((loadedContent as TeamSiteContentRow | null) ?? null, team?.nome));
        setIsLoading(false);
      }
    };

    void loadTeamContent();

    return () => {
      isMounted = false;
    };
  }, [router]);

  return (
    <main className="lovable-home">
      <PublicPageHero description={content.resumoPublico} title={content.tituloPublico} />

      <section className="public-content-section">
        <div className="lovable-container">
          {isLoading ? (
            <article className="team-pi-card">
              <div />
              <div>
                <h2>Carregando equipe...</h2>
                <p>Sincronizando conteúdo do laboratório.</p>
              </div>
            </article>
          ) : null}

          {!isLoading && featuredMember ? (
            <article className="team-pi-card">
              <div className="team-pi-photo">
                <img alt={featuredMember.nome} src={featuredMember.imagem || "/team-pi.jpg"} />
              </div>
              <div>
                <h2>{featuredMember.nome}</h2>
                <p className="team-role">{featuredMember.funcao}</p>
                <p className="team-education">{featuredMember.categoria}</p>
                <p>{content.resumoPublico}</p>
                {featuredMember.email ? (
                  <a className="public-inline-link" href={`mailto:${featuredMember.email}`}>
                    {featuredMember.email}
                  </a>
                ) : null}
              </div>
            </article>
          ) : null}

          {!isLoading && Object.keys(groupedMembers).length === 0 ? (
            <div className="team-section-block">
              <h2>Equipe</h2>
              <div className="public-empty-line" />
            </div>
          ) : null}

          {Object.entries(groupedMembers).map(([category, members]) => (
            <div className="team-section-block" key={category}>
              <h2>{category}</h2>
              <div className="team-grid">
                {members.map((member) => (
                  <article className="team-member-card" key={`${member.nome}-${member.funcao}`}>
                    <img alt="" src={member.imagem || "/team-pi.jpg"} />
                    <div>
                      <h3>{member.nome}</h3>
                      <p>{member.funcao}</p>
                    </div>
                  </article>
                ))}
              </div>
            </div>
          ))}
        </div>
      </section>
    </main>
  );
}
