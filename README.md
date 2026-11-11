# LedgerOne

Private personal finance, implemented in reviewed increments. **P1-S02 adds the responsive shell and theme controls; identity and financial features are not implemented.** The landing page contains no private data. Do not expose the development server publicly.

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

Use `npm run start` after a successful build to serve the production artifact locally. Copy `.env` on each new checkout; Prisma loads it for CLI operations and Next.js loads it for the server. Builds/generation do not require a running database. Never put secrets in `NEXT_PUBLIC_*` variables. Auth secrets will be documented with P1-S03; Google sign-in with an owner allowlist is selected, not implemented.

`npm run db:stop` retains the local volume. Do not use `docker compose down --volumes` unless you intend to delete local data. For migration recovery, see `docs/stories/P1-S01.md`.

## Delivery state

See [progress](docs/PROGRESS.md), [current backlog](docs/BACKLOG.md), [roadmap](docs/ROADMAP.md), [accounting contract](docs/ACCOUNTING.md) and [Phase 1 gate](docs/gates/PHASE_1.md). No public deployment, paid service or bank connection is authorized. Local checks do not substitute for accounting/security review and reviewed merge.

## P1-S02 shell and browser checks

Available routes are `/`, `/settings/appearance`, and `/design-system`. Theme selection supports Light, Dark and System and persists in this browser. The component library demonstrates validation and feedback without storing records. Future finance modules are identified as unavailable and have no dead action links.

```sh
npx playwright install chromium
npm run build
npm run test:e2e
```

Playwright starts an isolated production server on loopback port 3100. Keep that port free. It covers desktop/mobile Chromium, keyboard/modal focus, theme persistence, form/error/retry feedback, no-overflow layouts at 320/768/1024px, and automated light/dark accessibility scans. Screenshots and an HTML report are generated under ignored `test-results/` and `playwright-report/`; use `npx playwright show-report` to inspect the report. CI installs Chromium and uploads browser evidence. Other browser engines and full screen-reader testing remain unverified.

See `docs/stories/P1-S02.md` for acceptance, limitations and rollback notes. No new migration is required. Authentication with the selected Google owner allowlist is the next story, P1-S03.
