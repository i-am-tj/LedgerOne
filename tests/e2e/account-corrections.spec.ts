import { randomUUID } from "node:crypto";
import AxeBuilder from "@axe-core/playwright";
import { test, expect } from "./fixtures";
async function setup(page: import("@playwright/test").Page) {
  let r = await page.request.get("/api/workspaces");
  expect(r.status()).toBe(200);
  let spaces = await r.json();
  if (!spaces.length) {
    r = await page.request.post("/api/workspaces", {
      headers: { origin: "http://127.0.0.1:3100" },
      data: { name: "Corrections" },
    });
    expect([201, 409]).toContain(r.status());
    spaces = await (await page.request.get("/api/workspaces")).json();
  }
  const workspace = spaces[0].id;
  r = await page.request.post("/api/accounts?workspace=" + workspace, {
    headers: {
      origin: "http://127.0.0.1:3100",
      "idempotency-key": randomUUID(),
    },
    data: {
      kind: "CREATE_ACCOUNT",
      name: "Correction bank " + randomUUID().slice(0, 6),
      accountKind: "BANK",
      opening: "50000",
      effectiveAt: "2026-01-01T00:00:00+05:30",
    },
  });
  expect(r.status()).toBe(201);
  return { workspace, id: (await r.json()).accountId };
}
test("S07 opening and archived expense corrections persist with original history on actual UI", async ({
  page,
}, info) => {
  const { workspace, id } = await setup(page);
  await page.goto("/accounts/" + id);
  await expect(page.getByTestId("account-balance")).toHaveText("₹50,000.00");
  await page.getByText("Correct historical entry", { exact: true }).click();
  await page.getByLabel("Corrected amount (INR)").fill("40000");
  await page
    .getByLabel("Correction reason", { exact: true })
    .fill("Fix initial statement");
  await page
    .getByRole("button", { name: "Review correction", exact: true })
    .click();
  await expect(
    page.getByRole("status").filter({ hasText: "Confirm ₹40,000.00" }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Confirm historical correction" })
    .click();
  await expect(page.getByTestId("account-balance")).toHaveText("₹40,000.00");
  await page.reload();
  await expect(page.getByTestId("account-balance")).toHaveText("₹40,000.00");
  await page.screenshot({
    path: info.outputPath("01-corrected-opening.png"),
    fullPage: true,
  });
  const expense = await page.request.post(
    "/api/transactions?workspace=" + workspace,
    {
      headers: {
        origin: "http://127.0.0.1:3100",
        "idempotency-key": randomUUID(),
      },
      data: {
        kind: "EXPENSE",
        accountId: id,
        amount: "850",
        category: "Groceries",
        effectiveAt: "2026-01-02T00:00:00+05:30",
      },
    },
  );
  expect(expense.status()).toBe(201);
  await page.reload();
  await page
    .getByRole("button", { name: "Archive account", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Restore account", exact: true }),
  ).toBeVisible();
  const original = (
    await (await page.request.get("/api/accounts")).json()
  ).accounts.find((a: { id: string }) => a.id === id);
  const archive = original.archivedAt;
  await page.getByText("Correct historical entry", { exact: true }).click();
  await page
    .getByRole("combobox", { name: "Correction type", exact: true })
    .selectOption("CORRECT_ACCOUNT_ENTRY");
  await page
    .getByRole("combobox", { name: "Original expense or income", exact: true })
    .selectOption(original.entryCorrections[0].originalJournalId);
  await page.getByLabel("Corrected amount (INR)").fill("700");
  await page
    .getByLabel("Correction reason", { exact: true })
    .fill("Correct original receipt");
  await page
    .getByRole("button", { name: "Review correction", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Confirm historical correction" })
    .click();
  await expect(page.getByTestId("account-balance")).toHaveText("₹39,300.00");
  await expect(
    page.getByRole("button", { name: "Restore account", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("combobox", { name: "Correction type", exact: true })
    .selectOption("CORRECT_OPENING");
  await page.getByLabel("Corrected amount (INR)").fill("45000");
  await page
    .getByLabel("Correction reason", { exact: true })
    .fill("Final statement opening");
  await page
    .getByRole("button", { name: "Review correction", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Confirm historical correction" })
    .click();
  await expect(page.getByTestId("account-balance")).toHaveText("₹44,300.00");
  await page.reload();
  await expect(page.getByTestId("account-balance")).toHaveText("₹44,300.00");
  const final = (
    await (await page.request.get("/api/accounts")).json()
  ).accounts.find((a: { id: string }) => a.id === id);
  expect(final.archivedAt).toBe(archive);
  expect(
    final.activity.some(
      (p: { journal: { kind: string } }) => p.journal.kind === "OPENING",
    ),
  ).toBe(true);
  await expect(
    page.getByRole("button", { name: "Restore account", exact: true }),
  ).toBeVisible();
  await page.getByText("Correct historical entry", { exact: true }).click();
  await page.screenshot({
    path: info.outputPath("02-archived-corrections.png"),
    fullPage: true,
  });
  expect(
    (await new AxeBuilder({ page }).include("main").analyze()).violations,
  ).toEqual([]);
  if (info.project.name === "mobile-chromium")
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
});
test("S07 correction lost response recovers the immutable same-key result", async ({
  page,
}) => {
  const { id } = await setup(page);
  let forwarded = 0;
  await page.route("**/api/accounts?workspace=*", async (route) => {
    if (
      route.request().postDataJSON().kind === "CORRECT_OPENING" &&
      forwarded === 0
    ) {
      forwarded++;
      const r = await route.fetch();
      expect(r.status()).toBe(201);
      await route.abort("failed");
    } else await route.continue();
  });
  await page.goto("/accounts/" + id);
  await page.getByText("Correct historical entry", { exact: true }).click();
  await page.getByLabel("Corrected amount (INR)").fill("40000");
  await page
    .getByLabel("Correction reason", { exact: true })
    .fill("Recover corrected opening");
  await page
    .getByRole("button", { name: "Review correction", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Confirm historical correction" })
    .click();
  await expect(
    page.getByRole("button", { name: "Recover pending result" }),
  ).toBeVisible();
  await page.getByLabel("Corrected amount (INR)").fill("41000");
  await page
    .getByRole("button", { name: "Review correction", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Confirm historical correction" })
    .click();
  await expect(
    page.getByRole("alert").filter({
      hasText: "Recover the pending result before changing these details.",
    }),
  ).toBeVisible();
  expect(forwarded).toBe(1);
  await page.getByRole("button", { name: "Recover pending result" }).click();
  await expect(page.getByTestId("account-balance")).toHaveText("₹40,000.00");
});
