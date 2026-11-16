import { randomUUID } from "node:crypto";
import AxeBuilder from "@axe-core/playwright";
import type { Page } from "@playwright/test";
import { test, expect } from "./fixtures";
import { testDatabase } from "../support/database";
import { ensureE2EOwner } from "../support/e2e-owner";
async function account(
  page: Page,
  name: string,
  opening = "0",
  accountKind = "BANK",
) {
  let scope = (await (await page.request.get("/api/workspaces")).json())[0];
  if (!scope) {
    const created = await page.request.post("/api/workspaces", {
      headers: { origin: "http://127.0.0.1:3100" },
      data: { name: "S08 movement" },
    });
    expect([201, 409]).toContain(created.status());
    scope =
      created.status() === 201
        ? await created.json()
        : (await (await page.request.get("/api/workspaces")).json())[0];
  }
  const r = await page.request.post("/api/accounts?workspace=" + scope.id, {
    headers: {
      origin: "http://127.0.0.1:3100",
      "idempotency-key": randomUUID(),
    },
    data: {
      kind: "CREATE_ACCOUNT",
      name,
      opening,
      accountKind,
      effectiveAt: "2026-01-01T00:00:00+05:30",
    },
  });
  expect(r.status()).toBe(201);
  return { ...(await r.json()), workspaceId: scope.id };
}
async function post(
  page: Page,
  workspace: string,
  body: unknown,
  key: string = randomUUID(),
) {
  return page.request.post("/api/transactions?workspace=" + workspace, {
    headers: { origin: "http://127.0.0.1:3100", "idempotency-key": key },
    data: body,
  });
}
async function purchase(
  page: Page,
  card: { accountId: string; workspaceId: string },
) {
  const r = await post(page, card.workspaceId, {
    kind: "EXPENSE",
    accountId: card.accountId,
    amount: "1200",
    category: "Groceries",
    description: "Original card purchase",
    effectiveAt: "2026-01-15T00:00:00+05:30",
  });
  expect(r.status()).toBe(201);
  return r.json();
}
async function choose(page: Page, kind: string, source: string, dest: string) {
  await page.getByLabel("Transaction type").selectOption(kind);
  await page
    .getByLabel(kind === "TRANSFER" ? "Source account" : "Paying account")
    .selectOption(source);
  await page
    .getByLabel(
      kind === "TRANSFER" ? "Destination account" : "Credit-card account",
    )
    .selectOption(dest);
  await page.getByLabel("Transaction date (India)").fill("2026-01-15");
}
test("S08-B transfer and card payment real UI preserve balances, net worth and purchase history", async ({
  page,
}, info) => {
  const sbi = await account(page, "SBI Savings", "50000"),
    hdfc = await account(page, "HDFC Savings", "2000");
  await page.goto("/transactions");
  await choose(page, "TRANSFER", sbi.accountId, hdfc.accountId);
  await expect(page.getByTestId("movement-net-worth")).toHaveText("₹52,000.00");
  await page.getByLabel("Amount (INR)").fill("5000");
  await page.getByLabel("Description (optional)").fill("Move savings to HDFC");
  const response = page.waitForResponse(
    (r) =>
      r.request().method() === "POST" && r.url().includes("/api/transactions?"),
  );
  await page
    .getByRole("button", { name: "Save transfer", exact: true })
    .click();
  const result = await response;
  expect(result.status()).toBe(201);
  const movement = await result.json();
  const row = page.locator(
    '[data-operation-id="' + movement.post.operationId + '"]',
  );
  await expect(row).toHaveCount(1);
  await expect(row).toContainText("Transfer");
  await expect(row).toContainText("SBI Savings → HDFC Savings");
  await expect(row).toContainText("₹5,000.00");
  await expect(page.getByTestId("selected-account-balance")).toHaveText(
    "₹45,000.00",
  );
  await expect(page.getByTestId("destination-account-balance")).toHaveText(
    "₹7,000.00",
  );
  await expect(page.getByTestId("movement-net-worth")).toHaveText("₹52,000.00");
  await page.reload();
  await choose(page, "TRANSFER", sbi.accountId, hdfc.accountId);
  await expect(page.getByTestId("selected-account-balance")).toHaveText(
    "₹45,000.00",
  );
  await expect(page.getByTestId("destination-account-balance")).toHaveText(
    "₹7,000.00",
  );
  await page.evaluate(() => {
    (document.activeElement as HTMLElement)?.blur();
    window.scrollTo(0, 0);
  });
  await page.screenshot({
    path: info.outputPath("01-transfer.png"),
    fullPage: true,
  });
  const paying = await account(page, "SBI Savings", "50000"),
    card = await account(page, "Everyday Card", "0", "CREDIT_CARD");
  const bought = await purchase(page, card);
  await page.reload();
  await choose(page, "CARD_SETTLEMENT", paying.accountId, card.accountId);
  await expect(page.getByTestId("destination-account-balance")).toHaveText(
    "₹1,200.00",
  );
  await expect(page.getByTestId("movement-net-worth")).toHaveText("₹48,800.00");
  await page.getByLabel("Amount (INR)").fill("1200");
  await page.getByLabel("Description (optional)").fill("Pay January card bill");
  const paymentResponse = page.waitForResponse(
    (r) =>
      r.request().method() === "POST" && r.url().includes("/api/transactions?"),
  );
  await page
    .getByRole("button", { name: "Pay credit-card bill", exact: true })
    .click();
  const paid = await paymentResponse;
  expect(paid.status()).toBe(201);
  const saved = await paid.json();
  await expect(page.getByTestId("selected-account-balance")).toHaveText(
    "₹48,800.00",
  );
  await expect(page.getByTestId("destination-account-balance")).toHaveText(
    "₹0.00",
  );
  await expect(page.getByTestId("movement-net-worth")).toHaveText("₹48,800.00");
  await expect(
    page.locator('[data-operation-id="' + saved.post.operationId + '"]'),
  ).toContainText("Credit-card payment");
  await expect(
    page.locator('[data-operation-id="' + bought.post.operationId + '"]'),
  ).toContainText("Groceries · Expense");
  await page.reload();
  await choose(page, "CARD_SETTLEMENT", paying.accountId, card.accountId);
  await expect(page.getByTestId("destination-account-balance")).toHaveText(
    "₹0.00",
  );
  expect(
    (await new AxeBuilder({ page }).include("main").analyze()).violations,
  ).toEqual([]);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.evaluate(() => {
    (document.activeElement as HTMLElement)?.blur();
    window.scrollTo(0, 0);
  });
  await page.screenshot({
    path: info.outputPath("02-card-payment.png"),
    fullPage: true,
  });
  const db = testDatabase();
  try {
    for (const id of [movement.post.operationId, saved.post.operationId]) {
      const journal = await db.journal.findFirstOrThrow({
        where: { operationId: id },
        include: { postings: { include: { account: true } } },
      });
      expect(journal.postings).toHaveLength(2);
      expect(
        journal.postings.every(
          (p) => p.account.type !== "EXPENSE" && p.account.type !== "INCOME",
        ),
      ).toBe(true);
      expect(
        await db.transactionMovement.count({ where: { operationId: id } }),
      ).toBe(1);
      expect(await db.auditEvent.count({ where: { operationId: id } })).toBe(1);
    }
  } finally {
    await db.$disconnect();
  }
});
for (const kind of ["TRANSFER", "CARD_SETTLEMENT"] as const)
  test(`S08-B ${kind} browser lost response recovers one result and rejects unsafe submissions`, async ({
    page,
    ownerSession,
  }) => {
    const source = await account(page, "Recovery source", "50000"),
      dest = await account(
        page,
        "Recovery destination",
        kind === "TRANSFER" ? "2000" : "0",
        kind === "TRANSFER" ? "BANK" : "CREDIT_CARD",
      );
    if (kind === "CARD_SETTLEMENT") await purchase(page, dest);
    const command = {
      kind,
      sourceAccountId: source.accountId,
      destinationAccountId: dest.accountId,
      amount: "100",
      effectiveAt: "2026-01-15T00:00:00+05:30",
      description: "Recovery verification",
    };
    expect(
      (
        await post(page, source.workspaceId, {
          ...command,
          destinationAccountId: source.accountId,
        })
      ).status(),
    ).toBe(400);
    const db = testDatabase();
    try {
      const other = await ensureE2EOwner(db, "e2e-other@ledgerone.test");
      let workspace = await db.workspace.findUnique({
        where: { ownerId: other.id },
      });
      workspace ??= await db.workspace.create({
        data: { ownerId: other.id, name: "Other workspace" },
      });
      const foreign = await db.account.create({
        data: {
          ownerId: other.id,
          workspaceId: workspace.id,
          name: "Foreign",
          type: "ASSET",
          kind: "BANK",
          currencyCode: "INR",
        },
      });
      expect(
        (
          await post(page, source.workspaceId, {
            ...command,
            destinationAccountId: foreign.id,
          })
        ).status(),
      ).toBe(404);
      expect((await post(page, workspace.id, command)).status()).toBe(404);
      const usd = await db.account.create({
        data: {
          ownerId: ownerSession.userId,
          workspaceId: source.workspaceId,
          name: "USD",
          type: "ASSET",
          kind: "BANK",
          currencyCode: "USD",
        },
      });
      expect(
        (
          await post(page, source.workspaceId, {
            ...command,
            destinationAccountId: usd.id,
          })
        ).status(),
      ).toBe(409);
      const archive = await page.request.post(
        "/api/accounts?workspace=" + source.workspaceId,
        {
          headers: {
            origin: "http://127.0.0.1:3100",
            "idempotency-key": randomUUID(),
          },
          data: { kind: "ARCHIVE_ACCOUNT", accountId: dest.accountId },
        },
      );
      expect(archive.status()).toBe(201);
      expect((await post(page, source.workspaceId, command)).status()).toBe(
        409,
      );
      expect(
        (
          await page.request.post(
            "/api/accounts?workspace=" + source.workspaceId,
            {
              headers: {
                origin: "http://127.0.0.1:3100",
                "idempotency-key": randomUUID(),
              },
              data: { kind: "RESTORE_ACCOUNT", accountId: dest.accountId },
            },
          )
        ).status(),
      ).toBe(201);
    } finally {
      await db.$disconnect();
    }
    let forwarded = 0;
    let outcome: { post: { operationId: string } } | undefined;
    let key = "";
    let body: unknown;
    await page.route("**/api/transactions?workspace=*", async (route) => {
      if (route.request().method() === "POST" && forwarded === 0) {
        forwarded++;
        key = route.request().headers()["idempotency-key"]!;
        body = route.request().postDataJSON();
        const response = await route.fetch();
        expect(response.status()).toBe(201);
        outcome = await response.json();
        await route.abort("failed");
      } else await route.continue();
    });
    await page.goto("/transactions");
    await choose(page, kind, source.accountId, dest.accountId);
    await page.getByLabel("Amount (INR)").fill("100");
    await page
      .getByLabel("Description (optional)")
      .fill("Recovery verification");
    const save = page.getByRole("button", {
      name: kind === "TRANSFER" ? "Save transfer" : "Pay credit-card bill",
      exact: true,
    });
    await save.click();
    await expect(
      page.getByRole("button", { name: "Recover pending transaction" }),
    ).toBeVisible();
    await page.getByLabel("Amount (INR)").fill("101");
    await save.click();
    await expect(
      page.getByRole("alert").filter({
        hasText: "Recover the pending transaction before changing its details.",
      }),
    ).toContainText(
      "Recover the pending transaction before changing its details.",
    );
    expect(forwarded).toBe(1);
    await page
      .getByRole("button", { name: "Recover pending transaction" })
      .click();
    await expect(page.getByTestId("selected-account-balance")).toHaveText(
      "₹49,900.00",
    );
    await expect(page.getByTestId("destination-account-balance")).toHaveText(
      kind === "TRANSFER" ? "₹2,100.00" : "₹1,100.00",
    );
    const replay = await post(page, source.workspaceId, body, key);
    expect(replay.status()).toBe(200);
    expect(await replay.json()).toEqual(outcome);
    expect(
      (
        await post(
          page,
          source.workspaceId,
          { ...(body as object), amount: "101" },
          key,
        )
      ).status(),
    ).toBe(409);
    const verify = testDatabase();
    try {
      expect(
        await verify.transactionMovement.count({
          where: { operationId: outcome!.post.operationId },
        }),
      ).toBe(1);
      expect(
        await verify.auditEvent.count({
          where: { operationId: outcome!.post.operationId },
        }),
      ).toBe(1);
    } finally {
      await verify.$disconnect();
    }
  });

// B-R01: surface the actual later-boundary admission failure, without changing
// the already reviewed successful transfer/card-payment walkthroughs.
test("B-R01 backdated payment shows later-date rejection and retains posted balances", async ({
  page,
}) => {
  const bank = await account(page, "Backdated SBI", "50000"),
    card = await account(page, "Backdated card", "0", "CREDIT_CARD");
  expect(
    (
      await post(page, bank.workspaceId, {
        kind: "EXPENSE",
        accountId: card.accountId,
        amount: "1200",
        category: "Groceries",
        effectiveAt: "2026-01-01T00:00:00+05:30",
      })
    ).status(),
  ).toBe(201);
  expect(
    (
      await post(page, bank.workspaceId, {
        kind: "CARD_SETTLEMENT",
        sourceAccountId: bank.accountId,
        destinationAccountId: card.accountId,
        amount: "1000",
        effectiveAt: "2026-01-10T00:00:00+05:30",
      })
    ).status(),
  ).toBe(201);
  await page.goto("/transactions");
  await choose(page, "CARD_SETTLEMENT", bank.accountId, card.accountId);
  await page.getByLabel("Transaction date (India)").fill("2026-01-05");
  await page.getByLabel("Amount (INR)").fill("500");
  const response = page.waitForResponse(
    (r) =>
      r.request().method() === "POST" && r.url().includes("/api/transactions?"),
  );
  await page
    .getByRole("button", { name: "Pay credit-card bill", exact: true })
    .click();
  expect((await response).status()).toBe(409);
  await expect(
    page.getByRole("alert").filter({ hasText: "or a later posted date" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Recover pending transaction" }),
  ).toHaveCount(0);
  await page.reload();
  await choose(page, "CARD_SETTLEMENT", bank.accountId, card.accountId);
  await expect(page.getByTestId("selected-account-balance")).toHaveText(
    "₹49,000.00",
  );
  await expect(page.getByTestId("destination-account-balance")).toHaveText(
    "₹200.00",
  );
  const db = testDatabase();
  try {
    expect(
      await db.transactionMovement.count({
        where: { destinationAccountId: card.accountId },
      }),
    ).toBe(1);
  } finally {
    await db.$disconnect();
  }
});
