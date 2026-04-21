import { redirect } from "next/navigation";

import { getArticleEditorHref, isLegacyEditorialId } from "@/lib/article-intelligence";

type LegacyEditorialRouteProps = {
  params: Promise<{
    id: string;
  }>;
};

export default async function LegacyEditorialRoute({ params }: LegacyEditorialRouteProps) {
  const { id } = await params;
  redirect(getArticleEditorHref(isLegacyEditorialId(id) ? null : id));
}
