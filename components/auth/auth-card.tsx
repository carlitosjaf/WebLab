"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import type { Route } from "next";
import { useRouter, useSearchParams } from "next/navigation";

import { getSupabaseClient } from "@/lib/supabaseClient";
import { normalizeInviteCode } from "@/lib/weblab";

type AuthMode = "login" | "register";

const initialState = {
  email: "",
  password: "",
  nomeCompleto: "",
  inviteCode: ""
};

export function AuthCard() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const nextPath = useMemo(() => searchParams.get("next") ?? "/dashboard", [searchParams]);
  const [mode, setMode] = useState<AuthMode>("login");
  const [formState, setFormState] = useState(initialState);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const bindProfileToInviteCode = async (inviteCode: string) => {
    const supabase = getSupabaseClient();
    const normalizedInviteCode = normalizeInviteCode(inviteCode);
    const { error } = await supabase.rpc("claim_team_invite", {
      invite_code_input: normalizedInviteCode
    });

    if (error) {
      throw new Error(
        error.message.includes("claim_team_invite")
          ? "O Supabase ainda nao recebeu a funcao de vinculo por convite. Rode o SQL de seguranca multi-tenant do WebLab."
          : error.message
      );
    }
  };

  useEffect(() => {
    let isMounted = true;

    const syncUser = async () => {
      try {
        const supabase = getSupabaseClient();
        const {
          data: { user }
        } = await supabase.auth.getUser();

        if (user && isMounted) {
          router.replace("/dashboard");
        }
      } catch (error) {
        if (isMounted) {
          setErrorMessage(
            error instanceof Error ? error.message : "Nao foi possivel iniciar a autenticacao."
          );
        }
      }
    };

    void syncUser();

    return () => {
      isMounted = false;
    };
  }, [router]);

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setErrorMessage(null);
    setFeedback(null);

    startTransition(async () => {
      try {
        const supabase = getSupabaseClient();

        if (mode === "login") {
          const { error } = await supabase.auth.signInWithPassword({
            email: formState.email,
            password: formState.password
          });

          if (error) {
            setErrorMessage(error.message);
            return;
          }

          router.replace(nextPath as Route);
          router.refresh();
          return;
        }

        const normalizedInviteCode =
          mode === "register" && formState.inviteCode.trim()
            ? normalizeInviteCode(formState.inviteCode)
            : "";

        const { data, error } = await supabase.auth.signUp({
          email: formState.email,
          password: formState.password,
          options: {
            data: {
              nome_completo: formState.nomeCompleto,
              invite_code: normalizedInviteCode || null
            }
          }
        });

        if (error) {
          setErrorMessage(error.message);
          return;
        }

        if (data.session) {
          let profileReady = false;

          for (let attempt = 0; attempt < 6; attempt += 1) {
            const {
              data: { user }
            } = await supabase.auth.getUser();

            if (!user) {
              break;
            }

            const { data: profile } = await supabase
              .from("perfis")
              .select("id")
              .eq("id", user.id)
              .maybeSingle();

            if (profile) {
              profileReady = true;
              break;
            }

            await new Promise((resolve) => setTimeout(resolve, 500));
          }

          if (profileReady) {
            if (normalizedInviteCode) {
              try {
                await bindProfileToInviteCode(normalizedInviteCode);
              } catch (inviteError) {
                await supabase.auth.signOut();
                setFeedback(
                  inviteError instanceof Error
                    ? `Cadastro criado, mas o codigo de convite nao foi validado: ${inviteError.message}`
                    : "Cadastro criado, mas nao foi possivel validar o codigo de convite."
                );
                setMode("login");
                setFormState((current) => ({ ...current, password: "", inviteCode: "" }));
                return;
              }
            }

            router.replace("/dashboard");
            router.refresh();
            return;
          }

          await supabase.auth.signOut();
        }

        setFeedback(
          normalizedInviteCode
            ? "Cadastro realizado. Se a conta nao entrar automaticamente, faca login manualmente e o WebLab tentara vincular sua equipe com o codigo informado."
            : "Cadastro realizado. Se a conta nao entrar automaticamente, faca login manualmente em seguida."
        );
        setMode("login");
        setFormState((current) => ({ ...current, password: "", inviteCode: "" }));
      } catch (error) {
        setErrorMessage(
          error instanceof Error ? error.message : "Nao foi possivel concluir a autenticacao."
        );
      }
    });
  };

  return (
    <div
      className="glass-card"
      style={{
        padding: "32px",
        width: "min(520px, 100%)"
      }}
    >
      <div style={{ display: "grid", gap: "12px", marginBottom: "24px" }}>
        <span
          style={{
            width: "fit-content",
            padding: "8px 12px",
            borderRadius: "999px",
            background: "var(--accent-soft)",
            color: "var(--accent-strong)",
            fontSize: "0.9rem",
            fontWeight: 600
          }}
        >
          Laboratorio virtual para pesquisa
        </span>
        <div>
          <h1 style={{ margin: 0, fontSize: "clamp(2rem, 5vw, 3rem)" }}>WebLab</h1>
          <p className="muted" style={{ marginBottom: 0 }}>
            Escreva, organize e evolua artigos cientificos com seguranca por equipe.
          </p>
        </div>
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: "8px",
          padding: "6px",
          borderRadius: "999px",
          background: "rgba(255,255,255,0.75)",
          marginBottom: "24px"
        }}
      >
        <button
          className={`button ${mode === "login" ? "button-primary" : "button-secondary"}`}
          onClick={() => setMode("login")}
          type="button"
        >
          Entrar
        </button>
        <button
          className={`button ${mode === "register" ? "button-primary" : "button-secondary"}`}
          onClick={() => setMode("register")}
          type="button"
        >
          Criar conta
        </button>
      </div>

      <form onSubmit={handleSubmit} style={{ display: "grid", gap: "16px" }}>
        {mode === "register" ? (
          <div className="field">
            <label htmlFor="nomeCompleto">Nome completo</label>
            <input
              id="nomeCompleto"
              onChange={(event) =>
                setFormState((current) => ({
                  ...current,
                  nomeCompleto: event.target.value
                }))
              }
              placeholder="Seu nome"
              required
              value={formState.nomeCompleto}
            />
          </div>
        ) : null}

        {mode === "register" ? (
          <div className="field">
            <label htmlFor="inviteCode">Codigo de convite da equipe</label>
            <input
              id="inviteCode"
              onChange={(event) =>
                setFormState((current) => ({
                  ...current,
                  inviteCode: event.target.value
                }))
              }
              placeholder="Opcional. Ex.: WEBLAB-AB12CD"
              value={formState.inviteCode}
            />
          </div>
        ) : null}

        <div className="field">
          <label htmlFor="email">E-mail</label>
          <input
            id="email"
            onChange={(event) =>
              setFormState((current) => ({
                ...current,
                email: event.target.value
              }))
            }
            placeholder="voce@instituicao.br"
            required
            type="email"
            value={formState.email}
          />
        </div>

        <div className="field">
          <label htmlFor="password">Senha</label>
          <input
            id="password"
            minLength={6}
            onChange={(event) =>
              setFormState((current) => ({
                ...current,
                password: event.target.value
              }))
            }
            placeholder="Minimo de 6 caracteres"
            required
            type="password"
            value={formState.password}
          />
        </div>

        {errorMessage ? (
          <p className="danger" style={{ margin: 0 }}>
            {errorMessage}
          </p>
        ) : null}

        {feedback ? (
          <p className="muted" style={{ margin: 0 }}>
            {feedback}
          </p>
        ) : null}

        <button className="button button-primary" disabled={isPending} type="submit">
          {isPending
            ? "Processando..."
            : mode === "login"
              ? "Entrar no dashboard"
              : "Cadastrar"}
        </button>
      </form>
    </div>
  );
}
