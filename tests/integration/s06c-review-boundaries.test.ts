import { randomUUID } from "node:crypto";
import { writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeAll, afterAll, it, expect } from "vitest";
import { postHarness } from "../support/post-harness";
import { postHTTP } from "../support/post-http";
let h: Awaited<ReturnType<typeof postHarness>>,
  http: Awaited<ReturnType<typeof postHTTP>>;
const evidence: Record<string, unknown>[] = [];
beforeAll(async () => {
  h = await postHarness();
  http = await postHTTP(h);
}, 30000);
afterAll(async () => {
  try {
    await http?.close();
    await h?.cleanup();
  } finally {
    writeFileSync(
      join(tmpdir(), `ledgerone-s06c-boundaries-${process.pid}.json`),
      JSON.stringify(evidence, null, 2),
    );
  }
});
const reverse = (id: string) => ({
  kind: "REVERSE",
  originalJournalId: id,
  effectiveAt: "2026-04-01T00:00:00Z",
  reason: "Independent boundary review",
});
async function call(
  body: unknown,
  index: number | null = 0,
  extra: Record<string, string> = {},
  workspace = h.users[0]!.workspace,
  key = randomUUID(),
) {
  return fetch(`${http.origin}/api/workspaces/${workspace}/ledger/commands`, {
    method: "POST",
    headers: {
      origin: http.origin,
      "content-type": "application/json",
      "idempotency-key": key,
      ...(index === null ? {} : { cookie: h.cookie(index) }),
      ...extra,
    },
    body: JSON.stringify(body),
  });
}
async function posted() {
  const r = await call(h.payload());
  expect(r.status).toBe(201);
  return r.json();
}
async function counts() {
  return (
    await h.admin.query(
      "SELECT (SELECT count(*)::int FROM journal) journals,(SELECT count(*)::int FROM posting) postings,(SELECT count(*)::int FROM ledger_operation) operations,(SELECT count(*)::int FROM audit_event) audits",
    )
  ).rows[0];
}
// Core-only legacy fixtures; no exposed command or modified DB invariants.
async function chain(root: string, n: number) {
  const c = await h.admin.connect(),
    u = h.users[0]!,
    ids: string[] = [];
  try {
    await c.query("BEGIN");
    let prior = root;
    for (let i = 0; i < n; i++) {
      const op = randomUUID(),
        id = randomUUID();
      ids.push(id);
      await c.query(
        'INSERT INTO ledger_operation(id,"workspaceId","ownerId","idempotencyKey","requestHash",kind) VALUES($1,$2,$3,$4,$5,\'REVERSE\')',
        [op, u.workspace, u.id, randomUUID(), "a".repeat(64)],
      );
      await c.query(
        'INSERT INTO journal(id,"workspaceId","ownerId",kind,"reversesJournalId","effectiveAt") VALUES($1,$2,$3,\'REVERSAL\',$4,\'2026-01-01T00:00:00Z\')',
        [id, u.workspace, u.id, prior],
      );
      await c.query(
        'INSERT INTO posting(id,"journalId","workspaceId","ownerId","accountId","currencyCode",side,"nativeMinor","functionalMinor") SELECT gen_random_uuid(),$1,"workspaceId","ownerId","accountId","currencyCode",CASE side WHEN \'DEBIT\' THEN \'CREDIT\'::"PostingSide" ELSE \'DEBIT\'::"PostingSide" END,"nativeMinor","functionalMinor" FROM posting WHERE "journalId"=$2',
        [id, prior],
      );
      await c.query(
        'UPDATE journal SET status=\'POSTED\',"postedAt"=clock_timestamp(),"operationId"=$1 WHERE id=$2',
        [op, id],
      );
      await c.query(
        'INSERT INTO audit_event(id,"workspaceId","ownerId","actorId","requestId",action,"operationId","targetJournalId",reason) VALUES($1,$2,$3,$3,$4,\'ledger.reversed\',$5,$6,\'Core boundary fixture\')',
        [randomUUID(), u.workspace, u.id, randomUUID(), op, prior],
      );
      prior = id;
    }
    await c.query("COMMIT");
    return ids;
  } catch (e) {
    await c.query("ROLLBACK");
    throw e;
  } finally {
    c.release();
  }
}
it("I06 actual 128-journal ancestry boundary rejects 129 while authorized historical replay still works", async () => {
  const root = await posted(),
    ids = await chain(root.journalId, 127),
    key = randomUUID(),
    body = reverse(ids.at(-1)!);
  const started = performance.now();
  const accepted = await call(body, 0, {}, h.users[0]!.workspace, key);
  expect(accepted.status).toBe(201);
  const result = await accepted.json(),
    before = await counts();
  const denied = await call(reverse(result.reversal.journalId));
  expect(denied.status).toBe(409);
  expect(await denied.json()).toEqual({ error: "target_unavailable" });
  expect(await counts()).toEqual(before);
  const replay = await call(body, 0, {}, h.users[0]!.workspace, key);
  expect(replay.status).toBe(200);
  expect(await replay.json()).toEqual(result);
  evidence.push({
    probe: "I06",
    acceptedVisitedJournals: 128,
    rejectedVisitedJournals: 129,
    elapsedMs: Math.round(performance.now() - started),
    historicalReplay: true,
  });
}, 30000);
it("I07 actual cycle/missing/foreign ancestry fails closed even after controlled privileged data corruption", async () => {
  const root = await posted(),
    ids = await chain(root.journalId, 2),
    foreign = await h.api(
      1,
      randomUUID(),
      h.payload(1),
      {},
      h.users[1]!.workspace,
    );
  expect(foreign.status).toBe(201);
  const foreignRoot = await foreign.json();
  const change = async (id: string) => {
    const c = await h.admin.connect();
    try {
      await c.query("BEGIN; SET LOCAL session_replication_role='replica'");
      await c.query('UPDATE journal SET "reversesJournalId"=$1 WHERE id=$2', [
        id,
        ids[0],
      ]);
      await c.query("COMMIT");
    } catch (e) {
      await c.query("ROLLBACK");
      throw e;
    } finally {
      c.release();
    }
  };
  // This is an explicitly privileged DATA corruption probe. Ordinary current
  // writes cannot construct these states; catalog/trigger definitions stay intact.
  for (const [kind, target] of [
    ["cycle", ids[1]!],
    ["missing", randomUUID()],
    ["foreign", foreignRoot.journalId],
  ]) {
    await change(target);
    const before = await counts();
    try {
      const r = await call(reverse(ids[1]!));
      expect(r.status).toBe(409);
      expect(await r.json()).toEqual({ error: "target_unavailable" });
      expect(await counts()).toEqual(before);
      evidence.push({
        probe: "I07",
        controlledDataFault: kind,
        status: r.status,
      });
    } finally {
      await change(root.journalId);
    }
  }
});
it("I08 independent real HTTP calendar/model, prototype forgery and session/tenant negatives", async () => {
  const u = h.users[0]!,
    source = h.payload();
  source.effectiveAt = "2026-01-31T18:29:59.999Z";
  source.legs = [...source.legs, ...source.legs].map((l) => ({
    ...l,
    amount: "500",
  }));
  const first = await call(source);
  expect(first.status).toBe(201);
  const original = await first.json(),
    savedOriginal = (
      await h.admin.query("SELECT * FROM journal WHERE id=$1", [
        original.journalId,
      ])
    ).rows;
  const body = {
    kind: "CORRECT",
    originalJournalId: original.journalId,
    effectiveAt: "2026-02-28T18:30:00Z",
    reason: "Independent calendar model",
    replacement: {
      effectiveAt: "2026-02-28T18:29:59.999Z",
      legs: [
        { accountId: u.expense, side: "DEBIT", currency: "INR", amount: "800" },
        { accountId: u.bank, side: "CREDIT", currency: "INR", amount: "500" },
        { accountId: u.card, side: "CREDIT", currency: "INR", amount: "300" },
      ],
    },
  };
  const before = await counts();
  for (const field of [
    "__proto__",
    "constructor",
    "ownerId",
    "draftId",
    "revision",
  ]) {
    const forged = JSON.parse(
      JSON.stringify(body).slice(0, -1) +
        `,${JSON.stringify(field)}:{"ownerId":"forged"}}`,
    );
    expect((await call(forged)).status).toBe(400);
  }
  expect((await call(body, null, { "x-owner-id": u.id })).status).toBe(401);
  expect((await call(body, 1)).status).toBe(404);
  expect((await call(body, 1, {}, h.users[1]!.workspace)).status).toBe(404);
  expect(
    (await call(body, 0, { origin: "https://other.invalid" })).status,
  ).toBe(403);
  const session = await h.database.authSession.findUniqueOrThrow({
    where: { id: u.session },
  });
  await h.database.authSession.delete({ where: { id: u.session } });
  try {
    expect((await call(body)).status).toBe(401);
  } finally {
    await h.database.authSession.create({ data: session });
  }
  expect(await counts()).toEqual(before);
  const key = randomUUID(),
    r = await call(body, 0, {}, u.workspace, key);
  expect(r.status).toBe(201);
  const result = await r.json();
  expect(result.reversal.legs).toHaveLength(4);
  const periods = [
    ["2025-12-31T18:30:00Z", "2026-01-31T18:30:00Z"],
    ["2026-01-31T18:30:00Z", "2026-02-28T18:30:00Z"],
    ["2026-02-28T18:30:00Z", "2026-03-31T18:30:00Z"],
  ];
  const totals: string[] = [];
  for (const [start, end] of periods)
    totals.push(
      (
        await h.admin.query(
          `SELECT coalesce(sum(CASE p.side WHEN 'DEBIT' THEN p."functionalMinor" ELSE -p."functionalMinor" END),0)::text n FROM posting p JOIN journal j ON j.id=p."journalId" WHERE j."operationId"=ANY($1::uuid[]) AND p."accountId"=$2 AND j."effectiveAt">=$3 AND j."effectiveAt"<$4`,
          [[original.operationId, result.operationId], u.expense, start, end],
        )
      ).rows[0].n,
    );
  expect(totals).toEqual(["100000", "80000", "-100000"]);
  expect(
    (
      await h.admin.query("SELECT * FROM journal WHERE id=$1", [
        original.journalId,
      ])
    ).rows,
  ).toEqual(savedOriginal);
  expect(result.reversal.postedAt).not.toBe(body.effectiveAt);
  expect(result.replacement.postedAt).not.toBe(body.replacement.effectiveAt);
  const descendant = await call(reverse(result.replacement.journalId));
  expect(descendant.status).toBe(201);
  await h.admin.query(
    "UPDATE ledger_account SET name='Archived during independent review',\"archivedAt\"=NOW() WHERE id=ANY($1::uuid[])",
    [[u.bank, u.card]],
  );
  try {
    const replay = await call(body, 0, {}, u.workspace, key);
    expect(replay.status).toBe(200);
    expect(await replay.json()).toEqual(result);
  } finally {
    await h.admin.query(
      'UPDATE ledger_account SET "archivedAt"=NULL WHERE id=ANY($1::uuid[])',
      [[u.bank, u.card]],
    );
  }
  evidence.push({
    probe: "I08",
    monthExpenseMinor: totals,
    duplicateOriginalLegs: 4,
    twoUserAndRevocationDenials: true,
    immutableDescendantArchiveReplay: true,
  });
});
it("I09 maximum 1000-distinct-account correction is atomic under bounded local resource limits", async () => {
  const u = h.users[0]!,
    ids = Array.from({ length: 1000 }, () => randomUUID()),
    op = randomUUID(),
    journal = randomUUID(),
    c = await h.admin.connect();
  try {
    await c.query("BEGIN");
    await c.query(
      'INSERT INTO ledger_account(id,"workspaceId","ownerId",name,type,kind,"currencyCode","updatedAt") SELECT x,$2,$3,\'Independent capacity\',CASE WHEN ord%2=1 THEN \'EXPENSE\'::"AccountClass" ELSE \'ASSET\'::"AccountClass" END,CASE WHEN ord%2=1 THEN \'EXPENSE\'::"AccountKind" ELSE \'BANK\'::"AccountKind" END,\'INR\',NOW() FROM unnest($1::uuid[]) WITH ORDINALITY a(x,ord)',
      [ids, u.workspace, u.id],
    );
    await c.query(
      'INSERT INTO ledger_operation(id,"workspaceId","ownerId","idempotencyKey","requestHash",kind) VALUES($1,$2,$3,$4,$5,\'POST\')',
      [op, u.workspace, u.id, randomUUID(), "a".repeat(64)],
    );
    await c.query(
      'INSERT INTO journal(id,"workspaceId","ownerId","effectiveAt") VALUES($1,$2,$3,\'2026-01-01T00:00:00Z\')',
      [journal, u.workspace, u.id],
    );
    await c.query(
      'INSERT INTO posting(id,"journalId","workspaceId","ownerId","accountId","currencyCode",side,"nativeMinor","functionalMinor") SELECT gen_random_uuid(),$2,$3,$4,x,\'INR\',CASE WHEN ord%2=1 THEN \'DEBIT\'::"PostingSide" ELSE \'CREDIT\'::"PostingSide" END,999999999999999999,999999999999999999 FROM unnest($1::uuid[]) WITH ORDINALITY a(x,ord)',
      [ids.slice(0, 500), journal, u.workspace, u.id],
    );
    await c.query(
      'UPDATE journal SET status=\'POSTED\',"postedAt"=clock_timestamp(),"operationId"=$1 WHERE id=$2',
      [op, journal],
    );
    await c.query(
      'INSERT INTO audit_event(id,"workspaceId","ownerId","actorId","requestId",action,"operationId","targetJournalId",reason) VALUES($1,$2,$3,$3,$4,\'ledger.posted\',$5,$6,\'Core capacity source\')',
      [randomUUID(), u.workspace, u.id, randomUUID(), op, journal],
    );
    await c.query("COMMIT");
  } catch (e) {
    await c.query("ROLLBACK");
    throw e;
  } finally {
    c.release();
  }
  const before = await counts(),
    key = randomUUID(),
    body = {
      kind: "CORRECT",
      originalJournalId: journal,
      effectiveAt: "2026-02-01T00:00:00Z",
      reason: "Maximum distinct account capacity",
      replacement: {
        effectiveAt: "2026-03-01T00:00:00Z",
        legs: ids.slice(500).map((accountId, i) => ({
          accountId,
          side: i % 2 ? "CREDIT" : "DEBIT",
          currency: "INR",
          amount: "9999999999999999.99",
        })),
      },
    };
  const started = performance.now(),
    response = await call(body, 0, {}, u.workspace, key),
    elapsedMs = Math.round(performance.now() - started),
    after = await counts();
  expect([201, 503]).toContain(response.status);
  if (response.status === 201) {
    const r = await response.json();
    expect(r.reversal.legs).toHaveLength(500);
    expect(r.replacement.legs).toHaveLength(500);
    expect(after).toEqual({
      journals: before.journals + 2,
      postings: before.postings + 1000,
      operations: before.operations + 1,
      audits: before.audits + 1,
    });
  } else {
    expect(await response.json()).toEqual({ error: "service_unavailable" });
    expect(after).toEqual(before);
    expect(
      (
        await h.admin.query(
          'SELECT count(*)::int n FROM ledger_operation WHERE "idempotencyKey"=$1',
          [key],
        )
      ).rows[0].n,
    ).toBe(0);
  }
  evidence.push({
    probe: "I09",
    distinctAccounts: 1000,
    newPostings: 1000,
    status: response.status,
    elapsedMs,
    atomic: true,
    hostedLatencySlaProven: false,
  });
}, 60000);
