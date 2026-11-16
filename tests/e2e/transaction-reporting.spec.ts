import { randomUUID } from "node:crypto";
import AxeBuilder from "@axe-core/playwright";
import { test as base, expect } from "./fixtures";
import { testDatabase } from "../support/database";
const test = base.extend({
  ownerEmail: async ({ baseURL }, use, info) => {
    if (baseURL !== "http://127.0.0.1:3100")
      throw Error("Isolated local reporting session required");
    await use(
      info.project.name === "desktop-chromium"
        ? "e2e-report-desktop@ledgerone.test"
        : "e2e-report-mobile@ledgerone.test",
    );
  },
});

test("S08-D isolated authenticated all-operation history, totals and reversal walkthrough", async ({
  page,
  ownerSession,
}, info) => {
  const workspaceResponse = await page.request.post("/api/workspaces", {
    headers: { origin: "http://127.0.0.1:3100" },
    data: { name: "Reporting walkthrough" },
  });
  expect(workspaceResponse.status()).toBe(201);
  const workspace = (await workspaceResponse.json()).id;
  async function account(name: string, accountKind: string, opening: string) {
    const r = await page.request.post("/api/accounts?workspace=" + workspace, {
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
    });
    expect(r.status()).toBe(201);
    return (await r.json()).accountId as string;
  }
  const bank = await account("SBI Savings", "BANK", "50000"),
    other = await account("HDFC Savings", "BANK", "2000"),
    cash = await account("Wallet", "CASH", "1000"),
    card = await account("Everyday Card", "CREDIT_CARD", "0"),
    fd = await account("Fixed Deposit", "FIXED_DEPOSIT", "0"),
    loan = await account("Education Loan", "LOAN", "20000");
  async function post(body: Record<string, unknown>) {
    const r = await page.request.post(
      "/api/transactions?workspace=" + workspace,
      {
        headers: {
          origin: "http://127.0.0.1:3100",
          "idempotency-key": randomUUID(),
        },
        data: {
          ...body,
          effectiveAt: body.effectiveAt ?? "2026-01-15T00:00:00+05:30",
        },
      },
    );
    expect(r.status()).toBe(201);
    return r.json();
  }
  // Actual typed native handlers persist every operation. The existing S08-A/C
  // entry-form tests remain; this walkthrough verifies their consolidated result.
  const expense = await post({
    kind: "EXPENSE",
    accountId: bank,
    amount: "850",
    category: "Groceries",
    description: "Original groceries to reverse",
  });
  await post({
    kind: "EXPENSE",
    accountId: cash,
    amount: "50",
    category: "Transport",
  });
  await post({
    kind: "EXPENSE",
    accountId: card,
    amount: "1200",
    category: "Groceries",
  });
  await post({
    kind: "INCOME",
    accountId: bank,
    amount: "10000",
    category: "Salary",
  });
  await post({
    kind: "TRANSFER",
    sourceAccountId: bank,
    destinationAccountId: other,
    amount: "5000",
  });
  await post({
    kind: "CARD_SETTLEMENT",
    sourceAccountId: bank,
    destinationAccountId: card,
    amount: "1200",
  });
  await post({
    kind: "FD_FUNDING",
    sourceAccountId: bank,
    destinationAccountId: fd,
    amount: "10000",
  });
  await post({
    kind: "FD_RETURN",
    sourceAccountId: fd,
    destinationAccountId: bank,
    amount: "4000",
  });
  await post({
    kind: "LOAN_REPAYMENT",
    sourceAccountId: bank,
    destinationAccountId: loan,
    principal: "5000",
    interest: "600",
  });
  await page.goto("/transactions");
  await expect(page.getByTestId("consumption")).toHaveText("₹2,700.00");
  await expect(page.getByTestId("income-total")).toHaveText("₹10,000.00");
  await expect(page.getByTestId("net-worth-total")).toHaveText("₹40,300.00");
  await expect(page.getByTestId("transaction-row")).toHaveCount(9);
  for (const text of [
    "Credit-card purchase",
    "Credit-card payment",
    "FD funding",
    "FD principal return",
    "Loan repayment",
    "Salary · Income",
    "Transport · Expense",
  ])
    await expect(
      page.getByTestId("transaction-row").filter({ hasText: text }).first(),
    ).toBeVisible();
  await expect(
    page.getByText("Principal ₹5,000.00 · Interest ₹600.00 · Total ₹5,600.00", {
      exact: true,
    }),
  ).toBeVisible();
  await page.evaluate(() => {
    (document.activeElement as HTMLElement)?.blur();
    window.scrollTo(0, 0);
  });
  await page.screenshot({
    path: info.outputPath("01-all-operations.png"),
    fullPage: true,
  });
  // No consumer raw command is exposed. Controlled fixture SQL uses the existing
  // supported reversal schema/guards (not a new application executor/capability).
  // The companion integration suite exercises authenticated REVERSE/CORRECT via
  // the actual existing restricted-role command handler in both schemas.
  const db = testDatabase();
  let reversalId: string;
  try {
    // Fixture setup only: retry a definitively rolled-back PostgreSQL conflict,
    // never an unknown transport/COMMIT outcome. No app capability is added.
    const deadline = performance.now() + 10000;
    for (let attempt = 1; ; attempt++) {
      const budget = Math.floor(deadline - performance.now());
      if (budget <= 0) throw Error("Reversal fixture deadline expired");
      try {
        reversalId = await db.$transaction(
          async (tx) => {
            const original = await tx.journal.findFirstOrThrow({
              where: {
                id: expense.post.journalId,
                ownerId: ownerSession.userId,
                workspaceId: workspace,
                status: "POSTED",
              },
              include: { postings: true },
            });
            const op = randomUUID(),
              journal = randomUUID();
            await tx.ledgerOperation.create({
              data: {
                id: op,
                workspaceId: workspace,
                ownerId: ownerSession.userId,
                idempotencyKey: randomUUID(),
                requestHash: "b".repeat(64),
                kind: "REVERSE",
              },
            });
            // Preserve the explicit instant across adapter/session timezones,
            // just as the shared SQL executor does for real commands.
            await tx.$executeRaw`INSERT INTO journal(id,"workspaceId","ownerId",kind,"reversesJournalId","effectiveAt",description)
              VALUES(${journal}::uuid,${workspace}::uuid,${ownerSession.userId},'REVERSAL',${original.id}::uuid,${"2026-01-16T00:00:00+05:30"}::timestamptz,'Controlled local reversal')`;
            for (const p of original.postings)
              await tx.posting.create({
                data: {
                  id: randomUUID(),
                  journalId: journal,
                  workspaceId: workspace,
                  ownerId: ownerSession.userId,
                  accountId: p.accountId,
                  currencyCode: p.currencyCode,
                  functionalCurrencyCode: p.functionalCurrencyCode,
                  side: p.side === "DEBIT" ? "CREDIT" : "DEBIT",
                  nativeMinor: p.nativeMinor,
                  functionalMinor: p.functionalMinor,
                  fxRateId: p.fxRateId,
                },
              });
            await tx.$executeRaw`UPDATE journal SET status='POSTED',"postedAt"=clock_timestamp(),"operationId"=${op}::uuid WHERE id=${journal}::uuid`;
            await tx.auditEvent.create({
              data: {
                ownerId: ownerSession.userId,
                actorId: ownerSession.userId,
                workspaceId: workspace,
                requestId: randomUUID(),
                action: "ledger.reversed",
                operationId: op,
                targetJournalId: original.id,
                reason: "Controlled isolated browser reversal",
              },
            });
            return journal;
          },
          { isolationLevel: "Serializable", timeout: budget },
        );
        break;
      } catch (error) {
        const cause = error instanceof Error ? error.cause : null;
        const code =
          cause && typeof cause === "object" && "originalCode" in cause
            ? cause.originalCode
            : null;
        if ((code !== "40001" && code !== "40P01") || attempt >= 3) throw error;
        info.annotations.push({
          type: "fixture-rollback-retry",
          description: `Reversal setup attempt ${attempt}: PostgreSQL ${code}`,
        });
      }
    }
  } finally {
    await db.$disconnect();
  }
  await page
    .getByRole("button", { name: "Refresh transactions", exact: true })
    .click();
  await expect(page.getByTestId("consumption")).toHaveText("₹1,850.00");
  await expect(page.getByTestId("net-worth-total")).toHaveText("₹41,150.00");
  await expect(page.getByTestId("assets-total")).toHaveText("₹56,150.00");
  await expect(page.getByTestId("liabilities-total")).toHaveText("₹15,000.00");
  const originalRow = page.locator(
    '[data-operation-id="' + expense.post.operationId + '"]',
  );
  await expect(originalRow).toContainText("Reversed");
  await expect(originalRow).toContainText("Original ₹850.00");
  await originalRow.getByText("Reversal details", { exact: true }).click();
  await expect(originalRow).toContainText(reversalId!);
  await expect(originalRow).toContainText("Included in these ledger totals.");
  const persisted = await page.request.get(
    "/api/transactions?workspace=" + workspace,
  );
  expect(persisted.status()).toBe(200);
  const persistedOriginal = (await persisted.json()).transactions.find(
    (row: { operationId: string }) =>
      row.operationId === expense.post.operationId,
  );
  expect(persistedOriginal.journal.reversal.effectiveAt).toBe(
    "2026-01-15T18:30:00.000Z",
  );
  await expect(page.getByTestId("transaction-row")).toHaveCount(9);
  await post({
    kind: "INCOME",
    accountId: bank,
    amount: "999",
    category: "Salary",
    description: "Future salary",
    effectiveAt: "2099-01-01T00:00:00Z",
  });
  await page
    .getByRole("button", { name: "Refresh transactions", exact: true })
    .click();
  await expect(page.getByTestId("income-total")).toHaveText("₹10,000.00");
  await expect(
    page.getByText(
      "Future effective date · excluded from current totals and balances",
      { exact: true },
    ),
  ).toBeVisible();
  await page.reload();
  await expect(page.getByTestId("consumption")).toHaveText("₹1,850.00");
  await expect(originalRow).toContainText("Recorded");
  await expect(originalRow).toContainText("Effective");
  await expect(
    page.getByText(/Latest 100 business transactions/),
  ).toBeVisible();
  expect(
    (await new AxeBuilder({ page }).include("main").analyze()).violations,
  ).toEqual([]);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await originalRow.getByText("Reversal details", { exact: true }).click();
  await page.evaluate(() => {
    (document.activeElement as HTMLElement)?.blur();
    window.scrollTo(0, 0);
  });
  await page.screenshot({
    path: info.outputPath("02-reversed-and-future.png"),
    fullPage: true,
  });
  // A real request at the exact India cutoff proves current-vs-effective totals.
  const early = await page.request.get(
    "/api/transactions?asOf=" + encodeURIComponent("2026-01-14T18:29:59.999Z"),
  );
  expect(early.status()).toBe(200);
  expect((await early.json()).summary).toEqual({
    expenseMinor: "0",
    incomeMinor: "0",
  });
});
