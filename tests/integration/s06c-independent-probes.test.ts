// Independent review probes introduced after publication 2922ce3. Existing
// implementation is untouched during the initial review. Fixtures are local.
import { randomBytes, randomUUID } from "node:crypto";
import { writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  parseCommand,
  requestHash,
} from "../../src/lib/ledger/commands/contract";
import { createServer, connect, type Socket } from "node:net";
import type { AddressInfo } from "node:net";
import type pg from "pg";
import { beforeAll, afterAll, it, expect } from "vitest";
import { postHarness } from "../support/post-harness";
import { PostExecutor } from "../../src/lib/ledger/commands/executor";
import { postRequest } from "../../src/lib/ledger/commands/http";
const evidence: Record<string, unknown>[] = [];
let h: Awaited<ReturnType<typeof postHarness>>;
beforeAll(async () => {
  h = await postHarness();
}, 30000);
afterAll(async () => {
  try {
    await h?.cleanup();
  } finally {
    writeFileSync(
      join(tmpdir(), `ledgerone-s06c-independent-${process.pid}.json`),
      JSON.stringify(evidence, null, 2),
    );
  }
});
async function counts() {
  return (
    await h.admin.query(
      "SELECT (SELECT count(*)::int FROM ledger_operation) operations,(SELECT count(*)::int FROM journal) journals,(SELECT count(*)::int FROM posting) postings,(SELECT count(*)::int FROM audit_event) audits",
    )
  ).rows[0];
}
async function posted() {
  const r = await h.api(0, randomUUID(), h.payload());
  expect(r.status).toBe(201);
  return r.json();
}
function command(kind: "REVERSE" | "CORRECT", id: string) {
  return {
    kind,
    originalJournalId: id,
    effectiveAt: "2026-02-01T00:00:00Z",
    reason: "Independent review",
    ...(kind === "CORRECT"
      ? {
          replacement: {
            effectiveAt: "2026-03-01T00:00:00Z",
            legs: h.payload().legs,
          },
        }
      : {}),
  };
}
it.each([
  ["REVERSE", "REVERSE"],
  ["REVERSE", "CORRECT"],
  ["CORRECT", "CORRECT"],
] as const)(
  "I01 actual stale-snapshot %s/%s index race, no injected SQLSTATE",
  async (a, b) => {
    const o = await posted(),
      before = await counts(),
      seen: { code: string; constraint?: string }[] = [],
      snapshots: string[] = [];
    let pause!: () => void,
      release!: () => void,
      held = false;
    const reached = new Promise<void>((r) => {
        pause = r;
      }),
      gate = new Promise<void>((r) => {
        release = r;
      });
    h.setProbe(async (stage, c) => {
      if (stage === "connected") {
        const q = c.query.bind(c);
        c.query = (async (...args: unknown[]) => {
          try {
            return await (q as (...x: unknown[]) => Promise<unknown>)(...args);
          } catch (e) {
            const err = e as { code?: string; constraint?: string };
            if (err.code)
              seen.push({ code: err.code, constraint: err.constraint });
            throw e;
          } finally {
            if (args[0] === "COMMIT" || args[0] === "ROLLBACK") c.query = q;
          }
        }) as pg.PoolClient["query"];
      }
      if (stage === "begin")
        snapshots.push(
          (await c.query("SELECT txid_current()::text id")).rows[0].id,
        );
      if (stage === "discovered" && !held) {
        held = true;
        pause();
        await gate;
      }
    });
    const loserKey = randomUUID(),
      loser = h.api(0, loserKey, command(a, o.journalId));
    try {
      await reached;
      const winner = await h.api(0, randomUUID(), command(b, o.journalId));
      expect(winner.status).toBe(201);
      release();
      const response = await loser;
      expect(response.status).toBe(409);
      expect(
        seen.some(
          (e) =>
            e.code === "40001" ||
            (e.code === "23505" &&
              e.constraint ===
                "journal_reversesJournalId_workspaceId_ownerId_key"),
        ),
      ).toBe(true);
      expect(new Set(snapshots).size).toBe(snapshots.length);
      expect(snapshots.length).toBeGreaterThanOrEqual(3);
      const after = await counts();
      expect(after.operations - before.operations).toBe(1);
      expect(after.audits - before.audits).toBe(1);
      expect(
        (
          await h.admin.query(
            'SELECT count(*)::int n FROM ledger_operation WHERE "idempotencyKey"=$1',
            [loserKey],
          )
        ).rows[0].n,
      ).toBe(0);
      evidence.push({
        probe: "I01",
        commands: [a, b],
        states: seen,
        distinctSnapshots: new Set(snapshots).size,
      });
    } finally {
      release();
      await loser;
      h.setProbe(undefined);
    }
  },
  15000,
);
it("I02 genuine 40001 then session deletion before rollback cannot authorize retry", async () => {
  const o = await posted(),
    before = await counts(),
    u = h.users[0]!,
    session = await h.database.authSession.findUniqueOrThrow({
      where: { id: u.session },
    });
  let errorSeen = false,
    renamed = false;
  h.setProbe(async (stage, c) => {
    if (stage === "connected") {
      const q = c.query.bind(c);
      c.query = (async (...args: unknown[]) => {
        try {
          return await (q as (...x: unknown[]) => Promise<unknown>)(...args);
        } catch (e) {
          if ((e as { code?: string }).code === "40001") {
            errorSeen = true;
            await h.database.authSession.deleteMany({
              where: { id: u.session },
            });
          }
          throw e;
        } finally {
          if (args[0] === "ROLLBACK" || args[0] === "COMMIT") c.query = q;
        }
      }) as pg.PoolClient["query"];
    }
    if (stage === "discovered" && !renamed) {
      renamed = true;
      await h.admin.query(
        "UPDATE ledger_account SET name='Independent change' WHERE id=$1",
        [u.bank],
      );
    }
  });
  try {
    expect(
      (await h.api(0, randomUUID(), command("CORRECT", o.journalId))).status,
    ).toBe(401);
    expect(errorSeen).toBe(true);
    expect(await counts()).toEqual(before);
  } finally {
    h.setProbe(undefined);
    await h.database.authSession.upsert({
      where: { id: u.session },
      create: session,
      update: session,
    });
  }
});
it("I03 real 40P01 through an original-journal/advisory inversion retries the whole correction", async () => {
  const o = await posted(),
    before = await counts(),
    states: string[] = [];
  let cleanup: Promise<void> | undefined,
    once = false;
  h.setProbe(async (stage, c) => {
    if (stage !== "targetLocked" || once) return;
    once = true;
    const q = c.query.bind(c);
    c.query = (async (...args: unknown[]) => {
      try {
        return await (q as (...x: unknown[]) => Promise<unknown>)(...args);
      } catch (e) {
        if ((e as { code?: string }).code)
          states.push((e as { code: string }).code);
        throw e;
      } finally {
        if (args[0] === "ROLLBACK" || args[0] === "COMMIT") c.query = q;
      }
    }) as pg.PoolClient["query"];
    const other = await h.admin.connect();
    await other.query(
      "BEGIN; SET LOCAL deadlock_timeout='10s'; SELECT pg_advisory_xact_lock(76233599)",
    );
    cleanup = other
      .query("SELECT id FROM journal WHERE id=$1 FOR UPDATE", [o.journalId])
      .then(async () => {
        await other.query("ROLLBACK");
      })
      .finally(() => other.release());
    await c.query("SELECT pg_advisory_xact_lock(76233599)");
  });
  try {
    expect(
      (await h.api(0, randomUUID(), command("CORRECT", o.journalId))).status,
    ).toBe(201);
    expect(states).toContain("40P01");
    expect((await counts()).audits - before.audits).toBe(1);
    evidence.push({ probe: "I03", states });
  } finally {
    h.setProbe(undefined);
    await cleanup;
  }
}, 15000);
it.each([
  ["REVERSE", "reversal-date"],
  ["REVERSE", "reversal-description"],
  ["CORRECT", "reversal-date"],
  ["CORRECT", "replacement-date"],
  ["CORRECT", "replacement-description"],
  ["CORRECT", "replacement-amount"],
  ["CORRECT", "replacement-multiset"],
] as const)(
  "I05 legacy %s receipt with %s mismatch fails closed",
  async (kind, fault) => {
    const o = await posted(),
      key = randomUUID(),
      body = command(kind, o.journalId),
      u = h.users[0]!,
      op = randomUUID(),
      journal = randomUUID();
    const hash = requestHash(u.id, u.workspace, parseCommand(body));
    const c = await h.admin.connect();
    try {
      await c.query("BEGIN");
      await c.query(
        'INSERT INTO ledger_operation(id,"workspaceId","ownerId","idempotencyKey","requestHash",kind) VALUES($1,$2,$3,$4,$5,$6)',
        [op, u.workspace, u.id, key, hash, kind],
      );
      await c.query(
        'INSERT INTO journal(id,"workspaceId","ownerId",kind,"reversesJournalId","effectiveAt",description) VALUES($1,$2,$3,\'REVERSAL\',$4,$5,$6)',
        [
          journal,
          u.workspace,
          u.id,
          o.journalId,
          fault === "reversal-date" ? "2026-04-01T00:00:00Z" : body.effectiveAt,
          fault === "reversal-description" ? "Different legacy semantics" : "",
        ],
      );
      await c.query(
        'INSERT INTO posting(id,"journalId","workspaceId","ownerId","accountId","currencyCode",side,"nativeMinor","functionalMinor") SELECT gen_random_uuid(),$1,"workspaceId","ownerId","accountId","currencyCode",CASE side WHEN \'DEBIT\' THEN \'CREDIT\'::"PostingSide" ELSE \'DEBIT\'::"PostingSide" END,"nativeMinor","functionalMinor" FROM posting WHERE "journalId"=$2',
        [journal, o.journalId],
      );
      await c.query(
        'UPDATE journal SET status=\'POSTED\',"postedAt"=clock_timestamp(),"operationId"=$1 WHERE id=$2',
        [op, journal],
      );
      if (kind === "CORRECT") {
        const replacement = randomUUID();
        await c.query(
          'INSERT INTO journal(id,"workspaceId","ownerId","effectiveAt",description) VALUES($1,$2,$3,$4,$5)',
          [
            replacement,
            u.workspace,
            u.id,
            fault === "replacement-date"
              ? "2026-05-01T00:00:00Z"
              : "2026-03-01T00:00:00Z",
            fault === "replacement-description" ? "Other purchase" : "",
          ],
        );
        const legs =
          fault === "replacement-multiset"
            ? [
                [u.expense, "DEBIT", "500"],
                [u.expense, "DEBIT", "500"],
                [u.bank, "CREDIT", "1000"],
              ]
            : [
                [
                  u.expense,
                  "DEBIT",
                  fault === "replacement-amount" ? "2000" : "1000",
                ],
                [
                  u.bank,
                  "CREDIT",
                  fault === "replacement-amount" ? "2000" : "1000",
                ],
              ];
        for (const [account, side, amount] of legs)
          await c.query(
            'INSERT INTO posting(id,"journalId","workspaceId","ownerId","accountId","currencyCode",side,"nativeMinor","functionalMinor") VALUES($1,$2,$3,$4,$5,\'INR\',$6,$7,$7)',
            [
              randomUUID(),
              replacement,
              u.workspace,
              u.id,
              account,
              side,
              amount,
            ],
          );
        await c.query(
          'UPDATE journal SET status=\'POSTED\',"postedAt"=clock_timestamp(),"operationId"=$1 WHERE id=$2',
          [op, replacement],
        );
      }
      await c.query(
        'INSERT INTO audit_event(id,"workspaceId","ownerId","actorId","requestId",action,"operationId","targetJournalId",reason) VALUES($1,$2,$3,$3,$4,$5,$6,$7,$8)',
        [
          randomUUID(),
          u.workspace,
          u.id,
          randomUUID(),
          kind === "REVERSE" ? "ledger.reversed" : "ledger.corrected",
          op,
          o.journalId,
          body.reason,
        ],
      );
      await c.query("COMMIT");
    } catch (e) {
      await c.query("ROLLBACK");
      throw e;
    } finally {
      c.release();
    }
    const before = await counts(),
      r = await h.api(0, key, body),
      data = await r.json();
    evidence.push({
      probe: "I05",
      kind,
      fault,
      legacySqlCommittedUnderAllConstraints: true,
      status: r.status,
      error: data.error,
    });
    expect(await counts()).toEqual(before);
    expect(r.status).toBe(503);
    expect(data).toEqual({ error: "service_unavailable" });
  },
);
it("I05b shared POST replay rejects the same legacy receipt/date inconsistency", async () => {
  const o = await posted(),
    key = randomUUID(),
    body = h.payload(),
    u = h.users[0]!,
    op = randomUUID(),
    journal = randomUUID(),
    c = await h.admin.connect();
  try {
    await c.query("BEGIN");
    await c.query(
      'INSERT INTO ledger_operation(id,"workspaceId","ownerId","idempotencyKey","requestHash",kind) VALUES($1,$2,$3,$4,$5,\'POST\')',
      [
        op,
        u.workspace,
        u.id,
        key,
        requestHash(u.id, u.workspace, parseCommand(body)),
      ],
    );
    await c.query(
      'INSERT INTO journal(id,"workspaceId","ownerId","effectiveAt",description) VALUES($1,$2,$3,\'2026-04-01T00:00:00Z\',\'Different legacy semantics\')',
      [journal, u.workspace, u.id],
    );
    await c.query(
      'INSERT INTO posting(id,"journalId","workspaceId","ownerId","accountId","currencyCode",side,"nativeMinor","functionalMinor") SELECT gen_random_uuid(),$1,"workspaceId","ownerId","accountId","currencyCode",side,"nativeMinor","functionalMinor" FROM posting WHERE "journalId"=$2',
      [journal, o.journalId],
    );
    await c.query(
      'UPDATE journal SET status=\'POSTED\',"postedAt"=clock_timestamp(),"operationId"=$1 WHERE id=$2',
      [op, journal],
    );
    await c.query(
      'INSERT INTO audit_event(id,"workspaceId","ownerId","actorId","requestId",action,"operationId","targetJournalId",reason) VALUES($1,$2,$3,$3,$4,\'ledger.posted\',$5,$6,$7)',
      [randomUUID(), u.workspace, u.id, randomUUID(), op, journal, body.reason],
    );
    await c.query("COMMIT");
  } catch (e) {
    await c.query("ROLLBACK");
    throw e;
  } finally {
    c.release();
  }
  const before = await counts(),
    r = await h.api(0, key, body);
  evidence.push({ probe: "I05b", kind: "POST", status: r.status });
  expect(await counts()).toEqual(before);
  expect(r.status).toBe(503);
});
// This proxy parses PostgreSQL frontend frames. Only the generated runtime role's
// armed COMMIT response is withheld. The server executes it normally; after an
// independent connection observes the receipt we destroy only these own sockets.
async function commitProxy(
  target: URL,
  role: string,
  durable: () => Promise<void>,
) {
  const sockets = new Set<Socket>();
  let armed = false,
    dropped = false;
  const server = createServer((client) => {
    const backend = connect(Number(target.port || 5432), target.hostname);
    sockets.add(client);
    sockets.add(backend);
    let pending = Buffer.alloc(0),
      startup = true,
      isRuntime = false,
      drop = false;
    const close = () => {
      client.destroy();
      backend.destroy();
      sockets.delete(client);
      sockets.delete(backend);
    };
    client.on("error", close);
    backend.on("error", close);
    client.on("close", () => {
      backend.destroy();
      sockets.delete(client);
    });
    backend.on("close", () => {
      client.destroy();
      sockets.delete(backend);
    });
    backend.on("data", (data) => {
      if (!drop) client.write(data);
    });
    client.on("data", (data) => {
      pending = Buffer.concat([pending, data]);
      while (pending.length >= (startup ? 4 : 5)) {
        const len = startup
          ? pending.readInt32BE(0)
          : pending.readInt32BE(1) + 1;
        if (len < 4 || pending.length < len) break;
        const frame = pending.subarray(0, len);
        pending = pending.subarray(len);
        if (startup) {
          const fields = frame.subarray(8).toString("utf8").split("\0");
          isRuntime = fields[fields.indexOf("user") + 1] === role;
          startup = false;
        } else if (
          armed &&
          isRuntime &&
          frame[0] === 81 &&
          frame.subarray(5).toString("utf8") === "COMMIT\0"
        ) {
          armed = false;
          drop = true;
          dropped = true;
          backend.write(frame);
          void durable().then(close, close);
          continue;
        }
        backend.write(frame);
      }
    });
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  return {
    port: (server.address() as AddressInfo).port,
    arm: () => {
      armed = true;
    },
    dropped: () => dropped,
    close: async () => {
      for (const s of sockets) s.destroy();
      await new Promise<void>((r) => server.close(() => r()));
    },
  };
}
it("I04 actual TCP COMMIT acknowledgement loss recovers one durable outcome without a mocked query error", async () => {
  const o = await posted(),
    key = randomUUID(),
    body = command("CORRECT", o.journalId),
    before = await counts();
  const target = new URL(h.admin.options.connectionString!),
    password = randomBytes(24).toString("hex");
  await h.admin.query(`ALTER ROLE "${h.role}" PASSWORD '${password}'`);
  let observedDurable = false;
  const proxy = await commitProxy(target, h.role, async () => {
    for (let i = 0; i < 100; i++) {
      if (
        (
          await h.admin.query(
            'SELECT id FROM ledger_operation WHERE "idempotencyKey"=$1',
            [key],
          )
        ).rowCount
      ) {
        observedDurable = true;
        return;
      }
      await new Promise((r) => setTimeout(r, 10));
    }
    throw Error("No durable receipt observed");
  });
  const verifier = new URL(target);
  verifier.hostname = "127.0.0.1";
  verifier.port = String(proxy.port);
  const runtime = new URL(verifier);
  runtime.username = h.role;
  runtime.password = password;
  let executor: PostExecutor | undefined;
  const invoke = () =>
    postRequest(
      new Request(
        h.runtime.config.baseURL +
          `/api/workspaces/${h.users[0]!.workspace}/ledger/commands`,
        {
          method: "POST",
          headers: {
            origin: h.runtime.config.baseURL,
            "content-type": "application/json",
            "idempotency-key": key,
            cookie: h.cookie(0),
          },
          body: JSON.stringify(body),
        },
      ),
      h.users[0]!.workspace,
      h.runtime,
      executor!,
      () => {},
    );
  try {
    executor = await PostExecutor.disposable({
      runtimeURL: runtime.toString(),
      verifierURL: verifier.toString(),
      expected: h.expected,
    });
    proxy.arm();
    expect((await invoke()).status).toBe(503);
    expect(proxy.dropped()).toBe(true);
    expect(observedDurable).toBe(true);
    const replay = await invoke();
    expect(replay.status).toBe(200);
    const result = await replay.json();
    expect(result.originalJournalId).toBe(o.journalId);
    expect(await (await invoke()).json()).toEqual(result);
    const after = await counts();
    expect(after.operations - before.operations).toBe(1);
    expect(after.audits - before.audits).toBe(1);
    expect(after.journals - before.journals).toBe(2);
    evidence.push({
      probe: "I04",
      tcpCommitAckDropped: proxy.dropped(),
      independentlyObservedDurableReceipt: observedDurable,
      oneCommittedOperation: true,
    });
  } finally {
    await executor?.close();
    await proxy.close();
  }
}, 15000);
