import { expect, test } from "@playwright/test";

const hasAuthCredentials = Boolean(
  process.env.PLAYWRIGHT_TEST_EMAIL && process.env.PLAYWRIGHT_TEST_PASSWORD
);

test.describe("Fluxo publico de rotas editoriais", () => {
  test("a rota editorial legada respeita o gate correto do produto", async ({ page }) => {
    await page.goto("/artigos/demo-editorial");

    if (hasAuthCredentials) {
      await expect(page).toHaveURL(/\/editor$/);
      await expect(
        page.getByRole("heading", {
          name: /Uma unica experiencia para escrever, revisar e preparar submissao/i,
        })
      ).toBeVisible();
      return;
    }

    await expect(page).toHaveURL(/\/$/);
    await expect(page.getByRole("heading", { name: /Entrar no laborat/i })).toBeVisible();
  });

  test("a rota /editor/demo-editorial retorna para a Central Editorial", async ({ page }) => {
    await page.goto("/editor/demo-editorial");

    await expect(page).toHaveURL(/\/editor\/demo-editorial$/);
    await expect(
      page.getByRole("heading", { name: /Uma unica experiencia para escrever, revisar e preparar submissao/i })
    ).toBeVisible();
  });
});
