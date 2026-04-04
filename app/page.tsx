import { Suspense } from "react";

import { AuthCard } from "@/components/auth/auth-card";

export default function LoginPage() {
  return (
    <main className="shell">
      <div
        className="container"
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))",
          gap: "24px",
          alignItems: "stretch"
        }}
      >
        <section
          style={{
            padding: "28px",
            display: "grid",
            alignContent: "space-between",
            minHeight: "calc(100vh - 64px)"
          }}
        >
          <div style={{ maxWidth: "620px", display: "grid", gap: "18px" }}>
            <p
              style={{
                margin: 0,
                color: "var(--accent-strong)",
                letterSpacing: "0.08em",
                textTransform: "uppercase",
                fontSize: "0.82rem",
                fontWeight: 700
              }}
            >
              pesquisa colaborativa
            </p>
            <h2 style={{ margin: 0, fontSize: "clamp(2.8rem, 7vw, 5.2rem)", lineHeight: 0.95 }}>
              Produza ciencia com fluxo, contexto e equipe protegida.
            </h2>
            <p className="muted" style={{ margin: 0, maxWidth: "52ch", fontSize: "1.05rem" }}>
              O WebLab foi pensado para pesquisadores que precisam sair do caos de arquivos
              espalhados e trabalhar em artigos com autonomia, historico e foco.
            </p>
          </div>

          <div
            className="glass-card"
            style={{
              padding: "24px",
              display: "grid",
              gap: "16px",
              maxWidth: "560px"
            }}
          >
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "12px" }}>
              {[
                ["Equipes isoladas", "Cada time visualiza apenas os proprios artigos."],
                ["Editor vivo", "Escrita com salvamento automatico e menos perda de contexto."],
                ["Dashboard claro", "Entrada unica para criar, abrir e acompanhar os textos."]
              ].map(([title, description]) => (
                <article
                  key={title}
                  style={{
                    padding: "16px",
                    borderRadius: "20px",
                    background: "rgba(255,255,255,0.68)",
                    border: "1px solid rgba(36,26,19,0.08)"
                  }}
                >
                  <strong style={{ display: "block", marginBottom: "8px" }}>{title}</strong>
                  <span className="muted" style={{ fontSize: "0.92rem" }}>
                    {description}
                  </span>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section
          style={{
            display: "grid",
            placeItems: "center"
          }}
        >
          <Suspense>
            <AuthCard />
          </Suspense>
        </section>
      </div>
    </main>
  );
}
