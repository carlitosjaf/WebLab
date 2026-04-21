import type { Route } from "next";

export const LEGACY_EDITORIAL_ROUTE = "demo-editorial";
export const CENTRAL_EDITORIAL_HREF = "/editor" as Route;

export function isLegacyEditorialId(value: string | null | undefined) {
  return value === LEGACY_EDITORIAL_ROUTE;
}

export function getCentralEditorialHref() {
  return CENTRAL_EDITORIAL_HREF;
}

export function getArticleEditorHref(articleId?: string | null) {
  if (!articleId || isLegacyEditorialId(articleId)) {
    return getCentralEditorialHref();
  }

  return `/editor/${articleId}` as Route;
}
