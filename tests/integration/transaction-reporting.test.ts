import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { PrismaClient } from "../../src/generated/prisma/client";
import { postHarness } from "../support/post-harness";
import { handleTransactions } from "../../src/lib/transactions/http";
import { parseAccountCommand } from "../../src/lib/accounts/contract";

describe.each(["public", "ledgerone"] as const)(
  "S08-D %s restricted-reader integrated accounting",
  (schema) => {
    let h: Awaited<ReturnType<typeof postHarness>>,
      reader: PrismaClient,
      role: string;
    let bank: string,
      other: string,
      cash: string,
      card: string,
      fd: string,
      loan: string;
    let expense: {
      post: { operationId: string; journalId: string };
      categoryAccountId: string;
    };
    const effective = "2026-01-15T00:00:00+05:30",
      cutoff = "2026-01-31T23:59:59+05:30";
    beforeAll(async () => {
      h = await postHarness({ schema, accounts: true, reader: true });
      reader = h.readerDatabase!;
      role = h.readerRole!;
    }, 30000);
    afterAll(async () => {
      await h?.cleanup();
    });
    const request = (
      data?: unknown,
      user: number | null = 0,
      query = "",
      key: string = randomUUID(),
    ) =>
      handleTransactions(
        new Request(
          h.runtime.config.baseURL +
            "/api/transactions" +
            (data === undefined
              ? query
              : "?workspace=" + h.users[0]!.workspace),
          {
            method: data === undefined ? "GET" : "POST",
            headers: {
              origin: h.runtime.config.baseURL,
              "content-type": "application/json",
              "idempotency-key": key,
              ...(user === null ? {} : { cookie: h.cookie(user) }),
            },
            ...(data === undefined ? {} : { body: JSON.stringify(data) }),
          },
        ),
        h.runtime,
        reader,
        h.executor!,
        schema,
      );
    async function read(asOf = cutoff, user = 0) {
      const r = await request(
        undefined,
        user,
        "?asOf=" + encodeURIComponent(asOf),
      );
      expect(r.status).toBe(200);
      return r.json();
    }
    async function post(body: Record<string, unknown>) {
      const r = await request({
        ...body,
        effectiveAt: body.effectiveAt ?? effective,
      });
      expect(r.status).toBe(201);
      return r.json();
    }
    async function account(name: string, kind: string, opening: string) {
      return (
        await h.executor!.execute(
          async () => ({ ownerId: h.users[0]!.id, requestId: randomUUID() }),
          h.users[0]!.workspace,
          randomUUID(),
          parseAccountCommand({
            kind: "CREATE_ACCOUNT",
            name,
            accountKind: kind,
            opening,
            effectiveAt: "2026-01-01T00:00:00+05:30",
          }),
        )
      ).result.accountId;
    }
    const balance = (
      r: { accounts: { id: string; balanceMinor: string }[] },
      id: string,
    ) => r.accounts.find((a) => a.id === id)!.balanceMinor;
    async function snapshot() {
      return (
        await h.admin.query(
          `SELECT jsonb_build_object('journal',(SELECT jsonb_agg(to_jsonb(t) ORDER BY id) FROM journal t),'posting',(SELECT jsonb_agg(to_jsonb(t) ORDER BY id) FROM posting t),'operation',(SELECT jsonb_agg(to_jsonb(t) ORDER BY id) FROM ledger_operation t),'audit',(SELECT jsonb_agg(to_jsonb(t) ORDER BY id) FROM audit_event t),'capture',(SELECT jsonb_agg(to_jsonb(t) ORDER BY "operationId") FROM transaction_record t),'movement',(SELECT jsonb_agg(to_jsonb(t) ORDER BY "operationId") FROM transaction_movement t),'capital',(SELECT jsonb_agg(to_jsonb(t) ORDER BY "operationId") FROM transaction_capital t))::text state`,
        )
      ).rows[0].state;
    }
    it("A/B/C/D: all supported operations reconcile to posted classifications, balances and net worth", async () => {
      bank = await account("SBI Savings", "BANK", "50000");
      other = await account("HDFC Savings", "BANK", "2000");
      cash = await account("Wallet", "CASH", "1000");
      card = await account("Credit card", "CREDIT_CARD", "0");
      fd = await account("FD", "FIXED_DEPOSIT", "0");
      loan = await account("Loan", "LOAN", "20000");
      expect((await read()).totals).toEqual({
        currency: "INR",
        assetsMinor: "5300000",
        liabilitiesMinor: "2000000",
        netWorthMinor: "3300000",
      });
      expense = await post({
        kind: "EXPENSE",
        accountId: bank,
        amount: "850",
        category: "Groceries",
        description: "Reversible groceries",
      });
      expect(balance(await read(), bank)).toBe("4915000");
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
      let r = await read();
      expect(balance(r, card)).toBe("120000");
      expect(r.summary).toEqual({ expenseMinor: "210000", incomeMinor: "0" });
      await post({
        kind: "INCOME",
        accountId: bank,
        amount: "10000",
        category: "Salary",
      });
      expect((await read()).summary.incomeMinor).toBe("1000000");
      const transfer = await post({
        kind: "TRANSFER",
        sourceAccountId: bank,
        destinationAccountId: other,
        amount: "5000",
      });
      r = await read();
      expect(balance(r, bank)).toBe("5415000");
      expect(balance(r, other)).toBe("700000");
      expect(r.totals.netWorthMinor).toBe("4090000");
      await post({
        kind: "CARD_SETTLEMENT",
        sourceAccountId: bank,
        destinationAccountId: card,
        amount: "1200",
      });
      r = await read();
      expect(balance(r, bank)).toBe("5295000");
      expect(balance(r, card)).toBe("0");
      expect(r.summary.expenseMinor).toBe("210000");
      expect(r.totals.netWorthMinor).toBe("4090000");
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
      r = await read();
      expect(balance(r, bank)).toBe("4695000");
      expect(balance(r, fd)).toBe("600000");
      expect(r.totals.netWorthMinor).toBe("4090000");
      expect(r.summary.expenseMinor).toBe("210000");
      const repayment = await post({
        kind: "LOAN_REPAYMENT",
        sourceAccountId: bank,
        destinationAccountId: loan,
        principal: "5000",
        interest: "600",
      });
      r = await read();
      expect(balance(r, bank)).toBe("4135000");
      expect(balance(r, loan)).toBe("1500000");
      expect(r.summary).toEqual({
        expenseMinor: "270000",
        incomeMinor: "1000000",
      });
      expect(r.totals.netWorthMinor).toBe("4030000");
      const reversed = await h.api(0, randomUUID(), {
        kind: "REVERSE",
        originalJournalId: expense.post.journalId,
        effectiveAt: "2026-01-16T00:00:00+05:30",
        reason: "Reverse groceries",
      });
      expect(reversed.status).toBe(201);
      r = await read();
      expect(r.summary).toEqual({
        expenseMinor: "185000",
        incomeMinor: "1000000",
      });
      expect(balance(r, bank)).toBe("4220000");
      expect(r.totals).toEqual({
        currency: "INR",
        assetsMinor: "5615000",
        liabilitiesMinor: "1500000",
        netWorthMinor: "4115000",
      });
      expect(r.transactions).toHaveLength(9);
      expect(
        new Set(
          r.transactions.map((t: { operationId: string }) => t.operationId),
        ).size,
      ).toBe(9);
      expect(
        r.transactions.find(
          (t: { operationId: string }) =>
            t.operationId === expense.post.operationId,
        ).journal.reversal,
      ).toMatchObject({ kind: "REVERSE", affectsSummary: true });
      expect(
        r.transactions.find(
          (t: { operationId: string }) =>
            t.operationId === transfer.post.operationId,
        ).kind,
      ).toBe("TRANSFER");
      expect(
        r.transactions.find(
          (t: { operationId: string }) =>
            t.operationId === repayment.post.operationId,
        ),
      ).toMatchObject({
        principalMinor: "500000",
        interestMinor: "60000",
        amountMinor: "560000",
      });
      expect(
        (
          await h.admin.query(
            'SELECT j.id FROM journal j JOIN posting p ON p."journalId"=j.id WHERE j.status=\'POSTED\' GROUP BY j.id HAVING sum(CASE p.side WHEN \'DEBIT\' THEN p."functionalMinor"::numeric ELSE -p."functionalMinor"::numeric END)<>0',
          )
        ).rowCount,
      ).toBe(0);
    });
    it("inclusive India cutoff/effective dates differ from recording time; future reversal does not offset early totals", async () => {
      const before = await read("2026-01-14T18:29:59.999Z");
      expect(before.summary).toEqual({ expenseMinor: "0", incomeMinor: "0" });
      expect(before.totals.netWorthMinor).toBe("3300000");
      const boundary = await read("2026-01-14T18:30:00.000Z");
      expect(boundary.summary).toEqual({
        expenseMinor: "270000",
        incomeMinor: "1000000",
      });
      const original = boundary.transactions.find(
        (t: { operationId: string }) =>
          t.operationId === expense.post.operationId,
      );
      expect(original.journal.reversal.affectsSummary).toBe(false);
      expect(original.recordedAt).not.toBe(original.journal.effectiveAt);
      expect(original.journal.effectiveAt).toBe("2026-01-14T18:30:00.000Z");
      expect(original.futureEffective).toBe(false);
      const beforeReversal = await read("2026-01-15T18:29:59.999Z"),
        after = await read("2026-01-15T18:30:00.000Z");
      expect(beforeReversal.summary.expenseMinor).toBe("270000");
      expect(after.summary.expenseMinor).toBe("185000");
    });
    it("future postings and committed drafts stay outside current summary and balances; backdating is effective-time based", async () => {
      const before = await read();
      const future = await post({
        kind: "EXPENSE",
        accountId: bank,
        amount: "999",
        category: "Groceries",
        effectiveAt: "2099-01-01T00:00:00Z",
      });
      await post({
        kind: "INCOME",
        accountId: bank,
        amount: "1000",
        category: "Salary",
        effectiveAt: "2099-01-01T00:00:00Z",
      });
      const client = await h.admin.connect();
      try {
        await client.query("BEGIN");
        const id = randomUUID();
        await client.query(
          'INSERT INTO journal(id,"workspaceId","ownerId","effectiveAt",kind,description) VALUES($1,$2,$3,$4,\'GENERAL\',\'Unposted draft\')',
          [id, h.users[0]!.workspace, h.users[0]!.id, effective],
        );
        for (const [account, side] of [
          [bank, "CREDIT"],
          [h.users[0]!.expense, "DEBIT"],
        ])
          await client.query(
            'INSERT INTO posting(id,"journalId","workspaceId","ownerId","accountId","currencyCode",side,"nativeMinor","functionalMinor") VALUES($1,$2,$3,$4,$5,\'INR\',$6,500000,500000)',
            [
              randomUUID(),
              id,
              h.users[0]!.workspace,
              h.users[0]!.id,
              account,
              side,
            ],
          );
        await client.query("COMMIT");
      } finally {
        client.release();
      }
      const current = await read();
      expect(current.summary).toEqual(before.summary);
      expect(current.totals).toEqual(before.totals);
      expect(balance(current, bank)).toBe(balance(before, bank));
      expect(
        current.transactions.find(
          (t: { operationId: string }) =>
            t.operationId === future.post.operationId,
        ).futureEffective,
      ).toBe(true);
      await post({
        kind: "EXPENSE",
        accountId: bank,
        amount: "10",
        category: "Groceries",
        effectiveAt: "2026-01-10T00:00:00+05:30",
      });
      expect((await read("2026-01-09T18:30:00Z")).summary.expenseMinor).toBe(
        "1000",
      );
    });
    it("posted income reversal and CORRECT offset through ledger legs, preserving one original business event and links", async () => {
      let before = await read();
      const income = await post({
        kind: "INCOME",
        accountId: bank,
        amount: "100",
        category: "Salary",
      });
      expect(
        (
          await h.api(0, randomUUID(), {
            kind: "REVERSE",
            originalJournalId: income.post.journalId,
            effectiveAt: "2026-01-20T00:00:00+05:30",
            reason: "Reverse income",
          })
        ).status,
      ).toBe(201);
      expect((await read()).summary).toEqual(before.summary);
      const reversedIncome = (await read()).transactions.find(
        (t: { operationId: string }) =>
          t.operationId === income.post.operationId,
      );
      const restore = await h.api(0, randomUUID(), {
        kind: "REVERSE",
        originalJournalId: reversedIncome.journal.reversal.id,
        effectiveAt: "2026-01-21T00:00:00+05:30",
        reason: "Reverse the income reversal",
      });
      expect(restore.status).toBe(201);
      const restored = await read();
      expect(
        BigInt(restored.summary.incomeMinor) -
          BigInt(before.summary.incomeMinor),
      ).toBe(10000n);
      expect(
        restored.transactions.find(
          (t: { operationId: string }) =>
            t.operationId === income.post.operationId,
        ).journal.reversal.followUp.id,
      ).toBe((await restore.json()).reversal.journalId);
      before = await read();
      const purchase = await post({
        kind: "EXPENSE",
        accountId: bank,
        amount: "100",
        category: "Groceries",
      });
      const corrected = await h.api(0, randomUUID(), {
        kind: "CORRECT",
        originalJournalId: purchase.post.journalId,
        effectiveAt: "2026-01-20T00:00:00+05:30",
        reason: "Correct to70",
        replacement: {
          effectiveAt: "2026-01-21T00:00:00+05:30",
          description: "Corrected expense70",
          legs: [
            {
              accountId: purchase.categoryAccountId,
              side: "DEBIT",
              currency: "INR",
              amount: "70",
            },
            { accountId: bank, side: "CREDIT", currency: "INR", amount: "70" },
          ],
        },
      });
      expect(corrected.status).toBe(201);
      const after = await read();
      expect(
        BigInt(after.summary.expenseMinor) -
          BigInt(before.summary.expenseMinor),
      ).toBe(7000n);
      const rows = after.transactions.filter(
        (t: { operationId: string }) =>
          t.operationId === purchase.post.operationId,
      );
      expect(rows).toHaveLength(1);
      expect(rows[0].journal.reversal).toMatchObject({
        kind: "CORRECT",
        affectsSummary: true,
        replacement: { description: "Corrected expense70" },
      });
      expect(
        after.transactions.some(
          (t: { operationId: string }) =>
            t.operationId === rows[0].journal.reversal.operationId,
        ),
      ).toBe(false);
    });
    it("metadata/owner/workspace boundaries and repeated GET are read-only through an actual SELECT-only role", async () => {
      await h.admin.query(
        "UPDATE ledger_account SET name='Renamed SBI',\"archivedAt\"=now() WHERE id=$1",
        [bank],
      );
      const before = await snapshot();
      const first = await read(),
        second = await read();
      expect(second).toEqual(first);
      expect(await snapshot()).toBe(before);
      expect(
        first.transactions.find(
          (t: { operationId: string }) =>
            t.operationId === expense.post.operationId,
        ).accountName,
      ).toBe("SBI Savings");
      expect(
        first.accounts.find((a: { id: string }) => a.id === bank).name,
      ).toBe("Renamed SBI");
      const own = await read(cutoff, 1);
      expect(own.transactions).toEqual([]);
      expect(own.summary).toEqual({ expenseMinor: "0", incomeMinor: "0" });
      expect(own.totals.netWorthMinor).toBe("0");
      expect(
        (await request(undefined, 1, "?workspace=" + h.users[0]!.workspace))
          .status,
      ).toBe(404);
      expect(
        (await request(undefined, 0, "?workspace=" + h.users[1]!.workspace))
          .status,
      ).toBe(404);
      expect((await request(undefined, null)).status).toBe(401);
      for (const query of [
        "?asOf=invalid",
        "?asOf=2026-01-01T00:00:00Z&asOf=2026-01-02T00:00:00Z",
        "?ownerId=forged",
      ])
        expect((await request(undefined, 0, query)).status).toBe(400);
      expect(await reader.$queryRaw`SELECT current_user AS role`).toEqual([
        { role },
      ]);
      await expect(
        reader.$executeRaw`UPDATE ledger_account SET name='Forbidden'`,
      ).rejects.toThrow();
      expect(await snapshot()).toBe(before);
      await h.admin.query(
        'UPDATE ledger_account SET "archivedAt"=NULL WHERE id=$1',
        [bank],
      );
    });
    it("equal recording timestamps across all business families have deterministic operation-ID order", async () => {
      const ids = [] as {
        operationId: string;
        kind: string;
        destination: string;
      }[];
      for (const [kind, destination] of [
        ["EXPENSE", h.users[0]!.expense],
        ["TRANSFER", other],
        ["FD_FUNDING", fd],
      ]) {
        const r = await h.api(0, randomUUID(), {
          ...h.payload(),
          effectiveAt: effective,
          legs: [
            { accountId: bank, side: "CREDIT", currency: "INR", amount: "1" },
            {
              accountId: destination,
              side: "DEBIT",
              currency: "INR",
              amount: "1",
            },
          ],
        });
        expect(r.status).toBe(201);
        ids.push({
          operationId: (await r.json()).operationId,
          kind: kind!,
          destination: destination!,
        });
      }
      const c = await h.admin.connect();
      try {
        await c.query("BEGIN");
        await c.query(`SET LOCAL ROLE "${h.role}"`);
        for (const r of ids) {
          const values = [
            r.operationId,
            h.users[0]!.workspace,
            h.users[0]!.id,
            bank,
            r.destination,
          ];
          if (r.kind === "EXPENSE")
            await c.query(
              'INSERT INTO transaction_record("operationId","workspaceId","ownerId",kind,"accountId","categoryAccountId","accountName","categoryName","amountMinor") VALUES($1,$2,$3,\'EXPENSE\',$4,$5,\'Renamed SBI\',\'Fixture expense\',100)',
              values,
            );
          if (r.kind === "TRANSFER")
            await c.query(
              'INSERT INTO transaction_movement("operationId","workspaceId","ownerId",kind,"sourceAccountId","destinationAccountId","sourceAccountName","destinationAccountName","amountMinor") VALUES($1,$2,$3,\'TRANSFER\',$4,$5,\'Renamed SBI\',\'HDFC\',100)',
              values,
            );
          if (r.kind === "FD_FUNDING")
            await c.query(
              'INSERT INTO transaction_capital("operationId","workspaceId","ownerId",kind,"sourceAccountId","destinationAccountId","sourceAccountName","destinationAccountName","principalMinor","interestMinor","amountMinor") VALUES($1,$2,$3,\'FD_FUNDING\',$4,$5,\'Renamed SBI\',\'FD\',100,0,100)',
              values,
            );
        }
        await c.query("COMMIT");
      } finally {
        c.release();
      }
      const first = await read(),
        selected = first.transactions.filter((t: { operationId: string }) =>
          ids.some((r) => r.operationId === t.operationId),
        );
      expect(
        new Set(selected.map((t: { recordedAt: string }) => t.recordedAt)).size,
      ).toBe(1);
      expect(
        selected.map((t: { operationId: string }) => t.operationId),
      ).toEqual(
        ids
          .map((r) => r.operationId)
          .sort()
          .reverse(),
      );
      expect(
        (await read()).transactions.map(
          (t: { operationId: string }) => t.operationId,
        ),
      ).toEqual(
        first.transactions.map((t: { operationId: string }) => t.operationId),
      );
    });
    it("visible latest100 cap never truncates ledger-derived consumption, income, balances or net worth", async () => {
      const before = await read();
      for (let i = 0; i < 105; i++)
        await post({
          kind: "EXPENSE",
          accountId: bank,
          amount: "1",
          category: "Groceries",
          description: "Cap fixture " + i,
        });
      const after = await read();
      expect(after.transactions).toHaveLength(100);
      expect(after.history).toMatchObject({
        limit: 100,
        hasMore: true,
        ordering: "recorded_at_desc_operation_id_desc",
      });
      expect(
        after.transactions.some(
          (t: { operationId: string }) =>
            t.operationId === expense.post.operationId,
        ),
      ).toBe(false);
      expect(
        BigInt(after.summary.expenseMinor) -
          BigInt(before.summary.expenseMinor),
      ).toBe(10500n);
      expect(
        BigInt(after.totals.netWorthMinor) -
          BigInt(before.totals.netWorthMinor),
      ).toBe(-10500n);
      expect(after.summary.incomeMinor).toBe(before.summary.incomeMinor);
      expect(
        (await read()).transactions.map(
          (t: { operationId: string }) => t.operationId,
        ),
      ).toEqual(
        after.transactions.map((t: { operationId: string }) => t.operationId),
      );
    }, 30000);
    it("report aggregates remain exact beyond JavaScript safe integers and the per-posting maximum", async () => {
      const before = await read(),
        max = 999999999999999999n;
      const large = await account(
        "Large exact bank",
        "BANK",
        "9999999999999999.99",
      );
      await post({
        kind: "INCOME",
        accountId: large,
        amount: "9999999999999999.99",
        category: "Salary",
      });
      const after = await read();
      expect(balance(after, large)).toBe((2n * max).toString());
      expect(
        BigInt(after.totals.assetsMinor) - BigInt(before.totals.assetsMinor),
      ).toBe(2n * max);
      expect(
        BigInt(after.totals.netWorthMinor) -
          BigInt(before.totals.netWorthMinor),
      ).toBe(2n * max);
      expect(
        BigInt(after.summary.incomeMinor) - BigInt(before.summary.incomeMinor),
      ).toBe(max);
      expect(after.summary.expenseMinor).toBe(before.summary.expenseMinor);
    });
  },
);
