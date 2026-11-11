import { randomUUID, createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import pg from "pg";
import { beforeAll, afterAll, describe, it, expect } from "vitest";
import { testDatabase, testDatabaseURL } from "../support/database";
import { CHART, type AccountKind } from "../../src/lib/ledger/chart";
import { CURRENCIES, MAX_MINOR } from "../../src/lib/ledger/money";
import {
  listAccounts,
  readAccount,
  readPostedJournal,
} from "../../src/lib/ledger/queries";

const db = testDatabase();
const pool = new pg.Pool({
  connectionString: testDatabaseURL(),
  max: 6,
  connectionTimeoutMillis: 3000,
});
type Scope = { ownerId: string; workspaceId: string };
type Leg = {
  account: string;
  side: "DEBIT" | "CREDIT";
  amount: bigint;
  currency?: string;
  native?: bigint;
  ownerId?: string;
  workspaceId?: string;
};
const scopes: Scope[] = [0, 1].map(() => ({
  ownerId: randomUUID(),
  workspaceId: randomUUID(),
}));
const accounts = {} as Record<AccountKind, string>;
let otherBank: string;
let originalId: string;
const effective = new Date("2026-01-01T00:00:00Z");
async function transaction<T>(
  work: (client: pg.PoolClient) => Promise<T>,
  isolation = "READ COMMITTED",
): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query(`BEGIN ISOLATION LEVEL ${isolation}`);
    const result = await work(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}
async function account(
  scope: Scope,
  kind: AccountKind = "BANK",
  currency = "INR",
) {
  const row = await db.account.create({
    data: {
      ...scope,
      name: "Schema fixture",
      type: CHART[kind],
      kind,
      currencyCode: currency,
    },
  });
  return row.id;
}
async function draft(
  client: pg.PoolClient,
  scope: Scope,
  legs: Leg[],
  kind = "GENERAL",
  reverses: string | null = null,
) {
  const id = randomUUID();
  await client.query(
    'INSERT INTO journal (id,"workspaceId","ownerId","effectiveAt",kind,"reversesJournalId") VALUES ($1,$2,$3,$4,$5,$6)',
    [id, scope.workspaceId, scope.ownerId, effective, kind, reverses],
  );
  for (const leg of legs)
    await client.query(
      'INSERT INTO posting (id,"journalId","workspaceId","ownerId","accountId","currencyCode",side,"nativeMinor","functionalMinor") VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)',
      [
        randomUUID(),
        id,
        leg.workspaceId ?? scope.workspaceId,
        leg.ownerId ?? scope.ownerId,
        leg.account,
        leg.currency ?? "INR",
        leg.side,
        (leg.native ?? leg.amount).toString(),
        leg.amount.toString(),
      ],
    );
  return id;
}
async function receipt(
  client: pg.PoolClient,
  scope: Scope,
  kind = "POST",
  key: string = randomUUID(),
) {
  const id = randomUUID();
  await client.query(
    'INSERT INTO ledger_operation (id,"workspaceId","ownerId","idempotencyKey","requestHash",kind) VALUES ($1,$2,$3,$4,$5,$6)',
    [id, scope.workspaceId, scope.ownerId, key, "a".repeat(64), kind],
  );
  return id;
}
async function finalize(
  client: pg.PoolClient,
  scope: Scope,
  id: string,
  kind = "POST",
  key?: string,
) {
  const op = await receipt(client, scope, kind, key);
  await client.query(
    'UPDATE journal SET status=\'POSTED\',"postedAt"=CURRENT_TIMESTAMP,"operationId"=$1 WHERE id=$2',
    [op, id],
  );
  return op;
}
function expense(amount = 100n): Leg[] {
  return [
    { account: accounts.EXPENSE, side: "DEBIT", amount },
    { account: accounts.BANK, side: "CREDIT", amount },
  ];
}
async function posted(
  scope = scopes[0]!,
  legs = expense(),
  kind = "GENERAL",
  reverses: string | null = null,
  marker?: string,
  key?: string,
) {
  return transaction(async (c) => {
    const id = await draft(c, scope, legs, kind, reverses);
    if (marker)
      await c.query(
        'INSERT INTO opening_balance (id,"workspaceId","ownerId","accountId","journalId",source) VALUES ($1,$2,$3,$4,$5,$6)',
        [
          randomUUID(),
          scope.workspaceId,
          scope.ownerId,
          marker,
          id,
          "Statement fixture",
        ],
      );
    const op = await finalize(
      c,
      scope,
      id,
      kind === "GENERAL" ? "POST" : kind === "OPENING" ? "OPENING" : "REVERSE",
      key,
    );
    return { id, op };
  });
}
beforeAll(async () => {
  for (const scope of scopes)
    await db.user.create({
      data: {
        id: scope.ownerId,
        name: "Ledger fixture",
        email: `${scope.ownerId}@ledgerone.test`,
        emailVerified: true,
        workspace: {
          create: { id: scope.workspaceId, name: "Ledger schema fixture" },
        },
      },
    });
  for (const kind of Object.keys(CHART) as AccountKind[])
    accounts[kind] = await account(scopes[0]!, kind);
  otherBank = await account(scopes[1]!);
  originalId = (await posted()).id;
});
afterAll(async () => {
  await pool.end();
  await db.$disconnect();
});

describe("P1-S05 owned exact ledger constraints", () => {
  it("matches reference currency scales and every chart kind/class", async () => {
    const rows = await db.currency.findMany();
    expect(Object.fromEntries(rows.map((c) => [c.code, c.scale]))).toEqual(
      CURRENCIES,
    );
    expect(
      await db.account.count({ where: { ownerId: scopes[0]!.ownerId } }),
    ).toBe(Object.keys(CHART).length);
    await expect(
      db.account.create({
        data: {
          ...scopes[0]!,
          name: "Wrong kind",
          type: "EXPENSE",
          kind: "CREDIT_CARD",
          currencyCode: "INR",
        },
      }),
    ).rejects.toThrow();
  });
  it("commits balanced minor units above the JS safe range and serializes DTOs as strings", async () => {
    const { id } = await posted(scopes[0], expense(9007199254740993n));
    const row = await readPostedJournal(
      db,
      { ownerId: scopes[0]!.ownerId, requestId: randomUUID() },
      id,
    );
    expect(row.postings.map((p) => p.functionalMinor)).toEqual([
      "9007199254740993",
      "9007199254740993",
    ]);
    expect(() => JSON.stringify(row)).not.toThrow();
    expect(await db.journal.findUniqueOrThrow({ where: { id } })).toMatchObject(
      { status: "POSTED", functionalCurrencyCode: "INR" },
    );
  });
  it.each([
    { values: [] },
    { values: [{ side: "DEBIT" as const, amount: 100n }] },
    {
      values: [
        { side: "DEBIT" as const, amount: 100n },
        { side: "CREDIT" as const, amount: 99n },
      ],
    },
  ])(
    "rejects invalid committed balance and rolls all rows/receipt back",
    async ({ values }) => {
      let id = "";
      let op = "";
      await expect(
        transaction(async (c) => {
          id = await draft(
            c,
            scopes[0]!,
            values.map((v, i) => ({
              ...v,
              account: i === 0 ? accounts.EXPENSE : accounts.BANK,
            })),
          );
          op = await finalize(c, scopes[0]!, id);
        }),
      ).rejects.toMatchObject({ code: "23514" });
      expect(await db.journal.count({ where: { id } })).toBe(0);
      if (op)
        expect(await db.ledgerOperation.count({ where: { id: op } })).toBe(0);
    },
  );
  it.each([0n, -1n, MAX_MINOR + 1n])(
    "rejects zero/negative/out-of-contract minor units %s",
    async (amount) => {
      await expect(
        transaction((c) => draft(c, scopes[0]!, expense(amount))),
      ).rejects.toMatchObject({ code: "23514" });
    },
  );
  it("keeps drafts outside posted reads and protects owner scope at read boundaries", async () => {
    const id = await transaction((c) => draft(c, scopes[0]!, [expense()[0]!]));
    const actorA = { ownerId: scopes[0]!.ownerId, requestId: randomUUID() };
    const actorB = { ...actorA, ownerId: scopes[1]!.ownerId };
    await expect(readPostedJournal(db, actorA, id)).rejects.toMatchObject({
      status: 404,
    });
    await expect(
      readPostedJournal(db, actorB, originalId),
    ).rejects.toMatchObject({ status: 404 });
    await expect(readAccount(db, actorA, otherBank)).rejects.toMatchObject({
      status: 404,
    });
    await expect(readAccount(db, actorA, randomUUID())).rejects.toMatchObject({
      status: 404,
    });
    expect(
      (await listAccounts(db, actorA)).every(
        (a) => a.workspaceId === scopes[0]!.workspaceId,
      ),
    ).toBe(true);
    expect((await listAccounts(db, actorB)).map((a) => a.id)).toEqual([
      otherBank,
    ]);
    expect(() =>
      listAccounts(db, { ownerId: "", requestId: randomUUID() }),
    ).toThrow("unauthorized");
  });
  it("blocks cross-owner account/journal links and incompatible account currencies", async () => {
    for (const legs of [
      [
        { account: otherBank, side: "DEBIT" as const, amount: 100n },
        expense()[1]!,
      ],
      [{ ...expense()[0]!, ownerId: scopes[1]!.ownerId }, expense()[1]!],
    ])
      await expect(
        transaction((c) => draft(c, scopes[0]!, legs)),
      ).rejects.toMatchObject({ code: "23503" });
    const euro = await account(scopes[0]!, "BANK", "EUR");
    await expect(
      transaction((c) =>
        draft(c, scopes[0]!, [
          { account: euro, side: "DEBIT", amount: 100n },
          expense()[1]!,
        ]),
      ),
    ).rejects.toMatchObject({ code: "23503" });
    await expect(
      db.account.create({
        data: {
          ...scopes[0]!,
          ownerId: scopes[1]!.ownerId,
          name: "Stolen",
          type: "ASSET",
          kind: "BANK",
          currencyCode: "INR",
        },
      }),
    ).rejects.toThrow();
  });
  it("stores immutable owned manual quotes and foreign accounts, but refuses foreign posting", async () => {
    const euro = await account(scopes[0]!, "BANK", "EUR");
    const rate = await db.fXRate.create({
      data: {
        ...scopes[0]!,
        nativeCurrencyCode: "EUR",
        quote: "90.123456789012345678",
        effectiveAt: effective,
        source: "Manual fixture",
      },
    });
    expect(rate.quote.toFixed(18)).toBe("90.123456789012345678");
    await expect(
      db.fXRate.update({ where: { id: rate.id }, data: { quote: "91" } }),
    ).rejects.toThrow();
    await expect(
      db.fXRate.delete({ where: { id: rate.id } }),
    ).rejects.toThrow();
    for (const quote of ["0", "-1", "1000000000000", "NaN"])
      await expect(
        db.fXRate.create({
          data: {
            ...scopes[0]!,
            nativeCurrencyCode: "EUR",
            quote,
            effectiveAt: effective,
            source: "Invalid",
          },
        }),
      ).rejects.toThrow();
    await expect(
      transaction((c) =>
        draft(c, scopes[0]!, [
          {
            account: euro,
            currency: "EUR",
            side: "DEBIT",
            amount: 9000n,
            native: 100n,
          },
          expense()[1]!,
        ]),
      ),
    ).rejects.toMatchObject({ code: "23514" });
    await expect(
      db.account.create({
        data: {
          ...scopes[0]!,
          name: "Foreign expense",
          kind: "EXPENSE",
          type: "EXPENSE",
          currencyCode: "EUR",
        },
      }),
    ).rejects.toThrow();
  });
  it("prevents destructive posted editing, parent movement, retyping and currency changes", async () => {
    const leg = await db.posting.findFirstOrThrow({
      where: { journalId: originalId },
    });
    for (const command of [
      db.journal.update({
        where: { id: originalId },
        data: { description: "rewrite" },
      }),
      db.journal.delete({ where: { id: originalId } }),
      db.posting.update({
        where: { id: leg.id },
        data: { functionalMinor: 101n },
      }),
      db.posting.delete({ where: { id: leg.id } }),
      db.posting.create({
        data: {
          ...scopes[0]!,
          journalId: originalId,
          accountId: accounts.BANK,
          currencyCode: "INR",
          side: "DEBIT",
          nativeMinor: 1n,
          functionalMinor: 1n,
        },
      }),
      db.account.update({
        where: { id: accounts.BANK },
        data: { currencyCode: "USD" },
      }),
      db.account.update({
        where: { id: accounts.BANK },
        data: { ownerId: scopes[1]!.ownerId },
      }),
      db.account.update({
        where: { id: accounts.CREDIT_CARD },
        data: { type: "EXPENSE" },
      }),
    ])
      await expect(command).rejects.toThrow();
    const a = await transaction((c) => draft(c, scopes[0]!, expense()));
    const b = await transaction((c) => draft(c, scopes[0]!, expense()));
    const line = await db.posting.findFirstOrThrow({ where: { journalId: a } });
    await expect(
      db.posting.update({ where: { id: line.id }, data: { journalId: b } }),
    ).rejects.toThrow();
  });
  it("cannot change currency scales, functional currency or bypass via TRUNCATE", async () => {
    await expect(
      db.currency.update({ where: { code: "INR" }, data: { scale: 3 } }),
    ).rejects.toThrow();
    await expect(
      db.currency.delete({ where: { code: "JPY" } }),
    ).rejects.toThrow();
    await expect(
      db.workspace.update({
        where: { id: scopes[0]!.workspaceId },
        data: { functionalCurrencyCode: "EUR" },
      }),
    ).rejects.toThrow();
    for (const table of [
      "posting",
      "journal",
      "ledger_account",
      "opening_balance",
      "currency",
      "ledger_operation",
      "fx_rate",
    ])
      await expect(
        transaction(async (c) => {
          await c.query(`TRUNCATE TABLE "${table}" CASCADE`);
        }),
      ).rejects.toMatchObject({ code: "23514" });
    expect(
      await db.journal.findUnique({ where: { id: originalId } }),
    ).not.toBeNull();
  });
  it("requires atomic operation outcomes, scoped unique keys, and immutable receipt evidence", async () => {
    await expect(
      transaction((c) => receipt(c, scopes[0]!)),
    ).rejects.toMatchObject({ code: "23514" });
    const key = randomUUID();
    const first = await posted(
      scopes[0],
      expense(),
      "GENERAL",
      null,
      undefined,
      key,
    );
    await expect(
      posted(scopes[0], expense(), "GENERAL", null, undefined, key),
    ).rejects.toMatchObject({ code: "23505" });
    await posted(
      scopes[1]!,
      [
        { account: otherBank, side: "DEBIT", amount: 10n },
        { account: otherBank, side: "CREDIT", amount: 10n },
      ],
      "GENERAL",
      null,
      undefined,
      key,
    );
    await expect(
      db.ledgerOperation.update({
        where: { id: first.op },
        data: { requestHash: "b".repeat(64) },
      }),
    ).rejects.toThrow();
    await expect(
      db.ledgerOperation.delete({ where: { id: first.op } }),
    ).rejects.toThrow();
  });
  it("requires a two-leg owned asset/liability opening against opening equity", async () => {
    const target = await account(scopes[0]!);
    const good = [
      { account: target, side: "DEBIT" as const, amount: 2000000n },
      {
        account: accounts.OPENING_EQUITY,
        side: "CREDIT" as const,
        amount: 2000000n,
      },
    ];
    await expect(posted(scopes[0], good, "OPENING")).rejects.toMatchObject({
      code: "23514",
    });
    await expect(
      posted(
        scopes[0],
        [good[0]!, { ...good[1]!, account: accounts.INCOME }],
        "OPENING",
        null,
        target,
      ),
    ).rejects.toMatchObject({ code: "23514" });
    const opening = await posted(scopes[0], good, "OPENING", null, target);
    await expect(
      posted(scopes[0], good, "OPENING", null, target),
    ).rejects.toMatchObject({ code: "23505" });
    const marker = await db.openingBalance.findFirstOrThrow({
      where: { journalId: opening.id },
    });
    await expect(
      db.openingBalance.update({
        where: { id: marker.id },
        data: { source: "overwrite" },
      }),
    ).rejects.toThrow();
    await expect(
      posted(scopes[0], good, "GENERAL", null, await account(scopes[0]!)),
    ).rejects.toMatchObject({ code: "23514" });
  });
  it("accepts exactly one opposite multiset reversal, not an aggregate approximation", async () => {
    const legs = [
      { account: accounts.EXPENSE, side: "DEBIT" as const, amount: 100n },
      { account: accounts.EXPENSE, side: "DEBIT" as const, amount: 100n },
      { account: accounts.BANK, side: "CREDIT" as const, amount: 200n },
    ];
    const original = await posted(scopes[0], legs);
    await expect(
      posted(
        scopes[0],
        [
          { account: accounts.EXPENSE, side: "CREDIT", amount: 200n },
          { account: accounts.BANK, side: "DEBIT", amount: 200n },
        ],
        "REVERSAL",
        original.id,
      ),
    ).rejects.toMatchObject({ code: "23514" });
    const reverse = legs.map((l) => ({
      ...l,
      side: l.side === "DEBIT" ? ("CREDIT" as const) : ("DEBIT" as const),
    }));
    const result = await posted(scopes[0], reverse, "REVERSAL", original.id);
    await expect(
      posted(scopes[0], reverse, "REVERSAL", original.id),
    ).rejects.toMatchObject({ code: "23505" });
    expect(
      (await db.journal.findUniqueOrThrow({ where: { id: original.id } }))
        .status,
    ).toBe("POSTED");
    const totals = await pool.query(
      'SELECT sum(CASE side WHEN \'DEBIT\' THEN "functionalMinor" ELSE -"functionalMinor" END)::text AS total FROM posting WHERE "journalId"=ANY($1::uuid[])',
      [[original.id, result.id]],
    );
    expect(totals.rows[0].total).toBe("0");
  });
  it("rejects archived accounts at insertion and at delayed finalization", async () => {
    const target = await account(scopes[0]!);
    const legs = [{ ...expense()[0]!, account: target }, expense()[1]!];
    const id = await transaction((c) => draft(c, scopes[0]!, legs));
    await db.account.update({
      where: { id: target },
      data: { archivedAt: new Date() },
    });
    await expect(
      transaction((c) => finalize(c, scopes[0]!, id)),
    ).rejects.toMatchObject({ code: "23514" });
    await expect(
      transaction((c) => draft(c, scopes[0]!, legs)),
    ).rejects.toMatchObject({ code: "23514" });
    expect((await db.journal.findUniqueOrThrow({ where: { id } })).status).toBe(
      "DRAFT",
    );
  });
  it("does not trust caller search_path or temporary posting tables during balance checks", async () => {
    await expect(
      transaction(async (c) => {
        const id = await draft(c, scopes[0]!, [
          { ...expense()[0]! },
          { ...expense()[1]!, amount: 99n },
        ]);
        const op = await receipt(c, scopes[0]!);
        await c.query(
          "CREATE TEMP TABLE posting (LIKE public.posting INCLUDING DEFAULTS) ON COMMIT DROP",
        );
        await c.query(
          'INSERT INTO pg_temp.posting SELECT * FROM public.posting WHERE "journalId"=$1',
          [id],
        );
        await c.query(
          'UPDATE pg_temp.posting SET "functionalMinor"=100,"nativeMinor"=100',
        );
        await c.query("SET LOCAL search_path = pg_temp, public");
        await c.query(
          'UPDATE public.journal SET status=\'POSTED\',"postedAt"=CURRENT_TIMESTAMP,"operationId"=$1 WHERE id=$2',
          [op, id],
        );
      }),
    ).rejects.toMatchObject({ code: "23514" });
  });
});

async function waitForRowLock(pid: number) {
  const deadline = Date.now() + 3000;
  while (Date.now() < deadline) {
    const state = await pool.query(
      "SELECT wait_event_type FROM pg_stat_activity WHERE pid=$1",
      [pid],
    );
    if (state.rows[0]?.wait_event_type === "Lock") return;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error("Expected deterministic row-lock wait did not occur");
}
describe("P1-S05 concurrent draft lifecycle", () => {
  it("cannot finalize a stale unbalanced draft after a concurrent edit commits", async () => {
    const id = await transaction((c) => draft(c, scopes[0]!, expense()));
    const line = await db.posting.findFirstOrThrow({
      where: { journalId: id, side: "DEBIT" },
    });
    const editor = await pool.connect();
    const sealer = await pool.connect();
    let pending: Promise<pg.QueryResult> | undefined;
    try {
      await editor.query("BEGIN");
      await sealer.query("BEGIN");
      await editor.query(
        'UPDATE posting SET "functionalMinor"=101,"nativeMinor"=101 WHERE id=$1',
        [line.id],
      );
      const op = await receipt(sealer, scopes[0]!);
      const pid = (await sealer.query("SELECT pg_backend_pid() AS pid")).rows[0]
        .pid;
      pending = sealer.query(
        'UPDATE journal SET status=\'POSTED\',"postedAt"=CURRENT_TIMESTAMP,"operationId"=$1 WHERE id=$2',
        [op, id],
      );
      await waitForRowLock(pid);
      await editor.query("COMMIT");
      await pending;
      await expect(sealer.query("COMMIT")).rejects.toMatchObject({
        code: "23514",
      });
      expect(
        (await db.journal.findUniqueOrThrow({ where: { id } })).status,
      ).toBe("DRAFT");
      expect(await db.ledgerOperation.count({ where: { id: op } })).toBe(0);
    } finally {
      await editor.query("ROLLBACK");
      await pending?.catch(() => undefined);
      await sealer.query("ROLLBACK");
      editor.release();
      sealer.release();
    }
  });
  it("fails stale repeatable-read finalization through the parent row version", async () => {
    const id = await transaction((c) => draft(c, scopes[0]!, expense()));
    const line = await db.posting.findFirstOrThrow({
      where: { journalId: id, side: "DEBIT" },
    });
    await expect(
      transaction(async (c) => {
        await c.query("SELECT revision FROM journal WHERE id=$1", [id]);
        await db.posting.update({
          where: { id: line.id },
          data: { nativeMinor: 102n, functionalMinor: 102n },
        });
        await finalize(c, scopes[0]!, id);
      }, "REPEATABLE READ"),
    ).rejects.toMatchObject({ code: "40001" });
    expect((await db.journal.findUniqueOrThrow({ where: { id } })).status).toBe(
      "DRAFT",
    );
  });
  it("rejects a repeatable-read archive race instead of reading an old active account", async () => {
    const target = await account(scopes[0]!);
    const id = await transaction((c) =>
      draft(c, scopes[0]!, [
        { ...expense()[0]!, account: target },
        expense()[1]!,
      ]),
    );
    await expect(
      transaction(async (c) => {
        await c.query('SELECT "archivedAt" FROM ledger_account WHERE id=$1', [
          target,
        ]);
        await db.account.update({
          where: { id: target },
          data: { archivedAt: new Date() },
        });
        await finalize(c, scopes[0]!, id);
      }, "REPEATABLE READ"),
    ).rejects.toMatchObject({ code: "40001" });
    expect((await db.journal.findUniqueOrThrow({ where: { id } })).status).toBe(
      "DRAFT",
    );
  });
  it("serializes simultaneous draft-line edits and then commits their balanced result", async () => {
    const id = await transaction((c) => draft(c, scopes[0]!, expense()));
    const lines = await db.posting.findMany({
      where: { journalId: id },
      orderBy: { side: "asc" },
    });
    const first = await pool.connect();
    const second = await pool.connect();
    let pending: Promise<pg.QueryResult> | undefined;
    try {
      await first.query("BEGIN");
      await second.query("BEGIN");
      await first.query(
        'UPDATE posting SET "functionalMinor"=200,"nativeMinor"=200 WHERE id=$1',
        [lines[0]!.id],
      );
      const pid = (await second.query("SELECT pg_backend_pid() AS pid")).rows[0]
        .pid;
      pending = second.query(
        'UPDATE posting SET "functionalMinor"=200,"nativeMinor"=200 WHERE id=$1',
        [lines[1]!.id],
      );
      await waitForRowLock(pid);
      await first.query("COMMIT");
      await pending;
      await second.query("COMMIT");
      await transaction((c) => finalize(c, scopes[0]!, id));
      expect(
        (await db.journal.findUniqueOrThrow({ where: { id } })).revision,
      ).toBe(4);
    } finally {
      await first.query("ROLLBACK");
      await pending?.catch(() => undefined);
      await second.query("ROLLBACK");
      first.release();
      second.release();
    }
  });
  it("rejects reversal references to unposted predecessors and cycles", async () => {
    const id = await transaction((c) => draft(c, scopes[0]!, expense()));
    await expect(
      transaction((c) => draft(c, scopes[0]!, expense(), "REVERSAL", id)),
    ).rejects.toMatchObject({ code: "23514" });
    await expect(
      db.journal.update({
        where: { id },
        data: { kind: "REVERSAL", reversesJournalId: id },
      }),
    ).rejects.toThrow();
  });
  it("sums bigint legs in numeric precision and supports opening card debt without income", async () => {
    const many = Array.from({ length: 20 }, () => expense(MAX_MINOR)).flat();
    const result = await posted(scopes[0], many);
    expect(await db.posting.count({ where: { journalId: result.id } })).toBe(
      40,
    );
    const target = await account(scopes[0]!, "CREDIT_CARD");
    const opening = await posted(
      scopes[0],
      [
        { account: accounts.OPENING_EQUITY, side: "DEBIT", amount: 200000n },
        { account: target, side: "CREDIT", amount: 200000n },
      ],
      "OPENING",
      null,
      target,
    );
    const legs = await db.posting.findMany({
      where: { journalId: opening.id },
      include: { account: true },
    });
    expect(
      legs.some(
        (p) => p.account.type === "INCOME" || p.account.type === "EXPENSE",
      ),
    ).toBe(false);
  });
});

it("P1-S05 preserves checksums of every applied migration", async () => {
  const rows = await pool.query(
    "SELECT migration_name, checksum FROM _prisma_migrations WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL",
  );
  for (const row of rows.rows) {
    expect(row.migration_name).toMatch(/^\d{12}_[a-z_]+$/);
    const content = readFileSync(
      new URL(
        `../../prisma/migrations/${row.migration_name}/migration.sql`,
        import.meta.url,
      ),
    );
    expect(createHash("sha256").update(content).digest("hex")).toBe(
      row.checksum,
    );
  }
});

it("P1-S05 accepts an atomic reversal/replacement receipt and rejects extra outcomes", async () => {
  const original = await posted(scopes[0], expense());
  const operation = await transaction(async (c) => {
    const reversed = await draft(
      c,
      scopes[0]!,
      expense().map((p) => ({
        ...p,
        side: p.side === "DEBIT" ? ("CREDIT" as const) : ("DEBIT" as const),
      })),
      "REVERSAL",
      original.id,
    );
    const replacement = await draft(c, scopes[0]!, expense(150n));
    const op = await receipt(c, scopes[0]!, "CORRECT");
    await c.query(
      'UPDATE journal SET status=\'POSTED\',"postedAt"=CURRENT_TIMESTAMP,"operationId"=$1 WHERE id=ANY($2::uuid[])',
      [op, [reversed, replacement]],
    );
    return op;
  });
  expect(
    await db.journal.count({
      where: { operationId: operation, status: "POSTED" },
    }),
  ).toBe(2);
  await expect(
    transaction(async (c) => {
      const id = await draft(c, scopes[0]!, expense());
      await c.query(
        'UPDATE journal SET status=\'POSTED\',"postedAt"=CURRENT_TIMESTAMP,"operationId"=$1 WHERE id=$2',
        [original.op, id],
      );
    }),
  ).rejects.toMatchObject({ code: "23514" });
  expect(await db.journal.count({ where: { operationId: original.op } })).toBe(
    1,
  );
});
it("P1-S05 rejects malformed operation keys/hashes and direct posted inserts", async () => {
  for (const value of ["", "short", "has spaces here"])
    await expect(
      transaction((c) => receipt(c, scopes[0]!, "POST", value)),
    ).rejects.toMatchObject({
      code: "23514",
      constraint: "operation_key_valid",
    });
  for (const hash of ["a".repeat(63), "G".repeat(64)])
    await expect(
      transaction((c) =>
        c.query(
          'INSERT INTO ledger_operation (id,"workspaceId","ownerId","idempotencyKey","requestHash",kind) VALUES ($1,$2,$3,$4,$5,\'POST\')',
          [
            randomUUID(),
            scopes[0]!.workspaceId,
            scopes[0]!.ownerId,
            randomUUID(),
            hash,
          ],
        ),
      ),
    ).rejects.toMatchObject({
      code: "23514",
      constraint: "operation_hash_valid",
    });
  await expect(
    transaction((c) =>
      c.query(
        'INSERT INTO journal (id,"workspaceId","ownerId","effectiveAt",status) VALUES ($1,$2,$3,$4,\'POSTED\')',
        [randomUUID(), scopes[0]!.workspaceId, scopes[0]!.ownerId, effective],
      ),
    ),
  ).rejects.toMatchObject({
    code: "23514",
    message: "Create a draft before posting",
  });
});

it("P1-S05 rejects a late posting that waited behind concurrent finalization", async () => {
  const id = await transaction((c) => draft(c, scopes[0]!, expense()));
  const sealer = await pool.connect();
  const editor = await pool.connect();
  let pending: Promise<pg.QueryResult> | undefined;
  try {
    await sealer.query("BEGIN");
    await editor.query("BEGIN");
    await finalize(sealer, scopes[0]!, id);
    const pid = (await editor.query("SELECT pg_backend_pid() AS pid")).rows[0]
      .pid;
    pending = editor.query(
      'INSERT INTO posting (id,"journalId","workspaceId","ownerId","accountId","currencyCode",side,"nativeMinor","functionalMinor") VALUES ($1,$2,$3,$4,$5,\'INR\',\'DEBIT\',1,1)',
      [
        randomUUID(),
        id,
        scopes[0]!.workspaceId,
        scopes[0]!.ownerId,
        accounts.BANK,
      ],
    );
    void pending.catch(() => undefined);
    await waitForRowLock(pid);
    await sealer.query("COMMIT");
    await expect(pending).rejects.toMatchObject({ code: "23514" });
    expect(await db.posting.count({ where: { journalId: id } })).toBe(2);
    expect((await db.journal.findUniqueOrThrow({ where: { id } })).status).toBe(
      "POSTED",
    );
  } finally {
    await sealer.query("ROLLBACK");
    await pending?.catch(() => undefined);
    await editor.query("ROLLBACK");
    sealer.release();
    editor.release();
  }
});
