import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeAll, afterAll, it, expect } from "vitest";
import { benchmark, campaign, finish, type Campaign } from "./benchmark";
let c: Campaign;
beforeAll(async () => {
  c = await campaign();
}, 30000);
afterAll(async () => {
  if (c)
    await finish(c, join(tmpdir(), "ledgerone-s06d-benchmark-critical.json"));
});
it("D-T03 P2 designated critical 2-leg POST / concurrency 4", async () => {
  const result = await benchmark(c, {
    kind: "POST",
    legs: 2,
    union: "small",
    concurrency: 4,
    samples: 1000,
    critical: true,
  });
  expect(result.safe).toBe(true);
  expect(result.capacityResult).toBe("PASS");
  expect(result.p99Qualification).toBe("PROVEN");
}, 240000);
it("D-T03 P2 designated critical 50-leg CORRECT / maximum union / concurrency 1", async () => {
  const result = await benchmark(c, {
    kind: "CORRECT",
    legs: 50,
    union: "maximum",
    concurrency: 1,
    samples: 1000,
    critical: true,
  });
  expect(result.safe).toBe(true);
  expect(result.capacityResult).toBe("PASS");
  expect(result.p99Qualification).toBe("PROVEN");
}, 300000);
