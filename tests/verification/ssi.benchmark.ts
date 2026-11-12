// Read-only diagnostic observations around the real local command engine.
// These probes add overhead; their latency/rate is NOT capacity evidence.
import { randomUUID } from "node:crypto";
import { writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import type pg from "pg";
import { it, expect } from "vitest";
import { postHarness } from "../support/post-harness";

type PlanNode = {
  "Node Type"?: string;
  "Relation Name"?: string;
  "Index Name"?: string;
  "Plan Rows"?: number;
  "Total Cost"?: number;
  Plans?: PlanNode[];
};
function safePlan(node: PlanNode): unknown {
  return {
    node: node["Node Type"],
    relation: node["Relation Name"],
    index: node["Index Name"],
    rows: node["Plan Rows"],
    cost: node["Total Cost"],
    children: node.Plans?.map(safePlan),
  };
}
function phase(sql: unknown) {
  if (typeof sql !== "string") return "other";
  if (sql === "COMMIT") return "commit";
  if (sql.startsWith("INSERT INTO posting")) return "posting-insert";
  if (sql.startsWith("INSERT INTO journal")) return "journal-insert";
  if (sql.startsWith("INSERT INTO ledger_operation")) return "receipt-insert";
  if (sql.startsWith("INSERT INTO audit_event")) return "audit-insert";
  if (sql.startsWith("UPDATE journal")) return "journal-finalize";
  return "read-or-other";
}
it("D-T03 SSI diagnosis records real abort phases, default plans and predicate-lock granularity", async () => {
  const h = await postHarness({ schema: "ledgerone" });
  const events: {
    code: string;
    phase: string;
    routine: string;
    reason: string;
  }[] = [];
  const locks: unknown[] = [];
  const attempts: number[] = [];
  const sourceCommit = execFileSync("git", ["rev-parse", "HEAD"], {
    encoding: "utf8",
  }).trim();
  async function plans() {
    const user = h.users[0]!;
    const sample = (
      await h.admin.query(
        'SELECT id,"operationId" FROM ledgerone.journal ORDER BY id LIMIT 1',
      )
    ).rows[0] ?? { id: randomUUID(), operationId: randomUUID() };
    const queries: [string, string, unknown[]][] = [
      [
        "receipt-lookup",
        'SELECT id,kind,"requestHash" FROM ledgerone.ledger_operation WHERE "workspaceId"=$1 AND "ownerId"=$2 AND "idempotencyKey"=$3',
        [user.workspace, user.id, randomUUID()],
      ],
      [
        "operation-journal-validation",
        "SELECT count(*),count(*) FILTER(WHERE status='POSTED') FROM ledgerone.journal WHERE \"operationId\"=$1",
        [sample.operationId],
      ],
      [
        "journal-balance-validation",
        'SELECT count(*),sum("functionalMinor") FILTER(WHERE side=\'DEBIT\'),sum("functionalMinor") FILTER(WHERE side=\'CREDIT\') FROM ledgerone.posting WHERE "journalId"=$1',
        [sample.id],
      ],
      [
        "posted-result",
        'SELECT j.id FROM ledgerone.journal j JOIN ledgerone.audit_event a ON a."operationId"=j."operationId" AND a."targetJournalId"=j.id AND a."workspaceId"=j."workspaceId" AND a."ownerId"=j."ownerId" AND a.action=\'ledger.posted\' WHERE j."operationId"=$1 AND j."workspaceId"=$2 AND j."ownerId"=$3 AND j.status=\'POSTED\' AND j.kind=\'GENERAL\'',
        [sample.operationId, user.workspace, user.id],
      ],
    ];
    return Promise.all(
      queries.map(async ([name, sql, args]) => ({
        name,
        plan: safePlan(
          (await h.admin.query("EXPLAIN (FORMAT JSON) " + sql, args)).rows[0][
            "QUERY PLAN"
          ][0].Plan,
        ),
      })),
    );
  }
  let cleaned = false;
  try {
    const config = (
      await h.admin.query(
        "SELECT name,setting FROM pg_catalog.pg_settings WHERE name=ANY($1::text[]) ORDER BY name",
        [
          [
            "default_transaction_isolation",
            "enable_seqscan",
            "enable_indexscan",
            "random_page_cost",
            "cpu_tuple_cost",
            "max_pred_locks_per_transaction",
            "max_pred_locks_per_relation",
            "max_pred_locks_per_page",
          ],
        ],
      )
    ).rows;
    const beforePlans = await plans();
    const pairs = Array.from({ length: 64 }, () => ({
      expense: randomUUID(),
      bank: randomUUID(),
    }));
    for (const pair of pairs)
      for (const [id, type, kind] of [
        [pair.expense, "EXPENSE", "EXPENSE"],
        [pair.bank, "ASSET", "BANK"],
      ])
        await h.admin.query(
          'INSERT INTO ledgerone.ledger_account(id,"workspaceId","ownerId",name,type,kind,"currencyCode","updatedAt") VALUES($1,$2,$3,\'SSI synthetic\',$4,$5,\'INR\',NOW())',
          [id, h.users[0]!.workspace, h.users[0]!.id, type, kind],
        );
    h.setProbe(async (stage, c, attempt) => {
      if (stage === "connected") {
        attempts.push(attempt);
        const query = c.query.bind(c);
        c.query = (async (...args: unknown[]) => {
          try {
            return await (query as (...v: unknown[]) => Promise<unknown>)(
              ...args,
            );
          } catch (error) {
            const e = error as {
              code?: string;
              routine?: string;
              detail?: string;
            };
            if (e.code === "40001" || e.code === "40P01")
              events.push({
                code: e.code,
                phase: phase(args[0]),
                routine: e.routine?.replace(/[^A-Za-z0-9_]/g, "") ?? "unknown",
                reason:
                  /during (commit|write|read)/.exec(e.detail ?? "")?.[0] ??
                  "unspecified",
              });
            throw error;
          } finally {
            if (args[0] === "COMMIT" || args[0] === "ROLLBACK") c.query = query;
          }
        }) as pg.PoolClient["query"];
      }
      if (stage === "beforeCommit" && locks.length < 8) {
        const own = await c.query(
          `SELECT l.locktype,c.relname AS relation,l.page,l.tuple FROM pg_catalog.pg_locks l LEFT JOIN pg_catalog.pg_class c ON c.oid=l.relation WHERE l.pid=pg_catalog.pg_backend_pid() AND l.mode='SIReadLock' ORDER BY l.locktype,c.relname,l.page,l.tuple`,
        );
        locks.push(own.rows);
      }
    });
    const statuses: number[] = [];
    for (let n = 0; n < pairs.length; n += 4)
      await Promise.all(
        pairs.slice(n, n + 4).map(async (pair) => {
          const body = h.payload();
          body.legs[0]!.accountId = pair.expense;
          body.legs[1]!.accountId = pair.bank;
          statuses.push((await h.api(0, randomUUID(), body)).status);
        }),
      );
    h.setProbe(undefined);
    const afterPlans = await plans();
    const safety = (
      await h.admin.query(`SELECT
   (SELECT count(*)::int FROM (SELECT "journalId" FROM ledgerone.posting GROUP BY "journalId" HAVING sum(CASE side WHEN 'DEBIT' THEN "functionalMinor" ELSE -"functionalMinor" END)<>0) q) unbalanced,
   (SELECT count(*)::int FROM ledgerone.journal WHERE status='DRAFT') drafts,
   (SELECT count(*)::int FROM ledgerone.ledger_operation o WHERE (SELECT count(*) FROM ledgerone.audit_event a WHERE a."operationId"=o.id)<>1) audit_gaps`)
    ).rows[0];
    const artifact = {
      sourceCommit,
      profile: "local-private",
      diagnosticOnly: true,
      latencyNotCapacityEvidence: true,
      config,
      beforePlans,
      afterPlans,
      locks,
      events,
      attempts: attempts.length,
      statuses: {
        created: statuses.filter((s) => s === 201).length,
        rejected: statuses.filter((s) => s !== 201).length,
      },
      safety,
      cleanup: "completed-after-artifact",
    };
    expect(Object.values(safety)).toEqual([0, 0, 0]);
    await h.cleanup();
    cleaned = true;
    writeFileSync(
      join(tmpdir(), "ledgerone-s06d-ssi-diagnosis.json"),
      JSON.stringify({ ...artifact, cleanup: "PASS" }, null, 2),
      { mode: 0o600 },
    );
  } catch (error) {
    h.setProbe(undefined);
    if (!cleaned) await h.cleanup();
    throw error;
  }
}, 60000);
