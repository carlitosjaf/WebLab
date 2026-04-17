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
import type { Database, TeamNoticeCategory, TeamNoticeRow, TeamSiteMember, UserRole } from "@/lib/types";
import { formatRoleLabel, getTeamBadgeTone } from "@/lib/weblab";

type TeamRow = Database["public"]["Tables"]["equipes"]["Row"];
type NoticeDraft = {
  titulo: string;
  texto: string;
  categoria: TeamNoticeCategory;
  dataEvento: string;
  linkUrl: string;
};

const ALLOWED_ROLES: UserRole[] = ["coordenador", "coordenador_geral"];

const emptyMember: TeamSiteMember = {
  nome: "",
  funcao: "",
  categoria: "",
  email: "",
  imagem: ""
};

const emptyNotice: NoticeDraft = {
  titulo: "",
  texto: "",
  categoria: "Aviso",
  dataEvento: "",
  linkUrl: ""
};

const noticeCategories: TeamNoticeCategory[] = ["Aviso", "Evento", "Publicação", "Prazo"];

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
  const [registeredMembers, setRegisteredMembers] = useState<TeamSiteMember[]>([]);
  const [memberDraft, setMemberDraft] = useState<TeamSiteMember>(emptyMember);
  const [notices, setNotices] = useState<TeamNoticeRow[]>([]);
  const [noticeDraft, setNoticeDraft] = useState<NoticeDraft>(emptyNotice);
  const [isPublishingNotice, setIsPublishingNotice] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, startSaveTransition] = useTransition();
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [copyMessage, setCopyMessage] = useState<string | null>(null);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const [noticeMessage, setNoticeMessage] = useState<string | null>(null);
  const [managedTeams, setManagedTeams] = useState<TeamRow[]>([]);
  const [teamEdits, setTeamEdits] = useState<Record<string, string>>({});
  const [teamNameDraft, setTeamNameDraft] = useState("");
  const [teamMessage, setTeamMessage] = useState<string | null>(null);
  const [teamPendingId, setTeamPendingId] = useState<string | null>(null);
  const [isManagingTeams, startManageTeamsTransition] = useTransition();

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

        const { data: teamCatalog, error: teamCatalogError } = await supabase.rpc("list_weblab_teams");

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

        const registeredTeamMembers: TeamSiteMember[] =
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

        const { data: loadedNotices, error: noticesError } = await supabase
          .from("avisos_equipe")
          .select("id, equipe_id, titulo, texto, categoria, data_evento, link_url, created_by, publicado_em, updated_at")
          .eq("equipe_id", loadedTeam.id)
          .order("publicado_em", { ascending: false });

        if (isMounted) {
          const availableTeams = (teamCatalog as TeamRow[] | null) ?? [];
          const siteContent = getTeamSiteContentFromRow(
            (loadedContent as TeamSiteContentRow | null) ?? null,
            loadedTeam.nome
          );

          setRegisteredMembers(registeredTeamMembers);
          setManagedTeams(availableTeams);
          setTeamEdits(
            availableTeams.reduce<Record<string, string>>((accumulator, entry) => {
              accumulator[entry.id] = entry.nome;
              return accumulator;
            }, {})
          );
          setTeam(loadedTeam);
          setTeamContent({
            ...siteContent,
            integrantes: siteContent.integrantes.length > 0 ? siteContent.integrantes : registeredTeamMembers
          });
          setNotices((loadedNotices as TeamNoticeRow[] | null) ?? []);
          setNoticeMessage(
            noticesError?.message.includes("avisos_equipe")
              ? "Rode a migração de configurações para publicar eventos e avisos."
              : null
          );
          setTeamMessage(
            teamCatalogError?.message?.includes("list_weblab_teams")
              ? "Rode a nova migração de equipes do WebLab para criar e editar os núcleos."
              : null
          );
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

  const handleTeamEditChange = (teamId: string) => (event: ChangeEvent<HTMLInputElement>) => {
    setTeamEdits((current) => ({
      ...current,
      [teamId]: event.target.value
    }));
  };

  const handleCreateTeam = () => {
    const nextName = teamNameDraft.trim();

    if (!nextName) {
      setTeamMessage("Digite um nome antes de criar a equipe.");
      return;
    }

    setTeamMessage(null);

    startManageTeamsTransition(async () => {
      const supabase = getSupabaseClient();
      const { data, error } = await supabase.rpc("create_weblab_team", {
        team_name_input: nextName
      });

      if (error) {
        setTeamMessage(
          error.message.includes("create_weblab_team")
            ? "Rode a migração de equipes do WebLab no Supabase para criar novos núcleos."
            : error.message
        );
        return;
      }

      const createdTeam = (data as TeamRow[] | null)?.[0];

      if (!createdTeam) {
        setTeamMessage("N?o consegui confirmar a cria??o da equipe.");
        return;
      }

      setManagedTeams((current) =>
        [...current, createdTeam].sort((left, right) => left.nome.localeCompare(right.nome, "pt-BR"))
      );
      setTeamEdits((current) => ({
        ...current,
        [createdTeam.id]: createdTeam.nome
      }));
      setTeamNameDraft("");
      setTeamMessage("Equipe criada.");
    });
  };

  const handleRenameTeam = (targetTeam: TeamRow) => {
    const nextName = (teamEdits[targetTeam.id] ?? "").trim();

    if (!nextName) {
      setTeamMessage("O nome da equipe n?o pode ficar vazio.");
      return;
    }

    if (nextName === targetTeam.nome) {
      setTeamMessage("Esse nome ja esta salvo.");
      return;
    }

    setTeamMessage(null);
    setTeamPendingId(targetTeam.id);

    startManageTeamsTransition(async () => {
      const supabase = getSupabaseClient();
      const { data, error } = await supabase.rpc("rename_weblab_team", {
        target_team_id: targetTeam.id,
        team_name_input: nextName
      });

      setTeamPendingId(null);

      if (error) {
        setTeamMessage(
          error.message.includes("rename_weblab_team")
            ? "Rode a migração de equipes do WebLab no Supabase para editar os núcleos."
            : error.message
        );
        return;
      }

      const renamedTeam = (data as TeamRow[] | null)?.[0];
      const finalName = renamedTeam?.nome ?? nextName;

      setManagedTeams((current) =>
        current
          .map((entry) => (entry.id === targetTeam.id ? { ...entry, nome: finalName } : entry))
          .sort((left, right) => left.nome.localeCompare(right.nome, "pt-BR"))
      );
      setTeamEdits((current) => ({
        ...current,
        [targetTeam.id]: finalName
      }));
      setTeam((current) => (current && current.id === targetTeam.id ? { ...current, nome: finalName } : current));
      setTeamMessage("Nome da equipe atualizado.");
    });
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

  const handleNoticeDraftChange =
    (field: keyof NoticeDraft) =>
    (event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
      setNoticeDraft((current) => ({
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

  const handleUseRegisteredMembers = () => {
    if (registeredMembers.length === 0) {
      setSaveMessage("Ainda não encontrei membros cadastrados nessa equipe.");
      return;
    }

    setTeamContent((current) => ({
      ...current,
      integrantes: registeredMembers
    }));
    setSaveMessage("Lista preenchida com os membros cadastrados da equipe. Revise e salve.");
  };

  const handleClearMembers = () => {
    setTeamContent((current) => ({
      ...current,
      integrantes: []
    }));
    setSaveMessage("Lista de integrantes limpa. Salve para refletir na aba Equipe.");
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

  const handlePublishNotice = async () => {
    if (!team || isPublishingNotice) {
      return;
    }

    const titulo = noticeDraft.titulo.trim();
    const texto = noticeDraft.texto.trim();

    if (!titulo || !texto) {
      setNoticeMessage("Preencha título e texto antes de publicar.");
      return;
    }

    setIsPublishingNotice(true);
    setNoticeMessage(null);

    const supabase = getSupabaseClient();
    const {
      data: { user }
    } = await supabase.auth.getUser();

    if (!user) {
      setNoticeMessage("Sua sessão expirou. Entre novamente para publicar.");
      setIsPublishingNotice(false);
      return;
    }

    const { data, error } = await supabase
      .from("avisos_equipe")
      .insert({
        equipe_id: team.id,
        titulo,
        texto,
        categoria: noticeDraft.categoria,
        data_evento: noticeDraft.dataEvento || null,
        link_url: noticeDraft.linkUrl.trim() || null,
        created_by: user.id,
        updated_at: new Date().toISOString()
      })
      .select("id, equipe_id, titulo, texto, categoria, data_evento, link_url, created_by, publicado_em, updated_at")
      .single();

    setIsPublishingNotice(false);

    if (error) {
      setNoticeMessage(
        error.message.includes("avisos_equipe")
          ? "O Supabase ainda não recebeu a tabela de avisos. Rode a migração de configurações."
          : error.message
      );
      return;
    }

    setNotices((current) => [data as TeamNoticeRow, ...current]);
    setNoticeDraft(emptyNotice);
    setNoticeMessage("Aviso publicado.");
  };

  const handleDeleteNotice = async (noticeId: string) => {
    const supabase = getSupabaseClient();
    const { error } = await supabase.from("avisos_equipe").delete().eq("id", noticeId);

    if (error) {
      setNoticeMessage(error.message);
      return;
    }

    setNotices((current) => current.filter((notice) => notice.id !== noticeId));
    setNoticeMessage("Aviso removido.");
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

        <section className="glass-card" style={{ padding: "28px", display: "grid", gap: "20px" }}>
          <div style={{ display: "grid", gap: "8px" }}>
            <span className="eyebrow">equipes do weblab</span>
            <h2 style={{ margin: 0 }}>Nucleos ativos do laboratorio</h2>
            <p className="muted" style={{ margin: 0, maxWidth: "70ch" }}>
              Aqui a coordenacao pode criar equipes e ajustar o nome de cada nucleo. Os badges de cor
              tambem seguem essa identidade no dashboard.
            </p>
          </div>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "minmax(0, 1.2fr) minmax(260px, 0.8fr)",
              gap: "20px"
            }}
          >
            <div style={{ display: "grid", gap: "14px" }}>
              {managedTeams.length > 0 ? (
                managedTeams.map((managedTeam) => {
                  const tone = getTeamBadgeTone(managedTeam.nome);

                  return (
                    <article
                      key={managedTeam.id}
                      style={{
                        border: "1px solid rgba(15, 23, 42, 0.08)",
                        borderRadius: "20px",
                        padding: "18px",
                        display: "grid",
                        gap: "14px",
                        background: "rgba(255,255,255,0.75)"
                      }}
                    >
                      <div
                        style={{
                          display: "flex",
                          justifyContent: "space-between",
                          gap: "12px",
                          alignItems: "center",
                          flexWrap: "wrap"
                        }}
                      >
                        <span
                          style={{
                            display: "inline-flex",
                            alignItems: "center",
                            gap: "8px",
                            padding: "6px 12px",
                            borderRadius: "999px",
                            border: `1px solid ${tone.border}`,
                            background: tone.background,
                            color: tone.text,
                            fontWeight: 700,
                            fontSize: "0.88rem"
                          }}
                        >
                          <span
                            aria-hidden="true"
                            style={{
                              width: "10px",
                              height: "10px",
                              borderRadius: "999px",
                              background: tone.text
                            }}
                          />
                          {managedTeam.nome}
                        </span>
                        <span className="muted" style={{ fontSize: "0.88rem" }}>
                          Convite: {managedTeam.codigo_convite ?? "Não configurado"}
                        </span>
                      </div>

                      <div
                        style={{
                          display: "flex",
                          gap: "12px",
                          alignItems: "center",
                          flexWrap: "wrap"
                        }}
                      >
                        <input
                          onChange={handleTeamEditChange(managedTeam.id)}
                          placeholder="Nome da equipe"
                          style={{ flex: "1 1 240px" }}
                          value={teamEdits[managedTeam.id] ?? managedTeam.nome}
                        />
                        <button
                          className="button button-secondary"
                          disabled={isManagingTeams && teamPendingId === managedTeam.id}
                          onClick={() => handleRenameTeam(managedTeam)}
                          type="button"
                        >
                          {isManagingTeams && teamPendingId === managedTeam.id ? "Salvando..." : "Salvar nome"}
                        </button>
                      </div>
                    </article>
                  );
                })
              ) : (
                <article
                  style={{
                    border: "1px dashed rgba(15, 23, 42, 0.14)",
                    borderRadius: "20px",
                    padding: "18px",
                    background: "rgba(255,255,255,0.7)"
                  }}
                >
                  <p className="muted" style={{ margin: 0 }}>
                    Ainda não encontrei o catálogo de equipes. Rode a migração nova no Supabase para
                    habilitar esta area.
                  </p>
                </article>
              )}
            </div>

            <aside
              style={{
                border: "1px solid rgba(15, 23, 42, 0.08)",
                borderRadius: "24px",
                padding: "20px",
                background: "rgba(255,255,255,0.78)",
                display: "grid",
                gap: "14px",
                alignSelf: "start"
              }}
            >
              <div style={{ display: "grid", gap: "6px" }}>
                <strong style={{ fontSize: "1.05rem" }}>Criar nova equipe</strong>
                <p className="muted" style={{ margin: 0 }}>
                  Vamos deixar quatro nucleos iniciais prontos, mas voce pode criar outros quando precisar.
                </p>
              </div>
              <input
                onChange={(event) => setTeamNameDraft(event.target.value)}
                placeholder="Ex.: Equipe de Terapias"
                value={teamNameDraft}
              />
              <button
                className="button button-primary"
                disabled={isManagingTeams}
                onClick={handleCreateTeam}
                type="button"
              >
                {isManagingTeams && !teamPendingId ? "Criando..." : "Criar equipe"}
              </button>
              {teamMessage ? (
                <p className="muted" style={{ margin: 0 }}>
                  {teamMessage}
                </p>
              ) : null}
            </aside>
          </div>
        </section>

        <section className="glass-card config-site-panel">
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

          <div className="config-action-row">
            <button className="button button-secondary" onClick={handleAddMember} type="button">
              Adicionar integrante
            </button>
            <button className="button" onClick={handleUseRegisteredMembers} type="button">
              Usar membros cadastrados
            </button>
            <button className="button" onClick={handleClearMembers} type="button">
              Limpar lista
            </button>
          </div>

          <div className="config-member-list">
            {teamContent.integrantes.length > 0 ? (
              teamContent.integrantes.map((member, index) => (
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
              ))
            ) : (
              <div className="config-empty-members">
                Nenhum integrante configurado para a página Equipe.
              </div>
            )}
          </div>

          {errorMessage ? <p className="danger">{errorMessage}</p> : null}
          {saveMessage ? <p className="muted">{saveMessage}</p> : null}

          <button className="button button-primary" disabled={isSaving} onClick={handleSaveContent} type="button">
            {isSaving ? "Salvando..." : "Salvar conteúdo da equipe"}
          </button>
        </section>

        <section className="glass-card config-site-panel">
          <div style={{ display: "grid", gap: "8px" }}>
            <span className="eyebrow">avisos e eventos</span>
            <h2 style={{ margin: 0 }}>Publicações internas da equipe</h2>
            <p className="muted" style={{ margin: 0 }}>
              Publique comunicados, prazos, eventos e novidades que aparecem na aba Avisos.
            </p>
          </div>

          <div className="config-member-editor">
            <div className="field">
              <label htmlFor="avisoTitulo">Título</label>
              <input
                id="avisoTitulo"
                onChange={handleNoticeDraftChange("titulo")}
                placeholder="Ex.: Reunião de acompanhamento"
                value={noticeDraft.titulo}
              />
            </div>

            <div className="field">
              <label htmlFor="avisoCategoria">Categoria</label>
              <select
                id="avisoCategoria"
                onChange={handleNoticeDraftChange("categoria")}
                value={noticeDraft.categoria}
              >
                {noticeCategories.map((category) => (
                  <option key={category} value={category}>
                    {category}
                  </option>
                ))}
              </select>
            </div>

            <div className="field">
              <label htmlFor="avisoData">Data do evento ou prazo</label>
              <input
                id="avisoData"
                onChange={handleNoticeDraftChange("dataEvento")}
                type="date"
                value={noticeDraft.dataEvento}
              />
            </div>

            <div className="field">
              <label htmlFor="avisoLink">Link</label>
              <input
                id="avisoLink"
                onChange={handleNoticeDraftChange("linkUrl")}
                placeholder="Opcional"
                type="url"
                value={noticeDraft.linkUrl}
              />
            </div>
          </div>

          <div className="field">
            <label htmlFor="avisoTexto">Texto</label>
            <textarea
              id="avisoTexto"
              onChange={handleNoticeDraftChange("texto")}
              placeholder="Escreva o comunicado de forma curta e direta."
              rows={4}
              value={noticeDraft.texto}
            />
          </div>

          <div className="config-action-row">
            <button
              className="button button-primary"
              disabled={isPublishingNotice}
              onClick={() => void handlePublishNotice()}
              type="button"
            >
              {isPublishingNotice ? "Publicando..." : "Publicar aviso"}
            </button>
          </div>

          {noticeMessage ? <p className="muted">{noticeMessage}</p> : null}

          <div className="config-member-list">
            {notices.length > 0 ? (
              notices.map((notice) => (
                <article className="config-notice-item" key={notice.id}>
                  <div>
                    <span className="lovable-news-meta">
                      {notice.categoria}
                      {notice.data_evento ? ` · ${new Date(`${notice.data_evento}T00:00:00`).toLocaleDateString("pt-BR")}` : ""}
                    </span>
                    <strong>{notice.titulo}</strong>
                    <p className="muted">{notice.texto}</p>
                    {notice.link_url ? (
                      <a className="public-inline-link" href={notice.link_url} rel="noreferrer" target="_blank">
                        Abrir link
                      </a>
                    ) : null}
                  </div>
                  <button
                    className="lovable-small-button dashboard-home-delete"
                    onClick={() => void handleDeleteNotice(notice.id)}
                    type="button"
                  >
                    Remover
                  </button>
                </article>
              ))
            ) : (
              <div className="config-empty-members">Nenhum aviso publicado ainda.</div>
            )}
          </div>
        </section>
      </div>
    </main>
  );
}
