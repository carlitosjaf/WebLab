"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import { DashboardShell, type DashboardArticle } from "@/components/dashboard/dashboard-shell";
import { TeamOnboarding } from "@/components/dashboard/team-onboarding";
import { getSupabaseClient } from "@/lib/supabaseClient";
import type { Database, TeamNoticeRow } from "@/lib/types";
import { normalizeInviteCode } from "@/lib/weblab";

type ProfileRow = Database["public"]["Tables"]["perfis"]["Row"];
type TeamRow = Database["public"]["Tables"]["equipes"]["Row"];

type DashboardData = {
  articles: DashboardArticle[];
  notices: TeamNoticeRow[];
  profile: ProfileRow;
  teamName: string;
};

export default function DashboardPage() {
  const router = useRouter();
  const [data, setData] = useState<DashboardData | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let isMounted = true;

    const loadDashboard = async () => {
      setIsLoading(true);

      try {
        const supabase = getSupabaseClient();
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

        const { data: rawProfile, error: profileError } = await supabase
          .from("perfis")
          .select("id, nome_completo, equipe_id, role")
          .eq("id", user.id)
          .single();

        if (profileError || !rawProfile) {
          if (isMounted) {
            setErrorMessage(profileError?.message ?? "NÃ£o foi possÃ­vel carregar o perfil.");
            setIsLoading(false);
          }
          return;
        }

        let profile = rawProfile;
        const inviteCodeFromMetadata =
          typeof user.user_metadata?.invite_code === "string"
            ? normalizeInviteCode(user.user_metadata.invite_code)
            : "";

        if (!profile.equipe_id && inviteCodeFromMetadata) {
          const { error: inviteError } = await supabase.rpc("claim_team_invite", {
            invite_code_input: inviteCodeFromMetadata
          });

          if (inviteError) {
            if (isMounted) {
              setErrorMessage(
                inviteError.message.includes("claim_team_invite")
                  ? "O WebLab precisa da funÃ§Ã£o de vÃ­nculo por convite no Supabase para concluir a associaÃ§Ã£o automÃ¡tica."
                  : inviteError.message
              );
              setIsLoading(false);
            }
            return;
          }

          const { data: updatedProfile, error: updateError } = await supabase
            .from("perfis")
            .select("id, nome_completo, equipe_id, role")
            .eq("id", profile.id)
            .single();

          if (!updateError && updatedProfile) {
            profile = updatedProfile;
          }
        }

        let teamName = "Sem equipe";
        let articles: DashboardArticle[] = [];
        let notices: TeamNoticeRow[] = [];

        if (profile.equipe_id || profile.role === "coordenador_geral") {
          const { data: teams, error: teamsError } = await supabase
            .from("equipes")
            .select("id, nome, codigo_convite");

          if (teamsError) {
            if (isMounted) {
              setErrorMessage(teamsError.message);
              setIsLoading(false);
            }
            return;
          }

          const teamMap = new Map<string, TeamRow>((teams ?? []).map((team) => [team.id, team]));

          if (profile.role === "coordenador_geral") {
            teamName = "VisÃ£o global";
          } else if (profile.equipe_id) {
            const currentTeam = teamMap.get(profile.equipe_id);
            if (currentTeam) {
              teamName = currentTeam.nome;
            }
          }

          const { data: teamArticles, error: articlesError } = await supabase
            .from("artigos")
            .select("id, titulo, status, conteudo_json, autor_id, equipe_id, updated_at, last_editor_id")
            .order("updated_at", { ascending: false, nullsFirst: false });

          if (articlesError) {
            if (isMounted) {
              setErrorMessage(
                articlesError.message.includes("updated_at") ||
                  articlesError.message.includes("last_editor_id")
                  ? "O dashboard precisa da migraÃ§Ã£o de consolidaÃ§Ã£o no Supabase para exibir Ãºltima ediÃ§Ã£o e autoria."
                  : articlesError.message
              );
              setIsLoading(false);
            }
            return;
          }

          const lastEditorIds = Array.from(
            new Set(
              (teamArticles ?? [])
                .map((article) => article.last_editor_id)
                .filter((value): value is string => Boolean(value))
            )
          );

          const profileMap = new Map<string, string>();

          if (lastEditorIds.length > 0) {
            const { data: editorProfiles } = await supabase
              .from("perfis")
              .select("id, nome_completo")
              .in("id", lastEditorIds);

            (editorProfiles ?? []).forEach((item) => {
              profileMap.set(item.id, item.nome_completo ?? "Membro da equipe");
            });
          }

          articles = (teamArticles ?? []).map((article) => ({
            ...article,
            team_name: teamMap.get(article.equipe_id)?.nome ?? "Equipe",
            last_editor_name: article.last_editor_id
              ? profileMap.get(article.last_editor_id) ?? "Membro da equipe"
              : null
          }));

          if (profile.equipe_id) {
            const { data: teamNotices } = await supabase
              .from("avisos_equipe")
              .select("id, equipe_id, titulo, texto, categoria, data_evento, link_url, created_by, publicado_em, updated_at")
              .eq("equipe_id", profile.equipe_id)
              .order("publicado_em", { ascending: false })
              .limit(3);

            notices = (teamNotices as TeamNoticeRow[] | null) ?? [];
          }
        }

        if (isMounted) {
          setData({
            articles,
            notices,
            profile,
            teamName
          });
          setErrorMessage(null);
          setIsLoading(false);
        }
      } catch (error) {
        if (isMounted) {
          setErrorMessage(
            error instanceof Error ? error.message : "Erro inesperado ao carregar o dashboard."
          );
          setIsLoading(false);
        }
      }
    };

    void loadDashboard();

    return () => {
      isMounted = false;
    };
  }, [router]);

  if (isLoading) {
    return (
      <main className="shell">
        <div className="container glass-card" style={{ padding: "32px" }}>
          <p className="muted" style={{ margin: 0 }}>
            Carregando dashboard...
          </p>
        </div>
      </main>
    );
  }

  if (errorMessage || !data) {
    return (
      <main className="shell">
        <div className="container glass-card" style={{ padding: "32px", display: "grid", gap: "12px" }}>
          <h1 style={{ margin: 0 }}>NÃ£o foi possÃ­vel abrir o dashboard</h1>
          <p className="danger" style={{ margin: 0 }}>
            {errorMessage ?? "Erro inesperado ao carregar os dados da equipe."}
          </p>
        </div>
      </main>
    );
  }

  if (!data.profile.equipe_id && data.profile.role !== "coordenador_geral") {
    return (
      <TeamOnboarding
        profileId={data.profile.id}
        profileName={data.profile.nome_completo ?? "Pesquisador"}
      />
    );
  }

  return (
    <DashboardShell
      articles={data.articles}
      notices={data.notices}
      profileId={data.profile.id}
      profileName={data.profile.nome_completo ?? "Pesquisador"}
      role={data.profile.role}
      teamName={data.teamName}
    />
  );
}
