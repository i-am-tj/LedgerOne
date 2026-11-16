// Bounded #34 diagnosis, not a new financial runner or timeout policy.
import { randomUUID } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";
import type { Socket } from "node:net";
import pg from "pg";
import { expect, it } from "vitest";
import { postHarness } from "../support/post-harness";
import { queryText } from "../support/query-text";

it.each(["cancel-after", "transport", "deferred-close"] as const)(
  "S09 #34 %s discard is not reuse; observe client/server close independently",
  async (mode) => {
    const h = await postHarness({ schema: "ledgerone" });
    const key = randomUUID(),
      body = h.payload(),
      controller = new AbortController();
    let pid = 0,
      releases = 0,
      discard = false,
      clientEnded = false;
    let finishClose = () => {};
    try {
      h.setProbe(async (stage, c) => {
        if (stage === "connected")
          pid = (await c.query("SELECT pg_backend_pid() pid")).rows[0].pid;
        if (stage !== "beforeCommit") return;
        const query = c.query.bind(c),
          release = c.release.bind(c);
        c.once("end", () => {
          clientEnded = true;
        });
        if (mode === "deferred-close") {
          // Explicit diagnostic gate on driver close, not on database COMMIT.
          // Pool removal still happens synchronously through the real pg path.
          const end = c.end.bind(c);
          c.end = ((callback?: () => void) => {
            finishClose = () => {
              finishClose = () => {};
              if (callback) end(callback);
              else void end();
            };
          }) as typeof c.end;
        }
        c.release = (destroy) => {
          releases++;
          discard = !!destroy;
          release(destroy);
        };
        c.query = (async (...args: unknown[]) => {
          const invoke = query as (...args: unknown[]) => Promise<unknown>;
          if (queryText(args[0]) !== "COMMIT") return invoke(...args);
          const socket = (c as unknown as { connection: { stream: Socket } })
            .connection.stream;
          if (mode === "cancel-after") socket.pause();
          const answer = invoke(...args);
          if (mode === "transport" || mode === "deferred-close") {
            await answer;
            throw Object.assign(Error("S09 lost committed acknowledgement"), {
              code: "EPIPE",
            });
          }
          const deadline = performance.now() + 1000;
          while (
            !(
              await h.admin.query(
                'SELECT id FROM ledger_operation WHERE "idempotencyKey"=$1',
                [key],
              )
            ).rowCount
          ) {
            if (performance.now() > deadline)
              throw Error("No durable commit observed");
            await delay(5);
          }
          controller.abort();
          socket.resume();
          return answer;
        }) as pg.PoolClient["query"];
      });
      const result = await h.api(
        0,
        key,
        body,
        {},
        h.users[0]!.workspace,
        true,
        controller.signal,
      );
      expect(result.status).toBe(503);
      expect(releases).toBe(1);
      expect(discard).toBe(true);
      h.setProbe(undefined);
      const start = performance.now();
      const present = async () =>
        Number(
          (
            await h.admin.query(
              "SELECT count(*)::int n FROM pg_stat_activity WHERE pid=$1 AND datname=current_database()",
              [pid],
            )
          ).rows[0].n,
        );
      const immediate = await present();
      if (mode === "deferred-close") expect(immediate).toBe(1);
      finishClose();
      // Reuse the fixture cleanup's existing five-second observation bound. This
      // does not extend the command's ten-second budget or postpone its response.
      while (!clientEnded || (await present())) {
        if (performance.now() - start > 5000)
          throw Error(
            "Discarded backend failed to close within existing fixture cleanup bound",
          );
        await delay(5);
      }
      let next = 0;
      h.setProbe(async (stage, c) => {
        if (stage === "connected")
          next = (await c.query("SELECT pg_backend_pid() pid")).rows[0].pid;
      });
      const recovered = await h.api(0, key, body);
      expect(recovered.status).toBe(200);
      expect(next).not.toBe(pid);
      h.setProbe(undefined);
      const counts = (
        await h.admin.query(
          `SELECT count(DISTINCT o.id)::int receipts,count(DISTINCT j.id)::int journals,count(DISTINCT p.id)::int postings,count(DISTINCT a.id)::int audits FROM ledger_operation o JOIN journal j ON j."operationId"=o.id JOIN posting p ON p."journalId"=j.id JOIN audit_event a ON a."operationId"=o.id WHERE o."idempotencyKey"=$1`,
          [key],
        )
      ).rows[0];
      expect(counts).toEqual({
        receipts: 1,
        journals: 1,
        postings: 2,
        audits: 1,
      });
      expect(releases).toBe(1);
      console.info(
        JSON.stringify({
          observation: "S09-34",
          mode,
          immediateBackendCount: immediate,
          clientEnded,
          backendGone: true,
          observationMs: Math.round(performance.now() - start),
          reused: false,
          counts,
        }),
      );
    } finally {
      finishClose();
      h.setProbe(undefined);
      await h.cleanup();
    }
  },
  15000,
);
