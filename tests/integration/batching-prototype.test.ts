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
async function counts() {
  return (
    await h.admin.query(`SELECT
    (SELECT count(*)::int FROM ledgerone.journal) journals,
    (SELECT count(*)::int FROM ledgerone.posting) postings,
    (SELECT count(*)::int FROM ledgerone.ledger_operation) receipts,
    (SELECT count(*)::int FROM ledgerone.audit_event) audits`)
  ).rows[0];
}
function payload(n: number, ids?: ReturnType<typeof randomUUID>[]) {
  const p = h.payload();
  p.legs = Array.from({ length: n }, (_, i) => ({
    accountId: ids?.[i] ?? (i % 2 ? h.users[0]!.bank : h.users[0]!.expense),
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
) {
  return fetch(
    `${http.origin}/api/workspaces/${h.users[0]!.workspace}/ledger/commands`,
    {
      method: "POST",
      headers: {
        origin: http.origin,
        "content-type": "application/json",
        "idempotency-key": key,
        ...(user === null ? {} : { cookie: h.cookie(user) }),
        ...extra,
      },
      body: JSON.stringify(body),
    },
  );
}
async function checkJournal(id: string, n: number) {
  const q = (
    await h.admin.query(
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

it("D-T03 500+500 correction locks 1000 distinct accounts and commits exact authorized children", async () => {
  const u = h.users[0]!,
    ids = Array.from({ length: 1000 }, () => randomUUID());
  await h.admin.query(
    `INSERT INTO ledgerone.ledger_account(id,"workspaceId","ownerId",name,type,kind,"currencyCode","updatedAt")
    SELECT x,$2,$3,'Batch union fixture',CASE WHEN ord%2=1 THEN 'EXPENSE'::ledgerone."AccountClass" ELSE 'ASSET'::ledgerone."AccountClass" END,
    CASE WHEN ord%2=1 THEN 'EXPENSE'::ledgerone."AccountKind" ELSE 'BANK'::ledgerone."AccountKind" END,'INR',NOW()
    FROM unnest($1::uuid[]) WITH ORDINALITY a(x,ord)`,
    [ids, u.workspace, u.id],
  );
  const source = await call(payload(500, ids.slice(0, 500)));
  expect(source.status).toBe(201);
  const original: PostResult = await source.json();
  let locked: string[] = [];
  h.setProbe(async (stage, c) => {
    if (stage !== "connected") return;
    const query = c.query.bind(c);
    c.query = (async (...args: unknown[]) => {
      if (
        typeof args[0] === "string" &&
        args[0].includes("FROM ledger_account") &&
        args[0].includes("FOR UPDATE")
      )
        locked = (args[1] as unknown[][])[2] as string[];
      try {
        return await (query as (...v: unknown[]) => Promise<unknown>)(...args);
      } finally {
        if (args[0] === "COMMIT" || args[0] === "ROLLBACK") c.query = query;
      }
    }) as pg.PoolClient["query"];
  });
  try {
    const {
      kind: _kind,
      reason: _reason,
      ...replacement
    } = payload(500, ids.slice(500));
    void _kind;
    void _reason;
    const body = {
      kind: "CORRECT",
      originalJournalId: original.journalId,
      effectiveAt: "2026-02-01T00:00:00Z",
      reason: "Maximum union regression",
      replacement,
    };
    const key = randomUUID(),
      response = await call(body, key);
    expect(response.status).toBe(201);
    const r: CorrectResult = await response.json();
    expect(locked).toEqual([...ids].sort());
    await checkJournal(r.reversal.journalId, 500);
    await checkJournal(r.replacement.journalId, 500);
    expect(await (await call(body, key)).json()).toEqual(r);
  } finally {
    h.setProbe(undefined);
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
