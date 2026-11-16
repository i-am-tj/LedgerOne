import { randomUUID } from "node:crypto";
import type { QueryResult } from "pg";
import {
  CommandError,
  parsePost,
  unavailable,
} from "../ledger/commands/contract";
import { formatAmount } from "../ledger/money";
import { capitalQuantities, type CapitalCommand } from "./capital-contract";
import type { FinancialResult, PostResult } from "../ledger/commands/executor";
type Query = (sql: string, values?: unknown[]) => Promise<QueryResult>;
export type CapitalContext = {
  kind: CapitalCommand["kind"];
  sourceAccountId: string;
  destinationAccountId: string;
  sourceAccountName: string;
  destinationAccountName: string;
  interestAccountId: string | null;
  interestAccountName: string | null;
  principalMinor: string;
  interestMinor: string;
  amountMinor: string;
};
export type CapitalResult = CapitalContext & { post: PostResult };
export async function capitalTemplate(
  query: Query,
  owner: string,
  workspace: string,
  command: CapitalCommand,
  operation?: string,
) {
  const quantities = capitalQuantities(command);
  let context: CapitalContext;
  if (operation) {
    const result = await query(
      'SELECT kind,"sourceAccountId","destinationAccountId","sourceAccountName","destinationAccountName","interestAccountId","interestAccountName","principalMinor"::text,"interestMinor"::text,"amountMinor"::text FROM transaction_capital WHERE "operationId"=$1 AND "ownerId"=$2 AND "workspaceId"=$3',
      [operation, owner, workspace],
    );
    if (result.rowCount !== 1) throw unavailable();
    context = result.rows[0];
    if (
      context.kind !== command.kind ||
      context.sourceAccountId !== command.sourceAccountId ||
      context.destinationAccountId !== command.destinationAccountId ||
      context.principalMinor !== quantities.principal.toString() ||
      context.interestMinor !== quantities.interest.toString() ||
      context.amountMinor !== quantities.total.toString() ||
      (quantities.interest > 0n && !context.interestAccountId) ||
      (quantities.interest === 0n && context.interestAccountId !== null)
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
    if (
      rows.rows.some((a) => a.archivedAt !== null || a.currencyCode !== "INR")
    )
      throw new CommandError(409, "account_unavailable");
    const source = rows.rows.find((a) => a.id === command.sourceAccountId),
      destination = rows.rows.find(
        (a) => a.id === command.destinationAccountId,
      );
    const cash = (a: typeof source) =>
      a.type === "ASSET" && ["BANK", "CASH"].includes(a.kind);
    const fd = (a: typeof source) =>
      a.type === "ASSET" && a.kind === "FIXED_DEPOSIT";
    if (
      !(command.kind === "FD_FUNDING"
        ? cash(source) && fd(destination)
        : command.kind === "FD_RETURN"
          ? fd(source) && cash(destination)
          : cash(source) &&
            destination.type === "LIABILITY" &&
            destination.kind === "LOAN")
    )
      throw new CommandError(400, "invalid_account_type");
    let interestAccountId: string | null = null;
    if (quantities.interest > 0n) {
      let expense = (
        await query(
          "SELECT id FROM ledger_account WHERE \"ownerId\"=$1 AND \"workspaceId\"=$2 AND name='Loan interest' AND type='EXPENSE' AND kind='EXPENSE' AND \"currencyCode\"='INR' AND \"archivedAt\" IS NULL ORDER BY id LIMIT 1",
          [owner, workspace],
        )
      ).rows[0];
      if (!expense) {
        expense = { id: randomUUID() };
        await query(
          "INSERT INTO ledger_account(id,\"workspaceId\",\"ownerId\",name,type,kind,\"currencyCode\",\"updatedAt\") VALUES($1,$2,$3,'Loan interest','EXPENSE','EXPENSE','INR',now())",
          [expense.id, workspace, owner],
        );
      }
      interestAccountId = expense.id;
    }
    context = {
      kind: command.kind,
      sourceAccountId: source.id,
      destinationAccountId: destination.id,
      sourceAccountName: source.name,
      destinationAccountName: destination.name,
      interestAccountId,
      interestAccountName: interestAccountId ? "Loan interest" : null,
      principalMinor: quantities.principal.toString(),
      interestMinor: quantities.interest.toString(),
      amountMinor: quantities.total.toString(),
    };
  }
  const legs = [
    {
      accountId: context.sourceAccountId,
      side: "CREDIT",
      currency: "INR",
      amount: formatAmount(quantities.total, "INR"),
    },
    {
      accountId: context.destinationAccountId,
      side: "DEBIT",
      currency: "INR",
      amount: formatAmount(quantities.principal, "INR"),
    },
  ];
  if (context.interestAccountId)
    legs.push({
      accountId: context.interestAccountId,
      side: "DEBIT",
      currency: "INR",
      amount: formatAmount(quantities.interest, "INR"),
    });
  return {
    context,
    post: parsePost({
      kind: "POST",
      effectiveAt: command.effectiveAt,
      description: command.description,
      reason:
        command.kind === "FD_FUNDING"
          ? "Fund fixed deposit"
          : command.kind === "FD_RETURN"
            ? "Return fixed-deposit principal"
            : "Loan principal and interest repayment",
      legs,
    }),
  };
}
export async function saveCapital(
  query: Query,
  owner: string,
  workspace: string,
  operation: string,
  c: CapitalContext,
) {
  await query(
    'INSERT INTO transaction_capital("operationId","workspaceId","ownerId",kind,"sourceAccountId","destinationAccountId","sourceAccountName","destinationAccountName","interestAccountId","interestAccountName","principalMinor","interestMinor","amountMinor") VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)',
    [
      operation,
      workspace,
      owner,
      c.kind,
      c.sourceAccountId,
      c.destinationAccountId,
      c.sourceAccountName,
      c.destinationAccountName,
      c.interestAccountId,
      c.interestAccountName,
      c.principalMinor,
      c.interestMinor,
      c.amountMinor,
    ],
  );
}
export function capitalResult(
  context: CapitalContext,
  result: FinancialResult,
): CapitalResult {
  if (!("journalId" in result)) throw unavailable();
  return { ...context, post: result };
}
// New-command admission only, after shared sorted account locks. Keep replay
// independent of mutable balances, exactly as the accepted B-R01 boundary rule.
export async function validateCapitalBalance(
  query: Query,
  owner: string,
  workspace: string,
  c: CapitalContext,
  effectiveAt: string,
) {
  if (c.kind === "FD_FUNDING") return;
  const account =
    c.kind === "FD_RETURN" ? c.sourceAccountId : c.destinationAccountId;
  const normalSide = c.kind === "FD_RETURN" ? "DEBIT" : "CREDIT";
  const row = (
    await query(
      `WITH deltas AS (
  SELECT j."effectiveAt" effective_at,sum(CASE WHEN p.side::text=$5 THEN p."nativeMinor"::numeric ELSE -p."nativeMinor"::numeric END) delta
  FROM posting p JOIN journal j ON j.id=p."journalId" AND j."ownerId"=p."ownerId" AND j."workspaceId"=p."workspaceId"
  WHERE p."ownerId"=$1 AND p."workspaceId"=$2 AND p."accountId"=$3 AND j.status='POSTED' GROUP BY j."effectiveAt"
 ),timeline AS (SELECT effective_at,sum(delta) OVER(ORDER BY effective_at ROWS UNBOUNDED PRECEDING) balance FROM deltas),relevant AS (
 SELECT coalesce(sum(delta),0) balance FROM deltas WHERE effective_at<=$4::timestamptz
 UNION ALL SELECT balance FROM timeline WHERE effective_at>$4::timestamptz
 ) SELECT min(balance)::text minor FROM relevant`,
      [owner, workspace, account, effectiveAt, normalSide],
    )
  ).rows[0];
  if (BigInt(row.minor) < BigInt(c.principalMinor))
    throw new CommandError(409, "principal_exceeds_balance");
}
