import { describe, expect, it, vi } from "vitest";
import type { LedgerAuth } from "./create-auth";
import { handleAuthRequest } from "./requests";
import { readAuthConfig } from "./policy";
const config = readAuthConfig({
  BETTER_AUTH_URL: "http://localhost:3000",
  BETTER_AUTH_SECRET: "unit-test-only-secret-with-over-32-characters",
  GOOGLE_CLIENT_ID: "unit-client",
  GOOGLE_CLIENT_SECRET: "unit-secret",
  AUTH_ALLOWED_EMAILS: "owner@example.test",
})!;
describe("P1-S03 auth HTTP surface", () => {
  it.each([
    { origin: "https://evil.example", "sec-fetch-site": "same-origin" },
    { origin: "", "sec-fetch-site": "same-origin" },
    { origin: config.baseURL, "sec-fetch-site": "cross-site" },
  ])("rejects CSRF before the library runs: %j", async (headers) => {
    const handler = vi.fn();
    const result = await handleAuthRequest(
      new Request(config.baseURL + "/api/auth/sign-out", {
        method: "POST",
        headers: { "content-type": "application/json", ...headers },
        body: "{}",
      }),
      { handler } as unknown as LedgerAuth,
      config,
    );
    expect(result.status).toBe(403);
    expect(handler).not.toHaveBeenCalled();
  });
  it.each([
    "/api/auth/sign-up/email",
    "/api/auth/get-session",
    "/api/auth/link-social",
    "/api/auth/update-user",
    "/api/auth/delete-user",
    "/api/auth/get-access-token",
  ])("does not expose %s", async (path) => {
    const handler = vi.fn();
    expect(
      (
        await handleAuthRequest(
          new Request(config.baseURL + path),
          { handler } as unknown as LedgerAuth,
          config,
        )
      ).status,
    ).toBe(404);
    expect(handler).not.toHaveBeenCalled();
  });
  it.each([
    { provider: "github" },
    { provider: "google", idToken: { token: "untrusted" } },
    { provider: "google", callbackURL: "https://evil.example" },
  ])("rejects unexpected sign-in input %j", async (body) => {
    const handler = vi.fn();
    expect(
      (
        await handleAuthRequest(
          new Request(config.baseURL + "/api/auth/sign-in/social", {
            method: "POST",
            headers: {
              origin: config.baseURL,
              "content-type": "application/json",
            },
            body: JSON.stringify(body),
          }),
          { handler } as unknown as LedgerAuth,
          config,
        )
      ).status,
    ).toBe(400);
    expect(handler).not.toHaveBeenCalled();
  });
  it("bounds the streamed body and rejects GET logout", async () => {
    const handler = vi.fn();
    const auth = { handler } as unknown as LedgerAuth;
    expect(
      (
        await handleAuthRequest(
          new Request(config.baseURL + "/api/auth/sign-in/social", {
            method: "POST",
            headers: {
              origin: config.baseURL,
              "content-type": "application/json",
            },
            body: "x".repeat(2049),
          }),
          auth,
          config,
        )
      ).status,
    ).toBe(400);
    expect(
      (
        await handleAuthRequest(
          new Request(config.baseURL + "/api/auth/sign-out"),
          auth,
          config,
        )
      ).status,
    ).toBe(404);
    expect(handler).not.toHaveBeenCalled();
  });
  it("overrides spoofed rate headers, fixes callbacks and prevents caching", async () => {
    const handler = vi.fn(async (request: Request) => {
      expect(request.headers.get("x-ledgerone-auth-bucket")).toBe("127.0.0.1");
      expect((await request.json()).callbackURL).toBe(config.baseURL + "/home");
      return Response.json({ url: "https://accounts.google.com" });
    });
    const result = await handleAuthRequest(
      new Request(config.baseURL + "/api/auth/sign-in/social", {
        method: "POST",
        headers: {
          origin: config.baseURL,
          "content-type": "application/json",
          "x-ledgerone-auth-bucket": "spoofed",
        },
        body: JSON.stringify({ provider: "google" }),
      }),
      { handler } as unknown as LedgerAuth,
      config,
    );
    expect(result.headers.get("cache-control")).toContain("no-store");
  });
});
