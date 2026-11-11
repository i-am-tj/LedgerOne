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
      .map((l): Leg => ({
        accountId: l.accountId,
        side: l.side,
        currency: l.currency,
        minor: positiveMinor(parseAmount(l.amount, l.currency)).toString(),
      }))
      .sort(compareLegs);
    if (
      legs.reduce(
        (sum, l) => sum + (l.side === "DEBIT" ? 1n : -1n) * BigInt(l.minor),
        0n,
      ) !== 0n
    )
      throw invalid();
    return {
      kind: "POST",
      effectiveAt: instant(p.effectiveAt),
      description: p.description,
      reason: p.reason,
      legs,
    };
  } catch {
    throw invalid();
  }
}
export function requestHash(
  ownerId: string,
  workspaceId: string,
  p: PostCommand,
) {
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
export async function readCommandBody(request: Request): Promise<unknown> {
  if (
    request.headers.get("content-type")?.split(";")[0]?.trim().toLowerCase() !==
    "application/json"
  )
    throw invalid();
  const reader = request.body?.getReader();
  if (!reader) throw invalid();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > 128 * 1024) {
        await reader.cancel();
        throw invalid();
      }
      chunks.push(value);
    }
    return JSON.parse(
      new TextDecoder("utf-8", { fatal: true }).decode(Buffer.concat(chunks)),
    );
  } catch {
    throw invalid();
  } finally {
    reader.releaseLock();
  }
}
