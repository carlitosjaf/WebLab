import { Suspense } from "react";

import { AuthCard } from "@/components/auth/auth-card";

export default function LoginPage() {
  return (
    <main className="login-gate">
      <section className="login-gate-hero" aria-label="Acesso ao WebLab">
        <div className="login-gate-media" aria-hidden="true" />
        <div className="lovable-container login-gate-grid">
          <div className="login-gate-copy">
            <span className="lovable-kicker">Laboratório virtual</span>
            <h1>Escreva. Organize. Submeta.</h1>
            <p>
              Produzir e compartilhar conhecimento, para o fortalecimento do sistema (SUS) e por
              uma sociedade mais saudável, democrática e justa.
            </p>
          </div>

          <Suspense>
            <AuthCard />
          </Suspense>
        </div>
      </section>
    </main>
  );
}
