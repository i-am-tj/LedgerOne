import { z } from "zod";
import { defaultAuthRegistry, type AuthProviderId } from "./adapters";

export const SESSION_SECONDS = 8 * 60 * 60;
export type AuthConfig = {
  baseURL: string;
  secret: string;
  googleClientId?: string;
  googleClientSecret?: string;
  githubClientId?: string;
  githubClientSecret?: string;
  configuredProviders: readonly AuthProviderId[];
  allowedEmails: ReadonlySet<string>;
};
export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}
export function readAuthConfig(
  env: Readonly<Record<string, string | undefined>>,
): AuthConfig | null {
  try {
    const base = new URL(env.BETTER_AUTH_URL ?? "");
    const loopback = ["localhost", "127.0.0.1", "[::1]"].includes(
      base.hostname,
    );
    if (
      (env.LEDGERONE_ENV === "production" ||
        (!env.LEDGERONE_ENV && env.NODE_ENV === "production")) &&
      (loopback || base.protocol !== "https:")
    )
      return null;
    if (
      base.username ||
      base.password ||
      base.search ||
      base.hash ||
      base.pathname !== "/"
    )
      return null;
    // HTTP is permitted only for local development, including local production-build tests.
    if (base.protocol !== "https:" && !(loopback && base.protocol === "http:"))
      return null;
    const secret = env.BETTER_AUTH_SECRET ?? "";
    if (secret.length < 32) return null;

    const configuredAdapters = defaultAuthRegistry.getConfigured(env);
    if (!configuredAdapters.length) return null;

    const emails = (env.AUTH_ALLOWED_EMAILS ?? "")
      .split(",")
      .map(normalizeEmail);
    if (
      !emails.length ||
      emails.some((email) => !z.email().safeParse(email).success)
    )
      return null;

    const googleClientId = env.GOOGLE_CLIENT_ID?.trim();
    const googleClientSecret = env.GOOGLE_CLIENT_SECRET?.trim();
    const githubClientId = env.GITHUB_CLIENT_ID?.trim();
    const githubClientSecret = env.GITHUB_CLIENT_SECRET?.trim();

    return {
      baseURL: base.origin,
      secret,
      googleClientId,
      googleClientSecret,
      githubClientId,
      githubClientSecret,
      configuredProviders: configuredAdapters.map((a) => a.id),
      allowedEmails: new Set(emails),
    };
  } catch {
    return null;
  }
}
export function isAllowedIdentity(
  config: Pick<AuthConfig, "allowedEmails">,
  user: { email?: string | null; emailVerified?: boolean },
): boolean {
  return (
    user.emailVerified === true &&
    typeof user.email === "string" &&
    config.allowedEmails.has(normalizeEmail(user.email))
  );
}
