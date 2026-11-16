import "server-only";
import { randomUUID } from "node:crypto";
import type { PrismaClient } from "../../generated/prisma/client";
import type { LedgerAuth } from "../auth/create-auth";
import type { AuthConfig } from "../auth/policy";
import { authJSON, getOwnerSession } from "../auth/requests";
import { Prisma } from "../../generated/prisma/client";
import type { PostExecutor } from "../ledger/commands/executor";
import {
  CommandError,
  idempotencyKey,
  readCommandBody,
  uuid,
} from "../ledger/commands/contract";
import { readAccountBalance } from "../ledger/queries";
import { parseCapture } from "./contract";
import { expenseCategories, incomeCategories } from "./shared";
export async function handleTransactions(
  request: Request,
  runtime: { auth: LedgerAuth; config: AuthConfig } | null,
  database: PrismaClient,
  executor: PostExecutor | null,
  schema: "public" | "ledgerone",
) {
  const requestId = randomUUID();
  const respond = (value: unknown, status = 200) => {
    const r = authJSON(value, status);
    r.headers.set("X-Request-ID", requestId);
    return r;
  };
  try {
    if (!runtime) throw new CommandError(503, "authentication_unavailable");
    const authorize = async () => {
      const session = await getOwnerSession(
        runtime.auth,
        runtime.config,
        request.headers,
      );
      if (!session) throw new CommandError(401, "unauthorized");
      return { ownerId: session.user.id, requestId };
    };
    const actor = await authorize();
    if (request.method === "GET") {
      const records = await database.transactionRecord.findMany({
        where: { ownerId: actor.ownerId },
        orderBy: [{ createdAt: "desc" }, { operationId: "desc" }],
        take: 100,
        include: {
          operation: {
            include: {
              journals: {
                where: { status: "POSTED", kind: "GENERAL" },
                select: {
                  id: true,
                  effectiveAt: true,
                  description: true,
                  reversal: { select: { id: true } },
                },
              },
            },
          },
        },
      });
      const accounts = await database.account.findMany({
        where: { ownerId: actor.ownerId, type: { in: ["ASSET", "LIABILITY"] } },
        select: {
          id: true,
          workspaceId: true,
          name: true,
          type: true,
          kind: true,
          currencyCode: true,
          archivedAt: true,
        },
        orderBy: { createdAt: "asc" },
      });
      if (schema !== "public" && schema !== "ledgerone")
        throw new CommandError(503, "service_unavailable");
      const posting = Prisma.raw('"' + schema + '".posting'),
        journal = Prisma.raw('"' + schema + '".journal'),
        account = Prisma.raw('"' + schema + '".ledger_account');
      const [summary] = await database.$queryRaw<
        { expenseMinor: string; incomeMinor: string }[]
      >(Prisma.sql`
    SELECT coalesce(sum(CASE WHEN a.type='EXPENSE' THEN CASE p.side WHEN 'DEBIT' THEN p."functionalMinor"::numeric ELSE -p."functionalMinor"::numeric END ELSE 0 END),0)::text AS "expenseMinor",
     coalesce(sum(CASE WHEN a.type='INCOME' THEN CASE p.side WHEN 'CREDIT' THEN p."functionalMinor"::numeric ELSE -p."functionalMinor"::numeric END ELSE 0 END),0)::text AS "incomeMinor"
    FROM ${posting} p JOIN ${journal} j ON j.id=p."journalId" AND j."ownerId"=p."ownerId" AND j."workspaceId"=p."workspaceId"
     JOIN ${account} a ON a.id=p."accountId" AND a."ownerId"=p."ownerId" AND a."workspaceId"=p."workspaceId"
    WHERE p."ownerId"=${actor.ownerId} AND j.status='POSTED' AND j."effectiveAt"<=${new Date().toISOString()}::timestamptz`);
      return respond({
        accounts: await Promise.all(
          accounts.map(async (a) => ({
            ...a,
            balanceMinor: (
              await readAccountBalance(
                database,
                actor,
                a.id,
                new Date(),
                schema,
              )
            ).balanceMinor,
          })),
        ),
        expenseCategories,
        incomeCategories,
        summary,
        transactions: records.map((r) => ({
          operationId: r.operationId,
          kind: r.kind,
          accountName: r.accountName,
          categoryName: r.categoryName,
          amountMinor: r.amountMinor.toString(),
          journal: r.operation.journals[0] ?? null,
        })),
      });
    }
    if (request.method !== "POST")
      throw new CommandError(405, "method_not_allowed");
    if (
      request.headers.get("origin") !== runtime.config.baseURL ||
      request.headers.get("sec-fetch-site") === "cross-site"
    )
      throw new CommandError(403, "forbidden");
    const workspace = uuid.safeParse(
      new URL(request.url).searchParams.get("workspace"),
    );
    if (!workspace.success) throw new CommandError(404, "not_found");
    if (!executor)
      throw new CommandError(503, "transaction_writes_unavailable");
    const command = parseCapture(await readCommandBody(request));
    const result = await executor.execute(
      authorize,
      workspace.data,
      idempotencyKey(request.headers.get("idempotency-key")),
      command,
      request.signal,
    );
    return respond(result.result, result.replayed ? 200 : 201);
  } catch (error) {
    return error instanceof CommandError
      ? respond({ error: error.code }, error.status)
      : respond({ error: "service_unavailable" }, 503);
  }
}
