import { expect, test, type Page } from "@playwright/test";

async function openOrCreateEditorWorkspace(page: Page) {
  await page.goto("/editor");
  await expect(page.getByRole("heading", { name: /Artigos em andamento/i })).toBeVisible();

  const loadingState = page.getByText(/Carregando manuscritos/i);
  if (await loadingState.isVisible().catch(() => false)) {
    await expect(loadingState).toBeHidden({ timeout: 20000 });
  }

  const existingArticles = page.locator(".editor-central-article");

  await expect
    .poll(async () => await existingArticles.count(), {
      timeout: 10000,
      message: "A Central Editorial nao estabilizou a lista de manuscritos a tempo."
    })
    .toBeGreaterThanOrEqual(0);

  if ((await existingArticles.count()) > 0) {
    await existingArticles.first().click();
    await expect(page.getByRole("button", { name: /Continuar manuscrito/i })).toBeEnabled();
    await page.getByRole("button", { name: /Continuar manuscrito/i }).click();
  } else {
    await page.getByPlaceholder(/Titulo do novo manuscrito|Título do novo manuscrito/i).fill(
      `Teste E2E ${Date.now()}`
    );
    await page.getByRole("button", { name: /Novo artigo/i }).click();
  }

  await expect(page).toHaveURL(/\/editor\/[^/]+$/i, { timeout: 20000 });
  await expect(page.locator(".editor-premium-title-input")).toBeVisible({ timeout: 20000 });
  await expect(page.getByText(/Estrutura do manuscrito/i)).toBeVisible();
}

test.describe("Editor workspace autenticado", () => {
  test.beforeEach(async ({ page }) => {
    await openOrCreateEditorWorkspace(page);
  });

  test("abre o editor com as 3 colunas essenciais", async ({ page }) => {
    await expect(page.locator(".editor-premium-title-input")).toBeVisible();
    await expect(page.getByText(/Estrutura do manuscrito/i)).toBeVisible();
    await expect(
      page.locator(".editor-premium-inspector-tabs").getByRole("button", { name: /Analise editorial|Análise editorial/i })
    ).toBeVisible();
  });

  test("leva historico e versoes para a area de notas", async ({ page }) => {
    await page.getByRole("button", { name: /Historico|Histórico/i }).click();
    await expect(page.getByText(/Comentarios editoriais|Comentários editoriais/i)).toBeVisible();

    await page.getByRole("button", { name: /Versoes|Versões/i }).click();
    await expect(page.getByText(/Versoes salvas|Versões salvas/i)).toBeVisible();
  });

  test("abre a area de recomendacoes editoriais", async ({ page }) => {
    await page.getByRole("button", { name: /Ver recomendacoes|Ver recomendações/i }).click();
    await expect(page.getByText(/Verificacoes|Verificações/i)).toBeVisible();
    await expect(page.getByText(/Proximos passos|Próximos passos/i)).toBeVisible();
  });

  test("expande o estudio de estrutura pelos dois gatilhos principais", async ({ page }) => {
    await page.getByRole("button", { name: /\+ Adicionar secao|\+ Adicionar seção/i }).click();
    await expect(page.getByText(/Estrutura editorial/i)).toBeVisible();
    await page.getByRole("button", { name: /Fechar/i }).click();

    await page.getByRole("button", { name: /Expandir estrutura/i }).click();
    await expect(page.getByText(/Estrutura editorial/i)).toBeVisible();
  });

  test("ativa o modo ABNT na barra utilitaria", async ({ page }) => {
    await page.getByRole("button", { name: /^Modo ABNT$/i }).click();
    await expect(page.getByRole("button", { name: /Modo ABNT ativo/i })).toBeVisible();
  });

  test("abre a area de referencias pelo botao contextual", async ({ page }) => {
    await page
      .locator(".editor-premium-inspector-tabs")
      .getByRole("button", { name: /Referencias|Referências/i })
      .click();
    await expect(page.getByText(/Lacunas de citacao|Lacunas de citação/i)).toBeVisible();
  });
  test("leva o botao de sugerir referencias para o painel certo mesmo sem lacuna ativa", async ({ page }) => {
    await page.getByRole("button", { name: /Sugerir refer/i }).click();
    await expect(page.locator(".editor-premium-inspector-card")).toHaveAttribute("data-inspector-tab", "references");
  });

  test("mantem o usuario no editor ao abrir a justificativa do periodico", async ({ page }) => {
    await page.getByRole("button", { name: /Ver justificativa/i }).click();
    await expect(page).toHaveURL(/\/editor\/[^/]+$/i);
    await expect(page).not.toHaveURL(/\/dashboard\/periodicos/i);
  });
});
