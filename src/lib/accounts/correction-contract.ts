import { createHash } from "node:crypto";
import { z } from "zod";
import { invalid, instant, uuid } from "../ledger/commands/contract";
import { signedMinor } from "./contract";
const shape = z
  .object({
    kind: z.enum(["CORRECT_OPENING", "CORRECT_ACCOUNT_ENTRY"]),
    accountId: uuid,
    originalJournalId: uuid,
    amount: z.string().max(25),
    effectiveAt: z.string().max(29),
    replacementEffectiveAt: z.string().max(29),
    reason: z
      .string()
      .trim()
      .transform((s) => s.normalize("NFC"))
      .pipe(
        z
          .string()
          .min(1)
          .max(500)
          .refine((s) => !s.includes("\0") && !/[\uD800-\uDFFF]/u.test(s)),
      ),
  })
  .strict();
export type AccountCorrectionCommand = z.infer<typeof shape>;
export function isAccountCorrection(command: {
  kind: string;
}): command is AccountCorrectionCommand {
  return (
    command.kind === "CORRECT_OPENING" ||
    command.kind === "CORRECT_ACCOUNT_ENTRY"
  );
}
export function parseAccountCorrection(
  value: unknown,
): AccountCorrectionCommand {
  const r = shape.safeParse(value);
  if (!r.success) throw invalid();
  const c = r.data;
  const amount = signedMinor(c.amount);
  if (c.kind === "CORRECT_ACCOUNT_ENTRY" && amount < 0n) throw invalid();
  return {
    ...c,
    effectiveAt: instant(c.effectiveAt),
    replacementEffectiveAt: instant(c.replacementEffectiveAt),
  };
}
export function accountCorrectionHash(
  owner: string,
  workspace: string,
  c: AccountCorrectionCommand,
) {
  return createHash("sha256")
    .update(
      JSON.stringify([
        owner,
        workspace,
        c.kind,
        c.accountId,
        c.originalJournalId,
        signedMinor(c.amount).toString(),
        c.effectiveAt,
        c.replacementEffectiveAt,
        c.reason,
      ]),
    )
    .digest("hex");
}
