import { expect, test } from "@playwright/test";

test.describe("Fluxo público de rotas editoriais", () => {
  test("a rota editorial legada exige autenticação antes de chegar à Central Editorial", async ({ page }) => {
    await page.goto("/artigos/demo-editorial");

    await expect(page).toHaveURL(/\/$/);
    await expect(page.getByRole("heading", { name: "Entrar no laboratório" })).toBeVisible();
  });

  test("a rota /editor/demo-editorial cai na Central Editorial e não em um writer órfão", async ({ page }) => {
    await page.goto("/editor/demo-editorial");

    await expect(page).toHaveURL(/\/editor$/);
    await expect(page.getByRole("heading", { name: "Uma unica experiencia para escrever, revisar e preparar submissao." })).toBeVisible();
  });
});
