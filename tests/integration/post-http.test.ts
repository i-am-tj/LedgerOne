import { randomUUID } from "node:crypto";
import { beforeAll, afterAll, it, expect } from "vitest";
import { postHarness } from "../support/post-harness";
import { postHTTP } from "../support/post-http";
let h: Awaited<ReturnType<typeof postHarness>>,
  http: Awaited<ReturnType<typeof postHTTP>>;
beforeAll(async () => {
  h = await postHarness();
  http = await postHTTP(h);
}, 30000);
afterAll(async () => {
  await http?.close();
  await h?.cleanup();
});
async function snapshot() {
  return (
    await h.admin.query(`SELECT
 (SELECT count(*)::int FROM journal) AS journals,(SELECT count(*)::int FROM posting) AS postings,
 (SELECT count(*)::int FROM ledger_operation) AS receipts,(SELECT count(*)::int FROM audit_event) AS audits,
 (SELECT count(*)::int FROM journal WHERE status='DRAFT') AS drafts,
 (SELECT coalesce(sum(CASE WHEN p.side='DEBIT' THEN p."functionalMinor" ELSE -p."functionalMinor" END),0)::text FROM posting p JOIN journal j ON j.id=p."journalId" WHERE j.status='POSTED') AS net`)
  ).rows[0];
}
async function balances() {
  return (
    await h.admin.query(
      `SELECT a.id,coalesce(sum(CASE WHEN p.side='DEBIT' THEN p."nativeMinor" ELSE -p."nativeMinor" END),0)::text AS debit FROM ledger_account a LEFT JOIN posting p ON p."accountId"=a.id AND EXISTS(SELECT 1 FROM journal j WHERE j.id=p."journalId" AND j.status='POSTED') GROUP BY a.id ORDER BY a.id`,
    )
  ).rows;
}
const url = () =>
  `${http.origin}/api/workspaces/${h.users[0]!.workspace}/ledger/commands`;
const headers = (key: string, index = 0) => ({
  origin: http.origin,
  "content-type": "application/json",
  "idempotency-key": key,
  cookie: h.cookie(index),
});
it("B-AC01 combined end-to-end POST proves isolation, atomic audit, balances and immutable identical replay", async () => {
  const before = await snapshot(),
    u = h.users[0]!,
    payload = h.payload();
  // Debit an expense and credit a card liability: both normal balances increase.
  payload.legs[1]!.accountId = u.card;
  let reached!: () => void, release!: () => void;
  const paused = new Promise<void>((r) => {
      reached = r;
    }),
    gate = new Promise<void>((r) => {
      release = r;
    });
  h.setProbe(async (stage) => {
    if (stage === "beforeCommit") {
      reached();
      await gate;
    }
  });
  const key = randomUUID();
  const pending = fetch(url(), {
    method: "POST",
    headers: headers(key),
    body: JSON.stringify(payload),
  });
  try {
    await paused;
    // Different pool/connection sees none of this transaction's rows or draft.
    expect(await snapshot()).toEqual(before);
    release();
    const first = await pending;
    expect(first.status).toBe(201);
    const result = await first.json();
    h.setProbe(undefined);
    expect(await snapshot()).toEqual({
      journals: before.journals + 1,
      postings: before.postings + 2,
      receipts: before.receipts + 1,
      audits: before.audits + 1,
      drafts: 0,
      net: "0",
    });
    const balance = await balances();
    expect(balance.find((b) => b.id === u.expense).debit).toBe("1000");
    expect(balance.find((b) => b.id === u.card).debit).toBe("-1000");
    const audit = (
      await h.admin.query('SELECT * FROM audit_event WHERE "operationId"=$1', [
        result.operationId,
      ])
    ).rows;
    expect(audit).toHaveLength(1);
    expect(audit[0].targetJournalId).toBe(result.journalId);
    expect(audit[0].actorId).toBe(u.id);
    expect(audit[0].requestId).toBe(first.headers.get("x-request-id"));
    await h.admin.query(
      "UPDATE ledger_account SET name='Archived card',\"archivedAt\"=NOW() WHERE id=$1",
      [u.card],
    );
    const replay = await fetch(url(), {
      method: "POST",
      headers: headers(key),
      body: JSON.stringify({ ...payload, legs: [...payload.legs].reverse() }),
    });
    expect(replay.status).toBe(200);
    expect(await replay.json()).toEqual(result);
    expect(replay.headers.get("x-request-id")).not.toBe(
      first.headers.get("x-request-id"),
    );
    expect(await balances()).toEqual(balance);
    expect((await snapshot()).receipts).toBe(before.receipts + 1);
  } finally {
    release();
    h.setProbe(undefined);
    await pending;
    await h.admin.query(
      'UPDATE ledger_account SET "archivedAt"=NULL WHERE id=$1',
      [u.card],
    );
  }
  // Failed audit after journal finalization leaves all rows and balances unchanged.
  const stable = await snapshot(),
    stableBalance = await balances();
  h.setProbe(async (stage, c) => {
    if (stage === "sealed")
      await c.query(
        'INSERT INTO audit_event(id,"workspaceId","ownerId","actorId","requestId",action) VALUES($1,$2,$3,$4,$5,\'workspace.created\')',
        [randomUUID(), u.workspace, u.id, h.users[1]!.id, randomUUID()],
      );
  });
  try {
    const failed = await fetch(url(), {
      method: "POST",
      headers: headers(randomUUID()),
      body: JSON.stringify(payload),
    });
    expect(failed.status).toBe(503);
    expect(await snapshot()).toEqual(stable);
    expect(await balances()).toEqual(stableBalance);
  } finally {
    h.setProbe(undefined);
  }
});
it("B-T05 real HTTP two-user, forged identity, query/origin/body and method attacks deny without effects", async () => {
  const before = await snapshot();
  for (const request of [
    () =>
      fetch(url(), {
        method: "POST",
        headers: { ...headers(randomUUID(), 1), "x-owner-id": h.users[0]!.id },
        body: JSON.stringify(h.payload()),
      }),
    () =>
      fetch(url(), {
        method: "POST",
        headers: {
          origin: http.origin,
          "content-type": "application/json",
          "idempotency-key": randomUUID(),
        },
        body: JSON.stringify(h.payload()),
      }),
    () =>
      fetch(url(), {
        method: "POST",
        headers: headers(randomUUID()),
        body: JSON.stringify({ ...h.payload(), ownerId: h.users[1]!.id }),
      }),
    () =>
      fetch(url() + "?ownerId=" + h.users[1]!.id, {
        method: "POST",
        headers: headers(randomUUID()),
        body: JSON.stringify(h.payload()),
      }),
    () =>
      fetch(url(), {
        method: "POST",
        headers: { ...headers(randomUUID()), origin: "https://evil.test" },
        body: JSON.stringify(h.payload()),
      }),
    () =>
      fetch(url(), {
        method: "POST",
        headers: { ...headers(randomUUID()), "sec-fetch-site": "cross-site" },
        body: JSON.stringify(h.payload()),
      }),
    () =>
      fetch(url(), {
        method: "POST",
        headers: headers(randomUUID()),
        body: JSON.stringify(h.payload(1)),
      }),
    () =>
      fetch(url(), {
        method: "POST",
        headers: { ...headers(randomUUID()), "content-length": "131073" },
        body: "x".repeat(131073),
      }),
    () => fetch(url(), { method: "GET", headers: headers(randomUUID()) }),
  ]) {
    const response = await request();
    expect([400, 401, 403, 404, 405]).toContain(response.status);
    expect(await response.text()).not.toContain(h.users[1]!.id);
  }
  expect(await snapshot()).toEqual(before);
});

it("B-AC08 real HTTP disconnect after COMMIT replays the durable original exactly once", async () => {
  const before = await snapshot(),
    key = randomUUID();
  let reached!: () => void, release!: () => void;
  const committed = new Promise<void>((r) => {
      reached = r;
    }),
    gate = new Promise<void>((r) => {
      release = r;
    });
  h.setProbe(async (stage) => {
    if (stage === "committed") {
      reached();
      await gate;
    }
  });
  const controller = new AbortController();
  const pending = fetch(url(), {
    method: "POST",
    headers: headers(key),
    body: JSON.stringify(h.payload()),
    signal: controller.signal,
  }).catch((error: Error) => ({ error: error.name }));
  try {
    await committed;
    expect((await snapshot()).receipts).toBe(before.receipts + 1);
    const original = (
      await h.admin.query(
        'SELECT id FROM ledger_operation WHERE "idempotencyKey"=$1',
        [key],
      )
    ).rows[0].id;
    controller.abort();
    expect(await pending).toEqual({ error: "AbortError" });
    release();
    h.setProbe(undefined);
    const replay = await fetch(url(), {
      method: "POST",
      headers: headers(key),
      body: JSON.stringify(h.payload()),
    });
    expect(replay.status).toBe(200);
    const result = await replay.json();
    expect(result.operationId).toBe(original);
    const again = await fetch(url(), {
      method: "POST",
      headers: headers(key),
      body: JSON.stringify(h.payload()),
    });
    expect(await again.json()).toEqual(result);
    const after = await snapshot();
    expect(after.receipts - before.receipts).toBe(1);
    expect(after.journals - before.journals).toBe(1);
    expect(after.audits - before.audits).toBe(1);
    expect(after.drafts).toBe(0);
  } finally {
    release();
    h.setProbe(undefined);
    controller.abort();
    await pending;
  }
});
