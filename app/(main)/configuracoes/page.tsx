"use client";

import { useEffect, useState, useTransition, type ChangeEvent } from "react";
import { useRouter } from "next/navigation";

import {
  defaultTeamSiteContent,
  getTeamSiteContentFromRow,
  type TeamSiteContentRow,
  type TeamSiteContentState
} from "@/lib/site-content";
import { getSupabaseClient } from "@/lib/supabaseClient";
import type { Database, TeamSiteMember, UserRole } from "@/lib/types";
import { formatRoleLabel } from "@/lib/weblab";

type TeamRow = Database["public"]["Tables"]["equipes"]["Row"];

const ALLOWED_ROLES: UserRole[] = ["coordenador", "coordenador_geral"];

const emptyMember: TeamSiteMember = {
  nome: "",
  funcao: "",
  categoria: "",
  email: "",
  imagem: ""
};

function getInitials(name: string) {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");
}

export default function ConfiguracoesPage() {
  const router = useRouter();
  const [team, setTeam] = useState<TeamRow | null>(null);
  const [role, setRole] = useState<UserRole | null>(null);
  const [teamContent, setTeamContent] = useState<TeamSiteContentState>(defaultTeamSiteContent);
  const [memberDraft, setMemberDraft] = useState<TeamSiteMember>(emptyMember);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, startSaveTransition] = useTransition();
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [copyMessage, setCopyMessage] = useState<string | null>(null);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);

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
            setErrorMessage(profileError?.message ?? "Não foi possível carregar o seu perfil.");
            setIsLoading(false);
          }
          return;
        }

        if (!ALLOWED_ROLES.includes(profile.role)) {
          if (isMounted) {
            setErrorMessage("Acesso restrito. Apenas coordenadores podem administrar a equipe.");
            setIsLoading(false);
          }
          return;
        }

        setRole(profile.role);

        if (!profile.equipe_id) {
          if (isMounted) {
            setErrorMessage(
              "Seu perfil ainda não está vinculado a uma equipe. Conclua o onboarding antes de abrir as configurações."
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
                ? "O Supabase ainda não recebeu a migração do código de convite da equipe."
                : teamError?.message ?? "Não foi possível carregar os dados da equipe."
            );
            setIsLoading(false);
          }
          return;
        }

        const { data: loadedContent, error: contentError } = await supabase
          .from("conteudos_site_equipe")
          .select("id, equipe_id, titulo_publico, resumo_publico, integrantes, updated_at")
          .eq("equipe_id", loadedTeam.id)
          .maybeSingle();

        if (contentError && contentError.message.includes("conteudos_site_equipe")) {
          if (isMounted) {
            setErrorMessage(
              "O Supabase ainda não recebeu a tabela de conteúdo do site. Rode a nova migração antes de editar a página da equipe."
            );
            setIsLoading(false);
          }
          return;
        }

        const { data: profileMembers } = await supabase
          .from("perfis")
          .select("nome_completo, role")
          .eq("equipe_id", loadedTeam.id)
          .order("nome_completo", { ascending: true });

        const registeredMembers: TeamSiteMember[] =
          profileMembers?.flatMap((member) => {
            const nome = member.nome_completo?.trim();

            if (!nome) {
              return [];
            }

            return [
              {
                nome,
                funcao: formatRoleLabel(member.role),
                categoria: "Membros cadastrados",
                email: null,
                imagem: null
              }
            ];
          }) ?? [];

        if (isMounted) {
          const siteContent = getTeamSiteContentFromRow(
            (loadedContent as TeamSiteContentRow | null) ?? null,
            loadedTeam.nome
          );

          setTeam(loadedTeam);
          setTeamContent({
            ...siteContent,
            integrantes: siteContent.integrantes.length > 0 ? siteContent.integrantes : registeredMembers
          });
          setErrorMessage(contentError ? contentError.message : null);
          setIsLoading(false);
        }
      } catch (error) {
        if (isMounted) {
          setErrorMessage(
            error instanceof Error ? error.message : "Erro inesperado ao carregar as configurações."
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
    setCopyMessage("Código copiado.");
    setTimeout(() => setCopyMessage(null), 2000);
  };

  const handleTeamContentChange =
    (field: "tituloPublico" | "resumoPublico") =>
    (event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      setTeamContent((current) => ({
        ...current,
        [field]: event.target.value
      }));
    };

  const handleMemberDraftChange =
    (field: keyof TeamSiteMember) =>
    (event: ChangeEvent<HTMLInputElement>) => {
      setMemberDraft((current) => ({
        ...current,
        [field]: event.target.value
      }));
    };

  const handleAddMember = () => {
    if (!memberDraft.nome.trim() || !memberDraft.funcao.trim() || !memberDraft.categoria.trim()) {
      setSaveMessage("Preencha nome, função e categoria antes de adicionar o integrante.");
      return;
    }

    setTeamContent((current) => ({
      ...current,
      integrantes: [
        ...current.integrantes,
        {
          nome: memberDraft.nome.trim(),
          funcao: memberDraft.funcao.trim(),
          categoria: memberDraft.categoria.trim(),
          email: memberDraft.email?.trim() || null,
          imagem: memberDraft.imagem?.trim() || null
        }
      ]
    }));
    setMemberDraft(emptyMember);
    setSaveMessage(null);
  };

  const handleRemoveMember = (memberIndex: number) => {
    setTeamContent((current) => ({
      ...current,
      integrantes: current.integrantes.filter((_, index) => index !== memberIndex)
    }));
  };

  const handleSaveContent = () => {
    if (!team) {
      return;
    }

    setSaveMessage(null);
    setErrorMessage(null);

    startSaveTransition(async () => {
      const supabase = getSupabaseClient();
      const { error } = await supabase.from("conteudos_site_equipe").upsert(
        {
          equipe_id: team.id,
          titulo_publico: teamContent.tituloPublico.trim() || team.nome,
          resumo_publico: teamContent.resumoPublico.trim(),
          integrantes: teamContent.integrantes,
          updated_at: new Date().toISOString()
        },
        { onConflict: "equipe_id" }
      );

      if (error) {
        setErrorMessage(
          error.message.includes("conteudos_site_equipe")
            ? "O Supabase ainda não recebeu a tabela de conteúdo do site. Rode a migração de configurações."
            : error.message
        );
        return;
      }

      setSaveMessage("Conteúdo salvo. A aba Equipe já pode usar essas informações.");
    });
  };

  if (isLoading) {
    return (
      <main className="shell">
        <div className="container glass-card" style={{ padding: "32px" }}>
          Carregando configurações...
        </div>
      </main>
    );
  }

  if (errorMessage && !team) {
    return (
      <main className="shell">
        <div className="container glass-card" style={{ padding: "32px", display: "grid", gap: "12px" }}>
          <h1 style={{ margin: 0 }}>Configurações da equipe</h1>
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
          <span className="eyebrow">governança</span>
          <h1 style={{ margin: 0 }}>Configurações do laboratório</h1>
          <p className="muted" style={{ margin: 0, maxWidth: "64ch" }}>
            Gerencie convites e conteúdo institucional da equipe. O que for salvo aqui alimenta a
            aba Equipe do WebLab.
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
            <span className="muted">Código de convite</span>
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
              {team?.codigo_convite ?? "Não configurado"}
            </code>
            <div style={{ display: "flex", gap: "12px", alignItems: "center", flexWrap: "wrap" }}>
              <button className="button button-primary" onClick={handleCopy} type="button">
                Copiar código
              </button>
              {copyMessage ? <span className="muted">{copyMessage}</span> : null}
            </div>
          </article>
        </section>

        <section className="glass-card" style={{ padding: "28px", display: "grid", gap: "18px" }}>
          <div style={{ display: "grid", gap: "8px" }}>
            <span className="eyebrow">conteúdo da aba equipe</span>
            <h2 style={{ margin: 0 }}>Identidade pública da equipe</h2>
            <p className="muted" style={{ margin: 0 }}>
              Salve o texto institucional e os integrantes que devem aparecer na página Equipe.
            </p>
          </div>

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
            <label htmlFor="resumoPublico">Resumo público</label>
            <textarea
              id="resumoPublico"
              onChange={handleTeamContentChange("resumoPublico")}
              placeholder="Resumo curto para a página Equipe."
              rows={4}
              value={teamContent.resumoPublico}
            />
          </div>

          <div className="config-member-editor">
            <div className="field">
              <label htmlFor="integranteNome">Nome</label>
              <input
                id="integranteNome"
                onChange={handleMemberDraftChange("nome")}
                placeholder="Nome completo"
                value={memberDraft.nome}
              />
            </div>

            <div className="field">
              <label htmlFor="integranteFuncao">Função</label>
              <input
                id="integranteFuncao"
                onChange={handleMemberDraftChange("funcao")}
                placeholder="Ex.: Pesquisadora, estudante, bolsista"
                value={memberDraft.funcao}
              />
            </div>

            <div className="field">
              <label htmlFor="integranteCategoria">Categoria</label>
              <input
                id="integranteCategoria"
                onChange={handleMemberDraftChange("categoria")}
                placeholder="Ex.: Pós-doutorandos"
                value={memberDraft.categoria}
              />
            </div>

            <div className="field">
              <label htmlFor="integranteEmail">E-mail</label>
              <input
                id="integranteEmail"
                onChange={handleMemberDraftChange("email")}
                placeholder="Opcional"
                type="email"
                value={memberDraft.email ?? ""}
              />
            </div>

            <div className="field">
              <label htmlFor="integranteImagem">Imagem</label>
              <input
                id="integranteImagem"
                onChange={handleMemberDraftChange("imagem")}
                placeholder="URL da foto ou imagem institucional"
                type="url"
                value={memberDraft.imagem ?? ""}
              />
            </div>
          </div>

          <button className="button button-secondary" onClick={handleAddMember} type="button">
            Adicionar integrante
          </button>

          <div className="config-member-list">
            {teamContent.integrantes.map((member, index) => (
              <article className="config-member-item" key={`${member.nome}-${index}`}>
                <div className="config-member-preview" aria-hidden="true">
                  {member.imagem ? <img alt="" src={member.imagem} /> : <span>{getInitials(member.nome)}</span>}
                </div>
                <div>
                  <strong>{member.nome}</strong>
                  <span className="muted">
                    {member.funcao} · {member.categoria}
                  </span>
                </div>
                <button
                  className="lovable-small-button dashboard-home-delete"
                  onClick={() => handleRemoveMember(index)}
                  type="button"
                >
                  Remover
                </button>
              </article>
            ))}
          </div>

          {errorMessage ? <p className="danger">{errorMessage}</p> : null}
          {saveMessage ? <p className="muted">{saveMessage}</p> : null}

          <button className="button button-primary" disabled={isSaving} onClick={handleSaveContent} type="button">
            {isSaving ? "Salvando..." : "Salvar conteúdo da equipe"}
          </button>
        </section>
      </div>
    </main>
  );
}
