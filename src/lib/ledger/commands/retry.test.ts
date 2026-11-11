import { expect, it } from "vitest";
import {
  retryable,
  retryDelay,
  sqlState,
  remaining,
  withinDeadline,
} from "./retry";
it.each(["40001", "40P01"])(
  "B-T04 retries only complete concurrency abort %s",
  (code) => expect(retryable({ code })).toBe(true),
);
it.each(["23514", "23503", "55P03", "57014", "ECONNRESET", "25P04", undefined])(
  "B-T04 does not retry %s",
  (code) => expect(retryable({ code })).toBe(false),
);
it("B-T04 only named receipt uniqueness is replay contention", () => {
  expect(retryable({ code: "23505" })).toBe(false);
  expect(
    retryable({
      code: "23505",
      constraint: "audit_event_operationId_workspaceId_ownerId_key",
    }),
  ).toBe(false);
  expect(
    retryable({
      code: "23505",
      constraint: "ledger_operation_workspaceId_ownerId_idempotencyKey_key",
    }),
  ).toBe(true);
  expect(sqlState(new Error("private"))).toBeUndefined();
});
it("B-T04 bounds attempts, jitter and elapsed budget", () => {
  expect(retryDelay(1, 1000, () => 0.999)).toBe(24);
  expect(retryDelay(2, 1000, () => 0.999)).toBe(49);
  expect(retryDelay(3, 1000)).toBeNull();
  expect(retryDelay(1, 0)).toBeNull();
  expect(retryDelay(2, 1, () => 0.999)).toBeNull();
  expect(() => remaining(performance.now() - 1)).toThrow("service_unavailable");
});
it("B-T04 deadline stops before write progression and disposes a late acquired connection", async () => {
  let disposed = false;
  const work = new Promise<string>((resolve) =>
    setTimeout(() => resolve("client"), 20),
  );
  await expect(
    withinDeadline(work, performance.now() + 5, () => {
      disposed = true;
    }),
  ).rejects.toThrow("service_unavailable");
  await work;
  await Promise.resolve();
  expect(disposed).toBe(true);
  expect(
    await withinDeadline(Promise.resolve(1), performance.now() + 100),
  ).toBe(1);
});
