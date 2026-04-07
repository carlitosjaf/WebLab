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
  const [isSubmitting, setIsSubmitting] = useState(false);

  const translateAuthError = (message: string) => {
    const normalizedMessage = message.toLowerCase();

    if (normalizedMessage.includes("email rate limit exceeded")) {
      return "O Supabase bloqueou temporariamente novos e-mails de cadastro. Aguarde alguns minutos e tente novamente, ou peça para a coordenação liberar o limite/SMTP no Supabase.";
    }

    if (normalizedMessage.includes("invalid login credentials")) {
      return "E-mail ou senha incorretos.";
    }

    if (normalizedMessage.includes("user already registered")) {
      return "Este e-mail já está cadastrado. Use a aba Acessar para entrar.";
    }

    return message;
  };

  const bindProfileToInviteCode = async (inviteCode: string) => {
    const supabase = getSupabaseClient();
    const normalizedInviteCode = normalizeInviteCode(inviteCode);
    const { error } = await supabase.rpc("claim_team_invite", {
      invite_code_input: normalizedInviteCode
    });

    if (error) {
      throw new Error(
        error.message.includes("claim_team_invite")
          ? "O Supabase ainda não recebeu a função de vínculo por convite. Rode o SQL de segurança multi-tenant do WebLab."
          : translateAuthError(error.message)
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
            error instanceof Error
              ? translateAuthError(error.message)
              : "Não foi possível iniciar a autenticação."
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

    if (isSubmitting) {
      return;
    }

    setErrorMessage(null);
    setFeedback(null);
    setIsSubmitting(true);

    startTransition(async () => {
      try {
        const supabase = getSupabaseClient();

        if (mode === "login") {
          const { error } = await supabase.auth.signInWithPassword({
            email: formState.email,
            password: formState.password
          });

          if (error) {
            setErrorMessage(translateAuthError(error.message));
            return;
          }

          router.replace(nextPath as Route);
          router.refresh();
          return;
        }

        const normalizedInviteCode = formState.inviteCode.trim()
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
          setErrorMessage(translateAuthError(error.message));
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
                    ? `Cadastro criado, mas o código de convite não foi validado: ${translateAuthError(inviteError.message)}`
                    : "Cadastro criado, mas não foi possível validar o código de convite."
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
            ? "Cadastro realizado. Se a conta não entrar automaticamente, faça login manualmente e o WebLab tentará vincular sua equipe com o código informado."
            : "Cadastro realizado. Se a conta não entrar automaticamente, faça login manualmente em seguida."
        );
        setMode("login");
        setFormState((current) => ({ ...current, password: "", inviteCode: "" }));
      } catch (error) {
        setErrorMessage(
          error instanceof Error
            ? translateAuthError(error.message)
            : "Não foi possível concluir a autenticação."
        );
      } finally {
        setIsSubmitting(false);
      }
    });
  };

  return (
    <div
      className="glass-card auth-card"
      style={{
        width: "min(440px, 100%)",
        alignSelf: "stretch",
        display: "grid",
        gap: "20px",
        padding: "24px"
      }}
    >
      <div
        className="auth-card-head"
        style={{
          display: "grid",
          gap: "8px"
        }}
      >
        <span className="eyebrow">acesso</span>
        <h2 style={{ margin: 0 }}>Entrar no laboratório</h2>
        <p className="muted" style={{ margin: 0, lineHeight: 1.55 }}>
          Use sua conta ou um convite de equipe.
        </p>
      </div>

      <div className="auth-tabs">
        <button
          className={`button ${mode === "login" ? "button-primary" : "button-secondary"}`}
          onClick={() => setMode("login")}
          type="button"
        >
          Acessar
        </button>
        <button
          className={`button ${mode === "register" ? "button-primary" : "button-secondary"}`}
          onClick={() => setMode("register")}
          type="button"
        >
          Novo cadastro
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
              placeholder="Como você será identificada(o) no laboratório"
              required
              value={formState.nomeCompleto}
            />
          </div>
        ) : null}

        {mode === "register" ? (
          <div className="field">
            <label htmlFor="inviteCode">Código de convite</label>
            <input
              id="inviteCode"
              onChange={(event) =>
                setFormState((current) => ({
                  ...current,
                  inviteCode: event.target.value
                }))
              }
              placeholder="Opcional. Ex.: NUCLEO-FIOCRUZ-AB12CD"
              value={formState.inviteCode}
            />
          </div>
        ) : null}

        <div className="field">
          <label htmlFor="email">E-mail institucional</label>
          <input
            id="email"
            onChange={(event) =>
              setFormState((current) => ({
                ...current,
                email: event.target.value
              }))
            }
              placeholder="seu.email@instituicao.br"
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
            placeholder="Mínimo de 6 caracteres"
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

        <button className="button button-primary" disabled={isPending || isSubmitting} type="submit">
          {isPending || isSubmitting
            ? "Sincronizando..."
            : mode === "login"
              ? "Entrar no laboratório"
              : "Criar acesso"}
        </button>
      </form>
    </div>
  );
}
