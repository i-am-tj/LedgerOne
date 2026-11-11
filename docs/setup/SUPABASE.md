# Supabase production preparation — P1-S04A

The user created LedgerOne on the Free organization, Mumbai (`ap-south-1`), and selected `i-am-tj/LedgerOne` in the GitHub picker. The dashboard confirms an enabled GitHub integration with **Deploy to production off** and automatic branching off/unavailable on the current plan. No upgrade, public application deployment, production migration or hosted database connection test has been performed. Application hosting/domain is not set up.

## Files and profiles

Project folder: `<project-root>`.

| File                                     | Purpose                                                                                                                                                                                                                                                     |
| ---------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `.env`                                   | Ignored production configuration. Actual project reference is filled locally; separate application secret generated privately. Database URLs, production Google credentials, owner list and application HTTPS origin remain blank until supplied privately. |
| `.env.example`                           | Tracked production template with blank required values; no dummy hosted credentials.                                                                                                                                                                        |
| `.env.development.local`                 | Ignored local development configuration; existing working local Google credentials, session secret and local DB settings were preserved here.                                                                                                               |
| `.env.development.example`               | Tracked dummy loopback DB settings. Google credentials are optional for public-preview development; sign-in stays disabled without valid configuration.                                                                                                     |
| `docs/setup/supabase-bootstrap.sql`      | Reviewable role/private-schema provisioning, before migrations. Does not include passwords.                                                                                                                                                                 |
| `docs/setup/supabase-runtime-grants.sql` | Explicit runtime grants after migrations; no DDL/TRUNCATE or migration-history access.                                                                                                                                                                      |

Keep both private files mode 0600 and out of Git. Do not use `.env.local` or extra `.env.production*` overrides: they can defeat the intended separation through Next's load order. Deployment hosts should receive private server environment variables through their secret manager, not a committed/uploaded environment file. Never prefix DB, OAuth or session secrets with `NEXT_PUBLIC_`.

`npm run dev` uses Next's development profile. CLI tooling explicitly loads only `.env.development.local`, never production `.env`, for development/tests. `npm run start:local` serves a built app with local credentials on loopback; `npm run start` is the actual production-profile command. Builds can render the static public dashboard with production DB/OAuth slots unconfigured. Private access fails closed. Exported process variables take precedence, and DB guards reject hosted targets from local/test profiles. Do not tunnel a hosted DB through loopback.

## Connection and ownership plan

Use Supabase **PostgreSQL**, retaining Better Auth and its existing provider/session models. Supabase Auth/API keys and a browser database client are not required. Keep the Data API disabled and automatically exposed tables disabled. All runtime queries use the server-only Prisma adapter and private `ledgerone` schema.

After reviewing the supplied SQL, provision `ledgerone_migrator` (owns the schema) and `ledgerone_app` (runtime, no ownership/DDL) in the hosted project. Set distinct strong passwords privately; neither SQL file stores them. Use Supabase's Connect dialog for the actual endpoints; do not guess the pooler hostname.

- `DATABASE_URL`: runtime role, transaction pooler port 6543 for serverless hosting, or session pooler port 5432 where appropriate.
- `DIRECT_DATABASE_URL`: migration role, direct port 5432 (requires suitable network connectivity) or IPv4-capable session pooler port 5432. Never transaction-mode port 6543.
- For a pooler, username is `<role>.<project-reference>`; for direct connection, `<role>`.
- Both use database `/postgres` with `?schema=ledgerone&sslmode=verify-full`. Percent-encode password characters in the URL. No database URL belongs in chat, logs, GitHub or browser JS.
- Runtime uses a maximum of five pg connections per application instance, verified TLS and explicit adapter schema. Review aggregate pool limits when choosing hosting/concurrency.
- Download the project's root CA when needed and set `SUPABASE_DB_CA_FILE` to its absolute private file path; provision that certificate in the hosting environment. Runtime verifies hostname/chain. Prisma Migrate translates the validated TLS requirement to its schema engine's `sslmode=require&sslaccept=strict`, with the optional root certificate. Never use `rejectUnauthorized:false` or disable Node certificate verification.

The runtime role still serves multiple allowed owners; per-user isolation remains enforced at the server query/service boundary. Merely enabling automatic RLS would not map Better Auth sessions to database identities or supply correct policies. Additional DB-level user isolation requires an explicit reviewed design.

## GitHub and migration authority

Supabase's native GitHub workflow reads `supabase/migrations`; this repository currently uses **Prisma migrations** in `prisma/migrations`. Repository linkage alone does not run these migrations and does not host the Next.js app. Do not copy SQL into a second migration history or enable automatic deployment just to make the integration look active. Keep production deployment off until one reviewed deployment workflow and recovery procedure are selected. No paid branching was enabled.

The guarded command `npm run db:migrate:production` loads production `.env` and validates the exact project, role, private schema, TLS and port before invoking Prisma. It is provided for a later reviewed release; it has not been executed against Supabase. Bootstrap first, migrate with the migration role, then apply explicit runtime grants and verify auth/ownership/rollback with the runtime role. Keep migration credentials out of the running application.

## Remaining production prerequisites

1. Provision reviewed DB roles/schema and configure both real DB URLs privately; verify hosted TLS/connectivity and runtime restrictions.
2. Select the Next.js hosting URL. Set `BETTER_AUTH_URL` to that exact HTTPS origin; configure a separate production Google OAuth client/callback `<origin>/api/auth/callback/google` and the exact owner allowlist. GitHub and other provider setup are deferred at the user's request.
3. Complete accounting Phase 1, expanded authentication review, backup/restore rehearsal, restricted runtime-role checks and the published release gate before any real financial data or public deployment. The Free project alone is not production-readiness evidence.

Reproducible local rehearsal: `npx tsx scripts/rehearse-production-schema.ts`. It creates only a random local `*_test` DB and random temporary roles, applies all three migrations into `ledgerone`, verifies runtime reads/atomic writes/audit and denied DDL/history access, then removes those temporary resources. It does not connect to Supabase. Existing development DB/session history is preserved.

Primary references: [Supabase Prisma](https://supabase.com/docs/guides/database/prisma), [connection types](https://supabase.com/docs/guides/database/connecting-to-postgres), [GitHub integration](https://supabase.com/docs/guides/deployment/branching/github-integration), [disable the Data API](https://supabase.com/docs/guides/api/securing-your-api), [pg TLS options](https://node-postgres.com/features/ssl), [Prisma PostgreSQL connection options](https://www.prisma.io/docs/orm/v7/core-concepts/supported-databases/postgresql).
