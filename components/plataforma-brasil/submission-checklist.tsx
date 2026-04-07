"use client";

import { useEffect, useState, useTransition } from "react";

import { getSupabaseClient } from "@/lib/supabaseClient";

type ChecklistState = {
  tcle_gerado: boolean;
  cronograma_pronto: boolean;
  orcamento_detalhado: boolean;
};

const defaultChecklist: ChecklistState = {
  tcle_gerado: false,
  cronograma_pronto: false,
  orcamento_detalhado: false
};

export function SubmissionChecklist() {
  const [teamId, setTeamId] = useState<string | null>(null);
  const [checklist, setChecklist] = useState<ChecklistState>(defaultChecklist);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [savedMessage, setSavedMessage] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    let isMounted = true;

    const loadChecklist = async () => {
      try {
        const supabase = getSupabaseClient();
        const {
          data: { user }
        } = await supabase.auth.getUser();

        if (!user) {
          if (isMounted) {
            setErrorMessage("Entre novamente para acessar o checklist da equipe.");
            setIsLoading(false);
          }
          return;
        }

        const { data: profile, error: profileError } = await supabase
          .from("perfis")
          .select("equipe_id")
          .eq("id", user.id)
          .single();

        if (profileError || !profile?.equipe_id) {
          if (isMounted) {
            setErrorMessage(
              profileError?.message ??
                "Seu perfil ainda não está vinculado a uma equipe para usar o checklist."
            );
            setIsLoading(false);
          }
          return;
        }

        setTeamId(profile.equipe_id);

        const { data, error } = await supabase
          .from("plataforma_brasil_checklists")
          .select("tcle_gerado, cronograma_pronto, orcamento_detalhado")
          .eq("equipe_id", profile.equipe_id)
          .maybeSingle();

        if (error) {
          if (isMounted) {
            setErrorMessage(
              error.message.includes("plataforma_brasil_checklists")
                ? "A tabela do checklist ainda não existe no banco. Rode a migração de consolidação do WebLab."
                : error.message
            );
            setIsLoading(false);
          }
          return;
        }

        if (isMounted) {
          setChecklist(data ?? defaultChecklist);
          setErrorMessage(null);
          setIsLoading(false);
        }
      } catch (error) {
        if (isMounted) {
          setErrorMessage(
            error instanceof Error ? error.message : "Erro inesperado ao carregar o checklist."
          );
          setIsLoading(false);
        }
      }
    };

    void loadChecklist();

    return () => {
      isMounted = false;
    };
  }, []);

  const handleToggle = (key: keyof ChecklistState) => {
    if (!teamId) {
      return;
    }

    const nextState = {
      ...checklist,
      [key]: !checklist[key]
    };

    setChecklist(nextState);
    setSavedMessage(null);
    setErrorMessage(null);

    startTransition(async () => {
      const supabase = getSupabaseClient();
      const { error } = await supabase.from("plataforma_brasil_checklists").upsert(
        {
          equipe_id: teamId,
          ...nextState,
          updated_at: new Date().toISOString()
        },
        { onConflict: "equipe_id" }
      );

      if (error) {
        setErrorMessage(
          error.message.includes("plataforma_brasil_checklists")
            ? "A tabela do checklist ainda não existe no banco. Rode a migração de consolidação do WebLab."
            : error.message
        );
        return;
      }

      setSavedMessage("Checklist salvo para a equipe.");
      setTimeout(() => setSavedMessage(null), 2000);
    });
  };

  return (
    <section className="glass-card no-print" style={{ padding: "24px", display: "grid", gap: "16px" }}>
      <div style={{ display: "grid", gap: "6px" }}>
        <h2 style={{ margin: 0 }}>Checklist de submissão</h2>
        <p className="muted" style={{ margin: 0 }}>
          Estado persistente da equipe para acompanhar os itens burocráticos mais chatos da
          Plataforma Brasil.
        </p>
      </div>

      {isLoading ? (
        <p className="muted" style={{ margin: 0 }}>
          Carregando checklist...
        </p>
      ) : errorMessage ? (
        <p className="danger" style={{ margin: 0 }}>
          {errorMessage}
        </p>
      ) : (
        <div style={{ display: "grid", gap: "12px" }}>
          {[
            ["tcle_gerado", "TCLE gerado", "Termo pronto para revisão e impressão."],
            ["cronograma_pronto", "Cronograma pronto", "Planejamento temporal finalizado."],
            ["orcamento_detalhado", "Orçamento detalhado", "Custos e recursos organizados para submissão."]
          ].map(([key, label, description]) => (
            <label
              key={key}
              style={{
                display: "flex",
                alignItems: "center",
                gap: "12px",
                padding: "14px 16px",
                borderRadius: "16px",
                background: "rgba(255,255,255,0.72)",
                border: "1px solid rgba(36,26,19,0.08)"
              }}
            >
              <input
                checked={checklist[key as keyof ChecklistState]}
                disabled={isPending}
                onChange={() => handleToggle(key as keyof ChecklistState)}
                type="checkbox"
              />
              <div style={{ display: "grid", gap: "4px" }}>
                <strong>{label}</strong>
                <span className="muted">{description}</span>
              </div>
            </label>
          ))}
        </div>
      )}

      {savedMessage ? (
        <p className="muted" style={{ margin: 0 }}>
          {savedMessage}
        </p>
      ) : null}
    </section>
  );
}
