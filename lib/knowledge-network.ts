import type { ArticleContent, ArticleRow } from "@/lib/types";

export type TeamConcept = {
  term: string;
  count: number;
  articleIds: string[];
  articleTitles: string[];
};

export type ArticleConnection = {
  id: string;
  leftArticle: Pick<ArticleRow, "id" | "titulo">;
  rightArticle: Pick<ArticleRow, "id" | "titulo">;
  sharedTerms: string[];
  score: number;
};

const STOPWORDS = new Set([
  "ainda",
  "alem",
  "analise",
  "artigo",
  "assim",
  "atraves",
  "brasil",
  "brasileira",
  "brasileiro",
  "dados",
  "dessa",
  "desse",
  "deste",
  "durante",
  "entre",
  "equipe",
  "estudo",
  "forma",
  "foram",
  "maior",
  "menor",
  "mesmo",
  "muito",
  "neste",
  "parte",
  "pesquisa",
  "podem",
  "porque",
  "processo",
  "quando",
  "sobre",
  "tambem",
  "texto",
  "weblab"
]);

function normalize(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function getNodeText(node: Record<string, unknown>): string {
  const text = typeof node.text === "string" ? node.text : "";
  const content = Array.isArray(node.content) ? node.content : [];
  const nested = content
    .filter((child): child is Record<string, unknown> => Boolean(child) && typeof child === "object")
    .map(getNodeText)
    .join(" ");

  return `${text} ${nested}`.replace(/\s+/g, " ").trim();
}

function extractPlainText(content: ArticleContent | null) {
  return (content?.content ?? [])
    .map((node) => getNodeText(node))
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
}

function extractTerms(article: ArticleRow) {
  const rawText = `${article.titulo} ${extractPlainText(article.conteudo_json)}`;
  const words = normalize(rawText).match(/[a-z]{5,}/g) ?? [];
  const counts = new Map<string, number>();

  words.forEach((word) => {
    if (!STOPWORDS.has(word)) {
      counts.set(word, (counts.get(word) ?? 0) + 1);
    }
  });

  return Array.from(counts.entries())
    .sort((left, right) => right[1] - left[1])
    .slice(0, 36);
}

export function buildTeamKnowledgeMap(articles: ArticleRow[]) {
  const articleTerms = new Map<string, Array<[string, number]>>();
  const conceptMap = new Map<string, { count: number; articles: Map<string, string> }>();

  articles.forEach((article) => {
    const terms = extractTerms(article);
    articleTerms.set(article.id, terms);

    terms.forEach(([term, count]) => {
      const current = conceptMap.get(term) ?? { count: 0, articles: new Map<string, string>() };
      current.count += count;
      current.articles.set(article.id, article.titulo);
      conceptMap.set(term, current);
    });
  });

  const concepts: TeamConcept[] = Array.from(conceptMap.entries())
    .filter(([, data]) => data.articles.size > 1 || articles.length === 1)
    .sort((left, right) => {
      const articleSpread = right[1].articles.size - left[1].articles.size;
      return articleSpread || right[1].count - left[1].count;
    })
    .slice(0, 10)
    .map(([term, data]) => ({
      term,
      count: data.count,
      articleIds: Array.from(data.articles.keys()),
      articleTitles: Array.from(data.articles.values())
    }));

  const connections: ArticleConnection[] = [];

  for (let leftIndex = 0; leftIndex < articles.length; leftIndex += 1) {
    for (let rightIndex = leftIndex + 1; rightIndex < articles.length; rightIndex += 1) {
      const left = articles[leftIndex];
      const right = articles[rightIndex];
      const leftTerms = new Set((articleTerms.get(left.id) ?? []).map(([term]) => term));
      const sharedTerms = (articleTerms.get(right.id) ?? [])
        .map(([term]) => term)
        .filter((term) => leftTerms.has(term))
        .slice(0, 8);

      if (sharedTerms.length > 0) {
        connections.push({
          id: `${left.id}-${right.id}`,
          leftArticle: { id: left.id, titulo: left.titulo },
          rightArticle: { id: right.id, titulo: right.titulo },
          sharedTerms,
          score: sharedTerms.length
        });
      }
    }
  }

  return {
    concepts,
    connections: connections.sort((left, right) => right.score - left.score).slice(0, 6)
  };
}
