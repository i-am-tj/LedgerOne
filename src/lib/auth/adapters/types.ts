export type AuthProviderId = "google" | "github";

export interface AuthProviderAdapter {
  readonly id: AuthProviderId;
  readonly name: string;
  readonly authUrlOrigin: string;
  readonly callbackPath: string;

  /**
   * Checks whether the necessary environment credentials exist for this provider.
   */
  isConfigured(env: Readonly<Record<string, string | undefined>>): boolean;

  /**
   * Generates the Better Auth social provider configuration object.
   */
  getSocialProviderConfig(
    env: Readonly<Record<string, string | undefined>>,
  ): Record<string, unknown> | null;

  /**
   * Validates provider-specific user info before admission.
   * Both Google and GitHub must supply a verified email address.
   */
  validateUser(user: {
    email?: string | null;
    emailVerified?: boolean;
  }): boolean;
}
