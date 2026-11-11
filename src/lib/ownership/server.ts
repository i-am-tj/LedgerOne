import "server-only";
import { randomUUID } from "node:crypto";
import { getDatabase } from "../database";
import { getAuthRuntime } from "../auth/server";
import { authJSON } from "../auth/requests";
import { ownedRequest, type Route } from "./http";
export async function serveOwned(request: Request, route: Route, id?: string) {
  try {
    return await ownedRequest(
      request,
      route,
      id,
      getAuthRuntime(),
      getDatabase(),
    );
  } catch {
    const response = authJSON({ error: "service_unavailable" }, 503);
    response.headers.set("X-Request-ID", randomUUID());
    return response;
  }
}
