import { PublicPageHero } from "@/components/public/public-layout";
import { newsItems } from "@/lib/public-site";

const categories = ["All", "Publications", "Awards", "Presentations", "Events", "Announcements"];

export default function NewsPage() {
  return (
    <main className="lovable-home">
      <PublicPageHero
        description="Fique por dentro das últimas novidades do WebLab, e avisos de nossa equipe."
        title="Notícias e atualizações"
      />

      <section className="public-content-section">
        <div className="lovable-container">
          <div className="public-filter-row" aria-label="Categorias de avisos">
            {categories.map((category) => (
              <span className={category === "All" ? "public-filter active" : "public-filter"} key={category}>
                {category}
              </span>
            ))}
          </div>

          <div className="news-page-list">
            {newsItems
              .filter((item) => item.title || item.text)
              .map((item) => (
                <article className="news-page-item" key={`${item.category}-${item.date}-${item.title}`}>
                  <div>
                    <div className="lovable-news-meta">
                      <span>{item.category}</span>
                      <time>{item.date}</time>
                    </div>
                    <h2>{item.title}</h2>
                    <p>{item.text}</p>
                  </div>
                  <span aria-hidden="true">→</span>
                </article>
              ))}
          </div>
        </div>
      </section>
    </main>
  );
}
