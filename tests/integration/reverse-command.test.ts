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
const command = (id: string) => ({
  kind: "REVERSE",
  originalJournalId: id,
  effectiveAt: "2026-02-01T00:00:00Z",
  reason: "Undo exact purchase",
  description: "Reversal",
});
async function original() {
  const r = await h.api(0, randomUUID(), h.payload());
  expect(r.status).toBe(201);
  return r.json();
}
async function counts() {
  return (
    await h.admin.query(
      "SELECT (SELECT count(*)::int FROM journal) journals,(SELECT count(*)::int FROM posting) postings,(SELECT count(*)::int FROM ledger_operation) receipts,(SELECT count(*)::int FROM audit_event) audits",
    )
  ).rows[0];
}
it("C-T02 authorized exact reversal retains duplicate MAX legs and original timestamps; immutable replay after archive", async () => {
  const p = h.payload();
  p.legs = [...p.legs, ...p.legs].map((l) => ({
    ...l,
    amount: "9999999999999999.99",
  }));
  const first = await h.api(0, randomUUID(), p);
  expect(first.status).toBe(201);
  const o = await first.json();
  const stored = (
    await h.admin.query("SELECT * FROM journal WHERE id=$1", [o.journalId])
  ).rows;
  const key = randomUUID(),
    before = await counts(),
    body = command(o.journalId);
  const r = await h.api(0, key, body);
  expect(r.status).toBe(201);
  const result = await r.json();
  expect(result.kind).toBe("REVERSE");
  expect(result.originalJournalId).toBe(o.journalId);
  expect(result.reversal.legs).toHaveLength(4);
  expect(
    result.reversal.legs.every(
      (l: { nativeMinor: string }) => l.nativeMinor === "999999999999999999",
    ),
  ).toBe(true);
  const multiset = (
    legs: { accountId: string; side: string; nativeMinor: string }[],
  ) => legs.map((l) => [l.accountId, l.side, l.nativeMinor].join(":")).sort();
  expect(multiset(result.reversal.legs)).toEqual(
    multiset(
      o.legs.map((l: { side: string }) => ({
        ...l,
        side: l.side === "DEBIT" ? "CREDIT" : "DEBIT",
      })),
    ),
  );
  expect(await counts()).toEqual({
    journals: before.journals + 1,
    postings: before.postings + 4,
    receipts: before.receipts + 1,
    audits: before.audits + 1,
  });
  expect(
    (await h.admin.query("SELECT * FROM journal WHERE id=$1", [o.journalId]))
      .rows,
  ).toEqual(stored);
  const audit = (
    await h.admin.query(
      'SELECT action,"targetJournalId","ownerId" FROM audit_event WHERE "operationId"=$1',
      [result.operationId],
    )
  ).rows;
  expect(audit).toEqual([
    {
      action: "ledger.reversed",
      targetJournalId: o.journalId,
      ownerId: h.users[0]!.id,
    },
  ]);
  await h.admin.query(
    "UPDATE ledger_account SET name='Renamed',\"archivedAt\"=NOW() WHERE id=$1",
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
it("C-T02 exact target locks follow all account locks before trigger predecessor SHARE", async () => {
  const o = await original();
  let checked = false;
  h.setProbe(async (stage) => {
    if (stage !== "targetLocked") return;
    const contender = await h.admin.connect();
    try {
      await contender.query("BEGIN");
      await expect(
        contender.query(
          "SELECT id FROM journal WHERE id=$1 FOR UPDATE NOWAIT",
          [o.journalId],
        ),
      ).rejects.toMatchObject({ code: "55P03" });
    } finally {
      await contender.query("ROLLBACK");
      contender.release();
    }
    checked = true;
  });
  try {
    expect((await h.api(0, randomUUID(), command(o.journalId))).status).toBe(
      201,
    );
    expect(checked).toBe(true);
  } finally {
    h.setProbe(undefined);
  }
});
it("C-T02 reversal-of-reversal preserves acyclic explicit-node history; root cannot reverse twice", async () => {
  const o = await original();
  const a = await h.api(0, randomUUID(), command(o.journalId));
  expect(a.status).toBe(201);
  const r = await a.json();
  const b = await h.api(0, randomUUID(), command(r.reversal.journalId));
  expect(b.status).toBe(201);
  expect((await b.json()).originalJournalId).toBe(r.reversal.journalId);
  const before = await counts();
  expect((await h.api(0, randomUUID(), command(o.journalId))).status).toBe(409);
  expect(await counts()).toEqual(before);
});
it("C-T02 real handler rejects foreign/missing/draft/archived targets and injected legs without effects", async () => {
  const o = await original(),
    before = await counts();
  for (const [index, workspace, id] of [
    [1, h.users[0]!.workspace, o.journalId],
    [1, h.users[1]!.workspace, o.journalId],
    [0, h.users[0]!.workspace, randomUUID()],
  ] as const)
    expect(
      (await h.api(index, randomUUID(), command(id), {}, workspace)).status,
    ).toBe(404);
  expect(
    (
      await h.api(0, randomUUID(), {
        ...command(o.journalId),
        legs: h.payload().legs,
      })
    ).status,
  ).toBe(400);
  await h.admin.query(
    'UPDATE ledger_account SET "archivedAt"=NOW() WHERE id=$1',
    [h.users[0]!.bank],
  );
  try {
    expect((await h.api(0, randomUUID(), command(o.journalId))).status).toBe(
      409,
    );
  } finally {
    await h.admin.query(
      'UPDATE ledger_account SET "archivedAt"=NULL WHERE id=$1',
      [h.users[0]!.bank],
    );
  }
  expect(await counts()).toEqual(before);
  const draft = randomUUID();
  await h.admin.query(
    'INSERT INTO journal(id,"workspaceId","ownerId","effectiveAt") VALUES($1,$2,$3,NOW())',
    [draft, h.users[0]!.workspace, h.users[0]!.id],
  );
  const withDraft = await counts();
  expect((await h.api(0, randomUUID(), command(draft))).status).toBe(409);
  expect(await counts()).toEqual(withDraft);
});
it.each([
  "receipt",
  "discovered",
  "locked",
  "targetLocked",
  "draft",
  "postings",
  "sealed",
  "audit",
  "beforeCommit",
])(
  "C-T02 failure at %s leaves original and all counts intact",
  async (stage) => {
    const o = await original(),
      before = await counts();
    h.setProbe(async (s) => {
      if (s === stage) throw Error("fixture failure");
    });
    try {
      expect((await h.api(0, randomUUID(), command(o.journalId))).status).toBe(
        503,
      );
      expect(await counts()).toEqual(before);
    } finally {
      h.setProbe(undefined);
    }
  },
);
