import { randomUUID } from "node:crypto";
import AxeBuilder from "@axe-core/playwright";
import { test, expect } from "./fixtures";
import { testDatabase } from "../support/database";
async function account(page: import("@playwright/test").Page) {
  const existing = await page.request.get("/api/workspaces");
  expect(existing.ok()).toBe(true);
  let scope = (await existing.json())[0];
  if (!scope) {
    const workspace = await page.request.post("/api/workspaces", {
      headers: { origin: "http://127.0.0.1:3100" },
      data: { name: "S08 " + randomUUID() },
    });
    expect([201, 409]).toContain(workspace.status());
    scope =
      workspace.status() === 201
        ? await workspace.json()
        : (await (await page.request.get("/api/workspaces")).json())[0];
  }
  const response = await page.request.post(
    "/api/accounts?workspace=" + scope.id,
    {
      headers: {
        origin: "http://127.0.0.1:3100",
        "idempotency-key": randomUUID(),
      },
      data: {
        kind: "CREATE_ACCOUNT",
        name: "SBI Savings",
        accountKind: "BANK",
        opening: "50000",
        effectiveAt: "2026-01-01T00:00:00+05:30",
      },
    },
  );
  expect(response.status()).toBe(201);
  return response.json();
}
test("S08-A ₹850 Groceries expense and income persist in real history and account balances", async ({
  page,
}, info) => {
  const bank = await account(page);
  await page.goto("/transactions");
  await page.getByLabel("Paid from account").selectOption(bank.accountId);
  await expect(page.getByTestId("selected-account-balance")).toHaveText(
    "₹50,000.00",
  );
  await page.getByLabel("Amount (INR)").fill("850");
  await page.getByLabel("Transaction date (India)").fill("2026-01-15");
  await page
    .getByRole("combobox", { name: /^Category/ })
    .selectOption("Groceries");
  await page.getByLabel("Description (optional)").fill("Weekly groceries");
  const posted = page.waitForResponse(
    (r) =>
      r.url().includes("/api/transactions?") && r.request().method() === "POST",
  );
  await page.getByRole("button", { name: "Save expense", exact: true }).click();
  const response = await posted;
  expect(response.status()).toBe(201);
  const saved = await response.json();
  const row = page.locator(
    '[data-operation-id="' + saved.post.operationId + '"]',
  );
  await expect(row).toContainText("Groceries · Expense");
  await expect(row).toContainText("₹850.00");
  await expect(page.getByTestId("selected-account-balance")).toHaveText(
    "₹49,150.00",
  );
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({
    path: info.outputPath("01-expense.png"),
    fullPage: true,
  });
  await page.reload();
  await page.getByLabel("Paid from account").selectOption(bank.accountId);
  await expect(row).toContainText("Weekly groceries");
  await expect(page.getByTestId("selected-account-balance")).toHaveText(
    "₹49,150.00",
  );
  await page.getByLabel("Transaction type").selectOption("INCOME");
  await page.getByLabel("Receive into account").selectOption(bank.accountId);
  await page.getByLabel("Amount (INR)").fill("1500");
  await page
    .getByRole("combobox", { name: /^Category/ })
    .selectOption("Salary");
  await page.getByLabel("Description (optional)").fill("Salary payment");
  await page.getByRole("button", { name: "Save income", exact: true }).click();
  await expect(page.getByTestId("selected-account-balance")).toHaveText(
    "₹50,650.00",
  );
  await expect(
    page
      .getByTestId("transaction-row")
      .filter({ hasText: "Salary payment" })
      .first(),
  ).toContainText("Salary · Income");
  expect(
    (await new AxeBuilder({ page }).include("main").analyze()).violations,
  ).toEqual([]);
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({
    path: info.outputPath("02-income.png"),
    fullPage: true,
  });
  await page
    .getByRole("link", { name: "Account details", exact: true })
    .click();
  await expect(page.getByTestId("account-balance")).toHaveText("₹50,650.00");
});
test("S08-A lost expense response recovers one immutable capture after changed-input rejection", async ({
  page,
}) => {
  const bank = await account(page);
  let forwarded = 0;
  let operation = "";
  await page.route("**/api/transactions?workspace=*", async (route) => {
    if (forwarded === 0) {
      forwarded++;
      const r = await route.fetch();
      expect(r.status()).toBe(201);
      operation = (await r.json()).post.operationId;
      await route.abort("failed");
    } else await route.continue();
  });
  await page.goto("/transactions");
  await page.getByLabel("Paid from account").selectOption(bank.accountId);
  await page.getByLabel("Amount (INR)").fill("25");
  await page.getByLabel("Transaction date (India)").fill("2026-01-15");
  await page.getByRole("button", { name: "Save expense", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Recover pending transaction" }),
  ).toBeVisible();
  await page.getByLabel("Amount (INR)").fill("999");
  await page.getByRole("button", { name: "Save expense", exact: true }).click();
  await expect(
    page.getByRole("alert").filter({
      hasText: "Recover the pending transaction before changing its details.",
    }),
  ).toBeVisible();
  expect(forwarded).toBe(1);
  await page
    .getByRole("button", { name: "Recover pending transaction" })
    .click();
  await expect(page.getByTestId("selected-account-balance")).toHaveText(
    "₹49,975.00",
  );
  await expect(
    page.locator('[data-operation-id="' + operation + '"]'),
  ).toContainText("₹25.00");
  const db = testDatabase();
  try {
    expect(
      await db.transactionRecord.count({ where: { operationId: operation } }),
    ).toBe(1);
    expect(
      await db.auditEvent.count({ where: { operationId: operation } }),
    ).toBe(1);
  } finally {
    await db.$disconnect();
  }
});
