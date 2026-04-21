"use client";

import Link from "next/link";
import type { Route } from "next";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useMemo, useState, useTransition } from "react";
import React from "react";

import { getSupabaseClient } from "@/lib/supabaseClient";
import type { UserRole } from "@/lib/types";

type NavLink = {
  href: Route;
  label: string;
  icon: string;
  coordinatorOnly?: boolean;
};

type WorkspaceTreeLink = {
  href: Route;
  label: string;
  key: string;
};

const links: NavLink[] = [
  { href: "/dashboard", label: "Home", icon: "01" },
  { href: "/dashboard/equipe" as Route, label: "Equipe", icon: "02" },
  { href: "/dashboard/artigos" as Route, label: "Artigos", icon: "03" },
  { href: "/dashboard/triagem" as Route, label: "Triagem", icon: "04" },
  { href: "/dashboard/publicacoes" as Route, label: "Publicações", icon: "05" },
  { href: "/dashboard/avisos" as Route, label: "Avisos", icon: "06" }
];

const accountLinks: NavLink[] = [
  {
    href: "/configuracoes",
    label: "Configurações",
    icon: "07",
    coordinatorOnly: true
  }
];

const ARTICLE_WORKSPACE_PATHS = [
  "/dashboard/artigos",
  "/dashboard/periodicos",
  "/dashboard/triagem",
  "/dashboard/plataforma-brasil",
  "/dashboard/assistente-lattes",
  "/editor"
] as const;

function extractArticleId(pathname: string) {
  const articlePanelMatch = pathname.match(/^\/dashboard\/artigos\/([^/]+)$/);

  if (articlePanelMatch?.[1]) {
    return articlePanelMatch[1];
  }

  const editorMatch = pathname.match(/^\/editor\/([^/]+)$/);
  return editorMatch?.[1] ?? null;
}

function isArticleWorkspace(pathname: string) {
  return ARTICLE_WORKSPACE_PATHS.some((basePath) => pathname === basePath || pathname.startsWith(`${basePath}/`));
}

function getWorkspaceChildKey(pathname: string) {
  if (pathname === "/dashboard/artigos") {
    return "biblioteca";
  }

  if (/^\/dashboard\/artigos\/[^/]+$/.test(pathname)) {
    return "painel";
  }

  if (/^\/editor\/[^/]+$/.test(pathname)) {
    return "editor";
  }

  if (pathname.startsWith("/dashboard/periodicos")) {
    return "radar";
  }

  if (pathname.startsWith("/dashboard/triagem")) {
    return "triagem";
  }

  if (pathname.startsWith("/dashboard/plataforma-brasil")) {
    return "plataforma";
  }

  if (pathname.startsWith("/dashboard/assistente-lattes")) {
    return "lattes";
  }

  return null;
}

export function SidebarLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [role, setRole] = useState<UserRole | null>(null);
  const [isSigningOut, startSignOutTransition] = useTransition();
  const [workspaceArticleId, setWorkspaceArticleId] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;

    const loadRole = async () => {
      const supabase = getSupabaseClient();
      const {
        data: { user }
      } = await supabase.auth.getUser();

      if (!user || !isMounted) {
        return;
      }

      const { data: profile } = await supabase
        .from("perfis")
        .select("role")
        .eq("id", user.id)
        .maybeSingle();

      if (isMounted && profile?.role) {
        setRole(profile.role);
      }
    };

    void loadRole();

    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    const currentArticleId = extractArticleId(pathname);

    if (currentArticleId) {
      setWorkspaceArticleId(currentArticleId);
      window.localStorage.setItem("weblab:last-article-id", currentArticleId);
      return;
    }

    const savedArticleId = window.localStorage.getItem("weblab:last-article-id");
    if (savedArticleId) {
      setWorkspaceArticleId(savedArticleId);
    }
  }, [pathname]);

  const visibleLinks = useMemo(
    () =>
      links.filter(
        (link) =>
          !link.coordinatorOnly ||
          role === "coordenador" ||
          role === "coordenador_geral"
      ),
    [role]
  );

  const visibleAccountLinks = useMemo(
    () =>
      accountLinks.filter(
        (link) =>
          !link.coordinatorOnly ||
          role === "coordenador" ||
          role === "coordenador_geral"
      ),
    [role]
  );

  const handleSignOut = () => {
    startSignOutTransition(async () => {
      const supabase = getSupabaseClient();
      await supabase.auth.signOut();
      router.replace("/");
      router.refresh();
    });
  };

  const articleWorkspaceLinks = useMemo<WorkspaceTreeLink[]>(() => {
    const links: WorkspaceTreeLink[] = [
      { href: "/dashboard/artigos" as Route, label: "Biblioteca", key: "biblioteca" },
      { href: "/dashboard/periodicos" as Route, label: "Radar editorial", key: "radar" },
      { href: "/dashboard/triagem" as Route, label: "Triagem de evidências", key: "triagem" },
      { href: "/dashboard/plataforma-brasil" as Route, label: "Plataforma Brasil", key: "plataforma" },
      { href: "/dashboard/assistente-lattes" as Route, label: "Assistente Lattes", key: "lattes" }
    ];

    if (workspaceArticleId) {
      links.splice(1, 0, {
        href: `/dashboard/artigos/${workspaceArticleId}` as Route,
        label: "Painel do manuscrito",
        key: "painel"
      });
      links.splice(2, 0, {
        href: `/editor/${workspaceArticleId}` as Route,
        label: "Editor vivo",
        key: "editor"
      });
    }

    return links;
  }, [workspaceArticleId]);

  const workspaceTree = useMemo(() => {
    if (!isArticleWorkspace(pathname)) {
      return null;
    }

    return {
      label: "Artigos",
      helper: workspaceArticleId
        ? "Navegue entre o manuscrito atual e as ferramentas conectadas sem voltar para a biblioteca."
        : "Abra um manuscrito para habilitar o painel e o editor vivo dentro desta árvore.",
      activeChildKey: getWorkspaceChildKey(pathname),
      links: articleWorkspaceLinks
    };
  }, [articleWorkspaceLinks, pathname, workspaceArticleId]);

  return (
    <div className="app-frame">
      <header className="app-header">
        <div className="container app-header-shell">
          <div className="app-header-inner">
            <button className="brand-lockup brand-button" onClick={() => router.push("/dashboard")} type="button">
              <span className="brand-mark" aria-hidden="true">
                <svg viewBox="0 0 32 32" role="img">
                  <path d="M6 14h20v14H6z" />
                  <path d="M10 14V8m6 6V5m6 9V8" />
                  <path d="M4 14h24" />
                  <path d="M12 22h8" />
                  <path d="M14 28v-6h4v6" />
                </svg>
              </span>
              <span>WebLab</span>
            </button>

            <nav className="app-nav" aria-label="Navegação do laboratório">
            {visibleLinks.map((link) => {
              const isActive =
                link.href === "/dashboard/artigos"
                  ? isArticleWorkspace(pathname)
                  : pathname === link.href ||
                    (pathname.startsWith(link.href + "/") && link.href !== "/dashboard");

              return (
                <Link
                  key={link.href}
                  href={link.href}
                  className={isActive ? "nav-link nav-link-active" : "nav-link"}
                >
                  {link.label}
                </Link>
              );
            })}
            </nav>

            <div className="app-account-actions">
              {visibleAccountLinks.map((link) => (
                <Link className="app-account-link" href={link.href} key={link.href}>
                  {link.label}
                </Link>
              ))}
              <button
                className="app-account-link app-sign-out-link"
                onClick={handleSignOut}
                type="button"
              >
                {isSigningOut ? "Saindo..." : "Sair"}
              </button>
            </div>
          </div>

          {workspaceTree ? (
            <div className="app-workspace-tree" aria-label="Árvore de ferramentas do módulo atual">
              <div className="app-workspace-tree__head">
                <div>
                  <span className="app-workspace-tree__eyebrow">Árvore ativa</span>
                  <strong>{workspaceTree.label}</strong>
                </div>
                <p>{workspaceTree.helper}</p>
              </div>

              <div className="app-workspace-tree__branch">
                <span className="app-workspace-tree__root">Artigos</span>
                <div className="app-workspace-tree__children">
                  {workspaceTree.links.map((link) => (
                    <Link
                      key={link.key}
                      href={link.href}
                      className={
                        workspaceTree.activeChildKey === link.key
                          ? "app-workspace-tree__link active"
                          : "app-workspace-tree__link"
                      }
                    >
                      <span className="app-workspace-tree__bullet" aria-hidden="true" />
                      <span>{link.label}</span>
                    </Link>
                  ))}
                </div>
              </div>
            </div>
          ) : null}
        </div>
      </header>

      <main className="app-main">{children}</main>
    </div>
  );
}

