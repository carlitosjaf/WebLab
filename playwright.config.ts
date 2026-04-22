import { defineConfig, devices } from "@playwright/test";

const port = Number(process.env.PORT ?? "3000");
const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? `http://127.0.0.1:${port}`;
const authFile = "tests/e2e/.auth/user.json";
const hasAuthCredentials = Boolean(
  process.env.PLAYWRIGHT_TEST_EMAIL && process.env.PLAYWRIGHT_TEST_PASSWORD
);

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: [["list"], ["html", { open: "never" }]],
  use: {
    baseURL,
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    video: "retain-on-failure"
  },
  webServer: {
    command: `npm run dev -- --hostname 127.0.0.1 --port ${port}`,
    url: baseURL,
    reuseExistingServer: true,
    timeout: 120000
  },
  projects: [
    ...(hasAuthCredentials
      ? [
          {
            name: "setup",
            testMatch: /auth\.setup\.ts/
          }
        ]
      : []),
    {
      name: "chromium",
      testIgnore: /auth\.setup\.ts/,
      ...(hasAuthCredentials ? { dependencies: ["setup"] } : {}),
      use: {
        ...devices["Desktop Chrome"],
        ...(hasAuthCredentials ? { storageState: authFile } : {})
      }
    }
  ]
});
