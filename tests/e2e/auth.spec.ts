import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { test as ownerTest } from "./fixtures";
import { testDatabase } from "../support/database";

test("P1-S03 anonymous pages/API deny access and prevent auth bypasses", async ({
  page,
}) => {
  for (const route of ["/home", "/settings/appearance", "/design-system"]) {
    await page.goto(route);
    await expect(page).toHaveURL(/\/login$/);
    await expect(
      page.getByRole("heading", { name: "A clearer view starts here." }),
    ).toBeVisible();
    await expect(
      page.getByRole("navigation", { name: "Main navigation" }),
    ).toHaveCount(0);
  }
  const session = await page.request.get("/api/session");
  expect(session.status()).toBe(401);
  expect(await session.json()).toEqual({ error: "unauthorized" });
  expect(session.headers()["cache-control"]).toContain("no-store");
  for (const path of [
    "/api/auth/sign-up/email",
    "/api/auth/update-user",
    "/api/auth/get-session",
    "/api/auth/get-access-token",
  ])
    expect(
      (
        await page.request.post(path, {
          headers: { origin: "http://127.0.0.1:3100" },
          data: {},
        })
      ).status(),
    ).toBe(404);
  expect((await page.request.post("/api/session", { data: {} })).status()).toBe(
    405,
  );
  for (const origin of ["https://evil.example", "http://localhost:3100"])
    expect(
      (
        await page.request.post("/api/auth/sign-out", {
          headers: { origin },
          data: {},
        })
      ).status(),
    ).toBe(403);
});
test("P1-S03 sign-in initiation uses Google, state and canonical callback", async ({
  page,
}) => {
  await page.goto("/login");
  const response = await page.request.post("/api/auth/sign-in/social", {
    headers: { origin: "http://127.0.0.1:3100" },
    data: { provider: "google", callbackURL: "/home" },
  });
  expect(response.status()).toBe(200);
  const url = new URL((await response.json()).url);
  expect(url.origin).toBe("https://accounts.google.com");
  expect(url.searchParams.get("redirect_uri")).toBe(
    "http://127.0.0.1:3100/api/auth/callback/google",
  );
  expect(url.searchParams.get("state")).toBeTruthy();
  expect(url.searchParams.get("code_challenge_method")).toBe("S256");
});
test("P1-S03 sign-in initiation uses GitHub via adapter, state and canonical callback", async ({
  page,
}) => {
  await page.goto("/login");
  const response = await page.request.post("/api/auth/sign-in/social", {
    headers: { origin: "http://127.0.0.1:3100" },
    data: { provider: "github", callbackURL: "/home" },
  });
  expect(response.status()).toBe(200);
  const url = new URL((await response.json()).url);
  expect(url.origin).toBe("https://github.com");
  expect(url.searchParams.get("redirect_uri")).toBe(
    "http://127.0.0.1:3100/api/auth/callback/github",
  );
  expect(url.searchParams.get("state")).toBeTruthy();
});
test("P1-S03 provider initiation error is recoverable without exposing details", async ({
  page,
}) => {
  await page.goto("/login");
  await page.route("**/api/auth/sign-in/social", (route) =>
    route.fulfill({
      status: 503,
      contentType: "application/json",
      body: '{"error":"authentication_unavailable"}',
    }),
  );
  await page.getByRole("button", { name: "Continue with Google" }).click();
  await expect(page.getByRole("main").getByRole("alert")).toHaveText(
    "Sign-in couldn’t start. Please try again.",
  );
  await expect(
    page.getByRole("button", { name: "Continue with Google" }),
  ).toBeEnabled();
});
for (const theme of ["light", "dark"] as const)
  test(`P1-S03 ${theme} login accessibility and sanitized callback error`, async ({
    page,
  }, testInfo) => {
    await page.emulateMedia({ colorScheme: theme });
    await page.goto(
      "/login?error=secret-provider-error-that-must-not-be-rendered",
    );
    await expect(page.getByRole("main").getByRole("alert")).toContainText(
      "Sign-in wasn’t completed",
    );
    await expect(page.getByRole("main")).not.toContainText(
      "secret-provider-error",
    );
    expect(
      (
        await new AxeBuilder({ page })
          .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
          .analyze()
      ).violations,
    ).toEqual([]);
    await page.screenshot({
      path: testInfo.outputPath(`login-${theme}.png`),
      fullPage: true,
      animations: "disabled",
    });
  });
ownerTest(
  "P1-S03 real server session, logout and browser-back denial",
  async ({ page, isMobile, ownerSession }) => {
    await page.goto("/home");
    await expect(
      page.getByRole("heading", { name: "Your money. A little clearer." }),
    ).toBeVisible();
    const response = await page.request.get("/api/session");
    const dto = await response.json();
    expect(response.status()).toBe(200);
    expect(dto.user.id).toBe(ownerSession.userId);
    expect(dto).not.toHaveProperty("token");
    expect(JSON.stringify(dto)).not.toContain("session_token");
    expect(
      (
        await page.request.post("/api/auth/sign-out", {
          headers: { origin: "https://evil.example" },
          data: {},
        })
      ).status(),
    ).toBe(403);
    expect((await page.request.get("/api/session")).status()).toBe(200);
    if (isMobile)
      await page.getByRole("button", { name: "Open navigation" }).click();
    await page
      .getByRole("button", { name: "Sign out", exact: true })
      .filter({ visible: true })
      .click();
    await expect(page).toHaveURL(/\/login$/);
    expect((await page.request.get("/api/session")).status()).toBe(401);
    await page.goBack();
    await expect(page).toHaveURL(/\/login$/);
    await expect(
      page.getByRole("navigation", { name: "Main navigation" }),
    ).toHaveCount(0);
    await page.goto("/home");
    await expect(page).toHaveURL(/\/login$/);
  },
);
ownerTest(
  "P1-S03 expired sessions deny private requests",
  async ({ page, ownerSession }) => {
    const database = testDatabase();
    try {
      await page.goto("/home");
      await expect(
        page.getByRole("heading", { name: "Your money. A little clearer." }),
      ).toBeVisible();
      await database.authSession.update({
        where: { id: ownerSession.id },
        data: { expiresAt: new Date(Date.now() - 1000) },
      });
      expect((await page.request.get("/api/session")).status()).toBe(401);
      await page.reload();
      await expect(page).toHaveURL(/\/login$/);
    } finally {
      await database.$disconnect();
    }
  },
);

ownerTest(
  "P1-S03 externally revoked sessions fail without cookie-cache grace",
  async ({ page, ownerSession }) => {
    const database = testDatabase();
    try {
      await page.goto("/home");
      await expect(
        page.getByRole("heading", { name: "Your money. A little clearer." }),
      ).toBeVisible();
      await database.authSession.delete({ where: { id: ownerSession.id } });
      expect((await page.request.get("/api/session")).status()).toBe(401);
      await page.reload();
      await expect(page).toHaveURL(/\/login$/);
    } finally {
      await database.$disconnect();
    }
  },
);
