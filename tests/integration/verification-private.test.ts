import { randomUUID } from "node:crypto";
import { beforeAll, afterAll, it, expect } from "vitest";
import {
  captureLedgerInvariants,
  assertLedgerInvariants,
} from "../../src/lib/ledger/invariants";
import { postHarness } from "../support/post-harness";
let h: Awaited<ReturnType<typeof postHarness>>;
beforeAll(async () => {
  h = await postHarness({ schema: "ledgerone" });
}, 30000);
afterAll(async () => {
  await h?.cleanup();
});

it("D-T02 private actual-role handlers post and authenticate with separate least-privilege roles", async () => {
  expect(
    (
      await h.authDatabase.$queryRaw<
        { role: string }[]
      >`SELECT current_user AS role`
    )[0]!.role,
  ).toBe(h.authRole);
  const response = await h.api(0, randomUUID(), h.payload());
  expect(response.status).toBe(201);
  expect((await h.api(1, randomUUID(), h.payload())).status).toBe(404);
  expect((await h.api(null, randomUUID(), h.payload())).status).toBe(401);
  await expect(
    h.authDatabase.$executeRawUnsafe("DELETE FROM ledgerone.posting"),
  ).rejects.toMatchObject({ code: "P2010" });
  expect(
    (
      await h.admin.query(
        "SELECT count(*)::int AS count FROM ledgerone.journal",
      )
    ).rows[0].count,
  ).toBe(1);
});

it("D-T02 public and temporary shadows cannot redirect command, trigger or helper resolution", async () => {
  await h.admin
    .query(`CREATE TABLE public.journal AS TABLE ledgerone.journal WITH NO DATA;
    CREATE TABLE public.posting AS TABLE ledgerone.posting WITH NO DATA;
    CREATE VIEW public.pg_roles AS SELECT * FROM pg_catalog.pg_roles WHERE false;
    CREATE VIEW public.pg_class AS SELECT * FROM pg_catalog.pg_class WHERE false;
    CREATE FUNCTION public.ledger05_assert_journal(uuid) RETURNS void LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'public helper selected'; END $$;
    GRANT SELECT,INSERT,UPDATE ON public.journal,public.posting TO "${h.role}"; GRANT SELECT ON public.pg_roles,public.pg_class TO "${h.role}"`);
  h.setProbe(async (stage, c) => {
    if (stage === "connected")
      await c.query("SET search_path=public,pg_catalog,ledgerone");
    if (stage === "begin")
      await c.query(
        "CREATE TEMP TABLE IF NOT EXISTS journal AS TABLE ledgerone.journal WITH NO DATA",
      );
  });
  try {
    expect((await h.api(0, randomUUID(), h.payload())).status).toBe(201);
    expect((await h.api(0, randomUUID(), h.payload())).status).toBe(201);
    expect(
      (await h.admin.query("SELECT count(*)::int AS count FROM public.journal"))
        .rows[0].count,
    ).toBe(0);
    expect(
      (await h.admin.query("SELECT count(*)::int AS count FROM public.posting"))
        .rows[0].count,
    ).toBe(0);
    const triggers = await h.admin
      .query(`SELECT count(*)::int AS count FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid
      JOIN pg_proc p ON p.oid=t.tgfoid WHERE c.relnamespace='ledgerone'::regnamespace AND NOT t.tgisinternal AND p.pronamespace<>'ledgerone'::regnamespace`);
    expect(triggers.rows[0].count).toBe(0);
  } finally {
    h.setProbe(undefined);
    await h.admin.query(
      "DROP TABLE public.journal,public.posting; DROP VIEW public.pg_roles,public.pg_class; DROP FUNCTION public.ledger05_assert_journal(uuid)",
    );
  }
});

it.each(["runtime-inheritance", "verifier-write", "auth-financial-write"])(
  "D-T02 rejects %s even if supplied a newly captured unsafe baseline",
  async (mode) => {
    const sql =
      mode === "runtime-inheritance"
        ? `GRANT "${h.authRole}" TO "${h.role}"`
        : `GRANT INSERT ON ledgerone.journal TO "${mode === "verifier-write" ? h.verifierRole : h.authRole}"`;
    const undo =
      mode === "runtime-inheritance"
        ? `REVOKE "${h.authRole}" FROM "${h.role}"`
        : `REVOKE INSERT ON ledgerone.journal FROM "${mode === "verifier-write" ? h.verifierRole : h.authRole}"`;
    await h.admin.query(sql);
    try {
      expect((await h.api(0, randomUUID(), h.payload())).status).toBe(503);
      const c = await h.admin.connect();
      try {
        await expect(
          h.reopen(await captureLedgerInvariants(c, h.scope)),
        ).rejects.toBeInstanceOf(Error);
      } finally {
        c.release();
      }
    } finally {
      await h.admin.query(undo);
    }
    expect((await h.api(0, randomUUID(), h.payload())).status).toBe(201);
  },
);

it("D-T02 private writer cannot create private/public objects or SET ROLE into auth", async () => {
  let seen = false;
  h.setProbe(async (stage, c) => {
    if (stage !== "connected") return;
    seen = true;
    for (const sql of [
      "CREATE TABLE ledgerone.escape(id int)",
      "CREATE TABLE public.escape(id int)",
      `SET ROLE "${h.authRole}"`,
      "TRUNCATE ledgerone.posting",
    ])
      await expect(c.query(sql)).rejects.toMatchObject({ code: "42501" });
  });
  try {
    expect((await h.api(0, randomUUID(), h.payload())).status).toBe(201);
    expect(seen).toBe(true);
  } finally {
    h.setProbe(undefined);
  }
});

it("D-T02 real Prisma private upgrade from 006 preserves ordered original checksums and handlers", async () => {
  const upgraded = await postHarness({ schema: "ledgerone", upgrade: true });
  try {
    expect(upgraded.upgradeFrom).toBe("6");
    // Independent fresh reference and upgraded target have different generated
    // role identities; semantic metadata normalization must still compare equal.
    expect(() =>
      assertLedgerInvariants(upgraded.expected, h.expected),
    ).not.toThrow();
    const { readFileSync, readdirSync } = await import("node:fs");
    const { createHash } = await import("node:crypto");
    const history = await upgraded.admin.query(
      "SELECT migration_name,checksum,finished_at,rolled_back_at FROM ledgerone._prisma_migrations ORDER BY migration_name",
    );
    expect(history.rows).toHaveLength(
      readdirSync("prisma/migrations").filter((name) => /^20[0-9]+_/.test(name))
        .length,
    );
    for (const row of history.rows) {
      expect(row.finished_at).not.toBeNull();
      expect(row.rolled_back_at).toBeNull();
      expect(row.checksum).toBe(
        createHash("sha256")
          .update(
            readFileSync(
              `prisma/migrations/${row.migration_name}/migration.sql`,
            ),
          )
          .digest("hex"),
      );
    }
    expect(
      (await upgraded.api(0, randomUUID(), upgraded.payload())).status,
    ).toBe(201);
  } finally {
    await upgraded.cleanup();
  }
}, 30000);

it.each(["checksum", "unfinished", "extra", "missing"])(
  "D-T02 private migration history %s fails before new write or replay",
  async (mode) => {
    const key = randomUUID();
    const payload = h.payload();
    expect((await h.api(0, key, payload)).status).toBe(201);
    const before = await h.admin.query(
      "SELECT (SELECT count(*) FROM ledgerone.journal)::int AS journals,(SELECT count(*) FROM ledgerone.ledger_operation)::int AS receipts,(SELECT count(*) FROM ledgerone.audit_event)::int AS audits",
    );
    let sql: string;
    if (mode === "checksum")
      sql =
        "UPDATE ledgerone._prisma_migrations SET checksum=repeat('0',64) WHERE migration_name LIKE '202611110007%'";
    else if (mode === "unfinished")
      sql =
        "UPDATE ledgerone._prisma_migrations SET finished_at=NULL WHERE migration_name LIKE '202611110007%'";
    else
      sql =
        "INSERT INTO ledgerone._prisma_migrations(id,checksum,migration_name,started_at,finished_at,applied_steps_count) VALUES ('d-extra',repeat('0',64),'unapproved_extra',NOW(),NOW(),1)";
    const saved = await h.admin.query(
      "SELECT * FROM ledgerone._prisma_migrations WHERE migration_name LIKE '202611110007%'",
    );
    if (mode === "missing")
      sql =
        "DELETE FROM ledgerone._prisma_migrations WHERE migration_name LIKE '202611110007%'";
    await h.admin.query(sql);
    try {
      expect((await h.api(0, key, payload)).status).toBe(503);
      expect((await h.api(0, randomUUID(), payload)).status).toBe(503);
      expect(
        (
          await h.admin.query(
            "SELECT (SELECT count(*) FROM ledgerone.journal)::int AS journals,(SELECT count(*) FROM ledgerone.ledger_operation)::int AS receipts,(SELECT count(*) FROM ledgerone.audit_event)::int AS audits",
          )
        ).rows,
      ).toEqual(before.rows);
    } finally {
      await h.admin.query(
        "DELETE FROM ledgerone._prisma_migrations WHERE id='d-extra'",
      );
      if (mode === "missing") {
        const row = saved.rows[0];
        await h.admin.query(
          "INSERT INTO ledgerone._prisma_migrations(id,checksum,finished_at,migration_name,logs,rolled_back_at,started_at,applied_steps_count) VALUES($1,$2,$3,$4,$5,$6,$7,$8)",
          [
            row.id,
            row.checksum,
            row.finished_at,
            row.migration_name,
            row.logs,
            row.rolled_back_at,
            row.started_at,
            row.applied_steps_count,
          ],
        );
      }
      await h.admin.query(
        "UPDATE ledgerone._prisma_migrations SET checksum=$1,finished_at=$2 WHERE migration_name LIKE '202611110007%'",
        [saved.rows[0].checksum, saved.rows[0].finished_at],
      );
    }
    expect((await h.api(0, key, payload)).status).toBe(200);
  },
);

it("D-T02 private cleanup refuses an active connection and never terminates it", async () => {
  const { createLocalPrivateLedgerDatabase } =
    await import("../../scripts/lib/fresh-ledger-database");
  const { testDatabaseURL } = await import("../support/database");
  const { default: pg } = await import("pg");
  const lease = await createLocalPrivateLedgerDatabase(testDatabaseURL());
  const active = new pg.Client({ connectionString: lease.url });
  await active.connect();
  try {
    await expect(lease.cleanup()).rejects.toThrow("open connections");
    expect((await active.query("SELECT 1 AS alive")).rows[0].alive).toBe(1);
  } finally {
    await active.end();
    await lease.cleanup();
  }
}, 15000);

it("D-T03 diagnostic observer failure cannot change a real committed outcome or replay", async () => {
  const key = randomUUID(),
    payload = h.payload();
  h.setMetrics(() => {
    throw new Error("broken diagnostic sink");
  });
  try {
    const response = await h.api(0, key, payload);
    expect(response.status).toBe(201);
    const result = await response.json();
    const replay = await h.api(0, key, payload);
    expect(replay.status).toBe(200);
    expect(await replay.json()).toEqual(result);
    expect(
      (
        await h.admin.query(
          'SELECT count(*)::int AS count FROM ledgerone.audit_event WHERE "operationId"=$1',
          [result.operationId],
        )
      ).rows[0].count,
    ).toBe(1);
  } finally {
    h.setMetrics(undefined);
  }
});

it("D-T04 private roles combine POST, REVERSE and CORRECT with immutable authorized replay", async () => {
  const originalKey = randomUUID();
  const first = await h.api(0, originalKey, h.payload());
  expect(first.status).toBe(201);
  const original = await first.json();
  const reverse = {
    kind: "REVERSE",
    originalJournalId: original.journalId,
    effectiveAt: "2026-02-01T00:00:00Z",
    description: "Undo private-schema original",
    reason: "D-T04 verification",
  };
  const key = randomUUID();
  expect((await h.api(1, key, reverse)).status).toBe(404);
  const response = await h.api(0, key, reverse);
  expect(response.status).toBe(201);
  const inverse = await response.json();
  const correction = {
    kind: "CORRECT",
    originalJournalId: inverse.reversal.journalId,
    effectiveAt: "2026-03-01T00:00:00Z",
    description: "Reverse the explicit reversal",
    reason: "D-T04 verification correction",
    replacement: {
      effectiveAt: "2026-03-02T00:00:00Z",
      description: "Private replacement",
      legs: h.payload().legs,
    },
  };
  const correctionKey = randomUUID();
  expect((await h.api(1, correctionKey, correction)).status).toBe(404);
  const corrected = await h.api(0, correctionKey, correction);
  expect(corrected.status).toBe(201);
  const result = await corrected.json();
  expect(result.originalJournalId).toBe(inverse.reversal.journalId);
  const operations = [
    original.operationId,
    inverse.operationId,
    result.operationId,
  ];
  const snapshot = async () =>
    (
      await h.admin.query(
        `SELECT
      (SELECT count(*)::int FROM ledger_operation WHERE id=ANY($1::uuid[])) receipts,
      (SELECT count(*)::int FROM journal WHERE "operationId"=ANY($1::uuid[]) AND status='POSTED') journals,
      (SELECT count(*)::int FROM audit_event WHERE "operationId"=ANY($1::uuid[])) audits,
      (SELECT count(*)::int FROM journal WHERE "operationId"=ANY($1::uuid[]) AND status<>'POSTED') drafts,
      (SELECT coalesce(sum(CASE p.side WHEN 'DEBIT' THEN p."functionalMinor" ELSE -p."functionalMinor" END),0)::text FROM posting p JOIN journal j ON j.id=p."journalId" WHERE j."operationId"=ANY($1::uuid[]) AND p."accountId"=$2) balance`,
        [operations, h.users[0]!.bank],
      )
    ).rows[0];
  const expectedBalance = (
    BigInt(
      original.legs.find(
        (l: { accountId: string }) => l.accountId === h.users[0]!.bank,
      ).functionalMinor,
    ) *
    2n *
    (h.payload().legs.find((l) => l.accountId === h.users[0]!.bank)!.side ===
    "DEBIT"
      ? 1n
      : -1n)
  ).toString();
  const before = await snapshot();
  expect(before).toEqual({
    receipts: 3,
    journals: 4,
    audits: 3,
    drafts: 0,
    balance: expectedBalance,
  });
  // Mutable account lifecycle data must not change any historical result.
  await h.admin.query(
    'UPDATE ledger_account SET name=$1,"archivedAt"=now() WHERE id=ANY($2::uuid[])',
    ["D-T04 archived", h.payload().legs.map((l) => l.accountId)],
  );
  try {
    for (const [replayKey, command, expected] of [
      [originalKey, h.payload(), original],
      [key, reverse, inverse],
      [correctionKey, correction, result],
    ] as const) {
      const replay = await h.api(0, replayKey, command);
      expect(replay.status).toBe(200);
      expect(await replay.json()).toEqual(expected);
      expect((await h.api(1, replayKey, command)).status).toBe(404);
    }
    expect((await h.api(0, randomUUID(), h.payload())).status).toBe(409);
    expect(await snapshot()).toEqual(before);
  } finally {
    await h.admin.query(
      'UPDATE ledger_account SET "archivedAt"=NULL WHERE id=ANY($1::uuid[])',
      [h.payload().legs.map((l) => l.accountId)],
    );
  }
}, 15000);
