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
const url = () =>
  `${http.origin}/api/workspaces/${h.users[0]!.workspace}/ledger/commands`;
const headers = (key: string) => ({
  origin: http.origin,
  "content-type": "application/json",
  "idempotency-key": key,
  cookie: h.cookie(0),
});
const send = (key: string, body: unknown, signal?: AbortSignal) =>
  fetch(url(), {
    method: "POST",
    headers: headers(key),
    body: JSON.stringify(body),
    signal,
  });
type Kind = "REVERSE" | "CORRECT";
function command(kind: Kind, id: string) {
  const base = {
    kind,
    originalJournalId: id,
    effectiveAt: "2026-02-01T00:00:00Z",
    reason: "HTTP correction fixture",
  };
  return kind === "REVERSE"
    ? base
    : {
        ...base,
        replacement: {
          effectiveAt: "2026-03-01T00:00:00Z",
          legs: h.payload().legs.map((l) => ({
            ...l,
            amount: "8",
            accountId: l.side === "CREDIT" ? h.users[0]!.card : l.accountId,
          })),
        },
      };
}
async function original() {
  const body = h.payload();
  body.legs[1]!.accountId = h.users[0]!.card;
  const r = await send(randomUUID(), body);
  expect(r.status).toBe(201);
  return r.json();
}
async function snapshot() {
  return (
    await h.admin.query(
      `SELECT (SELECT count(*)::int FROM journal) journals,(SELECT count(*)::int FROM posting) postings,(SELECT count(*)::int FROM ledger_operation) receipts,(SELECT count(*)::int FROM audit_event) audits,(SELECT count(*)::int FROM journal WHERE status='DRAFT') drafts`,
    )
  ).rows[0];
}
async function balance() {
  return (
    await h.admin.query(
      `SELECT p."accountId",sum(CASE p.side WHEN 'DEBIT' THEN p."functionalMinor" ELSE -p."functionalMinor" END)::text n FROM posting p JOIN journal j ON j.id=p."journalId" WHERE j.status='POSTED' GROUP BY p."accountId" ORDER BY p."accountId"`,
    )
  ).rows as { accountId: string; n: string }[];
}
it.each(["REVERSE", "CORRECT"] as const)(
  "C-T05 combined HTTP POST → %s proves isolation, balances, atomic audit and immutable replay",
  async (kind) => {
    const initial = await balance(),
      o = await original(),
      before = await snapshot(),
      beforeBalance = await balance(),
      key = randomUUID(),
      body = command(kind, o.journalId);
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
    const pending = send(key, body);
    try {
      await paused;
      expect(await snapshot()).toEqual(before);
      expect(await balance()).toEqual(beforeBalance);
      release();
      const r = await pending;
      expect(r.status).toBe(201);
      const result = await r.json();
      h.setProbe(undefined);
      expect(await snapshot()).toEqual({
        journals: before.journals + (kind === "REVERSE" ? 1 : 2),
        postings: before.postings + (kind === "REVERSE" ? 2 : 4),
        receipts: before.receipts + 1,
        audits: before.audits + 1,
        drafts: 0,
      });
      const final = await balance(),
        base = new Map(initial.map((l) => [l.accountId, BigInt(l.n)]));
      expect(
        BigInt(final.find((l) => l.accountId === h.users[0]!.expense)!.n) -
          (base.get(h.users[0]!.expense) ?? 0n),
      ).toBe(kind === "REVERSE" ? 0n : 800n);
      expect(
        BigInt(final.find((l) => l.accountId === h.users[0]!.card)!.n) -
          (base.get(h.users[0]!.card) ?? 0n),
      ).toBe(kind === "REVERSE" ? 0n : -800n);
      const audit = (
        await h.admin.query(
          'SELECT * FROM audit_event WHERE "operationId"=$1',
          [result.operationId],
        )
      ).rows;
      expect(audit).toHaveLength(1);
      expect(audit[0].targetJournalId).toBe(o.journalId);
      expect(audit[0].actorId).toBe(h.users[0]!.id);
      expect(audit[0].requestId).toBe(r.headers.get("x-request-id"));
      await h.admin.query(
        "UPDATE ledger_account SET name='Archived card',\"archivedAt\"=NOW() WHERE id=$1",
        [h.users[0]!.card],
      );
      try {
        const replay = await send(key, body);
        expect(replay.status).toBe(200);
        expect(await replay.json()).toEqual(result);
        expect(await balance()).toEqual(final);
      } finally {
        await h.admin.query(
          'UPDATE ledger_account SET "archivedAt"=NULL WHERE id=$1',
          [h.users[0]!.card],
        );
      }
    } finally {
      release();
      h.setProbe(undefined);
      await pending;
    }
  },
);
it.each(["REVERSE", "CORRECT"] as const)(
  "C-T05 real HTTP disconnect after %s COMMIT recovers durable result exactly once",
  async (kind) => {
    const o = await original(),
      before = await snapshot(),
      key = randomUUID(),
      body = command(kind, o.journalId),
      controller = new AbortController();
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
    const pending = send(key, body, controller.signal).catch((e: Error) => ({
      error: e.name,
    }));
    try {
      await committed;
      expect((await snapshot()).receipts).toBe(before.receipts + 1);
      controller.abort();
      expect(await pending).toEqual({ error: "AbortError" });
      release();
      h.setProbe(undefined);
      const replay = await send(key, body);
      expect(replay.status).toBe(200);
      const result = await replay.json();
      expect(await (await send(key, body)).json()).toEqual(result);
      expect((await snapshot()).audits).toBe(before.audits + 1);
      expect((await snapshot()).drafts).toBe(0);
    } finally {
      release();
      h.setProbe(undefined);
      controller.abort();
      await pending;
    }
  },
);
it.each(["REVERSE", "CORRECT"] as const)(
  "C-T05 real HTTP disconnect before %s COMMIT rolls back all private rows",
  async (kind) => {
    const o = await original(),
      before = await snapshot(),
      controller = new AbortController();
    let reached!: () => void, release!: () => void, status: number | undefined;
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
    h.setLogger((t) => {
      status = t.status;
    });
    const pending = send(
      randomUUID(),
      command(kind, o.journalId),
      controller.signal,
    ).catch((e: Error) => ({ error: e.name }));
    try {
      await paused;
      const signal = http.signals.at(-1)!;
      controller.abort();
      expect(await pending).toEqual({ error: "AbortError" });
      for (let i = 0; i < 100 && !signal.aborted; i++)
        await new Promise((r) => setTimeout(r, 10));
      expect(signal.aborted).toBe(true);
      release();
      for (let i = 0; i < 100 && status === undefined; i++)
        await new Promise((r) => setTimeout(r, 10));
      expect(status).toBe(503);
      expect(await snapshot()).toEqual(before);
    } finally {
      release();
      h.setProbe(undefined);
      h.setLogger();
      controller.abort();
      await pending;
    }
  },
);
it.each(["REVERSE", "CORRECT"] as const)(
  "C-T05 actual %s handlers reject session/origin/owner/allowlist/internal attacks with zero effects",
  async (kind) => {
    const o = await original(),
      body = command(kind, o.journalId),
      before = await snapshot(),
      u = h.users[0]!,
      session = await h.database.authSession.findUniqueOrThrow({
        where: { id: u.session },
      });
    for (const [index, extra, status] of [
      [null, {}, 401],
      [null, { "x-owner-id": u.id }, 401],
      [0, { origin: "https://attacker.invalid" }, 403],
      [0, { "sec-fetch-site": "cross-site" }, 403],
      [0, { cookie: "forged" }, 401],
    ] as const)
      expect((await h.api(index, randomUUID(), body, extra)).status).toBe(
        status,
      );
    expect(
      (await h.api(1, randomUUID(), body, { "x-owner-id": u.id })).status,
    ).toBe(404);
    for (const field of [
      "ownerId",
      "draftId",
      "revision",
      "operationId",
      "requestHash",
      "legs",
    ])
      expect(
        (await h.api(0, randomUUID(), { ...body, [field]: "injected" })).status,
      ).toBe(400);
    const email = `${u.id}@ledgerone.test`;
    h.runtime.config.allowedEmails.delete(email);
    try {
      expect((await h.api(0, randomUUID(), body)).status).toBe(401);
    } finally {
      h.runtime.config.allowedEmails.add(email);
    }
    await h.database.user.update({
      where: { id: u.id },
      data: { emailVerified: false },
    });
    try {
      expect((await h.api(0, randomUUID(), body)).status).toBe(401);
    } finally {
      await h.database.user.update({
        where: { id: u.id },
        data: { emailVerified: true },
      });
    }
    await h.database.authSession.delete({ where: { id: u.session } });
    try {
      expect((await h.api(0, randomUUID(), body)).status).toBe(401);
    } finally {
      await h.database.authSession.create({ data: session });
    }
    expect(await snapshot()).toEqual(before);
  },
);

it.each(["REVERSE", "CORRECT"] as const)(
  "C-T05 %s attestation rejects trigger/function/CHECK/grant/checksum drift before any financial row",
  async (kind) => {
    for (const mode of ["trigger", "function", "check", "grant", "checksum"]) {
      const o = await original(),
        key = randomUUID(),
        body = command(kind, o.journalId),
        before = await snapshot();
      const definition = (
        await h.admin.query(
          "SELECT pg_get_constraintdef(oid,true) d FROM pg_constraint WHERE conname='posting_fx_not_enabled'",
        )
      ).rows[0].d;
      const checksum = (
        await h.admin.query(
          "SELECT checksum FROM _prisma_migrations WHERE migration_name='202611110007_command_audit_controls'",
        )
      ).rows[0].checksum;
      const change =
        mode === "trigger"
          ? "ALTER TABLE journal DISABLE TRIGGER journal_balanced_at_commit"
          : mode === "function"
            ? "ALTER FUNCTION ledger06_audit_target() SECURITY DEFINER"
            : mode === "check"
              ? "ALTER TABLE posting DROP CONSTRAINT posting_fx_not_enabled; ALTER TABLE posting ADD CONSTRAINT posting_fx_not_enabled CHECK (true)"
              : mode === "grant"
                ? `GRANT UPDATE ON posting TO "${h.role}"`
                : "UPDATE _prisma_migrations SET checksum=repeat('0',64) WHERE migration_name='202611110007_command_audit_controls'";
      await h.admin.query(change);
      try {
        const r = await send(key, body);
        expect(r.status).toBe(503);
        expect(await r.json()).toEqual({ error: "service_unavailable" });
        expect(await snapshot()).toEqual(before);
      } finally {
        if (mode === "trigger")
          await h.admin.query(
            "ALTER TABLE journal ENABLE TRIGGER journal_balanced_at_commit",
          );
        else if (mode === "function")
          await h.admin.query(
            "ALTER FUNCTION ledger06_audit_target() SECURITY INVOKER",
          );
        else if (mode === "check")
          await h.admin.query(
            `ALTER TABLE posting DROP CONSTRAINT posting_fx_not_enabled; ALTER TABLE posting ADD CONSTRAINT posting_fx_not_enabled ${definition}`,
          );
        else if (mode === "grant")
          await h.admin.query(`REVOKE UPDATE ON posting FROM "${h.role}"`);
        else
          await h.admin.query(
            "UPDATE _prisma_migrations SET checksum=$1 WHERE migration_name='202611110007_command_audit_controls'",
            [checksum],
          );
      }
      expect((await send(key, body)).status).toBe(201);
    }
  },
  15000,
);
