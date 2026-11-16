import { SCHEMA_VERSION } from "../../src/lib/schema-version";
import { randomUUID } from "node:crypto";
import { spawnSync } from "node:child_process";
import pg from "pg";
import { expect, it } from "vitest";
import { createLegacyCaptureDatabase } from "../../scripts/lib/fresh-ledger-database";
import { testDatabaseURL } from "../support/database";
it.each(["public", "ledgerone"] as const)(
  "S08-B 010-to-011 %s upgrade preserves original expense evidence byte-for-byte",
  async (schema) => {
    const lease = await createLegacyCaptureDatabase(testDatabaseURL(), schema);
    const c = new pg.Client({
      connectionString: lease.url,
      options: `-c search_path=pg_catalog,${schema},pg_temp`,
    });
    try {
      await c.connect();
      const owner = randomUUID(),
        workspace = randomUUID(),
        bank = randomUUID(),
        expense = randomUUID(),
        op = randomUUID(),
        journal = randomUUID();
      await c.query(
        'INSERT INTO auth_user(id,name,email,"emailVerified","createdAt","updatedAt") VALUES($1,\'Upgrade owner\',$2,true,now(),now())',
        [owner, owner + "@ledgerone.test"],
      );
      await c.query(
        'INSERT INTO workspace(id,"ownerId",name,"updatedAt") VALUES($1,$2,\'Upgrade workspace\',now())',
        [workspace, owner],
      );
      await c.query(
        "INSERT INTO ledger_account(id,\"workspaceId\",\"ownerId\",name,type,kind,\"currencyCode\",\"updatedAt\") VALUES($1,$3,$4,'SBI Savings','ASSET','BANK','INR',now()),($2,$3,$4,'Groceries','EXPENSE','EXPENSE','INR',now())",
        [bank, expense, workspace, owner],
      );
      await c.query("BEGIN");
      await c.query(
        'INSERT INTO ledger_operation(id,"workspaceId","ownerId","idempotencyKey","requestHash",kind) VALUES($1,$2,$3,$4,$5,\'POST\')',
        [op, workspace, owner, randomUUID(), "a".repeat(64)],
      );
      await c.query(
        'INSERT INTO journal(id,"workspaceId","ownerId","effectiveAt",kind) VALUES($1,$2,$3,\'2026-01-15T00:00:00+05:30\',\'GENERAL\')',
        [journal, workspace, owner],
      );
      for (const [account, side] of [
        [bank, "CREDIT"],
        [expense, "DEBIT"],
      ])
        await c.query(
          'INSERT INTO posting(id,"journalId","workspaceId","ownerId","accountId","currencyCode",side,"nativeMinor","functionalMinor") VALUES($1,$2,$3,$4,$5,\'INR\',$6,85000,85000)',
          [randomUUID(), journal, workspace, owner, account, side],
        );
      await c.query(
        'UPDATE journal SET status=\'POSTED\',"postedAt"=now(),"operationId"=$1 WHERE id=$2',
        [op, journal],
      );
      await c.query(
        'INSERT INTO audit_event(id,"ownerId","workspaceId","actorId","requestId",action,"operationId","targetJournalId",reason) VALUES($1,$2,$3,$2,$4,\'ledger.posted\',$5,$6,\'Record expense\')',
        [randomUUID(), owner, workspace, randomUUID(), op, journal],
      );
      await c.query(
        'INSERT INTO transaction_record("operationId","workspaceId","ownerId",kind,"accountId","categoryAccountId","accountName","categoryName","amountMinor") VALUES($1,$2,$3,\'EXPENSE\',$4,$5,\'SBI Savings\',\'Groceries\',85000)',
        [op, workspace, owner, bank, expense],
      );
      await c.query("COMMIT");
      const snapshot = async () =>
        (
          await c.query(
            "SELECT jsonb_build_object('operation',(SELECT to_jsonb(o) FROM ledger_operation o WHERE id=$1),'journal',(SELECT to_jsonb(j) FROM journal j WHERE id=$2),'postings',(SELECT jsonb_agg(to_jsonb(p) ORDER BY id) FROM posting p WHERE \"journalId\"=$2),'audit',(SELECT to_jsonb(a) FROM audit_event a WHERE \"operationId\"=$1),'capture',(SELECT to_jsonb(t) FROM transaction_record t WHERE \"operationId\"=$1))::text evidence",
            [op, journal],
          )
        ).rows[0].evidence;
      const before = await snapshot(),
        history = (
          await c.query(
            "SELECT migration_name,checksum FROM _prisma_migrations ORDER BY migration_name",
          )
        ).rows;
      const migrated = spawnSync(
        process.execPath,
        ["node_modules/prisma/build/index.js", "migrate", "deploy"],
        {
          encoding: "utf8",
          env: {
            ...process.env,
            LEDGERONE_ENV: "test",
            DATABASE_URL: lease.url,
            DIRECT_DATABASE_URL: lease.url,
            TEST_DATABASE_URL: lease.url,
          },
        },
      );
      expect(migrated.status).toBe(0);
      expect(await snapshot()).toBe(before);
      expect(
        (
          await c.query(
            "SELECT value FROM app_metadata WHERE key='schema_version'",
          )
        ).rows[0].value,
      ).toBe(SCHEMA_VERSION);
      expect(
        (
          await c.query(
            "SELECT migration_name,checksum FROM _prisma_migrations ORDER BY migration_name",
          )
        ).rows.slice(0, 10),
      ).toEqual(history);
      expect(
        (await c.query("SELECT count(*)::int n FROM transaction_movement"))
          .rows[0].n,
      ).toBe(0);
    } finally {
      await c.end();
      await lease.cleanup();
    }
  },
  30000,
);
