import { createHmac, randomBytes, randomUUID } from "node:crypto";
import pg from "pg";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../../src/generated/prisma/client";
import { createFreshLedgerDatabase } from "../../scripts/lib/fresh-ledger-database";
import { testDatabaseURL } from "./database";
import { captureLedgerInvariants } from "../../src/lib/ledger/invariants";
import { createAuth } from "../../src/lib/auth/create-auth";
import {
  PostExecutor,
  type Stage,
} from "../../src/lib/ledger/commands/executor";
import { postRequest } from "../../src/lib/ledger/commands/http";
export async function postHarness() {
  const lease = await createFreshLedgerDatabase(testDatabaseURL());
  const admin = new pg.Pool({ connectionString: lease.url, max: 10 });
  const database = new PrismaClient({
    adapter: new PrismaPg({ connectionString: lease.url }),
  });
  const role = `post_writer_${randomBytes(6).toString("hex")}`,
    password = randomBytes(24).toString("hex");
  let probe:
    | ((stage: Stage, c: pg.PoolClient, attempt: number) => Promise<void>)
    | undefined;
  let executor: PostExecutor | undefined;
  const users = Array.from({ length: 2 }, () => ({
    id: randomUUID(),
    workspace: randomUUID(),
    bank: randomUUID(),
    expense: randomUUID(),
    card: randomUUID(),
    session: randomUUID(),
    token: randomBytes(24).toString("hex"),
  }));
  const secret = randomBytes(32).toString("hex");
  const config = {
    baseURL: "http://127.0.0.1:3198",
    secret,
    googleClientId: "fixture",
    googleClientSecret: "fixture",
    configuredProviders: ["google"] as const,
    allowedEmails: new Set(users.map((u) => `${u.id}@ledgerone.test`)),
  };
  const runtime = { config, auth: createAuth(config, database) };
  async function cleanup() {
    await executor?.close();
    await database.$disconnect();
    await admin.end();
    await lease.cleanup();
    const source = new pg.Client({ connectionString: testDatabaseURL() });
    await source.connect();
    try {
      await source.query(`DROP ROLE IF EXISTS "${role}"`);
    } finally {
      await source.end();
    }
  }
  try {
    await admin.query(
      `CREATE ROLE "${role}" LOGIN PASSWORD '${password}' NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS`,
    );
    await admin.query(`GRANT CONNECT ON DATABASE "${new URL(lease.url).pathname.slice(1)}" TO "${role}"; GRANT USAGE ON SCHEMA public TO "${role}";
      GRANT SELECT ON workspace,ledger_account,ledger_operation,journal,posting,audit_event,currency,opening_balance,fx_rate TO "${role}";
      GRANT INSERT ON ledger_operation,journal,posting,audit_event TO "${role}";
      GRANT UPDATE(id) ON workspace,ledger_account TO "${role}";
      GRANT UPDATE(status,"postedAt","operationId",revision) ON journal TO "${role}"`);
    const c = await admin.connect();
    let expected;
    try {
      expected = await captureLedgerInvariants(c, {
        schema: "public",
        roles: { [role]: "RUNTIME" },
      });
    } finally {
      c.release();
    }
    const url = new URL(lease.url);
    url.username = role;
    url.password = password;
    executor = await PostExecutor.disposable({
      runtimeURL: url.toString(),
      verifierURL: lease.url,
      expected,
      probe: async (...args) => probe?.(...args),
    });
    for (const u of users) {
      await database.user.create({
        data: {
          id: u.id,
          email: `${u.id}@ledgerone.test`,
          emailVerified: true,
          name: "POST fixture",
        },
      });
      await database.authSession.create({
        data: {
          id: u.session,
          userId: u.id,
          token: u.token,
          expiresAt: new Date(Date.now() + 3600000),
        },
      });
      await admin.query(
        'INSERT INTO workspace(id,"ownerId",name,"updatedAt") VALUES($1,$2,\'POST fixture\',NOW())',
        [u.workspace, u.id],
      );
      for (const [id, type, kind] of [
        [u.bank, "ASSET", "BANK"],
        [u.expense, "EXPENSE", "EXPENSE"],
        [u.card, "LIABILITY", "CREDIT_CARD"],
      ])
        await admin.query(
          'INSERT INTO ledger_account(id,"workspaceId","ownerId",name,type,kind,"currencyCode","updatedAt") VALUES($1,$2,$3,\'Fixture\',$4,$5,\'INR\',NOW())',
          [id, u.workspace, u.id, type, kind],
        );
    }
    return {
      admin,
      database,
      executor,
      users,
      runtime,
      role,
      expected,
      factory: async (mode: "empty" | "version" | "unavailable" | "owner") => {
        let baseline = expected;
        let runtimeURL = url.toString();
        const verifierURL = new URL(lease.url);
        if (mode === "empty") baseline = { version: "7", objects: {} };
        if (mode === "version") baseline = { ...expected, version: "unknown" };
        if (mode === "unavailable")
          verifierURL.password = "deliberately-invalid-fixture-password";
        if (mode === "owner") {
          runtimeURL = lease.url;
          const owner = decodeURIComponent(new URL(lease.url).username);
          const c = await admin.connect();
          try {
            baseline = await captureLedgerInvariants(c, {
              schema: "public",
              roles: { [owner]: "RUNTIME" },
            });
          } finally {
            c.release();
          }
        }
        return PostExecutor.disposable({
          runtimeURL,
          verifierURL: verifierURL.toString(),
          expected: baseline,
        });
      },
      setProbe: (fn: typeof probe) => {
        probe = fn;
      },
      cookie: (index: number) => {
        const token = users[index]!.token;
        return `ledgerone.session_token=${encodeURIComponent(token + "." + createHmac("sha256", secret).update(token).digest("base64"))}`;
      },
      payload: (index = 0) => ({
        kind: "POST",
        effectiveAt: "2026-01-01T00:00:00Z",
        reason: "Controlled fixture purchase",
        description: "Example",
        legs: [
          {
            accountId: users[index]!.expense,
            side: "DEBIT",
            currency: "INR",
            amount: "10.00",
          },
          {
            accountId: users[index]!.bank,
            side: "CREDIT",
            currency: "INR",
            amount: "10",
          },
        ],
      }),
      api: async (
        index: number | null,
        key: string,
        data: unknown,
        extra: Record<string, string> = {},
        workspace = users[0]!.workspace,
        enabled = true,
      ) =>
        postRequest(
          new Request(
            config.baseURL + `/api/workspaces/${workspace}/ledger/commands`,
            {
              method: "POST",
              headers: {
                origin: config.baseURL,
                "content-type": "application/json",
                "idempotency-key": key,
                ...(index === null
                  ? {}
                  : {
                      cookie: `ledgerone.session_token=${encodeURIComponent(users[index]!.token + "." + createHmac("sha256", secret).update(users[index]!.token).digest("base64"))}`,
                    }),
                ...extra,
              },
              body: JSON.stringify(data),
            },
          ),
          workspace,
          runtime,
          enabled ? executor! : null,
        ),
      cleanup,
    };
  } catch (error) {
    await cleanup();
    throw error;
  }
}
