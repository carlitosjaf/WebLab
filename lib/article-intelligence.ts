import type { Route } from "next";

export const OFFICIAL_EDITORIAL_ROUTE = "demo-editorial";
export const OFFICIAL_EDITORIAL_HREF = `/artigos/${OFFICIAL_EDITORIAL_ROUTE}` as Route;

export const OFFICIAL_EDITORIAL_ENTRY = {
  title:
    "Para além da pandemia: desigualdades estruturais, cuidado e sofrimento psíquico na experiência de mulheres na pós-graduação brasileira",
  areaLabel: "Saúde coletiva, formação e vida acadêmica",
  stageLabel: "Leitura editorial em andamento",
  lastSyncAt: "21 de abr. de 2026, 16:40"
} as const;

export const OFFICIAL_EDITORIAL_MANUSCRIPT = `Resumo: Este manuscrito analisa a experiência de mulheres na pós-graduação brasileira durante e após a pandemia, com foco na articulação entre desigualdade estrutural, trabalho acadêmico e sofrimento psíquico. O estudo busca compreender de que modo a intensificação das exigências institucionais alterou a percepção de permanência, desempenho e reconhecimento no percurso formativo. Metodologicamente, o trabalho combina leitura analítica de literatura recente, observação situada do contexto universitário e discussão conceitual sobre cuidado, precarização e institucionalidade. Os achados sugerem que a sobrecarga não se distribui de forma homogênea e que a gestão ordinária da vida acadêmica permanece atravessada por assimetrias de gênero, classe e suporte institucional. Conclui-se que a permanência qualificada na pós-graduação depende menos de adaptação individual e mais de revisão das condições institucionais de produção da pesquisa.

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
export function isOfficialEditorialId(value: string | null | undefined) {
  return value === OFFICIAL_EDITORIAL_ROUTE;
}

export function getOfficialEditorialHref() {
  return OFFICIAL_EDITORIAL_HREF;
}

export function getClassicEditorHref(articleId: string) {
  return `/editor/${articleId}` as Route;
}

export function getManuscriptPanelHref(articleId: string) {
  return `/dashboard/artigos/${articleId}` as Route;
}
