import { createHash } from "node:crypto";
import { z } from "zod";
import { invalid, instant, uuid } from "../ledger/commands/contract";
import { parseAmount } from "../ledger/money";

import { accountKinds } from "./shared";
export { accountKinds } from "./shared";
const name = z
  .string()
  .trim()
  .min(1)
  .max(80)
  .refine((s) => !s.includes("\0"));
const shape = z.discriminatedUnion("kind", [
  z
    .object({
      kind: z.literal("CREATE_ACCOUNT"),
      name,
      accountKind: z.enum(accountKinds),
      opening: z.string().max(25),
      effectiveAt: z.string().max(29),
    })
    .strict(),
  z
    .object({ kind: z.literal("RENAME_ACCOUNT"), accountId: uuid, name })
    .strict(),
  z.object({ kind: z.literal("ARCHIVE_ACCOUNT"), accountId: uuid }).strict(),
  z.object({ kind: z.literal("RESTORE_ACCOUNT"), accountId: uuid }).strict(),
  z
    .object({
      kind: z.literal("RECONCILE_ACCOUNT"),
      accountId: uuid,
      statement: z.string().max(25),
      effectiveAt: z.string().max(29),
    })
    .strict(),
]);
export type AccountCommand = z.infer<typeof shape>;
export const accountResult = z
  .object({
    kind: z.enum([
      "CREATE_ACCOUNT",
      "RENAME_ACCOUNT",
      "ARCHIVE_ACCOUNT",
      "RESTORE_ACCOUNT",
      "RECONCILE_ACCOUNT",
    ]),
    accountId: uuid,
    name: z.string(),
    previousName: z.string().nullable(),
    archived: z.boolean(),
    openingOperationId: uuid.nullable(),
    effectiveAt: z.string().nullable(),
    ledgerMinor: z.string().nullable(),
    statementMinor: z.string().nullable(),
    differenceMinor: z.string().nullable(),
  })
  .strict();
export type AccountResult = z.infer<typeof accountResult>;
export function signedMinor(value: string): bigint {
  try {
    return value.startsWith("-")
      ? -parseAmount(value.slice(1), "INR")
      : parseAmount(value, "INR");
  } catch {
    throw invalid();
  }
}
export function parseAccountCommand(value: unknown): AccountCommand {
  const result = shape.safeParse(value);
  if (!result.success) throw invalid();
  const command = result.data;
  if (command.kind === "CREATE_ACCOUNT") {
    signedMinor(command.opening);
    command.effectiveAt = instant(command.effectiveAt);
  }
  if (command.kind === "RECONCILE_ACCOUNT") {
    signedMinor(command.statement);
    command.effectiveAt = instant(command.effectiveAt);
  }
  return command;
}
export function isAccountCommand(command: {
  kind: string;
}): command is AccountCommand {
  return [
    "CREATE_ACCOUNT",
    "RENAME_ACCOUNT",
    "ARCHIVE_ACCOUNT",
    "RESTORE_ACCOUNT",
    "RECONCILE_ACCOUNT",
  ].includes(command.kind);
}
export function accountHash(
  owner: string,
  workspace: string,
  command: AccountCommand,
) {
  // Parsed discriminated objects have schema-defined key order. Amount spellings
  // are normalized so decimal-equivalent retries have the same semantic hash.
  const canonical = {
    ...command,
    ...(command.kind === "CREATE_ACCOUNT"
      ? { opening: signedMinor(command.opening).toString() }
      : {}),
    ...(command.kind === "RECONCILE_ACCOUNT"
      ? { statement: signedMinor(command.statement).toString() }
      : {}),
  };
  return createHash("sha256")
    .update(JSON.stringify([owner, workspace, canonical]))
    .digest("hex");
}
