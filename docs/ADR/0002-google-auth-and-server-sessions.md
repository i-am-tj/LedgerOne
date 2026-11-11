# ADR-002 — Multi-Provider Auth Adapter (Google & GitHub) and Database-Backed Sessions

Date: 2026-11-11. Story: P1-S03. Status: IMPLEMENTED LOCALLY, LIVE GOOGLE OWNER SIGN-IN PREVIOUSLY VERIFIED; LOCAL GOOGLE/GITHUB ADAPTER EXTENSION; EXPANDED REVIEW PENDING; MERGE PENDING. This is a reviewable decision record, not evidence of an independent security review or merged PR.

## Choice and rationale

Use pinned Better Auth 1.7.20 with its matching PostgreSQL/Prisma adapter as the supported alternative allowed by Prompt 0. The [Auth.js maintenance announcement](https://better-auth.com/blog/authjs-joins-better-auth) recommends Better Auth for new projects. Its [Prisma documentation](https://better-auth.com/docs/adapters/prisma) supports Prisma 7, matching this repository. Authentication protocol/cryptography remains in the library; the application adds its admission and route policies. This supersedes ADR-001's provisional Auth.js candidate only; financial architecture is unchanged.

Authentication architecture was extended via the **Adapter Design Pattern** (`src/lib/auth/adapters/`) to support both Google and GitHub OAuth providers:

- `AuthProviderAdapter` defines a unified interface for provider registration, dynamic callback path validation, and security validation hooks.
- `GoogleAuthAdapter` supplies Google settings; Better Auth implements OAuth/PKCE, and the client separately checks the authorization origin.
- `GitHubAuthAdapter` supplies GitHub settings and requires verified provider email; the client separately checks the authorization origin.
- `AuthAdapterRegistry` dynamically discovers and validates configured providers based on active environment credentials. At least one valid provider must be configured.

The user supplied the Google/GitHub adapter and modern card changes, requested a review and logical commits, and explicitly chose to keep the new card active while deferring additional provider setup. GitHub completion/live sign-in has not been verified. See `docs/security/AUTH_ADAPTER_REVIEW.md` for extension gaps and UI previews. See `docs/setup/GOOGLE_AUTH.md` and `docs/setup/GITHUB_AUTH.md`.

## Policy

- Supported authorization-code flows (Google and GitHub) only, using library state, cookie binding, provider-supported PKCE, and provider validation. Direct client ID-token admission, credential signup, account linking, profile/email updates, deletion and token-retrieval endpoints are not exposed.
- The high-level `validateUserInfo` hook delegates to the matching adapter from the registry, requiring a verified email (`emailVerified === true`) and an exact normalized allowlist match against `AUTH_ALLOWED_EMAILS` before identity persistence and on each returning provider sign-in. A create-user hook repeats admission and stores a lowercase address with no profile image. There are no wildcard/domain grants, implicit aliases or inferred owner identities.
- `User` is the future authorization identity; `AuthAccount` stores provider bindings and is deliberately distinct from future financial `Account`. `(providerId, accountId)` and email uniqueness are enforced. Prisma adapter transactions are enabled.
- Server sessions have a fixed eight-hour expiry, refresh disabled, cookie caching disabled, no stateless/JWT fallback. Each private page and its workspace layout use the server guard; each API must independently authorize. Workspace rendering is explicitly dynamic to avoid build-time cached redirects/session state. S04 must add entity ownership and audit; login alone does not implement either.
- `getOwnerSession` obtains the database session and rechecks expiry, verified email and the current process's allowlist. Restart after allowlist edits. Database revocation takes effect at the next request; logout deletes the session and expires its cookie. Client navigation to login is a full navigation, clearing the app router's current client cache. No persistent client session DTO cache is used.
- Cookies are signed, HttpOnly, SameSite=Lax, host-only and path `/`. HTTPS origins use Secure cookies and the secure prefix. Plain HTTP is accepted only for loopback local development/production-build testing; remote origins require HTTPS. Local browser origin must match `BETTER_AUTH_URL`; login redirects to the configured canonical host.
- The session token is the library's random opaque database token, not a financial/API key. Better Auth stores it in its session table; the browser cookie additionally requires the app-secret signature. The raw token is never returned through the exposed session DTO. Protect DB/backup access as credential access. Provider access/refresh/ID tokens are encrypted by Better Auth using the application secret; no provider-account cookie is enabled.
- Auth POSTs require exact Origin, reject cross-site Fetch Metadata, accept JSON only, bound streamed bodies to 2 KiB and enforce a strict command schema. Callback destinations are fixed; callback failures redirect to a generic login error without provider details. Google callback GET is exempt from POST origin checks and protected by the OAuth state/PKCE machinery.
- Rate limiting is enabled with database storage: 30/minute general and 10/minute sign-in. The route sets a private synthetic IP header to one installation-wide bucket, overriding spoofed client/proxy headers. Tests exercise sequential enforcement across changing forged headers; strict concurrent limiter guarantees are not claimed. The session hook removes IP/user-agent tracking fields before persistence.
- Public health responses remain minimal. `/api/session` is the only exposed session read, returning ID/name/email/expiry, with private/no-store and Vary: Cookie. Better Auth's raw get-session endpoint and account/token APIs are not mounted. No private response contains session/provider token material.
- Missing/invalid config or database failures deny access, never fall back to a demo identity. Public login provides a generic unavailable/error state. Library raw logging is disabled; Next dev auth request URLs, server-function arguments and browser forwarding are suppressed to avoid credential/code logging. Sanitized request tracing and audit are S04 work, not asserted here.

## Threats and evidence

| Threat                                           | Control                                                                         | Local evidence                                                                                      |
| ------------------------------------------------ | ------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| Uninvited/unverified identity                    | Admission before persistence, repeated session hook                             | PostgreSQL auth integration; zero rejected user/account rows                                        |
| Returning Google identity changes                | Fresh provider claims validated again                                           | Returning-sign-in integration case                                                                  |
| CSRF / cross-origin logout                       | Strict Origin/Fetch Metadata plus library protections                           | Unit negatives; browser rejection leaves owner session usable                                       |
| OAuth state/code replay                          | Library state/cookie/PKCE                                                       | Mock-exchange integration checks verifier/challenge, missing/mismatched state/cookie and replay     |
| Forged, expired or revoked session               | Signed cookie + DB lookup + current policy, no cookie cache                     | Integration and real server browser tests                                                           |
| Hidden auth/token API                            | Explicit finite route allowlist                                                 | Unit/browser unknown-path rejection                                                                 |
| Open redirect / extra scopes / ID-token shortcut | Strict input and fixed callbacks                                                | Unit rejection tests                                                                                |
| Secret leakage                                   | Server-only imports, minimal DTO, encrypted provider tokens, sanitized failures | Build boundary, response/persistence/browser assertions                                             |
| Shared-browser logout history                    | Cookie revocation and full navigation                                           | Chromium desktop/mobile back-navigation test                                                        |
| Test authentication shipped                      | No runtime test provider/flag/endpoint                                          | Tests only mutate an in-process test auth instance or seed isolated DB; application paths unchanged |

## Recovery and deployment constraints

Migration `202611110002_identity` is additive and advances the platform marker to 2. It was applied to local development and a fresh dedicated test database. Keep tables and forward-repair errors rather than dropping users or editing migration history. If auth has to be disabled, keep private routes closed; reverting to a public shell after private data exists is not a safe rollback. Before any production release, backup/key custody and restore remain required under the original roadmap.

Changing `BETTER_AUTH_SECRET` invalidates existing signed cookies and prevents reading credentials encrypted under the old key unless a deliberate library-supported key rotation is configured. For this single-key initial setup, revoke sessions and require Google reauthentication under a reviewed recovery plan; keep the original secret in approved secure backup until retained encrypted records no longer require it. No rotation was executed here. Password authentication, email changes, public registration and deleting users are disabled.

Automatic expiry denial is implemented; a scheduled purge/retention policy for expired session/state/rate-limit records and sanitized audit history is not. These records remain in the local database until the reviewed maintenance/privacy work. No public deployment or real provider login is approved by automated tests. Security review, real Google consent/callback acceptance, remote CI/review and entity isolation remain explicit outstanding work.

## Technical review checkpoint

Agent-owned technical review is recorded in `docs/security/S03_REVIEW.md` (533003d), with no blocker for continued local development and explicit release prerequisites. This is not an independent external audit or reviewed remote merge. P1-S04 subsequently implements current-resource ownership/audit; actual financial entity isolation still requires S05–S08 evidence.
