import { randomBytes } from "node:crypto";
import { testDatabaseURL } from "./tests/support/database";
import { defineConfig, devices } from "@playwright/test";
const secret =
  process.env.LEDGERONE_E2E_SECRET ?? randomBytes(48).toString("base64");
process.env.LEDGERONE_E2E_SECRET = secret;
export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: true,
  workers: 2,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: [["list"], ["html", { open: "never" }]],
  use: {
    baseURL: "http://127.0.0.1:3100",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [
    {
      name: "desktop-chromium",
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 1440, height: 1000 },
      },
    },
    {
      name: "mobile-chromium",
      use: { ...devices["Pixel 7"], defaultBrowserType: "chromium" },
    },
  ],
  webServer: {
    command: "node_modules/.bin/tsx scripts/account-app-server.ts",
    url: "http://127.0.0.1:3100",
    reuseExistingServer: false,
    timeout: 60000,
    env: {
      LEDGERONE_ENV: "test",
      DATABASE_URL: testDatabaseURL(),
      DIRECT_DATABASE_URL: testDatabaseURL(),
      BETTER_AUTH_URL: "http://127.0.0.1:3100",
      BETTER_AUTH_SECRET: secret,
      GOOGLE_CLIENT_ID: "e2e-google-placeholder",
      GOOGLE_CLIENT_SECRET: "e2e-google-placeholder",
      GITHUB_CLIENT_ID: "e2e-github-placeholder",
      GITHUB_CLIENT_SECRET: "e2e-github-placeholder",
      AUTH_ALLOWED_EMAILS: "e2e-owner@ledgerone.test,e2e-other@ledgerone.test",
      NEXT_TELEMETRY_DISABLED: "1",
    },
  },
});
