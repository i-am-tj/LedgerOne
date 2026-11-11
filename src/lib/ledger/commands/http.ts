import "server-only";
import { randomUUID } from "node:crypto";
import type { LedgerAuth } from "../../auth/create-auth";
import type { AuthConfig } from "../../auth/policy";
import { authJSON, getOwnerSession } from "../../auth/requests";
import {
  CommandError,
  idempotencyKey,
  invalid,
  parsePost,
  readCommandBody,
  unavailable,
  uuid,
} from "./contract";
import type { PostExecutor } from "./executor";

export async function postRequest(
  request: Request,
  workspaceId: string,
  runtime: { auth: LedgerAuth; config: AuthConfig } | null,
  executor: PostExecutor | null,
): Promise<Response> {
  const requestId = randomUUID();
  let response: Response;
  try {
    if (request.method !== "POST")
      throw new CommandError(405, "method_not_allowed");
    if (!runtime) throw unavailable();
    const authorize = async () => {
      const session = await getOwnerSession(
        runtime.auth,
        runtime.config,
        request.headers,
      );
      if (!session) throw new CommandError(401, "unauthorized");
      return { ownerId: session.user.id, requestId };
    };
    await authorize();
    if (
      request.headers.get("origin") !== runtime.config.baseURL ||
      request.headers.get("sec-fetch-site") === "cross-site"
    )
      throw new CommandError(403, "forbidden");
    if (new URL(request.url).search) throw invalid();
    const workspace = uuid.safeParse(workspaceId);
    if (!workspace.success) throw new CommandError(404, "not_found");
    const key = idempotencyKey(request.headers.get("idempotency-key"));
    const command = parsePost(await readCommandBody(request));
    if (!executor) throw unavailable();
    const outcome = await executor.post(
      authorize,
      workspace.data,
      key,
      command,
    );
    response = authJSON(outcome.result, outcome.replayed ? 200 : 201);
  } catch (error) {
    response =
      error instanceof CommandError
        ? authJSON({ error: error.code }, error.status)
        : authJSON({ error: "service_unavailable" }, 503);
  }
  response.headers.set("X-Request-ID", requestId);
  return response;
}
