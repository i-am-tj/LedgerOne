// P1-S04A: disposable local rehearsal; never connects to the hosted project.
import { randomBytes, randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import assert from "node:assert/strict";
import pg from "pg";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";
import { loadProfile } from "./load-env";
import { SCHEMA_VERSION } from "../src/lib/schema-version";
import { databaseSettings } from "../src/lib/profile";
import {
  captureLedgerInvariants,
  assertLedgerInvariants,
} from "../src/lib/ledger/invariant-manifest";

loadProfile("development");
const settings = databaseSettings(process.env);
const stamp = randomBytes(6).toString("hex");
const dbName = `ledgerone_profile_${stamp}_test`;
const migrator = `migrator_${stamp}`;
const appRole = `runtime_${stamp}`;
const password = randomBytes(32).toString("hex");
const admin = new pg.Client({ connectionString: settings.connectionString });
const adminUser = decodeURIComponent(
  new URL(settings.connectionString).username,
);
assert.match(adminUser, /^[a-z_][a-z0-9_]*$/);
await admin.connect();
let created = false;
let provision: pg.Client | undefined;
let runtime: PrismaClient | undefined;
try {
  await admin.query(`CREATE DATABASE "${dbName}"`);
  created = true;
  const target = new URL(settings.connectionString);
  target.pathname = `/${dbName}`;
  provision = new pg.Client({ connectionString: target.toString() });
  await provision.connect();
  const sql = readFileSync("docs/setup/supabase-bootstrap.sql", "utf8")
    .replaceAll("ledgerone_migrator", migrator)
    .replaceAll("ledgerone_app", appRole)
    .replace("TO postgres;", `TO "${adminUser}";`);
  await provision.query(sql);
  await provision.query(`ALTER ROLE "${migrator}" PASSWORD '${password}'`);
  await provision.query(`ALTER ROLE "${appRole}" PASSWORD '${password}'`);
  const migrationURL = new URL(target);
  migrationURL.username = migrator;
  migrationURL.password = password;
  migrationURL.searchParams.set("schema", "ledgerone");
  const result = spawnSync(
    process.execPath,
    ["node_modules/prisma/build/index.js", "migrate", "deploy"],
    {
      encoding: "utf8",
      env: {
        ...process.env,
        LEDGERONE_ENV: "test",
        DATABASE_URL: migrationURL.toString(),
        DIRECT_DATABASE_URL: migrationURL.toString(),
      },
    },
  );
  // Do not dump connection information from subprocess failures.
  assert.equal(
    result.status,
    0,
    "Private-schema migration failed (output withheld to protect credentials)",
  );
  await provision.query(
    readFileSync("docs/setup/supabase-runtime-grants.sql", "utf8").replaceAll(
      "ledgerone_app",
      appRole,
    ),
  );
  const drift = spawnSync(
    process.execPath,
    [
      "node_modules/prisma/build/index.js",
      "migrate",
      "diff",
      "--from-config-datasource",
      "--to-schema",
      "prisma/schema.prisma",
      "--exit-code",
    ],
    {
      encoding: "utf8",
      env: {
        ...process.env,
        LEDGERONE_ENV: "test",
        DATABASE_URL: migrationURL.toString(),
        DIRECT_DATABASE_URL: migrationURL.toString(),
      },
    },
  );
  assert.equal(
    drift.status,
    0,
    "Private-schema Prisma drift detected (output withheld)",
  );
  const invariantScope = {
    schema: "ledgerone",
    roles: { [migrator]: "MIGRATOR", [appRole]: "RUNTIME" },
  };
  const reviewedCatalog = await captureLedgerInvariants(
    provision,
    invariantScope,
  );
  assertLedgerInvariants(
    await captureLedgerInvariants(provision, invariantScope),
    reviewedCatalog,
  );
  const runtimeURL = new URL(target);
  runtimeURL.username = appRole;
  runtimeURL.password = password;
  runtime = new PrismaClient({
    adapter: new PrismaPg(
      { connectionString: runtimeURL.toString() },
      { schema: "ledgerone" },
    ),
  });
  assert.equal(
    (await runtime.appMetadata.findUnique({ where: { key: "schema_version" } }))
      ?.value,
    SCHEMA_VERSION,
  );
  const userId = randomUUID();
  await runtime.user.create({
    data: {
      id: userId,
      name: "Disposable rehearsal",
      email: `${stamp}@ledgerone.test`,
      emailVerified: true,
    },
  });
  await runtime.$transaction(async (tx) => {
    const workspace = await tx.workspace.create({
      data: { ownerId: userId, name: "Private schema" },
    });
    await tx.auditEvent.create({
      data: {
        ownerId: userId,
        actorId: userId,
        workspaceId: workspace.id,
        requestId: randomUUID(),
        action: "workspace.created",
      },
    });
  });
  assert.equal(await runtime.auditEvent.count(), 1);
  for (const forbidden of [
    "CREATE TABLE ledgerone.forbidden (id int)",
    "ALTER TABLE ledgerone.workspace ADD COLUMN forbidden int",
    "UPDATE ledgerone.audit_event SET action = action",
    "DELETE FROM ledgerone.audit_event",
    "TRUNCATE ledgerone.audit_event",
    "SELECT * FROM ledgerone._prisma_migrations",
  ])
    await assert.rejects(runtime.$queryRawUnsafe(forbidden));
  // The published S05 grant file intentionally keeps financial data read-only.
  const workspace = await runtime.workspace.findFirstOrThrow({
    where: { ownerId: userId },
  });
  const scope = { workspaceId: workspace.id, ownerId: userId };
  assert.equal(await runtime.account.count(), 0);
  await assert.rejects(
    runtime.account.create({
      data: {
        ...scope,
        name: "No grant",
        type: "ASSET",
        kind: "BANK",
        currencyCode: "INR",
      },
    }),
  );
  // Test a future command-writer role only in this disposable DB, with invoker
  // helpers explicitly granted. No deployed/runtime grant file is broadened.
  await provision.query(
    `GRANT INSERT, UPDATE, DELETE ON ledgerone.ledger_account, ledgerone.journal, ledgerone.posting, ledgerone.ledger_operation, ledgerone.opening_balance TO "${appRole}"`,
  );
  await provision.query(
    `GRANT EXECUTE ON FUNCTION ledgerone.ledger05_assert_journal(uuid), ledgerone.ledger05_assert_operation(uuid) TO "${appRole}"`,
  );
  const grantCatalog = await captureLedgerInvariants(provision, invariantScope);
  assert.throws(() => assertLedgerInvariants(grantCatalog, reviewedCatalog));
  const bank = await runtime.account.create({
    data: {
      ...scope,
      name: "Bank fixture",
      type: "ASSET",
      kind: "BANK",
      currencyCode: "INR",
    },
  });
  const expense = await runtime.account.create({
    data: {
      ...scope,
      name: "Expense fixture",
      type: "EXPENSE",
      kind: "EXPENSE",
      currencyCode: "INR",
    },
  });
  async function postFixture(credit: bigint) {
    return runtime!.$transaction(async (tx) => {
      const journal = await tx.journal.create({
        data: { ...scope, effectiveAt: new Date() },
      });
      for (const leg of [
        { accountId: expense.id, side: "DEBIT" as const, amount: 100n },
        { accountId: bank.id, side: "CREDIT" as const, amount: credit },
      ])
        await tx.posting.create({
          data: {
            ...scope,
            journalId: journal.id,
            accountId: leg.accountId,
            side: leg.side,
            currencyCode: "INR",
            nativeMinor: leg.amount,
            functionalMinor: leg.amount,
          },
        });
      const operation = await tx.ledgerOperation.create({
        data: {
          ...scope,
          idempotencyKey: randomUUID(),
          requestHash: "a".repeat(64),
          kind: "POST",
        },
      });
      const posted = await tx.journal.update({
        where: { id: journal.id },
        data: {
          status: "POSTED",
          postedAt: new Date(),
          operationId: operation.id,
        },
      });
      await tx.auditEvent.create({
        data: {
          ...scope,
          actorId: userId,
          requestId: randomUUID(),
          action: "ledger.posted",
          operationId: operation.id,
          targetJournalId: posted.id,
          reason: "Private-schema fixture",
        },
      });
      return posted;
    });
  }
  const posted = await postFixture(100n);
  await assert.rejects(postFixture(99n));
  assert.equal(await runtime.journal.count(), 1);
  await assert.rejects(
    runtime.journal.update({
      where: { id: posted.id },
      data: { description: "Cannot edit" },
    }),
  );
  await assert.rejects(
    runtime.$executeRawUnsafe("SET session_replication_role = replica"),
  );
  const publicTables = await provision.query(
    "SELECT count(*)::int AS count FROM information_schema.tables WHERE table_schema='public'",
  );
  assert.equal(publicTables.rows[0].count, 0);
  console.log(
    "PASS: fresh private-schema migrations and zero Prisma drift; production financial read-only grants; temporary invoker-role ledger balancing/rollback/immutability; protected audit and denied DDL/replication bypass/history access; no public tables.",
  );
} finally {
  await runtime?.$disconnect();
  await provision?.end();
  if (created) await admin.query(`DROP DATABASE "${dbName}" WITH (FORCE)`);
  await admin.query(`DROP ROLE IF EXISTS "${appRole}"`);
  await admin.query(`DROP ROLE IF EXISTS "${migrator}"`);
  await admin.end();
}
