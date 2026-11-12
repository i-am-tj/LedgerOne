// D-T03 only: isolated private-schema insertion regressions, never a native writer.
import { randomUUID } from "node:crypto";
import type pg from "pg";
import { beforeAll, afterAll, it, expect } from "vitest";
import type { PostResult } from "../../src/lib/ledger/commands/executor";
import type {
  CorrectResult,
  ReverseResult,
} from "../../src/lib/ledger/commands/results";
import { postHarness } from "../support/post-harness";
import { postHTTP } from "../support/post-http";
let h: Awaited<ReturnType<typeof postHarness>>;
let http: Awaited<ReturnType<typeof postHTTP>>;
beforeAll(async () => {
  h = await postHarness({ schema: "ledgerone" });
  http = await postHTTP(h);
}, 30000);
afterAll(async () => {
  await http?.close();
  await h?.cleanup();
});
async function counts(fixture = h) {
  return (
    await fixture.admin.query(`SELECT
    (SELECT count(*)::int FROM ledgerone.journal) journals,
    (SELECT count(*)::int FROM ledgerone.posting) postings,
    (SELECT count(*)::int FROM ledgerone.ledger_operation) receipts,
    (SELECT count(*)::int FROM ledgerone.audit_event) audits`)
  ).rows[0];
}
function payload(
  n: number,
  ids?: ReturnType<typeof randomUUID>[],
  fixture = h,
) {
  const p = fixture.payload();
  p.legs = Array.from({ length: n }, (_, i) => ({
    accountId:
      ids?.[i] ?? (i % 2 ? fixture.users[0]!.bank : fixture.users[0]!.expense),
    side: i % 2 ? "CREDIT" : "DEBIT",
    currency: "INR",
    amount: "9999999999999999.99",
  }));
  return p;
}
async function call(
  body: unknown,
  key = randomUUID(),
  user: number | null = 0,
  extra: Record<string, string> = {},
  context = { h, http },
) {
  const { h: fixture, http: server } = context;
  return fetch(
    `${server.origin}/api/workspaces/${fixture.users[0]!.workspace}/ledger/commands`,
    {
      method: "POST",
      headers: {
        origin: server.origin,
        "content-type": "application/json",
        "idempotency-key": key,
        ...(user === null ? {} : { cookie: fixture.cookie(user) }),
        ...extra,
      },
      body: JSON.stringify(body),
    },
  );
}
async function checkJournal(id: string, n: number, fixture = h) {
  const q = (
    await fixture.admin.query(
      `SELECT j.revision,
    count(p.id)::int n,count(DISTINCT p.id)::int ids,
    sum(CASE p.side WHEN 'DEBIT' THEN p."functionalMinor" ELSE -p."functionalMinor" END)::text balance,
    min(p."nativeMinor")::text minimum,max(p."nativeMinor")::text maximum
    FROM ledgerone.journal j JOIN ledgerone.posting p ON p."journalId"=j.id WHERE j.id=$1 GROUP BY j.id`,
      [id],
    )
  ).rows[0];
  expect(q).toEqual({
    revision: n,
    n,
    ids: n,
    balance: "0",
    minimum: "999999999999999999",
    maximum: "999999999999999999",
  });
}
it.each([2, 50, 500])(
  "D-T03 batch %s exact MAX/duplicate POST, inverse and replacement retain every row trigger",
  async (n) => {
    const before = await counts(),
      p = payload(n),
      key = randomUUID();
    const created = await call(p, key);
    expect(created.status).toBe(201);
    const original: PostResult = await created.json();
    expect(original.legs).toHaveLength(n);
    expect(
      original.legs.every(
        (l) =>
          l.nativeMinor === "999999999999999999" &&
          l.functionalMinor === l.nativeMinor,
      ),
    ).toBe(true);
    expect(
      original.legs.reduce(
        (v, l) =>
          v +
          (l.side === "DEBIT" ? BigInt(l.nativeMinor) : -BigInt(l.nativeMinor)),
        0n,
      ),
    ).toBe(0n);
    await checkJournal(original.journalId, n);
    expect(await (await call(p, key)).json()).toEqual(original);
    const corrected = await call({
      kind: "CORRECT",
      originalJournalId: original.journalId,
      effectiveAt: "2026-02-01T00:00:00Z",
      reason: "Batch correction regression",
      replacement: p,
    });
    // replacement uses the public replacement contract, without POST-only fields.
    expect(corrected.status).toBe(400);
    const { kind: _kind, reason: _reason, ...replacement } = p;
    void _kind;
    void _reason;
    const response = await call({
      kind: "CORRECT",
      originalJournalId: original.journalId,
      effectiveAt: "2026-02-01T00:00:00Z",
      reason: "Batch correction regression",
      replacement,
    });
    expect(response.status).toBe(201);
    const result: CorrectResult = await response.json();
    await checkJournal(result.reversal.journalId, n);
    const inverse = original.legs
      .map(
        (l) =>
          `${l.accountId}|${l.side === "DEBIT" ? "CREDIT" : "DEBIT"}|${l.nativeMinor}`,
      )
      .sort();
    expect(
      result.reversal.legs
        .map((l) => `${l.accountId}|${l.side}|${l.nativeMinor}`)
        .sort(),
    ).toEqual(inverse);
    await checkJournal(result.replacement.journalId, n);
    expect(result.originalJournalId).toBe(original.journalId);
    const reversed = await call({
      kind: "REVERSE",
      originalJournalId: result.replacement.journalId,
      effectiveAt: "2026-03-01T00:00:00Z",
      reason: "Batch reverse regression",
    });
    expect(reversed.status).toBe(201);
    await checkJournal(
      ((await reversed.json()) as ReverseResult).reversal.journalId,
      n,
    );
    const after = await counts();
    expect(after).toEqual({
      journals: before.journals + 4,
      postings: before.postings + 4 * n,
      receipts: before.receipts + 3,
      audits: before.audits + 3,
    });
  },
  20000,
);

async function waitOwnedStatements(
  fixture: Awaited<ReturnType<typeof postHarness>>,
  pids: number[],
) {
  const until = performance.now() + 5000;
  while (true) {
    const active = (
      await fixture.admin.query(
        "SELECT count(*)::int n FROM pg_catalog.pg_stat_activity WHERE pid=ANY($1::int[]) AND state='active'",
        [pids],
      )
    ).rows[0].n;
    if (active === 0) return;
    if (performance.now() >= until)
      throw new Error("Owned test statement remains active; cleanup refused");
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
}

it("S06D-R04 isolated in-flight fixture cannot change another fixture's financial counts", async () => {
  const before = await counts(),
    fixture = await postHarness({ schema: "ledgerone" }),
    server = await postHTTP(fixture);
  const c = await fixture.admin.connect();
  const blocker = await fixture.admin.connect();
  await blocker.query("SELECT pg_advisory_lock(7628824)");
  const pid = (await c.query("SELECT pg_backend_pid() AS pid")).rows[0].pid;
  let running: Promise<unknown> | undefined;
  try {
    expect(
      (
        await call(
          fixture.payload(),
          undefined,
          0,
          {},
          { h: fixture, http: server },
        )
      ).status,
    ).toBe(201);
    running = c.query("SELECT pg_advisory_xact_lock(7628824)");
    let observed = false;
    const until = performance.now() + 1000;
    while (performance.now() < until) {
      observed = (
        await fixture.admin.query(
          "SELECT EXISTS(SELECT 1 FROM pg_catalog.pg_stat_activity WHERE pid=$1 AND state='active' AND wait_event='advisory') AS active",
          [pid],
        )
      ).rows[0].active;
      if (observed) break;
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
    expect(observed).toBe(true);
    let settled = false;
    const waiting = waitOwnedStatements(fixture, [pid]).then(() => {
      settled = true;
    });
    await new Promise((resolve) => setTimeout(resolve, 30));
    expect(settled).toBe(false);
    await blocker.query("SELECT pg_advisory_unlock(7628824)");
    await waiting;
    await running;
    expect(await counts()).toEqual(before);
    expect(
      (
        await fixture.admin.query(
          "SELECT count(*)::int n FROM pg_catalog.pg_stat_activity WHERE pid=$1 AND state='active'",
          [pid],
        )
      ).rows[0].n,
    ).toBe(0);
  } finally {
    await blocker.query("SELECT pg_advisory_unlock(7628824)");
    blocker.release();
    await running;
    c.release();
    await server.close();
    await fixture.cleanup();
  }
}, 15000);

it("D-T03 500+500 correction locks 1000 distinct accounts and commits exact authorized children", async () => {
  const fixture = await postHarness({ schema: "ledgerone" });
  const server = await postHTTP(fixture);
  const context = { h: fixture, http: server };
  const pids = new Set<number>();
  let attemptedKey: ReturnType<typeof randomUUID> | undefined;
  let attemptedBody: unknown;
  let firstStatus: number | undefined;
  let commitFailure: string | undefined;
  const metrics: { stage: string; durationMs: number; attempt: number }[] = [];
  fixture.setMetrics((event) => metrics.push(event));
  fixture.setProbe(async (stage, c) => {
    if (stage === "connected")
      pids.add((await c.query("SELECT pg_backend_pid() AS pid")).rows[0].pid);
  });
  const u = fixture.users[0]!,
    ids = Array.from({ length: 1000 }, () => randomUUID());
  try {
    // Preserve the original shared fixture's 12 journals / 2,208 postings /
    // 9 receipts/audits. Isolation must not make the positive capacity case
    // easier by silently dropping its preceding synthetic history.
    for (const n of [2, 50, 500]) {
      const p = payload(n, undefined, fixture);
      const posted = await call(p, undefined, 0, {}, context);
      expect(posted.status).toBe(201);
      const original: PostResult = await posted.json();
      const { kind: _kind, reason: _reason, ...replacement } = p;
      void _kind;
      void _reason;
      const corrected = await call(
        {
          kind: "CORRECT",
          originalJournalId: original.journalId,
          effectiveAt: "2026-02-01T00:00:00Z",
          reason: "Equivalent preceding synthetic history",
          replacement,
        },
        undefined,
        0,
        {},
        context,
      );
      expect(corrected.status).toBe(201);
      const changed: CorrectResult = await corrected.json();
      expect(
        (
          await call(
            {
              kind: "REVERSE",
              originalJournalId: changed.replacement.journalId,
              effectiveAt: "2026-03-01T00:00:00Z",
              reason: "Equivalent preceding synthetic history",
            },
            undefined,
            0,
            {},
            context,
          )
        ).status,
      ).toBe(201);
    }
    expect(await counts(fixture)).toEqual(await counts());
    await fixture.admin.query(
      `INSERT INTO ledgerone.ledger_account(id,"workspaceId","ownerId",name,type,kind,"currencyCode","updatedAt")
    SELECT x,$2,$3,'Batch union fixture',CASE WHEN ord%2=1 THEN 'EXPENSE'::ledgerone."AccountClass" ELSE 'ASSET'::ledgerone."AccountClass" END,
    CASE WHEN ord%2=1 THEN 'EXPENSE'::ledgerone."AccountKind" ELSE 'BANK'::ledgerone."AccountKind" END,'INR',NOW()
    FROM unnest($1::uuid[]) WITH ORDINALITY a(x,ord)`,
      [ids, u.workspace, u.id],
    );
    const source = await call(
      payload(500, ids.slice(0, 500), fixture),
      undefined,
      0,
      {},
      context,
    );
    expect(source.status).toBe(201);
    const original: PostResult = await source.json();
    let locked: string[] = [];
    fixture.setProbe(async (stage, c) => {
      if (stage !== "connected") return;
      pids.add((await c.query("SELECT pg_backend_pid() AS pid")).rows[0].pid);
      const query = c.query.bind(c);
      c.query = (async (...args: unknown[]) => {
        if (
          typeof args[0] === "string" &&
          args[0].includes("FROM ledger_account") &&
          args[0].includes("FOR UPDATE")
        )
          locked = (args[1] as unknown[][])[2] as string[];
        try {
          return await (query as (...v: unknown[]) => Promise<unknown>)(
            ...args,
          );
        } catch (error) {
          if (args[0] === "COMMIT") {
            const e = error as { code?: string; message?: string };
            commitFailure = /^[0-9A-Z]{5}$/.test(e.code ?? "")
              ? e.code
              : e.message === "Query read timeout"
                ? "driver-read-timeout"
                : "transport-or-other";
          }
          throw error;
        } finally {
          if (args[0] === "COMMIT" || args[0] === "ROLLBACK") c.query = query;
        }
      }) as pg.PoolClient["query"];
    });
    const {
      kind: _kind,
      reason: _reason,
      ...replacement
    } = payload(500, ids.slice(500), fixture);
    void _kind;
    void _reason;
    const body = {
      kind: "CORRECT",
      originalJournalId: original.journalId,
      effectiveAt: "2026-02-01T00:00:00Z",
      reason: "Maximum union regression",
      replacement,
    };
    const key = randomUUID();
    attemptedKey = key;
    attemptedBody = body;
    const response = await call(body, key, 0, {}, context);
    firstStatus = response.status;
    if (response.status !== 201)
      console.info(
        "D-T03 maximum isolated capacity FAIL",
        JSON.stringify({ status: response.status, commitFailure, metrics }),
      );
    expect(response.status).toBe(201);
    const r: CorrectResult = await response.json();
    expect(locked).toEqual([...ids].sort());
    await checkJournal(r.reversal.journalId, 500, fixture);
    await checkJournal(r.replacement.journalId, 500, fixture);
    expect(await (await call(body, key, 0, {}, context)).json()).toEqual(r);
  } finally {
    fixture.setProbe(undefined);
    // A 503 at COMMIT can still complete. Only wait for our owned backend;
    // never assume rollback or let it contaminate subsequent test counts.
    try {
      await waitOwnedStatements(fixture, [...pids]);
      if (firstStatus === 503 && attemptedKey) {
        const rows = (
          await fixture.admin.query(
            `SELECT o.id,
        (SELECT count(*)::int FROM ledgerone.journal j WHERE j."operationId"=o.id) journals,
        (SELECT count(*)::int FROM ledgerone.posting p JOIN ledgerone.journal j ON j.id=p."journalId" WHERE j."operationId"=o.id) postings,
        (SELECT count(*)::int FROM ledgerone.audit_event a WHERE a."operationId"=o.id) audits
        FROM ledgerone.ledger_operation o WHERE o."idempotencyKey"=$1`,
            [attemptedKey],
          )
        ).rows;
        console.info(
          "D-T03 uncertain maximum outcome",
          JSON.stringify({
            firstStatus,
            commitFailure,
            receipts: rows.length,
            journals: rows[0]?.journals ?? 0,
            postings: rows[0]?.postings ?? 0,
            audits: rows[0]?.audits ?? 0,
          }),
        );
        expect(rows.length).toBeLessThanOrEqual(1);
        if (rows.length === 1) {
          expect({
            journals: rows[0].journals,
            postings: rows[0].postings,
            audits: rows[0].audits,
          }).toEqual({ journals: 2, postings: 1000, audits: 1 });
          const replay = await call(
            attemptedBody,
            attemptedKey,
            0,
            {},
            context,
          );
          expect(replay.status).toBe(200);
          const result: CorrectResult = await replay.json();
          await checkJournal(result.reversal.journalId, 500, fixture);
          await checkJournal(result.replacement.journalId, 500, fixture);
          expect(
            await (
              await call(attemptedBody, attemptedKey, 0, {}, context)
            ).json(),
          ).toEqual(result);
        }
      }
    } finally {
      await server.close();
      await fixture.cleanup();
    }
  }
}, 20000);

// Instrument the actual driver statement, not request fields. No persistent
// trigger/function/constraint is altered; cleanup restores the pooled query.
it.each(["malformed-row", "short-count", "null-count"] as const)(
  "D-T03 %s aborts the complete batch, receipt and audit",
  async (fault) => {
    const before = await counts(),
      key = randomUUID();
    let intercepted = false,
      evaluatedRows = 0,
      sqlstate: string | undefined;
    h.setProbe(async (stage, c) => {
      if (stage !== "connected") return;
      if (fault === "malformed-row")
        await c.query(
          "DROP SEQUENCE IF EXISTS pg_temp.batch_row_probe; CREATE TEMP SEQUENCE batch_row_probe",
        );
      const query = c.query.bind(c);
      c.query = (async (...args: unknown[]) => {
        try {
          if (
            typeof args[0] === "string" &&
            args[0].startsWith("INSERT INTO posting") &&
            !intercepted
          ) {
            intercepted = true;
            if (fault === "malformed-row") {
              const values = [...(args[1] as unknown[])],
                rows = JSON.parse(values[0] as string) as { minor: string }[];
              rows[rows.length - 1]!.minor = "0";
              values[0] = JSON.stringify(rows);
              args[1] = values;
              args[0] = (args[0] as string).replace(
                "x.minor::numeric,x.minor::numeric",
                "(x.minor::numeric + 0 * nextval('pg_temp.batch_row_probe')),x.minor::numeric",
              );
            }
            const result = await (
              query as (...v: unknown[]) => Promise<pg.QueryResult>
            )(...args);
            return {
              ...result,
              rowCount: fault === "null-count" ? null : result.rowCount! - 1,
            };
          }
          const result = await (query as (...v: unknown[]) => Promise<unknown>)(
            ...args,
          );
          if (args[0] === "ROLLBACK" && fault === "malformed-row")
            evaluatedRows = Number(
              (await query("SELECT last_value FROM pg_temp.batch_row_probe"))
                .rows[0].last_value,
            );
          return result;
        } catch (error) {
          sqlstate = (error as { code?: string }).code;
          throw error;
        } finally {
          if (args[0] === "COMMIT" || args[0] === "ROLLBACK") c.query = query;
        }
      }) as pg.PoolClient["query"];
    });
    try {
      const result = await call(payload(50), key);
      expect(result.status).toBe(503);
      expect(intercepted).toBe(true);
      if (fault === "malformed-row") {
        expect(sqlstate).toBe("23514");
        expect(evaluatedRows).toBe(50);
      }
      expect(await counts()).toEqual(before);
    } finally {
      h.setProbe(undefined);
    }
    expect((await call(payload(50), key)).status).toBe(201);
  },
);

it.each(["before", "during"] as const)(
  "D-T03 cancellation %s batch insertion rolls back without a durable receipt",
  async (when) => {
    const before = await counts(),
      controller = new AbortController(),
      key = randomUUID();
    let entered = false,
      pid = 0;
    const blocker = when === "during" ? await h.admin.connect() : undefined;
    if (blocker) await blocker.query("SELECT pg_advisory_lock(7628822)");
    h.setProbe(async (stage, c) => {
      if (when === "before" && stage === "draft") {
        entered = true;
        controller.abort();
      }
      if (when !== "during" || stage !== "connected") return;
      pid = (await c.query("SELECT pg_backend_pid() AS pid")).rows[0].pid;
      const query = c.query.bind(c);
      c.query = (async (...args: unknown[]) => {
        try {
          if (
            typeof args[0] === "string" &&
            args[0].startsWith("INSERT INTO posting")
          ) {
            // A test-held gate inside the actual INSERT makes the active SQL
            // cancellation window observable. All financial protections run.
            args[0] +=
              " CROSS JOIN (SELECT pg_advisory_xact_lock(7628822)) AS batch_gate";
            entered = true;
          }
          return await (query as (...v: unknown[]) => Promise<unknown>)(
            ...args,
          );
        } finally {
          if (args[0] === "COMMIT" || args[0] === "ROLLBACK") c.query = query;
        }
      }) as pg.PoolClient["query"];
    });
    let pending: Promise<Response> | undefined;
    try {
      pending = h.api(
        0,
        key,
        payload(500),
        {},
        undefined,
        true,
        controller.signal,
      );
      if (when === "during") {
        const until = performance.now() + 1200;
        let active = false;
        while (performance.now() < until) {
          active = (
            await h.admin.query(
              "SELECT EXISTS(SELECT 1 FROM pg_catalog.pg_stat_activity WHERE pid=$1 AND state='active' AND wait_event='advisory' AND query LIKE 'INSERT INTO posting%') AS active",
              [pid],
            )
          ).rows[0].active;
          if (active) break;
          await new Promise((r) => setTimeout(r, 10));
        }
        expect(active).toBe(true);
        controller.abort();
        await blocker!.query("SELECT pg_advisory_unlock(7628822)");
      }
      const r = await pending;
      expect(r.status).toBe(503);
      expect(entered).toBe(true);
      expect(await counts()).toEqual(before);
    } finally {
      controller.abort();
      if (blocker) {
        await blocker.query("SELECT pg_advisory_unlock_all()");
        blocker.release();
      }
      await pending;
      h.setProbe(undefined);
    }
    expect((await call(payload(500), key)).status).toBe(201);
  },
  15000,
);

it("D-T03 real private-role HTTP denies two-user and forged batches without side effects", async () => {
  const before = await counts();
  expect((await call(payload(50), randomUUID(), 1)).status).toBe(404);
  expect((await call(payload(50), randomUUID(), null)).status).toBe(401);
  expect(
    (
      await call(payload(50), randomUUID(), 0, {
        origin: "https://untrusted.invalid",
      })
    ).status,
  ).toBe(403);
  expect((await call({ ...payload(50), ownerId: h.users[1]!.id })).status).toBe(
    400,
  );
  const foreign = payload(50);
  foreign.legs[0]!.accountId = h.users[1]!.expense;
  expect((await call(foreign)).status).toBe(404);
  expect(await counts()).toEqual(before);
  const roles = await h.authDatabase.$queryRaw<
    { role: string }[]
  >`SELECT current_user AS role`;
  expect(roles[0]!.role).toBe(h.authRole);
  await expect(
    h.authDatabase.$executeRawUnsafe(
      "INSERT INTO ledgerone.posting DEFAULT VALUES",
    ),
  ).rejects.toMatchObject({ code: "P2010" });
});

it.each(["40001", "40P01"] as const)(
  "D-T03 private batch retries a genuine PostgreSQL %s from a full fresh transaction",
  async (code) => {
    const before = await counts(),
      seen: number[] = [],
      key = randomUUID();
    let contenderCleanup: Promise<void> | undefined;
    h.setProbe(async (stage, c, attempt) => {
      if (stage === (code === "40001" ? "serialization" : "deadlock"))
        seen.push(attempt);
      if (attempt !== 1) return;
      if (code === "40001" && stage === "receipt")
        await h.admin.query(
          "UPDATE ledgerone.ledger_account SET name=name || 'x' WHERE id=$1",
          [h.users[0]!.bank],
        );
      if (code !== "40P01" || stage !== "locked") return;
      const contender = await h.admin.connect();
      await contender.query(
        "BEGIN; SET LOCAL deadlock_timeout='10s'; SELECT pg_advisory_xact_lock(7628823)",
      );
      const waiting = contender.query(
        "SELECT id FROM ledgerone.ledger_account WHERE id=$1 FOR UPDATE",
        [h.users[0]!.bank],
      );
      contenderCleanup = waiting
        .then(async () => {
          await contender.query("ROLLBACK");
        })
        .finally(() => contender.release());
      await c.query("SELECT pg_advisory_xact_lock(7628823)");
    });
    try {
      const r = await call(payload(50), key);
      expect(r.status).toBe(201);
      expect(seen).toEqual([1]);
      const after = await counts();
      expect(after).toEqual({
        journals: before.journals + 1,
        postings: before.postings + 50,
        receipts: before.receipts + 1,
        audits: before.audits + 1,
      });
    } finally {
      h.setProbe(undefined);
      await contenderCleanup;
    }
  },
  15000,
);

it("D-T03 private batch loses actual COMMIT acknowledgement and recovers one immutable result", async () => {
  const before = await counts(),
    key = randomUUID(),
    p = payload(50);
  let lost = false;
  h.setProbe(async (stage, c) => {
    if (stage !== "beforeCommit") return;
    const query = c.query.bind(c);
    c.query = (async (...args: unknown[]) => {
      const result = await (query as (...v: unknown[]) => Promise<unknown>)(
        ...args,
      );
      if (args[0] === "COMMIT") {
        lost = true;
        throw Object.assign(new Error("test ack loss"), { code: "ECONNRESET" });
      }
      return result;
    }) as pg.PoolClient["query"];
  });
  try {
    expect((await call(p, key)).status).toBe(503);
    expect(lost).toBe(true);
  } finally {
    h.setProbe(undefined);
  }
  const replay = await call(p, key);
  expect(replay.status).toBe(200);
  const result: PostResult = await replay.json();
  expect(await (await call(p, key)).json()).toEqual(result);
  expect(await counts()).toEqual({
    journals: before.journals + 1,
    postings: before.postings + 50,
    receipts: before.receipts + 1,
    audits: before.audits + 1,
  });
});

it("D-T03 batch replay survives rename/archive and remains denied after actual session revocation", async () => {
  const p = payload(50),
    key = randomUUID(),
    response = await call(p, key);
  expect(response.status).toBe(201);
  const original: PostResult = await response.json();
  await h.admin.query(
    `UPDATE ledgerone.ledger_account SET name='Archived synthetic',"archivedAt"=NOW() WHERE id=ANY($1::uuid[])`,
    [[h.users[0]!.bank, h.users[0]!.expense]],
  );
  const before = await counts(),
    replay = await call(p, key);
  expect(replay.status).toBe(200);
  expect(await replay.json()).toEqual(original);
  expect((await call(p)).status).toBe(409);
  await h.database.authSession.delete({ where: { id: h.users[0]!.session } });
  expect((await call(p, key)).status).toBe(401);
  expect(await counts()).toEqual(before);
});
