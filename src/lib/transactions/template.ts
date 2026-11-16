import { randomUUID } from "node:crypto";
import type { QueryResult } from "pg";
import {
  CommandError,
  unavailable,
  parsePost,
} from "../ledger/commands/contract";
import { parseAmount, formatAmount } from "../ledger/money";
import type { CaptureCommand } from "./contract";
import type { PostResult, FinancialResult } from "../ledger/commands/executor";
type Query = (sql: string, values?: unknown[]) => Promise<QueryResult>;
export type CaptureContext = {
  kind: "EXPENSE" | "INCOME";
  accountId: string;
  categoryAccountId: string;
  accountName: string;
  categoryName: string;
  amountMinor: string;
};
export type CaptureResult = CaptureContext & { post: PostResult };
export async function captureTemplate(
  query: Query,
  owner: string,
  workspace: string,
  command: CaptureCommand,
  operation?: string,
) {
  let context: CaptureContext;
  const minor = parseAmount(command.amount, "INR").toString();
  if (operation) {
    const rows = await query(
      'SELECT kind,"accountId","categoryAccountId","accountName","categoryName","amountMinor"::text FROM transaction_record WHERE "operationId"=$1 AND "ownerId"=$2 AND "workspaceId"=$3',
      [operation, owner, workspace],
    );
    if (rows.rowCount !== 1) throw unavailable();
    context = rows.rows[0];
    if (
      context.kind !== command.kind ||
      context.accountId !== command.accountId ||
      context.categoryName !== command.category ||
      context.amountMinor !== minor
    )
      throw unavailable();
  } else {
    const source = (
      await query(
        'SELECT name,type,kind,"currencyCode","archivedAt" FROM ledger_account WHERE id=$1 AND "ownerId"=$2 AND "workspaceId"=$3',
        [command.accountId, owner, workspace],
      )
    ).rows[0];
    if (!source) throw new CommandError(404, "not_found");
    if (source.archivedAt !== null || source.currencyCode !== "INR")
      throw new CommandError(409, "account_unavailable");
    const cash =
      source.type === "ASSET" &&
      (source.kind === "BANK" || source.kind === "CASH");
    const card = source.type === "LIABILITY" && source.kind === "CREDIT_CARD";
    if (!cash && !(command.kind === "EXPENSE" && card))
      throw new CommandError(400, "invalid_account_type");
    let category = (
      await query(
        'SELECT id FROM ledger_account WHERE "ownerId"=$1 AND "workspaceId"=$2 AND name=$3 AND kind=$4::text::"AccountKind" AND type=$4::text::"AccountClass" AND "currencyCode"=\'INR\' AND "archivedAt" IS NULL ORDER BY id LIMIT 1',
        [owner, workspace, command.category, command.kind],
      )
    ).rows[0];
    if (!category) {
      category = { id: randomUUID() };
      await query(
        'INSERT INTO ledger_account(id,"workspaceId","ownerId",name,type,kind,"currencyCode","updatedAt") VALUES($1,$2,$3,$4,$5::text::"AccountClass",$5::text::"AccountKind",\'INR\',now())',
        [category.id, workspace, owner, command.category, command.kind],
      );
    }
    context = {
      kind: command.kind,
      accountId: command.accountId,
      categoryAccountId: category.id,
      accountName: source.name,
      categoryName: command.category,
      amountMinor: minor,
    };
  }
  const debit =
    command.kind === "EXPENSE" ? context.categoryAccountId : context.accountId;
  const credit =
    command.kind === "EXPENSE" ? context.accountId : context.categoryAccountId;
  const post = parsePost({
    kind: "POST",
    effectiveAt: command.effectiveAt,
    description: command.description,
    reason: command.kind === "EXPENSE" ? "Record expense" : "Record income",
    legs: [
      {
        accountId: debit,
        side: "DEBIT",
        currency: "INR",
        amount: formatAmount(BigInt(minor), "INR"),
      },
      {
        accountId: credit,
        side: "CREDIT",
        currency: "INR",
        amount: formatAmount(BigInt(minor), "INR"),
      },
    ],
  });
  return { context, post };
}
export async function saveCapture(
  query: Query,
  owner: string,
  workspace: string,
  operation: string,
  context: CaptureContext,
) {
  await query(
    'INSERT INTO transaction_record("operationId","workspaceId","ownerId",kind,"accountId","categoryAccountId","accountName","categoryName","amountMinor") VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)',
    [
      operation,
      workspace,
      owner,
      context.kind,
      context.accountId,
      context.categoryAccountId,
      context.accountName,
      context.categoryName,
      context.amountMinor,
    ],
  );
}
export function captureResult(
  context: CaptureContext,
  result: FinancialResult,
): CaptureResult {
  if (!("journalId" in result)) throw unavailable();
  return { ...context, post: result };
}
