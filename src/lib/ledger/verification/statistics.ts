import "server-only";
import { z } from "zod";
import { metricStages } from "./metrics";
const duration = z.number().finite().nonnegative();
const observationSchema = z.strictObject({
  durationMs: duration,
  status: z.enum([
    "success",
    "conflict",
    "failed",
    "cancelled",
    "uncertain",
    "recovered",
  ]),
  stages: z.partialRecord(z.enum(metricStages), duration),
});
export type Observation = z.infer<typeof observationSchema>;
function distribution(values: readonly number[], critical: boolean) {
  const ordered = [...values].sort((a, b) => a - b);
  const percentile = (p: number) =>
    ordered.length ? ordered[Math.ceil(p * ordered.length) - 1]! : null;
  return {
    observations: ordered.length,
    p50Ms: percentile(0.5),
    p95Ms: percentile(0.95),
    p99:
      critical && ordered.length >= 1000
        ? { result: "PROVEN" as const, valueMs: percentile(0.99) }
        : { result: "NOT_PROVEN" as const, valueMs: null },
  };
}
export function summarizeObservations(input: unknown, critical = false) {
  const observations = z.array(observationSchema).max(100000).parse(input);
  const counts = {
    success: 0,
    conflict: 0,
    failed: 0,
    cancelled: 0,
    uncertain: 0,
    recovered: 0,
  };
  for (const item of observations) counts[item.status]++;
  const unexpected = counts.failed + counts.uncertain;
  return {
    ...distribution(
      observations.map((r) => r.durationMs),
      critical,
    ),
    counts,
    unexpectedFailureRate: observations.length
      ? unexpected / observations.length
      : null,
    stages: Object.fromEntries(
      metricStages.map((stage) => [
        stage,
        distribution(
          observations.flatMap((r) =>
            r.stages[stage] === undefined ? [] : [r.stages[stage]!],
          ),
          critical,
        ),
      ]),
    ),
  };
}
