import { randomUUID } from "node:crypto";
import type { QueryResult } from "pg";
import { CHART, normalSide } from "../ledger/chart";
import {
  CommandError,
  unavailable,
  type Leg,
} from "../ledger/commands/contract";
import {
  accountResult,
  signedMinor,
  type AccountCommand,
  type AccountResult,
} from "./contract";

type Query = (sql: string, values?: unknown[]) => Promise<QueryResult>;
type Opening = (
  operation: string,
  journal: string,
  account: string,
  date: string,
  name: string,
  legs: readonly Leg[],
) => Promise<void>;
// Called only inside the shared executor's owned transaction and deadline.
export async function mutateAccount(
  query: Query,
  owner: string,
  requestId: string,
  workspace: string,
  key: string,
  hash: string,
  command: AccountCommand,
  opening: Opening,
) {
  const receipt = await query(
    'SELECT r.result,r."accountId",r."requestHash",r.result=e.data AND e.action=r.result->>\'kind\' AS consistent FROM account_command r LEFT JOIN account_event e ON e."commandId"=r.id AND e."ownerId"=r."ownerId" AND e."workspaceId"=r."workspaceId" AND e."accountId"=r."accountId" WHERE r."ownerId"=$1 AND r."workspaceId"=$2 AND r."idempotencyKey"=$3',
    [owner, workspace, key],
  );
  if (receipt.rowCount) {
    if (receipt.rows[0].requestHash !== hash)
      throw new CommandError(409, "idempotency_conflict");
    const parsed = accountResult.safeParse(receipt.rows[0].result);
    if (
      !parsed.success ||
      !receipt.rows[0].consistent ||
      parsed.data.kind !== command.kind
    )
      throw unavailable();
    if (parsed.data.accountId !== receipt.rows[0].accountId)
      throw unavailable();
    if (command.kind === "CREATE_ACCOUNT") {
      if (
        parsed.data.name !== command.name ||
        parsed.data.effectiveAt !== command.effectiveAt
      )
        throw unavailable();
      const amount = signedMinor(command.opening);
      if (amount === 0n) {
        if (parsed.data.openingOperationId !== null) throw unavailable();
      } else {
        const evidence = await query(
          'SELECT o."requestHash",j."effectiveAt",p.side,p."nativeMinor"::text FROM ledger_operation o JOIN journal j ON j."operationId"=o.id AND j.kind=\'OPENING\' AND j.status=\'POSTED\' JOIN opening_balance b ON b."journalId"=j.id AND b."ownerId"=o."ownerId" AND b."workspaceId"=o."workspaceId" JOIN posting p ON p."journalId"=j.id AND p."accountId"=b."accountId" JOIN audit_event a ON a."operationId"=o.id AND a."targetJournalId"=j.id AND a.action=\'ledger.opened\' AND a."ownerId"=o."ownerId" AND a."workspaceId"=o."workspaceId" WHERE o.id=$1 AND o.kind=\'OPENING\' AND o."ownerId"=$2 AND o."workspaceId"=$3 AND b."accountId"=$4',
          [
            parsed.data.openingOperationId,
            owner,
            workspace,
            parsed.data.accountId,
          ],
        );
        const e = evidence.rows[0];
        const debit =
          (normalSide(CHART[command.accountKind]) === "DEBIT") === amount > 0n;
        if (
          evidence.rowCount !== 1 ||
          e.requestHash !== hash ||
          e.effectiveAt.toISOString() !== command.effectiveAt ||
          e.side !== (debit ? "DEBIT" : "CREDIT") ||
          BigInt(e.nativeMinor) !== (amount < 0n ? -amount : amount)
        )
          throw unavailable();
      }
    } else if (parsed.data.accountId !== command.accountId) throw unavailable();
    return { result: parsed.data, replayed: true };
  }
  let accountId: string,
    name: string,
    archived = false,
    openingOperationId: string | null = null;
  let effectiveAt: string | null = null,
    ledgerMinor: string | null = null,
    statementMinor: string | null = null,
    differenceMinor: string | null = null;
  if (command.kind === "CREATE_ACCOUNT") {
    accountId = randomUUID();
    name = command.name;
    effectiveAt = command.effectiveAt;
    await query(
      'INSERT INTO ledger_account(id,"workspaceId","ownerId",name,type,kind,"currencyCode","updatedAt") VALUES($1,$2,$3,$4,$5,$6,\'INR\',now())',
      [
        accountId,
        workspace,
        owner,
        name,
        CHART[command.accountKind],
        command.accountKind,
      ],
    );
    const amount = signedMinor(command.opening);
    if (amount !== 0n) {
      let equity = (
        await query(
          'SELECT id,"archivedAt" FROM ledger_account WHERE "workspaceId"=$1 AND "ownerId"=$2 AND kind=\'OPENING_EQUITY\' AND "currencyCode"=\'INR\' ORDER BY id LIMIT 1',
          [workspace, owner],
        )
      ).rows[0];
      if (!equity) {
        equity = { id: randomUUID(), archivedAt: null };
        await query(
          "INSERT INTO ledger_account(id,\"workspaceId\",\"ownerId\",name,type,kind,\"currencyCode\",\"updatedAt\") VALUES($1,$2,$3,'Opening balances','EQUITY','OPENING_EQUITY','INR',now())",
          [equity.id, workspace, owner],
        );
      }
      const locked = await query(
        'SELECT id,"archivedAt" FROM ledger_account WHERE id=ANY($1::uuid[]) AND "workspaceId"=$2 AND "ownerId"=$3 ORDER BY id FOR UPDATE',
        [[accountId, equity.id], workspace, owner],
      );
      if (
        locked.rowCount !== 2 ||
        locked.rows.some((a) => a.archivedAt !== null)
      )
        throw new CommandError(409, "account_unavailable");
      openingOperationId = randomUUID();
      const side = normalSide(CHART[command.accountKind]);
      const debit = (side === "DEBIT") === amount > 0n;
      const minor = (amount < 0n ? -amount : amount).toString();
      await opening(
        openingOperationId,
        randomUUID(),
        accountId,
        effectiveAt,
        name,
        [
          {
            accountId,
            side: debit ? "DEBIT" : "CREDIT",
            currency: "INR",
            minor,
          },
          {
            accountId: equity.id,
            side: debit ? "CREDIT" : "DEBIT",
            currency: "INR",
            minor,
          },
        ],
      );
    }
  } else {
    accountId = command.accountId;
    const row = (
      await query(
        'SELECT name,"archivedAt",type,"currencyCode" FROM ledger_account WHERE id=$1 AND "ownerId"=$2 AND "workspaceId"=$3 AND type IN (\'ASSET\',\'LIABILITY\') FOR UPDATE',
        [accountId, owner, workspace],
      )
    ).rows[0];
    if (!row) throw new CommandError(404, "not_found");
    name = row.name;
    archived = row.archivedAt !== null;
    if (command.kind === "RENAME_ACCOUNT") {
      name = command.name;
      await query(
        'UPDATE ledger_account SET name=$1,"updatedAt"=now() WHERE id=$2',
        [name, accountId],
      );
    } else if (
      command.kind === "ARCHIVE_ACCOUNT" ||
      command.kind === "RESTORE_ACCOUNT"
    ) {
      archived = command.kind === "ARCHIVE_ACCOUNT";
      await query(
        'UPDATE ledger_account SET "archivedAt"=$1,"updatedAt"=now() WHERE id=$2',
        [archived ? new Date() : null, accountId],
      );
    } else {
      if (row.currencyCode !== "INR")
        throw new CommandError(409, "account_unavailable");
      effectiveAt = command.effectiveAt;
      const balance = await query(
        'SELECT coalesce(sum(CASE p.side WHEN \'DEBIT\' THEN p."nativeMinor"::numeric ELSE -p."nativeMinor"::numeric END),0)::text AS balance FROM posting p JOIN journal j ON j.id=p."journalId" WHERE p."accountId"=$1 AND p."ownerId"=$2 AND p."workspaceId"=$3 AND j.status=\'POSTED\' AND j."effectiveAt"<=$4::timestamptz',
        [accountId, owner, workspace, effectiveAt],
      );
      const signed = BigInt(balance.rows[0].balance);
      ledgerMinor = (row.type === "ASSET" ? signed : -signed).toString();
      statementMinor = signedMinor(command.statement).toString();
      differenceMinor = (
        BigInt(ledgerMinor) - BigInt(statementMinor)
      ).toString();
    }
  }
  const result: AccountResult = {
    kind: command.kind,
    accountId,
    name,
    archived,
    openingOperationId,
    effectiveAt,
    ledgerMinor,
    statementMinor,
    differenceMinor,
  };
  const id = randomUUID();
  await query(
    'INSERT INTO account_command(id,"workspaceId","ownerId","accountId","idempotencyKey","requestHash",result) VALUES($1,$2,$3,$4,$5,$6,$7::jsonb)',
    [id, workspace, owner, accountId, key, hash, JSON.stringify(result)],
  );
  await query(
    'INSERT INTO account_event(id,"commandId","workspaceId","ownerId","accountId","actorId",action,data,"effectiveAt","requestId") VALUES($1,$2,$3,$4,$5,$4,$6,$7::jsonb,$8,$9)',
    [
      randomUUID(),
      id,
      workspace,
      owner,
      accountId,
      command.kind,
      JSON.stringify(result),
      effectiveAt ?? new Date().toISOString(),
      requestId,
    ],
  );
  return { result, replayed: false };
}
