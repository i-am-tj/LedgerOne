import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { postHarness } from "../support/post-harness";
import { canonical, decimal, samples, seeds } from "../support/s09-fixtures";
import { handleTransactions } from "../../src/lib/transactions/http";
import { parseAccountCommand } from "../../src/lib/accounts/contract";
import { getOwnerSession } from "../../src/lib/auth/requests";

describe.each(["public", "ledgerone"] as const)(
  "S09 %s independent accounting",
  (schema) => {
    let h: Awaited<ReturnType<typeof postHarness>>;
    beforeAll(async () => {
      h = await postHarness({ schema, accounts: true, reader: true });
    }, 30000);
    afterAll(async () => {
      await h?.cleanup();
    });
    const owner = () => h.users[0]!;
    const api = (
      data?: unknown,
      key = randomUUID(),
      user: number | null = 0,
      extra: Record<string, string> = {},
      workspace: string = owner().workspace,
    ) =>
      handleTransactions(
        new Request(
          h.runtime.config.baseURL +
            "/api/transactions?workspace=" +
            workspace +
            (data === undefined ? "&asOf=2026-02-01T00%3A00%3A00Z" : ""),
          {
            method: data === undefined ? "GET" : "POST",
            headers: {
              origin: h.runtime.config.baseURL,
              "content-type": "application/json",
              "idempotency-key": key,
              ...(user === null ? {} : { cookie: h.cookie(user) }),
              ...extra,
            },
            ...(data === undefined ? {} : { body: JSON.stringify(data) }),
          },
        ),
        h.runtime,
        h.readerDatabase!,
        h.executor!,
        schema,
      );
    async function create(
      name: string,
      accountKind: string,
      opening: string,
      user = 0,
    ) {
      const r = await h.executor!.execute(
        async () => {
          const session = await getOwnerSession(
            h.runtime.auth,
            h.runtime.config,
            new Headers({ cookie: h.cookie(user) }),
          );
          if (!session) throw Error("Missing fixture session");
          return { ownerId: session.user.id, requestId: randomUUID() };
        },
        h.users[user]!.workspace,
        randomUUID(),
        parseAccountCommand({
          kind: "CREATE_ACCOUNT",
          name,
          accountKind,
          opening,
          effectiveAt: "2026-01-01T00:00:00Z",
        }),
      );
      return r.result.accountId;
    }
    async function overview() {
      const r = await api();
      expect(r.status).toBe(200);
      return r.json();
    }
    async function post(data: Record<string, unknown>, key = randomUUID()) {
      const r = await api(
        { ...data, effectiveAt: data.effectiveAt ?? "2026-01-15T00:00:00Z" },
        key,
      );
      expect(r.status, JSON.stringify(data)).toBe(201);
      return r.json();
    }
    async function state() {
      return (
        await h.admin.query(
          `SELECT jsonb_build_object('accounts',(SELECT jsonb_agg(to_jsonb(t) ORDER BY id) FROM ledger_account t),'journals',(SELECT jsonb_agg(to_jsonb(t) ORDER BY id) FROM journal t),'postings',(SELECT jsonb_agg(to_jsonb(t) ORDER BY id) FROM posting t),'receipts',(SELECT jsonb_agg(to_jsonb(t) ORDER BY id) FROM ledger_operation t),'audits',(SELECT jsonb_agg(to_jsonb(t) ORDER BY id) FROM audit_event t),'captures',(SELECT jsonb_agg(to_jsonb(t) ORDER BY "operationId") FROM transaction_record t),'movements',(SELECT jsonb_agg(to_jsonb(t) ORDER BY "operationId") FROM transaction_movement t),'capital',(SELECT jsonb_agg(to_jsonb(t) ORDER BY "operationId") FROM transaction_capital t))::text s`,
        )
      ).rows[0].s;
    }
    type ExpectedLeg = [string, "DEBIT" | "CREDIT", string];
    async function legs(id: string, expected: ExpectedLeg[]) {
      const actual = (
        await h.admin.query(
          `SELECT a.name,p.side::text,p."nativeMinor"::text amount,p."functionalMinor"::text functional,p."currencyCode" currency FROM posting p JOIN ledger_account a ON a.id=p."accountId" WHERE p."journalId"=$1 ORDER BY a.name,p.side,p."nativeMinor"`,
          [id],
        )
      ).rows;
      const ordered = expected
        .map(([name, side, amount]) => ({
          name,
          side,
          amount,
          functional: amount,
          currency: "INR",
        }))
        .sort(
          (a, b) =>
            a.name.localeCompare(b.name) || a.side.localeCompare(b.side),
        );
      expect(
        actual.sort(
          (a, b) =>
            a.name.localeCompare(b.name) || a.side.localeCompare(b.side),
        ),
      ).toEqual(ordered);
    }
    async function balanced() {
      expect(
        (
          await h.admin.query(
            `SELECT j.id FROM journal j LEFT JOIN posting p ON p."journalId"=j.id WHERE j.status='POSTED' GROUP BY j.id HAVING coalesce(sum(CASE p.side WHEN 'DEBIT' THEN p."functionalMinor"::numeric ELSE -p."functionalMinor"::numeric END),1)<>0 OR count(p.id)<2`,
          )
        ).rows,
      ).toEqual([]);
    }
    it("T01 fixed canonical steps match independently specified legs, balances, classifications and dates", async () => {
      const ids: string[] = [];
      // Setup is sequential to avoid manufacturing first-use classification races.
      for (const [name, kind, amount] of [
        ["SBI Savings", "BANK", "50000"],
        ["Cash", "CASH", "1000"],
        ["HDFC Savings", "BANK", "2000"],
        ["Card", "CREDIT_CARD", "0"],
        ["FD", "FIXED_DEPOSIT", "0"],
        ["Loan", "LOAN", "20000"],
      ])
        ids.push(await create(name!, kind!, amount!));
      const [bank, cash, other, card, fd, loan] = ids as [
        string,
        string,
        string,
        string,
        string,
        string,
      ];
      async function check(step: number) {
        const r = await overview(),
          e = canonical[step]!;
        expect(
          ids.map(
            (id) =>
              r.accounts.find((a: { id: string }) => a.id === id).balanceMinor,
          ),
          `canonical step ${step}`,
        ).toEqual(e.slice(0, 6));
        expect([
          r.totals.assetsMinor,
          r.totals.liabilitiesMinor,
          r.totals.netWorthMinor,
          r.summary.expenseMinor,
          r.summary.incomeMinor,
        ]).toEqual(e.slice(6));
        // Independent raw aggregation also checks the production read boundary.
        const raw = (
          await h.admin.query(
            `SELECT a.id,a.type::text,coalesce(sum(CASE WHEN j.id IS NOT NULL THEN CASE p.side WHEN 'DEBIT' THEN p."nativeMinor"::numeric ELSE -p."nativeMinor"::numeric END ELSE 0 END),0)::text debit FROM ledger_account a LEFT JOIN posting p ON p."accountId"=a.id LEFT JOIN journal j ON j.id=p."journalId" AND j.status='POSTED' AND j."effectiveAt"<='2026-02-01T00:00:00Z'::timestamptz WHERE a.id=ANY($1::uuid[]) GROUP BY a.id`,
            [ids],
          )
        ).rows;
        expect(
          ids.map((id) => {
            const a = raw.find((a) => a.id === id)!;
            return (
              BigInt(a.debit) * (a.type === "LIABILITY" ? -1n : 1n)
            ).toString();
          }),
        ).toEqual(e.slice(0, 6));
        await balanced();
      }
      await check(0);
      for (const [name, amount, side] of [
        ["SBI Savings", "5000000", "DEBIT"],
        ["Cash", "100000", "DEBIT"],
        ["HDFC Savings", "200000", "DEBIT"],
        ["Loan", "2000000", "CREDIT"],
      ] as const) {
        const marker = (
          await h.admin.query(
            `SELECT o."journalId" FROM opening_balance o JOIN ledger_account a ON a.id=o."accountId" WHERE a.name=$1 AND a."ownerId"=$2`,
            [name, owner().id],
          )
        ).rows[0];
        await legs(marker.journalId, [
          [name, side, amount],
          ["Opening balances", side === "DEBIT" ? "CREDIT" : "DEBIT", amount],
        ]);
      }
      const expense = await post({
        kind: "EXPENSE",
        accountId: bank,
        category: "Groceries",
        amount: "850",
      });
      await legs(expense.post.journalId, [
        ["Groceries", "DEBIT", "85000"],
        ["SBI Savings", "CREDIT", "85000"],
      ]);
      await check(1);
      const cashExpense = await post({
        kind: "EXPENSE",
        accountId: cash,
        category: "Transport",
        amount: "50",
      });
      await legs(cashExpense.post.journalId, [
        ["Transport", "DEBIT", "5000"],
        ["Cash", "CREDIT", "5000"],
      ]);
      await check(2);
      const purchase = await post({
        kind: "EXPENSE",
        accountId: card,
        category: "Groceries",
        amount: "1200",
      });
      await legs(purchase.post.journalId, [
        ["Groceries", "DEBIT", "120000"],
        ["Card", "CREDIT", "120000"],
      ]);
      await check(3);
      const salary = await post({
        kind: "INCOME",
        accountId: bank,
        category: "Salary",
        amount: "10000",
      });
      await legs(salary.post.journalId, [
        ["SBI Savings", "DEBIT", "1000000"],
        ["Salary", "CREDIT", "1000000"],
      ]);
      await check(4);
      const income = await post({
        kind: "INCOME",
        accountId: bank,
        category: "Other income",
        amount: "500",
      });
      await legs(income.post.journalId, [
        ["SBI Savings", "DEBIT", "50000"],
        ["Other income", "CREDIT", "50000"],
      ]);
      await check(5);
      const transfer = await post({
        kind: "TRANSFER",
        sourceAccountId: bank,
        destinationAccountId: other,
        amount: "5000",
      });
      await legs(transfer.post.journalId, [
        ["HDFC Savings", "DEBIT", "500000"],
        ["SBI Savings", "CREDIT", "500000"],
      ]);
      await check(6);
      const settle = await post({
        kind: "CARD_SETTLEMENT",
        sourceAccountId: bank,
        destinationAccountId: card,
        amount: "1200",
      });
      await legs(settle.post.journalId, [
        ["Card", "DEBIT", "120000"],
        ["SBI Savings", "CREDIT", "120000"],
      ]);
      await check(7);
      const funding = await post({
        kind: "FD_FUNDING",
        sourceAccountId: bank,
        destinationAccountId: fd,
        amount: "10000",
      });
      await legs(funding.post.journalId, [
        ["FD", "DEBIT", "1000000"],
        ["SBI Savings", "CREDIT", "1000000"],
      ]);
      await check(8);
      const returned = await post({
        kind: "FD_RETURN",
        sourceAccountId: fd,
        destinationAccountId: bank,
        amount: "4000",
      });
      await legs(returned.post.journalId, [
        ["SBI Savings", "DEBIT", "400000"],
        ["FD", "CREDIT", "400000"],
      ]);
      await check(9);
      const repayment = await post({
        kind: "LOAN_REPAYMENT",
        sourceAccountId: bank,
        destinationAccountId: loan,
        principal: "5000",
        interest: "600",
      });
      await legs(repayment.post.journalId, [
        ["Loan", "DEBIT", "500000"],
        ["Loan interest", "DEBIT", "60000"],
        ["SBI Savings", "CREDIT", "560000"],
      ]);
      await check(10);
      const reversal = await h.api(0, randomUUID(), {
        kind: "REVERSE",
        originalJournalId: expense.post.journalId,
        effectiveAt: "2026-01-16T00:00:00Z",
        reason: "S09 exact reversal",
      });
      expect(reversal.status).toBe(201);
      await legs((await reversal.json()).reversal.journalId, [
        ["Groceries", "CREDIT", "85000"],
        ["SBI Savings", "DEBIT", "85000"],
      ]);
      await check(11);
      const correction = await h.api(0, randomUUID(), {
        kind: "CORRECT",
        originalJournalId: cashExpense.post.journalId,
        effectiveAt: "2026-01-17T00:00:00Z",
        reason: "S09 exact correction",
        replacement: {
          effectiveAt: "2026-01-17T00:00:00Z",
          description: "Correct cash",
          legs: [
            {
              accountId: cashExpense.categoryAccountId,
              side: "DEBIT",
              currency: "INR",
              amount: "30",
            },
            { accountId: cash, side: "CREDIT", currency: "INR", amount: "30" },
          ],
        },
      });
      expect(correction.status).toBe(201);
      const fixed = await correction.json();
      await legs(fixed.reversal.journalId, [
        ["Transport", "CREDIT", "5000"],
        ["Cash", "DEBIT", "5000"],
      ]);
      await legs(fixed.replacement.journalId, [
        ["Transport", "DEBIT", "3000"],
        ["Cash", "CREDIT", "3000"],
      ]);
      await check(12);
      const backdated = await post({
        kind: "INCOME",
        accountId: bank,
        category: "Other income",
        amount: "25",
        effectiveAt: "2026-01-02T00:00:00Z",
      });
      await legs(backdated.post.journalId, [
        ["SBI Savings", "DEBIT", "2500"],
        ["Other income", "CREDIT", "2500"],
      ]);
      await check(13);
      const future = await post({
        kind: "EXPENSE",
        accountId: bank,
        category: "Groceries",
        amount: "100",
        effectiveAt: "2099-01-01T00:00:00Z",
      });
      await legs(future.post.journalId, [
        ["Groceries", "DEBIT", "10000"],
        ["SBI Savings", "CREDIT", "10000"],
      ]);
      await check(13);
      const replayBody = {
          kind: "TRANSFER",
          sourceAccountId: bank,
          destinationAccountId: other,
          amount: "1",
          effectiveAt: "2026-01-18T00:00:00Z",
        },
        key = randomUUID();
      const first = await api(replayBody, key);
      expect(first.status).toBe(201);
      const original = await first.json();
      for (const command of [
        {
          kind: "RENAME_ACCOUNT",
          accountId: bank,
          name: "Renamed canonical bank",
        },
        { kind: "ARCHIVE_ACCOUNT", accountId: bank },
      ]) {
        await h.executor!.execute(
          async () => {
            const session = await getOwnerSession(
              h.runtime.auth,
              h.runtime.config,
              new Headers({ cookie: h.cookie(0) }),
            );
            if (!session) throw Error("Missing session");
            return { ownerId: session.user.id, requestId: randomUUID() };
          },
          owner().workspace,
          randomUUID(),
          parseAccountCommand(command),
        );
      }
      const history = await overview();
      expect(
        history.transactions.find(
          (t: { operationId: string }) =>
            t.operationId === expense.post.operationId,
        ).accountName,
      ).toBe("SBI Savings");
      const before = await state();
      const retry = await api(replayBody, key);
      expect(retry.status).toBe(200);
      expect(await retry.json()).toEqual(original);
      expect(await state()).toBe(before);
      const twice = await h.api(0, randomUUID(), {
        kind: "REVERSE",
        originalJournalId: expense.post.journalId,
        effectiveAt: "2026-01-18T00:00:00Z",
        reason: "Already reversed",
      });
      expect(twice.status).toBe(409);
      expect(await state()).toBe(before);
    }, 30000);

    it.each(seeds)(
      "T02 seeded real-command properties seed=%s",
      async (seed) => {
        // Distinct accounts for every seed; deterministic amounts and equal dates.
        const bank = await create(`Seed ${seed} bank`, "BANK", "50000"),
          other = await create(`Seed ${seed} other`, "BANK", "0"),
          card = await create(`Seed ${seed} card`, "CREDIT_CARD", "1000"),
          fd = await create(`Seed ${seed} FD`, "FIXED_DEPOSIT", "1000"),
          loan = await create(`Seed ${seed} loan`, "LOAN", "1000");
        const values = samples(seed, 6);
        let step = 0;
        async function delta(
          body: Record<string, unknown>,
          changes: Record<string, bigint>,
          expense: bigint,
          net: bigint,
        ) {
          const before = await overview();
          const key = randomUUID(),
            payload = { ...body, effectiveAt: "2026-01-20T00:00:00Z" };
          try {
            const responses = await Promise.all([
              api(payload, key),
              api(payload, key),
            ]);
            expect(responses.map((r) => r.status).sort()).toEqual([200, 201]);
            const outputs = await Promise.all(responses.map((r) => r.json()));
            expect(outputs[0]).toEqual(outputs[1]);
            const after = await overview();
            for (const [id, change] of Object.entries(changes)) {
              const a = before.accounts.find(
                  (a: { id: string }) => a.id === id,
                ),
                b = after.accounts.find((a: { id: string }) => a.id === id);
              expect(BigInt(b.balanceMinor) - BigInt(a.balanceMinor)).toBe(
                change,
              );
            }
            expect(
              BigInt(after.summary.expenseMinor) -
                BigInt(before.summary.expenseMinor),
            ).toBe(expense);
            expect(
              BigInt(after.summary.incomeMinor) -
                BigInt(before.summary.incomeMinor),
            ).toBe(0n);
            expect(
              BigInt(after.totals.netWorthMinor) -
                BigInt(before.totals.netWorthMinor),
            ).toBe(net);
            const persisted = await state();
            expect(
              (await api({ ...payload, description: "changed hash" }, key))
                .status,
            ).toBe(409);
            expect(await state()).toBe(persisted);
            expect(
              (
                await h.admin.query(
                  `SELECT (SELECT count(*) FROM journal WHERE "operationId"=$1)::int journals,(SELECT count(*) FROM audit_event WHERE "operationId"=$1)::int audits FROM ledger_operation WHERE id=$1`,
                  [outputs[0].post.operationId],
                )
              ).rows,
            ).toEqual([{ journals: 1, audits: 1 }]);
            await balanced();
            step++;
            return outputs[0];
          } catch (error) {
            throw new Error(
              `Reproduce S09 schema=${schema} seed=${seed} step=${step} input=${JSON.stringify(payload)}`,
              { cause: error },
            );
          }
        }
        const [t, c, f, p, i, x] = values as [
          bigint,
          bigint,
          bigint,
          bigint,
          bigint,
          bigint,
        ];
        const transfer = await delta(
          {
            kind: "TRANSFER",
            sourceAccountId: bank,
            destinationAccountId: other,
            amount: decimal(t),
          },
          { [bank]: -t, [other]: t },
          0n,
          0n,
        );
        await delta(
          {
            kind: "CARD_SETTLEMENT",
            sourceAccountId: bank,
            destinationAccountId: card,
            amount: decimal(c),
          },
          { [bank]: -c, [card]: -c },
          0n,
          0n,
        );
        await delta(
          {
            kind: "FD_RETURN",
            sourceAccountId: fd,
            destinationAccountId: bank,
            amount: decimal(f),
          },
          { [fd]: -f, [bank]: f },
          0n,
          0n,
        );
        await delta(
          {
            kind: "FD_FUNDING",
            sourceAccountId: bank,
            destinationAccountId: fd,
            amount: decimal(x),
          },
          { [bank]: -x, [fd]: x },
          0n,
          0n,
        );
        await delta(
          {
            kind: "LOAN_REPAYMENT",
            sourceAccountId: bank,
            destinationAccountId: loan,
            principal: decimal(p),
            interest: decimal(i),
          },
          { [bank]: -p - i, [loan]: -p },
          i,
          -i,
        );
        const before = await overview();
        const reversed = await h.api(0, randomUUID(), {
          kind: "REVERSE",
          originalJournalId: transfer.post.journalId,
          effectiveAt: "2026-01-21T00:00:00Z",
          reason: `S09 seed ${seed} undo`,
        });
        expect(reversed.status).toBe(201);
        const after = await overview();
        expect(
          BigInt(
            after.accounts.find((a: { id: string }) => a.id === bank)
              .balanceMinor,
          ) -
            BigInt(
              before.accounts.find((a: { id: string }) => a.id === bank)
                .balanceMinor,
            ),
        ).toBe(t);
        expect(after.summary).toEqual(before.summary);
        expect(after.totals).toEqual(before.totals);
        await balanced();
      },
      30000,
    );

    it("T03 similar identities and invalid typed inputs cannot leak or leave effects", async () => {
      const bank = await create("Shared Savings", "BANK", "50000"),
        foreign = await create("Shared Savings", "BANK", "50000", 1),
        target = await create("Destination", "BANK", "0");
      const body = {
        kind: "TRANSFER",
        sourceAccountId: bank,
        destinationAccountId: target,
        amount: "1",
        effectiveAt: "2026-01-25T00:00:00Z",
      };
      const cases: [unknown, number | null, Record<string, string>, string?][] =
        [
          [body, null, {}],
          [body, 1, {}],
          [body, 0, { origin: "https://invalid.example" }],
          [{ ...body, ownerId: h.users[1]!.id }, 0, {}],
          [{ ...body, legs: [] }, 0, {}],
          [{ ...body, sourceAccountId: foreign }, 0, {}],
          [body, 0, {}, h.users[1]!.workspace],
          ...["0", "-1", "1.001", "10000000000000000"].map(
            (amount) =>
              [{ ...body, amount }, 0, {}] as [
                unknown,
                number,
                Record<string, string>,
              ],
          ),
          [{ ...body, sourceAccountId: "malformed" }, 0, {}],
          [{ ...body, currency: "USD" }, 0, {}],
          [{ ...body, destinationAccountId: bank }, 0, {}],
        ];
      for (const [input, user, headers, scope] of cases) {
        const before = await state();
        const r = await api(input, randomUUID(), user, headers, scope);
        expect([400, 401, 403, 404, 409]).toContain(r.status);
        expect(await state()).toBe(before);
      }
      const email = `${owner().id}@ledgerone.test`;
      h.runtime.config.allowedEmails.delete(email);
      try {
        const before = await state();
        expect((await api(body)).status).toBe(401);
        expect(await state()).toBe(before);
      } finally {
        h.runtime.config.allowedEmails.add(email);
      }
      const foreignView = await api(undefined, randomUUID(), 1);
      expect(foreignView.status).toBe(404);
      for (const stage of [
        "receipt",
        "postings",
        "audit",
        "beforeCommit",
      ] as const) {
        const before = await state();
        h.setProbe(async (s) => {
          if (s === stage) throw Error(`S09 deliberate ${stage} failure`);
        });
        try {
          expect((await api(body)).status).toBe(503);
        } finally {
          h.setProbe(undefined);
        }
        expect(await state()).toBe(before);
      }
      // Expired sessions are correctly removed by the auth library. Run last:
      // do not pretend a later UPDATE recreates an already-deleted session.
      await h.admin.query(
        `UPDATE auth_session SET "expiresAt"=timestamp '2000-01-01 00:00:00' WHERE id=$1`,
        [owner().session],
      );
      const beforeExpired = await state();
      expect((await api(body)).status).toBe(401);
      expect(await state()).toBe(beforeExpired);
      await h.admin.query("DELETE FROM auth_session WHERE id=$1", [
        h.users[1]!.session,
      ]);
      const beforeRevoked = await state();
      expect(
        (
          await api(
            { ...body, sourceAccountId: foreign },
            randomUUID(),
            1,
            {},
            h.users[1]!.workspace,
          )
        ).status,
      ).toBe(401);
      expect(await state()).toBe(beforeRevoked);
    }, 30000);
  },
);
