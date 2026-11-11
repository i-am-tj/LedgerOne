import type { AuthProviderAdapter } from "./types";

export class GoogleAuthAdapter implements AuthProviderAdapter {
  readonly id = "google" as const;
  readonly name = "Google";
  readonly authUrlOrigin = "https://accounts.google.com";
  readonly callbackPath = "/api/auth/callback/google";

  isConfigured(env: Readonly<Record<string, string | undefined>>): boolean {
    return Boolean(
      env.GOOGLE_CLIENT_ID?.trim() && env.GOOGLE_CLIENT_SECRET?.trim(),
    );
  }

  getSocialProviderConfig(
    env: Readonly<Record<string, string | undefined>>,
  ): Record<string, unknown> | null {
    const clientId = env.GOOGLE_CLIENT_ID?.trim();
    const clientSecret = env.GOOGLE_CLIENT_SECRET?.trim();
    if (!clientId || !clientSecret) return null;

    return {
      clientId,
      clientSecret,
      prompt: "select_account",
      accessType: "online",
      includeGrantedScopes: false,
      requireEmailVerification: true,
    };
  }

  validateUser(user: {
    email?: string | null;
    emailVerified?: boolean;
  }): boolean {
    return user.emailVerified === true && typeof user.email === "string";
  }
}
