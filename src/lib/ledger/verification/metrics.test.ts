import { expect, it } from "vitest";
import { emitMetric, measured, type CommandMetric } from "./metrics";
it("D-T03 observer failure cannot change success or replace a financial error", async () => {
  const broken = () => {
    throw new Error("diagnostic failure");
  };
  expect(await measured(broken, "sql.commit", async () => "durable")).toBe(
    "durable",
  );
  const abort = new Error("serialization abort");
  await expect(
    measured(broken, "sql.commit", async () => {
      throw abort;
    }),
  ).rejects.toBe(abort);
});
it("D-T03 asynchronous observer rejection is contained and never awaited", async () => {
  const broken = async () => {
    throw new Error("async diagnostic failure");
  };
  expect(await measured(broken, "sql.audit", async () => 42)).toBe(42);
  await new Promise((r) => setTimeout(r, 0));
});
it("D-T03 fixed timing event has no payload, key, amount, target or session fields", async () => {
  const events: CommandMetric[] = [];
  await measured(
    (e) => events.push(e),
    "locks.accounts",
    async () => null,
    2,
  );
  expect(events).toHaveLength(1);
  expect(Object.keys(events[0]!)).toEqual(["stage", "durationMs", "attempt"]);
  expect(events[0]!.durationMs).toBeGreaterThanOrEqual(0);
  expect(events[0]!.attempt).toBe(2);
  emitMetric(undefined, "sql.commit", 0);
});
