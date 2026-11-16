import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { postHarness } from "../support/post-harness";
import { handleTransactions } from "../../src/lib/transactions/http";
import { parseAccountCommand } from "../../src/lib/accounts/contract";

describe.each(["public", "ledgerone"] as const)(
  "S08-C %s authenticated capital transactions",
  (schema) => {
    let h: Awaited<ReturnType<typeof postHarness>>;
    beforeAll(async () => {
      h = await postHarness({ schema, accounts: true });
    }, 30000);
    afterAll(async () => {
      await h?.cleanup();
    });
    const day = (n: string) => `2026-01-${n}T00:00:00+05:30`;
    const api = (
      data?: unknown,
      key: string = randomUUID(),
      user: number | null = 0,
      workspace = h.users[user ?? 0]!.workspace,
      executor: typeof h.executor | null = h.executor,
    ) =>
      handleTransactions(
        new Request(
          h.runtime.config.baseURL + "/api/transactions?workspace=" + workspace,
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
        h.database,
        executor,
        schema,
      );
    async function account(
      name: string,
      kind = "BANK",
      opening = "0",
      user = 0,
    ) {
      return (
        await h.executor!.execute(
          async () => ({ ownerId: h.users[user]!.id, requestId: randomUUID() }),
          h.users[user]!.workspace,
          randomUUID(),
          parseAccountCommand({
            kind: "CREATE_ACCOUNT",
            name,
            accountKind: kind,
            opening,
            effectiveAt: day("01"),
          }),
        )
      ).result.accountId;
    }
    async function read(user = 0) {
      const r = await api(undefined, randomUUID(), user);
      expect(r.status).toBe(200);
      return r.json();
    }
    const balance = (
      d: { accounts: { id: string; balanceMinor: string }[] },
      id: string,
    ) => d.accounts.find((a) => a.id === id)!.balanceMinor;
    const counts = async () => ({
      ops: await h.database.ledgerOperation.count(),
      journals: await h.database.journal.count(),
      postings: await h.database.posting.count(),
      audits: await h.database.auditEvent.count(),
      contexts: await h.database.transactionCapital.count(),
      accounts: await h.database.account.count(),
    });
    const fdCommand = (
      kind: "FD_FUNDING" | "FD_RETURN",
      source: string,
      dest: string,
      amount = "10000",
    ) => ({
      kind,
      sourceAccountId: source,
      destinationAccountId: dest,
      amount,
      effectiveAt: day("05"),
      description: "Principal movement",
    });
    const loanCommand = (
      source: string,
      dest: string,
      principal = "5000",
      interest = "600",
    ) => ({
      kind: "LOAN_REPAYMENT",
      sourceAccountId: source,
      destinationAccountId: dest,
      principal,
      interest,
      effectiveAt: day("05"),
      description: "Loan payment",
    });
    it("FD funding10000 and new principal return preserve50000 assets and original posted funding", async () => {
      const bank = await account("SBI Savings", "BANK", "50000"),
        fd = await account("Term deposit", "FIXED_DEPOSIT"),
        before = await read();
      const saved = await api(fdCommand("FD_FUNDING", bank, fd));
      expect(saved.status).toBe(201);
      const funding = await saved.json();
      let state = await read();
      expect(balance(state, bank)).toBe("4000000");
      expect(balance(state, fd)).toBe("1000000");
      expect(BigInt(balance(state, bank)) + BigInt(balance(state, fd))).toBe(
        5000000n,
      );
      expect(state.summary).toEqual(before.summary);
      const returned = await api(fdCommand("FD_RETURN", fd, bank));
      expect(returned.status).toBe(201);
      expect((await returned.json()).post.operationId).not.toBe(
        funding.post.operationId,
      );
      state = await read();
      expect(balance(state, bank)).toBe("5000000");
      expect(balance(state, fd)).toBe("0");
      expect(state.summary).toEqual(before.summary);
      const j = await h.database.journal.findUniqueOrThrow({
        where: { id: funding.post.journalId },
      });
      expect(j.status).toBe("POSTED");
      expect(j.reversesJournalId).toBeNull();
      expect(
        await h.database.transactionCapital.count({
          where: { operationId: funding.post.operationId },
        }),
      ).toBe(1);
    });
    it("loan5000 principal +600 interest posts exact three legs, consumption600 and net-worth loss600", async () => {
      const bank = await account("SBI Savings", "BANK", "50000"),
        loan = await account("Education loan", "LOAN", "20000"),
        before = await read();
      const saved = await api(loanCommand(bank, loan));
      expect(saved.status).toBe(201);
      const result = await saved.json(),
        after = await read();
      expect([
        result.principalMinor,
        result.interestMinor,
        result.amountMinor,
      ]).toEqual(["500000", "60000", "560000"]);
      expect(balance(after, bank)).toBe("4440000");
      expect(balance(after, loan)).toBe("1500000");
      expect(BigInt(balance(after, bank)) - BigInt(balance(after, loan))).toBe(
        2940000n,
      );
      expect(
        BigInt(after.summary.expenseMinor) -
          BigInt(before.summary.expenseMinor),
      ).toBe(60000n);
      expect(after.summary.incomeMinor).toBe(before.summary.incomeMinor);
      const legs = await h.database.posting.findMany({
        where: { journalId: result.post.journalId },
        include: { account: true },
      });
      expect(legs).toHaveLength(3);
      expect(legs.find((p) => p.accountId === bank)).toMatchObject({
        side: "CREDIT",
        nativeMinor: 560000n,
      });
      expect(legs.find((p) => p.accountId === loan)).toMatchObject({
        side: "DEBIT",
        nativeMinor: 500000n,
      });
      expect(legs.find((p) => p.account.type === "EXPENSE")).toMatchObject({
        side: "DEBIT",
        nativeMinor: 60000n,
      });
      expect(
        legs.reduce(
          (n, p) =>
            n + (p.side === "DEBIT" ? p.functionalMinor : -p.functionalMinor),
          0n,
        ),
      ).toBe(0n);
    });
    it("zero-interest principal repayment has two legs and no zero expense/classification side effect", async () => {
      const bank = await account("Zero interest payer", "BANK", "50000"),
        loan = await account("Zero interest loan", "LOAN", "20000"),
        before = await read(),
        n = await h.database.account.count();
      const r = await api(loanCommand(bank, loan, "5000", "0"));
      expect(r.status).toBe(201);
      const saved = await r.json();
      expect(saved.interestAccountId).toBeNull();
      expect(saved.interestAccountName).toBeNull();
      expect(
        await h.database.posting.count({
          where: { journalId: saved.post.journalId },
        }),
      ).toBe(2);
      expect(await h.database.account.count()).toBe(n);
      expect((await read()).summary).toEqual(before.summary);
    });
    it.each(["FD_FUNDING", "FD_RETURN", "LOAN_REPAYMENT"] as const)(
      "%s concurrent same-key replay, conflict and metadata-independent snapshots",
      async (kind) => {
        const bank = await account("Original bank", "BANK", "50000"),
          other = await account(
            "Original principal account",
            kind === "LOAN_REPAYMENT" ? "LOAN" : "FIXED_DEPOSIT",
            "20000",
          );
        const command =
            kind === "LOAN_REPAYMENT"
              ? loanCommand(bank, other)
              : fdCommand(
                  kind,
                  kind === "FD_RETURN" ? other : bank,
                  kind === "FD_RETURN" ? bank : other,
                  "5000",
                ),
          key = randomUUID();
        const responses = await Promise.all([
          api(command, key),
          api(command, key),
        ]);
        expect(responses.map((r) => r.status).sort()).toEqual([200, 201]);
        const [first, second] = await Promise.all(
          responses.map((r) => r.json()),
        );
        expect(first).toEqual(second);
        if (kind === "LOAN_REPAYMENT")
          expect(
            (await api(loanCommand(bank, other, "15000", "0"))).status,
          ).toBe(201);
        if (kind === "FD_RETURN")
          expect(
            (await api(fdCommand(kind, other, bank, "15000"))).status,
          ).toBe(201);
        await h.admin.query(
          "UPDATE ledger_account SET name='Later name',\"archivedAt\"=now() WHERE id=ANY($1::uuid[])",
          [[bank, other]],
        );
        const replay = await api(command, key);
        expect(replay.status).toBe(200);
        expect(await replay.json()).toEqual(first);
        const changed =
          kind === "LOAN_REPAYMENT"
            ? { ...command, principal: "5100", interest: "500" }
            : { ...command, amount: "5001" };
        expect((await api(changed, key)).status).toBe(409);
        expect((await api(command)).status).toBe(409);
        expect(
          await h.database.transactionCapital.count({
            where: { operationId: first.post.operationId },
          }),
        ).toBe(1);
        expect(
          await h.database.auditEvent.count({
            where: { operationId: first.post.operationId },
          }),
        ).toBe(1);
      },
    );
    it.each(["FD_RETURN", "LOAN_REPAYMENT"] as const)(
      "%s enforces later-boundary principal floor, including concurrent different-date attempts",
      async (kind) => {
        const bank = await account("Principal payer", "BANK", "50000"),
          other = await account(
            "Principal account",
            kind === "FD_RETURN" ? "FIXED_DEPOSIT" : "LOAN",
            "1200",
          );
        const cmd = (amount: string, date: string) => ({
          ...(kind === "FD_RETURN"
            ? fdCommand(kind, other, bank, amount)
            : loanCommand(bank, other, amount, "0")),
          effectiveAt: day(date),
        });
        expect((await api(cmd("1000", "10"))).status).toBe(201);
        const before = await counts();
        expect((await api(cmd("500", "05"))).status).toBe(409);
        expect(await counts()).toEqual(before);
        expect((await api(cmd("200", "05"))).status).toBe(201);
        expect(balance(await read(), other)).toBe("0");
        const fresh = await account(
          "Concurrent principal",
          kind === "FD_RETURN" ? "FIXED_DEPOSIT" : "LOAN",
          "1200",
        );
        const freshCmd = (amount: string, date: string) => ({
          ...(kind === "FD_RETURN"
            ? fdCommand(kind, fresh, bank, amount)
            : loanCommand(bank, fresh, amount, "0")),
          effectiveAt: day(date),
        });
        const concurrent = await Promise.all([
          api(freshCmd("1000", "10")),
          api(freshCmd("500", "05")),
        ]);
        expect(concurrent.map((r) => r.status).sort()).toEqual([201, 409]);
        expect(BigInt(balance(await read(), fresh))).toBeGreaterThanOrEqual(0n);
      },
    );
    it("rejects forged/foreign/workspace/kind/archive/currency/disabled commands with zero effects", async () => {
      const bank = await account("Valid payer", "BANK", "50000"),
        fd = await account("FD", "FIXED_DEPOSIT"),
        loan = await account("Loan", "LOAN", "20000");
      const usd = randomUUID();
      await h.admin.query(
        "INSERT INTO ledger_account(id,\"workspaceId\",\"ownerId\",name,type,kind,\"currencyCode\",\"updatedAt\") VALUES($1,$2,$3,'USD','ASSET','FIXED_DEPOSIT','USD',now())",
        [usd, h.users[0]!.workspace, h.users[0]!.id],
      );
      const before = await counts();
      for (const [body, status] of [
        [fdCommand("FD_FUNDING", bank, bank), 400],
        [fdCommand("FD_FUNDING", bank, h.users[1]!.bank), 404],
        [fdCommand("FD_FUNDING", bank, usd), 409],
        [fdCommand("FD_FUNDING", bank, loan), 400],
        [fdCommand("FD_RETURN", bank, fd), 400],
        [loanCommand(bank, fd), 400],
        [{ ...loanCommand(bank, loan), ownerId: h.users[1]!.id }, 400],
        [{ ...fdCommand("FD_FUNDING", bank, fd), interest: "100" }, 400],
        [{ ...loanCommand(bank, loan), amount: "5600" }, 400],
        [{ kind: "POST", legs: [] }, 400],
      ] as const)
        expect((await api(body)).status).toBe(status);
      expect(
        (
          await api(
            fdCommand("FD_FUNDING", bank, fd),
            randomUUID(),
            1,
            h.users[0]!.workspace,
          )
        ).status,
      ).toBe(404);
      expect(
        (
          await api(
            fdCommand("FD_FUNDING", bank, fd),
            randomUUID(),
            0,
            h.users[1]!.workspace,
          )
        ).status,
      ).toBe(404);
      expect(
        (await api(fdCommand("FD_FUNDING", bank, fd), randomUUID(), null))
          .status,
      ).toBe(401);
      expect(
        (
          await api(
            fdCommand("FD_FUNDING", bank, fd),
            randomUUID(),
            0,
            undefined,
            null,
          )
        ).status,
      ).toBe(503);
      await h.admin.query(
        'UPDATE ledger_account SET "archivedAt"=now() WHERE id=$1',
        [fd],
      );
      expect((await api(fdCommand("FD_FUNDING", bank, fd))).status).toBe(409);
      expect(await counts()).toEqual(before);
      expect((await read(1)).transactions).toEqual([]);
    });
    it.each(["receipt", "postings", "audit", "beforeCommit"] as const)(
      "%s loan failure rolls back interest classification and all financial effects",
      async (stage) => {
        const bank = await account("Atomic payer", "BANK", "50000", 1),
          loan = await account("Atomic loan", "LOAN", "20000", 1),
          before = await counts();
        h.setProbe(async (s) => {
          if (s === stage) throw Error("Injected capital failure");
        });
        try {
          expect(
            (await api(loanCommand(bank, loan), randomUUID(), 1)).status,
          ).toBe(503);
        } finally {
          h.setProbe(undefined);
        }
        expect(await counts()).toEqual(before);
      },
    );
    it.each(["FD_FUNDING", "FD_RETURN", "LOAN_REPAYMENT"] as const)(
      "%s lost acknowledgement recovers one immutable outcome",
      async (kind) => {
        const bank = await account("Recovery bank", "BANK", "50000"),
          other = await account(
            "Recovery principal",
            kind === "LOAN_REPAYMENT" ? "LOAN" : "FIXED_DEPOSIT",
            "20000",
          ),
          command =
            kind === "LOAN_REPAYMENT"
              ? loanCommand(bank, other)
              : fdCommand(
                  kind,
                  kind === "FD_RETURN" ? other : bank,
                  kind === "FD_RETURN" ? bank : other,
                  "5000",
                ),
          key = randomUUID();
        h.setProbe(async (s) => {
          if (s === "committed") throw Error("Lost capital acknowledgement");
        });
        try {
          expect((await api(command, key)).status).toBe(503);
        } finally {
          h.setProbe(undefined);
        }
        const recovered = await api(command, key);
        expect(recovered.status).toBe(200);
        const result = await recovered.json();
        expect(
          await h.database.transactionCapital.count({
            where: { operationId: result.post.operationId },
          }),
        ).toBe(1);
        expect(
          await h.database.auditEvent.count({
            where: { operationId: result.post.operationId },
          }),
        ).toBe(1);
      },
    );
    it.each(["FD_RETURN", "LOAN_REPAYMENT"] as const)(
      "%s direct-SQL later-boundary over-return/overpayment rolls back completely",
      async (kind) => {
        const bank = await account("SQL payer", "BANK", "50000"),
          other = await account(
            "SQL principal",
            kind === "FD_RETURN" ? "FIXED_DEPOSIT" : "LOAN",
            "1200",
          );
        const valid = {
          ...(kind === "FD_RETURN"
            ? fdCommand(kind, other, bank, "1000")
            : loanCommand(bank, other, "1000", "0")),
          effectiveAt: day("10"),
        };
        expect((await api(valid)).status).toBe(201);
        const key = randomUUID(),
          before = await counts();
        const source = kind === "FD_RETURN" ? other : bank,
          dest = kind === "FD_RETURN" ? bank : other;
        h.setProbe(async (stage, c) => {
          if (stage === "beforeCommit")
            await c.query(
              'INSERT INTO transaction_capital("operationId","workspaceId","ownerId",kind,"sourceAccountId","destinationAccountId","sourceAccountName","destinationAccountName","principalMinor","interestMinor","amountMinor") SELECT id,$2,$3,$4,$5,$6,\'Source\',\'Destination\',50000,0,50000 FROM ledger_operation WHERE "idempotencyKey"=$1 AND "workspaceId"=$2 AND "ownerId"=$3',
              [key, h.users[0]!.workspace, h.users[0]!.id, kind, source, dest],
            );
        });
        try {
          expect(
            (
              await h.api(0, key, {
                ...h.payload(),
                effectiveAt: day("05"),
                legs: [
                  {
                    accountId: source,
                    side: "CREDIT",
                    currency: "INR",
                    amount: "500",
                  },
                  {
                    accountId: dest,
                    side: "DEBIT",
                    currency: "INR",
                    amount: "500",
                  },
                ],
              })
            ).status,
          ).toBe(503);
        } finally {
          h.setProbe(undefined);
        }
        expect(await counts()).toEqual(before);
      },
    );
    it("direct-SQL malformed loan components fail atomically and business context is immutable", async () => {
      const bank = await account("SQL bank", "BANK", "50000"),
        loan = await account("SQL loan", "LOAN", "20000"),
        key = randomUUID(),
        before = await counts();
      h.setProbe(async (stage, c) => {
        if (stage === "beforeCommit")
          await c.query(
            'INSERT INTO transaction_capital("operationId","workspaceId","ownerId",kind,"sourceAccountId","destinationAccountId","sourceAccountName","destinationAccountName","interestAccountId","interestAccountName","principalMinor","interestMinor","amountMinor") SELECT id,$2,$3,\'LOAN_REPAYMENT\',$4,$5,\'Bank\',\'Loan\',$6,\'Interest\',500000,60000,560000 FROM ledger_operation WHERE "idempotencyKey"=$1 AND "workspaceId"=$2 AND "ownerId"=$3',
            [
              key,
              h.users[0]!.workspace,
              h.users[0]!.id,
              bank,
              loan,
              h.users[0]!.expense,
            ],
          );
      });
      try {
        expect(
          (
            await h.api(0, key, {
              ...h.payload(),
              effectiveAt: day("05"),
              legs: [
                {
                  accountId: bank,
                  side: "CREDIT",
                  currency: "INR",
                  amount: "5700",
                },
                {
                  accountId: loan,
                  side: "DEBIT",
                  currency: "INR",
                  amount: "5000",
                },
                {
                  accountId: h.users[0]!.expense,
                  side: "DEBIT",
                  currency: "INR",
                  amount: "700",
                },
              ],
            })
          ).status,
        ).toBe(503);
      } finally {
        h.setProbe(undefined);
      }
      expect(await counts()).toEqual(before);
      const valid = await (await api(loanCommand(bank, loan))).json();
      for (const sql of [
        'UPDATE transaction_capital SET "principalMinor"=1 WHERE "operationId"=$1',
        'DELETE FROM transaction_capital WHERE "operationId"=$1',
      ])
        await expect(
          h.admin.query(sql, [valid.post.operationId]),
        ).rejects.toMatchObject({ code: "23514" });
    });
    it("maximum exact total is accepted without precision loss; overflowing combined payment is rejected", async () => {
      const bank = await account("Maximum bank", "BANK", "9999999999999999.99"),
        loan = await account("Maximum loan", "LOAN", "9999999999999999.98");
      const before = await counts();
      expect(
        (await api(loanCommand(bank, loan, "9999999999999999.99", "0.01")))
          .status,
      ).toBe(400);
      expect(await counts()).toEqual(before);
      const response = await api(
        loanCommand(bank, loan, "9999999999999999.98", "0.01"),
      );
      expect(response.status).toBe(201);
      const result = await response.json();
      expect(result.amountMinor).toBe("999999999999999999");
      const state = await read();
      expect(balance(state, bank)).toBe("0");
      expect(balance(state, loan)).toBe("0");
    });
  },
);
