import { isCapitalCommand } from "./capital-contract";
import "server-only";
import { randomUUID } from "node:crypto";
import type { PrismaClient } from "../../generated/prisma/client";
import type { LedgerAuth } from "../auth/create-auth";
import type { AuthConfig } from "../auth/policy";
import { authJSON, getOwnerSession } from "../auth/requests";
import { readTransactionOverview } from "./read";
import type { PostExecutor } from "../ledger/commands/executor";
import {
  CommandError,
  idempotencyKey,
  instant,
  readCommandBody,
  uuid,
} from "../ledger/commands/contract";
import { isMovementCommand } from "./movement-contract";
import { parseTransaction } from "./contract";
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
      const url = new URL(request.url),
        scope = url.searchParams.get("workspace"),
        rawDate = url.searchParams.get("asOf");
      if (
        [...url.searchParams.keys()].some(
          (k) => k !== "workspace" && k !== "asOf",
        ) ||
        url.searchParams.getAll("workspace").length > 1 ||
        url.searchParams.getAll("asOf").length > 1
      )
        throw new CommandError(400, "invalid_request");
      const workspace = scope === null ? undefined : uuid.safeParse(scope);
      if (workspace && !workspace.success)
        throw new CommandError(404, "not_found");
      const asOf = rawDate === null ? new Date() : new Date(instant(rawDate));
      return respond(
        await readTransactionOverview(
          database,
          actor,
          schema,
          asOf,
          workspace?.data,
        ),
      );
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
    const command = parseTransaction(await readCommandBody(request));
    const key = idempotencyKey(request.headers.get("idempotency-key"));
    const result = isCapitalCommand(command)
      ? await executor.execute(
          authorize,
          workspace.data,
          key,
          command,
          request.signal,
        )
      : isMovementCommand(command)
        ? await executor.execute(
            authorize,
            workspace.data,
            key,
            command,
            request.signal,
          )
        : await executor.execute(
            authorize,
            workspace.data,
            key,
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
