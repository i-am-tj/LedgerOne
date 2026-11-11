# Google sign-in setup — P1-S03

Application code and automated auth tests are implemented. User-assisted live owner Google sign-in is verified; remaining manual checks and security review are recorded below. Configure this privately; never paste a client secret, session secret or cookie into chat, an issue, a screenshot or source control.

## 1. Create the Google OAuth web client

In Google Cloud / Google Auth Platform, create an OAuth client of type **Web application**. The client name can be `ledger-one-oauth`.

| Console field                           | Local value                                      |
| --------------------------------------- | ------------------------------------------------ |
| Authorized JavaScript origins           | `http://localhost:3000`                          |
| Authorized redirect URIs                | `http://localhost:3000/api/auth/callback/google` |
| Use this client for an AI-powered agent | Leave unchecked                                  |

The redirect URI is required by the server callback flow. The JavaScript origin is safe to register for this local application; the code does not use browser One Tap or a Google JavaScript SDK. Register the exact scheme, hostname, port and callback path. An origin has no path; a redirect URI includes the callback path. Do not use a wildcard or the Auth.js-style `/api/auth/callback` path without `/google`.

Configure the consent screen's required app/contact fields. If the app uses External audience in Testing mode, add the same Google account as a Test user under Audience. LedgerOne requests only the Google identity scopes `openid`, `email`, `profile`; no bank, Gmail, Calendar, Drive or billing API is needed for this feature. No paid service or public release is part of these steps.

Use the created Client ID and Client Secret directly in the environment file; a downloaded client JSON file is not required. If you download one, keep it outside the repository.

## 2. Fill the project-root environment file

Folder: `<project-root>`

File to edit: `<project-root>/.env`

Template tracked in Git: `<project-root>/.env.example`

The local `.env` has slots for:

```dotenv
BETTER_AUTH_URL=http://localhost:3000
BETTER_AUTH_SECRET=<locally generated random secret; keep the existing generated value>
GOOGLE_CLIENT_ID=<web client ID from Google>
GOOGLE_CLIENT_SECRET=<web client secret from Google>
AUTH_ALLOWED_EMAILS=<your exact verified Google email>
```

Replace the three owner/client placeholders with your values; do not put literal angle-bracket placeholders in `.env`. The app secret is separate from the Google client secret. A random application secret was generated locally only if missing; it is not printed or committed. To generate a replacement yourself, use `openssl rand -base64 48` and paste the result privately into the file. Rotating it invalidates existing signed session cookies and affects encrypted provider credentials; see ADR-002 before rotating a configured installation.

`AUTH_ALLOWED_EMAILS` accepts comma-separated exact addresses. Matching is case-insensitive after trimming; there are no wildcard/domain grants or Gmail alias/dot rewrites. Keep the approved list limited to intended owners. Changing the allowlist requires a server restart; a removed identity is denied on the next server session check after restart, without a cookie-cache grace period.

Preserve existing `DATABASE_URL`, PostgreSQL and `TEST_DATABASE_URL` values. `.env` is ignored by Git. Do not copy secrets into `.env.example`, and do not overwrite a configured `.env` with the blank template.

## 3. Run migrations and restart development

From the project folder:

```sh
npm run db:up
npm run db:generate
npm run db:migrate
npm run dev -- --port 3000
```

If a server is already running, stop it with Ctrl+C in its terminal before starting another. Open **http://localhost:3000/login**. The dev server already running during implementation may reload environment changes, but restart explicitly after configuring auth to eliminate stale configuration.

Use the canonical hostname in `BETTER_AUTH_URL`. Do not start an OAuth flow at `127.0.0.1` while registering `localhost`: state cookies are host-bound. When configured, LedgerOne redirects login visits to the canonical configured host.

## 4. Live Google acceptance checklist

These checks remain pending until the real client is configured:

- [x] Sign in from localhost:3000 with the allowlisted verified Google account; return to Overview. Verified in Chrome and DB metadata on 2026-11-11.
- [ ] Open Appearance and Component library while signed in.
- [ ] Verify `/api/session` returns only the current user's ID/name/email and expiry, never session/provider tokens.
- [ ] Sign out using the sidebar/mobile navigation; private pages then redirect to login and `/api/session` returns 401.
- [ ] In an incognito window, direct visits to private pages redirect to login.
- [ ] A Google identity outside the allowlist is denied without creating a local user/account/session. Google test-user restrictions may reject that identity before LedgerOne; that alone does not verify LedgerOne's allowlist.
- [ ] Record the live result without copying credentials, OAuth codes, state values, cookies or token material into evidence.

Expected failures: `redirect_uri_mismatch` means the registered redirect does not exactly match; unavailable sign-in means required environment values are absent/invalid; generic callback failure can indicate an unapproved/unverified account, expired state, incorrect credentials or provider outage. Restart after editing environment values. Do not disable origin/state checks to work around configuration errors.

## Implementation files

- `src/app/login/page.tsx`: public login UI and canonical-host handling.
- `src/app/api/auth/[...all]/route.ts`: exposed auth route mount; `/api/auth/callback/google` resolves here.
- `src/lib/auth/create-auth.ts`: Google-only provider, admission hooks, database sessions/cookies and rate limits.
- `src/lib/auth/policy.ts`: environment validation, allowlist and expiry policy.
- `src/lib/auth/requests.ts`: restricted endpoints, origin/body validation and minimal session DTO.
- `src/lib/auth/server.ts`: server-only runtime and page session guard.
- `src/app/(workspace)/layout.tsx`: dynamic authenticated workspace layout; each private page also verifies its session.
- `prisma/migrations/202611110002_identity/migration.sql`: additive identity migration.

## Automated tests without real Google credentials

Use a dedicated database named with an `_test` suffix; `TEST_DATABASE_URL` must never point to your personal-data database. Create `ledgerone_test` in local PostgreSQL with the same local development role, then set its URL privately in `.env`. The implementation environment already has this database and variable.

```sh
npm run db:migrate:test
npm run test:unit
npm run test:integration
npm run build
npm run test:e2e
```

The test-only Google exchange is mocked inside an integration-test auth instance. Browser tests seed short-lived signed sessions directly into the isolated test DB, using a random test secret passed only to their loopback server. There is no production test provider, test credential login, auth bypass flag or hidden login endpoint. These tests prove local control behavior, not a live exchange with Google's servers.

References: [Google web-server OAuth setup](https://developers.google.com/identity/protocols/oauth2/web-server#creatingcred), [Better Auth Google provider](https://better-auth.com/docs/authentication/google), [session policy ADR](../ADR/0002-google-auth-and-server-sessions.md).
