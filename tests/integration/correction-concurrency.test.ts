import { randomUUID } from "node:crypto";
import type pg from "pg";
import { beforeAll, afterAll, it, expect } from "vitest";
import { postHarness } from "../support/post-harness";
let h: Awaited<ReturnType<typeof postHarness>>;
beforeAll(async () => {
  h = await postHarness();
}, 30000);
afterAll(async () => {
  await h?.cleanup();
});
type Kind = "REVERSE" | "CORRECT";
async function original() {
  const r = await h.api(0, randomUUID(), h.payload());
  expect(r.status).toBe(201);
  return r.json();
}
function command(kind: Kind, id: string) {
  const base = {
    kind,
    originalJournalId: id,
    effectiveAt: "2026-02-01T00:00:00Z",
    reason: "Concurrency fixture",
  };
  return kind === "REVERSE"
    ? base
    : {
        ...base,
        replacement: {
          effectiveAt: "2026-03-01T00:00:00Z",
          legs: h.payload().legs,
        },
      };
}
async function counts() {
  return (
    await h.admin.query(
      "SELECT (SELECT count(*)::int FROM journal) journals,(SELECT count(*)::int FROM posting) postings,(SELECT count(*)::int FROM ledger_operation) receipts,(SELECT count(*)::int FROM audit_event) audits",
    )
  ).rows[0];
}
it.each(["REVERSE", "CORRECT"] as const)(
  "C-T04 four concurrent identical %s keys commit one immutable outcome",
  async (kind) => {
    const o = await original(),
      before = await counts(),
      key = randomUUID(),
      body = command(kind, o.journalId);
    let reached = 0,
      release!: () => void;
    const gate = new Promise<void>((r) => {
      release = r;
    });
    h.setProbe(async (stage) => {
      if (stage === "begin" && ++reached <= 4) {
        if (reached === 4) release();
        await gate;
      }
    });
    try {
      const responses = await Promise.all(
        Array.from({ length: 4 }, () => h.api(0, key, body)),
      );
      expect(responses.map((r) => r.status).sort()).toEqual([
        200, 200, 200, 201,
      ]);
      const results = await Promise.all(responses.map((r) => r.json()));
      for (const r of results) expect(r).toEqual(results[0]);
      const after = await counts();
      expect(after.receipts - before.receipts).toBe(1);
      expect(after.audits - before.audits).toBe(1);
      expect(after.journals - before.journals).toBe(kind === "REVERSE" ? 1 : 2);
    } finally {
      release();
      h.setProbe(undefined);
    }
  },
  15000,
);
it.each(["REVERSE", "CORRECT"] as const)(
  "C-T04 concurrent conflicting %s key/target cannot replace winner",
  async (kind) => {
    const a = await original(),
      b = await original(),
      before = await counts(),
      key = randomUUID();
    const results = await Promise.all([
      h.api(0, key, command(kind, a.journalId)),
      h.api(0, key, command(kind, b.journalId)),
    ]);
    expect(results.map((r) => r.status).sort()).toEqual([201, 409]);
    const after = await counts();
    expect(after.receipts - before.receipts).toBe(1);
    expect(after.audits - before.audits).toBe(1);
  },
);
it.each([
  ["REVERSE", "REVERSE"],
  ["REVERSE", "CORRECT"],
  ["CORRECT", "CORRECT"],
] as const)(
  "C-T04 different-key %s/%s race has one exact original winner",
  async (a, b) => {
    const o = await original(),
      before = await counts();
    let reached = 0,
      release!: () => void;
    const gate = new Promise<void>((r) => {
      release = r;
    });
    h.setProbe(async (stage) => {
      if (stage === "discovered" && ++reached <= 2) {
        if (reached === 2) release();
        await gate;
      }
    });
    try {
      const r = await Promise.all([
        h.api(0, randomUUID(), command(a, o.journalId)),
        h.api(0, randomUUID(), command(b, o.journalId)),
      ]);
      expect(r.map((x) => x.status).sort()).toEqual([201, 409]);
      const after = await counts();
      expect(after.receipts - before.receipts).toBe(1);
      expect(after.audits - before.audits).toBe(1);
      expect(
        (
          await h.admin.query(
            'SELECT count(*)::int n FROM journal WHERE "reversesJournalId"=$1',
            [o.journalId],
          )
        ).rows[0].n,
      ).toBe(1);
    } finally {
      release();
      h.setProbe(undefined);
    }
  },
  15000,
);
it.each(["REVERSE", "CORRECT"] as const)(
  "C-T04 %s real 40001 retries entire transaction; exhaustion leaves no rows",
  async (kind) => {
    for (const exhaust of [false, true]) {
      const o = await original(),
        before = await counts(),
        seen: number[] = [],
        tx: string[] = [];
      h.setProbe(async (stage, c, attempt) => {
        if (stage === "begin")
          tx.push((await c.query("SELECT txid_current()::text id")).rows[0].id);
        if (stage === "receipt" && (exhaust || attempt === 1))
          await h.admin.query(
            "UPDATE ledger_account SET name=name || 'x' WHERE id=$1",
            [h.users[0]!.bank],
          );
        if (stage === "serialization") seen.push(attempt);
      });
      try {
        const r = await h.api(0, randomUUID(), command(kind, o.journalId));
        expect(r.status).toBe(exhaust ? 503 : 201);
        expect(seen).toEqual(exhaust ? [1, 2, 3] : [1]);
        expect(new Set(tx).size).toBe(tx.length);
        if (exhaust) expect(await counts()).toEqual(before);
        else expect((await counts()).audits - before.audits).toBe(1);
      } finally {
        h.setProbe(undefined);
      }
    }
  },
  15000,
);
it.each(["REVERSE", "CORRECT"] as const)(
  "C-T04 %s real command-victim deadlock retries fully",
  async (kind) => {
    const o = await original(),
      before = await counts(),
      seen: number[] = [];
    let cleanup: Promise<void> | undefined;
    h.setProbe(async (stage, c, attempt) => {
      if (stage === "deadlock") seen.push(attempt);
      if (stage !== "targetLocked" || attempt !== 1) return;
      const contender = await h.admin.connect();
      await contender.query(
        "BEGIN; SET LOCAL deadlock_timeout='10s'; SELECT pg_advisory_xact_lock(76233442)",
      );
      cleanup = contender
        .query("SELECT id FROM ledger_account WHERE id=$1 FOR UPDATE", [
          h.users[0]!.bank,
        ])
        .then(async () => {
          await contender.query("ROLLBACK");
        })
        .finally(() => contender.release());
      await c.query("SELECT pg_advisory_xact_lock(76233442)");
    });
    try {
      expect(
        (await h.api(0, randomUUID(), command(kind, o.journalId))).status,
      ).toBe(201);
      expect(seen).toEqual([1]);
      expect((await counts()).audits - before.audits).toBe(1);
    } finally {
      h.setProbe(undefined);
      await cleanup;
    }
  },
  15000,
);
it.each(["REVERSE", "CORRECT"] as const)(
  "C-T04 %s loses COMMIT ack, destroys own connection and recovers same key once",
  async (kind) => {
    const o = await original(),
      key = randomUUID(),
      body = command(kind, o.journalId),
      before = await counts(),
      unrelated = await h.admin.connect();
    let pid: number | undefined;
    h.setProbe(async (stage, c) => {
      if (stage !== "beforeCommit") return;
      pid = (await c.query("SELECT pg_backend_pid() pid")).rows[0].pid;
      const q = c.query.bind(c);
      c.query = (async (...args: unknown[]) => {
        const r = await (q as (...x: unknown[]) => Promise<unknown>)(...args);
        if (args[0] === "COMMIT")
          throw Object.assign(Error("lost ack"), { code: "ECONNRESET" });
        return r;
      }) as pg.PoolClient["query"];
    });
    try {
      expect((await h.api(0, key, body)).status).toBe(503);
      h.setProbe(undefined);
      const replay = await h.api(0, key, body);
      expect(replay.status).toBe(200);
      const r = await replay.json();
      expect(r.originalJournalId).toBe(o.journalId);
      expect((await counts()).audits - before.audits).toBe(1);
      expect((await counts()).receipts - before.receipts).toBe(1);
      expect(
        (
          await h.admin.query(
            "SELECT count(*)::int n FROM pg_stat_activity WHERE pid=$1",
            [pid],
          )
        ).rows[0].n,
      ).toBe(0);
      expect((await unrelated.query("SELECT 1 n")).rows[0].n).toBe(1);
    } finally {
      h.setProbe(undefined);
      unrelated.release();
    }
  },
  10000,
);
it.each(["REVERSE", "CORRECT"] as const)(
  "C-T04 %s cancellation before COMMIT leaves no partial rows",
  async (kind) => {
    const o = await original(),
      before = await counts(),
      controller = new AbortController();
    h.setProbe(async (stage) => {
      if (stage === "beforeCommit") controller.abort();
    });
    try {
      expect(
        (
          await h.api(
            0,
            randomUUID(),
            command(kind, o.journalId),
            {},
            h.users[0]!.workspace,
            true,
            controller.signal,
          )
        ).status,
      ).toBe(503);
      expect(await counts()).toEqual(before);
    } finally {
      h.setProbe(undefined);
    }
  },
);
it.each(["expire", "switch-owner"] as const)(
  "C-T04 real-handler %s during retry rejects without effects",
  async (mode) => {
    const o = await original(),
      before = await counts(),
      u = h.users[0]!,
      session = await h.database.authSession.findUniqueOrThrow({
        where: { id: u.session },
      });
    h.setProbe(async (stage, _c, attempt) => {
      if (stage === "receipt" && attempt === 1)
        await h.admin.query(
          "UPDATE ledger_account SET name=name || 'x' WHERE id=$1",
          [u.bank],
        );
      if (stage === "serialization")
        await h.database.authSession.update({
          where: { id: u.session },
          data:
            mode === "expire"
              ? { expiresAt: new Date(0) }
              : { userId: h.users[1]!.id },
        });
    });
    try {
      expect(
        (await h.api(0, randomUUID(), command("CORRECT", o.journalId))).status,
      ).toBe(401);
      expect(await counts()).toEqual(before);
    } finally {
      h.setProbe(undefined);
      await h.database.authSession.upsert({
        where: { id: u.session },
        create: session,
        update: { expiresAt: session.expiresAt, userId: session.userId },
      });
    }
  },
);
it("C-T04 historical correction replay survives later descendant reversal and cross-kind key conflict", async () => {
  const o = await original(),
    key = randomUUID(),
    body = command("CORRECT", o.journalId),
    first = await h.api(0, key, body);
  expect(first.status).toBe(201);
  const result = await first.json();
  expect(
    (
      await h.api(
        0,
        randomUUID(),
        command("REVERSE", result.replacement.journalId),
      )
    ).status,
  ).toBe(201);
  const before = await counts(),
    replay = await h.api(0, key, body);
  expect(replay.status).toBe(200);
  expect(await replay.json()).toEqual(result);
  expect((await h.api(0, key, command("REVERSE", o.journalId))).status).toBe(
    409,
  );
  expect(await counts()).toEqual(before);
});

it("C-T04 named reversal conflict recovers on fresh authorized snapshot after a durable competing winner", async () => {
  const o = await original(),
    key = randomUUID(),
    before = await counts();
  let injected = false,
    recovered = false;
  const tx: string[] = [];
  h.setProbe(async (stage, c) => {
    if (stage === "begin")
      tx.push((await c.query("SELECT txid_current()::text id")).rows[0].id);
    if (stage === "targetConflict") recovered = true;
    if (stage !== "discovered" || injected) return;
    injected = true;
    expect(
      (await h.api(0, randomUUID(), command("REVERSE", o.journalId))).status,
    ).toBe(201);
    // Explicit SQLSTATE/constraint fault after a real competing commit isolates
    // the named-conflict recovery branch. R/R and R/C races above exercise actual
    // index contention; this fixture is not claimed as a genuine index failure.
    await c.query(
      "DO $$ BEGIN RAISE EXCEPTION 'fixture named constraint' USING ERRCODE='23505',CONSTRAINT='journal_reversesJournalId_workspaceId_ownerId_key'; END $$",
    );
  });
  try {
    const r = await h.api(0, key, command("CORRECT", o.journalId));
    expect(r.status).toBe(409);
    expect(await r.json()).toEqual({ error: "target_unavailable" });
    expect(recovered).toBe(true);
    expect(tx.length).toBe(3);
    expect(new Set(tx).size).toBe(3);
    const after = await counts();
    expect(after.audits - before.audits).toBe(1);
    expect(after.receipts - before.receipts).toBe(1);
    expect(
      (
        await h.admin.query(
          'SELECT count(*)::int n FROM ledger_operation WHERE "idempotencyKey"=$1',
          [key],
        )
      ).rows[0].n,
    ).toBe(0);
  } finally {
    h.setProbe(undefined);
  }
});
