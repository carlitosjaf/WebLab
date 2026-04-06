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
  { href: "/dashboard", label: "Dashboard", icon: "Dashboard" },
  { href: "/dashboard/periodicos" as Route, label: "Revistas e indices", icon: "Periodicos" },
  { href: "/dashboard/assistente-lattes", label: "Assistente Lattes", icon: "Lattes" },
  { href: "/dashboard/plataforma-brasil", label: "Plataforma Brasil", icon: "Comite" },
  {
    href: "/configuracoes",
    label: "Configuracoes da equipe",
    icon: "Equipe",
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
    <div style={{ display: "flex", minHeight: "100vh", backgroundColor: "var(--background)" }}>
      <aside
        className="glass-card"
        style={{
          width: "280px",
          margin: "16px",
          padding: "24px",
          display: "flex",
          flexDirection: "column",
          gap: "32px",
          position: "sticky",
          top: "16px",
          height: "calc(100vh - 32px)",
          borderRadius: "24px",
          zIndex: 40
        }}
      >
        <div style={{ padding: "0 8px" }}>
          <h2 style={{ margin: 0, fontSize: "1.5rem", color: "var(--accent-strong)" }}>WebLab</h2>
          <p className="muted" style={{ fontSize: "0.9rem", margin: "4px 0 0" }}>
            Fiocruz Labs
          </p>
        </div>

        <nav style={{ display: "flex", flexDirection: "column", gap: "8px", flex: 1 }}>
          <div
            className="muted"
            style={{
              fontSize: "0.75rem",
              textTransform: "uppercase",
              letterSpacing: "1px",
              margin: "0 8px 8px",
              fontWeight: 700
            }}
          >
            Navegacao
          </div>
          {visibleLinks.map((link) => {
            const isActive =
              pathname === link.href ||
              (pathname.startsWith(link.href + "/") && link.href !== "/dashboard");

            return (
              <Link
                key={link.href}
                href={link.href}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "12px",
                  padding: "12px 16px",
                  borderRadius: "14px",
                  textDecoration: "none",
                  fontWeight: isActive ? 600 : 500,
                  color: isActive ? "white" : "var(--foreground)",
                  background: isActive ? "var(--accent)" : "transparent",
                  border: isActive ? "none" : "1px solid transparent",
                  transition: "all 0.2s ease"
                }}
              >
                <span
                  style={{
                    fontSize: "0.8rem",
                    textTransform: "uppercase",
                    letterSpacing: "0.08em",
                    opacity: isActive ? 0.9 : 0.65
                  }}
                >
                  {link.icon}
                </span>
                {link.label}
              </Link>
            );
          })}
        </nav>

        <div style={{ marginTop: "auto", borderTop: "1px solid var(--surface-border)", paddingTop: "24px" }}>
          <button
            className="button button-secondary"
            onClick={handleSignOut}
            style={{ width: "100%", justifyContent: "center", display: "flex", gap: "8px" }}
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
