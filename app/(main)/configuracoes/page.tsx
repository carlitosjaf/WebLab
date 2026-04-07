"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import { getSupabaseClient } from "@/lib/supabaseClient";
import type { Database, UserRole } from "@/lib/types";
import { formatRoleLabel } from "@/lib/weblab";

type TeamRow = Database["public"]["Tables"]["equipes"]["Row"];

const ALLOWED_ROLES: UserRole[] = ["coordenador", "coordenador_geral"];

export default function ConfiguracoesPage() {
  const router = useRouter();
  const [team, setTeam] = useState<TeamRow | null>(null);
  const [role, setRole] = useState<UserRole | null>(null);
  const [teamContent, setTeamContent] = useState({
    tituloPublico: "",
    resumoPublico: "",
    integranteNome: "",
    integranteFuncao: "",
    integranteCategoria: ""
  });
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [copyMessage, setCopyMessage] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;

    const loadConfig = async () => {
      try {
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

        const { data: profile, error: profileError } = await supabase
          .from("perfis")
          .select("equipe_id, role")
          .eq("id", user.id)
          .single();

        if (profileError || !profile) {
          if (isMounted) {
            setErrorMessage(profileError?.message ?? "Nao foi possivel carregar o seu perfil.");
            setIsLoading(false);
          }
          return;
        }

        if (!ALLOWED_ROLES.includes(profile.role)) {
          if (isMounted) {
            setErrorMessage(
              "Acesso restrito. Apenas coordenadores podem administrar os convites da equipe."
            );
            setIsLoading(false);
          }
          return;
        }

        setRole(profile.role);

        if (!profile.equipe_id) {
          if (isMounted) {
            setErrorMessage(
              "Seu perfil ainda nao esta vinculado a uma equipe. Conclua o onboarding antes de abrir as configuracoes."
            );
            setIsLoading(false);
          }
          return;
        }

        const { data: loadedTeam, error: teamError } = await supabase
          .from("equipes")
          .select("id, nome, codigo_convite")
          .eq("id", profile.equipe_id)
          .single();

        if (teamError || !loadedTeam) {
          if (isMounted) {
            setErrorMessage(
              teamError?.message?.includes("codigo_convite")
                ? "O Supabase ainda nao recebeu a migracao do codigo de convite da equipe."
                : teamError?.message ?? "Nao foi possivel carregar os dados da equipe."
            );
            setIsLoading(false);
          }
          return;
        }

        if (isMounted) {
          setTeam(loadedTeam);
          setErrorMessage(null);
          setIsLoading(false);
        }
      } catch (error) {
        if (isMounted) {
          setErrorMessage(
            error instanceof Error ? error.message : "Erro inesperado ao carregar as configuracoes."
          );
          setIsLoading(false);
        }
      }
    };

    void loadConfig();

    return () => {
      isMounted = false;
    };
  }, [router]);

  const handleCopy = async () => {
    if (!team?.codigo_convite) {
      return;
    }

    await navigator.clipboard.writeText(team.codigo_convite);
    setCopyMessage("Codigo copiado.");
    setTimeout(() => setCopyMessage(null), 2000);
  };

  const handleTeamContentChange =
    (field: keyof typeof teamContent) =>
    (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      setTeamContent((current) => ({
        ...current,
        [field]: event.target.value
      }));
    };

  if (isLoading) {
    return (
      <main className="shell">
        <div className="container glass-card" style={{ padding: "32px" }}>
          Carregando configuracoes...
        </div>
      </main>
    );
  }

  if (errorMessage) {
    return (
      <main className="shell">
        <div className="container glass-card" style={{ padding: "32px", display: "grid", gap: "12px" }}>
          <h1 style={{ margin: 0 }}>Configuracoes da equipe</h1>
          <p className="danger" style={{ margin: 0 }}>
            {errorMessage}
          </p>
        </div>
      </main>
    );
  }

  return (
    <main className="shell">
      <div className="container" style={{ display: "grid", gap: "24px" }}>
        <header className="glass-card" style={{ padding: "32px", display: "grid", gap: "10px" }}>
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
            Governanca da equipe
          </span>
          <h1 style={{ margin: 0 }}>Configuracoes do laboratorio</h1>
          <p className="muted" style={{ margin: 0, maxWidth: "60ch" }}>
            Gerencie o acesso dos pesquisadores a partir de um codigo de convite proprio da equipe.
            O codigo nao reutiliza o UUID interno do banco e pode ser compartilhado com mais
            seguranca.
          </p>
        </header>

        <section
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
            gap: "20px"
          }}
        >
          <article className="glass-card" style={{ padding: "28px", display: "grid", gap: "8px" }}>
            <span className="muted">Equipe vinculada</span>
            <strong style={{ fontSize: "1.3rem" }}>{team?.nome ?? "Sem equipe"}</strong>
            <span className="muted">Seu papel: {role ? formatRoleLabel(role) : "-"}</span>
          </article>

          <article className="glass-card" style={{ padding: "28px", display: "grid", gap: "12px" }}>
            <span className="muted">Codigo de convite</span>
            <code
              style={{
                background: "rgba(36,26,19,0.92)",
                color: "white",
                padding: "14px 18px",
                borderRadius: "16px",
                fontSize: "1.1rem",
                fontFamily: "monospace",
                letterSpacing: "0.12em"
              }}
            >
              {team?.codigo_convite ?? "Nao configurado"}
            </code>
            <div style={{ display: "flex", gap: "12px", alignItems: "center", flexWrap: "wrap" }}>
              <button className="button button-primary" onClick={handleCopy} type="button">
                Copiar codigo
              </button>
              {copyMessage ? <span className="muted">{copyMessage}</span> : null}
            </div>
          </article>
        </section>

        <section className="glass-card" style={{ padding: "28px", display: "grid", gap: "12px" }}>
          <h2 style={{ margin: 0 }}>Como funciona o acesso de novos membros</h2>
          <p className="muted" style={{ margin: 0 }}>
            Durante o cadastro, a pessoa informa esse codigo no campo de convite. Se o codigo for
            valido, o WebLab tenta vincular automaticamente o perfil dela a esta equipe e libera o
            dashboard com as regras de RLS ja aplicadas.
          </p>
          <p className="muted" style={{ margin: 0 }}>
            Se o usuario nao tiver codigo, ele continua podendo criar a propria equipe no primeiro
            acesso.
          </p>
        </section>

        <section className="glass-card" style={{ padding: "28px", display: "grid", gap: "18px" }}>
          <div style={{ display: "grid", gap: "8px" }}>
            <span className="eyebrow">conteúdo público</span>
            <h2 style={{ margin: 0 }}>Equipe no WebLab</h2>
            <p className="muted" style={{ margin: 0 }}>
              Rascunhe aqui os textos e integrantes que devem aparecer na aba Equipe. Nesta primeira
              versão, o painel organiza o conteúdo para revisão; para salvar e publicar em tempo
              real, precisamos adicionar uma tabela de conteúdo da equipe no Supabase.
            </p>
          </div>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
              gap: "16px"
            }}
          >
            <div className="field">
              <label htmlFor="tituloPublico">Título público da equipe</label>
              <input
                id="tituloPublico"
                onChange={handleTeamContentChange("tituloPublico")}
                placeholder="Ex.: Laboratório de Inovações em Terapias, Ensino e Bioprodutos"
                value={teamContent.tituloPublico}
              />
            </div>

            <div className="field">
              <label htmlFor="integranteCategoria">Categoria do integrante</label>
              <input
                id="integranteCategoria"
                onChange={handleTeamContentChange("integranteCategoria")}
                placeholder="Ex.: Pós-doutorandos"
                value={teamContent.integranteCategoria}
              />
            </div>
          </div>

          <div className="field">
            <label htmlFor="resumoPublico">Resumo público</label>
            <textarea
              id="resumoPublico"
              onChange={handleTeamContentChange("resumoPublico")}
              placeholder="Resumo curto para a página Equipe."
              rows={4}
              value={teamContent.resumoPublico}
            />
          </div>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
              gap: "16px"
            }}
          >
            <div className="field">
              <label htmlFor="integranteNome">Nome do integrante</label>
              <input
                id="integranteNome"
                onChange={handleTeamContentChange("integranteNome")}
                placeholder="Nome completo"
                value={teamContent.integranteNome}
              />
            </div>

            <div className="field">
              <label htmlFor="integranteFuncao">Função</label>
              <input
                id="integranteFuncao"
                onChange={handleTeamContentChange("integranteFuncao")}
                placeholder="Ex.: Pesquisadora, estudante, bolsista"
                value={teamContent.integranteFuncao}
              />
            </div>
          </div>

          <div style={{ display: "flex", gap: "12px", flexWrap: "wrap" }}>
            <button className="button button-secondary" disabled type="button">
              Salvar conteúdo
            </button>
            <span className="muted">
              Próxima etapa: persistir esses campos no Supabase e alimentar a página Equipe.
            </span>
          </div>
        </section>
      </div>
    </main>
  );
}
