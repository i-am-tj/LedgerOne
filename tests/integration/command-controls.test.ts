import { randomUUID } from "node:crypto";
import { beforeAll, afterAll, it, expect } from "vitest";
import pg from "pg";
import { createFreshLedgerDatabase } from "../../scripts/lib/fresh-ledger-database";
import { testDatabaseURL } from "../support/database";
import {
  captureLedgerInvariants,
  assertLedgerInvariants,
  type InvariantManifest,
} from "../../src/lib/ledger/invariants";

let lease: Awaited<ReturnType<typeof createFreshLedgerDatabase>>;
let pool: pg.Pool;
let expected: InvariantManifest;
const owner = randomUUID(),
  workspace = randomUUID(),
  bank = randomUUID(),
  expense = randomUUID();
async function transaction<T>(work: (c: pg.PoolClient) => Promise<T>) {
  const c = await pool.connect();
  try {
    await c.query("BEGIN");
    const r = await work(c);
    await c.query("COMMIT");
    return r;
  } catch (e) {
    await c.query("ROLLBACK");
    throw e;
  } finally {
    c.release();
  }
}
async function draft(
  c: pg.PoolClient,
  kind = "GENERAL",
  original: string | null = null,
  reverse = false,
) {
  const id = randomUUID();
  await c.query(
    'INSERT INTO journal(id,"workspaceId","ownerId","effectiveAt",kind,"reversesJournalId") VALUES($1,$2,$3,NOW(),$4,$5)',
    [id, workspace, owner, kind, original],
  );
  for (const [aid, side] of [
    [expense, reverse ? "CREDIT" : "DEBIT"],
    [bank, reverse ? "DEBIT" : "CREDIT"],
  ])
    await c.query(
      'INSERT INTO posting(id,"journalId","workspaceId","ownerId","accountId","currencyCode",side,"nativeMinor","functionalMinor") VALUES($1,$2,$3,$4,$5,\'INR\',$6,100,100)',
      [randomUUID(), id, workspace, owner, aid, side],
    );
  return id;
}
async function operation(c: pg.PoolClient, kind = "POST") {
  const id = randomUUID();
  await c.query(
    'INSERT INTO ledger_operation(id,"workspaceId","ownerId","idempotencyKey","requestHash",kind) VALUES($1,$2,$3,$4,$5,$6)',
    [id, workspace, owner, randomUUID(), "a".repeat(64), kind],
  );
  return id;
}
async function seal(c: pg.PoolClient, id: string, op: string) {
  await c.query(
    'UPDATE journal SET status=\'POSTED\',"postedAt"=NOW(),"operationId"=$1 WHERE id=$2',
    [op, id],
  );
}
async function audit(
  c: pg.PoolClient,
  op: string,
  target: string,
  action = "ledger.posted",
  auditOwner = owner,
  reason = "Manual fixture",
) {
  const id = randomUUID();
  await c.query(
    'INSERT INTO audit_event(id,"workspaceId","ownerId","actorId","requestId",action,"operationId","targetJournalId",reason) VALUES($1,$2,$3,$3,$4,$5,$6,$7,$8)',
    [id, workspace, auditOwner, randomUUID(), action, op, target, reason],
  );
  return id;
}
beforeAll(async () => {
  lease = await createFreshLedgerDatabase(testDatabaseURL());
  pool = new pg.Pool({ connectionString: lease.url, max: 3 });
  const c = await pool.connect();
  try {
    expected = await captureLedgerInvariants(c, { schema: "public" });
  } finally {
    c.release();
  }
  await pool.query(
    'INSERT INTO auth_user(id,name,email,"emailVerified","updatedAt") VALUES($1,\'Fixture\',$2,true,NOW())',
    [owner, `${owner}@ledgerone.test`],
  );
  await pool.query(
    'INSERT INTO workspace(id,"ownerId",name,"updatedAt") VALUES($1,$2,\'Fixture\',NOW())',
    [workspace, owner],
  );
  for (const [id, type, kind] of [
    [bank, "ASSET", "BANK"],
    [expense, "EXPENSE", "EXPENSE"],
  ])
    await pool.query(
      'INSERT INTO ledger_account(id,"workspaceId","ownerId",name,type,kind,"currencyCode","updatedAt") VALUES($1,$2,$3,\'Fixture\',$4,$5,\'INR\',NOW())',
      [id, workspace, owner, type, kind],
    );
}, 30000);
afterAll(async () => {
  await pool?.end();
  await lease?.cleanup();
});
it("P1-S06A commits exact posted financial audit while retaining workspace audit compatibility", async () => {
  await pool.query(
    'INSERT INTO audit_event(id,"workspaceId","ownerId","actorId","requestId",action) VALUES($1,$2,$3,$3,$4,\'workspace.created\')',
    [randomUUID(), workspace, owner, randomUUID()],
  );
  const result = await transaction(async (c) => {
    const id = await draft(c),
      op = await operation(c);
    await seal(c, id, op);
    return { op, id, event: await audit(c, op, id) };
  });
  expect(
    (
      await pool.query(
        'SELECT "operationId","targetJournalId" FROM audit_event WHERE id=$1',
        [result.event],
      )
    ).rows[0],
  ).toEqual({ operationId: result.op, targetJournalId: result.id });
  await expect(
    transaction((c) => audit(c, result.op, result.id)),
  ).rejects.toMatchObject({ code: "23505" });
  await expect(
    pool.query("UPDATE audit_event SET reason='rewrite' WHERE id=$1", [
      result.event,
    ]),
  ).rejects.toMatchObject({ code: "23514" });
  await expect(
    pool.query("DELETE FROM audit_event WHERE id=$1", [result.event]),
  ).rejects.toMatchObject({ code: "23514" });
});
it.each([
  "wrong-action",
  "wrong-target",
  "wrong-owner",
  "blank-reason",
  "long-reason",
])("P1-S06A rolls back receipt/journal/audit for %s", async (mode) => {
  const before = (
    await pool.query(
      "SELECT (SELECT count(*) FROM journal)::int AS j,(SELECT count(*) FROM ledger_operation)::int AS o,(SELECT count(*) FROM audit_event)::int AS a",
    )
  ).rows[0];
  await expect(
    transaction(async (c) => {
      const id = await draft(c),
        op = await operation(c);
      await seal(c, id, op);
      const event = await audit(
        c,
        op,
        mode === "wrong-target" ? randomUUID() : id,
        mode === "wrong-action" ? "ledger.corrected" : "ledger.posted",
        mode === "wrong-owner" ? randomUUID() : owner,
        mode === "blank-reason"
          ? " "
          : mode === "long-reason"
            ? "x".repeat(501)
            : "Fixture",
      );
      return event;
    }),
  ).rejects.toMatchObject({
    code:
      mode === "wrong-owner" || mode === "wrong-target"
        ? "23503"
        : mode === "long-reason"
          ? "22001"
          : "23514",
  });
  expect(
    (
      await pool.query(
        "SELECT (SELECT count(*) FROM journal)::int AS j,(SELECT count(*) FROM ledger_operation)::int AS o,(SELECT count(*) FROM audit_event)::int AS a",
      )
    ).rows[0],
  ).toEqual(before);
});
it("P1-S06A rejects a CORRECT operation reversing its own replacement", async () => {
  await expect(
    transaction(async (c) => {
      const op = await operation(c, "CORRECT"),
        replacement = await draft(c);
      await seal(c, replacement, op);
      const reversal = await draft(c, "REVERSAL", replacement, true);
      await seal(c, reversal, op);
      await audit(c, op, replacement, "ledger.corrected");
    }),
  ).rejects.toMatchObject({ code: "23514" });
});
it("P1-S06A commits REVERSE/CORRECT audits only for the exact original", async () => {
  for (const kind of ["REVERSE", "CORRECT"]) {
    const original = await transaction(async (c) => {
      const id = await draft(c);
      await seal(c, id, await operation(c));
      return id;
    });
    await transaction(async (c) => {
      const op = await operation(c, kind),
        rev = await draft(c, "REVERSAL", original, true);
      await seal(c, rev, op);
      if (kind === "CORRECT") {
        const replacement = await draft(c);
        await seal(c, replacement, op);
      }
      await audit(
        c,
        op,
        original,
        kind === "CORRECT" ? "ledger.corrected" : "ledger.reversed",
      );
    });
  }
});
const mutations = [
  [
    "disabled trigger",
    "ALTER TABLE journal DISABLE TRIGGER journal_balanced_at_commit",
  ],
  [
    "changed CHECK",
    "ALTER TABLE posting DROP CONSTRAINT posting_fx_not_enabled; ALTER TABLE posting ADD CONSTRAINT posting_fx_not_enabled CHECK (true)",
  ],
  [
    "changed function",
    `CREATE OR REPLACE FUNCTION ledger05_no_truncate() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RETURN NULL; END $$`,
  ],
  [
    "definer escalation",
    "ALTER FUNCTION ledger05_assert_operation(uuid) SECURITY DEFINER",
  ],
  [
    "search path",
    "ALTER FUNCTION ledger05_assert_operation(uuid) SET search_path=public,pg_temp",
  ],
  ["unexpected grant", "GRANT INSERT ON posting TO PUBLIC"],
  [
    "extra function",
    `CREATE FUNCTION surprise_control() RETURNS integer LANGUAGE sql AS 'SELECT 1'`,
  ],
  [
    "unvalidated CHECK",
    'ALTER TABLE posting DROP CONSTRAINT posting_positive_bounded; ALTER TABLE posting ADD CONSTRAINT posting_positive_bounded CHECK ("nativeMinor">0) NOT VALID',
  ],
  [
    "changed applied checksum",
    `UPDATE _prisma_migrations SET checksum=repeat('b',64) WHERE migration_name='202611110004_ledger_schema'`,
  ],
  [
    "unfinished migration",
    `UPDATE _prisma_migrations SET finished_at=NULL WHERE migration_name='202611110007_command_audit_controls'`,
  ],
] as const;
it.each(mutations)(
  "P1-S06A detects %s before write attestation",
  async (_name, sql) => {
    const c = await pool.connect();
    try {
      await c.query("BEGIN");
      await c.query(sql);
      const changed = await captureLedgerInvariants(c, { schema: "public" });
      expect(() => assertLedgerInvariants(changed, expected)).toThrow(
        "Ledger invariant attestation failed",
      );
    } finally {
      await c.query("ROLLBACK");
      c.release();
    }
  },
);
it("P1-S06A reference capture stays stable after unrelated financial fixture data and rolled-back DDL", async () => {
  const c = await pool.connect();
  try {
    assertLedgerInvariants(
      await captureLedgerInvariants(c, { schema: "public" }),
      expected,
    );
  } finally {
    c.release();
  }
});

it("P1-S06A rejects a valid same-owner but wrong target despite temporary-table spoofing", async () => {
  const other = await transaction(async (c) => {
    const id = await draft(c);
    await seal(c, id, await operation(c));
    return id;
  });
  await expect(
    transaction(async (c) => {
      const id = await draft(c),
        op = await operation(c);
      await seal(c, id, op);
      await c.query(
        "CREATE TEMP TABLE journal (LIKE public.journal INCLUDING ALL) ON COMMIT DROP",
      );
      await c.query(
        "INSERT INTO pg_temp.journal SELECT * FROM public.journal WHERE id=$1",
        [id],
      );
      await c.query("UPDATE pg_temp.journal SET id=$1", [other]);
      await audit(c, op, other);
    }),
  ).rejects.toMatchObject({ code: "23514" });
});

it("P1-S06A preserves function SQL literals when comparing catalogs", async () => {
  const c = await pool.connect();
  try {
    await c.query("BEGIN");
    await c.query(
      "CREATE FUNCTION literal_control() RETURNS text LANGUAGE SQL AS $$ SELECT 'public' $$",
    );
    const before = await captureLedgerInvariants(c, { schema: "public" });
    await c.query(
      "CREATE OR REPLACE FUNCTION literal_control() RETURNS text LANGUAGE SQL AS $$ SELECT '$SCHEMA' $$",
    );
    const after = await captureLedgerInvariants(c, { schema: "public" });
    expect(() => assertLedgerInvariants(after, before)).toThrow();
  } finally {
    await c.query("ROLLBACK");
    c.release();
  }
});
