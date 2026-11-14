import AxeBuilder from "@axe-core/playwright";
import { createHmac, randomBytes, randomUUID } from "node:crypto";
import { test, expect } from "./fixtures";
import { testDatabase } from "../support/database";
import { ensureE2EOwner } from "../support/e2e-owner";
test("S07 actual accounts walkthrough, persistence, history, reconciliation and isolation", async ({
  page,
  browser,
}, testInfo) => {
  await page.goto("/accounts");
  await expect(
    page.getByRole("heading", { name: "Accounts", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Add Account", exact: true }).click();
  await page.getByLabel("Account name", { exact: true }).fill("SBI Savings");
  await page.getByLabel("Opening amount (INR)").fill("50000");
  await page.getByLabel("Opening date").fill("2026-01-01");
  await page
    .getByRole("button", { name: "Review account", exact: true })
    .click();
  await expect(
    page.getByRole("status").filter({ hasText: "SBI Savings" }),
  ).toContainText("₹50,000.00");
  await page.getByRole("button", { name: "Confirm and save" }).click();
  await expect(page).toHaveURL(/\/accounts\/[a-f0-9-]+$/);
  const id = page.url().split("/").pop()!;
  await expect(page.getByTestId("account-balance")).toHaveText("₹50,000.00");
  await page.reload();
  await expect(page.getByTestId("account-balance")).toHaveText("₹50,000.00");
  await expect(
    page.getByText("Opening balance · SBI Savings", { exact: true }),
  ).toBeVisible();
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({
    path: testInfo.outputPath("01-opening.png"),
    fullPage: true,
  });
  await page.getByLabel("New account name").fill("SBI Everyday");
  await page
    .getByRole("button", { name: "Rename account", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "SBI Everyday", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("Opening balance · SBI Savings", { exact: true }),
  ).toBeVisible();
  await page.getByLabel("Balance as of (India date)").fill("2026-01-31");
  await expect(page.getByTestId("account-balance")).toHaveText("₹50,000.00");
  await page.getByLabel("Statement balance (INR)").fill("49500");
  await page.getByRole("button", { name: "Record reconciliation" }).click();
  await expect(page.getByTestId("discrepancy").first()).toHaveText(
    "Difference ₹500.00",
  );
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({
    path: testInfo.outputPath("02-reconciliation.png"),
    fullPage: true,
  });
  expect(
    (await new AxeBuilder({ page }).include("main").analyze()).violations,
  ).toEqual([]);
  await page
    .getByRole("button", { name: "Archive account", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Restore account", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Restore account", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Archive account", exact: true }),
  ).toBeVisible();
  await page.getByRole("link", { name: "All accounts", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Accounts", exact: true }),
  ).toBeVisible();
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({
    path: testInfo.outputPath("03-overview.png"),
    fullPage: true,
  });
  const db = testDatabase(),
    other = await browser.newContext({ baseURL: "http://127.0.0.1:3100" });
  let sessionId: string | undefined;
  try {
    const user = await ensureE2EOwner(db, "e2e-other@ledgerone.test");
    const token = randomBytes(32).toString("hex");
    sessionId = randomUUID();
    await db.authSession.create({
      data: {
        id: sessionId,
        userId: user.id,
        token,
        expiresAt: new Date(Date.now() + 3600000),
      },
    });
    const signature = createHmac("sha256", process.env.LEDGERONE_E2E_SECRET!)
      .update(token)
      .digest("base64");
    await other.addCookies([
      {
        name: "ledgerone.session_token",
        value: encodeURIComponent(token + "." + signature),
        url: "http://127.0.0.1:3100",
        httpOnly: true,
        sameSite: "Lax",
      },
    ]);
    const account = await db.account.findUniqueOrThrow({ where: { id } });
    const before = await db.accountEvent.count({ where: { accountId: id } });
    for (const data of [
      {
        kind: "RENAME_ACCOUNT",
        accountId: id,
        name: "Forged",
        ownerId: account.ownerId,
      },
      { kind: "POST", legs: [] },
    ]) {
      const rejected = await page.request.post(
        "/api/accounts?workspace=" + account.workspaceId,
        {
          headers: {
            origin: "http://127.0.0.1:3100",
            "idempotency-key": randomUUID(),
          },
          data,
        },
      );
      expect(rejected.status()).toBe(400);
    }
    const anonymous = await browser.newContext({
      baseURL: "http://127.0.0.1:3100",
    });
    try {
      expect((await anonymous.request.get("/api/accounts")).status()).toBe(401);
    } finally {
      await anonymous.close();
    }

    const attack = await other.request.post(
      "/api/accounts?workspace=" + account.workspaceId,
      {
        headers: {
          origin: "http://127.0.0.1:3100",
          "idempotency-key": randomUUID(),
        },
        data: { kind: "RENAME_ACCOUNT", accountId: id, name: "Stolen" },
      },
    );
    expect(attack.status()).toBe(404);
    expect(await db.accountEvent.count({ where: { accountId: id } })).toBe(
      before,
    );
    const otherPage = await other.newPage();
    await otherPage.goto("/accounts/" + id);
    await expect(
      otherPage.getByRole("heading", { name: "Account unavailable" }),
    ).toBeVisible();
    expect((await db.account.findUniqueOrThrow({ where: { id } })).name).toBe(
      "SBI Everyday",
    );
  } finally {
    await other.close();
    if (sessionId)
      await db.authSession.deleteMany({ where: { id: sessionId } });
    await db.$disconnect();
  }
});

test("S07 lost creation response recovers the same key and blocks changed-input duplicate creation", async ({
  page,
}) => {
  const name = "Recovery " + randomUUID();
  let forwarded = 0;
  await page.route("**/api/accounts?workspace=*", async (route) => {
    const body = route.request().postDataJSON();
    if (
      body.kind === "CREATE_ACCOUNT" &&
      body.name === name &&
      forwarded === 0
    ) {
      forwarded++;
      const response = await route.fetch();
      expect(response.status()).toBe(201);
      await route.abort("failed");
    } else await route.continue();
  });
  await page.goto("/accounts");
  await page.getByRole("button", { name: "Add Account", exact: true }).click();
  await page.getByLabel("Account name", { exact: true }).fill(name);
  await page.getByLabel("Opening amount (INR)").fill("123.45");
  await page.getByLabel("Opening date").fill("2026-01-01");
  await page
    .getByRole("button", { name: "Review account", exact: true })
    .click();
  await page.getByRole("button", { name: "Confirm and save" }).click();
  await expect(
    page.getByRole("button", { name: "Recover pending result" }),
  ).toBeVisible();
  await page.getByLabel("Opening amount (INR)").fill("999");
  await page
    .getByRole("button", { name: "Review account", exact: true })
    .click();
  await page.getByRole("button", { name: "Confirm and save" }).click();
  await expect(
    page
      .getByRole("alert")
      .filter({
        hasText: "Recover the pending result before changing these details.",
      }),
  ).toBeVisible();
  expect(forwarded).toBe(1);
  await page.getByRole("button", { name: "Recover pending result" }).click();
  await expect(page).toHaveURL(/\/accounts\/[a-f0-9-]+$/);
  await expect(page.getByTestId("account-balance")).toHaveText("₹123.45");
  const database = testDatabase();
  try {
    const rows = await database.account.findMany({ where: { name } });
    expect(rows).toHaveLength(1);
    expect(
      await database.openingBalance.count({
        where: { accountId: rows[0]!.id },
      }),
    ).toBe(1);
  } finally {
    await database.$disconnect();
  }
});
