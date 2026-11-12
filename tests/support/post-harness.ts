import type { MetricObserver } from "../../src/lib/ledger/verification/metrics";
import { readFileSync } from "node:fs";
import { createHmac, randomBytes, randomUUID } from "node:crypto";
import pg from "pg";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../../src/generated/prisma/client";
import {
  createFreshLedgerDatabase,
  createLocalPrivateLedgerDatabase,
} from "../../scripts/lib/fresh-ledger-database";
import { testDatabaseURL } from "./database";
import { captureLedgerInvariants } from "../../src/lib/ledger/invariants";
import { createAuth } from "../../src/lib/auth/create-auth";
import {
  PostExecutor,
  type Stage,
} from "../../src/lib/ledger/commands/executor";
import {
  postRequest,
  type PostTrace,
} from "../../src/lib/ledger/commands/http";
export async function postHarness(
  options: { schema?: "public" | "ledgerone"; upgrade?: boolean } = {},
) {
  const schema = options.schema ?? "public";
  if (schema !== "public" && schema !== "ledgerone")
    throw new Error("Unsupported fixture schema");
  if (options.upgrade && schema !== "ledgerone")
    throw new Error("Private upgrade fixture required");
  const lease =
    schema === "public"
      ? await createFreshLedgerDatabase(testDatabaseURL())
      : await createLocalPrivateLedgerDatabase(
          testDatabaseURL(),
          options.upgrade,
        );
  const admin = new pg.Pool({
    connectionString: lease.url,
    max: 10,
    options: `-c search_path=pg_catalog,${schema},pg_temp`,
  });
  const database = new PrismaClient({
    adapter: new PrismaPg({ connectionString: lease.url }, { schema }),
  });
  const role = `post_writer_${randomBytes(6).toString("hex")}`,
    password = randomBytes(24).toString("hex");
  const verifierRole = `post_verifier_${randomBytes(6).toString("hex")}`;
  const authRole = `post_auth_${randomBytes(6).toString("hex")}`;
  const privateRoles = schema === "ledgerone" ? [verifierRole, authRole] : [];
  const scope = {
    schema,
    roles: {
      [role]: "RUNTIME",
      ...(schema === "ledgerone"
        ? { [verifierRole]: "VERIFIER", [authRole]: "AUTH" }
        : {}),
    },
  };
  let authDatabase = database;
  let probe:
    | ((stage: Stage, c: pg.PoolClient, attempt: number) => Promise<void>)
    | undefined;
  let executor: PostExecutor | undefined;
  let metrics: MetricObserver | undefined;
  const observeMetric: MetricObserver = (event) => metrics?.(event);
  const traces: PostTrace[] = [];
  let logger = (trace: PostTrace) => {
    traces.push(trace);
  };
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
    if (authDatabase !== database) await authDatabase.$disconnect();
    await database.$disconnect();
    await admin.end();
    await lease.cleanup();
    const source = new pg.Client({ connectionString: testDatabaseURL() });
    await source.connect();
    try {
      for (const name of [role, ...privateRoles])
        await source.query(`DROP ROLE IF EXISTS "${name}"`);
    } finally {
      await source.end();
    }
  }
  try {
    await admin.query(
      `CREATE ROLE "${role}" LOGIN PASSWORD '${password}' NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS`,
    );
    await admin.query(`GRANT CONNECT ON DATABASE "${new URL(lease.url).pathname.slice(1)}" TO "${role}"; GRANT USAGE ON SCHEMA "${schema}" TO "${role}";
      GRANT SELECT ON workspace,ledger_account,ledger_operation,journal,posting,audit_event,currency,opening_balance,fx_rate TO "${role}";
      GRANT INSERT ON ledger_operation,journal,posting,audit_event TO "${role}";
      GRANT UPDATE(id) ON workspace,ledger_account TO "${role}";
      GRANT UPDATE(status,"postedAt","operationId",revision) ON journal TO "${role}"`);
    if (schema === "ledgerone") {
      for (const name of privateRoles)
        await admin.query(
          `CREATE ROLE "${name}" LOGIN PASSWORD '${password}' NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS`,
        );
      await admin.query(
        `GRANT USAGE ON SCHEMA ledgerone TO "${verifierRole}","${authRole}"; GRANT SELECT ON ledgerone.app_metadata,ledgerone._prisma_migrations TO "${verifierRole}"`,
      );
      await admin.query(
        readFileSync(
          "docs/setup/supabase-runtime-grants.sql",
          "utf8",
        ).replaceAll("ledgerone_app", authRole),
      );
      const authURL = new URL(lease.url);
      authURL.username = authRole;
      authURL.password = password;
      authDatabase = new PrismaClient({
        adapter: new PrismaPg(
          { connectionString: authURL.toString() },
          { schema },
        ),
      });
      runtime.auth = createAuth(config, authDatabase);
    }
    const c = await admin.connect();
    let expected;
    try {
      expected = await captureLedgerInvariants(c, scope);
    } finally {
      c.release();
    }
    const url = new URL(lease.url);
    url.username = role;
    url.password = password;
    const verifierURL = new URL(lease.url);
    if (schema === "ledgerone") {
      verifierURL.username = verifierRole;
      verifierURL.password = password;
    }
    const reopen = async (baseline = expected) => {
      const settings = {
        runtimeURL: url.toString(),
        verifierURL: verifierURL.toString(),
        expected: baseline,
        metrics: observeMetric,
        probe: async (...args: [Stage, pg.PoolClient, number]) =>
          probe?.(...args),
      };
      return schema === "ledgerone"
        ? PostExecutor.localPrivateVerification({ ...settings, authRole })
        : PostExecutor.disposable(settings);
    };
    executor = await reopen();
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
      schema,
      upgradeFrom: lease.upgradeFrom,
      verifierRole,
      authRole,
      authDatabase,
      scope,
      reopen,
      expected,
      traces,
      recordTrace: (trace: PostTrace) => logger(trace),
      setLogger: (fn?: (trace: PostTrace) => void) => {
        logger =
          fn ??
          ((trace) => {
            traces.push(trace);
          });
      },
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
      setMetrics: (fn?: MetricObserver) => {
        metrics = fn;
      },
      observeMetric,
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
        signal?: AbortSignal,
      ) =>
        postRequest(
          new Request(
            config.baseURL + `/api/workspaces/${workspace}/ledger/commands`,
            {
              method: "POST",
              signal,
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
          (trace) => logger(trace),
          observeMetric,
        ),
      cleanup,
    };
  } catch (error) {
    await cleanup();
    throw error;
  }
}
