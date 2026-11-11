# GitHub Sign-in Setup — P1-S03 (Multi-Provider Adapter)

LedgerOne uses the **Adapter Design Pattern** for authentication providers, allowing both Google and GitHub identities to authenticate against the strict fail-closed owner allowlist.

Configure this privately; never commit client secrets, session secrets, or tokens to version control.

---

## 1. Register a GitHub OAuth App

1. Go to GitHub: **Settings** → **Developer Settings** → **OAuth Apps** → **New OAuth App** (or `https://github.com/settings/applications/new`).
2. Fill out the application details:

| Field                          | Local Development                                | Hosted Production                                  |
| :----------------------------- | :----------------------------------------------- | :------------------------------------------------- |
| **Application name**           | `LedgerOne (Local)`                              | `LedgerOne`                                        |
| **Homepage URL**               | `http://localhost:3000`                          | `https://your-domain.com`                          |
| **Application description**    | Private financial workspace                      | Private financial workspace                        |
| **Authorization callback URL** | `http://localhost:3000/api/auth/callback/github` | `https://your-domain.com/api/auth/callback/github` |
| **Enable Device Flow**         | Leave unchecked                                  | Leave unchecked                                    |

3. Click **Register application**.
4. Copy the **Client ID**.
5. Under **Client secrets**, click **Generate a new client secret** and copy the secret immediately.

---

## 2. Configure Environment Variables

Edit your local development environment file (`.env.development.local`; production uses separate `.env`):

```dotenv
# Provider credentials for GitHub Adapter
GITHUB_CLIENT_ID=<your-github-client-id>
GITHUB_CLIENT_SECRET=<your-github-client-secret>

# The owner's verified primary GitHub email MUST be in AUTH_ALLOWED_EMAILS
AUTH_ALLOWED_EMAILS=your.verified.email@example.com
```

> [!IMPORTANT]
> The GitHub adapter strictly enforces email verification: `user.emailVerified === true`. In GitHub, ensure your primary email is verified under **Settings → Emails**.

---

## 3. Architecture & Adapter Design Pattern

The auth architecture uses an **Adapter Design Pattern** located in `src/lib/auth/adapters/`:

- [`types.ts`](../../src/lib/auth/adapters/types.ts): Defines the `AuthProviderAdapter` interface:
  - `id`: Provider ID (`"google" | "github"`).
  - `name`: Display name.
  - `authUrlOrigin`: Expected authorization origin (`https://accounts.google.com` vs `https://github.com`) for open-redirect defense.
  - `callbackPath`: Canonical callback URL (`/api/auth/callback/<provider>`).
  - `isConfigured(env)`: Detects if necessary client ID & secret are present.
  - `getSocialProviderConfig(config)`: Produces Better Auth provider configuration.
  - `validateUser(user)`: Checks provider email verification; central policy separately enforces the allowlist.
- [`google.ts`](../../src/lib/auth/adapters/google.ts): Concrete `GoogleAuthAdapter` implementation.
- [`github.ts`](../../src/lib/auth/adapters/github.ts): Concrete `GitHubAuthAdapter` implementation.
- [`registry.ts`](../../src/lib/auth/adapters/registry.ts): `AuthAdapterRegistry` singleton managing provider resolution and routing.

---

## 5. Verification Checklist

- [ ] Sign in with the allowlisted GitHub identity -> Redirected to `/home`.
- [ ] Attempt sign-in with an uninvited GitHub account -> Denied and redirected to `/login?error=signin`.
- [ ] Attempt sign-in with an unverified GitHub email -> Denied before session creation.
- [ ] Signing out terminates the session database record immediately.

Setup is deferred at the user’s request. Authorization initiation is tested; full GitHub callback/live acceptance is not verified. Other displayed authentication methods are previews. See [adapter review](../security/AUTH_ADAPTER_REVIEW.md).
