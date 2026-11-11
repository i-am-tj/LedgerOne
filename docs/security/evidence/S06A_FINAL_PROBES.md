# S06A independent final-review probes

Executed on 2026-11-11 against a newly generated local PostgreSQL 17.6 database. No hosted database, real financial records or production grants were used. All 21 assertions passed; these supplement rather than replace committed integration tests. The non-owner role has temporary financial DML only in the disposable database. Owner-level audit mutations test triggers independently of ACL denial.

Reproduce on macOS from the repository root after `npm ci` and local test-profile setup (Node 22.22.0, `tsx`, PostgreSQL CREATE DATABASE/CREATE ROLE privileges). Extract the following block to `/private/tmp/ledgerone-s06a-final-review.mjs`, then run `node --import tsx /private/tmp/ledgerone-s06a-final-review.mjs`. It emits only probe names, SQLSTATEs and assertions; no credentials. Source test DB is guarded loopback `*_test`; mutations occur only in a fresh disposable DB. On other operating systems use a writable temporary directory for both script and JSON output. Preserve failed disposable resources for diagnosis if safe cleanup refuses active connections.

```javascript
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import { randomUUID, randomBytes } from "node:crypto";
import { readFileSync, writeFileSync, readdirSync } from "node:fs";
import assert from "node:assert/strict";
const require = createRequire(process.cwd() + "/package.json");
const pg = require("pg");
require("dotenv").config({ path: ".env.development.local", quiet: true });
const mod = await import(
  pathToFileURL(process.cwd() + "/scripts/lib/fresh-ledger-database.ts")
);
const invariant = await import(
  pathToFileURL(process.cwd() + "/src/lib/ledger/invariant-manifest.ts")
);
const url = new URL(process.env.TEST_DATABASE_URL);
assert(["localhost", "127.0.0.1", "[::1]"].includes(url.hostname));
assert(url.pathname.endsWith("_test"));
const results = [];
const record = (name, detail) => {
  results.push({ name, ...detail });
  console.log(JSON.stringify(results.at(-1)));
};
const lease = await mod.createFreshLedgerDatabase(url.toString());
const c = new pg.Client({ connectionString: lease.url });
await c.connect();
const observer = new pg.Client({ connectionString: url.toString() });
await observer.connect();
const writer = "final_review_" + randomBytes(6).toString("hex");
let roleCreated = false;
const scopes = [0, 1].map(() => ({
  owner: randomUUID(),
  workspace: randomUUID(),
  bank: randomUUID(),
  expense: randomUUID(),
  equity: randomUUID(),
}));
async function tx(work) {
  await c.query("BEGIN");
  try {
    const out = await work();
    await c.query("COMMIT");
    return out;
  } catch (e) {
    await c.query("ROLLBACK");
    throw e;
  }
}
async function receipt(s, kind = "POST") {
  const id = randomUUID();
  await c.query(
    'INSERT INTO ledger_operation(id,"workspaceId","ownerId","idempotencyKey","requestHash",kind) VALUES($1,$2,$3,$4,$5,$6)',
    [id, s.workspace, s.owner, randomUUID(), "a".repeat(64), kind],
  );
  return id;
}
async function journal(
  s,
  op,
  kind = "GENERAL",
  original = null,
  reverse = false,
  amount = 100,
) {
  const id = randomUUID();
  await c.query(
    'INSERT INTO journal(id,"workspaceId","ownerId","effectiveAt",kind,"reversesJournalId") VALUES($1,$2,$3,$4,$5,$6)',
    [id, s.workspace, s.owner, "2026-01-01", kind, original],
  );
  const legs =
    kind === "OPENING"
      ? [
          [s.bank, "DEBIT"],
          [s.equity, "CREDIT"],
        ]
      : [
          [s.expense, reverse ? "CREDIT" : "DEBIT"],
          [s.bank, reverse ? "DEBIT" : "CREDIT"],
        ];
  for (const [account, side] of legs)
    await c.query(
      'INSERT INTO posting(id,"journalId","workspaceId","ownerId","accountId","currencyCode",side,"nativeMinor","functionalMinor") VALUES($1,$2,$3,$4,$5,\'INR\',$6,$7,$7)',
      [randomUUID(), id, s.workspace, s.owner, account, side, String(amount)],
    );
  if (kind === "OPENING")
    await c.query(
      'INSERT INTO opening_balance(id,"workspaceId","ownerId","accountId","journalId",source) VALUES($1,$2,$3,$4,$5,\'Review fixture\')',
      [randomUUID(), s.workspace, s.owner, s.bank, id],
    );
  await c.query(
    'UPDATE journal SET status=\'POSTED\',"postedAt"=NOW(),"operationId"=$1 WHERE id=$2',
    [op, id],
  );
  return id;
}
async function audit(s, op, target, action = "ledger.posted", actor = s.owner) {
  const id = randomUUID();
  await c.query(
    'INSERT INTO audit_event(id,"workspaceId","ownerId","actorId","requestId",action,"operationId","targetJournalId",reason) VALUES($1,$2,$3,$4,$5,$6,$7,$8,\'Independent review fixture\')',
    [id, s.workspace, s.owner, actor, randomUUID(), action, op, target],
  );
  return id;
}
async function counts() {
  return (
    await c.query(
      "SELECT (SELECT count(*) FROM journal)::int AS journals,(SELECT count(*) FROM posting)::int AS postings,(SELECT count(*) FROM ledger_operation)::int AS operations,(SELECT count(*) FROM audit_event)::int AS audits",
    )
  ).rows[0];
}
async function rejected(name, code, work) {
  const before = await counts();
  let seen;
  try {
    await tx(work);
  } catch (e) {
    seen = e;
  }
  assert.equal(seen?.code, code, name);
  assert.deepEqual(await counts(), before, name + " rollback");
  record(name, { sqlstate: code, allFourRowCountsUnchanged: true });
}
let ownedAudit;
try {
  for (const s of scopes) {
    await c.query(
      'INSERT INTO auth_user(id,name,email,"emailVerified","updatedAt") VALUES($1,\'Review owner\',$2,true,NOW())',
      [s.owner, `${s.owner}@ledgerone.test`],
    );
    await c.query(
      'INSERT INTO workspace(id,"ownerId",name,"updatedAt") VALUES($1,$2,\'Review\',NOW())',
      [s.workspace, s.owner],
    );
    for (const [id, type, kind] of [
      [s.bank, "ASSET", "BANK"],
      [s.expense, "EXPENSE", "EXPENSE"],
      [s.equity, "EQUITY", "OPENING_EQUITY"],
    ])
      await c.query(
        'INSERT INTO ledger_account(id,"workspaceId","ownerId",name,type,kind,"currencyCode","updatedAt") VALUES($1,$2,$3,\'Review\',$4,$5,\'INR\',NOW())',
        [id, s.workspace, s.owner, type, kind],
      );
  }
  await observer.query(
    `CREATE ROLE "${writer}" NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS`,
  );
  roleCreated = true;
  await c.query(
    `GRANT USAGE ON SCHEMA public TO "${writer}"; GRANT SELECT ON ALL TABLES IN SCHEMA public TO "${writer}"; GRANT INSERT,UPDATE,DELETE ON journal,posting,ledger_operation,opening_balance,ledger_account TO "${writer}"; GRANT INSERT ON audit_event TO "${writer}"`,
  );
  const a = scopes[0],
    b = scopes[1];
  await c.query(`SET ROLE "${writer}"`);
  const existing = [];
  for (const s of [a, a, a, b])
    existing.push(
      await tx(async () => {
        const op = await receipt(s);
        return { op, j: await journal(s, op) };
      }),
    );
  await rejected("existing foreign-owner operation", "23503", async () => {
    const op = await receipt(a),
      j = await journal(a, op);
    await audit(a, existing[3].op, j);
  });
  await rejected("existing foreign-owner target", "23503", async () => {
    const op = await receipt(a);
    await journal(a, op);
    await audit(a, op, existing[3].j);
  });
  await rejected("existing same-owner wrong operation", "23514", async () => {
    const op = await receipt(a),
      j = await journal(a, op);
    await audit(a, existing[1].op, j);
  });
  await rejected("existing same-owner wrong target", "23514", async () => {
    const op = await receipt(a);
    await journal(a, op);
    await audit(a, op, existing[1].j);
  });
  await rejected("existing foreign actor", "23514", async () => {
    const op = await receipt(a),
      j = await journal(a, op);
    await audit(a, op, j, "ledger.posted", b.owner);
  });
  await tx(async () => {
    const op = await receipt(a),
      j = await journal(a, op);
    ownedAudit = await audit(a, op, j);
  });
  record("restricted-writer valid POST audit", { committed: true });
  await tx(async () => {
    const op = await receipt(a, "REVERSE");
    await journal(a, op, "REVERSAL", existing[0].j, true);
    await audit(a, op, existing[0].j, "ledger.reversed");
  });
  record("restricted-writer exact REVERSE audit", { committed: true });
  await tx(async () => {
    const op = await receipt(a, "CORRECT");
    await journal(a, op, "REVERSAL", existing[1].j, true);
    await journal(a, op, "GENERAL", null, false, 200);
    await audit(a, op, existing[1].j, "ledger.corrected");
  });
  record("restricted-writer exact CORRECT audit", { committed: true });
  await rejected(
    "CORRECT audit names replacement instead of original",
    "23514",
    async () => {
      const op = await receipt(a, "CORRECT");
      await journal(a, op, "REVERSAL", existing[2].j, true);
      const replacement = await journal(a, op, "GENERAL", null, false, 200);
      await audit(a, op, replacement, "ledger.corrected");
    },
  );
  await rejected("CORRECT reverses its own replacement", "23514", async () => {
    const op = await receipt(a, "CORRECT"),
      replacement = await journal(a, op);
    await journal(a, op, "REVERSAL", replacement, true);
    await audit(a, op, replacement, "ledger.corrected");
  });
  await rejected(
    "OPENING audit action deliberately unavailable",
    "23514",
    async () => {
      const op = await receipt(a, "OPENING"),
        j = await journal(a, op, "OPENING");
      await audit(a, op, j, "ledger.opened");
    },
  );
  await c.query("RESET ROLE"); // Owner needed to exercise guards independently of UPDATE/DELETE ACL denial.
  for (const [field, value] of [
    ["reason", "rewritten"],
    ["operationId", existing[2].op],
    ["targetJournalId", existing[2].j],
    ["ownerId", b.owner],
  ])
    await rejected("immutable audit " + field, "23514", () =>
      c.query(`UPDATE audit_event SET "${field}"=$1 WHERE id=$2`, [
        value,
        ownedAudit,
      ]),
    );
  await rejected("immutable audit deletion", "23514", () =>
    c.query("DELETE FROM audit_event WHERE id=$1", [ownedAudit]),
  );
  await rejected("immutable audit truncation", "23514", () =>
    c.query("TRUNCATE audit_event"),
  );
  const manifest = await invariant.captureLedgerInvariants(c, {
    schema: "public",
    roles: { [writer]: "RUNTIME" },
  });
  await c.query("BEGIN");
  try {
    await c.query(`GRANT TRUNCATE ON posting TO "${writer}"`);
    const changed = await invariant.captureLedgerInvariants(c, {
      schema: "public",
      roles: { [writer]: "RUNTIME" },
    });
    assert.throws(() => invariant.assertLedgerInvariants(changed, manifest));
    record("role-normalized unexpected grant", { detected: true });
  } finally {
    await c.query("ROLLBACK");
  }
  // Actual legacy data is created before 007, under a separate disposable schema.
  await c.query(
    "CREATE SCHEMA legacy_review; SET search_path=legacy_review,pg_catalog",
  );
  for (const dir of readdirSync("prisma/migrations")
    .filter((x) => /^20261111000[1-6]_/.test(x))
    .sort())
    await c.query(
      readFileSync(`prisma/migrations/${dir}/migration.sql`, "utf8"),
    );
  const s = { owner: randomUUID(), workspace: randomUUID() };
  await c.query(
    "INSERT INTO auth_user(id,name,email,\"updatedAt\") VALUES($1,'Legacy',$2,NOW())",
    [s.owner, `${s.owner}@ledgerone.test`],
  );
  await c.query(
    'INSERT INTO workspace(id,"ownerId",name,"updatedAt") VALUES($1,$2,\'Legacy\',NOW())',
    [s.workspace, s.owner],
  );
  for (const action of ["workspace.created", "workspace.renamed"])
    await c.query(
      'INSERT INTO audit_event(id,"workspaceId","ownerId","actorId","requestId",action) VALUES($1,$2,$3,$3,$4,$5)',
      [randomUUID(), s.workspace, s.owner, randomUUID(), action],
    );
  const old = (
    await c.query(
      'SELECT id,"ownerId","actorId","workspaceId","requestId",action,"occurredAt" FROM audit_event ORDER BY id',
    )
  ).rows;
  await c.query(
    readFileSync(
      "prisma/migrations/202611110007_command_audit_controls/migration.sql",
      "utf8",
    ),
  );
  const after = (
    await c.query(
      'SELECT id,"ownerId","actorId","workspaceId","requestId",action,"occurredAt" FROM audit_event ORDER BY id',
    )
  ).rows;
  assert.deepEqual(after, old);
  assert(
    (
      await c.query(
        'SELECT "operationId","targetJournalId",reason FROM audit_event',
      )
    ).rows.every((x) => Object.values(x).every((v) => v === null)),
  );
  record("real pre-007 legacy audit upgrade", {
    recordsPreserved: old.length,
    financialContextNull: true,
  });
  await c.query("SET search_path=public,pg_catalog");
  let queryCalled = false;
  await assert.rejects(
    mod.dropDisposableLedgerDatabase(
      {
        query: async () => {
          queryCalled = true;
        },
      },
      "ledgerone_test",
    ),
  );
  assert.equal(queryCalled, false);
  record("unrelated database name refused", { sqlIssued: false });
} finally {
  await c.end();
  try {
    await lease.cleanup();
    assert.equal((await observer.query("SELECT 1 AS value")).rows[0].value, 1);
    record("unrelated existing connection survives reference cleanup", {
      usable: true,
    });
  } finally {
    if (roleCreated) await observer.query(`DROP ROLE "${writer}"`);
    await observer.end();
    writeFileSync(
      "/private/tmp/ledgerone-s06a-final-review-results.json",
      JSON.stringify(results, null, 2) + "\n",
      { mode: 0o600 },
    );
  }
}
```

Final output: 21 successful assertions; invalid references/actor/correction/audit edits returned 23503 or 23514 with all journal/posting/receipt/audit counts unchanged; valid restricted-writer POST/REVERSE/CORRECT committed; two actual pre-007 workspace audit records survived upgrade with null new context; an unrelated existing connection survived cleanup.
