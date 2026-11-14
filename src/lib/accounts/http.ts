import "server-only";
import { randomUUID } from "node:crypto";
import { getAuthRuntime } from "../auth/server";
import { getOwnerSession, authJSON } from "../auth/requests";
import { getDatabase } from "../database";
import {
  CommandError,
  idempotencyKey,
  instant,
  readCommandBody,
  uuid,
} from "../ledger/commands/contract";
import { getAccountExecutor } from "./capability";
import { parseAccountCommand } from "./contract";
import { readAccountBalance, listAccounts } from "../ledger/queries";
import { databaseSettings } from "../profile";
export async function accountRequest(request: Request) {
  const requestId = randomUUID();
  const started = performance.now();
  const respond = (body: unknown, status = 200) => {
    const response = authJSON(body, status);
    response.headers.set("X-Request-ID", requestId);
    try {
      console.info(
        JSON.stringify({
          requestId,
          route: "accounts",
          method: request.method,
          status,
          durationMs: Math.round(performance.now() - started),
        }),
      );
    } catch {
      /* Operational logs cannot change a committed result. */
    }
    return response;
  };
  try {
    const runtime = getAuthRuntime();
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
    const database = getDatabase();
    if (request.method === "GET") {
      const accounts = (await listAccounts(database, actor)).filter(
        (a) => a.type === "ASSET" || a.type === "LIABILITY",
      );
      const schema = databaseSettings(process.env).schema;
      if (schema !== "public" && schema !== "ledgerone")
        throw new CommandError(503, "service_unavailable");
      const url = new URL(request.url),
        raw = url.searchParams.get("asOf");
      const date = raw ? new Date(instant(raw)) : new Date();
      if (!Number.isFinite(date.getTime()))
        throw new CommandError(400, "invalid_request");
      const result = await Promise.all(
        accounts.map(async (account) => {
          const balance = await readAccountBalance(
            database,
            actor,
            account.id,
            date,
            schema,
          );
          const events = await database.accountEvent.findMany({
            where: {
              accountId: account.id,
              ownerId: actor.ownerId,
              workspaceId: account.workspaceId,
            },
            orderBy: [{ createdAt: "desc" }, { id: "desc" }],
            take: 100,
            select: {
              id: true,
              action: true,
              data: true,
              effectiveAt: true,
              createdAt: true,
            },
          });
          const activity = await database.posting.findMany({
            where: {
              accountId: account.id,
              ownerId: actor.ownerId,
              journal: { status: "POSTED" },
            },
            orderBy: { journal: { effectiveAt: "desc" } },
            take: 100,
            select: {
              id: true,
              side: true,
              nativeMinor: true,
              journal: {
                select: {
                  id: true,
                  description: true,
                  kind: true,
                  effectiveAt: true,
                  reversesJournalId: true,
                },
              },
            },
          });
          return {
            ...account,
            balanceMinor: balance.balanceMinor,
            events,
            activity: activity.map((p) => ({
              ...p,
              nativeMinor: p.nativeMinor.toString(),
            })),
          };
        }),
      );
      const workspaces = await database.workspace.findMany({
        where: { ownerId: actor.ownerId },
        select: { id: true, name: true },
        orderBy: { createdAt: "asc" },
      });
      return respond({
        accounts: result,
        workspaces,
        asOf: date.toISOString(),
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
    const key = idempotencyKey(request.headers.get("idempotency-key"));
    const executor = await getAccountExecutor();
    if (!executor) throw new CommandError(503, "account_writes_unavailable");
    const command = parseAccountCommand(await readCommandBody(request));
    const outcome = await executor.execute(
      authorize,
      workspace.data,
      key,
      command,
      request.signal,
    );
    return respond(outcome.result, outcome.replayed ? 200 : 201);
  } catch (error) {
    if (error instanceof CommandError)
      return respond({ error: error.code }, error.status);
    if (
      error &&
      typeof error === "object" &&
      "status" in error &&
      "code" in error
    )
      return respond({ error: String(error.code) }, Number(error.status));
    return respond({ error: "service_unavailable" }, 503);
  }
}
