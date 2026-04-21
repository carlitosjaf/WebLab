import { ArticleIntelligencePage } from "@/components/articles/article-intelligence-page";
import { SidebarLayout } from "@/components/layout/sidebar-layout";
import {
  OFFICIAL_EDITORIAL_ENTRY,
  OFFICIAL_EDITORIAL_MANUSCRIPT,
  OFFICIAL_EDITORIAL_ROUTE
} from "@/lib/article-intelligence";
import { extractPlainText } from "@/lib/periodicos";
import { getSupabaseServerClient } from "@/lib/supabase/admin";
import type { ArticleRow } from "@/lib/types";
import { formatStatusLabel } from "@/lib/weblab";

type ArticleIntelligenceRouteProps = {
  params: Promise<{
    id: string;
  }>;
};

function formatStageLabel(status: ArticleRow["status"] | null | undefined) {
  if (!status) {
    return "Em revisão editorial";
  }

  const label = formatStatusLabel(status);
  return label === "Em rascunho" ? "Em revisão editorial" : label;
}

async function loadArticle(id: string) {
  try {
    const supabase = getSupabaseServerClient();
    const { data } = await supabase
      .from("artigos")
      .select("id, titulo, status, conteudo_json, google_doc_url, google_last_synced_at, updated_at")
      .eq("id", id)
      .maybeSingle();

    return (data as ArticleRow | null) ?? null;
  } catch {
    return null;
  }
}

export default async function ArticleIntelligenceRoute({ params }: ArticleIntelligenceRouteProps) {
  const { id } = await params;
  const article = await loadArticle(id);
  const manuscriptText = article?.conteudo_json ? extractPlainText(article.conteudo_json) : "";
  const hasUsableText = manuscriptText.trim().length > 140;
  const isOfficialEditorialEntry = id === OFFICIAL_EDITORIAL_ROUTE && !article;

  const title = article?.titulo ??
    (isOfficialEditorialEntry
      ? OFFICIAL_EDITORIAL_ENTRY.title
      : "Inteligência editorial do manuscrito");
  const areaLabel = isOfficialEditorialEntry
    ? OFFICIAL_EDITORIAL_ENTRY.areaLabel
    : "Pós-graduação e pesquisa";
  const stageLabel = article?.status
    ? formatStageLabel(article.status)
    : isOfficialEditorialEntry
      ? OFFICIAL_EDITORIAL_ENTRY.stageLabel
      : "Em revisão editorial";
  const lastSyncAt =
    article?.google_last_synced_at ??
    article?.updated_at ??
    (isOfficialEditorialEntry ? OFFICIAL_EDITORIAL_ENTRY.lastSyncAt : undefined);

  return (
    <SidebarLayout>
      <ArticleIntelligencePage
        title={title}
        areaLabel={areaLabel}
        stageLabel={stageLabel}
        manuscriptText={hasUsableText ? manuscriptText : OFFICIAL_EDITORIAL_MANUSCRIPT}
        googleDocsUrl={article?.google_doc_url ?? undefined}
        lastSyncAt={lastSyncAt}
      />
    </SidebarLayout>
  );
}
