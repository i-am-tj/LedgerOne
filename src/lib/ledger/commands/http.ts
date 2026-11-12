import "server-only";
import { randomUUID } from "node:crypto";
import type { LedgerAuth } from "../../auth/create-auth";
import type { AuthConfig } from "../../auth/policy";
import { authJSON, getOwnerSession } from "../../auth/requests";
import {
  CommandError,
  idempotencyKey,
  invalid,
  parseCommand,
  readCommandBody,
  unavailable,
  uuid,
} from "./contract";
import { throwIfAborted, withinDeadline } from "./retry";
import {
  measured,
  emitMetric,
  type MetricObserver,
} from "../verification/metrics";
import type { PostExecutor } from "./executor";

export type PostTrace = Readonly<{
  command: "ledger.POST" | "ledger.REVERSE" | "ledger.CORRECT";
  requestId: string;
  status: number;
  durationMs: number;
}>;

export async function postRequest(
  request: Request,
  workspaceId: string,
  runtime: { auth: LedgerAuth; config: AuthConfig } | null,
  executor: PostExecutor | null,
  log: (trace: PostTrace) => void = (trace) =>
    console.info(JSON.stringify(trace)),
  metrics?: MetricObserver,
): Promise<Response> {
  const requestId = randomUUID();
  const started = performance.now();
  let response: Response;
  let commandName: PostTrace["command"] = "ledger.POST";
  try {
    throwIfAborted(request.signal);
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
    await measured(metrics, "http.authentication", () =>
      withinDeadline(
        authorize(),
        performance.now() + 5000,
        undefined,
        request.signal,
      ),
    );
    if (
      request.headers.get("origin") !== runtime.config.baseURL ||
      request.headers.get("sec-fetch-site") === "cross-site"
    )
      throw new CommandError(403, "forbidden");
    if (new URL(request.url).search) throw invalid();
    const workspace = uuid.safeParse(workspaceId);
    if (!workspace.success) throw new CommandError(404, "not_found");
    const key = idempotencyKey(request.headers.get("idempotency-key"));
    // Closed production exposure must not wait for an untrusted upload.
    if (!executor) throw unavailable();
    const command = parseCommand(
      await measured(metrics, "http.body", () => readCommandBody(request)),
    );
    commandName = `ledger.${command.kind}`;
    const outcome = await executor.execute(
      authorize,
      workspace.data,
      key,
      command,
      request.signal,
    );
    response = authJSON(outcome.result, outcome.replayed ? 200 : 201);
  } catch (error) {
    response =
      error instanceof CommandError
        ? authJSON({ error: error.code }, error.status)
        : authJSON({ error: "service_unavailable" }, 503);
  }
  response.headers.set("X-Request-ID", requestId);
  try {
    log({
      command: commandName,
      requestId,
      status: response.status,
      durationMs: Math.round(performance.now() - started),
    });
  } catch {
    /* Operational logging cannot change a committed result; financial audit is transactional. */
  }
  emitMetric(metrics, "http.response", performance.now() - started);
  return response;
}
