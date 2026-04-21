import { ArticleIntelligencePage } from "@/components/articles/article-intelligence-page";
import { SidebarLayout } from "@/components/layout/sidebar-layout";
import { extractPlainText } from "@/lib/periodicos";
import { getSupabaseServerClient } from "@/lib/supabase/admin";
import type { ArticleRow } from "@/lib/types";
import { formatStatusLabel } from "@/lib/weblab";

type ArticleIntelligenceRouteProps = {
  params: Promise<{
    id: string;
  }>;
};

const FALLBACK_MANUSCRIPT = `Resumo: Este manuscrito analisa a experiência de mulheres na pós-graduação brasileira durante e após a pandemia, com foco na articulação entre desigualdade estrutural, trabalho acadêmico e sofrimento psíquico. O estudo busca compreender de que modo a intensificação das exigências institucionais alterou a percepção de permanência, desempenho e reconhecimento no percurso formativo. Metodologicamente, o trabalho combina leitura analítica de literatura recente, observação situada do contexto universitário e discussão conceitual sobre cuidado, precarização e institucionalidade. Os achados sugerem que a sobrecarga não se distribui de forma homogênea e que a gestão ordinária da vida acadêmica permanece atravessada por assimetrias de gênero, classe e suporte institucional. Conclui-se que a permanência qualificada na pós-graduação depende menos de adaptação individual e mais de revisão das condições institucionais de produção da pesquisa.

Introdução

Produzir e compartilhar conhecimento para o fortalecimento do SUS exige escrita clara, método consistente e diálogo com evidências. No entanto, a experiência de estudantes de pós-graduação nem sempre encontra lastro institucional suficiente para sustentar permanência, saúde mental e continuidade acadêmica.

Objetivo

Analisar de que maneira a pandemia de COVID-19 evidenciou e intensificou desigualdades estruturais na experiência de mulheres na pós-graduação brasileira.

Método

Trata-se de um estudo analítico de base qualitativa, orientado por revisão bibliográfica, discussão crítica da literatura e organização temática do problema investigado.

Resultados

Os resultados indicam que a sobrecarga de trabalho, a instabilidade cotidiana e a pressão por desempenho alteraram a experiência universitária de forma profunda. Em muitos casos, a produtividade caiu 37% sem que houvesse revisão correspondente das exigências acadêmicas, o que produziu novos mecanismos de exclusão.

Discussão

Os achados demonstram que o sofrimento psíquico não pode ser lido apenas como resposta individual a contextos difíceis. Ele emerge também da forma como as instituições distribuem cuidado, reconhecimento e expectativa de desempenho.

Conclusão

Conclui-se que o debate sobre permanência e excelência acadêmica precisa incorporar de modo mais consequente as condições materiais e subjetivas de realização da pesquisa.`;

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

  return (
    <SidebarLayout>
      <ArticleIntelligencePage
        title={article?.titulo ?? "Manuscrito em leitura editorial assistida"}
        areaLabel="Pós-graduação e pesquisa"
        stageLabel={formatStageLabel(article?.status)}
        manuscriptText={hasUsableText ? manuscriptText : FALLBACK_MANUSCRIPT}
        googleDocsUrl={article?.google_doc_url ?? undefined}
        lastSyncAt={article?.google_last_synced_at ?? article?.updated_at ?? undefined}
      />
    </SidebarLayout>
  );
}
