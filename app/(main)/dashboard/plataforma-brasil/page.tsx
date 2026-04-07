import { Suspense } from "react";
import Link from "next/link";

import { CronogramaGenerator } from "@/components/plataforma-brasil/cronograma-generator";
import { OrcamentoGenerator } from "@/components/plataforma-brasil/orcamento-generator";
import { SubmissionChecklist } from "@/components/plataforma-brasil/submission-checklist";
import { TcleGenerator } from "@/components/plataforma-brasil/tcle-generator";

type PlataformaBrasilPageProps = {
  searchParams: Promise<{
    tab?: string;
  }>;
};

export default async function PlataformaBrasilPage({ searchParams }: PlataformaBrasilPageProps) {
  const resolvedSearchParams = await searchParams;
  const currentTab = resolvedSearchParams.tab || "tcle";

  return (
    <main className="shell">
      <div
        className="container"
        style={{ display: "grid", gap: "24px", paddingTop: "32px", paddingBottom: "32px" }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            gap: "16px",
            flexWrap: "wrap"
          }}
        >
          <div>
            <h1 style={{ margin: "0 0 8px 0" }}>Plataforma Brasil</h1>
            <p className="muted" style={{ margin: 0 }}>
              Gere rapidamente os documentos essenciais e acompanhe o checklist da equipe para
              submissão.
            </p>
          </div>
          <Link
            href="/dashboard"
            className="button button-secondary no-print"
            style={{ textDecoration: "none" }}
          >
            Voltar ao dashboard
          </Link>
        </div>

        <SubmissionChecklist />

        <div
          className="glass-card no-print"
          style={{ padding: "8px", display: "flex", gap: "8px", width: "fit-content" }}
        >
          <Link
            href="/dashboard/plataforma-brasil?tab=tcle"
            className={`button ${currentTab === "tcle" ? "button-primary" : "button-secondary"}`}
            style={{ textDecoration: "none" }}
          >
            TCLE
          </Link>
          <Link
            href="/dashboard/plataforma-brasil?tab=cronograma"
            className={`button ${currentTab === "cronograma" ? "button-primary" : "button-secondary"}`}
            style={{ textDecoration: "none" }}
          >
            Cronograma
          </Link>
          <Link
            href="/dashboard/plataforma-brasil?tab=orcamento"
            className={`button ${currentTab === "orcamento" ? "button-primary" : "button-secondary"}`}
            style={{ textDecoration: "none" }}
          >
            Orçamento
          </Link>
        </div>

        <section className="glass-card printable-area" style={{ padding: "32px", background: "#fff" }}>
          <Suspense fallback={<div>Carregando...</div>}>
            {currentTab === "cronograma" ? (
              <CronogramaGenerator />
            ) : currentTab === "orcamento" ? (
              <OrcamentoGenerator />
            ) : (
              <TcleGenerator />
            )}
          </Suspense>
        </section>
      </div>
    </main>
  );
}
