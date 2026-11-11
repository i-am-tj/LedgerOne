import type { AuthProviderAdapter } from "./types";

export class GitHubAuthAdapter implements AuthProviderAdapter {
  readonly id = "github" as const;
  readonly name = "GitHub";
  readonly authUrlOrigin = "https://github.com";
  readonly callbackPath = "/api/auth/callback/github";

  isConfigured(env: Readonly<Record<string, string | undefined>>): boolean {
    return Boolean(
      env.GITHUB_CLIENT_ID?.trim() && env.GITHUB_CLIENT_SECRET?.trim(),
    );
  }

  getSocialProviderConfig(
    env: Readonly<Record<string, string | undefined>>,
  ): Record<string, unknown> | null {
    const clientId = env.GITHUB_CLIENT_ID?.trim();
    const clientSecret = env.GITHUB_CLIENT_SECRET?.trim();
    if (!clientId || !clientSecret) return null;

    return {
      clientId,
      clientSecret,
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
