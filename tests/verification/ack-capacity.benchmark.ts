import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, expect, it } from "vitest";
import {
  benchmark,
  campaign,
  finish,
  type Campaign,
  type Workload,
} from "./benchmark";

// Accepted invite-only envelope. All setup remains inside the existing caps.
let c: Campaign;
beforeAll(async () => {
  c = await campaign();
}, 30000);
afterAll(async () => {
  if (c) await finish(c, join(tmpdir(), "ledgerone-ack-capacity.json"));
});
const cells: Workload[] = [];
for (const kind of ["POST", "REVERSE", "CORRECT"] as const) {
  for (const union of ["small", "maximum"] as const) {
    for (const concurrency of [1, 2] as const) {
      for (const legs of [2, 50] as const)
        cells.push({ kind, legs, union, concurrency, samples: 30 });
    }
    cells.push({
      kind,
      legs: 500,
      union,
      concurrency: 1,
      samples: 3,
      maxAmount: true,
    });
  }
}
for (const concurrency of [4, 6] as const) {
  for (const kind of ["POST", "REVERSE", "CORRECT"] as const)
    cells.push({ kind, concurrency, legs: 2, union: "small", samples: 12 });
  cells.push({
    kind: "CORRECT",
    legs: 500,
    union: "maximum",
    concurrency,
    samples: concurrency,
    contention: "shared",
    maxAmount: true,
  });
}
cells.push({
  kind: "POST",
  legs: 2,
  union: "small",
  concurrency: 2,
  samples: 1000,
  critical: true,
});
it.each(cells)(
  "$kind $legs $union c$concurrency n$samples",
  async (w) => {
    const r = await benchmark(c, w, true);
    expect(r.safe).toBe(true);
    expect(r.budgetAborted).toBe(false);
    expect(r.unmeasured).toBe(0);
    expect(r.setupFailures).toBe(0);
    expect(r.recoveryComplete).toBe(true);
    if (w.concurrency <= 2) {
      expect(r.positiveResult).toBe("PASS");
      expect(r.capacityResult).toBe("PASS");
      if (w.critical) expect(r.p99Qualification).toBe("PROVEN");
    }
  },
  250000,
);
