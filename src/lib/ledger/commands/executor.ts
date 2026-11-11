import "server-only";
import pg from "pg";
import { randomUUID } from "node:crypto";
import { databaseSettings } from "../../profile";
import {
  assertLedgerInvariants,
  readLedgerInvariants,
  type InvariantManifest,
} from "../invariants";
import {
  CommandError,
  requestHash,
  unavailable,
  type PostCommand,
} from "./contract";

import {
  remaining,
  retryable,
  retryDelay,
  sqlState,
  withinDeadline,
} from "./retry";

type Actor = Readonly<{ ownerId: string; requestId: string }>;
export type PostResult = Readonly<{
  operationId: string;
  journalId: string;
  postedAt: string;
  effectiveAt: string;
  description: string;
  reason: string;
  legs: readonly {
    accountId: string;
    side: string;
    currency: string;
    nativeMinor: string;
    functionalMinor: string;
  }[];
}>;
export type Stage =
  | "connected"
  | "serialization"
  | "deadlock"
  | "begin"
  | "receipt"
  | "draft"
  | "postings"
  | "locked"
  | "sealed"
  | "audit"
  | "beforeCommit"
  | "committed";
// Instrumentation is only available through the guarded disposable-test factory.
type Probe = (
  stage: Stage,
  client: pg.PoolClient,
  attempt: number,
) => Promise<void>;
export class PostExecutor {
  private constructor(
    private readonly pool: pg.Pool,
    private readonly verifier: pg.Pool,
    private readonly role: string,
    private readonly expected: InvariantManifest,
    private readonly probe?: Probe,
  ) {}
  static async disposable(options: {
    runtimeURL: string;
    verifierURL: string;
    expected: InvariantManifest;
    probe?: Probe;
  }) {
    if (process.env.LEDGERONE_ENV !== "test") throw unavailable();
    const urls = [options.runtimeURL, options.verifierURL].map((source) => {
      databaseSettings({ LEDGERONE_ENV: "test", DATABASE_URL: source });
      const url = new URL(source);
      if (
        !["localhost", "127.0.0.1", "[::1]"].includes(url.hostname) ||
        !/^\/ledgerone_controls_[a-f0-9]{16}_test$/.test(url.pathname) ||
        url.searchParams.get("schema") !== "public"
      )
        throw unavailable();
      return url;
    });
    if (
      urls[0]!.host !== urls[1]!.host ||
      urls[0]!.pathname !== urls[1]!.pathname
    )
      throw unavailable();
    const role = decodeURIComponent(urls[0]!.username);
    if (!/^[a-z_][a-z0-9_]{0,62}$/.test(role)) throw unavailable();
    const pool = new pg.Pool({
      connectionString: options.runtimeURL,
      max: 6,
      connectionTimeoutMillis: 1500,
    });
    const verifier = new pg.Pool({
      connectionString: options.verifierURL,
      max: 2,
      connectionTimeoutMillis: 1500,
    });
    const result = new PostExecutor(
      pool,
      verifier,
      role,
      options.expected,
      options.probe,
    );
    pool.on("error", () => {
      result.failed = true;
    });
    verifier.on("error", () => {
      result.failed = true;
    });
    try {
      await result.attest();
      return result;
    } catch {
      await result.close();
      throw unavailable();
    }
  }
  private failed = false;
  async close() {
    await this.pool.end();
    await this.verifier.end();
  }
  private async attest() {
    if (this.failed) throw unavailable();
    assertLedgerInvariants(
      await readLedgerInvariants(this.verifier, {
        schema: "public",
        roles: { [this.role]: "RUNTIME" },
      }),
      this.expected,
    );
    const r = await this.pool
      .query(`SELECT r.rolsuper OR r.rolcreaterole OR r.rolcreatedb OR r.rolreplication OR r.rolbypassrls
      OR EXISTS (SELECT 1 FROM pg_class WHERE relnamespace='public'::regnamespace AND relowner=r.oid)
      OR has_schema_privilege(current_user,'public','CREATE') AS unsafe FROM pg_roles r WHERE rolname=current_user`);
    if (r.rows.length !== 1 || r.rows[0].unsafe) throw unavailable();
  }
  async post(
    authorize: () => Promise<Actor>,
    workspace: string,
    key: string,
    command: PostCommand,
  ): Promise<{ result: PostResult; replayed: boolean }> {
    const deadline = performance.now() + 10000;
    const first = await withinDeadline(authorize(), deadline);
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        await withinDeadline(this.attest(), deadline);
        return await this.attempt(
          async () => {
            const actor = await authorize();
            if (actor.ownerId !== first.ownerId)
              throw new CommandError(401, "unauthorized");
            return actor;
          },
          workspace,
          key,
          command,
          attempt,
          deadline,
        );
      } catch (error) {
        const delay = retryable(error)
          ? retryDelay(attempt, deadline - performance.now())
          : null;
        if (delay !== null) {
          await new Promise((r) => setTimeout(r, delay));
          continue;
        }
        if (error instanceof CommandError) throw error;
        throw unavailable();
      }
    }
    throw unavailable();
  }
  private async attempt(
    authorize: () => Promise<Actor>,
    workspace: string,
    key: string,
    command: PostCommand,
    attempt: number,
    deadline: number,
  ): Promise<{ result: PostResult; replayed: boolean }> {
    const actor = await withinDeadline(authorize(), deadline),
      hash = requestHash(actor.ownerId, workspace, command);
    const c = await withinDeadline(this.pool.connect(), deadline, (late) =>
      late.release(true),
    );
    let committing = false,
      committed = false,
      destroy = false;
    const onFault = () => {
      destroy = true;
    };
    c.on("error", onFault);
    try {
      await this.probe?.("connected", c, attempt);
      remaining(deadline);
      await c.query("BEGIN ISOLATION LEVEL SERIALIZABLE");
      await c.query("SET LOCAL search_path=pg_catalog,public,pg_temp");
      const budget = remaining(deadline);
      await c.query(
        "SELECT set_config('statement_timeout',$1,true),set_config('lock_timeout',$2,true),set_config('transaction_timeout',$3,true)",
        [
          String(Math.min(2000, budget)),
          String(Math.min(1500, budget)),
          String(budget),
        ],
      );
      await this.probe?.("begin", c, attempt);
      if (
        !(
          await c.query(
            'SELECT id FROM workspace WHERE id=$1 AND "ownerId"=$2 FOR KEY SHARE',
            [workspace, actor.ownerId],
          )
        ).rowCount
      )
        throw new CommandError(404, "not_found");
      const old = await c.query(
        'SELECT id,kind,"requestHash" FROM ledger_operation WHERE "workspaceId"=$1 AND "ownerId"=$2 AND "idempotencyKey"=$3',
        [workspace, actor.ownerId, key],
      );
      if (old.rowCount) {
        if (old.rows[0].kind !== "POST" || old.rows[0].requestHash !== hash)
          throw new CommandError(409, "idempotency_conflict");
        const result = await outcome(c, actor, workspace, old.rows[0].id);
        committing = true;
        await c.query("COMMIT");
        committed = true;
        return { result, replayed: true };
      }
      const op = randomUUID(),
        journal = randomUUID();
      await c.query(
        'INSERT INTO ledger_operation(id,"workspaceId","ownerId","idempotencyKey","requestHash",kind) VALUES($1,$2,$3,$4,$5,\'POST\')',
        [op, workspace, actor.ownerId, key, hash],
      );
      await this.probe?.("receipt", c, attempt);
      const ids = [...new Set(command.legs.map((l) => l.accountId))].sort();
      const accounts = await c.query(
        'SELECT id,"archivedAt","currencyCode" FROM ledger_account WHERE "workspaceId"=$1 AND "ownerId"=$2 AND id=ANY($3::uuid[]) ORDER BY id FOR UPDATE',
        [workspace, actor.ownerId, ids],
      );
      if (accounts.rowCount !== ids.length)
        throw new CommandError(404, "not_found");
      if (
        accounts.rows.some(
          (a) => a.archivedAt !== null || a.currencyCode !== "INR",
        )
      )
        throw new CommandError(409, "account_unavailable");
      await this.probe?.("locked", c, attempt);
      await c.query(
        'INSERT INTO journal(id,"workspaceId","ownerId",description,"effectiveAt") VALUES($1,$2,$3,$4,$5)',
        [
          journal,
          workspace,
          actor.ownerId,
          command.description,
          command.effectiveAt,
        ],
      );
      await this.probe?.("draft", c, attempt);
      for (const l of command.legs)
        await c.query(
          'INSERT INTO posting(id,"journalId","workspaceId","ownerId","accountId","currencyCode",side,"nativeMinor","functionalMinor") VALUES($1,$2,$3,$4,$5,\'INR\',$6,$7,$7)',
          [
            randomUUID(),
            journal,
            workspace,
            actor.ownerId,
            l.accountId,
            l.side,
            l.minor,
          ],
        );
      await this.probe?.("postings", c, attempt);
      await c.query(
        'UPDATE journal SET status=\'POSTED\',"postedAt"=clock_timestamp(),"operationId"=$1 WHERE id=$2 AND "workspaceId"=$3 AND "ownerId"=$4',
        [op, journal, workspace, actor.ownerId],
      );
      await this.probe?.("sealed", c, attempt);
      await c.query(
        'INSERT INTO audit_event(id,"workspaceId","ownerId","actorId","requestId",action,"operationId","targetJournalId",reason) VALUES($1,$2,$3,$3,$4,\'ledger.posted\',$5,$6,$7)',
        [
          randomUUID(),
          workspace,
          actor.ownerId,
          actor.requestId,
          op,
          journal,
          command.reason,
        ],
      );
      await this.probe?.("audit", c, attempt);
      const result = await outcome(c, actor, workspace, op);
      await this.probe?.("beforeCommit", c, attempt);
      committing = true;
      remaining(deadline);
      await c.query("COMMIT");
      committed = true;
      await this.probe?.("committed", c, attempt);
      return { result, replayed: false };
    } catch (error) {
      // A transport failure at COMMIT has no known outcome. Never retry it here.
      if (committed || (committing && !sqlState(error))) {
        destroy = true;
        throw unavailable();
      }
      try {
        if (!destroy) await c.query("ROLLBACK");
      } catch {
        destroy = true;
      }
      if (sqlState(error) === "40001")
        await this.probe?.("serialization", c, attempt);
      if (sqlState(error) === "40P01")
        await this.probe?.("deadlock", c, attempt);
      throw error;
    } finally {
      c.release(destroy);
      c.removeListener("error", onFault);
    }
  }
}
async function outcome(
  c: pg.PoolClient,
  actor: Actor,
  workspace: string,
  operation: string,
): Promise<PostResult> {
  const rows = await c.query(
    `SELECT j.id,j."postedAt",j."effectiveAt",j.description,a.reason FROM journal j
    JOIN audit_event a ON a."operationId"=j."operationId" AND a."targetJournalId"=j.id AND a."workspaceId"=j."workspaceId" AND a."ownerId"=j."ownerId" AND a.action='ledger.posted'
    WHERE j."operationId"=$1 AND j."workspaceId"=$2 AND j."ownerId"=$3 AND j.status='POSTED' AND j.kind='GENERAL'`,
    [operation, workspace, actor.ownerId],
  );
  if (rows.rowCount !== 1) throw unavailable();
  const j = rows.rows[0];
  const legs = await c.query(
    'SELECT "accountId",side,"currencyCode" AS currency,"nativeMinor"::text,"functionalMinor"::text FROM posting WHERE "journalId"=$1 AND "workspaceId"=$2 AND "ownerId"=$3 ORDER BY "accountId",side::text,"nativeMinor"::text,id',
    [j.id, workspace, actor.ownerId],
  );
  if (legs.rows.length < 2 || legs.rows.length > 500) throw unavailable();
  return {
    operationId: operation,
    journalId: j.id,
    postedAt: j.postedAt.toISOString(),
    effectiveAt: j.effectiveAt.toISOString(),
    description: j.description,
    reason: j.reason,
    legs: legs.rows,
  };
}
