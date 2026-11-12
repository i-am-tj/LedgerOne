import { randomUUID } from "node:crypto";
import { beforeAll, afterAll, expect, it } from "vitest";
import { postHarness } from "../support/post-harness";
let h: Awaited<ReturnType<typeof postHarness>>;
beforeAll(async () => {
  h = await postHarness();
}, 30000);
afterAll(async () => {
  await h?.cleanup();
});
async function original() {
  const r = await h.api(0, randomUUID(), {
    ...h.payload(),
    effectiveAt: "2026-01-10T00:00:00Z",
    legs: h.payload().legs.map((l) => ({ ...l, amount: "1000" })),
  });
  expect(r.status).toBe(201);
  return r.json();
}
const correct = (id: string) => ({
  kind: "CORRECT",
  originalJournalId: id,
  effectiveAt: "2026-02-10T00:00:00Z",
  description: "Reverse original",
  reason: "Correct original",
  replacement: {
    effectiveAt: "2026-03-10T00:00:00Z",
    description: "Replacement",
    legs: h.payload().legs.map((l) => ({ ...l, amount: "900" })),
  },
});
async function counts() {
  return (
    await h.admin.query(
      "SELECT (SELECT count(*)::int FROM journal) journals,(SELECT count(*)::int FROM posting) postings,(SELECT count(*)::int FROM ledger_operation) receipts,(SELECT count(*)::int FROM audit_event) audits",
    )
  ).rows[0];
}
async function periods(ops: string[], account: string) {
  const boundaries = [
    "2025-12-31T18:30:00Z",
    "2026-01-31T18:30:00Z",
    "2026-02-28T18:30:00Z",
    "2026-03-31T18:30:00Z",
  ];
  const values: string[] = [],
    asOf: string[] = [];
  for (let i = 1; i < boundaries.length; i++) {
    const sum = async (start: string) =>
      (
        await h.admin.query(
          `SELECT coalesce(sum(CASE p.side WHEN 'DEBIT' THEN p."functionalMinor" ELSE -p."functionalMinor" END),0)::text n FROM posting p JOIN journal j ON j.id=p."journalId" WHERE j."operationId"=ANY($1::uuid[]) AND j.status='POSTED' AND p."accountId"=$2 AND j."effectiveAt">=$3 AND j."effectiveAt"<$4 AND j."ownerId"=$5 AND j."workspaceId"=$6`,
          [
            ops,
            account,
            start,
            boundaries[i],
            h.users[0]!.id,
            h.users[0]!.workspace,
          ],
        )
      ).rows[0].n as string;
    values.push(await sum(boundaries[i - 1]!));
    asOf.push(await sum(boundaries[0]!));
  }
  return { values, asOf };
}
it("C-T03 cross-month CORRECT commits exact O plus replacement and one audit; dates/timestamps/replay independent", async () => {
  const o = await original(),
    snapshot = (
      await h.admin.query("SELECT * FROM journal WHERE id=$1", [o.journalId])
    ).rows;
  const key = randomUUID(),
    body = correct(o.journalId),
    before = await counts();
  const r = await h.api(0, key, body);
  expect(r.status).toBe(201);
  const result = await r.json();
  expect(result.kind).toBe("CORRECT");
  expect(result.originalJournalId).toBe(o.journalId);
  expect(result.reversal.effectiveAt).toBe("2026-02-10T00:00:00.000Z");
  expect(result.replacement.effectiveAt).toBe("2026-03-10T00:00:00.000Z");
  expect(result.reversal.postedAt).not.toBe(result.reversal.effectiveAt);
  expect(result.replacement.postedAt).not.toBe(result.replacement.effectiveAt);
  expect(
    await periods([o.operationId, result.operationId], h.users[0]!.expense),
  ).toEqual({
    values: ["100000", "-100000", "90000"],
    asOf: ["100000", "0", "90000"],
  });
  expect(
    await periods([o.operationId, result.operationId], h.users[0]!.bank),
  ).toEqual({
    values: ["-100000", "100000", "-90000"],
    asOf: ["-100000", "0", "-90000"],
  });
  expect(await counts()).toEqual({
    journals: before.journals + 2,
    postings: before.postings + 4,
    receipts: before.receipts + 1,
    audits: before.audits + 1,
  });
  expect(
    (await h.admin.query("SELECT * FROM journal WHERE id=$1", [o.journalId]))
      .rows,
  ).toEqual(snapshot);
  const audits = (
    await h.admin.query(
      'SELECT action,"targetJournalId" FROM audit_event WHERE "operationId"=$1',
      [result.operationId],
    )
  ).rows;
  expect(audits).toEqual([
    { action: "ledger.corrected", targetJournalId: o.journalId },
  ]);
  await h.admin.query(
    "UPDATE ledger_account SET name='Archived',\"archivedAt\"=NOW() WHERE id=$1",
    [h.users[0]!.bank],
  );
  try {
    const replay = await h.api(0, key, body);
    expect(replay.status).toBe(200);
    expect(await replay.json()).toEqual(result);
  } finally {
    await h.admin.query(
      'UPDATE ledger_account SET "archivedAt"=NULL WHERE id=$1',
      [h.users[0]!.bank],
    );
  }
});
it("C-T03 explicit prior-month restatement keeps immutable original and independent dates", async () => {
  const o = await original(),
    body = correct(o.journalId);
  body.effectiveAt = "2026-01-20T00:00:00Z";
  body.replacement.effectiveAt = "2026-01-21T00:00:00Z";
  const r = await h.api(0, randomUUID(), body);
  expect(r.status).toBe(201);
  const result = await r.json();
  expect(
    await periods([o.operationId, result.operationId], h.users[0]!.expense),
  ).toEqual({ values: ["90000", "0", "0"], asOf: ["90000", "90000", "90000"] });
});
it("C-T03 Asia/Kolkata half-open boundaries assign reversal and replacement to independent months", async () => {
  const o = await original(),
    body = correct(o.journalId);
  body.effectiveAt = "2026-02-28T18:30:00Z";
  body.replacement.effectiveAt = "2026-02-28T18:29:59.999Z";
  const r = await h.api(0, randomUUID(), body);
  expect(r.status).toBe(201);
  const result = await r.json();
  expect(
    await periods([o.operationId, result.operationId], h.users[0]!.expense),
  ).toEqual({
    values: ["100000", "90000", "-100000"],
    asOf: ["100000", "190000", "90000"],
  });
});
it("C-T03 failure building replacement after sealed reversal rolls both journals, receipt and audit back", async () => {
  const o = await original(),
    before = await counts(),
    body = correct(o.journalId);
  let sealed = 0;
  h.setProbe(async (stage) => {
    if (stage === "sealed") sealed++;
    if (stage === "postings" && sealed === 1)
      throw Error("replacement failure");
  });
  try {
    expect((await h.api(0, randomUUID(), body)).status).toBe(503);
    expect(sealed).toBe(1);
    expect(await counts()).toEqual(before);
    expect(await periods([o.operationId], h.users[0]!.expense)).toEqual({
      values: ["100000", "0", "0"],
      asOf: ["100000", "100000", "100000"],
    });
  } finally {
    h.setProbe(undefined);
  }
});
it("C-T03 foreign replacement account and target/internal injection cannot change original", async () => {
  const o = await original(),
    body = correct(o.journalId),
    before = await counts();
  body.replacement.legs[0]!.accountId = h.users[1]!.expense;
  expect((await h.api(0, randomUUID(), body)).status).toBe(404);
  expect(
    (
      await h.api(
        1,
        randomUUID(),
        correct(o.journalId),
        {},
        h.users[1]!.workspace,
      )
    ).status,
  ).toBe(404);
  expect(
    (
      await h.api(0, randomUUID(), {
        ...correct(o.journalId),
        replacement: {
          ...correct(o.journalId).replacement,
          originalJournalId: o.journalId,
        },
      })
    ).status,
  ).toBe(400);
  expect(await counts()).toEqual(before);
});
it("C-T03 repeated CORRECT targets the explicit eligible GENERAL replacement, never its ancestor", async () => {
  const o = await original(),
    first = await h.api(0, randomUUID(), correct(o.journalId));
  expect(first.status).toBe(201);
  const a = await first.json();
  const second = await h.api(0, randomUUID(), correct(a.replacement.journalId));
  expect(second.status).toBe(201);
  const b = await second.json();
  expect(b.originalJournalId).toBe(a.replacement.journalId);
  const before = await counts();
  expect((await h.api(0, randomUUID(), correct(o.journalId))).status).toBe(409);
  expect(await counts()).toEqual(before);
  const audit = (
    await h.admin.query(
      'SELECT "targetJournalId" FROM audit_event WHERE "operationId"=$1',
      [b.operationId],
    )
  ).rows[0];
  expect(audit.targetJournalId).toBe(a.replacement.journalId);
});

it.each([
  "omit",
  "duplicate",
  "wrong-target",
  "wrong-operation",
  "wrong-owner",
])("C-T03 %s financial audit aborts the whole correction", async (mode) => {
  const o = await original(),
    other = await original(),
    before = await counts();
  let sealed = 0,
    intercepted = false;
  h.setProbe(async (stage, c) => {
    if (stage !== "sealed" || ++sealed !== 2) return;
    const originalQuery = c.query.bind(c);
    c.query = (async (...args: unknown[]) => {
      if (
        typeof args[0] === "string" &&
        args[0].startsWith("INSERT INTO audit_event")
      ) {
        c.query = originalQuery;
        intercepted = true;
        const values = [...(args[1] as unknown[])];
        if (mode === "omit") return originalQuery("SELECT 1");
        if (mode === "wrong-target") values[6] = other.journalId;
        if (mode === "wrong-operation") values[5] = other.operationId;
        if (mode === "wrong-owner") values[2] = h.users[1]!.id;
        const q = originalQuery as (...x: unknown[]) => Promise<unknown>;
        const r = await q(args[0], values);
        if (mode === "duplicate") await q(args[0], values);
        return r;
      }
      return (originalQuery as (...x: unknown[]) => Promise<unknown>)(...args);
    }) as typeof c.query;
  });
  try {
    expect((await h.api(0, randomUUID(), correct(o.journalId))).status).toBe(
      503,
    );
    expect(intercepted).toBe(true);
    expect(await counts()).toEqual(before);
  } finally {
    h.setProbe(undefined);
  }
});

it("C-T03 ledger-only repeated opening correction retains one original marker; handlers reject all opening provenance", async () => {
  const u = h.users[0]!,
    equity = randomUUID();
  await h.admin.query(
    "INSERT INTO ledger_account(id,\"workspaceId\",\"ownerId\",name,type,kind,\"currencyCode\",\"updatedAt\") VALUES($1,$2,$3,'Opening equity','EQUITY','OPENING_EQUITY','INR',NOW())",
    [equity, u.workspace, u.id],
  );
  type Draft = {
    kind: "OPENING" | "REVERSAL" | "GENERAL";
    original?: string;
    amount: string;
    side: "DEBIT" | "CREDIT";
  };
  const core = async (
    kind: "OPENING" | "CORRECT" | "REVERSE",
    drafts: Draft[],
  ) => {
    const c = await h.admin.connect(),
      op = randomUUID(),
      ids: string[] = [];
    try {
      await c.query("BEGIN");
      await c.query(
        'INSERT INTO ledger_operation(id,"workspaceId","ownerId","idempotencyKey","requestHash",kind) VALUES($1,$2,$3,$4,$5,$6)',
        [op, u.workspace, u.id, randomUUID(), "a".repeat(64), kind],
      );
      for (const d of drafts) {
        const id = randomUUID();
        ids.push(id);
        await c.query(
          'INSERT INTO journal(id,"workspaceId","ownerId","effectiveAt",kind,"reversesJournalId") VALUES($1,$2,$3,NOW(),$4,$5)',
          [id, u.workspace, u.id, d.kind, d.original ?? null],
        );
        for (const [account, side] of [
          [u.bank, d.side],
          [equity, d.side === "DEBIT" ? "CREDIT" : "DEBIT"],
        ])
          await c.query(
            'INSERT INTO posting(id,"journalId","workspaceId","ownerId","accountId","currencyCode",side,"nativeMinor","functionalMinor") VALUES($1,$2,$3,$4,$5,\'INR\',$6,$7,$7)',
            [randomUUID(), id, u.workspace, u.id, account, side, d.amount],
          );
        if (d.kind === "OPENING")
          await c.query(
            'INSERT INTO opening_balance(id,"workspaceId","ownerId","accountId","journalId",source) VALUES($1,$2,$3,$4,$5,\'Ledger-only fixture\')',
            [randomUUID(), u.workspace, u.id, u.bank, id],
          );
        await c.query(
          'UPDATE journal SET status=\'POSTED\',"postedAt"=clock_timestamp(),"operationId"=$1 WHERE id=$2',
          [op, id],
        );
      }
      // OPENING's exposed audit contract belongs to S07; this is a legacy/core
      // schema fixture, not a test capability or public OPENING command.
      if (kind !== "OPENING")
        await c.query(
          'INSERT INTO audit_event(id,"workspaceId","ownerId","actorId","requestId",action,"operationId","targetJournalId",reason) VALUES($1,$2,$3,$3,$4,$5,$6,$7,\'Core provenance fixture\')',
          [
            randomUUID(),
            u.workspace,
            u.id,
            randomUUID(),
            kind === "CORRECT" ? "ledger.corrected" : "ledger.reversed",
            op,
            drafts[0]!.original,
          ],
        );
      await c.query("COMMIT");
      return ids;
    } catch (e) {
      await c.query("ROLLBACK");
      throw e;
    } finally {
      c.release();
    }
  };
  const [opening] = await core("OPENING", [
    { kind: "OPENING", amount: "1000", side: "DEBIT" },
  ]);
  const a = await core("CORRECT", [
    { kind: "REVERSAL", original: opening, amount: "1000", side: "CREDIT" },
    { kind: "GENERAL", amount: "900", side: "DEBIT" },
  ]);
  const b = await core("CORRECT", [
    { kind: "REVERSAL", original: a[1], amount: "900", side: "CREDIT" },
    { kind: "GENERAL", amount: "800", side: "DEBIT" },
  ]);
  const undo = await core("REVERSE", [
    { kind: "REVERSAL", original: b[0], amount: "900", side: "DEBIT" },
  ]);
  const markers = (
    await h.admin.query(
      'SELECT "journalId" FROM opening_balance WHERE "accountId"=$1',
      [u.bank],
    )
  ).rows;
  expect(markers).toEqual([{ journalId: opening }]);
  const before = await counts();
  for (const id of [opening, ...a, ...b, ...undo]) {
    const r = await h.api(0, randomUUID(), correct(id!));
    expect(r.status).toBe(409);
    expect(await r.json()).toEqual({ error: "target_unavailable" });
  }
  expect(await counts()).toEqual(before);
});

it("C-T05 CORRECT locks complete original/replacement account union before exact target", async () => {
  const o = await original(),
    body = correct(o.journalId);
  body.replacement.legs[1]!.accountId = h.users[0]!.card;
  let checked = false;
  h.setProbe(async (stage) => {
    if (stage !== "targetLocked") return;
    for (const id of [
      h.users[0]!.bank,
      h.users[0]!.expense,
      h.users[0]!.card,
    ]) {
      const c = await h.admin.connect();
      try {
        await c.query("BEGIN");
        await expect(
          c.query(
            "SELECT id FROM ledger_account WHERE id=$1 FOR UPDATE NOWAIT",
            [id],
          ),
        ).rejects.toMatchObject({ code: "55P03" });
      } finally {
        await c.query("ROLLBACK");
        c.release();
      }
    }
    checked = true;
  });
  try {
    expect((await h.api(0, randomUUID(), body)).status).toBe(201);
    expect(checked).toBe(true);
  } finally {
    h.setProbe(undefined);
  }
});

it("C-T05 full-capacity CORRECT preserves 500 original and 500 replacement MAX-sized legs exactly", async () => {
  const payload = h.payload(),
    pair = payload.legs.map((l) => ({ ...l, amount: "9999999999999999.99" }));
  payload.legs = Array.from({ length: 250 }, () => pair).flat();
  const posted = await h.api(0, randomUUID(), payload);
  expect(posted.status).toBe(201);
  const o = await posted.json(),
    body = correct(o.journalId);
  body.replacement.legs = payload.legs;
  const r = await h.api(0, randomUUID(), body);
  expect(r.status).toBe(201);
  const result = await r.json();
  expect(result.reversal.legs).toHaveLength(500);
  expect(result.replacement.legs).toHaveLength(500);
  const debit = result.replacement.legs
    .filter((l: { side: string }) => l.side === "DEBIT")
    .reduce(
      (n: bigint, l: { nativeMinor: string }) => n + BigInt(l.nativeMinor),
      0n,
    );
  expect(debit).toBe(250n * 999999999999999999n);
}, 20000);
