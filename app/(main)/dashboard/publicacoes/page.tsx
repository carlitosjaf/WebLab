import Link from "next/link";

import { PublicPageHero } from "@/components/public/public-layout";
import { publications } from "@/lib/public-site";

export default function PublicationsPage() {
  const featured = publications.filter((publication) => publication.featured);
  const years = [...new Set(publications.map((publication) => publication.year))].sort().reverse();

  return (
    <main className="lovable-home">
      <PublicPageHero
        description="Nossa produção de pesquisa abrange manuscritos em preparo, submetidos, finalizados e publicados."
        title="Publicações"
      />

      <section className="public-content-section">
        <div className="lovable-container">
          <h2 className="public-section-title">Publicações em destaque</h2>
          <div className="publication-featured-grid">
            {featured.map((publication) => (
              <article className="publication-featured-card" key={publication.title}>
                <h3>{publication.title}</h3>
                <p>
                  {publication.journal} ({publication.year})
                </p>
                <div>
                  <span>{publication.citations} citations</span>
                  <Link href="/dashboard">Abrir fluxo →</Link>
                </div>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="public-content-section public-muted-section">
        <div className="lovable-container publication-layout">
          <aside className="publication-filters" aria-label="Filtros de publicação">
            <input aria-label="Buscar publicações" placeholder="Search publications..." readOnly />
            <h3>Filter by Year</h3>
            <span className="public-filter active">All Years</span>
            {years.map((year) => (
              <span className="public-filter" key={year}>
                {year}
              </span>
            ))}
          </aside>

          <div className="publication-list">
            {years.map((year) => (
              <section key={year}>
                <h2>{year}</h2>
                <div className="publication-year-list">
                  {publications
                    .filter((publication) => publication.year === year)
                    .map((publication) => (
                      <article className="publication-list-item" key={publication.title}>
                        <h3>{publication.title}</h3>
                        <p>{publication.authors}</p>
                        <div>
                          <span>{publication.journal}</span>
                          <span>{publication.status}</span>
                        </div>
                        <p>{publication.abstract}</p>
                      </article>
                    ))}
                </div>
              </section>
            ))}
          </div>
        </div>
      </section>
    </main>
  );
}
