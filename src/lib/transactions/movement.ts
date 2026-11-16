import type { QueryResult } from "pg";
import {
  CommandError,
  unavailable,
  parsePost,
} from "../ledger/commands/contract";
import { formatAmount, parseAmount } from "../ledger/money";
import type { MovementCommand } from "./movement-contract";
import type { PostResult, FinancialResult } from "../ledger/commands/executor";
type Query = (sql: string, values?: unknown[]) => Promise<QueryResult>;
export type MovementContext = {
  kind: MovementCommand["kind"];
  sourceAccountId: string;
  destinationAccountId: string;
  sourceAccountName: string;
  destinationAccountName: string;
  amountMinor: string;
};
export type MovementResult = MovementContext & { post: PostResult };
export async function movementTemplate(
  query: Query,
  owner: string,
  workspace: string,
  command: MovementCommand,
  operation?: string,
) {
  let context: MovementContext;
  const minor = parseAmount(command.amount, "INR").toString();
  if (operation) {
    const result = await query(
      'SELECT kind,"sourceAccountId","destinationAccountId","sourceAccountName","destinationAccountName","amountMinor"::text FROM transaction_movement WHERE "operationId"=$1 AND "ownerId"=$2 AND "workspaceId"=$3',
      [operation, owner, workspace],
    );
    if (result.rowCount !== 1) throw unavailable();
    context = result.rows[0];
    if (
      context.kind !== command.kind ||
      context.sourceAccountId !== command.sourceAccountId ||
      context.destinationAccountId !== command.destinationAccountId ||
      context.amountMinor !== minor
    )
      throw unavailable();
  } else {
    if (command.sourceAccountId === command.destinationAccountId)
      throw new CommandError(400, "invalid_request");
    const rows = await query(
      'SELECT id,name,type,kind,"currencyCode","archivedAt" FROM ledger_account WHERE "ownerId"=$1 AND "workspaceId"=$2 AND id=ANY($3::uuid[]) ORDER BY id',
      [
        owner,
        workspace,
        [command.sourceAccountId, command.destinationAccountId],
      ],
    );
    if (rows.rowCount !== 2) throw new CommandError(404, "not_found");
    const source = rows.rows.find((a) => a.id === command.sourceAccountId),
      destination = rows.rows.find(
        (a) => a.id === command.destinationAccountId,
      );
    if (
      rows.rows.some((a) => a.archivedAt !== null || a.currencyCode !== "INR")
    )
      throw new CommandError(409, "account_unavailable");
    const cash = (a: typeof source) =>
      a.type === "ASSET" && (a.kind === "BANK" || a.kind === "CASH");
    if (
      !cash(source) ||
      !(command.kind === "TRANSFER"
        ? cash(destination)
        : destination.type === "LIABILITY" &&
          destination.kind === "CREDIT_CARD")
    )
      throw new CommandError(400, "invalid_account_type");
    context = {
      kind: command.kind,
      sourceAccountId: source.id,
      destinationAccountId: destination.id,
      sourceAccountName: source.name,
      destinationAccountName: destination.name,
      amountMinor: minor,
    };
  }
  const amount = formatAmount(BigInt(minor), "INR");
  const post = parsePost({
    kind: "POST",
    effectiveAt: command.effectiveAt,
    description: command.description,
    reason:
      command.kind === "TRANSFER"
        ? "Transfer between owned accounts"
        : "Credit-card settlement",
    legs: [
      {
        accountId: context.destinationAccountId,
        side: "DEBIT",
        currency: "INR",
        amount,
      },
      {
        accountId: context.sourceAccountId,
        side: "CREDIT",
        currency: "INR",
        amount,
      },
    ],
  });
  return { context, post };
}
export async function saveMovement(
  query: Query,
  owner: string,
  workspace: string,
  operation: string,
  context: MovementContext,
) {
  await query(
    'INSERT INTO transaction_movement("operationId","workspaceId","ownerId",kind,"sourceAccountId","destinationAccountId","sourceAccountName","destinationAccountName","amountMinor") VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)',
    [
      operation,
      workspace,
      owner,
      context.kind,
      context.sourceAccountId,
      context.destinationAccountId,
      context.sourceAccountName,
      context.destinationAccountName,
      context.amountMinor,
    ],
  );
}
export function movementResult(
  context: MovementContext,
  result: FinancialResult,
): MovementResult {
  if (!("journalId" in result)) throw unavailable();
  return { ...context, post: result };
}
// Called only for a new operation, after the shared sorted account locks. Replay
// validates immutable outcome evidence and never re-evaluates present balances.
export async function validateMovementBalance(
  query: Query,
  owner: string,
  workspace: string,
  context: MovementContext,
  effectiveAt: string,
) {
  if (context.kind !== "CARD_SETTLEMENT") return;
  const row = (
    await query(
      `SELECT coalesce(sum(CASE p.side WHEN 'CREDIT' THEN p."nativeMinor"::numeric ELSE -p."nativeMinor"::numeric END),0)::text AS minor FROM posting p JOIN journal j ON j.id=p."journalId" AND j."ownerId"=p."ownerId" AND j."workspaceId"=p."workspaceId" WHERE p."ownerId"=$1 AND p."workspaceId"=$2 AND p."accountId"=$3 AND j.status='POSTED' AND j."effectiveAt"<=$4::timestamptz`,
      [owner, workspace, context.destinationAccountId, effectiveAt],
    )
  ).rows[0];
  if (BigInt(row.minor) < BigInt(context.amountMinor))
    throw new CommandError(409, "card_payment_exceeds_liability");
}
