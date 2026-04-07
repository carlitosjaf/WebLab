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

const links: NavLink[] = [
  { href: "/dashboard", label: "Nucleo de projetos", icon: "01" },
  { href: "/dashboard/periodicos" as Route, label: "Radar editorial", icon: "02" },
  { href: "/dashboard/assistente-lattes", label: "Assistente Lattes", icon: "03" },
  { href: "/dashboard/plataforma-brasil", label: "Plataforma Brasil", icon: "04" },
  {
    href: "/configuracoes",
    label: "Configuracoes da equipe",
    icon: "05",
    coordinatorOnly: true
  }
];

export function SidebarLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [role, setRole] = useState<UserRole | null>(null);
  const [isSigningOut, startSignOutTransition] = useTransition();

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

  const handleSignOut = () => {
    startSignOutTransition(async () => {
      const supabase = getSupabaseClient();
      await supabase.auth.signOut();
      router.replace("/");
      router.refresh();
    });
  };

  return (
    <div className="sidebar-shell">
      <aside
        className="sidebar-panel"
        style={{ zIndex: 40 }}
      >
        <div className="sidebar-brand">
          <span className="sidebar-brand-mark">nucleo ativo</span>
          <div style={{ display: "grid", gap: "6px" }}>
            <h2 className="sidebar-title">WebLab</h2>
            <p style={{ margin: 0, color: "rgba(255,255,255,0.66)", lineHeight: 1.6 }}>
              Laboratorio virtual para escrita, submissao e memoria cientifica colaborativa.
            </p>
          </div>
          <div
            style={{
              display: "grid",
              gap: "6px",
              padding: "14px 16px",
              borderRadius: "18px",
              background: "rgba(255,255,255,0.05)",
              border: "1px solid rgba(255,255,255,0.06)"
            }}
          >
            <span style={{ fontSize: "0.76rem", letterSpacing: "0.12em", textTransform: "uppercase", color: "rgba(162,220,213,0.78)" }}>
              ambiente
            </span>
            <strong>Fluxo protegido por equipe</strong>
          </div>
        </div>

        <nav style={{ display: "flex", flexDirection: "column", gap: "8px", flex: 1 }}>
          <div className="sidebar-nav-label">Navegacao</div>
          {visibleLinks.map((link) => {
            const isActive =
              pathname === link.href ||
              (pathname.startsWith(link.href + "/") && link.href !== "/dashboard");

            return (
              <Link
                key={link.href}
                href={link.href}
                className={isActive ? "nav-link nav-link-active" : "nav-link"}
              >
                <span className="nav-icon">
                  {link.icon}
                </span>
                {link.label}
              </Link>
            );
          })}
        </nav>

        <div style={{ marginTop: "auto", borderTop: "1px solid rgba(255,255,255,0.08)", paddingTop: "24px" }}>
          <button
            className="button button-secondary"
            onClick={handleSignOut}
            style={{
              width: "100%",
              justifyContent: "center",
              display: "flex",
              gap: "8px",
              background: "rgba(255,255,255,0.08)",
              color: "white",
              border: "1px solid rgba(255,255,255,0.12)"
            }}
            type="button"
          >
            {isSigningOut ? "Saindo..." : "Sair da conta"}
          </button>
        </div>
      </aside>

      <main style={{ flex: 1, overflowX: "hidden", minWidth: 0 }}>{children}</main>
    </div>
  );
}
