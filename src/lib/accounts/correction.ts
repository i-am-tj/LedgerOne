import "server-only";
import type { CommandQuery } from "../ledger/commands/original";
import {
  CommandError,
  parseCommand,
  type FinancialCommand,
} from "../ledger/commands/contract";
import { formatAmount } from "../ledger/money";
import { signedMinor } from "./contract";
import type { AccountCorrectionCommand } from "./correction-contract";
export async function prepareAccountCorrection(
  query: CommandQuery,
  owner: string,
  workspace: string,
  c: AccountCorrectionCommand,
) {
  const root = (
    await query("SELECT ledger07_correction_root($1,$2,$3) AS id", [
      c.originalJournalId,
      workspace,
      owner,
    ])
  ).rows[0]?.id;
  if (!root) throw new CommandError(404, "not_found");
  const target = (
    await query(
      'SELECT j.kind,j.description,j."operationId",a.type,a.kind AS "accountKind",p.side,p."accountId",p."nativeMinor"::text FROM journal j JOIN posting p ON p."journalId"=j.id JOIN ledger_account a ON a.id=p."accountId" WHERE j.id=$1 AND j."workspaceId"=$2 AND j."ownerId"=$3 AND j.status=\'POSTED\' ORDER BY p.id',
      [c.originalJournalId, workspace, owner],
    )
  ).rows;
  const marker = (
    await query(
      'SELECT "accountId" FROM opening_balance WHERE "journalId"=$1 AND "ownerId"=$2 AND "workspaceId"=$3',
      [root, owner, workspace],
    )
  ).rows[0];
  const capture = (
    await query(
      'SELECT "accountId","categoryAccountId" FROM transaction_record WHERE "operationId"=(SELECT "operationId" FROM journal WHERE id=$1) AND "ownerId"=$2 AND "workspaceId"=$3 AND kind IN (\'EXPENSE\',\'INCOME\')',
      [root, owner, workspace],
    )
  ).rows[0];
  if (
    target.length !== 2 ||
    (c.kind === "CORRECT_OPENING"
      ? marker?.accountId !== c.accountId
      : !capture || capture.accountId !== c.accountId)
  )
    throw new CommandError(409, "target_unavailable");
  const zero = target[0].kind === "REVERSAL";
  if (
    zero &&
    !(
      await query(
        'SELECT "operationId" FROM account_correction WHERE "operationId"=$1 AND "amountMinor"=0 AND "rootJournalId"=$2',
        [target[0].operationId, root],
      )
    ).rowCount
  )
    throw new CommandError(409, "target_unavailable");
  const amount = signedMinor(c.amount);
  if (zero && amount === 0n) throw new CommandError(409, "target_unavailable");
  const physical = target.find((p) => p.accountId === c.accountId)!;
  if (!physical) throw new CommandError(409, "target_unavailable");
  const source = zero
    ? (
        await query(
          'SELECT p.side,p."accountId",a.type,a.kind AS "accountKind" FROM posting p JOIN ledger_account a ON a.id=p."accountId" WHERE p."journalId"=$1 ORDER BY p.id',
          [root],
        )
      ).rows
    : target;
  const physicalDebit = (physical.type === "ASSET") === amount > 0n;
  const legs = source.map((p) => ({
    accountId: p.accountId,
    side:
      c.kind === "CORRECT_OPENING"
        ? (p.accountId === c.accountId ? physicalDebit : !physicalDebit)
          ? "DEBIT"
          : "CREDIT"
        : p.side,
    currency: "INR",
    amount: formatAmount(amount < 0n ? -amount : amount, "INR"),
  }));
  const description = target[0].description;
  const command: FinancialCommand = parseCommand(
    zero
      ? {
          kind: "POST",
          effectiveAt: c.replacementEffectiveAt,
          description,
          reason: c.reason,
          legs,
        }
      : amount === 0n
        ? {
            kind: "REVERSE",
            originalJournalId: c.originalJournalId,
            effectiveAt: c.effectiveAt,
            description,
            reason: c.reason,
          }
        : {
            kind: "CORRECT",
            originalJournalId: c.originalJournalId,
            effectiveAt: c.effectiveAt,
            description,
            reason: c.reason,
            replacement: {
              effectiveAt: c.replacementEffectiveAt,
              description,
              legs,
            },
          },
  );
  return {
    command,
    root,
    mode: c.kind === "CORRECT_OPENING" ? "OPENING" : "ENTRY",
    amount: amount.toString(),
    accountId: c.accountId,
    original: c.originalJournalId,
    effectiveAt: c.effectiveAt,
    replacementEffectiveAt: c.replacementEffectiveAt,
  };
}
export async function correctionHead(
  query: CommandQuery,
  owner: string,
  workspace: string,
  root: string,
  account: string,
) {
  let id = root;
  const seen = new Set<string>();
  while (seen.size < 128 && !seen.has(id)) {
    seen.add(id);
    const row = (
      await query(
        'SELECT j.id,j.kind,j.description,to_char(j."effectiveAt" AT TIME ZONE \'UTC\',\'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"\') AS "effectiveAt",p.side,p."nativeMinor"::text,a.type FROM journal j JOIN posting p ON p."journalId"=j.id AND p."accountId"=$2 JOIN ledger_account a ON a.id=p."accountId" WHERE j.id=$1 AND j."ownerId"=$3 AND j."workspaceId"=$4 AND j.status=\'POSTED\'',
        [id, account, owner, workspace],
      )
    ).rows[0];
    if (!row) throw new CommandError(503, "service_unavailable");
    const reverse = (
      await query(
        'SELECT j.id,o.kind,j."operationId" FROM journal j JOIN ledger_operation o ON o.id=j."operationId" WHERE j."reversesJournalId"=$1 AND j.status=\'POSTED\'',
        [id],
      )
    ).rows[0];
    if (reverse) {
      if (reverse.kind === "CORRECT") {
        id = (
          await query(
            "SELECT id FROM journal WHERE \"operationId\"=$1 AND kind='GENERAL' AND status='POSTED'",
            [reverse.operationId],
          )
        ).rows[0]?.id;
        if (!id) throw new CommandError(503, "service_unavailable");
        continue;
      }
      id = reverse.id;
      continue;
    }
    const resumed = (
      await query(
        'SELECT j.id FROM account_correction c JOIN journal j ON j.id=c."replacementJournalId" WHERE c."originalJournalId"=$1 AND j.status=\'POSTED\' AND c."workspaceId"=$2 AND c."ownerId"=$3',
        [id, workspace, owner],
      )
    ).rows[0];
    if (row.kind === "REVERSAL" && resumed) {
      id = resumed.id;
      continue;
    }
    const amount =
      row.kind === "REVERSAL"
        ? 0n
        : BigInt(row.nativeMinor) *
          (row.side === (row.type === "ASSET" ? "DEBIT" : "CREDIT") ? 1n : -1n);
    return {
      rootJournalId: root,
      originalJournalId: id,
      amountMinor: amount.toString(),
      effectiveAt: row.effectiveAt,
      description: row.description,
      zero: row.kind === "REVERSAL",
    };
  }
  throw new CommandError(409, "target_unavailable");
}
// Bound selectable history to the same recent100 account entries. Only owned
// expense/income roots; no posting-leg editor or movement/principal correction.
export async function entryCorrectionChoices(
  query: CommandQuery,
  owner: string,
  workspace: string,
  account: string,
) {
  return (
    await query(
      `WITH recent AS (
 SELECT j.*,p."nativeMinor",p.side FROM journal j JOIN posting p ON p."journalId"=j.id
 WHERE p."accountId"=$1 AND j."ownerId"=$2 AND j."workspaceId"=$3 AND j.status='POSTED'
 ORDER BY j."createdAt" DESC,j.id DESC LIMIT 100
 ), eligible AS (
 SELECT j.*,ledger07_correction_root(j.id,$3,$2) root FROM recent j
 WHERE NOT EXISTS(SELECT 1 FROM journal child WHERE child."reversesJournalId"=j.id)
 AND NOT EXISTS(SELECT 1 FROM account_correction used WHERE used."originalJournalId"=j.id)
 AND (j.kind='GENERAL' OR j.kind='REVERSAL' AND EXISTS(SELECT 1 FROM account_correction c WHERE c."operationId"=j."operationId" AND c."amountMinor"=0))
 ) SELECT e.id AS "originalJournalId",e.root AS "rootJournalId",r."accountName",r."categoryName",r.kind,
 e.description,to_char(e."effectiveAt" AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS "effectiveAt",
 CASE WHEN e.kind='REVERSAL' THEN '0' ELSE e."nativeMinor"::text END AS "amountMinor"
 FROM eligible e JOIN journal root ON root.id=e.root JOIN transaction_record r ON r."operationId"=root."operationId" AND r."accountId"=$1 AND r."ownerId"=$2 AND r."workspaceId"=$3
 WHERE r.kind IN ('EXPENSE','INCOME') ORDER BY e."createdAt" DESC,e.id DESC`,
      [account, owner, workspace],
    )
  ).rows;
}
