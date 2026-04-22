import { test as setup, expect } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";

const authFile = path.join(process.cwd(), "tests", "e2e", ".auth", "user.json");
const email = process.env.PLAYWRIGHT_TEST_EMAIL;
const password = process.env.PLAYWRIGHT_TEST_PASSWORD;
const nextPath = process.env.PLAYWRIGHT_AUTH_NEXT_PATH ?? "/dashboard";

setup("autentica um usuario de teste e salva a sessao", async ({ page }) => {
  setup.skip(
    !email || !password,
    "Credenciais PLAYWRIGHT_TEST_EMAIL e PLAYWRIGHT_TEST_PASSWORD nao definidas."
  );

  fs.mkdirSync(path.dirname(authFile), { recursive: true });

  await page.goto(`/?next=${encodeURIComponent(nextPath)}`);

  await expect(page.getByRole("heading", { name: "Entrar no laboratório" })).toBeVisible();
  await page.getByLabel("E-mail institucional").fill(email!);
  await page.getByLabel("Senha").fill(password!);
  await page.getByRole("button", { name: "Entrar no laboratório" }).click();

  await expect(page).toHaveURL(new RegExp(nextPath.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  await page.context().storageState({ path: authFile });
});
