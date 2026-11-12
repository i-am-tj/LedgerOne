import { randomUUID } from "node:crypto";
import { test, expect } from "./fixtures";
import { testDatabase } from "../support/database";
test("P1-S06B actual Next POST route stays disabled and anonymous requests remain unauthorized", async ({
  page,
  playwright,
}) => {
  const database = testDatabase(),
    path = `/api/workspaces/${randomUUID()}/ledger/commands`,
    origin = "http://127.0.0.1:3100";
  const payload = {
    kind: "POST",
    reason: "fixture",
    effectiveAt: "2026-01-01T00:00:00Z",
    legs: [
      { accountId: randomUUID(), side: "DEBIT", currency: "INR", amount: "1" },
      {
        accountId: randomUUID(),
        side: "CREDIT",
        currency: "INR",
        amount: "1.00",
      },
    ],
  };
  const before = await database.ledgerOperation.count();
  const anonymous = await playwright.request.newContext({ baseURL: origin });
  try {
    const response = await page.request.post(path, {
      headers: {
        origin,
        "idempotency-key": randomUUID(),
        "x-financial-writes-enabled": "true",
      },
      data: payload,
    });
    expect(response.status()).toBe(503);
    expect(await response.json()).toEqual({ error: "service_unavailable" });
    expect(
      (
        await anonymous.post(path, {
          headers: { origin, "idempotency-key": randomUUID() },
          data: payload,
        })
      ).status(),
    ).toBe(401);
    expect(await database.ledgerOperation.count()).toBe(before);
  } finally {
    await anonymous.dispose();
    await database.$disconnect();
  }
});
