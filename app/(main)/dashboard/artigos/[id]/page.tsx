import { redirect } from "next/navigation";

import { getArticleEditorHref, isLegacyEditorialId } from "@/lib/article-intelligence";

type LegacyArticlePanelRouteProps = {
  params: Promise<{
    id: string;
  }>;
};

export default async function LegacyArticlePanelRoute({ params }: LegacyArticlePanelRouteProps) {
  const { id } = await params;
  redirect(getArticleEditorHref(isLegacyEditorialId(id) ? null : id));
}
