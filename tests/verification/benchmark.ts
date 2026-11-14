// Offline, test-profile, generated loopback fixtures only. No hosted adapter.
import { AsyncLocalStorage } from "node:async_hooks";
import { randomUUID, createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { postHarness } from "../support/post-harness";
import {
  type CommandMetric,
  type MetricStage,
} from "../../src/lib/ledger/verification/metrics";
import {
  summarizeObservations,
  type Observation,
} from "../../src/lib/ledger/verification/statistics";
export type Workload = {
  kind: "POST" | "REVERSE" | "CORRECT";
  legs: 2 | 50 | 500;
  union: "small" | "maximum";
  concurrency: 1 | 2 | 4 | 6;
  samples: number;
  critical?: boolean;
  maxAmount?: boolean;
  contention?: "disjoint" | "shared";
};
type Harness = Awaited<ReturnType<typeof postHarness>>;
export type Campaign = Awaited<ReturnType<typeof campaign>>;
const retryCounters = new WeakMap<
  object,
  { attempts: number; serialization: number; deadlock: number }
>();
const storage = new AsyncLocalStorage<Partial<Record<MetricStage, number>>>();
export async function campaign() {
  const h = await postHarness({ schema: "ledgerone" });
  h.setMetrics((event: CommandMetric) => {
    const stages = storage.getStore();
    if (stages)
      stages[event.stage] = (stages[event.stage] ?? 0) + event.durationMs;
  });
  h.setProbe(async (stage) => {
    const current = storage.getStore();
    const counts = current && retryCounters.get(current);
    if (!counts) return;
    if (stage === "connected") counts.attempts++;
    if (stage === "serialization") counts.serialization++;
    if (stage === "deadlock") counts.deadlock++;
  });
  const results: Record<string, unknown>[] = [];
  const start = performance.now();
  const ranges = [
    "src/lib/ledger",
    "src/lib/auth",
    "src/lib/profile.ts",
    "scripts/lib",
    "tests/support",
    "tests/verification",
    "prisma",
    "vitest.config.ts",
    "package.json",
    "package-lock.json",
  ];
  const tracked = execFileSync("git", ["ls-files", ...ranges], {
    encoding: "utf8",
  })
    .trim()
    .split("\n");
  const untracked = execFileSync(
    "git",
    ["ls-files", "--others", "--exclude-standard", ...ranges],
    { encoding: "utf8" },
  )
    .trim()
    .split("\n");
  const codeFiles = [...new Set([...tracked, ...untracked])]
    .filter((n) => n && !n.endsWith(".test.ts"))
    .sort();
  const metadata = {
    sourceCommit: execFileSync("git", ["rev-parse", "HEAD"], {
      encoding: "utf8",
    }).trim(),
    dirty:
      execFileSync("git", ["status", "--porcelain"], {
        encoding: "utf8",
      }).trim().length > 0,
    codeDigest: createHash("sha256")
      .update(
        codeFiles
          .map(
            (name) =>
              name +
              ":" +
              createHash("sha256").update(readFileSync(name)).digest("hex"),
          )
          .join("\n"),
      )
      .digest("hex"),
    node: process.version,
    profile: "local-private",
    schema: "ledgerone",
    connectionMode: "direct-loopback",
    writerPool: 6,
    verifierPool: 2,
    postgres: (await h.admin.query("SHOW server_version")).rows[0]
      .server_version,
    catalogDigest: createHash("sha256")
      .update(JSON.stringify(h.expected))
      .digest("hex"),
    hosted: "NOT_RUN / NOT_AUTHORIZED",
    productionWritesEnabled: false,
  };
  return { h, results, metadata, start };
}
export async function accounts(h: Harness, count: number) {
  const values = Array.from({ length: count }, (_, n) => ({
    id: randomUUID(),
    type: n < count / 2 ? "EXPENSE" : "ASSET",
    kind: n < count / 2 ? "EXPENSE" : "BANK",
  }));
  await h.admin.query(
    `INSERT INTO ledgerone.ledger_account(id,"workspaceId","ownerId",name,type,kind,"currencyCode","updatedAt")
    SELECT x.id,$2,$3,'Synthetic capacity fixture',x.type::ledgerone."AccountClass",x.kind::ledgerone."AccountKind",'INR',NOW()
    FROM jsonb_to_recordset($1::jsonb) AS x(id uuid,type text,kind text)`,
    [JSON.stringify(values), h.users[0]!.workspace, h.users[0]!.id],
  );
  return values.map((v) => v.id);
}
export async function benchmark(
  c: Campaign,
  w: Workload,
  verifyRecovery = false,
) {
  if (
    ![2, 50, 500].includes(w.legs) ||
    ![1, 2, 4, 6].includes(w.concurrency) ||
    !Number.isInteger(w.samples) ||
    w.samples < 1 ||
    w.samples > 2000
  )
    throw new Error("Invalid bounded local workload");
  const { h } = c;
  if (
    (w.legs === 500 && w.samples > 6) ||
    (!w.critical && w.samples > 32) ||
    (w.critical && (w.legs > 50 || w.samples !== 1000))
  )
    throw new Error("Workload exceeds bounded campaign profile");
  const controller = new AbortController();
  const budget = Math.min(
    w.critical ? 240000 : 90000,
    Math.max(1, c.start + 600000 - performance.now()),
  );
  const timer = setTimeout(() => controller.abort(), budget);
  try {
    const legs = (ids: string[]) =>
      Array.from({ length: w.legs }, (_, n) => ({
        accountId: w.union === "small" ? ids[n < w.legs / 2 ? 0 : 1]! : ids[n]!,
        side: n < w.legs / 2 ? "DEBIT" : "CREDIT",
        currency: "INR",
        amount: w.maxAmount ? "9999999999999999.99" : "1.00",
      }));
    const payload = (ids: string[]) => ({ ...h.payload(), legs: legs(ids) });
    const setupStart = performance.now();
    const observations: Observation[] = [];
    const failures: { key: string; body: unknown }[] = [];
    let setupFailures = 0;
    const retries = { attempts: 0, serialization: 0, deadlock: 0 };
    const failedAttempts: Record<string, number> = {};
    const mappedErrors: Record<string, number> = {};
    const bodies: unknown[] = [];
    let sharedOriginals: string[] | undefined,
      sharedReplacements: string[] | undefined;
    for (let n = 0; n < w.samples; n++) {
      if (controller.signal.aborted) {
        setupFailures += w.samples - n;
        break;
      }
      const count = w.union === "small" ? 2 : w.legs;
      const originals =
        w.contention === "shared" && sharedOriginals
          ? sharedOriginals
          : await accounts(h, count);
      const replacements =
        w.kind !== "CORRECT" || w.union === "small"
          ? originals
          : w.contention === "shared" && sharedReplacements
            ? sharedReplacements
            : await accounts(h, count);
      sharedOriginals = originals;
      sharedReplacements = replacements;
      if (w.kind !== "POST") {
        const created = await h.api(
          0,
          randomUUID(),
          payload(originals),
          {},
          h.users[0]!.workspace,
          true,
          controller.signal,
        );
        if (created.status !== 201) {
          setupFailures++;
          continue;
        }
        const original = await created.json();
        bodies.push({
          kind: w.kind,
          originalJournalId: original.journalId,
          effectiveAt: "2026-02-01T00:00:00Z",
          reason: "Synthetic capacity verification",
          ...(w.kind === "CORRECT"
            ? {
                replacement: {
                  effectiveAt: "2026-03-01T00:00:00Z",
                  legs: legs(replacements),
                },
              }
            : {}),
        });
      } else bodies.push(payload(originals));
    }
    // Setup is complete before qualification. Shared-account contention is a
    // separately labelled challenge, not an uncontended service-budget sample.
    const measuredStart = performance.now();
    async function executeOne(body: unknown) {
      const stages: Partial<Record<MetricStage, number>> = {};
      const counters = { attempts: 0, serialization: 0, deadlock: 0 };
      retryCounters.set(stages, counters);
      await storage.run(stages, async () => {
        const started = performance.now();
        const key = randomUUID();
        const response = await h.api(
          0,
          key,
          body,
          {},
          h.users[0]!.workspace,
          true,
          controller.signal,
        );
        const reply = await response.json();
        if (response.status !== 201) {
          if (verifyRecovery) failures.push({ key, body });
          const code = [
            "service_unavailable",
            "idempotency_conflict",
            "account_unavailable",
            "not_found",
            "unauthorized",
          ].includes(reply.error)
            ? reply.error
            : "other";
          mappedErrors[code] = (mappedErrors[code] ?? 0) + 1;
          failedAttempts[String(counters.attempts)] =
            (failedAttempts[String(counters.attempts)] ?? 0) + 1;
        }
        retries.attempts += counters.attempts;
        retries.serialization += counters.serialization;
        retries.deadlock += counters.deadlock;
        observations.push({
          durationMs: performance.now() - started,
          status: controller.signal.aborted
            ? "cancelled"
            : response.status === 201
              ? "success"
              : response.status === 409
                ? "conflict"
                : "failed",
          stages,
        });
      });
    }
    // Cold first observations are included and labelled; no favorable samples discarded.
    for (let n = 0; n < bodies.length; n += w.concurrency) {
      if (controller.signal.aborted) break;
      await Promise.all(bodies.slice(n, n + w.concurrency).map(executeOne));
    }
    const measuredMs = performance.now() - measuredStart;
    const recoveries = [];
    for (const { key, body } of failures) {
      if (controller.signal.aborted) break;
      const user = h.users[0]!;
      const totals = async () =>
        (
          await h.admin.query(
            `SELECT count(DISTINCT o.id)::int receipts,count(DISTINCT j.id)::int journals,
         count(DISTINCT p.id)::int postings,count(DISTINCT a.id)::int audits
         FROM ledger_operation o LEFT JOIN journal j ON j."operationId"=o.id
         LEFT JOIN posting p ON p."journalId"=j.id LEFT JOIN audit_event a ON a."operationId"=o.id
         WHERE o."workspaceId"=$1 AND o."ownerId"=$2 AND o."idempotencyKey"=$3`,
            [user.workspace, user.id, key],
          )
        ).rows[0];
      const before = await totals();
      const first = await h.api(
        0,
        key,
        body,
        {},
        user.workspace,
        true,
        controller.signal,
      );
      const second = await h.api(
        0,
        key,
        body,
        {},
        user.workspace,
        true,
        controller.signal,
      );
      const after = await totals();
      const identical =
        JSON.stringify(await first.json()) ===
        JSON.stringify(await second.json());
      const journals = w.kind === "CORRECT" ? 2 : 1;
      recoveries.push({
        before,
        after,
        first: first.status,
        second: second.status,
        identical,
        safe:
          [200, 201].includes(first.status) &&
          second.status === 200 &&
          identical &&
          after.receipts === 1 &&
          after.audits === 1 &&
          after.journals === journals &&
          after.postings === w.legs * journals,
      });
    }
    const summary = summarizeObservations(observations, w.critical ?? false);
    const inconsistent = await h.admin.query(`SELECT
    (SELECT count(*)::int FROM (SELECT "journalId" FROM ledgerone.posting GROUP BY "journalId" HAVING sum(CASE side WHEN 'DEBIT' THEN "functionalMinor" ELSE -"functionalMinor" END)<>0) broken) unbalanced,
    (SELECT count(*)::int FROM ledgerone.journal WHERE status='DRAFT') drafts,
    (SELECT count(*)::int FROM ledgerone.ledger_operation o WHERE (SELECT count(*) FROM ledgerone.audit_event a WHERE a."operationId"=o.id)<>1) audit_gaps`);
    const safe = Object.values(inconsistent.rows[0]).every((n) => n === 0);
    const commandTimes = summarizeObservations(
      observations.map((r) => ({
        ...r,
        durationMs: r.stages["command.total"] ?? r.durationMs,
      })),
      w.critical ?? false,
    );
    const p95Budget = w.legs === 2 ? 1000 : w.legs === 50 ? 3000 : 10000;
    const positive =
      setupFailures === 0 && summary.counts.success === w.samples;
    const result = {
      workload: w,
      setupMs: measuredStart - setupStart,
      measuredMs,
      recoveries,
      recoveryComplete:
        failures.length === recoveries.length &&
        recoveries.every((r) => r.safe),
      coldIncluded: true,
      accountContention: w.contention ?? "disjoint",
      setupInterleaved: false,
      resourceBudgetMs: budget,
      budgetAborted: controller.signal.aborted,
      unmeasured: w.samples - setupFailures - observations.length,
      setupFailures,
      retries,
      failedAttempts,
      mappedErrors,
      summary,
      commandTimes,
      safe,
      positiveResult: positive ? "PASS" : "FAIL",
      capacityResult:
        !controller.signal.aborted &&
        setupFailures === 0 &&
        observations.length === w.samples &&
        (summary.unexpectedFailureRate ?? 1) <= 0.01 &&
        summary.counts.conflict === 0 &&
        summary.counts.cancelled === 0 &&
        safe &&
        (commandTimes.p95Ms ?? Infinity) <= p95Budget &&
        (!w.critical ||
          (commandTimes.p99.result === "PROVEN" &&
            commandTimes.p99.valueMs! <= 10000))
          ? "PASS"
          : "FAIL",
      criticalBatches: w.critical
        ? Array.from(
            { length: Math.ceil(observations.length / 250) },
            (_, i) => {
              const part = observations.slice(i * 250, (i + 1) * 250);
              const view = summarizeObservations(part);
              return {
                batch: i + 1,
                observations: view.observations,
                p50Ms: view.p50Ms,
                p95Ms: view.p95Ms,
                counts: view.counts,
                unexpectedFailureRate: view.unexpectedFailureRate,
              };
            },
          )
        : [],
      p99Qualification: summary.p99.result,
      maximumDistinctAccountUnion:
        w.union === "small" ? 2 : w.legs * (w.kind === "CORRECT" ? 2 : 1),
    };
    c.results.push(result);
    return result;
  } finally {
    clearTimeout(timer);
  }
}

export async function finish(c: Campaign, path: string) {
  try {
    writeFileSync(
      path,
      JSON.stringify(
        {
          metadata: c.metadata,
          elapsedMs: performance.now() - c.start,
          results: c.results,
        },
        null,
        2,
      ),
      { mode: 0o600 },
    );
  } finally {
    await c.h.cleanup();
  }
}
