import { PublicPageHero } from "@/components/public/public-layout";
import { principalInvestigator, teamMembers } from "@/lib/public-site";

const categories = ["All", "Pós-doutorandos", "Estudantes de doutorado", "Estudantes de graduação"];

export default function TeamPage() {
  return (
    <main className="lovable-home">
      <PublicPageHero
        description="Um grupo de pesquisadores conectado por ciência, formação e produção de conhecimento em saúde."
        title="Nossa equipe"
      />

      <section className="public-content-section">
        <div className="lovable-container">
          <article className="team-pi-card">
            <div className="team-pi-photo">
              <img alt={principalInvestigator.name} src={principalInvestigator.image} />
            </div>
            <div>
              <h2>{principalInvestigator.name}</h2>
              <p className="team-role">{principalInvestigator.role}</p>
              <p className="team-education">{principalInvestigator.education}</p>
              <p>{principalInvestigator.bio}</p>
              <div className="public-chip-row">
                {principalInvestigator.research.map((item) => (
                  <span className="public-chip" key={item}>
                    {item}
                  </span>
                ))}
              </div>
              <a className="public-inline-link" href={`mailto:${principalInvestigator.email}`}>
                {principalInvestigator.email}
              </a>
            </div>
          </article>

          <div className="public-filter-row" aria-label="Categorias da equipe">
            {categories.map((category) => (
              <span className={category === "All" ? "public-filter active" : "public-filter"} key={category}>
                {category}
              </span>
            ))}
          </div>

          <div className="team-section-block">
            <h2>Pós-doutorandos</h2>
            <div className="team-grid">
              {teamMembers
                .filter((member) => member.category === "Pós-doutorandos")
                .map((member) => (
                  <article className="team-member-card" key={member.name}>
                    <img alt="" src={member.image} />
                    <div>
                      <h3>{member.name}</h3>
                      <p>{member.role}</p>
                    </div>
                  </article>
                ))}
            </div>
          </div>

          <div className="team-section-block">
            <h2>Estudantes de doutorado</h2>
            <div className="public-empty-line" />
          </div>

          <div className="team-section-block">
            <h2>Estudantes de graduação</h2>
            <div className="team-grid">
              {teamMembers
                .filter((member) => member.category === "Estudantes de graduação")
                .map((member) => (
                  <article className="team-member-card" key={member.name}>
                    <img alt="" src={member.image} />
                    <div>
                      <h3>{member.name}</h3>
                      <p>{member.role}</p>
                    </div>
                  </article>
                ))}
            </div>
          </div>

          <div className="team-section-block">
            <h2>Ex-Alunos</h2>
            <div className="public-empty-line" />
          </div>
        </div>
      </section>
    </main>
  );
}
