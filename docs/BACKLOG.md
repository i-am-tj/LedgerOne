# Current implementation backlog

> Current status (2026-11-12): S06B completed/reviewed merge `5af4c19`; S06C predecessor satisfied, planning acceptance pending. Full S06 gate closed, Phase 1 incomplete, normal-runtime financial writes disabled. [Verified closure](reports/S06B_CLOSURE.md). Earlier dated checkpoints retain the state and decisions recorded at the time.

The user’s 2026-11-11 expanded Phase 1 supersedes the initial S001–S024 execution order. Historical scope remains in archive/BACKLOG_INITIAL.md. Current IDs are P1-S01–P1-S09; P1-S05 is owner-reviewed and merged (review evidence and merge SHA in the current handoff); other story statuses are not inferred from it. Phase = milestone; epic = parent issue (fallback labeled parent); story = issue; tasks = checkboxes. Remote repository identity and tracker authorization are now confirmed; current Phase 1 issue links and S06 slice ordering are recorded in HANDOFF_S05_S06.md. Historical implementation/merge claims below remain distinct from current issue tracking.

Current remote workflow labels: `phase:1`, `epic:P1-E1`–`epic:P1-E4`, `type:epic`, `type:story`, `type:bug`, `type:decision`, `priority:P0`, `priority:P1`, `status:planned`, `status:in-progress`, `status:awaiting-review`, `status:blocked`, `status:done`. Trace commits/PRs to the current IDs. One story/PR at a time; required failures and unreviewed/unmerged stories block the next story.

## Milestone Phase 1

| Epic                          | Stories       | Integration scenario                                                    |
| ----------------------------- | ------------- | ----------------------------------------------------------------------- |
| P1-E1 Repository and platform | P1-S01–P1-S02 | Clean setup then keyboard/mobile/light-dark/state journeys              |
| P1-E2 Identity and ownership  | P1-S03–P1-S04 | Google allowlist/session expiry plus two-user scoped reads/writes/audit |
| P1-E3 Ledger and accounts     | P1-S05–P1-S07 | DB constraints → atomic reversal/retry → opening/reconciliation         |
| P1-E4 Baseline transactions   | P1-S08–P1-S09 | Canonical economic classifications → fresh DB phase gate                |

## P1-S01 — Scaffold and development environment

**ID:** P1-S01 | **Title:** Scaffold and development environment | **Epic:** P1-E1 | **Priority:** P0 | **Dependencies:** None

**User story:** As the owner, I want to run a reproducible local platform.

**Inputs (data/API/preconditions):** Approved stack and environment policy.

**Outputs (UI/API/schema/docs):** App, Compose, Prisma migration, health checks, CI and setup guide.

**Implementation tasks:**

- [ ] Scaffold strict Next.js.
- [ ] add lint/format.
- [ ] configure DB/migration/seed.
- [ ] verify clean setup.
- [ ] Update docs/traceability and record check output, migration recovery and review evidence.

**Acceptance criteria (Given/When/Then):** Given a fresh checkout with prerequisites, when the documented setup runs, then the app boots and required CI checks pass with no committed secrets.

**Unit tests:** Seed guards.

**Integration/E2E tests:** Fresh DB migration and health.

**Failure/edge cases:** Missing env, DB outage, seed production refusal.

**Rollback/migration notes:** Platform-only additive migration; disposable reset or reviewed forward repair.

**Definition of done:** Demonstrated behavior; server validation/authorization; safe migration recovery; applicable accessibility and empty/loading/error/success states; formatting, lint, typecheck, unit/integration and build green with reproducible evidence; docs current; accounting/security review where applicable; reviewed merge.

## P1-S02 — Design system and application shell

**ID:** P1-S02 | **Title:** Design system and application shell | **Epic:** P1-E1 | **Priority:** P0 | **Dependencies:** P1-S01 reviewed and merged

Status: locally verified, awaiting review; details and limitations in `docs/stories/P1-S02.md`. No remote merge recorded.

**User story:** As the owner, I want to navigate accessibly on mobile and desktop.

**Inputs (data/API/preconditions):** Navigation inventory, breakpoints and accessibility requirements.

**Outputs (UI/API/schema/docs):** Light/dark shell, component primitives and meaningful state components.

**Implementation tasks:**

- [x] Build theme/layout/sidebar/mobile navigation.
- [x] add accessible forms and states.
- [x] test visible states.
- [x] Update docs/traceability and record check output and migration recovery.
- [ ] Record S02 review and merge evidence.

**Acceptance criteria (Given/When/Then):** Given keyboard-only navigation at mobile and desktop widths, when routes and states are used, then focus is visible and no dead links exist.

**Unit tests:** Component states and theme persistence.

**Integration/E2E tests:** Keyboard, mobile, light/dark, empty/loading/error/success browser tests.

**Failure/edge cases:** Zoom, reduced motion, narrow widths and errors.

**Rollback/migration notes:** Reversible UI-only change; no schema migration.

**Definition of done:** Demonstrated behavior; server validation/authorization; safe migration recovery; applicable accessibility and empty/loading/error/success states; formatting, lint, typecheck, unit/integration and build green with reproducible evidence; docs current; accounting/security review where applicable; reviewed merge.

## P1-S03 — Authentication and sessions

**ID:** P1-S03 | **Title:** Authentication and sessions | **Epic:** P1-E2 | **Priority:** P0 | **Dependencies:** P1-S02 reviewed and merged; security review

Status: implemented locally; live owner Google sign-in and agent technical review recorded (see `docs/stories/P1-S03.md` and `docs/security/S03_REVIEW.md`); reviewed merge remains pending.

**User story:** As the owner, I want to sign in privately.

**Inputs (data/API/preconditions):** Google OIDC selected by user; owner allowlist; private environment secrets and reviewed session policy.

**Outputs (UI/API/schema/docs):** Login/logout, protected routes and expiring server sessions.

**Implementation tasks:**

- [x] Document provider/session/CSRF design for review.
- [x] implement flows.
- [x] test expiry and deny non-allowlisted identities.
- [x] Update docs/traceability and record automated evidence and migration recovery.
- [ ] Complete live Google acceptance, security review and reviewed merge.

**Acceptance criteria (Given/When/Then):** Given an anonymous, uninvited or expired identity, when private data routes are requested, then read/write access is denied; invited owner can sign in and out.

**Unit tests:** Session expiry and allowlist cases.

**Integration/E2E tests:** Real session/provider integration, origin protection and logout.

**Failure/edge cases:** Provider outage, callback replay and missing secrets.

**Rollback/migration notes:** Identity migration with session revocation recovery; never widen access.

**Definition of done:** Demonstrated behavior; server validation/authorization; safe migration recovery; applicable accessibility and empty/loading/error/success states; formatting, lint, typecheck, unit/integration and build green with reproducible evidence; docs current; accounting/security review where applicable; reviewed merge.

## P1-S04 — User-scoped authorization and audit baseline

**ID:** P1-S04 | **Title:** User-scoped authorization and audit baseline | **Epic:** P1-E2 | **Priority:** P0 | **Dependencies:** P1-S03 reviewed and merged

Status: ownership/audit foundation locally verified; see `docs/stories/P1-S04.md`. Actual account/transaction isolation cases depend on S05–S08 and remain release-blocking.

**User story:** As the owner, I want to keep my data isolated.

**Inputs (data/API/preconditions):** User model, ownership contracts and reviewed audit policy.

**Outputs (UI/API/schema/docs):** Scoped services/queries, audit schema and sanitized request tracing.

**Implementation tasks:**

- [x] Enforce owner at current Workspace boundaries and foreign keys.
- [x] Add atomic audit and sanitized trace IDs.
- [x] Exercise two-user current-resource negatives and rollback.
- [x] Update docs/traceability, check output and migration recovery.
- [ ] Record review/merge and financial-specific dependency follow-through with S05–S08.

**Acceptance criteria (Given/When/Then):** Given user A guesses user B IDs, when read/write requests execute, then access is denied with no business side effects.

**Unit tests:** Ownership and audit redaction.

**Integration/E2E tests:** Two-user DB/API isolation and rollback.

**Failure/edge cases:** Cross-owner references, missing owner and error logging leakage.

**Rollback/migration notes:** Additive audit schema; retain history under reviewed retention.

**Definition of done:** Demonstrated behavior; server validation/authorization; safe migration recovery; applicable accessibility and empty/loading/error/success states; formatting, lint, typecheck, unit/integration and build green with reproducible evidence; docs current; accounting/security review where applicable; reviewed merge.

## P1-S05 — Chart of accounts and financial schema

**ID:** P1-S05 | **Title:** Chart of accounts and financial schema | **Epic:** P1-E3 | **Priority:** P0 | **Dependencies:** P1-S04 reviewed and merged; accounting/security review

**User story:** As the owner, I want to trust exact owned ledger records.

**Inputs (data/API/preconditions):** Account kinds/signs, supported currency scales and native/functional contract.

**Outputs (UI/API/schema/docs):** Account/Journal/Posting/OpeningBalance/Currency/FXRate/operation schema and SQL constraints.

**Implementation tasks:**

- [x] Record approved core/staged-FX policy and accounting ADR; peer review remains pending.
- [x] Implement exact money.
- [x] Add scoped keys/indexes.
- [x] Enforce deferred balancing, lifecycle isolation and immutability.
- [x] Update docs/traceability, checks, migration recovery and agent review evidence.
- [ ] Obtain peer accounting/security review and reviewed merge.

**Acceptance criteria (Given/When/Then):** Given unbalanced or incompatible currency/account records, when the DB transaction commits, then PostgreSQL rejects them and correct account signs are retained.

**Unit tests:** Scale/sign/rounding/overflow cases.

**Integration/E2E tests:** Actual PostgreSQL constraints including direct SQL invalid writes.

**Failure/edge cases:** Zero legs, currency mismatch, foreign owner and overflow.

**Rollback/migration notes:** Migration rehearsal and backup/forward repair; never mutate posted history.

**Definition of done:** Demonstrated behavior; server validation/authorization; safe migration recovery; applicable accessibility and empty/loading/error/success states; formatting, lint, typecheck, unit/integration and build green with reproducible evidence; docs current; accounting/security review where applicable; reviewed merge.

## P1-S06 — Posting service and reversals

**ID:** P1-S06 | **Title:** Posting service and reversals | **Epic:** P1-E3 | **Priority:** P0 | **Dependencies:** P1-S05 reviewed and merged

**User story:** As the owner, I want to post once and correct without deleting history.

**Inputs (data/API/preconditions):** Authorized validated commands, chart of accounts and operation key.

**Outputs (UI/API/schema/docs):** Atomic posting/reversal/correction services and audit.

**Implementation tasks:**

- [ ] Lock accounts deterministically.
- [ ] post atomically.
- [ ] enforce payload-key match.
- [ ] reverse/replace with linked history.
- [ ] Update docs/traceability and record check output, migration recovery and review evidence.

**Acceptance criteria (Given/When/Then):** Given repeated or simultaneous posting attempts, when services commit or fail, then one idempotent outcome remains, all journals balance and reversal restores balances.

**Unit tests:** Journal balance, reversal and payload-hash cases.

**Integration/E2E tests:** Concurrent retries/reversals and forced rollback with audit.

**Failure/edge cases:** Deadlock, failure after commit and duplicate reversal.

**Rollback/migration notes:** Disable writes on invariant failure; use linked forward corrections.

**Definition of done:** Demonstrated behavior; server validation/authorization; safe migration recovery; applicable accessibility and empty/loading/error/success states; formatting, lint, typecheck, unit/integration and build green with reproducible evidence; docs current; accounting/security review where applicable; reviewed merge.

S06 detailed delivery plan: [P1-S06](https://github.com/i-am-tj/LedgerOne/issues/7) is the umbrella; ordered implementation slices [P1-S06A](https://github.com/i-am-tj/LedgerOne/issues/8), [P1-S06B](https://github.com/i-am-tj/LedgerOne/issues/9), [P1-S06C](https://github.com/i-am-tj/LedgerOne/issues/10), [P1-S06D](https://github.com/i-am-tj/LedgerOne/issues/11). Full contracts are in corresponding `docs/stories/` files. All remain blocked on S05 human review/merge and reviewed predecessors. Findings A05-01..A05-05 are tracked in `docs/security/S05_FINDINGS.md`; no finding is closed by planning.

## P1-S07 — Account management and reconciliation

**ID:** P1-S07 | **Title:** Account management and reconciliation | **Epic:** P1-E3 | **Priority:** P0 | **Dependencies:** P1-S06 reviewed and merged

**User story:** As the owner, I want to compare my accounts to statements.

**Inputs (data/API/preconditions):** Account/opening commands, statement date/native balances and entries.

**Outputs (UI/API/schema/docs):** Account UI, archive/history, balance-as-of and reconciliation API.

**Implementation tasks:**

- [ ] Implement scoped CRUD/archive.
- [ ] post openings to equity.
- [ ] calculate balances.
- [ ] mark statement items and discrepancy.
- [ ] Update docs/traceability and record check output, migration recovery and review evidence.

**Acceptance criteria (Given/When/Then):** Given posted openings and account activity, when balance-as-of and reconciliation run, then balances derive only from postings and discrepancies are visible; archive retains history.

**Unit tests:** Opening signs, as-of cutoff and difference arithmetic.

**Integration/E2E tests:** Two-user account UI/API and native reconciliation.

**Failure/edge cases:** Archived corrections, duplicate openings, backdating and date boundaries.

**Rollback/migration notes:** No balance overwrite; append-only adjustments and safe additive migrations.

**Definition of done:** Demonstrated behavior; server validation/authorization; safe migration recovery; applicable accessibility and empty/loading/error/success states; formatting, lint, typecheck, unit/integration and build green with reproducible evidence; docs current; accounting/security review where applicable; reviewed merge.

## P1-S08 — Income, expense and transfer commands

**ID:** P1-S08 | **Title:** Income, expense and transfer commands | **Epic:** P1-E4 | **Priority:** P0 | **Dependencies:** P1-S07 reviewed and merged

**User story:** As the owner, I want to capture activity with correct economic effects.

**Inputs (data/API/preconditions):** Exact amounts/currency/date/accounts/category and operation key.

**Outputs (UI/API/schema/docs):** Journal templates, minimal transaction form and history.

**Implementation tasks:**

- [ ] Implement cash/card expense/income/transfer/card settlement/FD/loan principal-interest.
- [ ] reject self-transfer.
- [ ] expose consumption query.
- [ ] Update docs/traceability and record check output, migration recovery and review evidence.

**Acceptance criteria (Given/When/Then):** Given reference cash/card/transfer/FD/loan scenarios, when commands post and history loads, then balances and net worth reconcile while transfers/principal never count as expenses.

**Unit tests:** Template and classification cases.

**Integration/E2E tests:** Mobile capture, invalid owner/account, idempotent submit and exact report totals.

**Failure/edge cases:** Self-transfer, stale account, amount overflow and network retry.

**Rollback/migration notes:** Retain posted history; correct via linked journals.

**Definition of done:** Demonstrated behavior; server validation/authorization; safe migration recovery; applicable accessibility and empty/loading/error/success states; formatting, lint, typecheck, unit/integration and build green with reproducible evidence; docs current; accounting/security review where applicable; reviewed merge.

## P1-S09 — Accounting test harness and gate evidence

**ID:** P1-S09 | **Title:** Accounting test harness and gate evidence | **Epic:** P1-E4 | **Priority:** P0 | **Dependencies:** P1-S08 reviewed and merged

**User story:** As the owner, I want to rely on reproducible invariant evidence.

**Inputs (data/API/preconditions):** Reviewed canonical independent totals, property cases and CI config.

**Outputs (UI/API/schema/docs):** Ledger regression suite and docs/gates/PHASE_1.md report.

**Implementation tasks:**

- [ ] Run property/invariant/isolation/concurrency suites on fresh DB.
- [ ] record all check output and reviews.
- [ ] Update docs/traceability and record check output, migration recovery and review evidence.

**Acceptance criteria (Given/When/Then):** Given a fresh PostgreSQL database, when the full phase gate executes, then all canonical scenarios and required checks pass with reproducible evidence.

**Unit tests:** Property invariants and independent exact expected totals.

**Integration/E2E tests:** Fresh DB, two-user isolation, raw constraint, concurrent write and rollback suite.

**Failure/edge cases:** Crash retry, serialization exhaustion and malicious scoped IDs.

**Rollback/migration notes:** FAIL blocks Phase 2; no invented pass or destructive ledger repair.

**Definition of done:** Demonstrated behavior; server validation/authorization; safe migration recovery; applicable accessibility and empty/loading/error/success states; formatting, lint, typecheck, unit/integration and build green with reproducible evidence; docs current; accounting/security review where applicable; reviewed merge.

## Local foundation amendment — P1-S04A

User-authorized interruption before P1-S05: [production profiles/public entry story](stories/P1-S04A.md). The existing P1-S01–P1-S09 dependency order and financial release gate are preserved. The supplied P1-S03 adapter/card edits are reviewed separately in [authentication review](security/AUTH_ADAPTER_REVIEW.md); additional provider setup is deferred. No remote issues or deployment were created.

## S05 local implementation checkpoint

See [S05 story](stories/P1-S05.md), [ADR-004](ADR/0004-owned-ledger-schema.md) and [accounting contract](ACCOUNTING.md). The user authorized advancement after foundation CI passed and approved staged FX. Schema constraints/read boundaries are implemented for review; S06 service/retries/audit, S07 UI/opening/reconciliation and S08–S09 classification/gate are not implied. Review/merge is still outstanding.

## Confirmed S05 closure and active S06A slice (historical checkpoint)

The owner explicitly confirmed: “It was reviewed by me and merged. So please for anything new use s06 branch or a different handoff branch.” [Human review evidence](https://github.com/i-am-tj/LedgerOne/pull/1#issuecomment-6796866109) records this confirmation without fabricating a native GitHub APPROVED review. PR #1 merged implementation `1243360` at `54efed5e266847ec66c0a54caf15b9c4e5fb358a`; its two original foundation CI checks passed. Tracker #6 is closed as completed. Earlier pending-review statements in historical checkpoints describe the state when written, not the current closure status.

New work is on `feat/p1-s06a-command-controls`, based on the owner's merged main. Post-merge review/handoff documentation was carried onto this separate branch. At this historical checkpoint, S06A #8 was the only active implementation slice: migration 007 adds scoped immutable financial audit context and rejects CORRECT's same-operation predecessor; invariant attestation/mutation regressions cover SQL/privilege/migration state. It adds no financial write handler or runtime grant. S06B/C/D remain blocked until the active slice's required checks, human review and reviewed merge. Findings remain open for their full linked acceptance; the complete S06 write gate and Phase 1 gate remain closed.
