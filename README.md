# LedgerOne

Private personal finance, implemented in reviewed increments. **P1-S03 adds Google-only authentication and server sessions; live owner Google sign-in is verified and financial features are not implemented.** The public login contains no financial data. Do not expose the development server publicly.

## Local prerequisites

- Node.js 22.22.x (see `.nvmrc`) and npm 10.
- Docker Engine/Desktop with Compose v2 for PostgreSQL 17.6.
- Git. No remote is configured by this project.

## Fresh checkout

```sh
npm ci
cp .env.example .env
npm run db:up
npm run db:generate
npm run db:migrate
npm run dev
```

Open http://127.0.0.1:3000. The app binds to loopback. Compose publishes PostgreSQL on loopback only. The example database password is deliberately local-only; it is not a hosted credential. Choose an unused host port and update both Compose and DATABASE_URL if 5432 is occupied. Never commit `.env` or use a production database for local tests.

Health endpoints: `/api/health/live` returns 200 without a database dependency; `/api/health/ready` returns 200 only when the expected schema version is present, otherwise a sanitized 503. No account data or exception details are exposed. Readiness is not proof of accounting correctness.

## Development fixtures

```sh
NODE_ENV=development ALLOW_DEMO_SEED=true npm run db:seed
```

The seed currently upserts a deterministic platform marker only. Financial demo fixtures will arrive with the ledger stories. Production/test modes, missing opt-in and non-loopback database URLs are rejected before any write. Do not point a loopback proxy at a production database.

## Verification

```sh
npm run format:check
npm run lint
npm run typecheck
npm run test:unit
npm run test:integration
npm run build
python3 scripts/check_foundation.py
```

Integration tests require a migrated PostgreSQL database and fail if it is unavailable. CI provisions an isolated database and runs these commands, but remote CI execution requires a user-configured remote. Browser interaction tests begin with P1-S02; there is no claimed E2E coverage yet.

Use `npm run start` after a successful build to serve the production artifact locally. Copy `.env` on each new checkout; Prisma loads it for CLI operations and Next.js loads it for the server. Builds/generation do not require a running database. Never put secrets in `NEXT_PUBLIC_*` variables. Configure Google and app secrets privately using `docs/setup/GOOGLE_AUTH.md`; no credentials belong in source control.

`npm run db:stop` retains the local volume. Do not use `docker compose down --volumes` unless you intend to delete local data. For migration recovery, see `docs/stories/P1-S01.md`.

## Delivery state

See [progress](docs/PROGRESS.md), [current backlog](docs/BACKLOG.md), [roadmap](docs/ROADMAP.md), [accounting contract](docs/ACCOUNTING.md) and [Phase 1 gate](docs/gates/PHASE_1.md). No public deployment, paid service or bank connection is authorized. Local checks do not substitute for accounting/security review and reviewed merge.

## P1-S02 shell and browser checks

Workspace routes are `/`, `/settings/appearance`, and `/design-system`; P1-S03 now protects them with an owner session. The public entry is `/login`. Theme selection supports Light, Dark and System and persists in this browser. The component library demonstrates validation and feedback without storing records. Future finance modules are identified as unavailable and have no dead action links.

```sh
npx playwright install chromium
npm run build
npm run test:e2e
```

Playwright starts an isolated production server on loopback port 3100. Keep that port free. It covers desktop/mobile Chromium, keyboard/modal focus, theme persistence, form/error/retry feedback, no-overflow layouts at 320/768/1024px, and automated light/dark accessibility scans. Screenshots and an HTML report are generated under ignored `test-results/` and `playwright-report/`; use `npx playwright show-report` to inspect the report. CI installs Chromium and uploads browser evidence. Other browser engines and full screen-reader testing remain unverified.

See `docs/stories/P1-S02.md` for acceptance, limitations and rollback notes. No new migration is required. Authentication with the selected Google owner allowlist is the next story, P1-S03.

## Daily development and live reload

Use `npm run dev -- --port 3000` for everyday development. Next.js Fast Refresh updates the browser when source files are saved. If port 3000 is occupied by a production `npm run start` session, stop that session with Ctrl+C in its terminal before starting dev; refresh an already-open production tab once after switching. Keep the dev terminal running.

`npm run start` serves the last production build and does not watch source files. Use it after `npm run build` for production-build verification. Docker runs PostgreSQL only; the Next.js watcher runs on the host, so no Docker volume/watcher integration is needed for the current setup.

## P1-S03 Google sign-in and session verification

Follow [Google setup](docs/setup/GOOGLE_AUTH.md) to register the exact local callback and configure the existing project-root `.env`. Its tracked template is `.env.example`. The app fails closed until `BETTER_AUTH_URL`, `BETTER_AUTH_SECRET`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` and `AUTH_ALLOWED_EMAILS` are valid. Use `http://localhost:3000` consistently for real local Google sign-in. Restart after editing the environment.

The identity migration is additive and advances readiness to schema version 2. Run `npm run db:migrate` before using this version. Private pages render dynamically and authorize on the server; `/api/session` returns only the authenticated user DTO and expiry. Sessions expire absolutely after eight hours and are revoked on logout. The supported alternative to Auth.js and threat model are documented in [ADR-002](docs/ADR/0002-google-auth-and-server-sessions.md), awaiting security review.

Integration/browser tests now require a separate `TEST_DATABASE_URL` with a database name ending in `_test`. Create the local `ledgerone_test` database as described in the setup guide, then:

```sh
npm run db:migrate:test
npm run test:unit
npm run test:integration
npm run build
npm run test:e2e
```

Tests never use real Google credentials: the integration provider exchange is substituted only inside its test instance, and browsers use signed sessions seeded directly into the isolated DB. There is no deployed test-login provider or bypass flag. Live owner Google sign-in/callback is verified; the setup guide records the remaining manual acceptance checklist. P1-S04 entity ownership/audit and the financial ledger are not implemented by this story.

## P1-S04 ownership and audit API foundation

Apply `npm run db:migrate` and regenerate Prisma before using schema version 3. Workspace endpoints require the current S03 session: GET/POST `/api/workspaces`, GET/PATCH `/api/workspaces/[id]`, and GET `/api/audit` (latest 50 owned events). Create/rename input is strict `{name}` JSON, with the exact configured Origin; owner IDs are always derived server-side. No workspace UI or financial account/transaction API exists yet. API reads return empty arrays until an owner explicitly creates data.

Successful mutations and minimal append-only audit commit together; audit failure rolls back the mutation. Cross-user reads/writes are denied, and supported handlers return a fresh `X-Request-ID` correlated to sanitized traces. See `docs/stories/P1-S04.md` and ADR-003 for security/retention/recovery limits. Integration/browser tests use the separate `_test` DB and intentionally retain immutable audited fixtures; production DB role separation remains a deployment prerequisite. The full Phase 1 gate still requires actual ledger and account/transaction isolation evidence.
