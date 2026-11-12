import { expect, it } from "vitest";
import { summarizeObservations, type Observation } from "./statistics";
const observation = (durationMs: number): Observation => ({
  durationMs,
  status: "success",
  stages: { "command.total": durationMs },
});
it("D-T03 insufficient or non-designated samples explicitly cannot prove p99", () => {
  expect(summarizeObservations([observation(1)], true).p99.result).toBe(
    "NOT_PROVEN",
  );
  expect(
    summarizeObservations(
      Array.from({ length: 999 }, () => observation(1)),
      true,
    ).p99.result,
  ).toBe("NOT_PROVEN");
  expect(
    summarizeObservations(Array.from({ length: 1000 }, () => observation(1)))
      .p99.result,
  ).toBe("NOT_PROVEN");
});
it("D-T03 predeclared critical-tail sample uses nearest rank and includes failures", () => {
  const rows = Array.from({ length: 1000 }, (_, n) => observation(n + 1));
  rows[999]!.status = "failed";
  const result = summarizeObservations(rows, true);
  expect(result).toMatchObject({
    observations: 1000,
    p50Ms: 500,
    p95Ms: 950,
    p99: { result: "PROVEN", valueMs: 990 },
    unexpectedFailureRate: 0.001,
  });
  expect(result.counts.failed).toBe(1);
  expect(result.stages["command.total"]!.observations).toBe(1000);
  expect(result.stages["sql.commit"]!.p99.result).toBe("NOT_PROVEN");
});
it("D-T03 no observations cannot be reported as zero-latency/zero-failure success", () => {
  expect(summarizeObservations([])).toMatchObject({
    p50Ms: null,
    p95Ms: null,
    p99: { result: "NOT_PROVEN" },
    unexpectedFailureRate: null,
  });
});
it.each([-1, NaN, Infinity])(
  "D-T03 rejects invalid duration %s rather than hiding it",
  (duration) => {
    expect(() => summarizeObservations([observation(duration)])).toThrow();
  },
);
it("D-T03 payload-bearing/unknown fields and unknown stages reject", () => {
  expect(() =>
    summarizeObservations([{ ...observation(1), amount: "100" }]),
  ).toThrow();
  expect(() =>
    summarizeObservations([
      { ...observation(1), stages: { "customer-name": 1 } },
    ]),
  ).toThrow();
});
