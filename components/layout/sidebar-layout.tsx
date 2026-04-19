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

  return (
    <div className="app-frame">
      <header className="app-header">
        <div className="container app-header-inner">
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
              pathname === link.href ||
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
      </header>

      <main className="app-main">{children}</main>
    </div>
  );
}

