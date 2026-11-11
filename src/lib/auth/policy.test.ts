import { describe, expect, it } from "vitest";
import { isAllowedIdentity, readAuthConfig, SESSION_SECONDS } from "./policy";
const valid = {
  BETTER_AUTH_URL: "http://localhost:3000",
  BETTER_AUTH_SECRET: "unit-test-only-secret-with-over-32-characters",
  GOOGLE_CLIENT_ID: "unit-client",
  GOOGLE_CLIENT_SECRET: "unit-google-secret",
  AUTH_ALLOWED_EMAILS: " Owner@Example.test , second@example.test ",
};
describe("P1-S03 fail-closed auth policy", () => {
  it("normalizes exact emails and sets an eight-hour absolute lifetime", () => {
    expect([...readAuthConfig(valid)!.allowedEmails]).toEqual([
      "owner@example.test",
      "second@example.test",
    ]);
    expect(SESSION_SECONDS).toBe(28800);
  });
  it("supports multiple auth providers via registry adapters", () => {
    // Both Google and GitHub configured
    const multi = {
      ...valid,
      GITHUB_CLIENT_ID: "unit-github-client",
      GITHUB_CLIENT_SECRET: "unit-github-secret",
    };
    const multiConfig = readAuthConfig(multi);
    expect(multiConfig?.configuredProviders).toEqual(["google", "github"]);

    // Only GitHub configured
    const githubOnly = {
      BETTER_AUTH_URL: valid.BETTER_AUTH_URL,
      BETTER_AUTH_SECRET: valid.BETTER_AUTH_SECRET,
      AUTH_ALLOWED_EMAILS: valid.AUTH_ALLOWED_EMAILS,
      GITHUB_CLIENT_ID: "unit-github-client",
      GITHUB_CLIENT_SECRET: "unit-github-secret",
    };
    const githubConfig = readAuthConfig(githubOnly);
    expect(githubConfig?.configuredProviders).toEqual(["github"]);

    // Partial GitHub credentials do not activate GitHub adapter
    const partialGithub = {
      ...githubOnly,
      GITHUB_CLIENT_SECRET: "",
    };
    expect(readAuthConfig(partialGithub)).toBeNull();
  });
  it.each(Object.keys(valid))("requires %s", (field) =>
    expect(readAuthConfig({ ...valid, [field]: "" })).toBeNull(),
  );
  it.each(["*", "*@example.test", "owner@example.test,", "not-an-email"])(
    "rejects malformed allowlist %s",
    (AUTH_ALLOWED_EMAILS) =>
      expect(readAuthConfig({ ...valid, AUTH_ALLOWED_EMAILS })).toBeNull(),
  );
  it.each([
    "http://example.com",
    "ftp://localhost",
    "https://user:password@example.com",
    "https://example.com/auth",
    "https://example.com?query=x",
    "https://example.com/#fragment",
  ])("rejects unsafe origin %s", (BETTER_AUTH_URL) =>
    expect(readAuthConfig({ ...valid, BETTER_AUTH_URL })).toBeNull(),
  );
  it("allows HTTPS remote origins but rejects short secrets", () => {
    expect(
      readAuthConfig({
        ...valid,
        BETTER_AUTH_URL: "https://finance.example.com",
      }),
    ).not.toBeNull();
    expect(
      readAuthConfig({ ...valid, BETTER_AUTH_SECRET: "short" }),
    ).toBeNull();
  });
  it("requires verified exact identities without Gmail alias canonicalization", () => {
    const config = readAuthConfig(valid)!;
    expect(
      isAllowedIdentity(config, {
        email: "OWNER@example.test",
        emailVerified: true,
      }),
    ).toBe(true);
    for (const user of [
      { email: "owner@example.test", emailVerified: false },
      { email: "other@example.test", emailVerified: true },
      { email: "owner+alias@example.test", emailVerified: true },
      { email: null, emailVerified: true },
    ])
      expect(isAllowedIdentity(config, user)).toBe(false);
  });
});
