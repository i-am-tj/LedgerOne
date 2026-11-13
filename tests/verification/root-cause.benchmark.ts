import { queryText } from "../support/query-text";
// Offline diagnostic sampling. Financial SQL and all decisions belong to the existing handler.
import { AsyncLocalStorage } from "node:async_hooks";
import { randomUUID } from "node:crypto";
import { writeFileSync } from "node:fs";
import { platform, arch, tmpdir } from "node:os";
import { join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import type pg from "pg";
import { expect, it } from "vitest";
import { accounts, campaign } from "./benchmark";

type Kind = "POST" | "REVERSE" | "CORRECT";
type Sample = {
  stages: Record<string, number>;
  attempts: number;
  errors: {
    statement: string;
    afterStage: string;
    code: string;
    reason?: string;
    routine?: string;
  }[];
  commitBudgets?: number[];
  writerOccupancyMs?: number;
  rollbacks: number;
  stage: string;
};
const ms = (v: number) => Math.round(v * 100) / 100;
const storage = new AsyncLocalStorage<Sample>();
function label(s: string) {
  if (/^(COMMIT|ROLLBACK)$/.test(s)) return s;
  const command = /^(INSERT INTO|UPDATE)\s+"?(\w+)/i.exec(s.trim());
  if (command) return command[1] + " " + command[2];
  return (
    (s.includes("FOR UPDATE") ? "lock " : "read ") +
    (/\bFROM\s+"?(\w+)/i.exec(s)?.[1] ?? "other")
  );
}
function safePlan(p: Record<string, unknown>): unknown {
  return {
    node: p["Node Type"],
    relation: p["Relation Name"],
    index: p["Index Name"],
    rows: p["Plan Rows"],
    children: (p.Plans as Record<string, unknown>[] | undefined)?.map(safePlan),
  };
}
it("samples local COMMIT and SSI paths without qualifying capacity", async () => {
  const start = performance.now();
  const { h, metadata } = await campaign();
  const setupDatabaseMs = ms(performance.now() - start);
  const now = () => ms(performance.now() - start);
  const cells: unknown[] = [],
    snapshots: unknown[] = [],
    activity: unknown[] = [];
  let snapshot = "",
    sampledLocks = false,
    monitor = false;
  let pid = 0,
    commitSent = 0;
  const user = h.users[0]!;
  const config = (
    await h.admin.query(
      "SELECT name,setting,unit FROM pg_settings WHERE name=ANY($1) ORDER BY name",
      [
        [
          "max_pred_locks_per_transaction",
          "max_pred_locks_per_page",
          "max_pred_locks_per_relation",
          "random_page_cost",
          "shared_buffers",
          "synchronous_commit",
          "fsync",
          "track_functions",
          "autovacuum",
          "default_statistics_target",
          "enable_seqscan",
          "enable_indexscan",
        ],
      ],
    )
  ).rows;
  const history = async () =>
    (
      await h.admin.query(
        `SELECT (SELECT count(*)::int FROM ledger_account) accounts,(SELECT count(*)::int FROM journal) journals,(SELECT count(*)::int FROM posting) postings,(SELECT count(*)::int FROM ledger_operation) receipts,(SELECT count(*)::int FROM audit_event) audits,pg_database_size(current_database())::text bytes`,
      )
    ).rows[0];
  h.setMetrics((e) => {
    const s = storage.getStore();
    if (s) s.stages[e.stage] = ms((s.stages[e.stage] ?? 0) + e.durationMs);
  });
  h.setProbe(async (stage, c) => {
    const sample = storage.getStore();
    if (!sample) return;
    sample.stage = stage;
    if (stage === "connected") {
      sample.attempts++;
      const acquired = performance.now(),
        release = c.release.bind(c);
      c.release = (err) => {
        sample.writerOccupancyMs = ms(
          (sample.writerOccupancyMs ?? 0) + performance.now() - acquired,
        );
        c.release = release;
        release(err);
      };
      const query = c.query.bind(c);
      c.query = (async (...args: unknown[]) => {
        const sql = queryText(args[0]);
        if (sql === "COMMIT") {
          (sample.commitBudgets ??= []).push(
            (args[0] as { query_timeout: number }).query_timeout,
          );
          if (monitor) commitSent = now();
        }
        try {
          const r = await (query as (...a: unknown[]) => Promise<unknown>)(
            ...args,
          );
          if (sql === "ROLLBACK") sample.rollbacks++;
          if (sql === "COMMIT") c.query = query;
          return r;
        } catch (err) {
          const e = err as {
            code?: string;
            message?: string;
            detail?: string;
            routine?: string;
          };
          sample.errors.push({
            statement: label(sql),
            afterStage: sample.stage,
            code:
              e.code ??
              (e.message === "Query read timeout"
                ? "driver-read-timeout"
                : "transport/other"),
            reason: e.detail?.match(/during (write|read|commit)[^.,]*/)?.[0],
            routine: e.routine,
          });
          throw err;
        } finally {
          if (sql === "ROLLBACK") c.query = query;
        }
      }) as pg.PoolClient["query"];
    }
    if (stage === "begin" && snapshot) {
      const tag = snapshot;
      snapshot = "";
      const settings = (
        await c.query(
          `SELECT current_user=$1 restricted_writer,current_setting('transaction_isolation') isolation,current_setting('search_path') path,current_setting('statement_timeout') statement,current_setting('lock_timeout') lock,current_setting('transaction_timeout') transaction`,
          [h.role],
        )
      ).rows[0];
      expect(settings.restricted_writer).toBe(true);
      const plans: Record<string, unknown> = {};
      const queries: [string, string, unknown[]][] = [
        [
          "receipt",
          'SELECT id,kind,"requestHash" FROM ledger_operation WHERE "workspaceId"=$1 AND "ownerId"=$2 AND "idempotencyKey"=$3',
          [user.workspace, user.id, randomUUID()],
        ],
        [
          "balance",
          'SELECT count(*), sum("functionalMinor") FILTER(WHERE side=\'DEBIT\') FROM posting WHERE "journalId"=$1',
          [randomUUID()],
        ],
        [
          "operation",
          'SELECT count(*) FROM journal WHERE "operationId"=$1',
          [randomUUID()],
        ],
        [
          "audit",
          'SELECT j.id FROM journal j JOIN audit_event a ON j."operationId"=a."operationId" AND a."targetJournalId"=j.id AND a."ownerId"=j."ownerId" AND a."workspaceId"=j."workspaceId" WHERE j."operationId"=$1 AND j."ownerId"=$2 AND j."workspaceId"=$3',
          [randomUUID(), user.id, user.workspace],
        ],
      ];
      for (const [name, sql, args] of queries)
        plans[name] = safePlan(
          (await c.query("EXPLAIN (FORMAT JSON) " + sql, args)).rows[0][
            "QUERY PLAN"
          ][0].Plan,
        );
      snapshots.push({ tag, settings, plans });
    }
    if (stage === "beforeCommit" && !sampledLocks) {
      sampledLocks = true;
      snapshots.push({
        locks: (
          await c.query(
            "SELECT locktype,relname,count(*)::int n FROM pg_locks l JOIN pg_class t ON t.oid=l.relation WHERE pid=pg_backend_pid() AND mode='SIReadLock' AND relnamespace='ledgerone'::regnamespace GROUP BY 1,2 ORDER BY 1,2",
          )
        ).rows,
        atMs: now(),
      });
    }
    if (stage === "beforeCommit" && monitor)
      pid = (await c.query("SELECT pg_backend_pid() pid")).rows[0].pid;
  });
  const receipt = async (key: string) =>
    (
      await h.admin.query(
        `SELECT count(DISTINCT o.id)::int receipts,count(DISTINCT j.id)::int journals,count(DISTINCT p.id)::int postings,count(DISTINCT a.id)::int audits FROM ledger_operation o LEFT JOIN journal j ON j."operationId"=o.id LEFT JOIN posting p ON p."journalId"=j.id LEFT JOIN audit_event a ON a."operationId"=o.id WHERE o."idempotencyKey"=$1 AND o."ownerId"=$2 AND o."workspaceId"=$3`,
        [key, user.id, user.workspace],
      )
    ).rows[0];
  let clean = false;
  try {
    async function cell(
      kind: Kind,
      legs: number,
      width: number,
      n: number,
      tag: string,
    ) {
      const before = await history(),
        t = performance.now();
      const signal = AbortSignal.timeout(
        Math.max(
          1,
          Math.floor(Math.min(90000, 600000 - (performance.now() - start))),
        ),
      );
      const makeLegs = (ids: string[]) =>
        ids.map((id, i) => ({
          ...h.payload().legs[i < legs / 2 ? 0 : 1]!,
          accountId: id,
          amount: "1.00",
        }));
      const bodies: unknown[] = [],
        setupStatuses: number[] = [],
        rows: unknown[] = [];
      for (let i = 0; i < n && !signal.aborted; i++) {
        const ids = await accounts(h, legs);
        const original = { ...h.payload(), legs: makeLegs(ids) };
        if (kind === "POST") {
          bodies.push(original);
          continue;
        }
        const res = await h.api(
          0,
          randomUUID(),
          original,
          {},
          user.workspace,
          true,
          signal,
        );
        setupStatuses.push(res.status);
        if (res.status !== 201) continue;
        bodies.push({
          kind,
          originalJournalId: (await res.json()).journalId,
          effectiveAt: "2026-02-01T00:00:00Z",
          reason: "Diagnostic fixture",
          ...(kind === "CORRECT"
            ? {
                replacement: {
                  effectiveAt: "2026-03-01T00:00:00Z",
                  legs: makeLegs(await accounts(h, legs)),
                },
              }
            : {}),
        });
      }
      const setupMs = ms(performance.now() - t),
        execution = performance.now();
      sampledLocks = false;
      const failed: { body: unknown; key: string; rollback: boolean }[] = [];
      for (let i = 0; i < bodies.length && !signal.aborted; i += width)
        await Promise.all(
          bodies.slice(i, i + width).map(async (body) => {
            const s: Sample = {
              attempts: 0,
              errors: [],
              rollbacks: 0,
              stage: "initial",
              stages: {},
            };
            const key = randomUUID(),
              begin = now();
            monitor = legs === 500;
            let done = false;
            const observe = async () => {
              if (!monitor) return;
              while (!done && !signal.aborted) {
                if (pid && commitSent) {
                  const r = await h.admin.query(
                    "SELECT state,query='COMMIT' committing,wait_event_type,wait_event FROM pg_stat_activity WHERE pid=$1 AND datname=current_database()",
                    [pid],
                  );
                  activity.push({
                    at: now(),
                    sinceCommit: ms(now() - commitSent),
                    ...r.rows[0],
                  });
                }
                await delay(75);
              }
            };
            const sampling = observe();
            try {
              const res = await storage.run(s, () =>
                h.api(0, key, body, {}, user.workspace, true, signal),
              );
              const end = now();
              rows.push({
                status: res.status,
                cancelled: signal.aborted,
                duration: ms(end - begin),
                responseAt: end,
                ...s,
              });
              if (res.status !== 201)
                failed.push({
                  body,
                  key,
                  rollback:
                    s.errors.some((e) => e.code === "40001") &&
                    s.rollbacks === s.attempts,
                });
              if (monitor && res.status === 503) {
                for (let j = 0; j < 60; j++) {
                  if ((await receipt(key)).receipts) break;
                  await delay(75);
                }
              }
            } finally {
              done = true;
              await sampling;
              monitor = false;
              pid = 0;
              commitSent = 0;
            }
          }),
        );
      const executionMs = ms(performance.now() - execution);
      const recoveries: unknown[] = [];
      for (const f of failed) {
        const pre = await receipt(f.key);
        if (signal.aborted) {
          recoveries.push({ pre, deferred: true });
          continue;
        }
        const replay = await h.api(
          0,
          f.key,
          f.body,
          {},
          user.workspace,
          true,
          signal,
        );
        const again = await h.api(
          0,
          f.key,
          f.body,
          {},
          user.workspace,
          true,
          signal,
        );
        const identical =
          JSON.stringify(await replay.json()) ===
          JSON.stringify(await again.json());
        recoveries.push({
          knownRollback: f.rollback,
          pre,
          status: replay.status,
          again: again.status,
          identical,
          after: await receipt(f.key),
        });
      }
      cells.push({
        tag,
        kind,
        legs,
        width,
        planned: n,
        setupStatuses,
        setupMs,
        executionMs,
        before,
        after: await history(),
        rows,
        recoveries,
        unmeasured: n - rows.length,
      });
    }
    for (const profile of ["fresh-growing", "analyzed-growing"]) {
      if (profile === "analyzed-growing")
        for (const table of [
          "ledger_account",
          "ledger_operation",
          "journal",
          "posting",
          "audit_event",
        ])
          await h.admin.query("ANALYZE ledgerone." + table);
      snapshot = profile;
      for (const kind of ["POST", "REVERSE"] as const)
        for (const width of [1, 2, 4]) await cell(kind, 2, width, 12, profile);
    }
    await cell("REVERSE", 50, 4, 12, "medium");
    await cell("CORRECT", 50, 1, 32, "methodology");
    for (let i = 0; i < 3; i++) await cell("CORRECT", 500, 1, 1, "maximum");
    // Measure the actual invariant function against durable journals, outside all
    // timed commands. The assertion takes FOR SHARE locks. Roll back the isolated
    // transaction after SELECT-only probes. These are not nested COMMIT plans.
    const checks: unknown[] = [];
    const observer = await h.admin.connect();
    try {
      await observer.query("BEGIN ISOLATION LEVEL SERIALIZABLE");
      if (!/^post_writer_[0-9a-f]{12}$/.test(h.role))
        throw Error("Unexpected fixture role");
      await observer.query('SET LOCAL ROLE "' + h.role + '"');
      const targets = (
        await observer.query(
          `SELECT DISTINCT ON (j.kind, j.revision) j.id,j.kind,j.revision FROM journal j JOIN ledger_operation o ON o.id=j."operationId" WHERE j.status='POSTED' AND o.kind='CORRECT' ORDER BY j.kind,j.revision,j.id`,
        )
      ).rows;
      for (const target of targets) {
        const result = await observer.query(
          "EXPLAIN (ANALYZE,FORMAT JSON) SELECT ledger05_assert_journal($1) FROM generate_series(1,20)",
          [target.id],
        );
        checks.push({
          kind: target.kind,
          revision: target.revision,
          calls: 20,
          serverMs: result.rows[0]["QUERY PLAN"][0]["Execution Time"],
        });
      }
    } finally {
      try {
        await observer.query("ROLLBACK");
      } finally {
        observer.release();
      }
    }
    const safety = (
      await h.admin.query(
        `SELECT (SELECT count(*)::int FROM journal WHERE status='DRAFT') drafts,(SELECT count(*)::int FROM (SELECT "journalId" FROM posting GROUP BY 1 HAVING sum(CASE side WHEN 'DEBIT' THEN "functionalMinor" ELSE -"functionalMinor" END)<>0) q) unbalanced,(SELECT count(*)::int FROM ledger_operation o WHERE (SELECT count(*) FROM audit_event a WHERE a."operationId"=o.id)<>1) audit_gaps`,
      )
    ).rows[0];
    h.setProbe(undefined);
    await h.cleanup();
    clean = true;
    writeFileSync(
      join(tmpdir(), "ledgerone-s06d-rca.json"),
      JSON.stringify(
        {
          metadata,
          os: platform(),
          arch: arch(),
          setupDatabaseMs,
          elapsedMs: now(),
          config,
          checks,
          snapshots,
          cells,
          activity,
          safety,
          cleanup: "PASS",
        },
        null,
        2,
      ),
      { mode: 0o600 },
    );
    expect(Object.values(safety)).toEqual([0, 0, 0]);
  } finally {
    if (!clean) {
      h.setProbe(undefined);
      await h.cleanup();
    }
  }
}, 600000);
