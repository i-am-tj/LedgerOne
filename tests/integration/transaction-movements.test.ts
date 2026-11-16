import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { postHarness } from "../support/post-harness";
import { handleTransactions } from "../../src/lib/transactions/http";
import { parseAccountCommand } from "../../src/lib/accounts/contract";

describe.each(["public", "ledgerone"] as const)(
  "S08-B %s real authenticated movements",
  (schema) => {
    let h: Awaited<ReturnType<typeof postHarness>>;
    beforeAll(async () => {
      h = await postHarness({ schema, accounts: true });
    }, 30000);
    afterAll(async () => {
      await h?.cleanup();
    });
    const date = "2026-02-15T00:00:00+05:30";
    const api = (
      data?: unknown,
      key = randomUUID(),
      user: number | null = 0,
      workspace?: string,
      executor: typeof h.executor | null = h.executor,
    ) =>
      handleTransactions(
        new Request(
          h.runtime.config.baseURL +
            "/api/transactions?workspace=" +
            (workspace ??
              h.users[data === undefined ? (user ?? 0) : 0]!.workspace),
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
    async function account(name: string, opening = "0", accountKind = "BANK") {
      const result = await h.executor!.execute(
        async () => ({ ownerId: h.users[0]!.id, requestId: randomUUID() }),
        h.users[0]!.workspace,
        randomUUID(),
        parseAccountCommand({
          kind: "CREATE_ACCOUNT",
          name,
          accountKind,
          opening,
          effectiveAt: "2026-01-01T00:00:00+05:30",
        }),
      );
      return result.result.accountId;
    }
    async function balances() {
      const r = await api();
      expect(r.status).toBe(200);
      return r.json();
    }
    const transfer = (
      source: string,
      destination: string,
      amount = "5000",
    ) => ({
      kind: "TRANSFER",
      sourceAccountId: source,
      destinationAccountId: destination,
      amount,
      effectiveAt: date,
      description: "Move savings",
    });
    async function cardSetup(effectiveAt = date) {
      const bank = await account("SBI Savings", "50000"),
        card = await account("Card", "0", "CREDIT_CARD");
      expect(
        (
          await api({
            kind: "EXPENSE",
            accountId: card,
            amount: "1200",
            category: "Groceries",
            effectiveAt,
            description: "Original card purchase",
          })
        ).status,
      ).toBe(201);
      return {
        bank,
        card,
        command: { ...transfer(bank, card, "1200"), kind: "CARD_SETTLEMENT" },
      };
    }
    const minor = (
      data: { accounts: { id: string; balanceMinor: string }[] },
      id: string,
    ) => data.accounts.find((a) => a.id === id)!.balanceMinor;
    it("transfers ₹5000 once, preserves ₹52000 assets and classification totals", async () => {
      const source = await account("SBI Savings", "50000"),
        dest = await account("HDFC Savings", "2000"),
        before = await balances();
      const r = await api(transfer(source, dest));
      expect(r.status).toBe(201);
      const result = await r.json(),
        after = await balances();
      expect(minor(after, source)).toBe("4500000");
      expect(minor(after, dest)).toBe("700000");
      expect(BigInt(minor(after, source)) + BigInt(minor(after, dest))).toBe(
        5200000n,
      );
      expect(after.summary).toEqual(before.summary);
      expect(
        after.transactions.filter(
          (t: { operationId: string }) =>
            t.operationId === result.post.operationId,
        ),
      ).toHaveLength(1);
      expect(
        after.transactions.find(
          (t: { operationId: string }) =>
            t.operationId === result.post.operationId,
        ),
      ).toMatchObject({
        kind: "TRANSFER",
        accountName: "SBI Savings",
        destinationAccountName: "HDFC Savings",
        categoryName: null,
      });
      expect(
        await h.database.transactionRecord.count({
          where: { operationId: result.post.operationId },
        }),
      ).toBe(0);
    });
    it("settles purchase debt without second expense, allows partial payments and denies overpayment/backdated pre-purchase payment", async () => {
      const { bank, card, command } = await cardSetup(),
        before = await balances();
      expect(BigInt(minor(before, bank)) - BigInt(minor(before, card))).toBe(
        4880000n,
      );
      expect(
        (
          await api({
            ...command,
            amount: "1",
            effectiveAt: "2026-02-14T00:00:00+05:30",
          })
        ).status,
      ).toBe(409);
      expect((await api({ ...command, amount: "1200.01" })).status).toBe(409);
      expect((await api({ ...command, amount: "400" })).status).toBe(201);
      expect(minor(await balances(), card)).toBe("80000");
      expect((await api({ ...command, amount: "800" })).status).toBe(201);
      const after = await balances();
      expect(minor(after, bank)).toBe("4880000");
      expect(minor(after, card)).toBe("0");
      expect(after.summary).toEqual(before.summary);
      expect((await api({ ...command, amount: "1" })).status).toBe(409);
    });
    it.each(["TRANSFER", "CARD_SETTLEMENT"])(
      "%s concurrent replay and conflicting payloads preserve exact immutable outcome after rename/archive",
      async (kind) => {
        const setup =
          kind === "CARD_SETTLEMENT"
            ? await cardSetup()
            : {
                bank: await account("Original source", "50000"),
                card: await account("Original destination", "2000"),
              };
        const command = { ...transfer(setup.bank, setup.card, "100"), kind },
          key = randomUUID();
        const responses = await Promise.all([
          api(command, key),
          api({ ...command, amount: "100.00" }, key),
        ]);
        expect(responses.map((r) => r.status).sort()).toEqual([200, 201]);
        const [first, replay] = await Promise.all(
          responses.map((r) => r.json()),
        );
        expect(replay).toEqual(first);
        if (kind === "CARD_SETTLEMENT")
          expect((await api({ ...command, amount: "1100" })).status).toBe(201);
        await h.admin.query(
          "UPDATE ledger_account SET name='Renamed',\"archivedAt\"=now() WHERE id=ANY($1::uuid[])",
          [[setup.bank, setup.card]],
        );
        const retried = await api(command, key);
        expect(retried.status).toBe(200);
        expect(await retried.json()).toEqual(first);
        expect((await api({ ...command, amount: "101" }, key)).status).toBe(
          409,
        );
        expect((await api(command)).status).toBe(409);
        expect(
          await h.database.transactionMovement.count({
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
    it("concurrent distinct-key settlements cannot both spend the same outstanding liability", async () => {
      const { card, command } = await cardSetup();
      const results = await Promise.all([
        api({ ...command, amount: "800" }),
        api({ ...command, amount: "800" }),
      ]);
      expect(results.map((r) => r.status).sort()).toEqual([201, 409]);
      expect(minor(await balances(), card)).toBe("40000");
    });
    // B-R01: admission must preserve every later posted card boundary, not
    // merely today's/final balance or the balance at the requested instant.
    const january = (day: string) => `2026-01-${day}T00:00:00+05:30`;
    const financialCounts = async () => ({
      operations: await h.database.ledgerOperation.count(),
      journals: await h.database.journal.count(),
      postings: await h.database.posting.count(),
      audits: await h.database.auditEvent.count(),
      movements: await h.database.transactionMovement.count(),
    });
    async function liabilityAt(card: string, effectiveAt: string) {
      return (
        await h.admin.query(
          `SELECT coalesce(sum(CASE p.side WHEN 'CREDIT' THEN p."nativeMinor"::numeric ELSE -p."nativeMinor"::numeric END),0)::text AS minor FROM posting p JOIN journal j ON j.id=p."journalId" WHERE p."accountId"=$1 AND j.status='POSTED' AND j."effectiveAt"<=$2::timestamptz`,
          [card, effectiveAt],
        )
      ).rows[0].minor;
    }
    async function januarySetup() {
      const setup = await cardSetup(january("01"));
      expect(
        (
          await api({
            ...setup.command,
            amount: "1000",
            effectiveAt: january("10"),
          })
        ).status,
      ).toBe(201);
      return setup;
    }
    it.each(["typed", "direct SQL"] as const)(
      "B-R01 %s rejects January5 ₹500 after January10 ₹1000, atomically",
      async (mode) => {
        const { bank, card, command } = await januarySetup();
        const before = await financialCounts(),
          key = randomUUID();
        let response: Response;
        if (mode === "typed")
          response = await api(
            { ...command, amount: "500", effectiveAt: january("05") },
            key,
          );
        else {
          h.setProbe(async (stage, client) => {
            if (stage === "beforeCommit")
              await client.query(
                'INSERT INTO transaction_movement("operationId","workspaceId","ownerId",kind,"sourceAccountId","destinationAccountId","sourceAccountName","destinationAccountName","amountMinor") SELECT id,$2,$3,\'CARD_SETTLEMENT\',$4,$5,\'SBI Savings\',\'Card\',50000 FROM ledger_operation WHERE "idempotencyKey"=$1 AND "workspaceId"=$2 AND "ownerId"=$3',
                [key, h.users[0]!.workspace, h.users[0]!.id, bank, card],
              );
          });
          try {
            response = await h.api(0, key, {
              ...h.payload(),
              effectiveAt: january("05"),
              legs: [
                {
                  accountId: card,
                  side: "DEBIT",
                  currency: "INR",
                  amount: "500",
                },
                {
                  accountId: bank,
                  side: "CREDIT",
                  currency: "INR",
                  amount: "500",
                },
              ],
            });
          } finally {
            h.setProbe(undefined);
          }
        }
        expect(response.status).toBe(mode === "typed" ? 409 : 503);
        if (mode === "typed")
          expect(await response.json()).toEqual({
            error: "card_payment_exceeds_liability",
          });
        expect(await financialCounts()).toEqual(before);
        expect(await liabilityAt(card, january("05"))).toBe("120000");
        expect(await liabilityAt(card, january("10"))).toBe("20000");
      },
    );
    it("B-R01 January5 ₹200 succeeds, leaves January10 zero and replays after metadata changes", async () => {
      const { bank, card, command } = await januarySetup(),
        key = randomUUID();
      const accepted = {
        ...command,
        amount: "200",
        effectiveAt: january("05"),
      };
      const first = await api(accepted, key);
      expect(first.status).toBe(201);
      const result = await first.json();
      expect(await liabilityAt(card, january("05"))).toBe("100000");
      expect(await liabilityAt(card, january("10"))).toBe("0");
      await h.admin.query(
        "UPDATE ledger_account SET name='Later name',\"archivedAt\"=now() WHERE id=ANY($1::uuid[])",
        [[bank, card]],
      );
      const before = await financialCounts(),
        replay = await api({ ...accepted, amount: "200.00" }, key);
      expect(replay.status).toBe(200);
      expect(await replay.json()).toEqual(result);
      expect(await financialCounts()).toEqual(before);
    });
    it("B-R01 rejects an intermediate negative boundary even when a later purchase restores the final balance", async () => {
      const { card, command } = await januarySetup();
      expect(
        (
          await api({
            kind: "EXPENSE",
            accountId: card,
            amount: "1000",
            category: "Groceries",
            effectiveAt: january("20"),
          })
        ).status,
      ).toBe(201);
      const before = await financialCounts();
      expect(
        (await api({ ...command, amount: "500", effectiveAt: january("05") }))
          .status,
      ).toBe(409);
      expect(await financialCounts()).toEqual(before);
      expect(await liabilityAt(card, january("10"))).toBe("20000");
      expect(await liabilityAt(card, january("20"))).toBe("120000");
    });
    it("B-R01 competing distinct-key/different-date settlements cannot overpay at any boundary", async () => {
      const { card, command } = await cardSetup(january("01"));
      let arrivals = 0;
      let release!: () => void;
      const ready = new Promise<void>((resolve) => {
        release = resolve;
      });
      h.setProbe(async (stage, _client, attempt) => {
        if (stage === "begin" && attempt === 1) {
          if (++arrivals === 2) release();
          await ready;
        }
      });
      let results: Response[];
      try {
        results = await Promise.all([
          api({ ...command, amount: "1000", effectiveAt: january("10") }),
          api({ ...command, amount: "500", effectiveAt: january("05") }),
        ]);
      } finally {
        release();
        h.setProbe(undefined);
      }
      expect(arrivals).toBe(2);
      expect(results.map((r) => r.status).sort()).toEqual([201, 409]);
      for (const day of ["01", "05", "10", "31"])
        expect(
          BigInt(await liabilityAt(card, january(day))),
        ).toBeGreaterThanOrEqual(0n);
      expect(
        await h.database.transactionMovement.count({
          where: { destinationAccountId: card },
        }),
      ).toBe(1);
    });
    it("B-R01 groups all postings at the same effective instant into one boundary", async () => {
      const { card, command } = await januarySetup();
      expect(
        (
          await api({
            kind: "EXPENSE",
            accountId: card,
            amount: "400",
            category: "Groceries",
            effectiveAt: january("10"),
          })
        ).status,
      ).toBe(201);
      expect(
        (await api({ ...command, amount: "500", effectiveAt: january("05") }))
          .status,
      ).toBe(201);
      expect(await liabilityAt(card, january("10"))).toBe("10000");
    });
    it("B-R01 admission does not impose a global invariant on unrelated earlier correction history", async () => {
      const { bank, card, command } = await cardSetup(january("01"));
      expect(
        (
          await h.api(0, randomUUID(), {
            ...h.payload(),
            effectiveAt: january("02"),
            legs: [
              {
                accountId: card,
                side: "DEBIT",
                currency: "INR",
                amount: "1500",
              },
              {
                accountId: bank,
                side: "CREDIT",
                currency: "INR",
                amount: "1500",
              },
            ],
          })
        ).status,
      ).toBe(201);
      expect(
        (
          await api({
            kind: "EXPENSE",
            accountId: card,
            amount: "1000",
            category: "Groceries",
            effectiveAt: january("03"),
          })
        ).status,
      ).toBe(201);
      expect(
        (await api({ ...command, amount: "200", effectiveAt: january("05") }))
          .status,
      ).toBe(201);
      expect(await liabilityAt(card, january("02"))).toBe("-30000");
      expect(await liabilityAt(card, january("05"))).toBe("50000");
    });
    it("rejects self, wrong-owner/cross-workspace, archive, currency, kind and forged requests without effects", async () => {
      const bank = await account("Allowed bank", "50000"),
        dest = await account("Allowed destination");
      const usd = randomUUID();
      await h.admin.query(
        "INSERT INTO ledger_account(id,\"workspaceId\",\"ownerId\",name,type,kind,\"currencyCode\",\"updatedAt\") VALUES($1,$2,$3,'USD','ASSET','BANK','USD',now())",
        [usd, h.users[0]!.workspace, h.users[0]!.id],
      );
      const before = await h.database.ledgerOperation.count(),
        command = transfer(bank, dest);
      expect((await api(transfer(bank, bank))).status).toBe(400);
      expect((await api(transfer(bank, h.users[1]!.bank))).status).toBe(404);
      expect((await api(command, randomUUID(), 1)).status).toBe(404);
      expect(
        (await api(command, randomUUID(), 0, h.users[1]!.workspace)).status,
      ).toBe(404);
      expect((await api(transfer(bank, usd))).status).toBe(409);
      expect((await api(transfer(bank, h.users[0]!.card))).status).toBe(400);
      expect((await api({ ...command, kind: "CARD_SETTLEMENT" })).status).toBe(
        400,
      );
      expect((await api({ ...command, ownerId: h.users[1]!.id })).status).toBe(
        400,
      );
      expect((await api({ ...command, legs: [] })).status).toBe(400);
      expect((await api(command, randomUUID(), null)).status).toBe(401);
      expect(
        (await api(command, randomUUID(), 0, undefined, null)).status,
      ).toBe(503);
      await h.admin.query(
        'UPDATE ledger_account SET "archivedAt"=now() WHERE id=$1',
        [dest],
      );
      expect((await api(command)).status).toBe(409);
      expect(await h.database.ledgerOperation.count()).toBe(before);
      const other = await (await api(undefined, randomUUID(), 1)).json();
      expect(other.transactions).toEqual([]);
    });
    it.each(["receipt", "postings", "audit", "beforeCommit"] as const)(
      "%s failure rolls back every movement effect",
      async (stage) => {
        const bank = await account("Atomic source", "50000"),
          dest = await account("Atomic destination"),
          before = await balances();
        const counts = {
          operations: await h.database.ledgerOperation.count(),
          movements: await h.database.transactionMovement.count(),
          audits: await h.database.auditEvent.count(),
        };
        h.setProbe(async (s) => {
          if (s === stage) throw Error("Injected movement failure");
        });
        try {
          expect((await api(transfer(bank, dest))).status).toBe(503);
        } finally {
          h.setProbe(undefined);
        }
        expect({
          operations: await h.database.ledgerOperation.count(),
          movements: await h.database.transactionMovement.count(),
          audits: await h.database.auditEvent.count(),
        }).toEqual(counts);
        expect(minor(await balances(), bank)).toBe(minor(before, bank));
        expect(minor(await balances(), dest)).toBe("0");
      },
    );
    it.each(["TRANSFER", "CARD_SETTLEMENT"] as const)(
      "%s deferred context guard rejects forged direct-SQL evidence atomically",
      async (kind) => {
        const setup =
          kind === "CARD_SETTLEMENT"
            ? await cardSetup()
            : {
                bank: h.users[0]!.bank,
                card: await account("False destination"),
              };
        const key = randomUUID(),
          before = {
            ops: await h.database.ledgerOperation.count(),
            audits: await h.database.auditEvent.count(),
            movements: await h.database.transactionMovement.count(),
          };
        h.setProbe(async (stage, client) => {
          if (stage === "beforeCommit")
            await client.query(
              'INSERT INTO transaction_movement("operationId","workspaceId","ownerId",kind,"sourceAccountId","destinationAccountId","sourceAccountName","destinationAccountName","amountMinor") SELECT id,$2,$3,$4,$5,$6,\'Source\',\'Destination\',$7 FROM ledger_operation WHERE "idempotencyKey"=$1 AND "workspaceId"=$2 AND "ownerId"=$3',
              [
                key,
                h.users[0]!.workspace,
                h.users[0]!.id,
                kind,
                setup.bank,
                setup.card,
                kind === "CARD_SETTLEMENT" ? "200000" : "1000",
              ],
            );
        });
        const payload =
          kind === "CARD_SETTLEMENT"
            ? {
                ...h.payload(),
                effectiveAt: date,
                legs: [
                  {
                    accountId: setup.card,
                    side: "DEBIT",
                    currency: "INR",
                    amount: "2000",
                  },
                  {
                    accountId: setup.bank,
                    side: "CREDIT",
                    currency: "INR",
                    amount: "2000",
                  },
                ],
              }
            : h.payload();
        try {
          expect((await h.api(0, key, payload)).status).toBe(503);
        } finally {
          h.setProbe(undefined);
        }
        expect({
          ops: await h.database.ledgerOperation.count(),
          audits: await h.database.auditEvent.count(),
          movements: await h.database.transactionMovement.count(),
        }).toEqual(before);
      },
    );
    it("movement context cannot be changed or deleted after posting", async () => {
      const source = await account("Immutable source", "10"),
        dest = await account("Immutable destination");
      const saved = await (await api(transfer(source, dest, "1"))).json();
      for (const sql of [
        'UPDATE transaction_movement SET "sourceAccountName"=\'False history\' WHERE "operationId"=$1',
        'DELETE FROM transaction_movement WHERE "operationId"=$1',
      ])
        await expect(
          h.admin.query(sql, [saved.post.operationId]),
        ).rejects.toMatchObject({ code: "23514" });
    });
    it("lost acknowledgement recovers one transfer and maximum quantities remain exact", async () => {
      const bank = await account("Maximum source", "9999999999999999.99"),
        dest = await account("Maximum destination"),
        command = transfer(bank, dest, "9999999999999999.99"),
        key = randomUUID();
      h.setProbe(async (s) => {
        if (s === "committed") throw Error("Lost response");
      });
      let failed;
      try {
        failed = await api(command, key);
      } finally {
        h.setProbe(undefined);
      }
      expect(failed!.status).toBe(503);
      const replay = await api(command, key);
      expect(replay.status).toBe(200);
      const result = await replay.json();
      expect(result.amountMinor).toBe("999999999999999999");
      const after = await balances();
      expect(minor(after, bank)).toBe("0");
      expect(minor(after, dest)).toBe("999999999999999999");
    });
  },
);
