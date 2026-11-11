# S05 adversarial review reproduction artifact

Review target: `12433608f7a7de51f3f445dd333a74b77fd9fd4b`, 2026-11-11. This is a documentation artifact, not an application change or a replacement for the integration suite.

Prerequisites: run from the repository root with installed dependencies, Node 22.22.0, and local PostgreSQL 17.6 reachable using the private `.env.development.local` profile. `TEST_DATABASE_URL` must be loopback and end in `_test`; `DATABASE_URL` must be loopback. The local administrator needs CREATE DATABASE/CREATE ROLE and visibility into lock waits. Do not use hosted or real financial data. Connection strings/secrets are never printed. Mutations occur only in a newly generated scratch database; existing local test/development catalogs and migration history are read-only. The scratch database and NOLOGIN writer role are removed in `finally`.

The temporary writer has broad table DML to probe constraints, but no ownership/DDL/replication privileges. It is deliberately different from the published SELECT-only financial runtime grants. `npm run test:schema` separately verifies those private-schema runtime grants.

Extract and run the exact probe source:

````sh
python3 - <<'PYCODE'
from pathlib import Path
artifact = Path("docs/security/evidence/S05_ADVERSARIAL_PROBES.md").read_text()
source = artifact.split("```javascript\n", 1)[1].split("\n```", 1)[0]
Path("/private/tmp/ledgerone-s05-adversarial-review.mjs").write_text(source + "\n")
PYCODE
node --check /private/tmp/ledgerone-s05-adversarial-review.mjs
node /private/tmp/ledgerone-s05-adversarial-review.mjs
````

The command executes all six migrations and the complete 48-test integration suite on the new database, then independent probes. It saves redacted results to `/private/tmp/ledgerone-s05-adversarial-evidence.json`. Expected acceptance of the documented gaps is evidence of those gaps; exit 0 is not an unconditional accounting approval. The destructive drift experiment is last and runs only in the scratch database.

## Historical reproduction scope

The following source/results target S05 commit `1243360` and its six migrations/48 integration tests. To reproduce historical behavior after later changes, save the source outside the checkout and use that reviewed checkout with its matching generated dependencies. S06 migration 007 intentionally changes correction/audit behavior; its automated `command-controls.test.ts` regressions are the current verification. Do not run the historical harness on the new schema and interpret its old expected counts/acceptances as current invariants.

## Executed source

```javascript
import { createRequire } from "node:module";
import { randomUUID, randomBytes, createHash } from "node:crypto";
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import assert from "node:assert/strict";
const require = createRequire(process.cwd() + "/package.json");
const pg = require("pg");
require("dotenv").config({ path: ".env.development.local", quiet: true });
const testURL = new URL(process.env.TEST_DATABASE_URL);
assert(["localhost", "127.0.0.1", "[::1]"].includes(testURL.hostname));
assert(/_test$/.test(testURL.pathname));
const admin = new pg.Client({ connectionString: testURL.toString() });
await admin.connect();
const stamp = randomBytes(5).toString("hex"),
  dbName = `s05_review_${stamp}_test`,
  writer = `s05_writer_${stamp}`;
const url = new URL(testURL);
url.pathname = `/${dbName}`;
let client;
const evidence = [];
const record = (name, data) => {
  evidence.push({ name, ...data });
  console.log(JSON.stringify(evidence.at(-1)));
};
const err = (e) => ({
  code: e.code ?? "assertion",
  message: String(e.message).split("\n")[0],
});
const migrationEnv = {
  ...process.env,
  LEDGERONE_ENV: "test",
  DATABASE_URL: url.toString(),
  DIRECT_DATABASE_URL: url.toString(),
};
const prisma = (...args) =>
  spawnSync(process.execPath, ["node_modules/prisma/build/index.js", ...args], {
    env: migrationEnv,
    encoding: "utf8",
  });
async function tx(work, isolation = "READ COMMITTED", c = client) {
  await c.query(`BEGIN ISOLATION LEVEL ${isolation}`);
  try {
    const out = await work(c);
    await c.query("COMMIT");
    return out;
  } catch (e) {
    await c.query("ROLLBACK");
    throw e;
  }
}
const owner = randomUUID(),
  workspace = randomUUID(),
  bank = randomUUID(),
  expense = randomUUID(),
  equity = randomUUID();
async function receipt(c, kind = "POST", key = randomUUID()) {
  const id = randomUUID();
  await c.query(
    'INSERT INTO ledger_operation(id,"workspaceId","ownerId","idempotencyKey","requestHash",kind) VALUES($1,$2,$3,$4,$5,$6)',
    [id, workspace, owner, key, "a".repeat(64), kind],
  );
  return id;
}
async function draft(
  c,
  amount = "100",
  kind = "GENERAL",
  original = null,
  reversed = false,
) {
  const id = randomUUID();
  await c.query(
    'INSERT INTO journal(id,"workspaceId","ownerId","effectiveAt",kind,"reversesJournalId",description) VALUES($1,$2,$3,$4,$5,$6,$7)',
    [
      id,
      workspace,
      owner,
      "2026-01-01T00:00:00Z",
      kind,
      original,
      "original header",
    ],
  );
  const legs =
    kind === "OPENING"
      ? [
          [bank, "DEBIT"],
          [equity, "CREDIT"],
        ]
      : [
          [expense, reversed ? "CREDIT" : "DEBIT"],
          [bank, reversed ? "DEBIT" : "CREDIT"],
        ];
  for (const [account, side] of legs)
    await c.query(
      'INSERT INTO posting(id,"journalId","workspaceId","ownerId","accountId","currencyCode",side,"nativeMinor","functionalMinor") VALUES($1,$2,$3,$4,$5,\'INR\',$6,$7,$7)',
      [randomUUID(), id, workspace, owner, account, side, amount],
    );
  return id;
}
async function seal(c, id, op) {
  await c.query(
    'UPDATE journal SET status=\'POSTED\',"postedAt"=CURRENT_TIMESTAMP,"operationId"=$1 WHERE id=$2',
    [op, id],
  );
}
async function post(amount = "100") {
  return tx(async (c) => {
    const id = await draft(c, amount);
    await seal(c, id, await receipt(c));
    return id;
  });
}
async function reject(name, fn, code) {
  try {
    await fn();
    record(name, { outcome: "UNEXPECTED_ACCEPT" });
  } catch (e) {
    assert.equal(e.code, code);
    record(name, { outcome: "REJECTED", ...err(e) });
  }
}
const catalogSQL = `SELECT 'constraint:'||c.conname AS key, pg_get_constraintdef(c.oid) AS definition FROM pg_constraint c JOIN pg_namespace n ON n.oid=c.connamespace WHERE n.nspname='public'
UNION ALL SELECT 'trigger:'||t.tgname||':'||r.relname,pg_get_triggerdef(t.oid)||':'||t.tgenabled::text FROM pg_trigger t JOIN pg_class r ON r.oid=t.tgrelid JOIN pg_namespace n ON n.oid=r.relnamespace WHERE n.nspname='public' AND NOT t.tgisinternal
UNION ALL SELECT 'function:'||p.proname||':'||pg_get_function_identity_arguments(p.oid),pg_get_functiondef(p.oid) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' ORDER BY key`;
try {
  await admin.query(`CREATE DATABASE "${dbName}"`);
  client = new pg.Client({ connectionString: url.toString() });
  await client.connect();
  const migration = prisma("migrate", "deploy");
  assert.equal(migration.status, 0, "fresh migrations failed, output withheld");
  record("environment", {
    node: process.version,
    postgres: (await client.query("SHOW server_version")).rows[0]
      .server_version,
    migrations: "001–006 fresh deploy: exit 0",
  });
  const freshCatalog = (await client.query(catalogSQL)).rows;
  const existingCatalog = (await admin.query(catalogSQL)).rows;
  const freshMap = new Map(freshCatalog.map((x) => [x.key, x.definition])),
    oldMap = new Map(existingCatalog.map((x) => [x.key, x.definition]));
  const catalogDiff = [
    ...new Set([...freshMap.keys(), ...oldMap.keys()]),
  ].filter((k) => freshMap.get(k) !== oldMap.get(k));
  record("existing_test_catalog_vs_fresh", {
    objects: freshCatalog.length,
    differences: catalogDiff,
  });
  const history = (
    await admin.query(
      "SELECT migration_name,checksum FROM _prisma_migrations WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL ORDER BY migration_name",
    )
  ).rows;
  const files = readdirSync("prisma/migrations")
    .filter((x) => /^\d/.test(x))
    .sort();
  assert.deepEqual(
    history.map((x) => x.migration_name),
    files,
  );
  assert(
    history.every(
      (x) =>
        x.checksum ===
        createHash("sha256")
          .update(
            readFileSync(`prisma/migrations/${x.migration_name}/migration.sql`),
          )
          .digest("hex"),
    ),
  );
  record("existing_test_migration_checksums", {
    count: history.length,
    match: true,
  });
  const freshIntegration = spawnSync(
    process.execPath,
    ["node_modules/vitest/vitest.mjs", "run", "--project", "integration"],
    {
      encoding: "utf8",
      env: { ...migrationEnv, TEST_DATABASE_URL: url.toString() },
    },
  );
  assert.equal(
    freshIntegration.status,
    0,
    "Fresh database integration suite failed; output withheld",
  );
  const freshText = freshIntegration.stdout + freshIntegration.stderr;
  assert(/Tests\s+48 passed/.test(freshText));
  record("fresh_database_integration_suite", {
    exit: freshIntegration.status,
    tests: 48,
    files: 4,
  });
  await client.query(
    'INSERT INTO auth_user(id,name,email,"emailVerified","updatedAt") VALUES($1,\'Review fixture\',$2,true,NOW())',
    [owner, `${owner}@ledgerone.test`],
  );
  await client.query(
    'INSERT INTO workspace(id,"ownerId",name,"updatedAt") VALUES($1,$2,\'Review fixture\',NOW())',
    [workspace, owner],
  );
  for (const [id, type, kind, name] of [
    [bank, "ASSET", "BANK", "Bank"],
    [expense, "EXPENSE", "EXPENSE", "Groceries"],
    [equity, "EQUITY", "OPENING_EQUITY", "Opening equity"],
  ])
    await client.query(
      'INSERT INTO ledger_account(id,"workspaceId","ownerId",name,type,kind,"currencyCode","updatedAt") VALUES($1,$2,$3,$4,$5,$6,\'INR\',NOW())',
      [id, workspace, owner, name, type, kind],
    );
  await admin.query(
    `CREATE ROLE "${writer}" NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS`,
  );
  await client.query(
    `GRANT USAGE ON SCHEMA public TO "${writer}"; GRANT SELECT,INSERT,UPDATE,DELETE ON ALL TABLES IN SCHEMA public TO "${writer}"`,
  );
  await client.query(`SET ROLE "${writer}"`);
  record("ledger_function_security", {
    functions: (
      await client.query(
        "SELECT proname,prosecdef,proconfig FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND proname LIKE 'ledger05%' ORDER BY proname",
      )
    ).rows,
  });
  await reject(
    "writer_ddl_denied",
    () => tx((c) => c.query("ALTER TABLE journal DISABLE TRIGGER ALL")),
    "42501",
  );
  await reject(
    "writer_replication_bypass_denied",
    () => tx((c) => c.query("SET session_replication_role=replica")),
    "42501",
  );
  const original = await post();
  await reject(
    "posted_header_change",
    () =>
      tx((c) =>
        c.query("UPDATE journal SET description='rewritten' WHERE id=$1", [
          original,
        ]),
      ),
    "23514",
  );
  await tx((c) =>
    c.query("UPDATE ledger_account SET name='Rent' WHERE id=$1", [expense]),
  );
  const labels = await client.query(
    'SELECT a.name FROM posting p JOIN ledger_account a ON a.id=p."accountId" WHERE p."journalId"=$1 AND a.id=$2',
    [original, expense],
  );
  record("mutable_account_name", {
    old: "Groceries",
    historicalJoinNow: labels.rows[0].name,
    auditEvents: (
      await client.query(
        'SELECT count(*)::int AS n FROM audit_event WHERE \"ownerId\"=$1',
        [owner],
      )
    ).rows[0].n,
  });
  const stale = await tx((c) => draft(c));
  const revisionBefore = (
    await client.query("SELECT revision FROM journal WHERE id=$1", [stale])
  ).rows[0].revision;
  await tx((c) =>
    c.query(
      "UPDATE journal SET description='changed after preview',\"effectiveAt\"='2026-02-01' WHERE id=$1",
      [stale],
    ),
  );
  const revisionAfter = (
    await client.query("SELECT revision FROM journal WHERE id=$1", [stale])
  ).rows[0].revision;
  let accepted = false;
  await tx(async (c) => {
    const op = await receipt(c);
    const result = await c.query(
      'UPDATE journal SET status=\'POSTED\',"postedAt"=NOW(),"operationId"=$1 WHERE id=$2 AND revision=$3 RETURNING description',
      [op, stale, revisionBefore],
    );
    accepted = result.rowCount === 1;
  });
  record("stale_header_revision_compare", {
    revisionBefore,
    revisionAfter,
    staleFinalizeAccepted: accepted,
    effectiveAt: (
      await client.query('SELECT \"effectiveAt\" FROM journal WHERE id=$1', [
        stale,
      ])
    ).rows[0].effectiveAt,
  });
  const correctedOwn = await tx(async (c) => {
    const op = await receipt(c, "CORRECT");
    const replacement = await draft(c);
    await seal(c, replacement, op);
    const reversal = await draft(c, "100", "REVERSAL", replacement, true);
    await seal(c, reversal, op);
    return { replacement, reversal };
  });
  record("correction_targets_own_replacement", { accepted: true, journals: 2 });
  const opening = await tx(async (c) => {
    const id = await draft(c, "500", "OPENING");
    await c.query(
      'INSERT INTO opening_balance(id,"workspaceId","ownerId","accountId","journalId",source) VALUES($1,$2,$3,$4,$5,\'statement\')',
      [randomUUID(), workspace, owner, bank, id],
    );
    await seal(c, id, await receipt(c, "OPENING"));
    return id;
  });
  await reject(
    "opening_marker_rewrite",
    () =>
      tx((c) =>
        c.query(
          "UPDATE opening_balance SET source='new statement' WHERE \"journalId\"=$1",
          [opening],
        ),
      ),
    "23514",
  );
  await reject(
    "second_opening_for_same_account",
    () =>
      tx(async (c) => {
        const id = await draft(c, "600", "OPENING");
        await c.query(
          'INSERT INTO opening_balance(id,"workspaceId","ownerId","accountId","journalId",source) VALUES($1,$2,$3,$4,$5,\'new statement\')',
          [randomUUID(), workspace, owner, bank, id],
        );
        await seal(c, id, await receipt(c, "OPENING"));
      }),
    "23505",
  );
  // Generic CORRECT can retain the original marker while replacing opening amounts using GENERAL.
  await tx(async (c) => {
    const op = await receipt(c, "CORRECT");
    const rev = randomUUID();
    await c.query(
      'INSERT INTO journal(id,"workspaceId","ownerId","effectiveAt",kind,"reversesJournalId") VALUES($1,$2,$3,$4,\'REVERSAL\',$5)',
      [rev, workspace, owner, "2026-01-01", opening],
    );
    for (const [account, side] of [
      [bank, "CREDIT"],
      [equity, "DEBIT"],
    ])
      await c.query(
        'INSERT INTO posting(id,"journalId","workspaceId","ownerId","accountId","currencyCode",side,"nativeMinor","functionalMinor") VALUES($1,$2,$3,$4,$5,\'INR\',$6,500,500)',
        [randomUUID(), rev, workspace, owner, account, side],
      );
    await seal(c, rev, op);
    const rep = randomUUID();
    await c.query(
      'INSERT INTO journal(id,"workspaceId","ownerId","effectiveAt") VALUES($1,$2,$3,$4)',
      [rep, workspace, owner, "2026-01-01"],
    );
    for (const [account, side] of [
      [bank, "DEBIT"],
      [equity, "CREDIT"],
    ])
      await c.query(
        'INSERT INTO posting(id,"journalId","workspaceId","ownerId","accountId","currencyCode",side,"nativeMinor","functionalMinor") VALUES($1,$2,$3,$4,$5,\'INR\',$6,600,600)',
        [randomUUID(), rep, workspace, owner, account, side],
      );
    await seal(c, rep, op);
  });
  record("opening_correction_general_replacement", {
    accepted: true,
    originalMarkerRetained: true,
  });
  await tx((c) =>
    c.query('UPDATE ledger_account SET "archivedAt"=NOW() WHERE id=$1', [bank]),
  );
  await reject(
    "archived_reversal",
    () =>
      tx(async (c) => {
        const id = await draft(c, "100", "REVERSAL", original, true);
        await seal(c, id, await receipt(c, "REVERSE"));
      }),
    "23514",
  );
  await tx((c) =>
    c.query('UPDATE ledger_account SET "archivedAt"=NULL WHERE id=$1', [bank]),
  );
  await tx(async (c) => {
    const id = await draft(c, "100", "REVERSAL", original, true);
    await seal(c, id, await receipt(c, "REVERSE"));
  });
  record("unarchive_then_reversal", { accepted: true });
  await reject(
    "duplicate_full_reversal",
    () =>
      tx(async (c) => {
        const id = await draft(c, "100", "REVERSAL", original, true);
        await seal(c, id, await receipt(c, "REVERSE"));
      }),
    "23505",
  );
  await reject(
    "self_reversal",
    () =>
      tx((c) =>
        c.query(
          'INSERT INTO journal(id,"workspaceId","ownerId","effectiveAt",kind,"reversesJournalId") VALUES($1,$2,$3,NOW(),\'REVERSAL\',$1)',
          [randomUUID(), workspace, owner],
        ),
      ),
    "23514",
  );
  await reject(
    "unbalanced",
    () =>
      tx(async (c) => {
        const id = await draft(c);
        await c.query(
          'UPDATE posting SET "nativeMinor"=99,"functionalMinor"=99 WHERE "journalId"=$1 AND side=\'CREDIT\'',
          [id],
        );
        await seal(c, id, await receipt(c));
      }),
    "23514",
  );
  await reject(
    "over_500_legs",
    () =>
      tx(async (c) => {
        const id = await draft(c);
        await c.query(
          'INSERT INTO posting(id,"journalId","workspaceId","ownerId","accountId","currencyCode",side,"nativeMinor","functionalMinor") SELECT gen_random_uuid(),$1,$2,$3,$4,\'INR\',CASE WHEN i%2=0 THEN \'CREDIT\'::"PostingSide" ELSE \'DEBIT\'::"PostingSide" END,1,1 FROM generate_series(1,500) i',
          [id, workspace, owner, bank],
        );
        await seal(c, id, await receipt(c));
      }),
    "23514",
  );
  // Independently check SERIALIZABLE stale-reader behavior with a second transaction.
  const serialDraft = await tx((c) => draft(c));
  const second = new pg.Client({ connectionString: url.toString() });
  await second.connect();
  try {
    await second.query("BEGIN ISOLATION LEVEL SERIALIZABLE");
    await second.query("SELECT revision FROM journal WHERE id=$1", [
      serialDraft,
    ]);
    await tx((c) =>
      c.query(
        'UPDATE posting SET "nativeMinor"=101,"functionalMinor"=101 WHERE "journalId"=$1',
        [serialDraft],
      ),
    );
    await reject(
      "serializable_stale_finalization",
      async () => {
        try {
          await seal(second, serialDraft, await receipt(second));
          await second.query("COMMIT");
        } finally {
          await second.query("ROLLBACK");
        }
      },
      "40001",
    );
  } finally {
    await second.end();
  }
  async function freshConnection() {
    const c = new pg.Client({ connectionString: url.toString() });
    await c.connect();
    await c.query(`SET ROLE "${writer}"`);
    return c;
  }
  async function waitForLock(pid) {
    const end = Date.now() + 4000;
    while (Date.now() < end) {
      const r = await admin.query(
        "SELECT wait_event_type FROM pg_stat_activity WHERE pid=$1",
        [pid],
      );
      if (r.rows[0]?.wait_event_type === "Lock") return;
      await new Promise((r) => setTimeout(r, 10));
    }
    throw new Error("Expected lock wait missing");
  }
  for (const isolation of [
    "READ COMMITTED",
    "REPEATABLE READ",
    "SERIALIZABLE",
  ]) {
    const id = await tx((c) => draft(c));
    const first = await freshConnection(),
      second = await freshConnection();
    let pending;
    try {
      await first.query(`BEGIN ISOLATION LEVEL ${isolation}`);
      await second.query(`BEGIN ISOLATION LEVEL ${isolation}`);
      await second.query("SELECT revision FROM journal WHERE id=$1", [id]);
      const op1 = await receipt(first),
        op2 = await receipt(second);
      await seal(first, id, op1);
      const pid = (await second.query("SELECT pg_backend_pid() AS pid")).rows[0]
        .pid;
      pending = seal(second, id, op2).then(
        () => ({ success: true }),
        (e) => ({ error: e }),
      );
      await waitForLock(pid);
      await first.query("COMMIT");
      const result = await pending;
      assert(result.error);
      assert.equal(
        result.error.code,
        isolation === "READ COMMITTED" ? "23514" : "40001",
      );
      await second.query("ROLLBACK");
      const out = (
        await client.query(
          "SELECT status,(SELECT count(*)::int FROM ledger_operation WHERE id=ANY($2::uuid[])) AS operations FROM journal WHERE id=$1",
          [id, [op1, op2]],
        )
      ).rows[0];
      assert.equal(out.operations, 1);
      record("concurrent_finalization_" + isolation, {
        secondError: result.error.code,
        ...out,
      });
    } finally {
      await first.query("ROLLBACK");
      await second.query("ROLLBACK");
      await pending;
      await first.end();
      await second.end();
    }
  }
  {
    const ids = await tx(async (c) => [await draft(c), await draft(c)]);
    const first = await freshConnection(),
      second = await freshConnection();
    let pending;
    try {
      await first.query("BEGIN");
      await second.query("BEGIN");
      const key = randomUUID();
      await seal(first, ids[0], await receipt(first, "POST", key));
      const pid = (await second.query("SELECT pg_backend_pid() AS pid")).rows[0]
        .pid;
      pending = receipt(second, "POST", key).then(
        () => ({ success: true }),
        (e) => ({ error: e }),
      );
      await waitForLock(pid);
      await first.query("COMMIT");
      const result = await pending;
      assert.equal(result.error?.code, "23505");
      await second.query("ROLLBACK");
      const n = (
        await client.query(
          'SELECT count(*)::int AS n FROM ledger_operation WHERE \"idempotencyKey\"=$1',
          [key],
        )
      ).rows[0].n;
      assert.equal(n, 1);
      record("concurrent_duplicate_key", {
        secondError: result.error.code,
        successfulReceipts: n,
      });
    } finally {
      await first.query("ROLLBACK");
      await second.query("ROLLBACK");
      await pending;
      await first.end();
      await second.end();
    }
  }
  await client.query("RESET ROLE");
  const devURL = new URL(process.env.DATABASE_URL);
  assert(["localhost", "127.0.0.1", "[::1]"].includes(devURL.hostname));
  const dev = new pg.Client({ connectionString: devURL.toString() });
  await dev.connect();
  try {
    const rows = (await dev.query(catalogSQL)).rows;
    const map = new Map(rows.map((x) => [x.key, x.definition]));
    record("existing_development_catalog_vs_fresh", {
      objects: rows.length,
      differences: [...new Set([...freshMap.keys(), ...map.keys()])].filter(
        (k) => freshMap.get(k) !== map.get(k),
      ),
    });
  } finally {
    await dev.end();
  }
  const before = prisma(
    "migrate",
    "diff",
    "--from-config-datasource",
    "--to-schema",
    "prisma/schema.prisma",
    "--exit-code",
  );
  assert.equal(before.status, 0);
  await client.query(
    "ALTER TABLE posting DROP CONSTRAINT posting_fx_not_enabled; DROP TRIGGER journal_balanced_at_commit ON journal; DROP TRIGGER posting_balanced_at_commit ON posting",
  );
  const after = prisma(
    "migrate",
    "diff",
    "--from-config-datasource",
    "--to-schema",
    "prisma/schema.prisma",
    "--exit-code",
  );
  const scratchHistory = (
    await client.query(
      "SELECT migration_name,checksum FROM _prisma_migrations WHERE finished_at IS NOT NULL",
    )
  ).rows;
  record("invariant_catalog_drift_coverage", {
    prismaDiffBefore: before.status,
    prismaDiffAfterRemovingChecksAndTriggers: after.status,
    appliedChecksumsStillMatch: scratchHistory.every(
      (x) =>
        x.checksum ===
        createHash("sha256")
          .update(
            readFileSync(`prisma/migrations/${x.migration_name}/migration.sql`),
          )
          .digest("hex"),
    ),
  });
} finally {
  await client?.end();
  await admin.query(`DROP DATABASE IF EXISTS "${dbName}" WITH (FORCE)`);
  await admin.query(`DROP ROLE IF EXISTS "${writer}"`);
  await admin.end();
  writeFileSync(
    "/private/tmp/ledgerone-s05-adversarial-evidence.json",
    JSON.stringify(evidence, null, 2) + "\n",
    { mode: 0o600 },
  );
}
```

## Recorded successful run

```json
[
  {
    "name": "environment",
    "node": "v22.22.0",
    "postgres": "17.6",
    "migrations": "001–006 fresh deploy: exit 0"
  },
  {
    "name": "existing_test_catalog_vs_fresh",
    "objects": 89,
    "differences": []
  },
  {
    "name": "existing_test_migration_checksums",
    "count": 6,
    "match": true
  },
  {
    "name": "fresh_database_integration_suite",
    "exit": 0,
    "tests": 48,
    "files": 4
  },
  {
    "name": "ledger_function_security",
    "functions": [
      {
        "proname": "ledger05_account_identity",
        "prosecdef": false,
        "proconfig": ["search_path=pg_catalog, public, pg_temp"]
      },
      {
        "proname": "ledger05_assert_journal",
        "prosecdef": false,
        "proconfig": ["search_path=pg_catalog, public, pg_temp"]
      },
      {
        "proname": "ledger05_assert_operation",
        "prosecdef": false,
        "proconfig": ["search_path=pg_catalog, public, pg_temp"]
      },
      {
        "proname": "ledger05_immutable",
        "prosecdef": false,
        "proconfig": ["search_path=pg_catalog, public, pg_temp"]
      },
      {
        "proname": "ledger05_journal_commit",
        "prosecdef": false,
        "proconfig": ["search_path=pg_catalog, public, pg_temp"]
      },
      {
        "proname": "ledger05_journal_guard",
        "prosecdef": false,
        "proconfig": ["search_path=pg_catalog, public, pg_temp"]
      },
      {
        "proname": "ledger05_no_truncate",
        "prosecdef": false,
        "proconfig": ["search_path=pg_catalog, public, pg_temp"]
      },
      {
        "proname": "ledger05_operation_commit",
        "prosecdef": false,
        "proconfig": ["search_path=pg_catalog, public, pg_temp"]
      },
      {
        "proname": "ledger05_touch_draft",
        "prosecdef": false,
        "proconfig": ["search_path=pg_catalog, public, pg_temp"]
      }
    ]
  },
  {
    "name": "writer_ddl_denied",
    "outcome": "REJECTED",
    "code": "42501",
    "message": "must be owner of table journal"
  },
  {
    "name": "writer_replication_bypass_denied",
    "outcome": "REJECTED",
    "code": "42501",
    "message": "permission denied to set parameter \"session_replication_role\""
  },
  {
    "name": "posted_header_change",
    "outcome": "REJECTED",
    "code": "23514",
    "message": "Posted journal is immutable; use a reversal"
  },
  {
    "name": "mutable_account_name",
    "old": "Groceries",
    "historicalJoinNow": "Rent",
    "auditEvents": 0
  },
  {
    "name": "stale_header_revision_compare",
    "revisionBefore": 2,
    "revisionAfter": 2,
    "staleFinalizeAccepted": true,
    "effectiveAt": "2026-02-01T00:00:00.000Z"
  },
  {
    "name": "correction_targets_own_replacement",
    "accepted": true,
    "journals": 2
  },
  {
    "name": "opening_marker_rewrite",
    "outcome": "REJECTED",
    "code": "23514",
    "message": "Only an existing draft can be edited"
  },
  {
    "name": "second_opening_for_same_account",
    "outcome": "REJECTED",
    "code": "23505",
    "message": "duplicate key value violates unique constraint \"opening_balance_accountId_workspaceId_ownerId_key\""
  },
  {
    "name": "opening_correction_general_replacement",
    "accepted": true,
    "originalMarkerRetained": true
  },
  {
    "name": "archived_reversal",
    "outcome": "REJECTED",
    "code": "23514",
    "message": "Account is missing or archived"
  },
  {
    "name": "unarchive_then_reversal",
    "accepted": true
  },
  {
    "name": "duplicate_full_reversal",
    "outcome": "REJECTED",
    "code": "23505",
    "message": "duplicate key value violates unique constraint \"journal_reversesJournalId_workspaceId_ownerId_key\""
  },
  {
    "name": "self_reversal",
    "outcome": "REJECTED",
    "code": "23514",
    "message": "Reversal predecessor must already be posted"
  },
  {
    "name": "unbalanced",
    "outcome": "REJECTED",
    "code": "23514",
    "message": "Journal must have 2..500 balanced positive legs"
  },
  {
    "name": "over_500_legs",
    "outcome": "REJECTED",
    "code": "23514",
    "message": "Journal must have 2..500 balanced positive legs"
  },
  {
    "name": "serializable_stale_finalization",
    "outcome": "REJECTED",
    "code": "40001",
    "message": "could not serialize access due to concurrent update"
  },
  {
    "name": "concurrent_finalization_READ COMMITTED",
    "secondError": "23514",
    "status": "POSTED",
    "operations": 1
  },
  {
    "name": "concurrent_finalization_REPEATABLE READ",
    "secondError": "40001",
    "status": "POSTED",
    "operations": 1
  },
  {
    "name": "concurrent_finalization_SERIALIZABLE",
    "secondError": "40001",
    "status": "POSTED",
    "operations": 1
  },
  {
    "name": "concurrent_duplicate_key",
    "secondError": "23505",
    "successfulReceipts": 1
  },
  {
    "name": "existing_development_catalog_vs_fresh",
    "objects": 89,
    "differences": []
  },
  {
    "name": "invariant_catalog_drift_coverage",
    "prismaDiffBefore": 0,
    "prismaDiffAfterRemovingChecksAndTriggers": 0,
    "appliedChecksumsStillMatch": true
  }
]
```
