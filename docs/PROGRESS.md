# Progress and evidence

## 2026-11-11 — Phase 2 request prerequisite assessment

The user supplied P2-E1–P2-E4 / P2-S01–P2-S08. Inspected `git status --short`, `git log -5 --oneline`, `git remote -v`, source/schema inventory and the Phase 1 gate. The only commit remains `8996627`; working tree was clean, no remote exists, and Prisma defines only AppMetadata. No Phase 1 ledger or authentication exists. Phase 1 remains blocked, so Phase 2 implementation cannot start under the user's gate rule.

Added `docs/gates/PHASE_2.md` to preserve the requested scope and release criteria with an explicit NOT RUN / BLOCKED result. No migrations or application changes. No new application tests were run because this assessment changes documentation only. Next dependency remains P1-S01 review followed by P1-S02; later Phase 1 accounting/security stories and a PASS gate must precede P2-S01. The new Phase 2 request does not supply missing implementation or gate evidence.

## 2026-11-11 — Foundation planning increment

Completed: repository inspection and proposed documentation baseline only. Completed implementation story IDs: none. P0-PLAN is a planning artifact reference, not a merged story. Every S001–S024 is planned and not started. No financial behavior, authentication, charts, import, storage, backup or CI exists.

### Baseline evidence

- Working directory: `<project-root>`.
- `ls -la`: empty directory before edits (only `.` and `..`).
- File discovery returned no source files or AGENTS.md. Ancestor AGENTS.md locations were checked; none found.
- `git status --short && git remote -v && git log -5 --oneline`: exited 128 at the first command, `fatal: not a git repository`; remote/log subcommands consequently did not run. No Git identity/remote is assumed.

### Artifacts

Created `docs/PRD.md`, `docs/ARCHITECTURE.md`, `docs/ACCOUNTING.md`, `docs/ADR/0001-modular-monolith-and-ledger.md`, `docs/ROADMAP.md`, `docs/BACKLOG.md`, `docs/TEST_PLAN.md`, `docs/PROGRESS.md` and `docs/DECISIONS_NEEDED.md`. They define proposed scope, conventions, journal examples, architecture risks, 24 ordered stories, seven milestone/epic mappings, gates, requirement-to-test coverage and approval boundaries. Added `scripts/check_foundation.py` for reproducible structural and displayed-example arithmetic checks.

Migrations: none. Application code/dependencies: none. Remote mutations/deployment/bank connections/paid services: none. PR link/local commit hash: unavailable because this directory has no Git repository. No repository was initialized without confirmation of identity/authorization.

### Checks and limitations

Executed `python3 scripts/check_foundation.py` from the project root; exit code 0. Output:

```text
PASS: 9 required documents; 24 ordered stories with all mandatory fields/tasks
PASS: 20 requirements mapped; 7 gates explicitly NOT RUN
PASS: 15 displayed journal examples balance in functional INR
LIMIT: structural/arithmetic checks only; no application tests or review approval
```

Application formatting, lint, typecheck, unit/integration/E2E tests and build are NOT RUN: no application, package scripts or test runtime exists. Those checks remain mandatory for implementation stories. Structural documentation checks are not accounting approval, security approval or proof of financial behavior. All phase gates are NOT RUN.

Security considerations: proposed server authorization, workspace-constrained relations, immutable journals, idempotency, isolated file access and recoverable operations are documented, not implemented. Principal unresolved risks are auth provider/private access, database balance/immutability enforcement, FX carrying values/revaluation, investment cost treatment, and deletion/backup key custody. D01–D08 identify timing and review requirements.

Next story: S001, only after D01 Phase 1 authorization. D02 is needed before Git initialization/remote tracker creation; D03 blocks authentication implementation in S002. Current stopping point is the user's requested approval boundary before Phase 1.

## 2026-11-11 — P1-S01 implementation increment

Current status: implementation verified locally, AWAITING REVIEW; not done under the reviewed-merge definition. Completed implementation story IDs: none merged. P1-S02 has not started. The user authorized expanded Phase 1, local Git initialization and Google sign-in with an owner allowlist; the user will configure the remote. No remote is configured and no tracker resources were created.

### Changed files and artifacts

- Platform: `package.json`, `package-lock.json`, `.nvmrc`, `tsconfig.json`, `next-env.d.ts`, `next.config.ts`, `eslint.config.mjs`, `postcss.config.mjs`, `.prettierrc.json`, `.prettierignore`, `.gitignore`.
- Environment/operations: `.env.example`, `compose.yaml`, `.github/workflows/ci.yml`, `README.md`.
- Application: `src/app/layout.tsx`, `src/app/page.tsx`, `src/app/globals.css`, `src/app/api/health/live/route.ts`, `src/app/api/health/ready/route.ts`, `src/lib/database.ts`, `src/lib/environment.ts`.
- Database: `prisma.config.ts`, `prisma/schema.prisma`, `prisma/seed.ts`, `prisma/migrations/migration_lock.toml`, `prisma/migrations/202611110001_platform/migration.sql`.
- Verification: `vitest.config.ts`, `src/lib/environment.test.ts`, `tests/integration/platform.test.ts`, updated `scripts/check_foundation.py`.
- Documentation: all existing foundation documents retained and formatted; current BACKLOG/ROADMAP replace the initial execution order; the initial backlog is preserved in `docs/archive/BACKLOG_INITIAL.md`. Added `docs/stories/P1-S01.md` and `docs/gates/PHASE_1.md`. Updated decisions, PRD, test traceability, ADR and this evidence log.

Migration: `202611110001_platform` creates platform metadata and version marker only; no financial or identity schema. Recovery is described in the story and README. No real user/demo financial records exist.

### Executed checks

Host: Node 22.22.0, npm 10.9.4, macOS. Final pinned runtime: Next.js 16.4.6 / React 19.3.1 / Prisma 7.10.1. Docker is absent. For database evidence a disposable loopback PostgreSQL 17.6 server was run using `embedded-postgres@17.6.0-beta.15` installed under `/private/tmp/ledgerone-pg17`, outside application dependencies. An initial probe also ran PostgreSQL 18.6; the final fresh migration was independently verified on 17.6 to match Compose. No system database service was installed.

| Command/scenario                                                                        | Result                                                                                                                |
| --------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| `git init`                                                                              | PASS, exit 0 after sandbox escalation; remote intentionally absent                                                    |
| `npm ci` in a source-only copy at `/private/tmp/ledgerone-clean-final`                  | PASS, exit 0; no dependency peer conflicts in final toolchain                                                         |
| `npm run format:check`                                                                  | PASS, exit 0                                                                                                          |
| `npm run lint`                                                                          | PASS, exit 0, no warnings                                                                                             |
| `npm run typecheck`                                                                     | PASS, exit 0, includes Prisma generation and Next route type generation                                               |
| `npm run test:unit`                                                                     | PASS, exit 0: 6 seed-guard tests                                                                                      |
| `npm run db:migrate` against fresh PostgreSQL 17.6                                      | PASS, exit 0: first migration applied; subsequent clean-source rerun reported no pending migrations                   |
| `npm run test:integration` against PostgreSQL 17.6                                      | PASS, exit 0: 1 schema readiness test                                                                                 |
| `NEXT_TELEMETRY_DISABLED=1 npm run build`                                               | PASS, exit 0: static landing page and two dynamic health endpoints                                                    |
| `NODE_ENV=development ALLOW_DEMO_SEED=true npm run db:seed` twice against disposable DB | PASS: deterministic upsert succeeded twice                                                                            |
| `NODE_ENV=production ALLOW_DEMO_SEED=true npm run db:seed`                              | Expected refusal, exit 1 with explicit development-mode guard before DB access                                        |
| Production HTTP smoke on loopback                                                       | PASS: `/`, `/api/health/live`, `/api/health/ready` returned 200; page marker/frame header and health no-store checked |
| Readiness with stopped database                                                         | PASS: 503 with only `{"status":"unavailable"}`                                                                        |
| `python3 scripts/check_foundation.py`                                                   | PASS: 9 current stories, requirement mapping and 15 displayed balanced journal examples                               |
| `git check-ignore .env .env.local src/generated/prisma/client.ts`                       | PASS: ignored; `.env.example` is not ignored                                                                          |
| `npm audit --omit=dev`                                                                  | PASS, exit 0: zero runtime vulnerabilities reported                                                                   |
| Full dependency audit                                                                   | 10 moderate development-tool findings remain; no forced major transitive override applied                             |

Final clean-source verification ran install, formatting, lint, typecheck, unit, migration rerun, integration and build from documented source without copying node_modules, generated Prisma output or .next. Earlier failures (sandbox network/IPC restrictions, a seed-test environment type mismatch, lint warning and Markdown-table parser formatting) were resolved and the affected checks rerun. Next.js reports an unrelated parent-directory lockfile warning in the workspace; the isolated copy builds without it.

### Security, limitations and next step

No `.env` or real credential committed. Loopback service defaults, sanitized health output, no-store health responses, frame/content-type/referrer headers and server-only DB access are in place. Authentication and owner authorization are not implemented; no private data endpoints exist yet. This is not a secure production finance app and must remain local. No bank, paid resource, public deployment, remote CI or browser E2E run is claimed.

Docker Compose itself has NOT RUN because Docker is unavailable; real matching PostgreSQL migration tests are the recorded substitute, not evidence of container execution. Full dependency audit has unresolved moderate dev-tool findings; these must be reassessed before the phase release. Framework-specific lint/accessibility rules are deferred to P1-S02 after compatibility review. Accounting/security ADR approval remains outstanding before dependent stories. The phase gate remains NOT RUN/BLOCKED; none of its later criteria is satisfied by this scaffold.

Next story: P1-S02 after P1-S01 review and merge, per Prompt 0. User remote setup is pending. Commit evidence: use `git log -1 --oneline` for the `[P1-S01]` commit containing this report; no PR exists yet.

## 2026-11-11 — P1-S02 design system and shell

Implemented P1-S02 only, locally verified and awaiting review. The user explicitly authorized proceeding to S02 after Docker became available. P1-S01 advancement is accepted on that basis; no remote PR/merge is invented. Phase 1 remains blocked by P1-S03–P1-S09. Next story is P1-S03 (Google sign-in with an owner allowlist), not Phase 2.

### Result and changed files

Added responsive desktop sidebar/mobile modal navigation, active route state, skip link, footer, honest overview empty states, persisted Light/Dark/System theme and Appearance route, local component library with RHF/Zod form validation and feedback demonstrations, shared status primitives and actual loading/error/not-found boundaries. Buttons and links only expose implemented routes/actions. No invented financial metrics or private records are displayed.

Source: `src/app/layout.tsx`, `src/app/page.tsx`, `src/app/globals.css`, `src/app/loading.tsx`, `src/app/error.tsx`, `src/app/not-found.tsx`, `src/app/settings/appearance/page.tsx`, `src/app/design-system/page.tsx`; new `src/components/shell/`, `src/components/ui/`, `src/components/design-system/` and `src/lib/utils.ts`. Configuration: `components.json`, `package.json`/lockfile, `playwright.config.ts`, `.prettierignore`, `.github/workflows/ci.yml`. Verification: `tests/e2e/shell.spec.ts` and four PNGs in `docs/evidence/P1-S02/`. Documentation: README, PRD, ARCHITECTURE, BACKLOG, ROADMAP, TEST_PLAN, DECISIONS_NEEDED, this log, PHASE_1 gate and P1-S02 story. `docs/stories/P1-S02.md` contains the complete acceptance/recovery contract.

Migrations: none. Financial mutations/authentication: none. Theme storage: only the browser-local non-sensitive `ledgerone-theme` preference. The form preview stores nothing. Framework primitives are manually adapted Radix/shadcn-style components, with pinned dependencies and component aliases.

### Executed evidence

- Docker socket initially required sandbox escalation; `docker compose up -d --wait` then exited 0 and reported `ledgerone-postgres-1` Healthy. No container reset or volume deletion was performed.
- `npm run db:migrate`: exit 0, no pending platform migrations; `npm run test:integration`: exit 0, 1 PostgreSQL integration test passed against Docker at loopback 5432.
- `npm run format:check`: exit 0; `npm run lint`: exit 0, no warnings; `npm run typecheck`: exit 0 (Prisma generation, route types and strict TypeScript).
- `npm run test:unit`: exit 0, existing 6 seed-guard tests passed. New UI behavior is tested in browsers rather than duplicated shallow unit tests.
- `NEXT_TELEMETRY_DISABLED=1 npm run build`: exit 0; overview, appearance, component library and not-found pages compile, with existing health routes retained.
- `npx playwright install chromium`: exit 0. `npm run test:e2e`: final exit 0, **16 tests passed in 11.6s**, across desktop/mobile Chromium with production build on loopback port 3100. Playwright cleaned up its test server. No other local application server was stopped.
- Tests cover navigation/link destinations, active routes, skip link, mobile trap/Escape/return focus, persisted theme/device changes, associated errors and focus, validation lengths, literal HTML-like text, all feedback states/retry, 404 recovery, reflow at 320/768/1024px, reduced motion and WCAG-tagged axe scans in light/dark for every route plus mobile modal.
- First E2E run: 14 passed, 2 failed due to a selector also matching Next.js's route announcer; assertions were scoped to main content and the full suite rerun successfully. No application bug was hidden by removing an assertion.
- Desktop light and mobile dark screenshots were visually inspected for readability/clipping; all four mode/viewport captures retained in `docs/evidence/P1-S02/`. Automated axe scans reported zero violations in the configured scope; full assistive-technology conformance is not claimed.
- `python3 scripts/check_foundation.py`: exit 0, current story contracts/requirement mappings and 15 displayed journal examples verified structurally. This is not ledger implementation evidence.
- `npm audit --omit=dev`: exit 0, zero runtime findings. Dependency installation reports the existing 10 moderate development-tool findings; no forced transitive major override was applied. Remote CI has not run.

### Scope and review limits

Google auth/owner isolation and the entire financial engine remain future Phase 1 stories. These public local preview routes contain no financial data; deployment remains unauthorized. Only UI/theme behavior is implemented. Actual server-render-error injection, screen-reader testing and Firefox/WebKit execution were not performed. Root error/loading boundaries use browser-exercised shared primitives, not independently forced server failures. No schema or financial migration is introduced; rollback is a UI/config revert, leaving the inert theme key harmless.

Concurrent local foundation-verification edits appeared in README, package scripts, P1-S01 notes, this progress log and `scripts/verify.sh` during this increment. They were preserved and excluded from the S02 commit using selective staging. This story's own documentation additions remain included. No claim is made that the unrelated verification script was executed during this story.

P1-E1 local integration scenarios are green (Docker baseline plus responsive/themed shell journeys); formal epic closure awaits review. The `[P1-S02]` commit containing this evidence is the local artifact reference (`git log --oneline --grep='\[P1-S02\]'`). No remote/PR/merge is claimed. Next: review P1-S02, then implement P1-S03 under the already authorized Phase 1 scope.

## 2026-11-11 — Local development live reload

Operational follow-up to P1-S02; no new product story or financial change. Confirmed port 3000 belonged to this checkout and its parent was `npm run start`. Stopped only that production process and started `npm run dev -- --port 3000` on loopback. The current S02 overview now renders. A local Chromium probe appended an invisible CSS custom property, observed it in the same open page with a preserved window marker (no document reload), removed the probe in finally, and verified the removal also hot-updated. Both checks passed and the source CSS has no residual diff. The development server remains running for the user's review.

README documents dev versus production mode and the one-time refresh needed for a tab originally loaded from the production server. No library, schema or application logic change was required; no migration or broad application-suite rerun. Existing concurrent local verification edits were preserved. Next.js development startup automatically generated AGENTS.md and updated next-env.d.ts; those generated local changes are not included in this documentation-only commit. Phase 1 accounting/authentication gate status is unchanged.
