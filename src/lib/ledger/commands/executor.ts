import "server-only";
import pg from "pg";
import {
  measured,
  emitMetric,
  type MetricObserver,
} from "../verification/metrics";
import { randomUUID } from "node:crypto";
import { databaseSettings } from "../../profile";
import {
  assertLedgerInvariants,
  readLedgerInvariants,
  type InvariantManifest,
  type InvariantScope,
} from "../invariants";
import {
  CommandError,
  requestHash,
  unavailable,
  type PostCommand,
  type FinancialCommand,
  type Leg,
} from "./contract";

import {
  correctionResult,
  assertResultSemantics,
  type ReverseResult,
  type CorrectResult,
  type StoredJournal,
} from "./results";
import {
  originalEvidence,
  lockOriginal,
  targetUnavailable,
  type CommandQuery,
} from "./original";
export type FinancialResult = PostResult | ReverseResult | CorrectResult;

import {
  remaining,
  retryable,
  reversalConflict,
  retryDelay,
  sqlState,
  withinDeadline,
  throwIfAborted,
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
  | "discovered"
  | "targetLocked"
  | "targetConflict"
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
type DisposableOptions = {
  runtimeURL: string;
  verifierURL: string;
  expected: InvariantManifest;
  probe?: Probe;
  metrics?: MetricObserver;
};
export class PostExecutor {
  private constructor(
    private readonly pool: pg.Pool,
    private readonly verifier: pg.Pool,
    private readonly role: string,
    private readonly expected: InvariantManifest,
    private readonly probe?: Probe,
    private readonly scope: InvariantScope = { schema: "public" },
    private readonly metrics?: MetricObserver,
  ) {}
  static async disposable(options: DisposableOptions) {
    return this.createLocal(options, "public");
  }
  // Offline local verification only. No production/hosted factory or env switch.
  // Never called by the native Next adapter or selected by request data.
  static async localPrivateVerification(
    options: DisposableOptions & { authRole: string },
  ) {
    return this.createLocal(options, "ledgerone", options.authRole);
  }
  private static async createLocal(
    options: DisposableOptions,
    schema: "public" | "ledgerone",
    authRole?: string,
  ) {
    if (process.env.LEDGERONE_ENV !== "test") throw unavailable();
    const urls = [options.runtimeURL, options.verifierURL].map((source) => {
      databaseSettings({ LEDGERONE_ENV: "test", DATABASE_URL: source });
      const url = new URL(source);
      if (
        !["localhost", "127.0.0.1", "[::1]"].includes(url.hostname) ||
        !/^\/ledgerone_controls_[a-f0-9]{16}_test$/.test(url.pathname) ||
        url.searchParams.get("schema") !== schema
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
    const verifierRole = decodeURIComponent(urls[1]!.username);
    const roles: Record<string, string> = { [role]: "RUNTIME" };
    if (schema === "ledgerone") {
      if (
        !authRole ||
        !/^[a-z_][a-z0-9_]{0,62}$/.test(authRole) ||
        !/^[a-z_][a-z0-9_]{0,62}$/.test(verifierRole) ||
        new Set([role, verifierRole, authRole]).size !== 3
      )
        throw unavailable();
      roles[verifierRole] = "VERIFIER";
      roles[authRole] = "AUTH";
    }
    if (!/^[a-z_][a-z0-9_]{0,62}$/.test(role)) throw unavailable();
    const pool = new pg.Pool({
      connectionString: options.runtimeURL,
      options: `-c search_path=pg_catalog,${schema},pg_temp`,
      max: 6,
      connectionTimeoutMillis: 1500,
      statement_timeout: 2000,
      query_timeout: 3000,
    });
    const verifier = new pg.Pool({
      connectionString: options.verifierURL,
      options: `-c search_path=pg_catalog,${schema},pg_temp`,
      max: 2,
      connectionTimeoutMillis: 1500,
      statement_timeout: 2000,
      query_timeout: 3000,
    });
    const result = new PostExecutor(
      pool,
      verifier,
      role,
      options.expected,
      options.probe,
      { schema, roles },
      options.metrics,
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
      await readLedgerInvariants(this.verifier, this.scope, 2500, (duration) =>
        emitMetric(this.metrics, "command.verifier_wait", duration),
      ),
      this.expected,
    );
    const r = await this.pool.query(
      `SELECT r.rolsuper OR r.rolcreaterole OR r.rolcreatedb OR r.rolreplication OR r.rolbypassrls
      OR EXISTS (SELECT 1 FROM pg_catalog.pg_class WHERE relnamespace=$1::pg_catalog.regnamespace AND pg_catalog.pg_has_role(current_user,relowner,'MEMBER'))
      OR pg_catalog.has_schema_privilege(current_user,$1,'CREATE') AS unsafe FROM pg_catalog.pg_roles r WHERE rolname=current_user`,
      [this.scope.schema],
    );
    if (r.rows.length !== 1 || r.rows[0].unsafe) throw unavailable();
    if (this.scope.schema === "ledgerone") {
      for (const [name, identity] of Object.entries(this.scope.roles!)) {
        const state = await this.verifier.query(
          `SELECT
          r.rolsuper OR r.rolcreaterole OR r.rolcreatedb OR r.rolreplication OR r.rolbypassrls
          OR EXISTS (SELECT 1 FROM pg_catalog.pg_auth_members m WHERE m.member=r.oid OR m.roleid=r.oid)
          OR pg_catalog.pg_has_role(r.oid,(SELECT datdba FROM pg_catalog.pg_database WHERE datname=pg_catalog.current_database()),'MEMBER')
          OR pg_catalog.has_schema_privilege(r.rolname,$1,'CREATE') OR pg_catalog.has_schema_privilege(r.rolname,'public','CREATE')
          OR EXISTS (SELECT 1 FROM pg_catalog.pg_class c WHERE c.relnamespace=$1::pg_catalog.regnamespace AND pg_catalog.pg_has_role(r.oid,c.relowner,'MEMBER'))
          OR EXISTS (SELECT 1 FROM pg_catalog.pg_proc p WHERE p.pronamespace=$1::pg_catalog.regnamespace AND pg_catalog.pg_has_role(r.oid,p.proowner,'MEMBER'))
          OR EXISTS (SELECT 1 FROM pg_catalog.pg_class c WHERE c.relnamespace=$1::pg_catalog.regnamespace AND c.relkind IN ('r','p')
            AND ($3='VERIFIER' OR ($3='AUTH' AND c.relname=ANY($4::text[])))
            AND pg_catalog.has_table_privilege(r.rolname,c.oid,'INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')) AS unsafe
          FROM pg_catalog.pg_roles r WHERE r.rolname=$2`,
          [
            this.scope.schema,
            name,
            identity,
            [
              "currency",
              "ledger_account",
              "journal",
              "posting",
              "ledger_operation",
              "opening_balance",
              "fx_rate",
            ],
          ],
        );
        if (state.rows.length !== 1 || state.rows[0].unsafe)
          throw unavailable();
      }
    }
  }
  async post(
    authorize: () => Promise<Actor>,
    workspace: string,
    key: string,
    command: PostCommand,
    signal?: AbortSignal,
  ): Promise<{ result: PostResult; replayed: boolean }> {
    return this.execute(authorize, workspace, key, command, signal);
  }
  // One transaction/authentication/retry lifecycle. C-T02 extends its closed
  // command union; no consumer writer or alternative orchestration is added.
  async execute(
    authorize: () => Promise<Actor>,
    workspace: string,
    key: string,
    command: PostCommand,
    signal?: AbortSignal,
  ): Promise<{ result: PostResult; replayed: boolean }>;
  async execute(
    authorize: () => Promise<Actor>,
    workspace: string,
    key: string,
    command: FinancialCommand,
    signal?: AbortSignal,
  ): Promise<{ result: FinancialResult; replayed: boolean }>;
  async execute(
    authorize: () => Promise<Actor>,
    workspace: string,
    key: string,
    command: FinancialCommand,
    signal?: AbortSignal,
  ): Promise<{ result: FinancialResult; replayed: boolean }> {
    return measured(this.metrics, "command.total", async () => {
      throwIfAborted(signal);
      const deadline = performance.now() + 10000;
      const first = await measured(this.metrics, "command.authentication", () =>
        withinDeadline(authorize(), deadline, undefined, signal),
      );
      let recoverOriginalConflict = false;
      for (let attempt = 1; attempt <= 3; attempt++) {
        try {
          throwIfAborted(signal);
          await measured(
            this.metrics,
            "command.attestation",
            () => withinDeadline(this.attest(), deadline, undefined, signal),
            attempt,
          );
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
            signal,
            recoverOriginalConflict,
          );
        } catch (error) {
          const targetConflict =
            command.kind !== "POST" && reversalConflict(error);
          const delay =
            retryable(error) || targetConflict
              ? retryDelay(attempt, deadline - performance.now())
              : null;
          if (delay !== null) {
            recoverOriginalConflict ||= targetConflict;
            await withinDeadline(
              new Promise((r) => setTimeout(r, delay)),
              deadline,
              undefined,
              signal,
            );
            continue;
          }
          if (error instanceof CommandError) throw error;
          throw unavailable();
        }
      }
      throw unavailable();
    });
  }
  private async attempt(
    authorize: () => Promise<Actor>,
    workspace: string,
    key: string,
    command: FinancialCommand,
    attempt: number,
    deadline: number,
    signal?: AbortSignal,
    recoverOriginalConflict = false,
  ): Promise<{ result: FinancialResult; replayed: boolean }> {
    throwIfAborted(signal);
    const actor = await measured(
        this.metrics,
        "command.authentication",
        () => withinDeadline(authorize(), deadline, undefined, signal),
        attempt,
      ),
      hash = requestHash(actor.ownerId, workspace, command);
    const c = await measured(
      this.metrics,
      "command.connection_wait",
      () =>
        withinDeadline(
          this.pool.connect(),
          deadline,
          (late) => late.release(true),
          signal,
        ),
      attempt,
    );
    let committing = false,
      committed = false,
      destroy = false;
    const onFault = () => {
      destroy = true;
    };
    c.on("error", onFault);
    const active = () => {
      throwIfAborted(signal);
      remaining(deadline);
    };
    const query = (sql: string, values?: unknown[]) => {
      active();
      return c.query(sql, values).then((result) => {
        active();
        return result;
      });
    };
    try {
      await this.probe?.("connected", c, attempt);
      remaining(deadline);
      await query("BEGIN ISOLATION LEVEL SERIALIZABLE");
      await query(
        `SET LOCAL search_path=pg_catalog,"${this.scope.schema}",pg_temp`,
      );
      const budget = remaining(deadline);
      await query(
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
          await query(
            'SELECT id FROM workspace WHERE id=$1 AND "ownerId"=$2 FOR KEY SHARE',
            [workspace, actor.ownerId],
          )
        ).rowCount
      )
        throw new CommandError(404, "not_found");
      const old = await measured(
        this.metrics,
        "sql.receipt",
        () =>
          query(
            'SELECT id,kind,"requestHash" FROM ledger_operation WHERE "workspaceId"=$1 AND "ownerId"=$2 AND "idempotencyKey"=$3',
            [workspace, actor.ownerId, key],
          ),
        attempt,
      );
      if (old.rowCount) {
        if (
          old.rows[0].kind !== command.kind ||
          old.rows[0].requestHash !== hash
        )
          throw new CommandError(409, "idempotency_conflict");
        const result = await commandOutcome(
          c,
          actor,
          workspace,
          old.rows[0].id,
          command,
        );
        active();
        committing = true;
        await measured(
          this.metrics,
          "sql.commit",
          () => c.query("COMMIT"),
          attempt,
        );
        committed = true;
        return { result, replayed: true };
      }
      if (recoverOriginalConflict && command.kind !== "POST") {
        const original = await query(
          'SELECT id FROM journal WHERE id=$1 AND "workspaceId"=$2 AND "ownerId"=$3',
          [command.originalJournalId, workspace, actor.ownerId],
        );
        if (!original.rowCount) throw new CommandError(404, "not_found");
        const reversed = await query(
          'SELECT id FROM journal WHERE "reversesJournalId"=$1 AND "workspaceId"=$2 AND "ownerId"=$3',
          [command.originalJournalId, workspace, actor.ownerId],
        );
        if (reversed.rowCount) throw targetUnavailable();
        // A conflict without durable evidence is not a successful replay or
        // permission to invent an outcome (for example a failed test fault).
        throw unavailable();
      }
      const op = randomUUID(),
        journal = randomUUID();
      await measured(
        this.metrics,
        "sql.receipt",
        () =>
          query(
            'INSERT INTO ledger_operation(id,"workspaceId","ownerId","idempotencyKey","requestHash",kind) VALUES($1,$2,$3,$4,$5,$6)',
            [op, workspace, actor.ownerId, key, hash, command.kind],
          ),
        attempt,
      );
      await this.probe?.("receipt", c, attempt);
      const legs =
        command.kind === "POST"
          ? command.legs
          : await originalEvidence(
              query,
              actor.ownerId,
              workspace,
              command.originalJournalId,
            );
      if (command.kind !== "POST") await this.probe?.("discovered", c, attempt);
      const ids = [
        ...new Set(
          [
            ...legs,
            ...(command.kind === "CORRECT" ? command.replacement.legs : []),
          ].map((l) => l.accountId),
        ),
      ].sort();
      const accounts = await measured(
        this.metrics,
        "locks.accounts",
        () =>
          query(
            'SELECT id,"archivedAt","currencyCode" FROM ledger_account WHERE "workspaceId"=$1 AND "ownerId"=$2 AND id=ANY($3::uuid[]) ORDER BY id FOR UPDATE',
            [workspace, actor.ownerId, ids],
          ),
        attempt,
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
      if (command.kind !== "POST") {
        await measured(
          this.metrics,
          "locks.original",
          () =>
            lockOriginal(
              query,
              actor.ownerId,
              workspace,
              command.originalJournalId,
              op,
            ),
          attempt,
        );
        await this.probe?.("targetLocked", c, attempt);
      }
      await this.writeJournal(
        query,
        c,
        attempt,
        actor,
        workspace,
        op,
        journal,
        command.effectiveAt,
        command.description,
        legs,
        command.kind === "POST" ? null : command.originalJournalId,
      );
      if (command.kind === "CORRECT")
        await this.writeJournal(
          query,
          c,
          attempt,
          actor,
          workspace,
          op,
          randomUUID(),
          command.replacement.effectiveAt,
          command.replacement.description,
          command.replacement.legs,
          null,
        );
      await measured(
        this.metrics,
        "sql.audit",
        () =>
          query(
            'INSERT INTO audit_event(id,"workspaceId","ownerId","actorId","requestId",action,"operationId","targetJournalId",reason) VALUES($1,$2,$3,$3,$4,$5,$6,$7,$8)',
            [
              randomUUID(),
              workspace,
              actor.ownerId,
              actor.requestId,
              command.kind === "POST"
                ? "ledger.posted"
                : command.kind === "REVERSE"
                  ? "ledger.reversed"
                  : "ledger.corrected",
              op,
              command.kind === "POST" ? journal : command.originalJournalId,
              command.reason,
            ],
          ),
        attempt,
      );
      await this.probe?.("audit", c, attempt);
      const result = await commandOutcome(c, actor, workspace, op, command);
      await this.probe?.("beforeCommit", c, attempt);
      active();
      committing = true;
      await measured(
        this.metrics,
        "sql.commit",
        () => c.query("COMMIT"),
        attempt,
      );
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
        if (!destroy)
          await measured(
            this.metrics,
            "sql.rollback",
            () => c.query("ROLLBACK"),
            attempt,
          );
      } catch {
        destroy = true;
      }
      if (sqlState(error) === "40001")
        await this.probe?.("serialization", c, attempt);
      if (sqlState(error) === "40P01")
        await this.probe?.("deadlock", c, attempt);
      if (reversalConflict(error))
        await this.probe?.("targetConflict", c, attempt);
      throw error;
    } finally {
      c.release(destroy);
      c.removeListener("error", onFault);
    }
  }
  private async writeJournal(
    query: CommandQuery,
    c: pg.PoolClient,
    attempt: number,
    actor: Actor,
    workspace: string,
    operation: string,
    journal: string,
    effectiveAt: string,
    description: string,
    legs: readonly Leg[],
    original: string | null,
  ) {
    return measured(
      this.metrics,
      "sql.insertion",
      async () => {
        await query(
          'INSERT INTO journal(id,"workspaceId","ownerId",description,"effectiveAt",kind,"reversesJournalId") VALUES($1,$2,$3,$4,$5,$6,$7)',
          [
            journal,
            workspace,
            actor.ownerId,
            description,
            effectiveAt,
            original === null ? "GENERAL" : "REVERSAL",
            original,
          ],
        );
        await this.probe?.("draft", c, attempt);
        await measured(
          this.metrics,
          "sql.postings",
          async () => {
            for (const l of legs)
              await query(
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
          },
          attempt,
        );
        await this.probe?.("postings", c, attempt);
        await query(
          'UPDATE journal SET status=\'POSTED\',"postedAt"=clock_timestamp(),"operationId"=$1 WHERE id=$2 AND "workspaceId"=$3 AND "ownerId"=$4',
          [operation, journal, workspace, actor.ownerId],
        );
        await this.probe?.("sealed", c, attempt);
      },
      attempt,
    );
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

async function commandOutcome(
  c: pg.PoolClient,
  actor: Actor,
  workspace: string,
  operation: string,
  command: FinancialCommand,
): Promise<FinancialResult> {
  if (command.kind === "POST") {
    const result = await outcome(c, actor, workspace, operation);
    return assertResultSemantics(
      { ownerId: actor.ownerId, workspaceId: workspace },
      command,
      result,
    );
  }
  const audit = await c.query(
    'SELECT reason,action,"targetJournalId","actorId" FROM audit_event WHERE "operationId"=$1 AND "workspaceId"=$2 AND "ownerId"=$3',
    [operation, workspace, actor.ownerId],
  );
  const a = audit.rows[0];
  if (
    audit.rowCount !== 1 ||
    a.action !==
      (command.kind === "REVERSE" ? "ledger.reversed" : "ledger.corrected") ||
    a.targetJournalId !== command.originalJournalId ||
    a.actorId !== actor.ownerId ||
    a.reason !== command.reason
  )
    throw unavailable();
  const journals = await c.query(
    'SELECT * FROM journal WHERE "operationId"=$1 AND "workspaceId"=$2 AND "ownerId"=$3 ORDER BY id',
    [operation, workspace, actor.ownerId],
  );
  if (journals.rows.length > 2) throw unavailable();
  const rows: StoredJournal[] = [];
  for (const j of journals.rows) {
    const legs = await c.query(
      'SELECT "accountId",side,"currencyCode" AS currency,"nativeMinor"::text,"functionalMinor"::text,"fxRateId" FROM posting WHERE "journalId"=$1 AND "workspaceId"=$2 AND "ownerId"=$3 ORDER BY "accountId",side::text,"nativeMinor"::text,id',
      [j.id, workspace, actor.ownerId],
    );
    rows.push({
      ...j,
      journalId: j.id,
      effectiveAt: j.effectiveAt.toISOString(),
      postedAt: j.postedAt?.toISOString() ?? "",
      legs: legs.rows,
    });
  }
  const result = correctionResult(
    { ownerId: actor.ownerId, workspaceId: workspace, operationId: operation },
    command.kind,
    command.originalJournalId,
    a.reason,
    rows,
  );
  return assertResultSemantics(
    { ownerId: actor.ownerId, workspaceId: workspace },
    command,
    result,
  );
}
