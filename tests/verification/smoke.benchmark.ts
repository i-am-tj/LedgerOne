import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeAll, afterAll, it, expect } from "vitest";
import {
  benchmark,
  campaign,
  finish,
  type Campaign,
  type Workload,
} from "./benchmark";
let c: Campaign;
beforeAll(async () => {
  c = await campaign();
}, 30000);
afterAll(async () => {
  if (c) await finish(c, join(tmpdir(), "ledgerone-s06d-benchmark-smoke.json"));
});
for (const kind of ["POST", "REVERSE", "CORRECT"] as const)
  for (const legs of [2, 50, 500] as const)
    for (const union of ["small", "maximum"] as const)
      it(`D-T03 P0/P3 ${kind} ${legs} legs ${union} union`, async () => {
        const result = await benchmark(c, {
          kind,
          legs,
          union,
          concurrency: 1,
          samples: legs === 500 ? 3 : 1,
          maxAmount: legs === 500,
        });
        expect(result.safe).toBe(true);
        expect(result.positiveResult).toBe("PASS");
      }, 60000);
const representative: Workload[] = [];
for (const kind of ["POST", "REVERSE", "CORRECT"] as const)
  for (const legs of [2, 50] as const)
    for (const union of ["small", "maximum"] as const)
      for (const concurrency of [1, 4] as const)
        representative.push({
          kind,
          legs,
          union,
          concurrency,
          samples: concurrency === 1 ? 30 : 32,
        });
it.each(representative)(
  "D-T03 P1 $kind $legs legs concurrency $concurrency",
  async (w) => {
    const result = await benchmark(c, w);
    expect(result.safe).toBe(true);
    expect(result.capacityResult).toBe("PASS");
    expect(result.p99Qualification).toBe("NOT_PROVEN");
  },
  120000,
);
it("D-T03 bounded concurrency-6 challenge reports failures without hiding safety", async () => {
  const result = await benchmark(c, {
    kind: "POST",
    legs: 2,
    union: "small",
    concurrency: 6,
    samples: 12,
  });
  expect(result.safe).toBe(true);
  expect(result.summary.observations).toBe(12);
}, 30000);

it.each([4, 6] as const)(
  "D-T03 maximum-size concurrency-%s bounded stress challenge",
  async (concurrency) => {
    const result = await benchmark(c, {
      kind: "CORRECT",
      legs: 500,
      union: "maximum",
      concurrency,
      samples: concurrency,
      maxAmount: true,
      contention: "shared",
    });
    expect(result.safe).toBe(true);
    expect(result.summary.observations + result.setupFailures).toBe(
      concurrency,
    );
    // Positive-result FAIL remains in the artifact; safe overload is not capacity.
  },
  120000,
);

it.each(["POST", "REVERSE", "CORRECT"] as const)(
  "D-T03 shared-account %s concurrency-4 contention challenge",
  async (kind) => {
    const result = await benchmark(c, {
      kind,
      legs: 50,
      union: "small",
      concurrency: 4,
      samples: 32,
      contention: "shared",
    });
    expect(result.safe).toBe(true);
    expect(result.summary.observations + result.setupFailures).toBe(32);
  },
  120000,
);
