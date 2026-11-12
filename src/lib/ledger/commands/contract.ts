import { createHash } from "node:crypto";
import { z } from "zod";
import { parseAmount, positiveMinor } from "../money";

export class CommandError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
  ) {
    super(code);
  }
}
export const invalid = () => new CommandError(400, "invalid_request");
export const unavailable = () => new CommandError(503, "service_unavailable");
export const uuid = z.uuid().transform((s) => s.toLowerCase());
const text = z
  .string()
  .transform((s) => s.trim().normalize("NFC"))
  .refine(
    (s) =>
      [...s].length <= 500 && !s.includes("\0") && !/[\uD800-\uDFFF]/u.test(s),
  );
// The explicit calendar check avoids Date.parse's invalid-date normalization.
export function instant(value: string): string {
  const m =
    /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,3}))?(Z|[+-]\d{2}:\d{2})$/.exec(
      value,
    );
  if (!m) throw invalid();
  const [year, month, day, hour, minute, second] = m
    .slice(1, 7)
    .map(Number) as [number, number, number, number, number, number];
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  const zone = m[8]!;
  if (
    year < 1 ||
    month < 1 ||
    month > 12 ||
    day < 1 ||
    day > days[month - 1]! ||
    hour > 23 ||
    minute > 59 ||
    second > 59 ||
    (zone !== "Z" && (+zone.slice(1, 3) > 23 || +zone.slice(4) > 59))
  )
    throw invalid();
  const date = new Date(value);
  if (
    !Number.isFinite(date.getTime()) ||
    date.getUTCFullYear() < 1 ||
    date.getUTCFullYear() > 9999
  )
    throw invalid();
  return date.toISOString();
}
const payload = z
  .object({
    kind: z.literal("POST"),
    effectiveAt: z.string().max(29),
    description: text.optional().default(""),
    reason: text.refine((s) => s.length > 0),
    legs: z
      .array(
        z
          .object({
            accountId: uuid,
            side: z.enum(["DEBIT", "CREDIT"]),
            currency: z.literal("INR"),
            amount: z.string().max(24),
          })
          .strict(),
      )
      .min(2)
      .max(500),
  })
  .strict();
export type Leg = Readonly<{
  accountId: string;
  side: "DEBIT" | "CREDIT";
  currency: "INR";
  minor: string;
}>;
export type PostCommand = Readonly<{
  kind: "POST";
  effectiveAt: string;
  description: string;
  reason: string;
  legs: readonly Leg[];
}>;
export type ReverseCommand = Readonly<{
  kind: "REVERSE";
  originalJournalId: string;
  effectiveAt: string;
  description: string;
  reason: string;
}>;
export type CorrectCommand = Readonly<{
  kind: "CORRECT";
  originalJournalId: string;
  effectiveAt: string;
  description: string;
  reason: string;
  replacement: Readonly<Omit<PostCommand, "kind" | "reason">>;
}>;
export type FinancialCommand = PostCommand | ReverseCommand | CorrectCommand;
const reversePayload = payload.omit({ legs: true }).extend({
  kind: z.literal("REVERSE"),
  originalJournalId: uuid,
});
const correctPayload = reversePayload.extend({
  kind: z.literal("CORRECT"),
  replacement: payload.omit({ kind: true, reason: true }),
});
export function parseCommand(value: unknown): FinancialCommand {
  if (
    typeof value === "object" &&
    value !== null &&
    "kind" in value &&
    value.kind === "POST"
  )
    return parsePost(value);
  try {
    const p =
      typeof value === "object" &&
      value !== null &&
      "kind" in value &&
      value.kind === "REVERSE"
        ? reversePayload.parse(value)
        : correctPayload.parse(value);
    const base = {
      originalJournalId: p.originalJournalId,
      effectiveAt: instant(p.effectiveAt),
      description: p.description,
      reason: p.reason,
    };
    if (p.kind === "REVERSE")
      return Object.freeze({ kind: "REVERSE", ...base });
    const replacement = parsePost({
      kind: "POST",
      reason: p.reason,
      ...p.replacement,
    });
    return Object.freeze({
      kind: "CORRECT",
      ...base,
      replacement: Object.freeze({
        effectiveAt: replacement.effectiveAt,
        description: replacement.description,
        legs: replacement.legs,
      }),
    });
  } catch {
    throw invalid();
  }
}
// Derive a full inverse from immutable database evidence, never from caller legs.
export function inversePostings(
  rows: readonly Readonly<{
    accountId: string;
    side: string;
    currency: string;
    nativeMinor: string;
    functionalMinor: string;
    fxRateId: string | null;
  }>[],
): readonly Leg[] {
  if (rows.length < 2 || rows.length > 500) throw unavailable();
  let balance = 0n;
  const legs = rows.map((p): Leg => {
    if (
      !uuid.safeParse(p.accountId).success ||
      p.currency !== "INR" ||
      !["DEBIT", "CREDIT"].includes(p.side) ||
      p.fxRateId !== null ||
      !/^[1-9][0-9]{0,17}$/.test(p.nativeMinor) ||
      p.functionalMinor !== p.nativeMinor
    )
      throw unavailable();
    const minor = positiveMinor(BigInt(p.nativeMinor));
    balance += (p.side === "DEBIT" ? 1n : -1n) * minor;
    return Object.freeze({
      accountId: p.accountId,
      side: p.side === "DEBIT" ? "CREDIT" : "DEBIT",
      currency: "INR",
      minor: minor.toString(),
    });
  });
  if (balance !== 0n) throw unavailable();
  return Object.freeze(legs.sort(compareLegs));
}
export function compareLegs(a: Leg, b: Leg) {
  const x = [a.accountId, a.side, a.currency, a.minor],
    y = [b.accountId, b.side, b.currency, b.minor];
  for (let i = 0; i < x.length; i++) {
    if (x[i]! < y[i]!) return -1;
    if (x[i]! > y[i]!) return 1;
  }
  return 0;
}
export function parsePost(value: unknown): PostCommand {
  try {
    const p = payload.parse(value);
    const legs = p.legs
      .map((l): Leg =>
        Object.freeze({
          accountId: l.accountId,
          side: l.side,
          currency: l.currency,
          minor: positiveMinor(parseAmount(l.amount, l.currency)).toString(),
        }),
      )
      .sort(compareLegs);
    if (
      legs.reduce(
        (sum, l) => sum + (l.side === "DEBIT" ? 1n : -1n) * BigInt(l.minor),
        0n,
      ) !== 0n
    )
      throw invalid();
    return Object.freeze({
      kind: "POST",
      effectiveAt: instant(p.effectiveAt),
      description: p.description,
      reason: p.reason,
      legs: Object.freeze(legs),
    });
  } catch {
    throw invalid();
  }
}
export function requestHash(
  ownerId: string,
  workspaceId: string,
  p: FinancialCommand,
) {
  if (p.kind !== "POST") {
    const tuple: unknown[] = [
      "ledgerone.command.v1",
      p.kind,
      ownerId,
      workspaceId,
      p.originalJournalId,
      p.effectiveAt,
      p.description,
      p.reason,
    ];
    if (p.kind === "CORRECT")
      tuple.push(
        p.replacement.effectiveAt,
        p.replacement.description,
        p.replacement.legs.map((l) => [
          l.accountId,
          l.side,
          l.currency,
          l.minor,
        ]),
      );
    return createHash("sha256")
      .update(JSON.stringify(tuple), "utf8")
      .digest("hex");
  }
  return createHash("sha256")
    .update(
      JSON.stringify([
        "ledgerone.command.v1",
        "POST",
        ownerId,
        workspaceId,
        p.effectiveAt,
        p.description,
        p.reason,
        p.legs.map((l) => [l.accountId, l.side, l.currency, l.minor]),
      ]),
      "utf8",
    )
    .digest("hex");
}
export function idempotencyKey(value: string | null): string {
  if (!value || !/^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$/.test(value))
    throw invalid();
  return value;
}
// S06B-R01: total upload budget, independent of chunk arrival/Content-Length.
export const BODY_READ_TIMEOUT_MS = 5000;
export async function readCommandBody(request: Request): Promise<unknown> {
  if (
    request.headers.get("content-type")?.split(";")[0]?.trim().toLowerCase() !==
    "application/json"
  )
    throw invalid();
  if (request.signal.aborted) throw unavailable();
  const reader = request.body?.getReader();
  if (!reader) throw invalid();
  const deadline = performance.now() + BODY_READ_TIMEOUT_MS;
  const chunks: Uint8Array[] = [];
  let size = 0;
  let failure: CommandError | undefined;
  let rejectRead: ((error: unknown) => void) | undefined;
  function stop(error: CommandError) {
    if (failure) return;
    failure = error;
    rejectRead?.(error);
    // Stream cleanup is untrusted work: never await a hanging cancel callback.
    void reader!.cancel(error).catch(() => {});
  }
  const onAbort = () => stop(unavailable());
  const onTimeout = () => stop(new CommandError(408, "request_timeout"));
  request.signal.addEventListener("abort", onAbort, { once: true });
  const timer = setTimeout(onTimeout, BODY_READ_TIMEOUT_MS);
  if (request.signal.aborted) onAbort();
  try {
    while (true) {
      if (performance.now() >= deadline) onTimeout();
      if (failure) throw failure;
      const { done, value } = await new Promise<
        ReadableStreamReadResult<Uint8Array>
      >((resolve, reject) => {
        rejectRead = reject;
        reader.read().then(
          (result) => {
            rejectRead = undefined;
            resolve(result);
          },
          (error) => {
            rejectRead = undefined;
            reject(error);
          },
        );
      });
      if (failure) throw failure;
      if (done) break;
      size += value.byteLength;
      if (size > 128 * 1024) {
        stop(invalid());
        throw failure;
      }
      if (value.byteLength) chunks.push(value);
    }
    return JSON.parse(
      new TextDecoder("utf-8", { fatal: true }).decode(Buffer.concat(chunks)),
    );
  } catch (error) {
    if (error instanceof CommandError) throw error;
    throw invalid();
  } finally {
    clearTimeout(timer);
    request.signal.removeEventListener("abort", onAbort);
    reader.releaseLock();
  }
}
