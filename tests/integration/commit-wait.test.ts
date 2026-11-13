import { randomUUID } from "node:crypto";
import { getEventListeners } from "node:events";
import type { Socket } from "node:net";
import { setTimeout as delay } from "node:timers/promises";
import type pg from "pg";
import { afterAll, beforeAll, expect, it } from "vitest";
import { postHarness } from "../support/post-harness";
import { queryText } from "../support/query-text";

let h: Awaited<ReturnType<typeof postHarness>>;
beforeAll(async () => {
  h = await postHarness({ schema: "ledgerone" });
}, 30000);
afterAll(async () => {
  await h?.cleanup();
});

async function outcome(key: string) {
  return (
    await h.admin.query(
      `SELECT count(DISTINCT o.id)::int receipts,count(DISTINCT j.id)::int journals,count(DISTINCT p.id)::int postings,count(DISTINCT a.id)::int audits
 FROM ledger_operation o LEFT JOIN journal j ON j."operationId"=o.id LEFT JOIN posting p ON p."journalId"=j.id LEFT JOIN audit_event a ON a."operationId"=o.id
 WHERE o."idempotencyKey"=$1 AND o."ownerId"=$2`,
      [key, h.users[0]!.id],
    )
  ).rows[0];
}

it.each([
  "delayed",
  "expired",
  "cancel-after",
  "transport",
  "cancel-before",
  "expired-before",
] as const)(
  "007 COMMIT acknowledgement %s: deadline, single outcome, connection lifecycle",
  async (mode) => {
    const key = randomUUID(),
      body = h.payload(),
      controller = new AbortController();
    const baseListeners = getEventListeners(controller.signal, "abort").length;
    const attempts: number[] = [];
    const pids: number[] = [];
    let resumes: ReturnType<typeof setTimeout> | undefined;
    let waitMs = 0,
      sent = 0,
      ackMs = 0,
      releaseCount = 0,
      destroyed = false,
      rollbacks = 0;
    h.setProbe(async (stage, c, n) => {
      if (stage === "connected") {
        attempts.push(n);
        pids.push(
          (await c.query("SELECT pg_backend_pid() AS pid")).rows[0].pid,
        );
      }
      if (stage !== "beforeCommit") return;
      const query = c.query.bind(c),
        release = c.release.bind(c);
      c.release = (discard) => {
        releaseCount++;
        destroyed = !!discard;
        c.release = release;
        release(discard);
      };
      if (mode === "expired") await delay(7450);
      if (mode === "expired-before") await delay(10050);
      if (mode === "cancel-before") controller.abort();
      c.query = (async (...args: unknown[]) => {
        const invoke = query as (...v: unknown[]) => Promise<unknown>;
        if (queryText(args[0]) !== "COMMIT") {
          if (queryText(args[0]) === "ROLLBACK") {
            rollbacks++;
            c.query = query;
          }
          return invoke(...args);
        }
        c.query = query;
        sent++;
        waitMs = (args[0] as { query_timeout: number }).query_timeout;
        const start = performance.now();
        // Delay reading the actual PostgreSQL protocol reply, not execution of a
        // synthetic SQL statement. The database can commit while reading is paused.
        const socket = (c as unknown as { connection: { stream: Socket } })
          .connection.stream;
        if (mode !== "transport") socket.pause();
        const response = invoke(...args);
        if (mode === "delayed" || mode === "expired") {
          resumes = setTimeout(
            () => socket.resume(),
            mode === "delayed" ? 3250 : waitMs + 200,
          );
        } else if (mode === "cancel-after") {
          // Observe durability before aborting the already-dispatched, unacknowledged query.
          for (let i = 0; i < 100 && !(await outcome(key)).receipts; i++)
            await delay(5);
          controller.abort();
          socket.resume();
        }
        try {
          const result = await response;
          if (mode === "transport")
            throw Object.assign(Error("lost acknowledgement"), {
              code: "EPIPE",
            });
          return result;
        } finally {
          ackMs = performance.now() - start;
        }
      }) as pg.PoolClient["query"];
    });
    try {
      const start = performance.now();
      const res = await h.api(
        0,
        key,
        body,
        {},
        h.users[0]!.workspace,
        true,
        controller.signal,
      );
      const elapsed = performance.now() - start;
      h.setProbe(undefined);
      expect(attempts).toEqual([1]);
      expect(releaseCount).toBe(1);
      if (mode === "cancel-before" || mode === "expired-before") {
        expect(sent).toBe(0);
        expect(res.status).toBe(503);
        // PostgreSQL transaction_timeout can close the backend before local
        // expiry is observed. A destroyed backend needs no ROLLBACK round trip.
        expect(
          rollbacks === 1 || (mode === "expired-before" && destroyed),
        ).toBe(true);
        expect(await outcome(key)).toEqual({
          receipts: 0,
          journals: 0,
          postings: 0,
          audits: 0,
        });
        expect((await h.api(0, key, body)).status).toBe(201);
      } else {
        expect(sent).toBe(1);
        expect(waitMs).toBeGreaterThan(0);
        expect(waitMs).toBeLessThan(10000);
        if (mode === "delayed") {
          expect(res.status).toBe(201);
          expect(ackMs).toBeGreaterThan(3000);
          expect(destroyed).toBe(false);
        } else {
          expect(res.status).toBe(503);
          expect(destroyed).toBe(true);
          expect(rollbacks).toBe(0);
          if (mode === "expired") {
            expect(waitMs).toBeLessThan(3000);
            expect(elapsed).toBeLessThan(10500);
            await delay(250);
          }
          expect(
            (
              await h.admin.query(
                "SELECT count(*)::int n FROM pg_stat_activity WHERE pid=$1 AND datname=current_database()",
                [pids[0]],
              )
            ).rows[0].n,
          ).toBe(0);
        }
        expect(await outcome(key)).toEqual({
          receipts: 1,
          journals: 1,
          postings: 2,
          audits: 1,
        });
      }
      let replayBudget = 0;
      h.setProbe(async (stage, c) => {
        if (stage !== "connected") return;
        const query = c.query.bind(c);
        c.query = (async (...args: unknown[]) => {
          if (queryText(args[0]) === "COMMIT") {
            replayBudget = (args[0] as { query_timeout: number }).query_timeout;
            c.query = query;
          }
          return (query as (...v: unknown[]) => Promise<unknown>)(...args);
        }) as pg.PoolClient["query"];
      });
      const replay = await h.api(0, key, body);
      h.setProbe(undefined);
      expect(replay.status).toBe(200);
      expect(replayBudget).toBeGreaterThan(0);
      expect(replayBudget).toBeLessThanOrEqual(3000);
      expect(
        (await h.api(0, key, { ...body, reason: "Different command" })).status,
      ).toBe(409);
      expect(await outcome(key)).toEqual({
        receipts: 1,
        journals: 1,
        postings: 2,
        audits: 1,
      });
      expect(
        getEventListeners(controller.signal, "abort").length,
      ).toBeLessThanOrEqual(baseListeners + 1); // Request creates a dependent signal.
    } finally {
      if (resumes) clearTimeout(resumes);
      h.setProbe(undefined);
    }
  },
  25000,
);

it("a genuine aborted attempt spends the same deadline as final COMMIT", async () => {
  const key = randomUUID(),
    attempts: number[] = [];
  let budget = 0,
    serializations = 0;
  h.setProbe(async (stage, c, n) => {
    if (stage === "connected") attempts.push(n);
    if (stage === "receipt" && n === 1) {
      await delay(1200);
      await h.admin.query("UPDATE ledger_account SET name=name WHERE id=$1", [
        h.users[0]!.bank,
      ]);
    }
    if (stage === "serialization") serializations++;
    if (stage === "beforeCommit") {
      const query = c.query.bind(c);
      c.query = (async (args: unknown) => {
        c.query = query;
        budget = (args as { query_timeout: number }).query_timeout;
        return (query as (q: unknown) => Promise<unknown>)(args);
      }) as pg.PoolClient["query"];
    }
  });
  try {
    expect((await h.api(0, key, h.payload())).status).toBe(201);
    expect(attempts).toEqual([1, 2]);
    expect(serializations).toBe(1);
    expect(budget).toBeGreaterThan(0);
    expect(budget).toBeLessThan(8800);
    expect(await outcome(key)).toEqual({
      receipts: 1,
      journals: 1,
      postings: 2,
      audits: 1,
    });
  } finally {
    h.setProbe(undefined);
  }
}, 15000);
