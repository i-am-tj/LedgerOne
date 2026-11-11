import "server-only";
import { randomUUID } from "node:crypto";
import type { PrismaClient } from "../../generated/prisma/client";
import type { LedgerAuth } from "../auth/create-auth";
import type { AuthConfig } from "../auth/policy";
import { authJSON, getOwnerSession } from "../auth/requests";
import {
  AccessError,
  createWorkspace,
  listAudit,
  listWorkspaces,
  readWorkspace,
  renameWorkspace,
} from "./service";
export type Route = "workspace.collection" | "workspace.item" | "audit.list";
export type Trace = Readonly<{
  requestId: string;
  route: Route;
  method: string;
  status: number;
  durationMs: number;
}>;
async function body(request: Request): Promise<unknown> {
  if (
    request.headers.get("content-type")?.split(";")[0]?.trim().toLowerCase() !==
    "application/json"
  )
    throw new AccessError(400, "invalid_request");
  const reader = request.body?.getReader();
  if (!reader) throw new AccessError(400, "invalid_request");
  const chunks: Uint8Array[] = [];
  let bytes = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > 2048) {
        await reader.cancel();
        throw new AccessError(400, "invalid_request");
      }
      chunks.push(value);
    }
    try {
      return JSON.parse(Buffer.concat(chunks).toString("utf8"));
    } catch {
      throw new AccessError(400, "invalid_request");
    }
  } finally {
    reader.releaseLock();
  }
}
export async function ownedRequest(
  request: Request,
  route: Route,
  id: string | undefined,
  runtime: { auth: LedgerAuth; config: AuthConfig } | null,
  database: PrismaClient,
  log: (trace: Trace) => void = (trace) => console.info(JSON.stringify(trace)),
) {
  const requestId = randomUUID();
  const started = performance.now();
  let response: Response;
  try {
    if (!runtime)
      response = authJSON({ error: "authentication_unavailable" }, 503);
    else {
      const session = await getOwnerSession(
        runtime.auth,
        runtime.config,
        request.headers,
      );
      if (!session) throw new AccessError(401, "unauthorized");
      const actor = { ownerId: session.user.id, requestId };
      if (new URL(request.url).search)
        throw new AccessError(400, "invalid_request");
      if (request.method !== "GET") {
        if (
          request.headers.get("origin") !== runtime.config.baseURL ||
          request.headers.get("sec-fetch-site") === "cross-site"
        )
          throw new AccessError(403, "forbidden");
      }
      if (route === "workspace.collection" && request.method === "GET")
        response = authJSON(await listWorkspaces(database, actor));
      else if (route === "workspace.collection" && request.method === "POST")
        response = authJSON(
          await createWorkspace(database, actor, await body(request)),
          201,
        );
      else if (route === "workspace.item" && request.method === "GET")
        response = authJSON(await readWorkspace(database, actor, id ?? ""));
      else if (route === "workspace.item" && request.method === "PATCH")
        response = authJSON(
          await renameWorkspace(database, actor, id ?? "", await body(request)),
        );
      else if (route === "audit.list" && request.method === "GET")
        response = authJSON(await listAudit(database, actor));
      else response = authJSON({ error: "method_not_allowed" }, 405);
    }
  } catch (error) {
    response =
      error instanceof AccessError
        ? authJSON({ error: error.code }, error.status)
        : authJSON({ error: "service_unavailable" }, 503);
  }
  response.headers.set("X-Request-ID", requestId);
  // The logger sees only a fixed route key, never raw URLs, IDs, bodies or errors.
  try {
    log({
      requestId,
      route,
      method: ["GET", "POST", "PATCH"].includes(request.method)
        ? request.method
        : "OTHER",
      status: response.status,
      durationMs: Math.round(performance.now() - started),
    });
  } catch {
    /* Logging transport must not change a committed response. DB audit is atomic. */
  }
  return response;
}
