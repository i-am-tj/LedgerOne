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
    const { readFileSync } = await import("node:fs");
    const { createHash } = await import("node:crypto");
    const history = await upgraded.admin.query(
      "SELECT migration_name,checksum,finished_at,rolled_back_at FROM ledgerone._prisma_migrations ORDER BY migration_name",
    );
    expect(history.rows).toHaveLength(7);
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
