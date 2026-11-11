// P1-S04A: disposable local rehearsal; never connects to the hosted project.
import { randomBytes, randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import assert from "node:assert/strict";
import pg from "pg";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";
import { loadProfile } from "./load-env";
import { databaseSettings } from "../src/lib/profile";

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
    "3",
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
  const publicTables = await provision.query(
    "SELECT count(*)::int AS count FROM information_schema.tables WHERE table_schema='public'",
  );
  assert.equal(publicTables.rows[0].count, 0);
  console.log(
    "PASS: fresh private-schema migrations, Prisma runtime reads/atomic writes, protected audit and denied DDL/migration-history access; no public tables.",
  );
} finally {
  await runtime?.$disconnect();
  await provision?.end();
  if (created) await admin.query(`DROP DATABASE "${dbName}" WITH (FORCE)`);
  await admin.query(`DROP ROLE IF EXISTS "${appRole}"`);
  await admin.query(`DROP ROLE IF EXISTS "${migrator}"`);
  await admin.end();
}
