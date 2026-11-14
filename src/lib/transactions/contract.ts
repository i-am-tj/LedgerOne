import { createHash } from "node:crypto";
import { z } from "zod";
import { invalid, instant, uuid } from "../ledger/commands/contract";
import { parseAmount } from "../ledger/money";
import { expenseCategories, incomeCategories } from "./shared";
const base = z
  .object({
    accountId: uuid,
    amount: z.string().max(24),
    effectiveAt: z.string().max(29),
    description: z
      .string()
      .trim()
      .max(500)
      .refine((s) => !s.includes("\0"))
      .default(""),
  })
  .strict();
const shape = z.discriminatedUnion("kind", [
  base
    .extend({ kind: z.literal("EXPENSE"), category: z.enum(expenseCategories) })
    .strict(),
  base
    .extend({ kind: z.literal("INCOME"), category: z.enum(incomeCategories) })
    .strict(),
]);
export type CaptureCommand = z.infer<typeof shape>;
export function isCaptureCommand(value: {
  kind: string;
}): value is CaptureCommand {
  return value.kind === "EXPENSE" || value.kind === "INCOME";
}
export function parseCapture(value: unknown): CaptureCommand {
  const p = shape.safeParse(value);
  if (!p.success) throw invalid();
  try {
    if (parseAmount(p.data.amount, "INR") <= 0n) throw invalid();
  } catch {
    throw invalid();
  }
  return { ...p.data, effectiveAt: instant(p.data.effectiveAt) };
}
export function captureHash(
  owner: string,
  workspace: string,
  command: CaptureCommand,
) {
  return createHash("sha256")
    .update(
      JSON.stringify([
        owner,
        workspace,
        { ...command, amount: parseAmount(command.amount, "INR").toString() },
      ]),
    )
    .digest("hex");
}
