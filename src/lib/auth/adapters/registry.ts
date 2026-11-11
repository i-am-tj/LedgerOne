import type { AuthProviderAdapter, AuthProviderId } from "./types";
import { GoogleAuthAdapter } from "./google";
import { GitHubAuthAdapter } from "./github";

export class AuthAdapterRegistry {
  private readonly adapters = new Map<AuthProviderId, AuthProviderAdapter>();

  register(adapter: AuthProviderAdapter): this {
    this.adapters.set(adapter.id, adapter);
    return this;
  }

  get(id: string | undefined): AuthProviderAdapter | undefined {
    if (!id) return undefined;
    return this.adapters.get(id as AuthProviderId);
  }

  getAll(): AuthProviderAdapter[] {
    return Array.from(this.adapters.values());
  }

  getConfigured(
    env: Readonly<Record<string, string | undefined>>,
  ): AuthProviderAdapter[] {
    return this.getAll().filter((adapter) => adapter.isConfigured(env));
  }

  isCallbackPath(path: string): boolean {
    return this.getAll().some((adapter) => adapter.callbackPath === path);
  }

  getCallbackAdapter(path: string): AuthProviderAdapter | undefined {
    return this.getAll().find((adapter) => adapter.callbackPath === path);
  }
}

export function createDefaultAuthRegistry(): AuthAdapterRegistry {
  return new AuthAdapterRegistry()
    .register(new GoogleAuthAdapter())
    .register(new GitHubAuthAdapter());
}

export const defaultAuthRegistry = createDefaultAuthRegistry();
