import { createHash, randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createAuth } from "../../src/lib/auth/create-auth";
import {
  getOwnerSession,
  handleAuthRequest,
} from "../../src/lib/auth/requests";
import { SESSION_SECONDS, type AuthConfig } from "../../src/lib/auth/policy";
import { testDatabase } from "../support/database";

const database = testDatabase();
const suffix = randomUUID();
const email = `owner-${suffix}@ledgerone.test`;
const config: AuthConfig = {
  baseURL: "https://auth-integration.example.test",
  secret: randomUUID() + randomUUID(),
  googleClientId: "integration-google-client",
  googleClientSecret: "integration-google-secret",
  githubClientId: "integration-github-client",
  githubClientSecret: "integration-github-secret",
  configuredProviders: ["google", "github"],
  allowedEmails: new Set([email]),
};
const auth = createAuth(config, database);
let profile = {
  id: `google-${suffix}`,
  name: "Test owner",
  email,
  emailVerified: true,
  image: null as string | null,
};
let expectedChallenge = "";
const exchangedCodes: string[] = [];
const countTestSessions = () =>
  database.authSession.count({
    where: {
      user: { email: { in: [email, `stranger-${suffix}@ledgerone.test`] } },
    },
  });
function cookies(response: Response): string {
  return response.headers
    .getSetCookie()
    .filter((value) => !value.includes("Max-Age=0"))
    .map((value) => value.split(";")[0])
    .join("; ");
}
function request(path: string, options: RequestInit = {}) {
  return new Request(config.baseURL + path, options);
}
function post(path: string, body: object, cookie = "") {
  return request(path, {
    method: "POST",
    headers: {
      origin: config.baseURL,
      "content-type": "application/json",
      cookie,
    },
    body: JSON.stringify(body),
  });
}
async function start() {
  const response = await handleAuthRequest(
    post("/api/auth/sign-in/social", { provider: "google" }),
    auth,
    config,
  );
  expect(response.status).toBe(200);
  const url = new URL((await response.json()).url);
  expectedChallenge = url.searchParams.get("code_challenge")!;
  expect(url.origin).toBe("https://accounts.google.com");
  expect(new Set(url.searchParams.get("scope")?.split(" "))).toEqual(
    new Set(["openid", "email", "profile"]),
  );
  expect(url.searchParams.get("access_type")).toBe("online");
  expect(url.searchParams.get("include_granted_scopes")).not.toBe("true");
  expect(url.searchParams.get("code_challenge_method")).toBe("S256");
  expect(url.searchParams.get("redirect_uri")).toBe(
    config.baseURL + "/api/auth/callback/google",
  );
  return { state: url.searchParams.get("state")!, cookie: cookies(response) };
}
async function finish(state: string, cookie: string, code = randomUUID()) {
  return handleAuthRequest(
    request(
      `/api/auth/callback/google?state=${encodeURIComponent(state)}&code=${code}`,
      { headers: { cookie } },
    ),
    auth,
    config,
  );
}
beforeAll(async () => {
  // Replace only the external provider exchange inside this test's auth instance.
  // Production has no mock provider, credential endpoint or test-mode switch.
  const context = await auth.$context;
  const google = context.socialProviders.find(
    (provider) => provider.id === "google",
  )!;
  google.validateAuthorizationCode = async ({ code, codeVerifier }) => {
    expect(codeVerifier).toBeTruthy();
    expect(createHash("sha256").update(codeVerifier!).digest("base64url")).toBe(
      expectedChallenge,
    );
    if (exchangedCodes.includes(code)) throw new Error("Code already used");
    exchangedCodes.push(code);
    return {
      accessToken: "mock-google-access-token",
      refreshToken: "mock-google-refresh-token",
      accessTokenExpiresAt: new Date(Date.now() + 3600000),
      scopes: ["openid", "email", "profile"],
    };
  };
  google.getUserInfo = async () => ({
    user: {
      name: profile.name,
      email: profile.email,
      emailVerified: profile.emailVerified,
      image: profile.image ?? undefined,
    },
    data: {
      sub: profile.id,
      email: profile.email,
      email_verified: profile.emailVerified,
    },
  });
  await database.authRateLimit.deleteMany(); // Dedicated test DB only; reset deterministic shared auth bucket.
});
afterAll(async () => {
  await database.user.deleteMany({
    where: { email: { in: [email, `stranger-${suffix}@ledgerone.test`] } },
  });
  await database.$disconnect();
});
describe("P1-S03 real PostgreSQL auth flow with mocked Google exchange", () => {
  it("denies an uninvited identity before creating user/account/session rows", async () => {
    profile = { ...profile, email: `stranger-${suffix}@ledgerone.test` };
    const flow = await start();
    const response = await finish(flow.state, flow.cookie);
    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toContain("/login?error=signin");
    expect(await database.user.count({ where: { email: profile.email } })).toBe(
      0,
    );
    expect(
      await database.authAccount.count({ where: { accountId: profile.id } }),
    ).toBe(0);
  });
  it("denies an unverified owner before persistence", async () => {
    profile = { ...profile, email, emailVerified: false };
    const flow = await start();
    const response = await finish(flow.state, flow.cookie);
    expect(response.headers.get("location")).toContain("error=");
    expect(await database.user.count({ where: { email } })).toBe(0);
  });
  it("rejects missing/mismatched state or state cookie without a session", async () => {
    profile = { ...profile, email, emailVerified: true };
    const flow = await start();
    const before = await countTestSessions();
    for (const [state, cookie] of [
      ["tampered", flow.cookie],
      [flow.state, ""],
    ]) {
      const response = await finish(state!, cookie!);
      expect(response.headers.get("location")).toContain("error=");
    }
    expect(await countTestSessions()).toBe(before);
  });
  it("signs in the allowed owner, encrypts tokens, fixes expiry and revokes on logout", async () => {
    const flow = await start();
    const response = await finish(flow.state, flow.cookie);
    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toBe(config.baseURL + "/");
    const sessionCookie = response.headers
      .getSetCookie()
      .find((value) => value.startsWith("__Secure-ledgerone.session_token="))!;
    expect(sessionCookie).toContain("HttpOnly");
    expect(sessionCookie).toContain("Secure");
    expect(sessionCookie).toContain("SameSite=Lax");
    const owner = await database.user.findUniqueOrThrow({ where: { email } });
    const row = await database.authSession.findFirstOrThrow({
      where: { userId: owner.id },
    });
    expect(
      Math.round((row.expiresAt.getTime() - row.createdAt.getTime()) / 1000),
    ).toBe(SESSION_SECONDS);
    expect(row.ipAddress).toBeNull();
    expect(row.userAgent).toBeNull();
    const account = await database.authAccount.findFirstOrThrow({
      where: { userId: owner.id },
    });
    expect(account.accessToken).not.toBe("mock-google-access-token");
    expect(account.refreshToken).not.toBe("mock-google-refresh-token");
    const headers = new Headers({ cookie: cookies(response) });
    const session = await getOwnerSession(auth, config, headers);
    expect(session?.user.id).toBe(owner.id);
    expect(session).not.toHaveProperty("token");
    expect(
      (
        await database.authSession.findUniqueOrThrow({
          where: { id: row.id },
        })
      ).expiresAt,
    ).toEqual(row.expiresAt);
    const replay = await finish(flow.state, flow.cookie);
    expect(replay.headers.get("location")).toContain("error=");
    const logout = await handleAuthRequest(
      post("/api/auth/sign-out", {}, cookies(response)),
      auth,
      config,
    );
    expect(logout.status).toBe(200);
    expect(
      await database.authSession.findUnique({ where: { id: row.id } }),
    ).toBeNull();
    expect(await getOwnerSession(auth, config, headers)).toBeNull();
  });
  it("denies expired, revoked, forged and removed-from-allowlist sessions immediately", async () => {
    const flow = await start();
    const response = await finish(flow.state, flow.cookie);
    const headers = new Headers({ cookie: cookies(response) });
    expect(
      await getOwnerSession(
        auth,
        { ...config, allowedEmails: new Set() },
        headers,
      ),
    ).toBeNull();
    expect(
      await getOwnerSession(
        auth,
        config,
        new Headers({ cookie: "__Secure-ledgerone.session_token=forged" }),
      ),
    ).toBeNull();
    const owner = await database.user.findUniqueOrThrow({ where: { email } });
    await database.authSession.updateMany({
      where: { userId: owner.id },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });
    expect(await getOwnerSession(auth, config, headers)).toBeNull();
  });
  it("revalidates the fresh provider identity for returning sign-in", async () => {
    profile = { ...profile, email: `stranger-${suffix}@ledgerone.test` };
    const flow = await start();
    const before = await countTestSessions();
    const response = await finish(flow.state, flow.cookie);
    expect(response.headers.get("location")).toContain("/login?error=signin");
    expect(await countTestSessions()).toBe(before);
    expect(
      (await database.user.findUniqueOrThrow({ where: { email } })).email,
    ).toBe(email);
  });
  it("rate-limits the installation even when clients spoof IP headers", async () => {
    await database.authRateLimit.deleteMany();
    const statuses: number[] = [];
    for (let attempt = 0; attempt < 11; attempt++) {
      const req = post("/api/auth/sign-in/social", { provider: "google" });
      req.headers.set("x-ledgerone-auth-bucket", `spoofed-${attempt}`);
      req.headers.set("x-forwarded-for", `192.0.2.${attempt}`);
      statuses.push((await handleAuthRequest(req, auth, config)).status);
    }
    expect(statuses.filter((status) => status === 200)).toHaveLength(10);
    expect(statuses.at(-1)).toBe(429);
    await database.authRateLimit.deleteMany();
  });
  it("initiates GitHub OAuth flow via adapter with canonical callback", async () => {
    const response = await handleAuthRequest(
      post("/api/auth/sign-in/social", { provider: "github" }),
      auth,
      config,
    );
    expect(response.status).toBe(200);
    const url = new URL((await response.json()).url);
    expect(url.origin).toBe("https://github.com");
    expect(url.searchParams.get("client_id")).toBe("integration-github-client");
    expect(url.searchParams.get("redirect_uri")).toBe(
      config.baseURL + "/api/auth/callback/github",
    );
    expect(url.searchParams.get("state")).toBeTruthy();
  });
  it("rejects unconfigured providers even if known to schema", async () => {
    const unconfiguredConfig: AuthConfig = {
      ...config,
      configuredProviders: ["google"],
    };
    const response = await handleAuthRequest(
      post("/api/auth/sign-in/social", { provider: "github" }),
      auth,
      unconfiguredConfig,
    );
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "invalid_request" });
  });
});
