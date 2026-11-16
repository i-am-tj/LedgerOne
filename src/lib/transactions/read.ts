import "server-only";
import { Prisma, type PrismaClient } from "../../generated/prisma/client";
import { CommandError } from "../ledger/commands/contract";
import type { Actor } from "../ownership/service";
import { expenseCategories, incomeCategories } from "./shared";
export const HISTORY_LIMIT = 100;
type HistoryRow = {
  operationId: string;
  workspaceId: string;
  kind: string;
  accountName: string;
  destinationAccountName: string | null;
  accountKind: string | null;
  categoryName: string | null;
  principalMinor: string | null;
  interestMinor: string | null;
  amountMinor: string;
  createdAt: string;
  journalId: string;
  effectiveAt: string;
  postedAt: string;
  description: string;
  futureEffective: boolean;
  reversalAffectsSummary: boolean | null;
  reversalId: string | null;
  reversalOperationId: string | null;
  reversalKind: string | null;
  reversalEffectiveAt: string | null;
  reversalPostedAt: string | null;
  followUpId: string | null;
  followUpEffectiveAt: string | null;
  replacementId: string | null;
  replacementEffectiveAt: string | null;
  replacementDescription: string | null;
};
type AccountRow = {
  id: string;
  workspaceId: string;
  name: string;
  type: "ASSET" | "LIABILITY";
  kind: string;
  currencyCode: string;
  archivedAt: string | null;
  debitMinor: string;
};
// Read-only MVCC snapshot: history, complete posted totals and account balances
// describe the same committed state and one inclusive effective-time cutoff.
export async function readTransactionOverview(
  database: PrismaClient,
  actor: Actor,
  schema: "public" | "ledgerone",
  asOf: Date,
  workspaceId?: string,
) {
  if (!actor.ownerId?.trim()) throw new CommandError(401, "unauthorized");
  if (
    !["public", "ledgerone"].includes(schema) ||
    !Number.isFinite(asOf.getTime())
  )
    throw new CommandError(400, "invalid_request");
  const table = (name: string) => Prisma.raw(`"${schema}"."${name}"`);
  const journal = table("journal"),
    posting = table("posting"),
    account = table("ledger_account"),
    operation = table("ledger_operation");
  // Raw adapter timestamps must not be reinterpreted in the database/session
  // timezone. Return exact UTC strings, including metadata and linked journals.
  const iso = (column: string) =>
    Prisma.sql`to_char(${Prisma.raw(column)} AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')`;
  const owner = actor.ownerId,
    cutoff = asOf.toISOString(),
    where = workspaceId
      ? Prisma.sql`AND c."workspaceId"=${workspaceId}::uuid`
      : Prisma.empty;
  const journalColumns = Prisma.sql`c."createdAt",j.id AS "journalId",j."effectiveAt",j."postedAt",j.description`;
  const journalJoin = Prisma.sql`JOIN ${journal} j ON j."operationId"=c."operationId" AND j."ownerId"=c."ownerId" AND j."workspaceId"=c."workspaceId" AND j.status='POSTED' AND j.kind='GENERAL'`;
  return database.$transaction(
    async (tx) => {
      await tx.$executeRaw`SET TRANSACTION READ ONLY`;
      await tx.$executeRaw`SET LOCAL statement_timeout='3000ms'`;
      if (
        workspaceId &&
        !(await tx.workspace.findFirst({
          where: { id: workspaceId, ownerId: owner },
          select: { id: true },
        }))
      )
        throw new CommandError(404, "not_found");
      // Each branch is independently capped: at most303 candidates,101 final rows.
      // A valid first101 globally can never need more than101 from one family.
      const rows = await tx.$queryRaw<HistoryRow[]>(Prisma.sql`
   WITH contexts AS (
    (SELECT c."operationId",c."workspaceId",c.kind,c."accountName",NULL::text AS "destinationAccountName",a.kind::text AS "accountKind",c."categoryName",NULL::text AS "principalMinor",NULL::text AS "interestMinor",c."amountMinor"::text,${journalColumns}
     FROM ${table("transaction_record")} c ${journalJoin}
     JOIN ${account} a ON a.id=c."accountId" AND a."ownerId"=c."ownerId" AND a."workspaceId"=c."workspaceId"
     WHERE c."ownerId"=${owner} ${where} ORDER BY c."createdAt" DESC,c."operationId" DESC LIMIT 101)
    UNION ALL
    (SELECT c."operationId",c."workspaceId",c.kind,c."sourceAccountName",c."destinationAccountName",NULL::text,NULL::text,NULL::text,NULL::text,c."amountMinor"::text,${journalColumns}
     FROM ${table("transaction_movement")} c ${journalJoin}
     WHERE c."ownerId"=${owner} ${where} ORDER BY c."createdAt" DESC,c."operationId" DESC LIMIT 101)
    UNION ALL
    (SELECT c."operationId",c."workspaceId",c.kind,c."sourceAccountName",c."destinationAccountName",NULL::text,c."interestAccountName",c."principalMinor"::text,c."interestMinor"::text,c."amountMinor"::text,${journalColumns}
     FROM ${table("transaction_capital")} c ${journalJoin}
     WHERE c."ownerId"=${owner} ${where} ORDER BY c."createdAt" DESC,c."operationId" DESC LIMIT 101)
   ),recent AS (SELECT * FROM contexts ORDER BY "createdAt" DESC,"operationId" DESC LIMIT 101)
   SELECT c."operationId",c."workspaceId",c.kind,c."accountName",c."destinationAccountName",c."accountKind",c."categoryName",c."principalMinor",c."interestMinor",c."amountMinor",${iso('c."createdAt"')} AS "createdAt",c."journalId",${iso('c."effectiveAt"')} AS "effectiveAt",${iso('c."postedAt"')} AS "postedAt",c.description,
    c."effectiveAt">${cutoff}::timestamptz AS "futureEffective",
    r.id AS "reversalId",r."operationId" AS "reversalOperationId",o.kind::text AS "reversalKind",${iso('r."effectiveAt"')} AS "reversalEffectiveAt",${iso('r."postedAt"')} AS "reversalPostedAt",r."effectiveAt"<=${cutoff}::timestamptz AS "reversalAffectsSummary",
    followup.id AS "followUpId",${iso('followup."effectiveAt"')} AS "followUpEffectiveAt",replacement.id AS "replacementId",${iso('replacement."effectiveAt"')} AS "replacementEffectiveAt",replacement.description AS "replacementDescription"
   FROM recent c
   LEFT JOIN ${journal} r ON r."reversesJournalId"=c."journalId" AND r."ownerId"=${owner} AND r."workspaceId"=c."workspaceId" AND r.status='POSTED'
   LEFT JOIN ${journal} followup ON followup."reversesJournalId"=r.id AND followup."ownerId"=r."ownerId" AND followup."workspaceId"=r."workspaceId" AND followup.status='POSTED'
   LEFT JOIN ${operation} o ON o.id=r."operationId" AND o."ownerId"=r."ownerId" AND o."workspaceId"=r."workspaceId"
   LEFT JOIN ${journal} replacement ON o.kind='CORRECT' AND replacement."operationId"=o.id AND replacement."ownerId"=o."ownerId" AND replacement."workspaceId"=o."workspaceId" AND replacement.status='POSTED' AND replacement.kind='GENERAL' AND replacement."reversesJournalId" IS NULL
   ORDER BY c."createdAt" DESC,c."operationId" DESC`);
      if (new Set(rows.map((r) => r.operationId)).size !== rows.length)
        throw new CommandError(503, "service_unavailable");
      const [summary] = await tx.$queryRaw<
        { expenseMinor: string; incomeMinor: string }[]
      >(Prisma.sql`
   SELECT coalesce(sum(CASE WHEN a.type='EXPENSE' THEN CASE p.side WHEN 'DEBIT' THEN p."functionalMinor"::numeric ELSE -p."functionalMinor"::numeric END ELSE 0 END),0)::text AS "expenseMinor",
   coalesce(sum(CASE WHEN a.type='INCOME' THEN CASE p.side WHEN 'CREDIT' THEN p."functionalMinor"::numeric ELSE -p."functionalMinor"::numeric END ELSE 0 END),0)::text AS "incomeMinor"
   FROM ${posting} p JOIN ${journal} j ON j.id=p."journalId" AND j."ownerId"=p."ownerId" AND j."workspaceId"=p."workspaceId"
   JOIN ${account} a ON a.id=p."accountId" AND a."ownerId"=p."ownerId" AND a."workspaceId"=p."workspaceId"
   WHERE p."ownerId"=${owner} AND j.status='POSTED' AND j."effectiveAt"<=${cutoff}::timestamptz AND j."functionalCurrencyCode"='INR'
   ${workspaceId ? Prisma.sql`AND p."workspaceId"=${workspaceId}::uuid` : Prisma.empty}`);
      const accounts = await tx.$queryRaw<AccountRow[]>(Prisma.sql`
   SELECT a.id,a."workspaceId",a.name,a.type::text,a.kind::text,a."currencyCode",${iso('a."archivedAt"')} AS "archivedAt",
    coalesce(sum(CASE WHEN j.id IS NOT NULL THEN CASE p.side WHEN 'DEBIT' THEN p."nativeMinor"::numeric ELSE -p."nativeMinor"::numeric END ELSE 0 END),0)::text AS "debitMinor"
   FROM ${account} a LEFT JOIN ${posting} p ON p."accountId"=a.id AND p."ownerId"=a."ownerId" AND p."workspaceId"=a."workspaceId"
   LEFT JOIN ${journal} j ON j.id=p."journalId" AND j."ownerId"=p."ownerId" AND j."workspaceId"=p."workspaceId" AND j.status='POSTED' AND j."effectiveAt"<=${cutoff}::timestamptz
   WHERE a."ownerId"=${owner} AND a.type IN ('ASSET','LIABILITY') ${workspaceId ? Prisma.sql`AND a."workspaceId"=${workspaceId}::uuid` : Prisma.empty}
   GROUP BY a.id ORDER BY a."createdAt",a.id`);
      let assets = 0n,
        liabilities = 0n;
      const balances = accounts.map(({ debitMinor, ...a }) => {
        const balance =
          a.type === "ASSET" ? BigInt(debitMinor) : -BigInt(debitMinor);
        if (a.currencyCode === "INR") {
          if (a.type === "ASSET") assets += balance;
          else liabilities += balance;
        }
        return { ...a, balanceMinor: balance.toString() };
      });
      return {
        accounts: balances,
        expenseCategories,
        incomeCategories,
        summary: summary!,
        asOf: cutoff,
        totals: {
          currency: "INR",
          assetsMinor: assets.toString(),
          liabilitiesMinor: liabilities.toString(),
          netWorthMinor: (assets - liabilities).toString(),
        },
        history: {
          limit: HISTORY_LIMIT,
          hasMore: rows.length > HISTORY_LIMIT,
          ordering: "recorded_at_desc_operation_id_desc",
        },
        transactions: rows.slice(0, HISTORY_LIMIT).map((r) => ({
          operationId: r.operationId,
          workspaceId: r.workspaceId,
          kind: r.kind,
          accountKind: r.accountKind,
          accountName: r.accountName,
          ...(r.destinationAccountName
            ? { destinationAccountName: r.destinationAccountName }
            : {}),
          categoryName: r.categoryName,
          amountMinor: r.amountMinor,
          ...(r.principalMinor !== null
            ? {
                principalMinor: r.principalMinor,
                interestMinor: r.interestMinor,
              }
            : {}),
          createdAt: r.createdAt,
          recordedAt: r.createdAt,
          futureEffective: r.futureEffective,
          journal: {
            id: r.journalId,
            effectiveAt: r.effectiveAt,
            postedAt: r.postedAt,
            description: r.description,
            reversal: r.reversalId
              ? {
                  id: r.reversalId,
                  operationId: r.reversalOperationId,
                  kind: r.reversalKind,
                  effectiveAt: r.reversalEffectiveAt!,
                  postedAt: r.reversalPostedAt!,
                  affectsSummary: r.reversalAffectsSummary!,
                  followUp: r.followUpId
                    ? { id: r.followUpId, effectiveAt: r.followUpEffectiveAt! }
                    : null,
                  replacement: r.replacementId
                    ? {
                        id: r.replacementId,
                        effectiveAt: r.replacementEffectiveAt!,
                        description: r.replacementDescription,
                      }
                    : null,
                }
              : null,
          },
        })),
      };
    },
    {
      isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead,
      maxWait: 2000,
      timeout: 10000,
    },
  );
}
