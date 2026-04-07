import Link from "next/link";
import type { Route } from "next";

import { PublicPageHero } from "@/components/public/public-layout";
import { activeProjects, weblabTools } from "@/lib/public-site";

const statusClass: Record<string, string> = {
  Ativo: "public-status-active",
  Finalizado: "public-status-muted",
  Planejamento: "public-status-planning"
};

export default function ResearchPage() {
  return (
    <main className="lovable-home">
      <PublicPageHero
        description="Ferramentas para escrever, organizar, validar periódicos e preparar a submissão científica."
        title="Ferramentas do WebLab"
        variant="research"
      />

      <section className="public-content-section">
        <div className="lovable-container">
          <h2 className="public-section-title">Ferramentas do WebLab</h2>
          <div className="research-theme-grid">
            {weblabTools.map((tool) => (
              <Link className="research-theme-card" href={tool.href as Route} key={tool.label}>
                <span>{tool.icon}</span>
                <h3>{tool.label}</h3>
                <p>{tool.description}</p>
              </Link>
            ))}
          </div>
        </div>
      </section>

      <section className="public-content-section public-muted-section">
        <div className="lovable-container">
          <div className="public-section-head-row">
            <h2 className="public-section-title">Projetos atuais</h2>
            <Link className="lovable-small-button" href="/dashboard">
              Abrir área de escrita
            </Link>
          </div>

          <div className="project-public-grid">
            {activeProjects.map((project) => (
              <article className="project-public-card" key={project.title}>
                <img alt="" src={project.image} />
                <div className="project-public-body">
                  <div className="project-public-topline">
                    <h3>{project.title}</h3>
                    <span className={statusClass[project.status] ?? "public-status-active"}>
                      {project.status}
                    </span>
                  </div>
                  <div className="project-public-meta">
                    <span>{project.duration}</span>
                    <span>•</span>
                    <span>{project.funding}</span>
                  </div>
                  <p>{project.description}</p>
                  <div className="public-chip-row">
                    {project.team.map((member) => (
                      <span className="public-chip" key={member}>
                        {member}
                      </span>
                    ))}
                  </div>
                  <div className="project-public-actions">
                    <Link href="/dashboard">Abrir no WebLab →</Link>
                    <Link href="/dashboard/periodicos">Radar editorial →</Link>
                  </div>
                </div>
              </article>
            ))}
          </div>
        </div>
      </section>
    </main>
  );
}
