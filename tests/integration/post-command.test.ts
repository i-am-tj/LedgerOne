import { randomUUID } from "node:crypto";
import { beforeAll, afterAll, it, expect } from "vitest";
import { postHarness } from "../support/post-harness";
let h: Awaited<ReturnType<typeof postHarness>>;
beforeAll(async () => {
  h = await postHarness();
}, 30000);
afterAll(async () => {
  await h?.cleanup();
});
async function counts() {
  return (
    await h.admin.query(
      "SELECT (SELECT count(*) FROM journal)::int AS journals,(SELECT count(*) FROM posting)::int AS postings,(SELECT count(*) FROM ledger_operation)::int AS receipts,(SELECT count(*) FROM audit_event)::int AS audits",
    )
  ).rows[0];
}
it("B-T02 actual session-derived POST commits one balanced journal/receipt/linked audit under a non-owner writer", async () => {
  const response = await h.api(0, randomUUID(), h.payload());
  expect(response.status).toBe(201);
  const result = await response.json();
  const row = (
    await h.admin.query(
      'SELECT a.*,j.status FROM audit_event a JOIN journal j ON j.id=a."targetJournalId" WHERE a."operationId"=$1',
      [result.operationId],
    )
  ).rows[0];
  expect(row.ownerId).toBe(h.users[0]!.id);
  expect(row.actorId).toBe(row.ownerId);
  expect(row.requestId).toBe(response.headers.get("x-request-id"));
  expect(row.status).toBe("POSTED");
  expect(
    result.legs.map((l: { nativeMinor: string }) => l.nativeMinor),
  ).toEqual(["1000", "1000"]);
  expect(response.headers.get("cache-control")).toContain("no-store");
});
it.each(["receipt", "draft", "postings", "sealed", "audit", "beforeCommit"])(
  "B-T02 failure at %s rolls every financial row back",
  async (stage) => {
    const before = await counts();
    h.setProbe(async (s) => {
      if (s === stage) throw new Error("private failure");
    });
    try {
      const r = await h.api(0, randomUUID(), h.payload());
      expect(r.status).toBe(503);
      expect(await r.json()).toEqual({ error: "service_unavailable" });
      expect(await counts()).toEqual(before);
    } finally {
      h.setProbe(undefined);
    }
  },
);
it("B-T02 deferred invalid audit aborts the complete command at COMMIT", async () => {
  const before = await counts();
  const original = (
    await h.admin.query("SELECT id FROM journal WHERE status='POSTED' LIMIT 1")
  ).rows[0].id;
  h.setProbe(async (stage, c) => {
    if (stage !== "beforeCommit") return;
    const u = h.users[0]!,
      op = randomUUID(),
      j = randomUUID();
    await c.query(
      'INSERT INTO ledger_operation(id,"workspaceId","ownerId","idempotencyKey","requestHash",kind) VALUES($1,$2,$3,$4,$5,\'POST\')',
      [op, u.workspace, u.id, randomUUID(), "a".repeat(64)],
    );
    await c.query(
      'INSERT INTO journal(id,"workspaceId","ownerId","effectiveAt") VALUES($1,$2,$3,NOW())',
      [j, u.workspace, u.id],
    );
    for (const [account, side] of [
      [u.bank, "CREDIT"],
      [u.expense, "DEBIT"],
    ])
      await c.query(
        'INSERT INTO posting(id,"journalId","workspaceId","ownerId","accountId","currencyCode",side,"nativeMinor","functionalMinor") VALUES($1,$2,$3,$4,$5,\'INR\',$6,100,100)',
        [randomUUID(), j, u.workspace, u.id, account, side],
      );
    await c.query(
      'UPDATE journal SET status=\'POSTED\',"postedAt"=NOW(),"operationId"=$1 WHERE id=$2',
      [op, j],
    );
    // Valid existing same-owner target, but not this operation's journal.
    await c.query(
      'INSERT INTO audit_event(id,"workspaceId","ownerId","actorId","requestId",action,"operationId","targetJournalId",reason) VALUES($1,$2,$3,$3,$4,\'ledger.posted\',$5,$6,\'fixture\')',
      [randomUUID(), u.workspace, u.id, randomUUID(), op, original],
    );
  });
  try {
    expect((await h.api(0, randomUUID(), h.payload())).status).toBe(503);
    expect(await counts()).toEqual(before);
  } finally {
    h.setProbe(undefined);
  }
});
it("B-T02 session, scope, origin, internal fields and disabled exposure deny without effects", async () => {
  const before = await counts();
  for (const [who, payload, headers, workspace, enabled, status] of [
    [null, h.payload(), {}, h.users[0]!.workspace, true, 401],
    [1, h.payload(), {}, h.users[0]!.workspace, true, 404],
    [0, h.payload(1), {}, h.users[0]!.workspace, true, 404],
    [
      0,
      h.payload(),
      { origin: "https://evil.test" },
      h.users[0]!.workspace,
      true,
      403,
    ],
    [
      0,
      { ...h.payload(), ownerId: h.users[1]!.id },
      {},
      h.users[0]!.workspace,
      true,
      400,
    ],
    [
      0,
      { ...h.payload(), draftId: randomUUID(), revision: 1 },
      {},
      h.users[0]!.workspace,
      true,
      400,
    ],
    [0, h.payload(), {}, h.users[0]!.workspace, false, 503],
  ] as const)
    expect(
      (await h.api(who, randomUUID(), payload, headers, workspace, enabled))
        .status,
    ).toBe(status);
  expect(await counts()).toEqual(before);
});
