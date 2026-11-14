import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { postHarness } from "../support/post-harness";
import { handleTransactions } from "../../src/lib/transactions/http";
import { readAccountBalance } from "../../src/lib/ledger/queries";
describe.each(["public", "ledgerone"] as const)(
  "S08-A %s real HTTP capture",
  (schema) => {
    let h: Awaited<ReturnType<typeof postHarness>>;
    beforeAll(async () => {
      h = await postHarness({ schema, accounts: true });
    }, 30000);
    afterAll(async () => {
      await h?.cleanup();
    });
    const body = () => ({
      kind: "EXPENSE",
      accountId: h.users[0]!.bank,
      amount: "850",
      category: "Groceries",
      effectiveAt: "2026-01-15T00:00:00+05:30",
      description: "Weekly groceries",
    });
    const api = (
      user: number | null,
      data?: unknown,
      key = randomUUID(),
      origin?: string,
    ) =>
      handleTransactions(
        new Request(
          h.runtime.config.baseURL +
            "/api/transactions?workspace=" +
            h.users[0]!.workspace,
          {
            method: data === undefined ? "GET" : "POST",
            headers: {
              "content-type": "application/json",
              origin: origin ?? h.runtime.config.baseURL,
              "idempotency-key": key,
              ...(user === null ? {} : { cookie: h.cookie(user) }),
            },
            ...(data === undefined ? {} : { body: JSON.stringify(data) }),
          },
        ),
        h.runtime,
        h.database,
        h.executor!,
        schema,
      );
    const balance = (id: string) =>
      readAccountBalance(
        h.database,
        { ownerId: h.users[0]!.id, requestId: randomUUID() },
        id,
        new Date("2026-12-31T00:00:00Z"),
        schema,
      );
    it("posts ₹850 groceries atomically, records history and income with correct balances", async () => {
      const r = await api(0, body());
      expect(r.status).toBe(201);
      const saved = await r.json();
      expect(saved.amountMinor).toBe("85000");
      expect(saved.categoryName).toBe("Groceries");
      expect((await balance(h.users[0]!.bank)).balanceMinor).toBe("-85000");
      const counts = (
        await h.admin.query(
          'SELECT (SELECT count(*)::int FROM journal WHERE "operationId"=$1) journals,(SELECT count(*)::int FROM audit_event WHERE "operationId"=$1) audits,(SELECT count(*)::int FROM transaction_record WHERE "operationId"=$1) captures',
          [saved.post.operationId],
        )
      ).rows[0];
      expect(counts).toEqual({ journals: 1, audits: 1, captures: 1 });
      expect(
        (
          await api(0, {
            ...body(),
            kind: "INCOME",
            amount: "2000",
            category: "Salary",
          })
        ).status,
      ).toBe(201);
      expect((await balance(h.users[0]!.bank)).balanceMinor).toBe("115000");
      const history = await (await api(0)).json();
      expect(
        history.transactions.some(
          (t: { operationId: string }) =>
            t.operationId === saved.post.operationId,
        ),
      ).toBe(true);
      expect(history.summary).toEqual({
        expenseMinor: "85000",
        incomeMinor: "200000",
      });
    });
    it("card expense increases liability and consumption", async () => {
      expect(
        (await api(0, { ...body(), accountId: h.users[0]!.card, amount: "75" }))
          .status,
      ).toBe(201);
      expect((await balance(h.users[0]!.card)).balanceMinor).toBe("7500");
    });
    it("same-key replay ignores later mutable names/archive and conflicts preserve original", async () => {
      const key = randomUUID(),
        command = { ...body(), amount: "10" };
      const first = await api(0, command, key);
      expect(first.status).toBe(201);
      const original = await first.json();
      await h.admin.query(
        "UPDATE ledger_account SET name='Later name',\"archivedAt\"=now() WHERE id=$1",
        [h.users[0]!.bank],
      );
      try {
        const replay = await api(0, { ...command, amount: "10.00" }, key);
        expect(replay.status).toBe(200);
        expect(await replay.json()).toEqual(original);
        expect((await api(0, { ...command, amount: "11" }, key)).status).toBe(
          409,
        );
        expect((await api(0, command)).status).toBe(409);
      } finally {
        await h.admin.query(
          "UPDATE ledger_account SET name='Fixture',\"archivedAt\"=NULL WHERE id=$1",
          [h.users[0]!.bank],
        );
      }
    });
    it("concurrent identical commands commit one receipt/audit/capture", async () => {
      const key = randomUUID(),
        command = { ...body(), amount: "2" };
      const responses = await Promise.all([
        api(0, command, key),
        api(0, command, key),
      ]);
      expect(responses.map((r) => r.status).sort()).toEqual([200, 201]);
      const [a, b] = await Promise.all(responses.map((r) => r.json()));
      expect(a).toEqual(b);
      expect(
        await h.database.transactionRecord.count({
          where: { operationId: a.post.operationId },
        }),
      ).toBe(1);
    });
    it("rejects two-user attacks, forged/raw fields, cross-origin, invalid account types and currencies", async () => {
      const foreignCurrencyAccount = randomUUID();
      await h.admin.query(
        "INSERT INTO ledger_account(id,\"workspaceId\",\"ownerId\",name,type,kind,\"currencyCode\",\"updatedAt\") VALUES($1,$2,$3,'USD fixture','ASSET','BANK','USD',now())",
        [foreignCurrencyAccount, h.users[0]!.workspace, h.users[0]!.id],
      );
      const before = await h.database.ledgerOperation.count(),
        accounts = await h.database.account.count();
      expect((await api(null, body())).status).toBe(401);
      expect((await api(1, body())).status).toBe(404);
      expect(
        (await api(0, { ...body(), ownerId: h.users[1]!.id })).status,
      ).toBe(400);
      expect(
        (await api(0, { ...body(), accountId: foreignCurrencyAccount })).status,
      ).toBe(409);
      expect((await api(0, { kind: "POST", legs: [] })).status).toBe(400);
      expect((await api(0, { ...body(), currency: "USD" })).status).toBe(400);
      expect(
        (await api(0, { ...body(), accountId: h.users[0]!.expense })).status,
      ).toBe(400);
      expect(
        (
          await api(0, {
            ...body(),
            kind: "INCOME",
            category: "Salary",
            accountId: h.users[0]!.card,
          })
        ).status,
      ).toBe(400);
      expect(
        (await api(0, body(), randomUUID(), "https://foreign.invalid")).status,
      ).toBe(403);
      expect(await h.database.ledgerOperation.count()).toBe(before);
      expect(await h.database.account.count()).toBe(accounts);
    });
    it("retains exact maximum quantities and reversals remove consumption", async () => {
      const before = await (await api(0)).json();
      const response = await api(0, {
        ...body(),
        amount: "9999999999999999.99",
      });
      expect(response.status).toBe(201);
      const saved = await response.json();
      expect(saved.amountMinor).toBe("999999999999999999");
      const reversed = await h.api(0, randomUUID(), {
        kind: "REVERSE",
        originalJournalId: saved.post.journalId,
        effectiveAt: "2026-01-16T00:00:00+05:30",
        reason: "Undo test capture",
      });
      expect(reversed.status).toBe(201);
      const after = await (await api(0)).json();
      expect(after.summary).toEqual(before.summary);
      expect(
        after.transactions.find(
          (r: { operationId: string }) =>
            r.operationId === saved.post.operationId,
        ).journal.reversal,
      ).not.toBeNull();
    });
    it("database rejects mismatched typed context and immutable capture mutation", async () => {
      const raw = await h.api(0, randomUUID(), h.payload());
      expect(raw.status).toBe(201);
      const original = await raw.json();
      const client = await h.admin.connect();
      try {
        await client.query("BEGIN");
        await client.query(
          'INSERT INTO transaction_record("operationId","workspaceId","ownerId",kind,"accountId","categoryAccountId","accountName","categoryName","amountMinor") VALUES($1,$2,$3,\'EXPENSE\',$4,$5,\'Fixture\',\'Groceries\',999)',
          [
            original.operationId,
            h.users[0]!.workspace,
            h.users[0]!.id,
            h.users[0]!.bank,
            h.users[0]!.expense,
          ],
        );
        await expect(client.query("COMMIT")).rejects.toMatchObject({
          code: "23514",
        });
      } finally {
        await client.query("ROLLBACK");
        client.release();
      }
      expect(
        await h.database.transactionRecord.count({
          where: { operationId: original.operationId },
        }),
      ).toBe(0);
      const valid = await (await api(0, { ...body(), amount: "1" })).json();
      await expect(
        h.admin.query(
          'UPDATE transaction_record SET "amountMinor"=1 WHERE "operationId"=$1',
          [valid.post.operationId],
        ),
      ).rejects.toMatchObject({ code: "23514" });
    });
    it("denies a missing typed capability and does not expose another owner's captures", async () => {
      const before = await h.database.ledgerOperation.count();
      const denied = await handleTransactions(
        new Request(
          h.runtime.config.baseURL +
            "/api/transactions?workspace=" +
            h.users[0]!.workspace,
          {
            method: "POST",
            headers: {
              cookie: h.cookie(0),
              origin: h.runtime.config.baseURL,
              "content-type": "application/json",
              "idempotency-key": randomUUID(),
            },
            body: JSON.stringify(body()),
          },
        ),
        h.runtime,
        h.database,
        null,
        schema,
      );
      expect(denied.status).toBe(503);
      expect(await h.database.ledgerOperation.count()).toBe(before);
      expect(
        (await api(0, { ...body(), accountId: h.users[1]!.bank })).status,
      ).toBe(404);
      const foreign = await (await api(1)).json();
      expect(foreign.transactions).toEqual([]);
      expect(foreign.summary).toEqual({ expenseMinor: "0", incomeMinor: "0" });
      expect(
        foreign.accounts.every(
          (a: { id: string }) => a.id !== h.users[0]!.bank,
        ),
      ).toBe(true);
    });
    it.each(["receipt", "postings", "audit", "beforeCommit"] as const)(
      "%s failure rolls back journal, category, receipt, audit and capture",
      async (stage) => {
        const before = {
          ops: await h.database.ledgerOperation.count(),
          accounts: await h.database.account.count(),
          captures: await h.database.transactionRecord.count(),
        };
        h.setProbe(async (s) => {
          if (s === stage) throw Error("Injected capture fault");
        });
        try {
          expect(
            (await api(0, { ...body(), category: "Utilities" })).status,
          ).toBe(503);
        } finally {
          h.setProbe(undefined);
        }
        expect({
          ops: await h.database.ledgerOperation.count(),
          accounts: await h.database.account.count(),
          captures: await h.database.transactionRecord.count(),
        }).toEqual(before);
      },
    );
  },
);
