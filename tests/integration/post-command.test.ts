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

it.each([false, true])(
  "B-T04 real 40001 whole-transaction retry/exhaustion (exhaust=%s)",
  async (exhaust) => {
    const before = await counts(),
      seen: number[] = [];
    h.setProbe(async (stage, _c, attempt) => {
      if (stage === "receipt" && (exhaust || attempt === 1))
        await h.admin.query(
          "UPDATE ledger_account SET name=name || 'x' WHERE id=$1",
          [h.users[0]!.bank],
        );
      if (stage === "serialization") seen.push(attempt);
    });
    try {
      const result = await h.api(0, randomUUID(), h.payload());
      expect(result.status).toBe(exhaust ? 503 : 201);
      expect(seen).toEqual(exhaust ? [1, 2, 3] : [1]);
      const after = await counts();
      if (exhaust) expect(after).toEqual(before);
      else expect(after.audits - before.audits).toBe(1);
    } finally {
      h.setProbe(undefined);
    }
  },
);

it("B-T04 real 40P01 command victim retries fully and audit commits once", async () => {
  const before = await counts(),
    seen: number[] = [];
  let cleanup: Promise<void> | undefined;
  h.setProbe(async (stage, c, attempt) => {
    if (stage === "deadlock") seen.push(attempt);
    if (stage !== "locked" || attempt !== 1) return;
    const contender = await h.admin.connect();
    await contender.query(
      "BEGIN; SET LOCAL deadlock_timeout='10s'; SELECT pg_advisory_xact_lock(76233441)",
    );
    // Contender waits on our account; our command waits on its advisory lock.
    const waiting = contender.query(
      "SELECT id FROM ledger_account WHERE id=$1 FOR UPDATE",
      [h.users[0]!.bank],
    );
    cleanup = waiting
      .then(async () => {
        await contender.query("ROLLBACK");
      })
      .finally(() => contender.release());
    await c.query("SELECT pg_advisory_xact_lock(76233441)");
  });
  try {
    const response = await h.api(0, randomUUID(), h.payload());
    expect(response.status).toBe(201);
    expect(seen).toEqual([1]);
    const after = await counts();
    expect(after.audits - before.audits).toBe(1);
    expect(after.receipts - before.receipts).toBe(1);
  } finally {
    h.setProbe(undefined);
    await cleanup;
  }
}, 10000);

it("B-T04 statement timeout aborts without partial effects and pooled settings reset", async () => {
  const before = await counts();
  let entered = false;
  h.setProbe(async (stage, c) => {
    if (stage === "begin") {
      entered = true;
      await c.query("SELECT pg_sleep(3)");
    }
  });
  try {
    expect((await h.api(0, randomUUID(), h.payload())).status).toBe(503);
    expect(entered).toBe(true);
    expect(await counts()).toEqual(before);
  } finally {
    h.setProbe(undefined);
  }
  let checked = false;
  h.setProbe(async (stage, c) => {
    if (stage === "connected") {
      const r = (
        await c.query(
          "SELECT current_setting('statement_timeout') AS statement,current_setting('lock_timeout') AS lock,current_setting('transaction_timeout') AS transaction,current_user AS role",
        )
      ).rows[0];
      expect(r).toEqual({
        statement: "0",
        lock: "0",
        transaction: "0",
        role: h.role,
      });
      checked = true;
    }
  });
  try {
    expect((await h.api(0, randomUUID(), h.payload())).status).toBe(201);
    expect(checked).toBe(true);
  } finally {
    h.setProbe(undefined);
  }
}, 10000);

it("B-T04 ambiguous COMMIT transport error destroys connection; fresh replay finds committed result", async () => {
  const key = randomUUID(),
    before = await counts();
  let intercepted = false;
  h.setProbe(async (stage, c) => {
    if (stage !== "beforeCommit") return;
    const original = c.query.bind(c);
    // Database executes COMMIT; the caller loses its acknowledgement. No SQLSTATE
    // is fabricated, and the committed rows are independently verified afterward.
    c.query = (async (...args: unknown[]) => {
      const result = await (
        original as (...args: unknown[]) => Promise<unknown>
      )(...args);
      if (args[0] === "COMMIT") {
        intercepted = true;
        throw Object.assign(new Error("lost ack"), { code: "ECONNRESET" });
      }
      return result;
    }) as pg.PoolClient["query"];
  });
  try {
    expect((await h.api(0, key, h.payload())).status).toBe(503);
    expect(intercepted).toBe(true);
  } finally {
    h.setProbe(undefined);
  }
  const replay = await h.api(0, key, h.payload());
  expect(replay.status).toBe(200);
  const after = await counts();
  expect(after.audits - before.audits).toBe(1);
  expect(after.receipts - before.receipts).toBe(1);
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

it("B-T03 replays immutable history after archive/rename while rejecting a new post", async () => {
  const key = randomUUID(),
    payload = h.payload(),
    first = await h.api(0, key, payload),
    result = await first.json();
  expect(first.status).toBe(201);
  const before = await counts();
  await h.admin.query(
    "UPDATE ledger_account SET name='Renamed',\"archivedAt\"=NOW() WHERE id=$1",
    [h.users[0]!.bank],
  );
  try {
    const replay = await h.api(0, key, {
      ...payload,
      legs: [...payload.legs].reverse(),
    });
    expect(replay.status).toBe(200);
    expect(await replay.json()).toEqual(result);
    expect((await h.api(0, randomUUID(), payload)).status).toBe(409);
    expect(await counts()).toEqual(before);
    expect(
      (await h.api(0, key, { ...payload, reason: "Changed" })).status,
    ).toBe(409);
  } finally {
    await h.admin.query(
      'UPDATE ledger_account SET "archivedAt"=NULL WHERE id=$1',
      [h.users[0]!.bank],
    );
  }
});
it("B-T03 concurrent same-key retries use fresh transactions and commit exactly once", async () => {
  const key = randomUUID(),
    before = await counts(),
    seen: { attempt: number; tx: string }[] = [];
  let release!: () => void;
  const ready = new Promise<void>((r) => {
    release = r;
  });
  let arrived = 0;
  h.setProbe(async (stage, c, attempt) => {
    if (stage === "begin") {
      seen.push({
        attempt,
        tx: (await c.query("SELECT txid_current()::text AS tx")).rows[0].tx,
      });
      if (attempt === 1) {
        if (++arrived === 4) release();
        await ready;
      }
    }
  });
  try {
    const responses = await Promise.all(
      Array.from({ length: 4 }, () => h.api(0, key, h.payload())),
    );
    expect(responses.map((r) => r.status).sort()).toEqual([200, 200, 200, 201]);
    const results = await Promise.all(responses.map((r) => r.json()));
    for (const result of results) expect(result).toEqual(results[0]);
    const after = await counts();
    expect(after).toEqual({
      journals: before.journals + 1,
      postings: before.postings + 2,
      receipts: before.receipts + 1,
      audits: before.audits + 1,
    });
    expect(new Set(seen.map((s) => s.tx)).size).toBe(seen.length);
    expect(seen.some((s) => s.attempt > 1)).toBe(true);
  } finally {
    h.setProbe(undefined);
  }
});
it("B-T03 concurrent key/payload conflict has one winner and no loser effects", async () => {
  const key = randomUUID(),
    before = await counts();
  const responses = await Promise.all([
    h.api(0, key, h.payload()),
    h.api(0, key, { ...h.payload(), reason: "Different" }),
  ]);
  expect(responses.map((r) => r.status).sort()).toEqual([201, 409]);
  const after = await counts();
  expect(after.receipts - before.receipts).toBe(1);
  expect(after.audits - before.audits).toBe(1);
});
it("B-T03 uncertain committed response recovers original result on fresh same-key request", async () => {
  const key = randomUUID(),
    before = await counts();
  let original: unknown;
  h.setProbe(async (stage, c) => {
    if (stage === "committed") {
      original = (
        await c.query(
          'SELECT id FROM ledger_operation WHERE "idempotencyKey"=$1',
          [key],
        )
      ).rows[0].id;
      throw new Error("response connection lost");
    }
  });
  try {
    expect((await h.api(0, key, h.payload())).status).toBe(503);
  } finally {
    h.setProbe(undefined);
  }
  const replay = await h.api(0, key, h.payload());
  expect(replay.status).toBe(200);
  expect((await replay.json()).operationId).toBe(original);
  const after = await counts();
  expect(after.receipts - before.receipts).toBe(1);
  expect(after.audits - before.audits).toBe(1);
});
it("B-T03 aborted attempt with no durable receipt permits one new first commit", async () => {
  const key = randomUUID(),
    before = await counts();
  h.setProbe(async (stage) => {
    if (stage === "beforeCommit") throw new Error("not committed");
  });
  try {
    expect((await h.api(0, key, h.payload())).status).toBe(503);
  } finally {
    h.setProbe(undefined);
  }
  expect(await counts()).toEqual(before);
  expect((await h.api(0, key, h.payload())).status).toBe(201);
  expect((await h.api(0, key, h.payload())).status).toBe(200);
});
it("B-T03 duplicate posting multiplicity survives canonical replay", async () => {
  const p = h.payload(),
    payload = { ...p, legs: [...p.legs, ...p.legs] },
    key = randomUUID();
  const first = await h.api(0, key, payload),
    result = await first.json();
  expect(first.status).toBe(201);
  expect(result.legs).toHaveLength(4);
  expect(
    await (
      await h.api(0, key, { ...payload, legs: payload.legs.reverse() })
    ).json(),
  ).toEqual(result);
});

it.each(["expired", "revoked", "removed", "unverified"])(
  "B-T05 real %s session cannot POST or replay",
  async (mode) => {
    const user = h.users[1]!,
      payload = h.payload(1),
      key = randomUUID();
    expect((await h.api(1, key, payload, {}, user.workspace)).status).toBe(201);
    const before = await counts(),
      email = `${user.id}@ledgerone.test`;
    try {
      if (mode === "expired")
        await h.database.authSession.update({
          where: { id: user.session },
          data: { expiresAt: new Date(Date.now() - 1000) },
        });
      if (mode === "revoked")
        await h.database.authSession.delete({ where: { id: user.session } });
      if (mode === "removed") h.runtime.config.allowedEmails.delete(email);
      if (mode === "unverified")
        await h.database.user.update({
          where: { id: user.id },
          data: { emailVerified: false },
        });
      expect((await h.api(1, key, payload, {}, user.workspace)).status).toBe(
        401,
      );
      expect(
        (await h.api(1, randomUUID(), payload, {}, user.workspace)).status,
      ).toBe(401);
      expect(await counts()).toEqual(before);
    } finally {
      h.runtime.config.allowedEmails.add(email);
      await h.database.user.update({
        where: { id: user.id },
        data: { emailVerified: true },
      });
      await h.database.authSession.upsert({
        where: { id: user.session },
        update: { expiresAt: new Date(Date.now() + 3600000) },
        create: {
          id: user.session,
          userId: user.id,
          token: user.token,
          expiresAt: new Date(Date.now() + 3600000),
        },
      });
    }
  },
);
it("B-T05 ownership is checked again before any replay and keys are independently scoped", async () => {
  const key = randomUUID(),
    a = await h.api(0, key, h.payload());
  expect(a.status).toBe(201);
  const first = await a.json();
  const before = await counts();
  expect(
    (await h.api(1, key, h.payload(), { "x-owner-id": h.users[0]!.id })).status,
  ).toBe(404);
  expect(await counts()).toEqual(before);
  const b = await h.api(1, key, h.payload(1), {}, h.users[1]!.workspace);
  expect(b.status).toBe(201);
  expect((await b.json()).operationId).not.toBe(first.operationId);
  const own = await h.api(0, key, h.payload(), {
    "x-owner-id": h.users[1]!.id,
    "x-request-id": "spoofed",
  });
  expect(own.status).toBe(200);
  expect(await own.json()).toEqual(first);
  expect(own.headers.get("x-request-id")).not.toBe("spoofed");
});
it("B-T05 session revoked during a serialization retry cannot complete a second attempt", async () => {
  const user = h.users[1]!,
    before = await counts();
  h.setProbe(async (stage, _c, attempt) => {
    if (stage === "receipt" && attempt === 1)
      await h.admin.query(
        "UPDATE ledger_account SET name=name||'r' WHERE id=$1",
        [user.bank],
      );
    if (stage === "serialization")
      await h.database.authSession.delete({ where: { id: user.session } });
  });
  try {
    expect(
      (await h.api(1, randomUUID(), h.payload(1), {}, user.workspace)).status,
    ).toBe(401);
    expect(await counts()).toEqual(before);
  } finally {
    h.setProbe(undefined);
    await h.database.authSession.create({
      data: {
        id: user.session,
        userId: user.id,
        token: user.token,
        expiresAt: new Date(Date.now() + 3600000),
      },
    });
  }
});
it.each([
  [
    "trigger",
    "ALTER TABLE journal DISABLE TRIGGER journal_balanced_at_commit",
    "ALTER TABLE journal ENABLE TRIGGER journal_balanced_at_commit",
  ],
  [
    "function",
    "ALTER FUNCTION ledger06_audit_target() SECURITY DEFINER",
    "ALTER FUNCTION ledger06_audit_target() SECURITY INVOKER",
  ],
  [
    "version",
    "UPDATE app_metadata SET value='unknown' WHERE key='schema_version'",
    "UPDATE app_metadata SET value='7' WHERE key='schema_version'",
  ],
  [
    "checksum",
    "UPDATE _prisma_migrations SET checksum=repeat('0',64) WHERE migration_name='202611110007_command_audit_controls'",
    "",
  ],
])(
  "B-T05 actual handler fails closed on %s invariant drift",
  async (_name, change, restore) => {
    const before = await counts();
    const checksum = (
      await h.admin.query(
        "SELECT checksum FROM _prisma_migrations WHERE migration_name='202611110007_command_audit_controls'",
      )
    ).rows[0].checksum;
    await h.admin.query(change);
    try {
      expect((await h.api(0, randomUUID(), h.payload())).status).toBe(503);
      expect(await counts()).toEqual(before);
    } finally {
      if (restore) await h.admin.query(restore);
      else
        await h.admin.query(
          "UPDATE _prisma_migrations SET checksum=$1 WHERE migration_name='202611110007_command_audit_controls'",
          [checksum],
        );
    }
  },
);
it("B-T05 restricted command role cannot alter invariants, audit, ownership or migration history", async () => {
  const c = await h.admin.connect();
  try {
    for (const sql of [
      "ALTER TABLE journal DISABLE TRIGGER journal_balanced_at_commit",
      "TRUNCATE posting",
      "DELETE FROM posting",
      "UPDATE audit_event SET reason='rewrite'",
      "UPDATE ledger_account SET \"ownerId\"='other'",
      "SELECT * FROM _prisma_migrations",
      "SET session_replication_role=replica",
    ]) {
      await c.query(`BEGIN; SET LOCAL ROLE "${h.role}"`);
      await expect(c.query(sql)).rejects.toMatchObject({ code: "42501" });
      await c.query("ROLLBACK");
    }
  } finally {
    await c.query("ROLLBACK");
    c.release();
  }
});
it("B-T05 unrelated unique audit failure rolls back once without pretending to replay", async () => {
  const before = await counts();
  let attempts = 0;
  h.setProbe(async (stage, c) => {
    if (stage === "begin") attempts++;
    if (stage === "audit")
      await c.query(
        'INSERT INTO audit_event(id,"workspaceId","ownerId","actorId","requestId",action,"operationId","targetJournalId",reason) SELECT $1,"workspaceId","ownerId","actorId","requestId",action,"operationId","targetJournalId",reason FROM audit_event ORDER BY "occurredAt" DESC LIMIT 1',
        [randomUUID()],
      );
  });
  try {
    expect((await h.api(0, randomUUID(), h.payload())).status).toBe(503);
    expect(attempts).toBe(1);
    expect(await counts()).toEqual(before);
  } finally {
    h.setProbe(undefined);
  }
});

it.each(["empty", "version", "unavailable", "owner"] as const)(
  "B-T05 rejects %s verifier/runtime activation without effects",
  async (mode) => {
    const before = await counts();
    await expect(h.factory(mode)).rejects.toThrow("service_unavailable");
    expect(await counts()).toEqual(before);
  },
);

it("B-T05 lock timeout rolls receipt and draft back without retrying partial work", async () => {
  const before = await counts(),
    locker = await h.admin.connect();
  try {
    await locker.query("BEGIN");
    await locker.query("SELECT id FROM ledger_account WHERE id=$1 FOR UPDATE", [
      h.users[0]!.bank,
    ]);
    expect((await h.api(0, randomUUID(), h.payload())).status).toBe(503);
    expect(await counts()).toEqual(before);
  } finally {
    await locker.query("ROLLBACK");
    locker.release();
  }
});
it("B-T05 archive race is rechecked on a fresh attempt without silently unarchiving", async () => {
  const before = await counts(),
    attempts: number[] = [];
  h.setProbe(async (stage, _c, attempt) => {
    if (stage === "receipt") {
      attempts.push(attempt);
      if (attempt === 1)
        await h.admin.query(
          'UPDATE ledger_account SET "archivedAt"=NOW() WHERE id=$1',
          [h.users[0]!.bank],
        );
    }
  });
  try {
    expect((await h.api(0, randomUUID(), h.payload())).status).toBe(409);
    expect(attempts).toEqual([1, 2]);
    expect(await counts()).toEqual(before);
    expect(
      (
        await h.admin.query(
          'SELECT "archivedAt" FROM ledger_account WHERE id=$1',
          [h.users[0]!.bank],
        )
      ).rows[0].archivedAt,
    ).not.toBeNull();
  } finally {
    h.setProbe(undefined);
    await h.admin.query(
      'UPDATE ledger_account SET "archivedAt"=NULL WHERE id=$1',
      [h.users[0]!.bank],
    );
  }
});
