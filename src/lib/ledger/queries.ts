import "server-only";
import { z } from "zod";
import type { PrismaClient } from "../../generated/prisma/client";
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
