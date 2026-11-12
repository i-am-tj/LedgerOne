import "server-only";
export const metricStages = [
  "http.authentication",
  "http.body",
  "http.response",
  "command.total",
  "command.authentication",
  "command.attestation",
  "command.verifier_wait",
  "command.connection_wait",
  "locks.accounts",
  "locks.original",
  "sql.receipt",
  "sql.insertion",
  "sql.audit",
  "sql.commit",
  "sql.rollback",
] as const;
export type MetricStage = (typeof metricStages)[number];
export type CommandMetric = Readonly<{
  stage: MetricStage;
  durationMs: number;
  attempt: number;
}>;
export type MetricObserver = (metric: CommandMetric) => void;
// Instrumentation cannot replace a result/error or prolong a transaction by
// awaiting a logger. Only fixed labels, duration and attempt count are emitted.
export function emitMetric(
  observer: MetricObserver | undefined,
  stage: MetricStage,
  durationMs: number,
  attempt = 0,
) {
  if (!observer) return;
  try {
    const result: unknown = observer({
      stage,
      durationMs: Math.max(0, durationMs),
      attempt,
    });
    if (result && typeof (result as PromiseLike<unknown>).then === "function")
      void Promise.resolve(result).catch(() => {});
  } catch {
    /* Diagnostic failure cannot change financial behavior. */
  }
}
export async function measured<T>(
  observer: MetricObserver | undefined,
  stage: MetricStage,
  work: () => Promise<T>,
  attempt = 0,
): Promise<T> {
  if (!observer) return work();
  const started = performance.now();
  try {
    return await work();
  } finally {
    emitMetric(observer, stage, performance.now() - started, attempt);
  }
}
