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
          className="hero-panel"
          style={{
            display: "grid",
            alignContent: "space-between",
            minHeight: "calc(100vh - 64px)"
          }}
        >
          <div style={{ maxWidth: "620px", display: "grid", gap: "18px" }}>
            <span className="eyebrow">laboratorio virtual para pesquisa</span>
            <h1 className="display-title">
              Construa, refine e publique ciencia dentro de um unico laboratorio.
            </h1>
            <p className="section-lead">
              O WebLab organiza escrita, memoria editorial, recomendacao de periodicos e trabalho em equipe
              num ambiente com cara de infraestrutura cientifica, nao de pasta solta.
            </p>
          </div>

          <div
            className="surface-muted"
            style={{
              padding: "24px",
              display: "grid",
              gap: "16px",
              maxWidth: "560px"
            }}
          >
            <div style={{ display: "grid", gap: "10px" }}>
              <strong style={{ fontSize: "1.1rem" }}>Tres nucleos do laboratorio</strong>
              <span className="muted">
                Cada parte do produto foi desenhada para apoiar a vida real de quem pesquisa, escreve e submete.
              </span>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: "12px" }}>
              {[
                ["Nucleo protegido", "Cada equipe opera em seu proprio espaco, com isolamento e regras claras."],
                ["Caderno vivo", "O editor salva, estrutura e acompanha a evolucao do artigo sem quebrar o fluxo."],
                ["Radar editorial", "O laboratorio ajuda a encontrar revistas e referencias sem tirar o foco da escrita."]
              ].map(([title, description]) => (
                <article
                  key={title}
                  style={{
                    padding: "16px",
                    borderRadius: "20px",
                    background: "rgba(255,255,255,0.72)",
                    border: "1px solid rgba(16,40,52,0.08)"
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
