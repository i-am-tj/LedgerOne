import { createHash } from "node:crypto";
import { z } from "zod";
import { invalid, instant, uuid } from "../ledger/commands/contract";
import { parseAmount } from "../ledger/money";
const shape = z
  .object({
    kind: z.enum(["TRANSFER", "CARD_SETTLEMENT"]),
    sourceAccountId: uuid,
    destinationAccountId: uuid,
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
export type MovementCommand = z.infer<typeof shape>;
export function isMovementCommand(value: {
  kind: string;
}): value is MovementCommand {
  return value.kind === "TRANSFER" || value.kind === "CARD_SETTLEMENT";
}
export function parseMovement(value: unknown): MovementCommand {
  const result = shape.safeParse(value);
  if (!result.success) throw invalid();
  const command = result.data;
  if (command.sourceAccountId === command.destinationAccountId) throw invalid();
  try {
    if (parseAmount(command.amount, "INR") <= 0n) throw invalid();
  } catch {
    throw invalid();
  }
  return { ...command, effectiveAt: instant(command.effectiveAt) };
}
export function movementHash(
  owner: string,
  workspace: string,
  command: MovementCommand,
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
