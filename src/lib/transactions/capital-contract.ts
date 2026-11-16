import { createHash } from "node:crypto";
import { z } from "zod";
import { invalid, instant, uuid } from "../ledger/commands/contract";
import { MAX_MINOR, parseAmount } from "../ledger/money";
const base = z.object({
  sourceAccountId: uuid,
  destinationAccountId: uuid,
  effectiveAt: z.string().max(29),
  description: z
    .string()
    .trim()
    .max(500)
    .refine((s) => !s.includes("\0"))
    .default(""),
});
const shape = z.discriminatedUnion("kind", [
  base
    .extend({ kind: z.literal("FD_FUNDING"), amount: z.string().max(24) })
    .strict(),
  base
    .extend({ kind: z.literal("FD_RETURN"), amount: z.string().max(24) })
    .strict(),
  base
    .extend({
      kind: z.literal("LOAN_REPAYMENT"),
      principal: z.string().max(24),
      interest: z.string().max(24),
    })
    .strict(),
]);
export type CapitalCommand = z.infer<typeof shape>;
export function isCapitalCommand(value: {
  kind: string;
}): value is CapitalCommand {
  return ["FD_FUNDING", "FD_RETURN", "LOAN_REPAYMENT"].includes(value.kind);
}
export function capitalQuantities(command: CapitalCommand) {
  const principal = parseAmount(
    command.kind === "LOAN_REPAYMENT" ? command.principal : command.amount,
    "INR",
  );
  const interest =
    command.kind === "LOAN_REPAYMENT"
      ? parseAmount(command.interest, "INR")
      : 0n;
  if (principal <= 0n || principal + interest > MAX_MINOR) throw invalid();
  return { principal, interest, total: principal + interest };
}
export function parseCapital(value: unknown): CapitalCommand {
  const result = shape.safeParse(value);
  if (!result.success) throw invalid();
  if (result.data.sourceAccountId === result.data.destinationAccountId)
    throw invalid();
  try {
    capitalQuantities(result.data);
  } catch {
    throw invalid();
  }
  return { ...result.data, effectiveAt: instant(result.data.effectiveAt) };
}
export function capitalHash(
  owner: string,
  workspace: string,
  command: CapitalCommand,
) {
  const q = capitalQuantities(command);
  return createHash("sha256")
    .update(
      JSON.stringify([
        owner,
        workspace,
        {
          ...command,
          ...(command.kind === "LOAN_REPAYMENT"
            ? {
                principal: q.principal.toString(),
                interest: q.interest.toString(),
              }
            : { amount: q.total.toString() }),
        },
      ]),
    )
    .digest("hex");
}
