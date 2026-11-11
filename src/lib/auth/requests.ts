import "server-only";
import { z } from "zod";
import type { LedgerAuth } from "./create-auth";
import { isAllowedIdentity, type AuthConfig } from "./policy";
import { defaultAuthRegistry } from "./adapters";

export function authJSON(body: unknown, status = 200) {
  return Response.json(body, {
    status,
    headers: { "Cache-Control": "private, no-store", Vary: "Cookie" },
  });
}
export async function getOwnerSession(
  auth: LedgerAuth,
  config: AuthConfig,
  headers: Headers,
) {
  const result = await auth.api.getSession({
    headers,
    query: { disableCookieCache: true },
  });
  if (
    !result ||
    result.session.expiresAt.getTime() <= Date.now() ||
    !isAllowedIdentity(config, result.user)
  )
    return null;
  return {
    user: {
      id: result.user.id,
      email: result.user.email,
      name: result.user.name,
    },
    expiresAt: result.session.expiresAt,
  };
}
async function readSmallBody(request: Request): Promise<string | null> {
  if (!request.body) return null;
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > 2048) {
        await reader.cancel();
        return null;
      }
      chunks.push(value);
    }
    return Buffer.concat(chunks).toString("utf8");
  } finally {
    reader.releaseLock();
  }
}
const signInInput = z
  .object({
    provider: z.enum(["google", "github"]),
    callbackURL: z.literal("/home").optional(),
    errorCallbackURL: z.literal("/login?error=signin").optional(),
  })
  .strict();
export async function handleAuthRequest(
  request: Request,
  auth: LedgerAuth,
  config: AuthConfig,
) {
  const path = new URL(request.url).pathname;
  const isCallback =
    request.method === "GET" && defaultAuthRegistry.isCallbackPath(path);
  const isSignIn =
    request.method === "POST" && path === "/api/auth/sign-in/social";
  const isSignOut = request.method === "POST" && path === "/api/auth/sign-out";
  if (!isCallback && !isSignIn && !isSignOut)
    return authJSON({ error: "not_found" }, 404);
  if (request.method === "POST") {
    if (
      request.headers.get("origin") !== config.baseURL ||
      request.headers.get("sec-fetch-site") === "cross-site"
    )
      return authJSON({ error: "forbidden" }, 403);
    if (
      request.headers
        .get("content-type")
        ?.split(";")[0]
        ?.trim()
        .toLowerCase() !== "application/json"
    )
      return authJSON({ error: "invalid_request" }, 400);
  }
  const headers = new Headers(request.headers);
  headers.delete("content-length");
  // One durable installation-wide rate bucket; never trust client-supplied proxy IPs.
  headers.set("x-ledgerone-auth-bucket", "127.0.0.1");
  let body: string | undefined;
  if (isSignIn || isSignOut) {
    const raw = await readSmallBody(request);
    if (raw === null) return authJSON({ error: "invalid_request" }, 400);
    try {
      if (isSignIn) {
        const input = signInInput.safeParse(JSON.parse(raw));
        if (
          !input.success ||
          !config.configuredProviders.includes(input.data.provider)
        )
          return authJSON({ error: "invalid_request" }, 400);
        body = JSON.stringify({
          ...input.data,
          callbackURL: `${config.baseURL}/home`,
          errorCallbackURL: `${config.baseURL}/login?error=signin`,
        });
      } else {
        if (!z.object({}).strict().safeParse(JSON.parse(raw)).success)
          return authJSON({ error: "invalid_request" }, 400);
        body = "{}";
      }
    } catch {
      return authJSON({ error: "invalid_request" }, 400);
    }
  }
  try {
    const response = await auth.handler(
      new Request(request.url, {
        method: request.method,
        headers,
        ...(body === undefined ? {} : { body }),
      }),
    );
    const location = response.headers.get("location");
    if (location) {
      const destination = new URL(location, config.baseURL);
      if (
        destination.origin === config.baseURL &&
        destination.pathname === "/login"
      ) {
        response.headers.set(
          "location",
          `${config.baseURL}/login?error=signin`,
        );
      }
    }
    response.headers.set("Cache-Control", "private, no-store");
    response.headers.set("Vary", "Cookie");
    return response;
  } catch {
    return authJSON({ error: "authentication_unavailable" }, 503);
  }
}
