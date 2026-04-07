"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { getSupabaseClient } from "@/lib/supabaseClient";
import { generateInviteCode } from "@/lib/weblab";

type TeamOnboardingProps = {
  profileId: string;
  profileName: string;
};

export function TeamOnboarding({ profileId, profileName }: TeamOnboardingProps) {
  const router = useRouter();
  const [teamName, setTeamName] = useState("");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const handleCreateTeam = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!teamName.trim()) {
      setErrorMessage("Digite um nome para a equipe.");
      return;
    }

    setErrorMessage(null);
    setSuccessMessage(null);

    startTransition(async () => {
      try {
        const supabase = getSupabaseClient();

        const { data: createdTeam, error: teamError } = await supabase
          .from("equipes")
          .insert({
            nome: teamName.trim(),
            codigo_convite: generateInviteCode(teamName.trim())
          })
          .select("id")
          .single();

        if (teamError || !createdTeam) {
          setErrorMessage(
            teamError?.message?.includes("codigo_convite")
              ? "O banco ainda não recebeu a migração de código de convite. Rode o SQL de consolidação do WebLab no Supabase."
              : teamError?.message ?? "Não foi possível criar a equipe."
          );
          return;
        }

        const { error: profileError } = await supabase
          .from("perfis")
          .update({
            equipe_id: createdTeam.id,
            role: "coordenador"
          })
          .eq("id", profileId);

        if (profileError) {
          setErrorMessage(profileError.message);
          return;
        }

        setSuccessMessage("Equipe criada. Abrindo dashboard...");
        window.location.assign("/dashboard");
      } catch (error) {
        setErrorMessage(
          error instanceof Error ? error.message : "Não foi possível concluir a configuração da equipe."
        );
      }
    });
  };

  return (
    <main className="shell">
      <div
        className="container"
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))",
          gap: "24px",
          alignItems: "stretch"
        }}
      >
        <section
          className="glass-card"
          style={{
            padding: "32px",
            display: "grid",
            gap: "20px",
            alignContent: "start"
          }}
        >
          <span
            style={{
              width: "fit-content",
              padding: "8px 12px",
              borderRadius: "999px",
              background: "var(--accent-soft)",
              color: "var(--accent-strong)",
              fontWeight: 700,
              fontSize: "0.88rem"
            }}
          >
            Primeiro acesso
          </span>

          <div style={{ display: "grid", gap: "10px" }}>
            <h1 style={{ margin: 0, fontSize: "clamp(2rem, 5vw, 3.3rem)" }}>
              Vamos montar a base da sua equipe no WebLab.
            </h1>
            <p className="muted" style={{ margin: 0, maxWidth: "54ch" }}>
              {profileName || "Pesquisador"}, antes de abrir o dashboard, precisamos vincular seu
              perfil a uma equipe. Isso garante o isolamento dos artigos e a organização do trabalho
              colaborativo.
            </p>
          </div>

          <div
            style={{
              display: "grid",
              gap: "14px",
              padding: "22px",
              borderRadius: "24px",
              background: "rgba(255,255,255,0.7)",
              border: "1px solid rgba(36,26,19,0.08)"
            }}
          >
            <strong>O que acontece ao criar a equipe</strong>
            <span className="muted">
              Seu perfil vira coordenador da nova equipe e todos os artigos criados depois ficam
              vinculados automaticamente a ela pelo banco.
            </span>
          </div>
        </section>

        <section className="glass-card" style={{ padding: "32px", display: "grid", gap: "20px" }}>
          <div style={{ display: "grid", gap: "8px" }}>
            <h2 style={{ margin: 0 }}>Criar equipe</h2>
            <p className="muted" style={{ margin: 0 }}>
              Escolha um nome claro para o seu laboratório, grupo de pesquisa ou núcleo editorial.
            </p>
          </div>

          <form onSubmit={handleCreateTeam} style={{ display: "grid", gap: "16px" }}>
            <div className="field">
              <label htmlFor="teamName">Nome da equipe</label>
              <input
                id="teamName"
                onChange={(event) => setTeamName(event.target.value)}
                placeholder="Ex.: Laboratório de Vigilância Translacional"
                value={teamName}
              />
            </div>

            {errorMessage ? (
              <p className="danger" style={{ margin: 0 }}>
                {errorMessage}
              </p>
            ) : null}

            {successMessage ? (
              <p className="muted" style={{ margin: 0 }}>
                {successMessage}
              </p>
            ) : null}

            <button className="button button-primary" disabled={isPending} type="submit">
              {isPending ? "Criando equipe..." : "Criar equipe e abrir dashboard"}
            </button>
          </form>
        </section>
      </div>
    </main>
  );
}
