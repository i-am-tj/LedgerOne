import { unavailable } from "./contract";
export function throwIfAborted(signal?: AbortSignal) {
  if (signal?.aborted) throw unavailable();
}
export function sqlState(error: unknown): string | undefined {
  return typeof error === "object" &&
    error !== null &&
    "code" in error &&
    typeof error.code === "string" &&
    /^[0-9A-Z]{5}$/.test(error.code)
    ? error.code
    : undefined;
}
export function retryable(error: unknown) {
  const code = sqlState(error);
  return (
    code === "40001" ||
    code === "40P01" ||
    (code === "23505" &&
      typeof error === "object" &&
      error !== null &&
      "constraint" in error &&
      error.constraint ===
        "ledger_operation_workspaceId_ownerId_idempotencyKey_key")
  );
}
export function retryDelay(
  attempt: number,
  remaining: number,
  random = Math.random,
) {
  if (attempt >= 3 || remaining <= 0) return null;
  const delay = Math.floor(random() * Math.min(200, 25 * 2 ** (attempt - 1)));
  return delay < remaining ? delay : null;
}
export function remaining(deadline: number) {
  const ms = Math.floor(deadline - performance.now());
  if (ms <= 0) throw unavailable();
  return ms;
}
// Late read-only work may finish, but must never advance into a write attempt.
// A connection acquired after expiry is explicitly destroyed rather than leaked.
export function withinDeadline<T>(
  work: Promise<T>,
  deadline: number,
  onLate?: (value: T) => void,
  signal?: AbortSignal,
): Promise<T> {
  return new Promise((resolve, reject) => {
    let expired = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const clean = () => {
      clearTimeout(timer);
      signal?.removeEventListener("abort", expire);
    };
    const expire = () => {
      if (expired) return;
      expired = true;
      clean();
      reject(unavailable());
    };
    signal?.addEventListener("abort", expire, { once: true });
    if (signal?.aborted) expire();
    else {
      try {
        timer = setTimeout(expire, remaining(deadline));
      } catch {
        expire();
      }
    }
    work.then(
      (value) => {
        clean();
        if (expired) onLate?.(value);
        else resolve(value);
      },
      (error) => {
        clean();
        if (!expired) reject(error);
      },
    );
  });
}
