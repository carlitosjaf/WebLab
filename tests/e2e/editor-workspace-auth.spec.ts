import { expect, test } from "@playwright/test";

const editorWorkspaceUrl = process.env.PLAYWRIGHT_EDITOR_WORKSPACE_URL;

test.describe("Editor workspace autenticado", () => {
  test.skip(
    !editorWorkspaceUrl,
    "Defina PLAYWRIGHT_EDITOR_WORKSPACE_URL com uma rota autenticada do editor para validar os controles internos."
  );

  test.beforeEach(async ({ page }) => {
    await page.goto(editorWorkspaceUrl!);
    await expect(page.getByText("Estrutura do manuscrito")).toBeVisible();
  });

  test("abre o editor com as 3 colunas essenciais", async ({ page }) => {
    await expect(page.getByPlaceholder("Título do manuscrito")).toBeVisible();
    await expect(page.getByText("Estrutura do manuscrito")).toBeVisible();
    await expect(page.getByRole("button", { name: "Análise editorial" })).toBeVisible();
  });

  test("leva histórico e versões para a área de notas", async ({ page }) => {
    await page.getByRole("button", { name: "Histórico" }).click();
    await expect(page.getByText("Comentários editoriais")).toBeVisible();

    await page.getByRole("button", { name: "Versões" }).click();
    await expect(page.getByText("Versões salvas")).toBeVisible();
  });

  test("abre a área de recomendações editoriais", async ({ page }) => {
    await page.getByRole("button", { name: "Ver recomendações" }).click();
    await expect(page.getByText("Verificações")).toBeVisible();
    await expect(page.getByText("Próximos passos")).toBeVisible();
  });

  test("expande o estúdio de estrutura pelos dois gatilhos principais", async ({ page }) => {
    await page.getByRole("button", { name: "+ Adicionar seção" }).click();
    await expect(page.getByText("Estrutura editorial")).toBeVisible();
    await page.getByRole("button", { name: "Fechar" }).click();

    await page.getByRole("button", { name: "Expandir estrutura" }).click();
    await expect(page.getByText("Estrutura editorial")).toBeVisible();
  });

  test("ativa o modo ABNT na barra utilitária", async ({ page }) => {
    await page.getByRole("button", { name: "Modo ABNT" }).click();
    await expect(page.getByRole("button", { name: "Modo ABNT ativo" })).toBeVisible();
  });

  test("abre a área de referências pelo botão contextual", async ({ page }) => {
    await page.locator(".editor-premium-inspector-tabs").getByRole("button", { name: "Referências" }).click();
    await expect(page.getByText("Lacunas de citação")).toBeVisible();
  });
});
