import "server-only";
import { z } from "zod";
import { Prisma, type PrismaClient } from "../../generated/prisma/client";
import { AccessError, type Actor } from "../ownership/service";
function scope(actor: Actor) {
  if (!actor.ownerId?.trim()) throw new AccessError(401, "unauthorized");
  return actor.ownerId;
}
function identifier(id: string) {
  if (!z.uuid().safeParse(id).success) throw new AccessError(404, "not_found");
  return id;
}
const accountFields = {
  id: true,
  workspaceId: true,
  name: true,
  type: true,
  kind: true,
  currencyCode: true,
  archivedAt: true,
} as const;
export function listAccounts(database: PrismaClient, actor: Actor) {
  return database.account.findMany({
    where: { ownerId: scope(actor) },
    select: accountFields,
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
  });
}
export async function readAccount(
  database: PrismaClient,
  actor: Actor,
  id: string,
) {
  const ownerId = scope(actor);
  const row = await database.account.findFirst({
    where: { id: identifier(id), ownerId },
    select: accountFields,
  });
  if (!row) throw new AccessError(404, "not_found");
  return row;
}
// Drafts are not accounting activity. All monetary DTO quantities are strings.
export async function readPostedJournal(
  database: PrismaClient,
  actor: Actor,
  id: string,
) {
  const ownerId = scope(actor);
  const row = await database.journal.findFirst({
    where: { id: identifier(id), ownerId, status: "POSTED" },
    select: {
      id: true,
      workspaceId: true,
      kind: true,
      functionalCurrencyCode: true,
      description: true,
      effectiveAt: true,
      postedAt: true,
      reversesJournalId: true,
      postings: {
        where: { ownerId },
        orderBy: { id: "asc" },
        select: {
          id: true,
          accountId: true,
          side: true,
          currencyCode: true,
          functionalCurrencyCode: true,
          nativeMinor: true,
          functionalMinor: true,
          fxRateId: true,
        },
      },
    },
  });
  if (!row) throw new AccessError(404, "not_found");
  return {
    ...row,
    postings: row.postings.map((p) => ({
      ...p,
      nativeMinor: p.nativeMinor.toString(),
      functionalMinor: p.functionalMinor.toString(),
    })),
  };
}

// S07 balances are derived from posted native quantities at an inclusive instant.
// Explicit schema and timestamp casts avoid driver-local timezone conversions.
export async function readAccountBalance(
  database: PrismaClient,
  actor: Actor,
  id: string,
  asOf: Date,
  schema: "public" | "ledgerone",
) {
  if (!Number.isFinite(asOf.getTime()))
    throw new AccessError(400, "invalid_request");
  const account = await readAccount(database, actor, id);
  if (schema !== "public" && schema !== "ledgerone")
    throw new AccessError(400, "invalid_request");
  const posting = Prisma.raw(`"${schema}"."posting"`);
  const journal = Prisma.raw(`"${schema}"."journal"`);
  const [row] = await database.$queryRaw<{ debitMinor: string }[]>(Prisma.sql`
    SELECT coalesce(sum(CASE p.side WHEN 'DEBIT'
      THEN p."nativeMinor"::numeric ELSE -p."nativeMinor"::numeric END),0)::text AS "debitMinor"
    FROM ${posting} p JOIN ${journal} j ON j.id=p."journalId"
      AND j."ownerId"=p."ownerId" AND j."workspaceId"=p."workspaceId"
    WHERE p."accountId"=${account.id}::uuid AND p."ownerId"=${actor.ownerId}
      AND p."workspaceId"=${account.workspaceId}::uuid
      AND j.status='POSTED' AND j."effectiveAt"<=${asOf.toISOString()}::timestamptz
  `);
  const signed = BigInt(row!.debitMinor);
  const debitNormal = account.type === "ASSET" || account.type === "EXPENSE";
  return {
    account,
    asOf: asOf.toISOString(),
    currency: account.currencyCode,
    balanceMinor: (debitNormal ? signed : -signed).toString(),
  };
}
