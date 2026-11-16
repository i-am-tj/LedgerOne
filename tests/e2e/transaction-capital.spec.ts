import { randomUUID } from "node:crypto";
import AxeBuilder from "@axe-core/playwright";
import type { Page } from "@playwright/test";
import { test, expect } from "./fixtures";
import { testDatabase } from "../support/database";
async function account(
  page: Page,
  name: string,
  accountKind = "BANK",
  opening = "0",
) {
  let scope = (await (await page.request.get("/api/workspaces")).json())[0];
  if (!scope) {
    const created = await page.request.post("/api/workspaces", {
      headers: { origin: "http://127.0.0.1:3100" },
      data: { name: "Capital verification" },
    });
    expect([201, 409]).toContain(created.status());
    scope =
      created.status() === 201
        ? await created.json()
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
        name,
        accountKind,
        opening,
        effectiveAt: "2026-01-01T00:00:00+05:30",
      },
    },
  );
  expect(response.status()).toBe(201);
  return { ...(await response.json()), workspaceId: scope.id };
}
async function choose(
  page: Page,
  kind: string,
  source: string,
  destination: string,
) {
  await page.getByLabel("Transaction type").selectOption(kind);
  await page
    .getByLabel(
      kind === "FD_RETURN" ? "Fixed-deposit source" : "Paying account",
    )
    .selectOption(source);
  await page
    .getByLabel(
      kind === "FD_RETURN"
        ? "Receiving account"
        : kind === "FD_FUNDING"
          ? "Fixed-deposit account"
          : "Loan account",
    )
    .selectOption(destination);
  await page.getByLabel("Transaction date (India)").fill("2026-01-05");
}
async function save(page: Page, name: string) {
  const response = page.waitForResponse(
    (r) =>
      r.request().method() === "POST" && r.url().includes("/api/transactions?"),
  );
  await page.getByRole("button", { name, exact: true }).click();
  const r = await response;
  expect(r.status()).toBe(201);
  return r.json();
}
async function screenshot(page: Page, path: string) {
  await page.evaluate(() => {
    (document.activeElement as HTMLElement)?.blur();
    window.scrollTo(0, 0);
  });
  await page.screenshot({ path, fullPage: true });
}
test("S08-C FD funding/return and loan principal-interest actual UI walkthrough", async ({
  page,
}, info) => {
  const bank = await account(page, "SBI Savings", "BANK", "50000"),
    fd = await account(page, "SBI Fixed Deposit", "FIXED_DEPOSIT");
  await page.goto("/transactions");
  await choose(page, "FD_FUNDING", bank.accountId, fd.accountId);
  await page.getByLabel("Amount (INR)").fill("10000");
  await page.getByLabel("Description (optional)").fill("Save principal in FD");
  const funded = await save(page, "Fund fixed deposit");
  await expect(page.getByTestId("selected-account-balance")).toHaveText(
    "₹40,000.00",
  );
  await expect(page.getByTestId("destination-account-balance")).toHaveText(
    "₹10,000.00",
  );
  await expect(page.getByTestId("movement-net-worth")).toHaveText("₹50,000.00");
  await expect(
    page.locator('[data-operation-id="' + funded.post.operationId + '"]'),
  ).toContainText("FD funding");
  await screenshot(page, info.outputPath("01-fd-funding.png"));
  await page.reload();
  await choose(page, "FD_RETURN", fd.accountId, bank.accountId);
  await page.getByLabel("Amount (INR)").fill("10000");
  await page.getByLabel("Transaction date (India)").fill("2026-01-10");
  await page
    .getByLabel("Description (optional)")
    .fill("Return FD principal at maturity");
  const returned = await save(page, "Return FD principal");
  await expect(page.getByTestId("selected-account-balance")).toHaveText(
    "₹0.00",
  );
  await expect(page.getByTestId("destination-account-balance")).toHaveText(
    "₹50,000.00",
  );
  await expect(page.getByTestId("movement-net-worth")).toHaveText("₹50,000.00");
  await expect(
    page.locator('[data-operation-id="' + funded.post.operationId + '"]'),
  ).toContainText("FD funding");
  await expect(
    page.locator('[data-operation-id="' + returned.post.operationId + '"]'),
  ).toContainText("FD principal return");
  await screenshot(page, info.outputPath("02-fd-return.png"));
  const payer = bank,
    loan = await account(page, "Education Loan", "LOAN", "20000");
  await page.reload();
  await choose(page, "LOAN_REPAYMENT", payer.accountId, loan.accountId);
  await page.getByLabel("Principal (INR)").fill("5000");
  await page.getByLabel("Interest (INR)").fill("600");
  await page
    .getByLabel("Description (optional)")
    .fill("Principal and interest repayment");
  await expect(page.getByTestId("loan-total-payment")).toHaveText("₹5,600.00");
  await expect(page.getByTestId("movement-net-worth")).toHaveText("₹30,000.00");
  await screenshot(page, info.outputPath("03-loan-review.png"));
  const saved = await save(page, "Save loan repayment");
  await expect(page.getByTestId("selected-account-balance")).toHaveText(
    "₹44,400.00",
  );
  await expect(page.getByTestId("destination-account-balance")).toHaveText(
    "₹15,000.00",
  );
  await expect(page.getByTestId("movement-net-worth")).toHaveText("₹29,400.00");
  const history = page.locator(
    '[data-operation-id="' + saved.post.operationId + '"]',
  );
  await expect(history).toContainText("Loan repayment");
  await expect(history).toContainText(
    "Principal ₹5,000.00 · Interest ₹600.00 · Total ₹5,600.00",
  );
  await page.reload();
  await choose(page, "LOAN_REPAYMENT", payer.accountId, loan.accountId);
  await expect(page.getByTestId("selected-account-balance")).toHaveText(
    "₹44,400.00",
  );
  await expect(history).toContainText("₹600.00");
  expect(
    (await new AxeBuilder({ page }).include("main").analyze()).violations,
  ).toEqual([]);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await screenshot(page, info.outputPath("04-loan-saved.png"));
  const db = testDatabase();
  try {
    for (const op of [funded, returned, saved]) {
      expect(
        await db.transactionCapital.count({
          where: { operationId: op.post.operationId },
        }),
      ).toBe(1);
      expect(
        await db.auditEvent.count({
          where: { operationId: op.post.operationId },
        }),
      ).toBe(1);
    }
    const legs = await db.posting.findMany({
      where: { journalId: saved.post.journalId },
      include: { account: true },
    });
    expect(legs).toHaveLength(3);
    expect(legs.find((p) => p.account.type === "EXPENSE")!.nativeMinor).toBe(
      60000n,
    );
    expect(
      legs.reduce(
        (sum, p) =>
          sum + (p.side === "DEBIT" ? p.functionalMinor : -p.functionalMinor),
        0n,
      ),
    ).toBe(0n);
    for (const op of [funded, returned]) {
      const p = await db.posting.findMany({
        where: { journalId: op.post.journalId },
        include: { account: true },
      });
      expect(p.every((l) => l.account.type === "ASSET")).toBe(true);
    }
  } finally {
    await db.$disconnect();
  }
});
for (const kind of ["FD_FUNDING", "FD_RETURN", "LOAN_REPAYMENT"] as const)
  test(`S08-C ${kind} uncertain-response recovery retains one authorized outcome`, async ({
    page,
  }) => {
    const bank = await account(page, "Recovery Bank", "BANK", "50000"),
      other = await account(
        page,
        "Recovery Principal",
        kind === "LOAN_REPAYMENT" ? "LOAN" : "FIXED_DEPOSIT",
        "20000",
      );
    const source = kind === "FD_RETURN" ? other : bank,
      dest = kind === "FD_RETURN" ? bank : other;
    let forwarded = 0,
      key = "",
      body: unknown,
      result: { post: { operationId: string } } | undefined;
    await page.route("**/api/transactions?workspace=*", async (route) => {
      if (route.request().method() === "POST" && forwarded === 0) {
        forwarded++;
        key = route.request().headers()["idempotency-key"]!;
        body = route.request().postDataJSON();
        const response = await route.fetch();
        expect(response.status()).toBe(201);
        result = await response.json();
        await route.abort("failed");
      } else await route.continue();
    });
    await page.goto("/transactions");
    await choose(page, kind, source.accountId, dest.accountId);
    const label =
      kind === "LOAN_REPAYMENT" ? "Principal (INR)" : "Amount (INR)";
    await page.getByLabel(label).fill("5000");
    if (kind === "LOAN_REPAYMENT")
      await page.getByLabel("Interest (INR)").fill("600");
    const button = page.getByRole("button", {
      name:
        kind === "LOAN_REPAYMENT"
          ? "Save loan repayment"
          : kind === "FD_RETURN"
            ? "Return FD principal"
            : "Fund fixed deposit",
      exact: true,
    });
    await button.click();
    await expect(
      page.getByRole("button", { name: "Recover pending transaction" }),
    ).toBeVisible();
    await page.getByLabel(label).fill("5100");
    await button.click();
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
      kind === "FD_RETURN"
        ? "₹15,000.00"
        : kind === "LOAN_REPAYMENT"
          ? "₹44,400.00"
          : "₹45,000.00",
    );
    await expect(page.getByTestId("destination-account-balance")).toHaveText(
      kind === "FD_RETURN"
        ? "₹55,000.00"
        : kind === "LOAN_REPAYMENT"
          ? "₹15,000.00"
          : "₹25,000.00",
    );
    const replay = await page.request.post(
      "/api/transactions?workspace=" + source.workspaceId,
      {
        headers: { origin: "http://127.0.0.1:3100", "idempotency-key": key },
        data: body,
      },
    );
    expect(replay.status()).toBe(200);
    expect(await replay.json()).toEqual(result);
    const db = testDatabase();
    try {
      expect(
        await db.transactionCapital.count({
          where: { operationId: result!.post.operationId },
        }),
      ).toBe(1);
    } finally {
      await db.$disconnect();
    }
  });
