"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import { DashboardShell, type DashboardArticle } from "@/components/dashboard/dashboard-shell";
import { TeamOnboarding } from "@/components/dashboard/team-onboarding";
import { getSupabaseClient } from "@/lib/supabaseClient";
import type { Database } from "@/lib/types";
import { normalizeInviteCode } from "@/lib/weblab";

type ProfileRow = Database["public"]["Tables"]["perfis"]["Row"];
type TeamRow = Database["public"]["Tables"]["equipes"]["Row"];

type DashboardData = {
  articles: DashboardArticle[];
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
            setErrorMessage(profileError?.message ?? "Nao foi possivel carregar o perfil.");
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
                  ? "O WebLab precisa da funcao de vinculo por convite no Supabase para concluir a associacao automatica."
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

        if (profile.equipe_id || profile.role === "coordenador_geral") {
          let teamMap = new Map<string, TeamRow>();

          if (profile.role === "coordenador_geral") {
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

            teamMap = new Map((teams ?? []).map((team) => [team.id, team]));
            teamName = "Visao global";
          } else if (profile.equipe_id) {
            const { data: team, error: teamError } = await supabase
              .from("equipes")
              .select("id, nome, codigo_convite")
              .eq("id", profile.equipe_id)
              .single();

            if (teamError) {
              if (isMounted) {
                setErrorMessage(teamError.message);
                setIsLoading(false);
              }
              return;
            }

            if (team) {
              teamName = team.nome;
              teamMap.set(team.id, team);
            }
          }

          let articlesQuery = supabase
            .from("artigos")
            .select("id, titulo, status, conteudo_json, autor_id, equipe_id, updated_at, last_editor_id")
            .order("updated_at", { ascending: false, nullsFirst: false });

          if (profile.role !== "coordenador_geral" && profile.equipe_id) {
            articlesQuery = articlesQuery.eq("equipe_id", profile.equipe_id);
          }

          const { data: teamArticles, error: articlesError } = await articlesQuery;

          if (articlesError) {
            if (isMounted) {
              setErrorMessage(
                articlesError.message.includes("updated_at") ||
                  articlesError.message.includes("last_editor_id")
                  ? "O dashboard precisa da migracao de consolidacao no Supabase para exibir ultima edicao e autoria."
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
        }

        if (isMounted) {
          setData({
            articles,
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
          <h1 style={{ margin: 0 }}>Nao foi possivel abrir o dashboard</h1>
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
      profileId={data.profile.id}
      profileName={data.profile.nome_completo ?? "Pesquisador"}
      role={data.profile.role}
      teamName={data.teamName}
    />
  );
}
