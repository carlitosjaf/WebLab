import Link from "next/link";
import type { Route } from "next";

import { publicNavLinks } from "@/lib/public-site";

export function PublicHeader({ active = "/" }: { active?: string }) {
  return (
    <header className="lovable-header">
      <Link className="lovable-brand" href="/" aria-label="WebLab">
        <span className="lovable-brand-icon" aria-hidden="true">
          W
        </span>
        <span>WebLab</span>
      </Link>

      <nav className="lovable-nav" aria-label="Navegação principal">
        {publicNavLinks.map((link) => (
          <Link className={active === link.href ? "active" : ""} href={link.href as Route} key={link.href}>
            {link.label}
          </Link>
        ))}
      </nav>
    </header>
  );
}

export function PublicFooter() {
  return (
    <footer className="lovable-footer">
      <div className="lovable-container lovable-footer-grid">
        <div>
          <Link className="lovable-brand lovable-brand-footer" href="/">
            <span className="lovable-brand-icon" aria-hidden="true">
              W
            </span>
            <span>WebLab</span>
          </Link>
          <p>Escrita, equipe e publicação científica em um fluxo protegido.</p>
        </div>

        <div>
          <h3>Quick Links</h3>
          {publicNavLinks.map((link) => (
            <Link href={link.href as Route} key={link.href}>
              {link.label}
            </Link>
          ))}
        </div>

        <div>
          <h3>Contato</h3>
          <p>Liteb - Fiocruz</p>
          <p>Av. Brasil, 4365 - Manguinhos</p>
          <p>Rio de janeiro</p>
          <p>cjunior3103@gmail.com</p>
        </div>

        <div>
          <h3>Horário de atendimento</h3>
          <p>Monday – Friday</p>
          <p>9:00 AM – 5:00 PM</p>
        </div>
      </div>
      <p className="lovable-footer-copy">© 2025 WebLab. All rights reserved.</p>
    </footer>
  );
}

export function PublicPageHero({
  title,
  description,
  variant = "hero"
}: {
  title: string;
  description: string;
  variant?: "hero" | "research";
}) {
  return (
    <section className={variant === "research" ? "public-page-hero public-page-hero-research" : "public-page-hero"}>
      <div className="lovable-container">
        <h1>{title}</h1>
        <p>{description}</p>
      </div>
    </section>
  );
}
