import { redirect } from "next/navigation";

import { getCentralEditorialHref } from "@/lib/article-intelligence";

export default function LegacyArticlesRoute() {
  redirect(getCentralEditorialHref());
}
