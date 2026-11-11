import "server-only";
import { betterAuth } from "better-auth";
import { APIError } from "better-auth/api";
import { prismaAdapter } from "@better-auth/prisma-adapter";
import type { PrismaClient } from "../../generated/prisma/client";
import {
  isAllowedIdentity,
  normalizeEmail,
  SESSION_SECONDS,
  type AuthConfig,
} from "./policy";

// No test provider, credential login, auth bypass, or environment-specific admission path.
export function createAuth(config: AuthConfig, database: PrismaClient) {
  return betterAuth({
    appName: "LedgerOne",
    baseURL: config.baseURL,
    secret: config.secret,
    trustedOrigins: [config.baseURL],
    database: prismaAdapter(database, {
      provider: "postgresql",
      transaction: true,
    }),
    emailAndPassword: { enabled: false },
    socialProviders: {
      google: {
        clientId: config.googleClientId,
        clientSecret: config.googleClientSecret,
        prompt: "select_account",
        accessType: "online",
        includeGrantedScopes: false,
        requireEmailVerification: true,
      },
    },
    user: {
      validateUserInfo: ({ user, source }) => {
        if (
          source.oauth?.providerId !== "google" ||
          !isAllowedIdentity(config, user)
        ) {
          return {
            error: "access_denied",
            errorDescription: "Sign-in is not available for this identity.",
          };
        }
      },
      changeEmail: { enabled: false },
      deleteUser: { enabled: false },
    },
    session: {
      modelName: "authSession",
      expiresIn: SESSION_SECONDS,
      disableSessionRefresh: true,
      cookieCache: { enabled: false },
    },
    account: {
      modelName: "authAccount",
      encryptOAuthTokens: true,
      accountLinking: { enabled: false },
      storeAccountCookie: false,
      storeStateStrategy: "database",
    },
    verification: { modelName: "authVerification" },
    rateLimit: {
      enabled: true,
      storage: "database",
      modelName: "authRateLimit",
      window: 60,
      max: 30,
      customRules: { "/sign-in/social": { window: 60, max: 10 } },
    },
    advanced: {
      cookiePrefix: "ledgerone",
      useSecureCookies: new URL(config.baseURL).protocol === "https:",
      defaultCookieAttributes: { httpOnly: true, sameSite: "lax", path: "/" },
      ipAddress: { ipAddressHeaders: ["x-ledgerone-auth-bucket"] },
    },
    databaseHooks: {
      user: {
        create: {
          before: async (user) => {
            if (!isAllowedIdentity(config, user))
              throw new APIError("FORBIDDEN", { message: "Access denied" });
            return {
              data: { ...user, email: normalizeEmail(user.email), image: null },
            };
          },
        },
      },
      session: {
        create: {
          before: async (session) => {
            const user = await database.user.findUnique({
              where: { id: session.userId },
            });
            if (!user || !isAllowedIdentity(config, user))
              throw new APIError("FORBIDDEN", { message: "Access denied" });
            return { data: { ...session, ipAddress: null, userAgent: null } };
          },
        },
      },
    },
    logger: { disabled: true },
    onAPIError: { errorURL: `${config.baseURL}/login?error=signin` },
  });
}
export type LedgerAuth = ReturnType<typeof createAuth>;
