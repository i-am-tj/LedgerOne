# Progress and evidence

## 2026-11-11 — P1-S01 Docker Compose and outage verification

Executed full platform verification sequence on Node 22.22.0, npm 10.9.4, with Docker Compose v5.7.0 and PostgreSQL 17.6 (`postgres:17.6-alpine`) container via Colima runtime. All verification commands executed cleanly and exited code 0:

- `npm ci`: Clean install, 315 packages audited.
- `npm run db:up`: Container `ledgerone-postgres-1` provisioned and reported Healthy on `127.0.0.1:5432`.
- `npm run db:generate`: Prisma Client 7.10.1 generated.
- `npm run db:migrate`: Migration `202611110001_platform` verified against containerized PostgreSQL.
- `npm run format:check`: Code style verified.
- `npm run lint`: ESLint clean, 0 warnings.
- `npm run typecheck`: TypeScript and route types clean.
- `npm run test:unit`: 6 seed-guard unit tests passed.
- `npm run test:integration`: 1 database integration test passed (`schema_version = '1'`).
- `npm run build`: Next.js 16.4.6 production build completed.
- `python3 scripts/check_foundation.py`: Passed structural and arithmetic checks.
- Application served with `npm run start` at `http://127.0.0.1:3000`.
- Health checks: `/api/health/live` returned 200 `{"status":"ok"}`; `/api/health/ready` returned 200 `{"status":"ready"}`.
- Outage handling verified: `npm run db:stop` resulted in `/api/health/ready` returning 503 `{"status":"unavailable"}`. Running `npm run db:up` restored readiness to 200 `{"status":"ready"}`.

## 2026-11-11 — Phase 2 request prerequisite assessment

The user supplied P2-E1–P2-E4 / P2-S01–P2-S08. Inspected `git status --short`, `git log -5 --oneline`, `git remote -v`, source/schema inventory and the Phase 1 gate. The only commit remains `534e118`; working tree was clean, no remote exists, and Prisma defines only AppMetadata. No Phase 1 ledger or authentication exists. Phase 1 remains blocked, so Phase 2 implementation cannot start under the user's gate rule.

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

## 2026-11-11 — P1-S03 authentication and sessions

Implemented P1-S03 locally under the user's instruction to proceed. Completed/merged story IDs: none newly claimed. S03 is locally verified and ready for security review; real Google client/consent acceptance and reviewed merge remain pending. The user initially asked to configure Google afterward, then asked for exact client creation values and file locations. Those instructions are in `docs/setup/GOOGLE_AUTH.md`. No user email was inferred and no real Google login was performed.

### Delivered behavior and changed files

Google-only, verified exact owner admission; PostgreSQL-backed fixed eight-hour sessions without refresh/cookie cache; explicit per-page/API guards; canonical login origin; logout with cookie/database revocation; fail-closed setup/expiry/revocation/error states; minimal private/no-store DTO; strict/bounded/same-origin auth commands, finite exposed endpoint list, encrypted provider credentials and persistent installation rate bucket. S02 workspace URLs remain the same under `(workspace)`, with dynamic rendering to avoid static auth decisions. Health endpoints remain public and minimal.

Source: new `src/lib/auth/{policy,create-auth,requests,server}.ts`, auth policy/request unit tests, `src/components/auth/auth-controls.tsx`, `/login`, `/api/auth/[...all]`, `/api/session`, workspace group/layout and guarded private pages. Moved existing workspace page/settings/design-system/loading/error files into the route group. Updated root layout/not-found, shell sign-out controls, CSS and readiness marker. Config/tests: `.env.example`, Next logging config, package/lock, Playwright/Vitest/CI, isolated test DB migration helper, `tests/support/`, auth integration/browser fixtures/tests, existing platform/shell regressions. Documentation: PRD, ARCHITECTURE, BACKLOG, ROADMAP, TEST_PLAN, DECISIONS_NEEDED, this log, PHASE_1 gate, ADR-002, S03 story, setup guide and four login PNGs in `docs/evidence/P1-S03/`.

Migration: `202611110002_identity` creates User/AuthSession/AuthAccount/AuthVerification/AuthRateLimit storage with unique indexes/FKs and changes the platform marker 1→2. No financial schema/posting exists or is changed. It was applied incrementally to local development and from scratch with the original migration on isolated `ledgerone_test`. Re-running migrations found none pending; schema diff found no difference. Recovery is additive forward repair while keeping private routes closed, not dropping identities or reverting to an unprotected app (ADR-002).

### Executed verification

| Command/scenario                                                                                | Result                                                                                                         |
| ----------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| `docker compose up -d --wait` and dedicated local test DB creation                              | PASS; PostgreSQL container Healthy; separate `ledgerone_test` provisioned                                      |
| `npm run db:migrate`                                                                            | PASS, identity migration applied to local development                                                          |
| Fresh isolated DB migration of both migrations                                                  | PASS, platform + identity applied from empty test DB                                                           |
| `npm run db:migrate:test`                                                                       | PASS, safe idempotent rerun; helper refuses a database name without `_test` suffix                             |
| `npx prisma format` / `npx prisma validate`                                                     | PASS                                                                                                           |
| `npx prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma --exit-code` | PASS, exit 0, no difference detected                                                                           |
| `npm run format:check`                                                                          | PASS, exit 0                                                                                                   |
| `npm run lint`                                                                                  | PASS, exit 0, no warnings                                                                                      |
| `npm run typecheck`                                                                             | PASS, exit 0, code generation/Next route types included                                                        |
| `npm run test:unit`                                                                             | PASS, exit 0, 38 tests across 3 files (32 auth + 6 existing seed tests)                                        |
| `npm run test:integration`                                                                      | Final PASS, exit 0, 8 tests across 2 files; real PostgreSQL, mocked external Google exchange                   |
| `NEXT_TELEMETRY_DISABLED=1 npm run build`                                                       | PASS, exit 0; private routes listed as dynamic, login/auth/session/health endpoints compiled                   |
| `npm run test:e2e`                                                                              | Final PASS, exit 0, 32 tests across desktop/mobile Chromium in 15.7s                                           |
| Focused logout/history regression                                                               | PASS, 2 tests; browser-back checked without a forced reload; cross-origin logout leaves valid session usable   |
| Real dev-server missing-client configuration probe                                              | PASS; localhost:3000 redirects to login, sign-in disabled, `/api/session` sanitized 503                        |
| `npm audit --omit=dev`                                                                          | PASS, exit 0, zero runtime findings; installation still reports 10 existing moderate development-tool findings |

Integration exercises denied/unverified/returning identities before unauthorized persistence, real state/cookie binding and S256 verifier/challenge/replay handling, minimal online identity scopes, encrypted stored provider tokens, Secure/HttpOnly/Lax HTTPS cookies, absolute expiry/no refresh, token-free DTO, forged/revoked/removed-policy sessions, logout and spoof-resistant sequential rate enforcement. Browser fixtures seed signed sessions directly only in the `_test` DB, using a random per-run secret for the loopback production-build server; there is no runtime test provider/flag/endpoint. CI executes integration then browser suites sequentially.

Earlier failures were corrected and checks rerun: stale generated Next route types after moving pages; test-only TypeScript shapes under the current auth/Vitest APIs; a standalone probe's relative API URL; static prerendering of missing-config redirects; and one globally counted integration session assertion affected by concurrent browser fixture deletion. The latter now counts only that test's identity and final integration was rerun sequentially. No production invariant was weakened or failed assertion removed.

Four production-build login light/dark desktop/mobile screenshots were retained. Desktop light/mobile dark were visually inspected; automated axe scans of login/workspace/modal states pass in configured scope. Firefox/WebKit and full screen-reader conformance are not claimed. Playwright stopped its own port-3100 test server; the user's port-3000 development server remains available.

### Security and outstanding work

Real Google consent/token exchange/Google JWT/JWKS verification is not demonstrated by a mocked exchange; use the setup guide's live checklist after the user finishes Google configuration. Security review is explicitly requested for ADR-002 and these controls before merge. P1-S04 entity ownership, request tracing and audit/retention remain unimplemented; S03 must not be represented as completed cross-user financial isolation. No Phase 1 PASS, deployment, paid service, bank integration, remote CI or PR/merge is claimed.

Google/app-secret slots were added to the existing ignored local `.env`, preserving database settings. An application secret was generated only if absent and file permissions restricted to the owner; no secret value was printed, shared or staged. A dedicated test DB URL was added privately if missing. The tracked template has blank secrets. Existing concurrent foundation script/README/progress/S01 edits and generated AGENTS.md are preserved outside this commit; S03 selectively stages its own changes only. Expired sessions/state/rate records are denied as appropriate, but automatic retention cleanup remains future reviewed work.

Artifact: the `[P1-S03]` local commit containing this report (`git log --oneline --grep='\[P1-S03\]'`). No remote is configured. Next: user-configured Google acceptance + security review, then P1-S04 ownership/audit under the authorized Phase 1 scope. All accounting invariants remain release-blocking and unimplemented, so Phase 2 stays blocked.

## 2026-11-11 — P1-S03 live owner Google sign-in verification

The user supplied Google client values in the ignored local `.env` and requested live verification in Chrome, with the user performing login. Initial validation found the explicit owner allowlist empty; a clarification was requested, the user supplied the approved address, and only the local allowlist was updated. Secrets and owner identity values were not printed or committed. The verified checkout's port-3000 server was restarted to load the configuration.

Chrome subsequently showed the authenticated Overview and Sign out control after the user's login. The first identity-specific metadata check did not find the binding, so success was withheld until fresh checks resolved the discrepancy; no cause is asserted without evidence. Fresh current-policy DB metadata confirms a verified allowlisted User, Google provider binding and active database session with a 28,800-second absolute lifetime. Queries selected only identity/policy/session metadata, never token columns; only boolean/count evidence was output. Independent cookie-free HTTP checks returned session API 401 and workspace 307 to login. The user was left signed in; no live logout or other-identity login was performed.

Updated S03 story, setup checklist, security ADR, README and Phase 1 gate with that precise live result. Removed the Overview's outdated claim that secure sign-in was still coming next; financial features remain explicitly unavailable. No auth policy or migration changed. Earlier automated expiry/logout/CSRF/allowlist tests remain applicable; live alternate-user/manual logout and independent security review are still not claimed. The full Phase 1 gate remains blocked by ownership/audit and ledger work.

This follow-up's formatting/lint/typecheck/unit/integration/build results are recorded after execution. Local `.env` remains ignored and owner-only. Existing unrelated verification edits and generated AGENTS.md are preserved outside the commit. Local artifact: the `[P1-S03]` live-verification commit containing this report; no PR/remote merge is claimed. Next: security review and remaining S03 acceptance, then P1-S04 under authorized Phase 1 scope.

## 2026-11-11 — S03 technical review and P1-S04 ownership/audit foundation

Completed the agent-owned S03 technical review in `docs/security/S03_REVIEW.md`, committed separately as `533003d`. Manual source review plus rerun 38 unit/8 auth-platform integration tests and runtime audit found no blocker for continued local development. The report lists deployment/ownership/retention prerequisites; it is not an independent audit, peer review, remote merge or Phase 1 PASS. This resolves the technical review task the agent undertook rather than assigning OAuth auditing to the user.

Implemented P1-S04's current-resource ownership/audit foundation and verified it locally. No newly merged/done story is claimed. The User→Workspace container is explicit and owner-bound; financial Account/Journal/Posting models do not exist yet. Their specific IDOR/FK tests are explicitly deferred to S05–S08 and remain Phase 1 blockers, never counted as passed by the Workspace scenarios.

### Changed files and migration

- `prisma/schema.prisma`, `prisma/migrations/202611110003_ownership_audit/migration.sql`: Workspace/AuditEvent, unique/composite owner keys, FKs/CHECKs, ownership immutability and append-only audit triggers; schema marker 2→3.
- `src/lib/ownership/{service,http,server}.ts`: verified owner context, repeated owner query/update predicates, strict/bounded input, exact-origin writes, atomic business+audit transactions, minimal DTOs, sanitized errors and fixed-field request traces.
- `src/app/api/workspaces/route.ts`, `src/app/api/workspaces/[id]/route.ts`, `src/app/api/audit/route.ts`: authenticated API foundation; no fake financial UI or new dead controls.
- `next.config.ts`: suppress raw request URLs on owned/auth/session APIs so only sanitized owned traces are emitted.
- `src/app/api/health/ready/route.ts`, `tests/integration/platform.test.ts`: version-3 readiness.
- `tests/integration/ownership.test.ts`, `tests/e2e/ownership.spec.ts`, `playwright.config.ts`: two allowed users, actual DB/HTTP/browser isolation and audit rollback/tamper coverage. The extra email exists only in the test server's exact fake allowlist, not the user's .env.
- Docs: P1-S04 story, ADR-003, PRD, ARCHITECTURE, ACCOUNTING approval note, BACKLOG, ROADMAP, TEST_PLAN, DECISIONS_NEEDED, phase gate, README and this log; S03 review status links updated. No dependency change.

### Executed checks

| Check                                                                                           | Result                                                                                                                                                                             |
| ----------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `npm run db:migrate`                                                                            | PASS, additive migration applied to local dev; no financial data or existing session deleted                                                                                       |
| `npm run db:migrate:test`                                                                       | PASS, migration applied to isolated ledgerone_test                                                                                                                                 |
| `npx prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma --exit-code` | PASS, exit 0, no difference detected                                                                                                                                               |
| Fresh disposable PostgreSQL DB rehearsal                                                        | PASS: all three migrations applied from empty; schema comparison had no difference; audit TRUNCATE rejected. Removed only that newly generated `ledgerone_s04_*_test` DB afterward |
| `npm run lint`                                                                                  | PASS, no warnings                                                                                                                                                                  |
| `npm run typecheck`                                                                             | PASS, Prisma/Next types generated                                                                                                                                                  |
| `npm run test:unit`                                                                             | PASS, 38 existing auth/seed regressions; new security behavior tested at actual DB/HTTP boundaries                                                                                 |
| `npm run test:integration`                                                                      | PASS, 18 tests across 3 files, including 10 S04 cases                                                                                                                              |
| `NEXT_TELEMETRY_DISABLED=1 npm run build`                                                       | PASS, authenticated workspace/audit routes compiled                                                                                                                                |
| `npm run test:e2e`                                                                              | PASS, 34 desktop/mobile Chromium tests in 15.6s; includes two allowed users against real Next API handlers                                                                         |
| Runtime audit during S03 review                                                                 | PASS, zero runtime findings; dependencies unchanged; existing 10 moderate dev-tool findings still tracked                                                                          |
| Restarted local server smoke                                                                    | PASS: readiness 200; anonymous workspaces/audit 401, both with valid server request UUIDs                                                                                          |

Final `npm run format:check`, `python3 scripts/check_foundation.py` and `git diff --check` pass; no application changes followed the successful suite. Integration and browser suites ran sequentially. No failed application check was waived. User's port-3000 dev server was restarted to refresh the generated Prisma client; database sessions/secret were preserved. Playwright's own port-3100 server was stopped by the harness. No real Chrome session or personal record was used by automated fixtures.

### Security and limitations

Owner identity is derived only from current signed/allowlisted session. Lists, direct reads, updates and audit reads repeat owner predicates. Foreign/missing IDs share 404. Unauthorized/invalid writes leave business rows and success audit unchanged. Audit failure rolls back both create and rename. DB rejects owner reassignment, cross-owner audit links, mismatched actor and audit edits/deletes; separate fresh-DB probe verifies TRUNCATE protection. Trace UUID is generated server-side and is **not** a financial idempotency key. Traces exclude raw URLs/IDs, names, bodies, tokens and exception messages; failure of trace transport cannot turn a committed success into an apparent failure. No secret values were printed or committed.

Audit is minimal mutation metadata, latest-50 API, not full change-payload/event-sourcing/export. No automatic audit deletion/purge is implemented before the reviewed privacy lifecycle. Normal-role DB protections are not tamper evidence against a migration owner; dev credentials still own DDL, so separate least-privilege production roles remain a release prerequisite. Supported owned API tracing is not claimed as global auth-event monitoring. No new workspace UI, financial API, journal balancing, statement reconciliation or public deployment is implemented.

The user approved the proposed core accounting defaults during this increment: fixed functional INR, preserved original currency quantities, asset/expense debit-normal, liability/equity/income credit-normal, linked-reversal correction of posted history. Detailed FX/investment decisions remain unapproved. No S05 work has started. Next story is P1-S05 after this increment's review; Phase 1 and all later phases remain blocked on accounting implementation/evidence. Existing unrelated README/progress/package/S01 verification edits and generated AGENTS.md are preserved outside the S04 commit. Artifact: the `[P1-S04]` local commit containing this report; no remote PR or reviewed merge is claimed.

## 2026-11-11 — Multi-Provider Auth Adapter (Google & GitHub) & High-Fidelity Template

Extended authentication architecture with the **Adapter Design Pattern** and refreshed the login/signup interface to match the user-provided modern developer auth template.

### Architectural Changes

- **Adapter Design Pattern (`src/lib/auth/adapters/`)**:
  - `AuthProviderAdapter`: Standard interface specifying provider identity, metadata, origin security check (`authUrlOrigin`), canonical callback path, environment configuration status, Better Auth provider configuration, and user email verification admission logic.
  - `GoogleAuthAdapter`: Supplies Google options and verified-email validation; Better Auth performs OAuth/PKCE and the client checks the authorization origin.
  - `GitHubAuthAdapter`: Supplies GitHub options and verified-email validation; central policy enforces the allowlist and the client checks the authorization origin. Full callback/live GitHub sign-in is not verified.
  - `AuthAdapterRegistry`: Manages adapter registration, resolution by provider ID or callback path, and detection of configured adapters based on environment credentials.
- **Fail-Closed Auth Core**:
  - Updated `src/lib/auth/policy.ts` to support both Google and GitHub client credentials. Fails closed if no provider is configured.
  - Updated `src/lib/auth/create-auth.ts` to register social providers and validate users dynamically through the adapter registry.
  - Updated `src/lib/auth/requests.ts` to validate incoming provider requests against currently configured providers and dynamic adapter callback paths.
- **Unified Login/Signup Template (`src/components/auth/auth-controls.tsx`)**:
  - Implemented `AuthCard` reflecting the modern developer-focused template.
  - Seamless mode switching between "Log In" ("A clearer view starts here.") and "Sign Up" ("Your first deploy is just a sign-up away.").
  - Outline buttons for "Continue with Google", "Continue with GitHub", and "Continue with ChatGPT".
  - Collapsible "Show other options" section for SAML SSO, Passkey, and Apple options.
  - Email address input with "Continue with Email" button informing user of approved identity access policy.
  - Full backward compatibility for `GoogleSignIn`, `GitHubSignIn`, and `SignOutButton`.
- **Documentation & Setup**:
  - Created `docs/setup/GITHUB_AUTH.md` with step-by-step GitHub OAuth App setup guide and callback URL requirements (`/api/auth/callback/github`).
  - Updated `docs/ADR/0002-google-auth-and-server-sessions.md` and `docs/stories/P1-S03.md`.
  - Added environment variable slots to `.env.example`, `.env.development.example`, `.env.development.local`, and `playwright.config.ts`.

## 2026-11-11 — P1-S04A production profiles and public-entry preparation

The user paused ledger S05, requested Supabase production, separate real production/local dummy profiles, and a public dashboard with sign-in leading to protected home. Supabase project creation was verified in the Free Mumbai project and its GitHub integration is enabled with production deployment and automatic branching off. No upgrade/public application deployment, hosted migration or hosted DB connectivity test was performed. The user confirmed app hosting/domain is not set up. Google/GitHub provider configuration beyond existing local Google is deferred.

Local `.env` now reserves production values; actual project reference and a separately generated application secret are present privately, with DB/origin/provider/allowlist slots pending. Existing local DB/Google/session settings were preserved in ignored mode-0600 `.env.development.local`. `.env.development.example` contains dummy loopback settings, `.env.example` blank production slots. Development/test CLI loading never falls through to production `.env`; runtime/CLI target guards, local-only seeds and explicit test DB names prevent accidental hosted writes. Prisma runtime uses an explicit private schema and verified TLS in production; migration CLI uses a separate role/connection and strict certificate validation. No dependency or schema migration change.

Rehearsal `npx tsx scripts/rehearse-production-schema.ts` PASS: a newly created random local test DB applied all three existing Prisma migrations into private `ledgerone`; restricted runtime role read readiness and atomically inserted workspace/audit; DDL, audit changes/TRUNCATE and migration-history access were denied, with no public tables. The script removed only its newly generated test DB/roles. This is local portability/permission evidence, not hosted Supabase verification. The provision/regrant SQL and remaining deployment checklist are in `docs/setup/SUPABASE.md`.

Public `/` renders statically without a session/DB query, exposes sign-in in the top-right and contains no private records or invented numbers. `/home`, appearance/component pages and private APIs continue to require current allowed sessions. Fixed successful OAuth destination is now `/home`; already authenticated `/login` visits transition there. All prior journal/account requirements remain unimplemented. No S05 or Phase 2 work started.

## 2026-11-11 — Login adapter review and logical commit request

The user supplied auth adapter/card edits during the environment increment, requested understanding/review and logical commits, then explicitly chose **keep the new card active; defer provider setup**. Review is recorded in `docs/security/AUTH_ADAPTER_REVIEW.md`. The adapter/registry is actually used for Google/GitHub OAuth. It is not a complete plug-in interface for unrelated email/passkey/SAML methods: provider unions, request enum, credential plumbing and UI metadata are still hard-coded. Sign-up is a display mode over allowlisted OAuth, not public registration. Unsupported UI options and missing policy links remain documented release issues; no additional method is represented as connected. The original Google-only technical review is not approval of the new surface.

Combined validation before commit splitting: lint/typecheck/build PASS, 55 unit, 20 PostgreSQL integration, 46 desktop/mobile browser tests PASS. Two adapter files needed formatting; those were normalized. Route typecheck initially saw stale generated types after moving the home page; a fresh build regenerated them and subsequent typecheck passed. Initial test-migration execution was sandbox-denied before connection; rerun with approved local execution passed. Further final checks after migration-TLS/loader and verification-script refinements are recorded below. Live GitHub callback/denial/linking, hosted connectivity/OAuth, backup/restore and public deployment remain pending. Financial/accounting phase gates remain blocked.

### Final combined verification and delivery — 2026-11-11

`npm run verify:pipeline` PASS: local Compose healthy; guarded dev and test migrations report no pending migrations (existing three only); formatting, lint (0 warnings), typecheck, 57 unit tests, 20 real PostgreSQL integration tests, production build, 46 desktop/mobile Chromium tests (18.2s) and foundation-doc checks all exit 0. `npx tsx scripts/rehearse-production-schema.ts` rerun after the migration TLS/loader changes PASS, then `npm run verify:smoke` PASS: liveness 200, readiness 200, local DB outage 503, restored readiness 200. Its loopback test server was stopped and the local DB restored. No app changes followed these runs; final documentation/whitespace and staged-secret checks ran before the commits. Browser/integration suites ran sequentially. The benign outer-home lockfile and NO_COLOR/FORCE_COLOR notices do not indicate failed checks. Bash syntax validation passed; Prettier does not provide a shell-script parser, so shell validation is reported separately.

Delivery groups: P1-S01 local verification/contributor guidance; P1-S04A environment/Supabase preparation; P1-S03 OAuth adapter backend; P1-S04A public/private entry; P1-S03 login-card presentation and final review/evidence. Commits are local only, with staged private-value scans; `.env` and `.env.development.local` remain ignored/private. No remote is configured, no push/remote issues/PRs or reviewed merges are claimed. No dependency or schema migration was added. The task's review/commit request is complete; story release/merge definitions remain pending. Next work remains the outstanding Supabase hosting/connection prerequisites and reviewed UI/provider follow-ups, then S05 once this foundation amendment is accepted. Phase 1 and Phase 2 gates remain blocked by the unimplemented accounting stories.

### Generated Next.js type-file cleanup

Restarting Fast Refresh revealed `next-env.d.ts` switches between `.next/types` and `.next/dev/types` references. The installed Next.js TypeScript guide explicitly requires ignoring this generated file and removing it from Git tracking. A separate tooling commit implements that guidance while retaining the local file; `next dev/build/typegen` regenerates it for fresh checkouts. No application behavior changes. Final restarted-server checks returned public `/` 200, readiness 200 and anonymous `/api/session` 401; private profiles remain mode 0600 and the committed-tree scan found no configured auth secrets/allowlist.

## 2026-11-11 — Authorized first push and privacy audit

The user explicitly requested pushing all implementation commits with no sensitive/unnecessary data. Verified the GitHub destination and push permission; the repository is public and its remote refs were empty. Baseline full-history Gitleaks and an independent comparison against configured secret/allowlist values found zero credential matches. Private commit contact metadata, local filesystem paths and personal planning details were sanitized across the unpushed history, preserving logical commit boundaries and code. Private original-history backup stays outside Git; current documentation references use rewritten hashes. All eight synthetic UI evidence screenshots were reviewed and retained. Expanded ignore rules protect credentials, deployment metadata, dumps/exports and raw runtime/test artifacts. See `docs/security/PRE_PUSH_REVIEW.md`. Final secret/metadata/formatting checks must pass before sending only `main`; remote SHA and CI are verified separately. No application code, dependency or database migration changed in this hygiene step; no finance release/deployment is inferred.

## 2026-11-11 — P1-S05 chart of accounts and owned ledger schema

Completed locally: P1-S05 implementation and reproducible checks, pending accounting/security peer review and reviewed merge. The user explicitly authorized S05 after the first published foundation CI succeeded and approved staged FX support. The story is isolated on `feat/p1-s05-ledger-schema`; no S06/Phase 2 implementation or automatic main merge is included.

### Behavior and changed files

- `prisma/schema.prisma` and migrations `202611110004_ledger_schema`, `202611110005_ledger_search_path`, `202611110006_reversal_predecessor`: owned Account/Journal/Posting/OpeningBalance/Currency/FXRate/LedgerOperation, exact positive minor units, scoped keys/indexes, kind/scale checks, immutable evidence, commit-time balance/operation/opening/reversal checks, archive locks, revision writes and pinned invoker search paths. Base currency INR; original/native fields preserved; foreign accounts/rates modeled while foreign posting is blocked by approved policy.
- `src/lib/ledger/{money,chart,queries}.ts`: no-number accounting, canonical decimal parsing/formatting, normal signs and owner-scoped financial reads with string monetary DTOs. `src/lib/schema-version.ts` centralizes version 6; health readiness uses it. There is no balance cache, financial write endpoint or account UI.
- `src/lib/ledger/money.test.ts`, `tests/integration/{ledger-schema,platform}.test.ts`, `scripts/rehearse-production-schema.ts`: exact numeric boundaries, real SQL negatives/rollback/immutability/owned reads, operation/correction structure, opening/card signs, multiset reversals, deterministic races (including late append), applied-file checksums, fresh private schema and temporary restricted writer. Existing auth/UI suites remain regressions.
- `docs/setup/supabase-runtime-grants.sql`: new financial tables remain SELECT-only. The rehearsal grants temporary financial writes/assertion-helper execution only inside its disposable DB, verifies invoker constraints, and removes that DB/roles. `package.json`, CI and `scripts/verify.sh` require the reproducible `test:schema` check.
- Documentation: ACCOUNTING, architecture/PRD, ADR-004, S05 story/technical review, backlog/roadmap/decisions, traceability, Supabase guide/grants, README, phase gate and this evidence record. No dependency or generated/private file is added.

### Migrations and corrective review

004 applied first to the dedicated local test DB. Review identified implicit pg_temp precedence, so 005 hardened function search paths; subsequent review required an already-posted reversal predecessor, so 006 prevents circular draft graphs. Earlier applied files remain unchanged; the SHA-256 integration check proves this for all six migration files. All three new migrations were applied successfully to local dev and test; readiness is 6. Existing auth/workspaces/sessions are retained. Currency rows are immutable reference metadata, not demo balances. No hosted Supabase migration, real financial data, bank access, paid service or public application deployment was performed.

### Executed checks

| Command / evidence                                                     | Result                                                                                                                                                                                                   |
| ---------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `npx prisma format`, `npx prisma validate`, generation                 | PASS                                                                                                                                                                                                     |
| `npm run db:migrate:test`, `npm run db:migrate`                        | PASS; all six migrations, dev/test upgraded; subsequent runs no pending migrations                                                                                                                       |
| `npm run lint`, `npm run typecheck`, formatting                        | PASS, zero lint warnings                                                                                                                                                                                 |
| `npm run test:unit`                                                    | PASS, 80 tests                                                                                                                                                                                           |
| `npm run test:integration`                                             | PASS, 48 tests / 4 files; includes 28 S05 cases and applied checksums                                                                                                                                    |
| `npm run build`                                                        | PASS, private routes retained; no financial route exposed                                                                                                                                                |
| `npm run test:e2e`                                                     | PASS, 46 desktop/mobile Chromium regressions (21.1s in the first complete pipeline)                                                                                                                      |
| Fresh private-schema/restricted-role rehearsal                         | PASS, all six migrations, zero Prisma schema drift, financial read-only default, temporarily granted invoker writer rejects invalid/immutable operations, no public tables; disposable resources removed |
| `python3 scripts/check_foundation.py`, `git diff --check`, Bash syntax | PASS; structural checks are not accounting gate evidence                                                                                                                                                 |

The initial integration test declaration used JSON formatting for bigint fixture labels and failed before tests executed; labels were fixed and the full suite rerun successfully. The first branch-creation approval timed out before execution; its allowed retry succeeded. No application/security/accounting failure was waived. The first complete pipeline passed 80 unit / 47 integration / 46 browser; the final additional concurrent-append test raised integration to 48, passing separately. Final updated pipeline status is recorded below after execution. No production credential values, owner addresses, private paths, raw test reports or generated clients belong in the commit.

### Security, limitations and next story

Technical review: `docs/security/S05_REVIEW.md`, agent-owned, not an independent audit. Composite scope/currency constraints and server-only read filters isolate records. Deferred validation plus parent row writes prevent stale-snapshot finalization; schema-pinned invoker queries resist temporary-table spoofing. Production financial permissions stay read-only before S06. Privileged migration administrators remain trusted; strict decimal-string validation is mandatory before SQL binding. Unsupported foreign postings, available-funds limits, closed-period/refund policies and hosted operations are not implied by these schema checks.

S06 remains the next story after S05 review/merge: authorized posting/reversal/correction orchestration, payload-hash-matched idempotent replay, atomic financial audit and command retry handling. S07 account CRUD/opening correction/reconciliation and S08–S09 templates/gate are still pending. Phase 1 remains blocked for release. The final deliverable reports the actual local story commit/PR; no reviewed merge or phase PASS is fabricated.

### S05 final local pipeline

Final `npm run verify:pipeline` with the added required `test:schema` step exited 0: dev/test migration status, formatting, lint, strict typecheck, **80 unit / 48 PostgreSQL integration / 46 desktop/mobile browser tests**, fresh private-schema/restricted-role rehearsal, zero Prisma drift, production build and foundation-doc checks all PASS. Final browser run: 18.2s. Schema/constraint code did not change after this run; only this final evidence paragraph was added. No failed required check remains. The development watcher is restarted to refresh generated model metadata without rotating secrets or deleting sessions. Remote branch CI/review is reported separately from local evidence.

## 2026-11-11 — P1-S05 fresh adversarial accounting/security review

Reviewed source `12433608f7a7de51f3f445dd333a74b77fd9fd4b`; initial working tree clean. The prior S05 technical review was treated as unverified claims. New source/SQL analysis and local experiments are recorded in `docs/security/S05_ADVERSARIAL_REVIEW.md`, with an extractable, redacted reproduction artifact at `docs/security/evidence/S05_ADVERSARIAL_PROBES.md`. This is a fresh agent verification, not an external human signoff or reviewed merge. No story implementation was completed by this review.

**Decision: CONDITIONALLY APPROVED for the current INR-only, financially read-only S05 foundation.** No Critical/High defect in current balanced-posting/immutable-history/scope/cycle/runtime privilege protections was confirmed. Medium gaps: draft header financial meaning is not covered by revision CAS; CORRECT can reverse its own same-operation replacement; Prisma diff/file checksums do not detect removed SQL invariants. Future mutable-label history and financial endpoint authorization boundaries are recorded separately as risks, not current exploitable endpoints. The review specifies exact references, reproductions, impacts, corrections and required regressions for each finding.

Re-executed: `npm run test:unit` PASS (80/5 files), `npm run test:integration` PASS (48/4 files), `npm run test:schema` PASS (fresh private schema/restricted-role rehearsal), `npm run lint` PASS (zero warnings), `npm run typecheck` PASS, and `python3 scripts/check_foundation.py` PASS (structural only). Independent `node /private/tmp/ledgerone-s05-adversarial-review.mjs` final run exited 0: all six migrations plus the complete 48-test suite on a separate fresh DB; 89 sampled constraint/trigger/function definitions matched fresh replay in both local test and development; all six existing test migration file hashes matched. New competing-finalizer races leave one posted result/receipt at READ COMMITTED/REPEATABLE READ/SERIALIZABLE (losers 23514/40001/40001); duplicate-key race leaves one receipt (23505 loser). Additional writer imbalance/502-leg/posted-header/duplicate-reversal/DDL/replication negatives reject correctly. A scratch-only opening correction with original marker retained and GENERAL replacement succeeds. Removing SQL protections leaves Prisma diff and file-hash checks green, proving the assurance gap. Temporary probe harness cast/binding/lock-observer errors were corrected, not classified as product defects; final source/results are preserved. Scratch resources were removed.

Prerequisites: Node 22.22.0/npm 10.9.4, installed dependencies, local PostgreSQL 17.6 reachable through private loopback development/test profile; fresh rehearsals require local CREATE DATABASE/CREATE ROLE plus lock-observer visibility. Existing test suite uses only its guarded `_test` DB; probe mutations use newly generated scratch DBs, with existing test/development catalog reads only. Build/browser/hosted checks were not rerun for this documentation-only review; historical 46-browser results are not presented as new evidence. No production URL/secret or real financial data is included.

Only review/evidence/progress/traceability documentation changed; application code, existing tests and migrations 004–006 remain untouched. S06 preconditions include reviewed S05 merge and acceptance of the specified draft-version/correction-target conditions. Financial writes remain disabled pending actual authenticated handler tests, hash-matched replay/retries, forward financial-audit schema support (current action CHECK permits only workspace events), invariant-catalog assurance and reviewed writer grants. S07 must define archive/restore corrections, original opening-provenance chains, balance-as-of/reconciliation and historical metadata policy. No remote push, merge, production migration, deployment or S06 work was performed. Phase 1 remains blocked for release. Final documentation formatting/structure/whitespace results follow after validation.

Final review-document checks: `npm run format:check`, `python3 scripts/check_foundation.py` and `git diff --check` PASS. The formatted Markdown probe source was extracted and executed again with exit 0 and the same recorded findings/control results. Eight Markdown files are changed/new; no application, existing test, configuration or migration file is changed. Review documentation remains local and uncommitted; reviewed target remains `1243360`.

## 2026-11-11 — S05 reviewed-merge preparation and S06 engineering backlog

Repository/PR inspection: branch `feat/p1-s05-ledger-schema`, implementation head `1243360`, main `ace657b`; PR #1 OPEN/DRAFT/unmerged with zero review submissions or inline review threads at inspection. The prior adversarial review was local/uncommitted. The user authorized finding/story tracking and S06 delivery under the existing reviewed-merge workflow, then selected themselves for the human review: “I will review it.” That is pending intent, not completed approval. GitHub author self-approval cannot be substituted; use the user's actual final-head review comment/evidence and honor any repository rules. No approval/merge or S06 implementation was fabricated.

Created Phase 1 milestone #1, 16 workflow labels, and 16 linked open epic/story/finding issues #2–#17. P1-E3 parent #2; S06 sub-epics #3–#5; S05 closure #6; S06 umbrella #7; ordered slices P1-S06A..D #8–#11; S07 #12; A05-01..A05-05 #13–#17. The GitHub connector successfully read repository/review data but issue creation returned 403 `Resource not accessible by integration`; the already authenticated GitHub CLI completed authorized tracker mutations. No tracker issue is closed or represented as implemented.

Deliverables: `docs/HANDOFF_S05_S06.md`, `docs/security/S05_FINDINGS.md`, full mandatory story contracts `docs/stories/P1-S06{,A,B,C,D}.md` and `P1-S07.md`, and `docs/gates/S06_WRITES.md`. Foundational PRD/accounting/architecture/roadmap/backlog/decisions/traceability/phase checkpoint updated with planning-only scope and links. Verified review evidence is committed separately (`f93a992`, `[P1-S05]`). Planned S06 selects private atomic command drafts and explicitly excludes persisted editable-draft finalization; correction intent, additive financial audit, canonical replay/hash conflicts, actual-handler authorization, deterministic locks/retries and invariant drift attestation have testable acceptance and regression tasks. A05-04 remains a tracked S07 metadata/account workflow deferral; none of the five findings is marked resolved.

`npm run verify:pipeline` exited 0 after the planning/review documents: local DB healthy; six dev/test migrations, no pending migration; formatting, lint (zero warnings), strict typecheck; **80 unit / 48 PostgreSQL integration / 46 desktop/mobile Chromium tests (35.0s)**; fresh private-schema/restricted-role rehearsal; production build; foundation structural checks all PASS. Its invoked commands were `npm run db:up`, `npm run db:generate`, `npm run db:migrate`, `npm run format:check`, `npm run lint`, `npm run typecheck`, `npm run db:migrate:test`, `npm run test:unit`, `npm run test:integration`, `npm run test:schema`, `npm run build`, `npm run test:e2e`, `python3 scripts/check_foundation.py`. Environment: Node 22.22.0/npm 10.9.4, Docker PostgreSQL 17.6 and private loopback profiles. Benign outer-home lockfile and NO_COLOR/FORCE_COLOR notices were emitted; no failed required check was waived. These S05/foundation passes do not change S06 W01–W15 from NOT RUN.

Source/migrations changed: none. All application/test/configuration/grant SQL and applied migration files remain unchanged; only Markdown documentation is added/updated. Financial runtime grants remain SELECT-only and the INR-only FX restriction remains intact. No hosted connectivity/migration/grant, public deployment, paid service or real financial data action occurred. Staged configured-secret scan and Gitleaks review-directory scan passed for the review commit; final staged/history and remote checks are reported at publication. Scanner/private env/raw browser reports are excluded.

Recommendation: **CONDITIONAL PASS for the engineering handoff only**; S05 reviewed closure BLOCKED on actual human review/current-head checks and reviewed merge; S06 implementation NOT STARTED; S06 write gate NOT RUN/FAIL closed; Phase 1 release blocked. Next implementation is P1-S06A after S05's required reviewed merge. See the handoff for the concrete review checklist and acceptance/disposition details. No implementation story or finding was completed by issue creation/documentation.

## 2026-11-11 — Confirmed S05 owner review/merge and P1-S06A controls

The owner confirmed: “It was reviewed by me and merged. So please for anything new use s06 branch or a different handoff branch.” GitHub shows their merge of implementation `1243360` as `54efed5e266847ec66c0a54caf15b9c4e5fb358a` at 12:58:49 UTC; original source-head foundation checks succeeded. Actual confirmation is recorded at https://github.com/i-am-tj/LedgerOne/pull/1#issuecomment-6796866109; native review submissions remain empty and no APPROVED review was fabricated. S05 closure #6 is completed. New docs pushed after that merge were not part of PR #1; its description was corrected to the actual merged scope. The attempted draft-to-ready action detected the externally merged PR and did not reopen/merge it.

Per user instruction, new work uses `feat/p1-s06a-command-controls`, based on merged main. Two review/handoff commits were carried onto it separately as `95daf37` and `e0b476d`; no new implementation is put on S05's branch. P1-S06A #8 is the only active implementation slice; its reviewed merge is required before P1-S06B. All five finding issues #13–#17 remain open for their complete linked acceptance.

Implemented S06A: additive `202611110007_command_audit_controls` (readiness 7), scoped immutable financial audit operation/target/reason with action semantics and unique operation audit; same-operation CORRECT predecessor rejection; catalog manifest capture/comparison with consistent read-only snapshots and preserved SQL literals; local-only target-vs-fresh attestation operator; disposable reference helper with full test-profile validation; 21 new PostgreSQL control regressions and 9 unit comparator/reference guards. Private-schema rehearsal now inserts a financial audit under temporary constrained writer and detects changed privileges. `ledger:attest` is required by CI/local pipeline. ADR-005, technical review, handoff/finding/gate/story/requirement documentation distinguish controls from unimplemented commands.

Changed source: `prisma/schema.prisma`, migration 007, `src/lib/schema-version.ts`, `src/lib/ledger/{invariant-manifest,invariants,invariants.test}.ts`, `scripts/lib/fresh-ledger-database.ts`, `scripts/verify-ledger-invariants.ts`, `scripts/rehearse-production-schema.ts`, `tests/integration/command-controls.test.ts`, `package.json`, `scripts/verify.sh`, `.github/workflows/ci.yml`. No dependency added. Published financial runtime grants and INR FX CHECK unchanged; no command API/UI, hosted DB/grant or deployment. Legacy/raw SQL receipts are not retrospectively declared audited; actual mandatory command audit/auth/replay/retry remain S06B/C.

Initial unit fixture inference/typecheck and a temporary automated fixture edit produced errors; the fixture was rewritten with explicit manifest types, then typecheck and all checks rerun successfully. No failing required check was waived and migration 007 was not edited after persistent local application. Scratch-only audit/DDL tests passed before it was applied to dev/test; all seven migration hashes pass and prior 001–006 bytes match merged S05.

Final `npm run verify:pipeline` exit 0 (private raw output remains outside repository): `npm run db:up`, `db:generate`, `db:migrate`/`db:migrate:test` (seven, no pending); `format:check`, `lint` (zero warnings), `typecheck`; **89 unit / 69 integration / 46 desktop/mobile browser tests (17.8s)**; `test:schema` (fresh private schema, zero Prisma diff, constrained writer audit and invariants/ACL); `ledger:attest` (actual local test catalog/security/migration state matches fresh reference); `build`; `python3 scripts/check_foundation.py`. Standalone exact command `npx vitest run --project integration tests/integration/command-controls.test.ts` first passed 18, then 20 strengthened cases; final full suite includes 21 with literal-preservation regression. Final guard additions were followed by a complete rerun. Environment: Node 22.22.0/npm 10.9.4, PostgreSQL 17.6 on local Docker, private loopback dev/test profile; fresh references need local CREATE DATABASE, private rehearsal also CREATE ROLE. No hosted execution.

Implemented does not mean done: S06A current-head human review/merge remains pending. Recommendation **CONDITIONAL PASS for S06A review readiness**; full S06 write gate W01–W15 NOT RUN/FAIL closed and Phase 1 release blocked. POST/REVERSE/CORRECT HTTP handlers, two-user command isolation, canonical replay/hash conflicts, mandatory command audit, deterministic service locks and actual serialization/deadlock retry behavior are still unimplemented. Next story is S06B only after this slice's reviewed merge. The final report/PR records actual commit and remote checks separately.

Publication check: configured-secret scan PASS for all 32 staged files; exact index-only publication snapshot Gitleaks PASS (~800 KB). An initial overly broad working-directory scan included ignored private/generated files and reported 19 findings; it was replaced by the publication snapshot scan, with no suppression of staged findings. Ignored environments/builds/dependencies and raw reports remain excluded from the push. Final documentation formatting/structural/whitespace checks PASS; no source changes followed the final 89/69/46 pipeline.

S06A publication: implementation commit `cf37cda63453193b3f9113c4b41d6b40148865a0` on the separate `feat/p1-s06a-command-controls` branch; [PR #18](https://github.com/i-am-tj/LedgerOne/pull/18) opened for this single control slice. Explicit-branch Gitleaks history scan PASS (19 commits / ~1.11 MB), working tree clean after the implementation commit. Only final review-link documentation follows it; no source/test/migration change. Current-head remote checks and human review remain separately visible on PR #18. No auto-merge or native self-approval was enabled.

## S06A CI Ubuntu dependency repair

Current-head runs 43046985983/43046996454 and their fresh-runner retries passed all migration/code/accounting/build steps, then failed `npx playwright install --with-deps chromium` with repeated `Temporary failure resolving security.ubuntu.com` and exit 100. Remote E2E did not run in those attempts; no remote PASS is fabricated. The user requested fixing this failure while reviewing S06A.

CI repair uses official Microsoft Playwright `v<installed @playwright/test version>-noble` image with bundled matching browsers/system libraries, verified manifest for 1.65.0 (Linux amd64/arm64). New `scripts/test-e2e-ci.sh` preserves exact Node 22.22.0 via a read-only host Node prefix, the same checkout/artifacts/runner UID, complete unchanged E2E command and guarded loopback database using Linux host networking. No container job service-host exception, test skip, extra capability, production credentials or Docker socket is introduced. Workflow replaces runtime apt/browser installation with this CI-only container step. Native local E2E, application, migrations and financial runtime permissions are unchanged. Shell/YAML/docs checks and new-head real CI are required; this repair is not deemed successful until remote browser tests execute.

## S06A cleanup race found by CI and corrected

The container repair was independently verified by PR run 43052573744/job 130633392500: exact Node 22.22.0 and **46 browser tests PASS (36.4s)**, entire job SUCCESS. Parallel push run 43052564467 failed earlier in `ledger:attest` after comparison because FORCE-dropping the reference database raced pg pool socket shutdown and emitted unhandled 57P01 with client diagnostics. This was a real tool-lifecycle defect, not classified as the Ubuntu outage or waived.

Corrected `scripts/lib/fresh-ledger-database.ts`: generated-name guards, bounded wait for zero active connections, DROP without FORCE, independent cleanup connection and creation-failure cleanup. Private-schema rehearsal shares safe deletion and prints PASS only after cleanup. The operator captures pool idle errors, returns redacted failure and reports PASS only after all reference resources close. Added regression deliberately holds a reference connection through cleanup timeout, verifies no termination/client query still works, then closes and successfully retries cleanup. No financial schema/API/grant change; migration 007 checksum retained.

Final `npm run verify:pipeline` after correction exited 0: **89 unit / 70 PostgreSQL integration / 46 browser tests (26.3s)**; formatting/lint/typecheck, seven migrations/no pending, fresh private-schema/restricted-role audit rehearsal, actual local test-vs-fresh attestation, build and structural checks PASS. Private raw log: outside repository. Standalone `npm run test:integration`, `npm run ledger:attest`, `npm run test:schema`, lint/typecheck and Bash syntax/YAML formatting also PASS. No source changes followed this final full run. Current-head remote checks and the user's in-progress review still block merge/S06B; the earlier 89/69/46 records remain historical runs rather than current totals.

## 2026-11-11 — S06A final current-head review

Independently inspected PR #18 at `2a24b1582ad58e64434f4a1bb10e67849772a849`, not the earlier implementation commit. Found and reproduced Medium S06A-R01 (#19): incoming runtime-role grants silently delegated financial SELECT without manifest drift. Fixed in `af74b60`: incoming/outgoing transitive membership edges, grantor/options, identity-only normalization; six regression cases. No migration or runtime-grant bytes changed. Complete finding, source locations, reproduction, impact, required correction and regression evidence: `docs/security/S06A_FINAL_REVIEW.md`.

Initial-head unit/integration 89/70 PASS did not establish approval. Independent supplemental script passed 21 existing-record audit, rollback, immutability, actual pre-007 upgrade and safe-cleanup assertions (extractable source in `docs/security/evidence/S06A_FINAL_PROBES.md`). A separate isolated role probe confirmed the real privilege drift. After correction, `npm run verify:pipeline` exited 0: format/lint/typecheck/build, seven-migration status, **89 unit / 76 integration / 46 desktop/mobile browser tests (20.5s)**, fresh private-schema restricted-role rehearsal/zero Prisma diff, actual local test-vs-fresh attestation and foundation checks. Node 22.22.0/npm 10.9.4, local Docker PostgreSQL 17.6; no hosted/real data operations.

S07 now explicitly requires an additive OPENING audit action/validator extension, exact scoped marker/target checks, atomic audit rollback and replay/concurrency regressions. Existing 007 intentionally excludes opening financial audit; no opening command is exposed. Review is agent-led, not fabricated human/peer approval. The owner's latest instruction explicitly authorizes merge after passing final review. Corrected-source decision: APPROVED for S06A only; publication-head CI and expected-head merge must be recorded on PR #18. S06B/C/D remain unimplemented, all five A05 issues remain open for their full acceptance, and financial write gate/Phase 1 remain closed.

Publication CI at `b4dadc7` rejected formatting in the final-review Markdown table after a last evidence edit. The report was reformatted and rechecked; no accounting/code assertion was waived. This initial-head failure is retained separately from final-head checks.

## 2026-11-11 — S06A merge PASS; S06B planning only

PR #18 final reviewed HEAD `423c6bd148ce86048ea3c3fa8e1510c45a72fb4c` merged at `df56d4647169f289ac22aef8338f5f8fd8dc964a` (16:43:14 UTC). Final review decision APPROVED, [comment 6801618802](https://github.com/i-am-tj/LedgerOne/pull/18#issuecomment-6801618802). Agent-led fresh verification and explicit owner conditional merge authorization are recorded accurately; no new human/native approval fabricated. Both exact-head remote CI runs 43060355412/43060363193 succeeded: **89 unit / 76 integration / 46 browser** each, with schema/attestation and every required check green. No protection/admin bypass. Connector lacked merge permission; authenticated CLI exact-head guarded merge succeeded.

S06A #8, P1-E3A #3 and resolved Medium S06A-R01 #19 are closed/done; A05 #13–#17 remain open for complete B/C/D/S07 acceptance. Epic integration scenarios passed in the complete pipeline and supplemental 21-probe audit/upgrade/cleanup review. S07 #12 carries explicit OPENING-audit schema/target/marker/atomicity/replay tests.

After actual merge, new `docs/p1-s06b-plan` branch prepares `docs/stories/P1-S06B_BREAKDOWN.md`: strict bounded API/results/errors, canonical v1 tuple/hash, private atomic draft/audit transaction, replay/conflict and real 40001/40P01 bounded retry behavior, five task packages and nine acceptance/test mappings. Implementation story remains #9 under #4; no new command code/route, grant, migration or hosted operation. Documentation-only checks/publication are recorded separately; no repeated accounting run is claimed for prose edits. Financial write gate W01–W15 remains NOT RUN/FAIL and Phase 1 is incomplete.

## PR #20 targeted planning review

The owner accepted S06B planning in principle and authorized four targeted clarifications: immutable replay after archive/rename, fresh-snapshot recovery including uncertain COMMIT, mandatory command audit with future controlled consumer-template reasons, and a combined real-handler atomicity/balances/private-draft/replay scenario. Applied without changing B-T01–05/B-AC01–09 identities or expanding feature scope. No implementation before final-head CI and reviewed planning merge. Review/merge evidence is recorded on PR #20; no human/native approval fabricated.

## S06B B-T01 contract implementation

PR #20 reviewed and merged as 75f8795 after final 21df416 CI 43064209449/43064220744 passed; review comment 6802164820 records explicit owner authorization/provenance. New feat/p1-s06b-post branch implements strict bounded raw INR POST parsing and canonical v1 digest with exact decimal strings, calendar/Unicode/UUID/key/body limits, deterministic repeated-leg ordering and immutable DTO contract. 27 new unit cases (116 total) pass; lint/typecheck pass after fixing an ES target fixture and control-regex lint issue. No route/executor/grant exists at this package. B-T02 follows only after these checks pass.

## S06B B-T02 atomic authenticated boundary

Implemented real session/allowlist/origin validation, server-derived actor/request IDs, scoped workspace and deterministic account locks, private journal/receipt/postings/finalization/mandatory audit in SERIALIZABLE transaction, and immutable result projection. The actual App Router POST remains deliberately incapable of financial writes (null executor, no env enable switch); test activation is restricted to newly generated loopback disposable databases and least-privilege non-owner writer roles, with catalog attestation before execution. No production grants or migrations changed. B-T02 has nine real-session/restricted-writer tests including six staged failures, invalid deferred audit rollback at COMMIT and scope/origin/draft/exposure denials. Full integration PASS 85/6 files, lint/typecheck PASS. Replay/concurrency/retry evidence follows in B-T03/B-T04; this intermediate package is not S06B completion. Draft implementation PR #21.

## S06B B-T03 canonical replay and fresh-snapshot recovery

Implemented scoped same-key replay/conflict before account metadata eligibility, preserving immutable results after archive/rename. Named receipt uniqueness/40001 contention recovery opens a new authorized transaction/snapshot; repeated leg multiplicity survives, hash conflicts do not mutate the winner, and uncertain committed response/absent aborted receipt recover safely with the same key. Six additional targeted integration scenarios pass (15 POST tests total). The race test initially passed financial counts but did not force a retry; a four-request snapshot barrier now proves distinct transaction IDs and actual recovery attempts. Full 10-second budget/jitter/deadlock classification is B-T04, not claimed here. No production exposure/grant/migration changes.

## S06B B-T04 bounded complete retry and uncertain outcomes

Implemented at most three whole SERIALIZABLE attempts, 10-second deadline, bounded jitter, fresh authorization/attestation/connections/snapshots, exact retry classification (40001/40P01 and named receipt contention only), transaction-local statement/lock/PG17 transaction timeouts, late-connection disposal, pooled-setting reset and destruction of uncertain COMMIT connections. No retry of an ambiguous outcome; same-key next request recovers durable result. 128 unit PASS (12 retry-policy cases added), 20 targeted POST integration PASS: real command-victim 40P01, real 40001 success/exhaustion, statement timeout and settings reset, and transport acknowledgement loss injected after actual database COMMIT. The latter is an adapter fault simulation around a real commit, not a claimed real network outage. Lint/typecheck PASS. PostgreSQL timeout behavior reference: https://www.postgresql.org/docs/17/runtime-config-client.html. No production write/grant/migration change. B-T05 combined HTTP/security/attestation evidence follows.

## S06B B-T05 combined HTTP and security evidence

Implemented the combined HTTP-boundary POST scenario using the exact shared App Router handler with real verified sessions and a restricted non-owner writer in a fresh disposable DB: independent pre-COMMIT connection sees no private draft/receipt/postings/audit; afterward exactly one immutable balanced journal/receipt/audit and correct debit/credit-normal balances; deep-equal replay survives archive/rename; failed audit preserves all counts/balances. Added actual Next-route browser denial (no write capability/env switch), real session expiry/revocation/allowlist/removal/unverified identity and mid-retry revocation, cross-user/key scopes/spoofing, target trigger/function/version/checksum drift, denied runtime DDL/audit/history operations, unrelated unique failure, activation empty/unknown/unavailable/owner negatives, real lock timeout and archive race. Canonical payload/legs are now frozen across async boundaries; activation rejects effective inherited table ownership. Four activation test helpers were initially placed in the options object instead of the harness result; corrected before final tests/typecheck.

Final `npm run verify:pipeline` exited 0: all seven migrations/no pending dev/test changes; format/lint/typecheck; **129 unit / 116 integration / 48 desktop/mobile browser tests (19.7s)**; fresh private-schema restricted-role schema/audit/ACL rehearsal and zero Prisma drift; actual local test-vs-fresh invariant attestation; build; structural checks. Node 22.22.0/npm 10.9.4 and local Docker PostgreSQL 17.6, ignored guarded local profiles; fresh fixtures require local CREATE DATABASE/CREATE ROLE. Source-test data only; no hosted DB, real banks or production grants. Git diff confirms migrations 001–007, Prisma schema and published runtime grant SQL unchanged. B-T01–05 implemented in order with tests; S06B is not DONE until final-head CI, accounting/security review and reviewed merge. Full S06 write gate stays closed; S06C/S07 not begun.

Additional B-AC08 regression uses a real HTTP client abort after the shared handler has completed database COMMIT and before its response is delivered. The independent observer sees the durable receipt, the client receives AbortError, and subsequent fresh HTTP requests replay the exact original operation/result with one journal/receipt/audit. All three combined HTTP tests PASS. The test adapter only checks its own response socket; database cleanup remains non-forcing. Final full-suite evidence is refreshed for this additional regression.
