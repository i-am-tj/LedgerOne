> Superseded by the user’s expanded Phase 1 on 2026-11-11. Historical planning only.

# Ordered local GitHub backlog

Status: proposal only. No GitHub milestones, labels, issues, PRs or hierarchy have been created. Repository identity and remote mutation permission are unconfirmed. All stories are `status:planned`; none is implemented, tested, reviewed or done.

## Tracker mapping

Phase = GitHub milestone. Epic = parent issue, with stories linked through supported sub-issues; fall back to an epic-labeled issue containing explicit story links. Story = implementation issue. Tasks = checkboxes inside the story. Import in the order below only after D02. One story/PR at a time; title commits and PRs `[Sxxx] ...`. Review/merge and green required checks precede the next story. Phases require a separate PASS gate and authorization.

Proposed labels: `phase:1` through `phase:7`; `epic:E01` through `epic:E07`; `type:epic`, `type:story`, `type:bug`, `type:decision`; `priority:P0`, `priority:P1`, `priority:P2`; `status:planned`, `status:in-progress`, `status:awaiting-review`, `status:blocked`, `status:done`. A label alone never proves completion.

## Epic issues

| Epic                                        | Milestone                             | User value                                                  | Integration scenario                                                         |
| ------------------------------------------- | ------------------------------------- | ----------------------------------------------------------- | ---------------------------------------------------------------------------- |
| E01: Reproducible private foundation        | Phase 1: Foundation                   | Deliver foundation with reviewed evidence                   | S001, S002, S003 together; execute the corresponding TEST_PLAN.md gate       |
| E02: Exact immutable ledger                 | Phase 2: Accounting core              | Deliver accounting core with reviewed evidence              | S004, S005, S006, S007 together; execute the corresponding TEST_PLAN.md gate |
| E03: Contextual transactions                | Phase 3: Daily capture                | Deliver daily capture with reviewed evidence                | S008, S009, S010, S011 together; execute the corresponding TEST_PLAN.md gate |
| E04: Import, portability and reconciliation | Phase 4: Data trust                   | Deliver data trust with reviewed evidence                   | S012, S013, S014 together; execute the corresponding TEST_PLAN.md gate       |
| E05: Budgets, bills and goals               | Phase 5: Planning                     | Deliver planning with reviewed evidence                     | S015, S016, S017 together; execute the corresponding TEST_PLAN.md gate       |
| E06: Investments, loans, FX and analytics   | Phase 6: Wealth and international use | Deliver wealth and international use with reviewed evidence | S018, S019, S020, S021 together; execute the corresponding TEST_PLAN.md gate |
| E07: Accessibility, privacy and recovery    | Phase 7: Private release readiness    | Deliver private release readiness with reviewed evidence    | S022, S023, S024 together; execute the corresponding TEST_PLAN.md gate       |

## S001 — Reproducible application and CI foundation

**ID:** S001 | **Title:** Reproducible application and CI foundation | **Epic:** E01 | **Priority:** P0 | **Dependencies:** None

**User story:** As the owner, I want to develop and verify from a clean checkout.

**Inputs (data/API/preconditions):** Empty workspace; Phase 1 authorization; compatible dependency versions.

**Outputs (UI/API/schema/docs):** Application scaffold, lockfile, CI workflow, env example and setup guide.

**Implementation tasks:**

- [ ] Verify supported dependencies.
- [ ] Initialize approved Git repository.
- [ ] Scaffold strict TypeScript.
- [ ] Configure format/lint/typecheck/unit/E2E/build commands and CI.
- [ ] Update relevant foundational docs and requirement/test links; record migration/security review and reproducible evidence.

**Acceptance criteria (Given/When/Then):** Given a clean checkout with documented prerequisites, when installation and checks run, then the shell builds and CI fails on a deliberately failing check.

**Unit tests:** Configuration/domain-boundary smoke checks.

**Integration/E2E tests:** Clean install and production build; CI command parity.

**Failure/edge cases:** Missing environment, unsupported runtime and secrets in client bundle.

**Rollback/migration notes:** No schema migration; remove scaffold via reviewed revert.

**Definition of done:** Acceptance behavior demonstrated; boundary validation and server authorization verified; applicable empty/loading/error/success and keyboard states verified; migration rehearsal or safe recovery plan recorded; formatting, lint, typecheck, relevant unit/integration/E2E checks and build green with command outputs; docs and traceability updated; required accounting/security review recorded; PR reviewed and merged. Until merge this story is not done.

## S002 — Private identity and session boundary

**ID:** S002 | **Title:** Private identity and session boundary | **Epic:** E01 | **Priority:** P0 | **Dependencies:** S001; D03 security review

**User story:** As the owner, I want to sign in privately with revocable sessions.

**Inputs (data/API/preconditions):** Approved provider, bootstrap owner and secret configuration; no public signup.

**Outputs (UI/API/schema/docs):** Auth configuration, server session helper, protected routes and threat-model ADR.

**Implementation tasks:**

- [ ] Review session/provider design.
- [ ] Implement login/logout/expiry.
- [ ] Deny uninvited identities.
- [ ] Protect server endpoints.
- [ ] Sanitize errors.
- [ ] Update relevant foundational docs and requirement/test links; record migration/security review and reproducible evidence.

**Acceptance criteria (Given/When/Then):** Given an uninvited or expired identity, when a protected route or action is requested, then access is denied; invited owner can sign in and revoke a session.

**Unit tests:** Session expiry, allowlist and authorization helper cases.

**Integration/E2E tests:** Real configured test provider/session integration; cookie, origin/CSRF and logout browser checks.

**Failure/edge cases:** Provider outage, stolen/revoked session, callback replay and missing secrets.

**Rollback/migration notes:** Versioned identity schema migration; rollback must revoke incompatible sessions, never widen access.

**Definition of done:** Acceptance behavior demonstrated; boundary validation and server authorization verified; applicable empty/loading/error/success and keyboard states verified; migration rehearsal or safe recovery plan recorded; formatting, lint, typecheck, relevant unit/integration/E2E checks and build green with command outputs; docs and traceability updated; required accounting/security review recorded; PR reviewed and merged. Until merge this story is not done.

## S003 — Accessible shell and controlled development fixtures

**ID:** S003 | **Title:** Accessible shell and controlled development fixtures | **Epic:** E01 | **Priority:** P1 | **Dependencies:** S002

**User story:** As the owner, I want to navigate an honest responsive product shell.

**Inputs (data/API/preconditions):** Authenticated session; approved navigation inventory.

**Outputs (UI/API/schema/docs):** Keyboard-accessible layout, implemented route states and guarded development seed command.

**Implementation tasks:**

- [ ] Build mobile/desktop shell.
- [ ] Add empty/loading/error/success boundaries.
- [ ] Show only available actions.
- [ ] Add deterministic dev fixtures with production refusal.
- [ ] Update relevant foundational docs and requirement/test links; record migration/security review and reproducible evidence.

**Acceptance criteria (Given/When/Then):** Given no records, when the owner opens the shell, then useful empty states appear without fake metrics; seed refuses production.

**Unit tests:** Seed environment guard and state rendering.

**Integration/E2E tests:** Keyboard/mobile navigation, error recovery and production seed rejection.

**Failure/edge cases:** No data, narrow viewport, failed request, reduced motion.

**Rollback/migration notes:** No financial seed data before ledger exists; UI revert; fixture command must not affect production.

**Definition of done:** Acceptance behavior demonstrated; boundary validation and server authorization verified; applicable empty/loading/error/success and keyboard states verified; migration rehearsal or safe recovery plan recorded; formatting, lint, typecheck, relevant unit/integration/E2E checks and build green with command outputs; docs and traceability updated; required accounting/security review recorded; PR reviewed and merged. Until merge this story is not done.

## S004 — Exact money and reviewed ledger schema

**ID:** S004 | **Title:** Exact money and reviewed ledger schema | **Epic:** E02 | **Priority:** P0 | **Dependencies:** S003; D04 review

**User story:** As the owner, I want to trust exact amounts and owned account records.

**Inputs (data/API/preconditions):** Reviewed account/sign/native-functional contracts and supported currency metadata.

**Outputs (UI/API/schema/docs):** Money module, journal schema, SQL constraints and migration recovery notes.

**Implementation tasks:**

- [ ] Parse decimal strings.
- [ ] Enforce scales/ranges.
- [ ] Model scoped foreign keys.
- [ ] Add append-only and deferred balance checks.
- [ ] Document locks.
- [ ] Update relevant foundational docs and requirement/test links; record migration/security review and reproducible evidence.

**Acceptance criteria (Given/When/Then):** Given mixed currencies or an unbalanced journal, when a transaction commits, then invalid data is rejected by PostgreSQL; exact minor units round-trip.

**Unit tests:** INR/JPY/KWD parsing, ties, overflow, invalid rate/scale.

**Integration/E2E tests:** Real PostgreSQL commit-time constraints and direct SQL bypass attempts.

**Failure/edge cases:** Zero-sided entries, mixed workspace, multi-row commit, unsupported currency.

**Rollback/migration notes:** Disposable migration up/down rehearsal; production changes use backup and forward repair.

**Definition of done:** Acceptance behavior demonstrated; boundary validation and server authorization verified; applicable empty/loading/error/success and keyboard states verified; migration rehearsal or safe recovery plan recorded; formatting, lint, typecheck, relevant unit/integration/E2E checks and build green with command outputs; docs and traceability updated; required accounting/security review recorded; PR reviewed and merged. Until merge this story is not done.

## S005 — Owned accounts and opening balances

**ID:** S005 | **Title:** Owned accounts and opening balances | **Epic:** E02 | **Priority:** P0 | **Dependencies:** S004

**User story:** As the owner, I want to record assets and debts with correct starting values.

**Inputs (data/API/preconditions):** Authorized workspace; account kind/currency; dated opening amount/source.

**Outputs (UI/API/schema/docs):** Account create/list/archive APIs and UI; opening-equity journals.

**Implementation tasks:**

- [ ] Validate account ownership/currency.
- [ ] Post opening balances atomically.
- [ ] Audit.
- [ ] Prevent referenced deletion.
- [ ] Update relevant foundational docs and requirement/test links; record migration/security review and reproducible evidence.

**Acceptance criteria (Given/When/Then):** Given an asset or debt opening, when saved, then a balanced opening-equity journal is created and no current income/expense is reported.

**Unit tests:** Sign convention, opening values and archive eligibility.

**Integration/E2E tests:** Cross-owner CRUD denial and atomic opening failure.

**Failure/edge cases:** Duplicate openings, archived accounts, zero balance and currency change.

**Rollback/migration notes:** Forward-only correction of posted openings; migrate nullable metadata before constraints.

**Definition of done:** Acceptance behavior demonstrated; boundary validation and server authorization verified; applicable empty/loading/error/success and keyboard states verified; migration rehearsal or safe recovery plan recorded; formatting, lint, typecheck, relevant unit/integration/E2E checks and build green with command outputs; docs and traceability updated; required accounting/security review recorded; PR reviewed and merged. Until merge this story is not done.

## S006 — Atomic posting, correction and idempotency

**ID:** S006 | **Title:** Atomic posting, correction and idempotency | **Epic:** E02 | **Priority:** P0 | **Dependencies:** S005; D04 accounting/security review

**User story:** As the owner, I want to post once and correct history without erasing it.

**Inputs (data/API/preconditions):** Authorized typed operation; stable idempotency key; reviewed posting recipes.

**Outputs (UI/API/schema/docs):** Server posting services, operation/audit tables and reversal/replacement APIs.

**Implementation tasks:**

- [ ] Implement expense/income/transfer/card/FD recipes.
- [ ] Lock records.
- [ ] Reject payload-key conflicts.
- [ ] Atomically reverse/replace.
- [ ] Prevent duplicate reversal.
- [ ] Update relevant foundational docs and requirement/test links; record migration/security review and reproducible evidence.

**Acceptance criteria (Given/When/Then):** Given a retried expense, when the same operation key repeats, then one journal exists; correction preserves original and adds balanced linked entries.

**Unit tests:** Every posting recipe and full/partial reversal allocation rules.

**Integration/E2E tests:** Concurrent identical writes, conflicting keys, cross-owner legs and forced transaction rollback.

**Failure/edge cases:** Deadlocks, timeout after commit, audit failure, closed period and insufficient native FX quantity.

**Rollback/migration notes:** Never delete posted data; feature-disable writes and forward-fix with linked corrections.

**Definition of done:** Acceptance behavior demonstrated; boundary validation and server authorization verified; applicable empty/loading/error/success and keyboard states verified; migration rehearsal or safe recovery plan recorded; formatting, lint, typecheck, relevant unit/integration/E2E checks and build green with command outputs; docs and traceability updated; required accounting/security review recorded; PR reviewed and merged. Until merge this story is not done.

## S007 — Adversarial ledger integration evidence

**ID:** S007 | **Title:** Adversarial ledger integration evidence | **Epic:** E02 | **Priority:** P0 | **Dependencies:** S006

**User story:** As the owner, I want to rely on accounting invariants under failure and concurrency.

**Inputs (data/API/preconditions):** Working ledger and real PostgreSQL test database.

**Outputs (UI/API/schema/docs):** Invariant suite, accounting review evidence and Phase 2 gate report.

**Implementation tasks:**

- [ ] Exercise all worked journals.
- [ ] Attack raw DB constraints.
- [ ] Race posting/refund/reversal.
- [ ] Verify audit integrity and zero duplicate operations.
- [ ] Update relevant foundational docs and requirement/test links; record migration/security review and reproducible evidence.

**Acceptance criteria (Given/When/Then):** Given failures and concurrent requests, when the suite runs, then all committed journals balance, tenant links remain valid and retries do not duplicate.

**Unit tests:** Property-based money/balance invariants with recorded seeds.

**Integration/E2E tests:** Real DB isolation, rollback and crash/retry scenarios.

**Failure/edge cases:** Privilege bypass attempts, stale reads, serialization retry exhaustion.

**Rollback/migration notes:** Test-only changes; keep writes disabled if gate fails.

**Definition of done:** Acceptance behavior demonstrated; boundary validation and server authorization verified; applicable empty/loading/error/success and keyboard states verified; migration rehearsal or safe recovery plan recorded; formatting, lint, typecheck, relevant unit/integration/E2E checks and build green with command outputs; docs and traceability updated; required accounting/security review recorded; PR reviewed and merged. Until merge this story is not done.

## S008 — Categories, merchants and contextual tags

**ID:** S008 | **Title:** Categories, merchants and contextual tags | **Epic:** E03 | **Priority:** P1 | **Dependencies:** S007

**User story:** As the owner, I want to organize purchases independently of where they happened.

**Inputs (data/API/preconditions):** Scoped names, category hierarchy and tag metadata.

**Outputs (UI/API/schema/docs):** Validated CRUD/archive UI/APIs and hierarchy rules.

**Implementation tasks:**

- [ ] Implement separate masters.
- [ ] Reject category cycles.
- [ ] Prevent cross-owner links.
- [ ] Preserve historical context.
- [ ] Accessible validation.
- [ ] Update relevant foundational docs and requirement/test links; record migration/security review and reproducible evidence.

**Acceptance criteria (Given/When/Then):** Given a merchant used across categories, when edited or archived, then categories remain independent and past purchases stay explainable.

**Unit tests:** Cycles, duplicate normalized names and archive rules.

**Integration/E2E tests:** Scoped CRUD and historical snapshot retention.

**Failure/edge cases:** Deep trees, renamed masters, archived selection and concurrent updates.

**Rollback/migration notes:** Additive schema; archive instead of destructive deletion.

**Definition of done:** Acceptance behavior demonstrated; boundary validation and server authorization verified; applicable empty/loading/error/success and keyboard states verified; migration rehearsal or safe recovery plan recorded; formatting, lint, typecheck, relevant unit/integration/E2E checks and build green with command outputs; docs and traceability updated; required accounting/security review recorded; PR reviewed and merged. Until merge this story is not done.

## S009 — Fast transaction capture and history

**ID:** S009 | **Title:** Fast transaction capture and history | **Epic:** E03 | **Priority:** P0 | **Dependencies:** S008

**User story:** As the owner, I want to capture expenses/income/transfers on mobile and inspect effects.

**Inputs (data/API/preconditions):** Authorized account/category context, exact amount, dates and key.

**Outputs (UI/API/schema/docs):** Forms, server APIs and paginated transaction history/details.

**Implementation tasks:**

- [ ] Build validated forms with RHF/Zod.
- [ ] Wire posting services.
- [ ] Distinguish transfer/card settlement.
- [ ] Handle pending/retry/error/success.
- [ ] Update relevant foundational docs and requirement/test links; record migration/security review and reproducible evidence.

**Acceptance criteria (Given/When/Then):** Given a valid capture, when submitted twice through a retry, then one journal and one visible transaction result appear with correct consumption.

**Unit tests:** Form contracts, date parsing and filter boundaries.

**Integration/E2E tests:** Mobile keyboard capture, server validation, unauthorized IDs and exact totals.

**Failure/edge cases:** Slow network, double submit, timezone midnight, backdated entry.

**Rollback/migration notes:** UI rollback keeps posted journals readable; no destructive data rollback.

**Definition of done:** Acceptance behavior demonstrated; boundary validation and server authorization verified; applicable empty/loading/error/success and keyboard states verified; migration rehearsal or safe recovery plan recorded; formatting, lint, typecheck, relevant unit/integration/E2E checks and build green with command outputs; docs and traceability updated; required accounting/security review recorded; PR reviewed and merged. Until merge this story is not done.

## S010 — Split purchases, refunds and tag semantics

**ID:** S010 | **Title:** Split purchases, refunds and tag semantics | **Epic:** E03 | **Priority:** P0 | **Dependencies:** S009

**User story:** As the owner, I want to explain each item and refund without double counting.

**Inputs (data/API/preconditions):** Parent context, exact split amounts, category/purpose/beneficiary and effective tag union.

**Outputs (UI/API/schema/docs):** Split editor, refund workflow and leaf-based query contract.

**Implementation tasks:**

- [ ] Validate split sum.
- [ ] Link expense leaves.
- [ ] Union tags distinctly.
- [ ] Allocate partial refunds atomically.
- [ ] Preserve parent context.
- [ ] Update relevant foundational docs and requirement/test links; record migration/security review and reproducible evidence.

**Acceptance criteria (Given/When/Then):** Given two splits and overlapping tags, when filtered, then each matching split counts once; total refunds cannot exceed purchase allocation.

**Unit tests:** Split arithmetic, tag union and remaining refundable amounts.

**Integration/E2E tests:** Split capture/reversal/refund and concurrent refund denial.

**Failure/edge cases:** Remainder minor units, duplicate tags, archived category and cross-currency refund policy.

**Rollback/migration notes:** Disallow unsupported cross-currency refunds pending separate reviewed recipe; posted corrections only.

**Definition of done:** Acceptance behavior demonstrated; boundary validation and server authorization verified; applicable empty/loading/error/success and keyboard states verified; migration rehearsal or safe recovery plan recorded; formatting, lint, typecheck, relevant unit/integration/E2E checks and build green with command outputs; docs and traceability updated; required accounting/security review recorded; PR reviewed and merged. Until merge this story is not done.

## S011 — Private validated receipts

**ID:** S011 | **Title:** Private validated receipts | **Epic:** E03 | **Priority:** P1 | **Dependencies:** S010; storage/security choice in D07

**User story:** As the owner, I want to attach receipts without exposing private content.

**Inputs (data/API/preconditions):** Authenticated upload, approved allowlist/limits and private storage.

**Outputs (UI/API/schema/docs):** Quarantined attachment pipeline and authorized downloads.

**Implementation tasks:**

- [ ] Validate signatures/type/size.
- [ ] Scan.
- [ ] Use random keys.
- [ ] Scope links.
- [ ] Expire download access.
- [ ] Prevent inline active content.
- [ ] Update relevant foundational docs and requirement/test links; record migration/security review and reproducible evidence.

**Acceptance criteria (Given/When/Then):** Given another owner or an unsafe file, when access/upload is attempted, then it is denied and never publicly served.

**Unit tests:** MIME mismatch, filename, size and authorization cases.

**Integration/E2E tests:** Storage integration, expired URLs, scanner failure and upload cleanup.

**Failure/edge cases:** Malware, polyglot content, orphan uploads, interrupted scanning.

**Rollback/migration notes:** Disable uploads and retain quarantined files; object cleanup is audited.

**Definition of done:** Acceptance behavior demonstrated; boundary validation and server authorization verified; applicable empty/loading/error/success and keyboard states verified; migration rehearsal or safe recovery plan recorded; formatting, lint, typecheck, relevant unit/integration/E2E checks and build green with command outputs; docs and traceability updated; required accounting/security review recorded; PR reviewed and merged. Until merge this story is not done.

## S012 — Provenanced CSV import preview and commit

**ID:** S012 | **Title:** Provenanced CSV import preview and commit | **Epic:** E04 | **Priority:** P0 | **Dependencies:** S011

**User story:** As the owner, I want to import history with reviewable duplicate detection.

**Inputs (data/API/preconditions):** Validated file, declared source/currency/date mapping, scoped import batch.

**Outputs (UI/API/schema/docs):** Preview/error rows, source records, duplicate review and idempotent commit.

**Implementation tasks:**

- [ ] Define CSV contract.
- [ ] Hash files/rows.
- [ ] Distinguish exact and probable duplicates.
- [ ] Review before commit.
- [ ] Retain provenance.
- [ ] Audit decisions.
- [ ] Update relevant foundational docs and requirement/test links; record migration/security review and reproducible evidence.

**Acceptance criteria (Given/When/Then):** Given a repeated file, when previewed/committed again, then existing source records cannot silently post twice; legitimate similar purchases remain reviewable.

**Unit tests:** Mapping, duplicate fingerprints, dates and decimal parser.

**Integration/E2E tests:** Preview-to-commit, repeated upload, interrupted retry and atomic row policy.

**Failure/edge cases:** Ambiguous dates, formulas, encoding, huge files and changed mappings.

**Rollback/migration notes:** Reject invalid batches before commit; linked reversals for committed import rollback, preserving provenance.

**Definition of done:** Acceptance behavior demonstrated; boundary validation and server authorization verified; applicable empty/loading/error/success and keyboard states verified; migration rehearsal or safe recovery plan recorded; formatting, lint, typecheck, relevant unit/integration/E2E checks and build green with command outputs; docs and traceability updated; required accounting/security review recorded; PR reviewed and merged. Until merge this story is not done.

## S013 — Portable exact exports

**ID:** S013 | **Title:** Portable exact exports | **Epic:** E04 | **Priority:** P1 | **Dependencies:** S012

**User story:** As the owner, I want to recover original records and inspect provenance.

**Inputs (data/API/preconditions):** Authenticated export filters and versioned portable schema.

**Outputs (UI/API/schema/docs):** JSON/CSV downloads, original amounts, journal links and source metadata.

**Implementation tasks:**

- [ ] Define lossless JSON and safe display CSV.
- [ ] Stream scoped data.
- [ ] Neutralize spreadsheet formulas.
- [ ] Document timestamps/rates.
- [ ] Update relevant foundational docs and requirement/test links; record migration/security review and reproducible evidence.

**Acceptance criteria (Given/When/Then):** Given posted multi-context records, when exported, then exact strings, links and original facts survive the documented round trip.

**Unit tests:** Serialization, escaping, formula injection and scale preservation.

**Integration/E2E tests:** Scope isolation, large exports and fixture round trip.

**Failure/edge cases:** Partial download, expired session and absent attachments.

**Rollback/migration notes:** Version export format; keep prior readers or migration notes.

**Definition of done:** Acceptance behavior demonstrated; boundary validation and server authorization verified; applicable empty/loading/error/success and keyboard states verified; migration rehearsal or safe recovery plan recorded; formatting, lint, typecheck, relevant unit/integration/E2E checks and build green with command outputs; docs and traceability updated; required accounting/security review recorded; PR reviewed and merged. Until merge this story is not done.

## S014 — Statement reconciliation and period controls

**ID:** S014 | **Title:** Statement reconciliation and period controls | **Epic:** E04 | **Priority:** P0 | **Dependencies:** S013

**User story:** As the owner, I want to compare real statements and lock reviewed history.

**Inputs (data/API/preconditions):** Native statement balance/date and selected journal entries.

**Outputs (UI/API/schema/docs):** Reconciliation UI/API, period locks and explicit adjustment flow.

**Implementation tasks:**

- [ ] Compare native units.
- [ ] Audit mismatches.
- [ ] Prevent silent edits/backdating to closed periods.
- [ ] Define archived-account corrections.
- [ ] Update relevant foundational docs and requirement/test links; record migration/security review and reproducible evidence.

**Acceptance criteria (Given/When/Then):** Given a reconciled period, when a backdated correction is attempted, then it requires the reviewed adjustment path and leaves the statement history intact.

**Unit tests:** Native balance differences and period boundary rules.

**Integration/E2E tests:** Reconciliation race, adjustment posting and archived account reversal.

**Failure/edge cases:** Missing statement items, timezone cutoff and pre-existing reversal.

**Rollback/migration notes:** Unlock is explicit and audited; never overwrite stored balances.

**Definition of done:** Acceptance behavior demonstrated; boundary validation and server authorization verified; applicable empty/loading/error/success and keyboard states verified; migration rehearsal or safe recovery plan recorded; formatting, lint, typecheck, relevant unit/integration/E2E checks and build green with command outputs; docs and traceability updated; required accounting/security review recorded; PR reviewed and merged. Until merge this story is not done.

## S015 — Monthly consumption budgets

**ID:** S015 | **Title:** Monthly consumption budgets | **Epic:** E05 | **Priority:** P1 | **Dependencies:** S014

**User story:** As the owner, I want to compare category plans to actual consumption.

**Inputs (data/API/preconditions):** Month/timezone, category budget and posted classified leaves.

**Outputs (UI/API/schema/docs):** Budget forms and exact actual/remaining totals.

**Implementation tasks:**

- [ ] Implement no-rollover monthly budgets.
- [ ] Include card purchases.
- [ ] Exclude transfers/principal.
- [ ] Apply refund-date rule.
- [ ] Display overspend.
- [ ] Update relevant foundational docs and requirement/test links; record migration/security review and reproducible evidence.

**Acceptance criteria (Given/When/Then):** Given card purchase and settlement, when budget actuals load, then consumption is counted once and settlement adds zero.

**Unit tests:** Category hierarchy rollup and refund-period cases.

**Integration/E2E tests:** Budget totals against known ledger fixtures and filter contracts.

**Failure/edge cases:** Negative actual after refund, archived category and missing budget.

**Rollback/migration notes:** Budgets are metadata; disable module without changing ledger.

**Definition of done:** Acceptance behavior demonstrated; boundary validation and server authorization verified; applicable empty/loading/error/success and keyboard states verified; migration rehearsal or safe recovery plan recorded; formatting, lint, typecheck, relevant unit/integration/E2E checks and build green with command outputs; docs and traceability updated; required accounting/security review recorded; PR reviewed and merged. Until merge this story is not done.

## S016 — Recurring drafts and bill schedule

**ID:** S016 | **Title:** Recurring drafts and bill schedule | **Epic:** E05 | **Priority:** P1 | **Dependencies:** S015

**User story:** As the owner, I want to remember bills without unintended automatic charges.

**Inputs (data/API/preconditions):** Template, local timezone, cadence and explicit confirmation.

**Outputs (UI/API/schema/docs):** Due list, occurrence drafts and idempotent scheduler.

**Implementation tasks:**

- [ ] Define month-end/leap-day/DST rules.
- [ ] Generate draft only.
- [ ] Unique occurrence key.
- [ ] Authorize jobs.
- [ ] Post on confirmation.
- [ ] Update relevant foundational docs and requirement/test links; record migration/security review and reproducible evidence.

**Acceptance criteria (Given/When/Then):** Given a repeated scheduler run, when a bill is due, then one draft exists and no journal posts without confirmation.

**Unit tests:** Cadence, timezone and next occurrence calculations.

**Integration/E2E tests:** Scheduler retry, cancel/skip/edit, confirmation and session scope.

**Failure/edge cases:** Month end, DST, missed runs and template changes.

**Rollback/migration notes:** Disable scheduler; preserve posted occurrences and audit cancelled drafts.

**Definition of done:** Acceptance behavior demonstrated; boundary validation and server authorization verified; applicable empty/loading/error/success and keyboard states verified; migration rehearsal or safe recovery plan recorded; formatting, lint, typecheck, relevant unit/integration/E2E checks and build green with command outputs; docs and traceability updated; required accounting/security review recorded; PR reviewed and merged. Until merge this story is not done.

## S017 — Savings goals and constrained earmarks

**ID:** S017 | **Title:** Savings goals and constrained earmarks | **Epic:** E05 | **Priority:** P1 | **Dependencies:** S016

**User story:** As the owner, I want to plan goals without inflating bank balances.

**Inputs (data/API/preconditions):** Target/date/currency and allocation from selected liquid assets.

**Outputs (UI/API/schema/docs):** Goal progress and allocation UI/API distinct from ledger.

**Implementation tasks:**

- [ ] Validate available-asset rule.
- [ ] Prevent over-allocation under concurrency.
- [ ] Disclose value date and FX.
- [ ] No automatic bank account creation.
- [ ] Update relevant foundational docs and requirement/test links; record migration/security review and reproducible evidence.

**Acceptance criteria (Given/When/Then):** Given an earmark, when progress updates, then bank/net-worth totals are unchanged and over-allocation is rejected.

**Unit tests:** Availability, target and allocation arithmetic.

**Integration/E2E tests:** Concurrent allocations and funding-account changes.

**Failure/edge cases:** Closed account, stale FX, negative availability and completed target.

**Rollback/migration notes:** Revert metadata allocations with audit; no journal reversal needed.

**Definition of done:** Acceptance behavior demonstrated; boundary validation and server authorization verified; applicable empty/loading/error/success and keyboard states verified; migration rehearsal or safe recovery plan recorded; formatting, lint, typecheck, relevant unit/integration/E2E checks and build green with command outputs; docs and traceability updated; required accounting/security review recorded; PR reviewed and merged. Until merge this story is not done.

## S018 — Investment trades, lots and valuations

**ID:** S018 | **Title:** Investment trades, lots and valuations | **Epic:** E06 | **Priority:** P0 | **Dependencies:** S017; D06 accounting review

**User story:** As the owner, I want to track invested capital and return separately from spending.

**Inputs (data/API/preconditions):** Instrument, exact quantity/price/fees, trade date, source and manual valuations.

**Outputs (UI/API/schema/docs):** Trade/lot subledger, asset journals and dated holding values.

**Implementation tasks:**

- [ ] Implement reviewed FIFO lots and fee treatment.
- [ ] Distinguish contribution/realized/unrealized return.
- [ ] Validate manual valuation.
- [ ] Audit corrections.
- [ ] Update relevant foundational docs and requirement/test links; record migration/security review and reproducible evidence.

**Acceptance criteria (Given/When/Then):** Given a purchase and later valuation, when reports load, then acquisition is an asset swap and market change is separate from employment income.

**Unit tests:** Quantity precision, FIFO partial disposal, fees and return arithmetic.

**Integration/E2E tests:** Buy/sell/reversal, lot reconciliation and stale/missing valuation display.

**Failure/edge cases:** Corporate actions unsupported and explicit; short sales rejected initially; zero-price assets.

**Rollback/migration notes:** Preserve trade history; forward corrections and rebuildable lots from immutable events.

**Definition of done:** Acceptance behavior demonstrated; boundary validation and server authorization verified; applicable empty/loading/error/success and keyboard states verified; migration rehearsal or safe recovery plan recorded; formatting, lint, typecheck, relevant unit/integration/E2E checks and build green with command outputs; docs and traceability updated; required accounting/security review recorded; PR reviewed and merged. Until merge this story is not done.

## S019 — Loans and payment allocation

**ID:** S019 | **Title:** Loans and payment allocation | **Epic:** E06 | **Priority:** P0 | **Dependencies:** S018

**User story:** As the owner, I want to understand debt balances and true borrowing costs.

**Inputs (data/API/preconditions):** Loan account, disbursement and explicit principal/interest/fee components.

**Outputs (UI/API/schema/docs):** Loan views, payment forms and balanced debt journals.

**Implementation tasks:**

- [ ] Record proceeds without income.
- [ ] Allocate payments.
- [ ] Reject inconsistent totals.
- [ ] Separate manual schedule projections from actuals.
- [ ] Update relevant foundational docs and requirement/test links; record migration/security review and reproducible evidence.

**Acceptance criteria (Given/When/Then):** Given a payment of 5,700 with 5,000 principal, when posted, then debt falls 5,000 and consumption is 700.

**Unit tests:** Allocation, overpayment rules and accrued-interest handling.

**Integration/E2E tests:** Disbursement/payment/correction and statement balance scenario.

**Failure/edge cases:** Early payoff, fee-only payment and missing allocation; no invented amortization.

**Rollback/migration notes:** Reverse errors through journals; schema recovery retains loan linkage.

**Definition of done:** Acceptance behavior demonstrated; boundary validation and server authorization verified; applicable empty/loading/error/success and keyboard states verified; migration rehearsal or safe recovery plan recorded; formatting, lint, typecheck, relevant unit/integration/E2E checks and build green with command outputs; docs and traceability updated; required accounting/security review recorded; PR reviewed and merged. Until merge this story is not done.

## S020 — Explicit FX execution and monetary revaluation

**ID:** S020 | **Title:** Explicit FX execution and monetary revaluation | **Epic:** E06 | **Priority:** P0 | **Dependencies:** S019; D05 accounting review

**User story:** As the owner, I want to move money internationally with explainable fees and gains.

**Inputs (data/API/preconditions):** Source/destination native units, execution quote/date/source, fee and carrying values.

**Outputs (UI/API/schema/docs):** FX entry/valuation UI, locked-rate journals and realized/unrealized reporting.

**Implementation tasks:**

- [ ] Implement reviewed average carrying cost locks.
- [ ] Captured quote and residuals.
- [ ] Native-zero revaluation subtype.
- [ ] Prohibit currency mixing and stale unlabelled totals.
- [ ] Update relevant foundational docs and requirement/test links; record migration/security review and reproducible evidence.

**Acceptance criteria (Given/When/Then):** Given the INR/EUR and USD disposal examples, when posted, then native quantities and functional balance match ACCOUNTING.md exactly.

**Unit tests:** Rate direction, tie rounding, residual cap and carrying-cost disposal.

**Integration/E2E tests:** Partial FX transfer, concurrent disposal, revaluation-then-sale and reversal.

**Failure/edge cases:** Missing rates, precision overflow, negative native holdings and large unexplained spread.

**Rollback/migration notes:** Keep functional currency fixed; feature-disable FX and correct via linked journals.

**Definition of done:** Acceptance behavior demonstrated; boundary validation and server authorization verified; applicable empty/loading/error/success and keyboard states verified; migration rehearsal or safe recovery plan recorded; formatting, lint, typecheck, relevant unit/integration/E2E checks and build green with command outputs; docs and traceability updated; required accounting/security review recorded; PR reviewed and merged. Until merge this story is not done.

## S021 — Dashboard, analytics and net worth

**ID:** S021 | **Title:** Dashboard, analytics and net worth | **Epic:** E06 | **Priority:** P1 | **Dependencies:** S020

**User story:** As the owner, I want to explain spending, cash movement and wealth from actual records.

**Inputs (data/API/preconditions):** Posted ledger/classification/valuation data and consistent scoped filters.

**Outputs (UI/API/schema/docs):** Real dashboard/charts, drill-down reports and dated net worth.

**Implementation tasks:**

- [ ] Implement consumption/cash-flow/net-worth definitions.
- [ ] Show valuation basis/staleness.
- [ ] Reconcile drilldowns.
- [ ] Avoid additive overlapping-tag totals.
- [ ] Update relevant foundational docs and requirement/test links; record migration/security review and reproducible evidence.

**Acceptance criteria (Given/When/Then):** Given the canonical mixed-activity fixture, when reports load, then drilldowns equal exact totals and internal transfers add no consumption.

**Unit tests:** Aggregation, perimeter, income/return distinctions and tag deduplication.

**Integration/E2E tests:** Cross-module known totals, authorization and date/currency filters.

**Failure/edge cases:** Empty history, stale valuations, revaluation-only entries and large datasets.

**Rollback/migration notes:** Rebuildable caches; disable reports if reconciliation fails.

**Definition of done:** Acceptance behavior demonstrated; boundary validation and server authorization verified; applicable empty/loading/error/success and keyboard states verified; migration rehearsal or safe recovery plan recorded; formatting, lint, typecheck, relevant unit/integration/E2E checks and build green with command outputs; docs and traceability updated; required accounting/security review recorded; PR reviewed and merged. Until merge this story is not done.

## S022 — Accessible journeys and measured performance

**ID:** S022 | **Title:** Accessible journeys and measured performance | **Epic:** E07 | **Priority:** P1 | **Dependencies:** S021

**User story:** As the owner, I want to use the complete product by keyboard and on mobile.

**Inputs (data/API/preconditions):** Integrated product and representative deterministic dataset.

**Outputs (UI/API/schema/docs):** Accessibility findings/fixes, browser suite and performance baseline.

**Implementation tasks:**

- [ ] Audit keyboard/focus/labels/contrast/status messages.
- [ ] Test all meaningful states.
- [ ] Define and measure agreed performance budgets.
- [ ] Update relevant foundational docs and requirement/test links; record migration/security review and reproducible evidence.

**Acceptance criteria (Given/When/Then):** Given supported mobile/desktop browsers, when critical journeys run, then no blocking accessibility defects remain and measured budgets pass.

**Unit tests:** State and error announcement regressions where useful.

**Integration/E2E tests:** Keyboard capture, reconciliation, imports and reports; automated plus manual accessibility review.

**Failure/edge cases:** Zoom, reduced motion, long labels, slow network and empty/error states.

**Rollback/migration notes:** Revert UI changes independently; publish actual measured limits.

**Definition of done:** Acceptance behavior demonstrated; boundary validation and server authorization verified; applicable empty/loading/error/success and keyboard states verified; migration rehearsal or safe recovery plan recorded; formatting, lint, typecheck, relevant unit/integration/E2E checks and build green with command outputs; docs and traceability updated; required accounting/security review recorded; PR reviewed and merged. Until merge this story is not done.

## S023 — Privacy settings, export and deletion lifecycle

**ID:** S023 | **Title:** Privacy settings, export and deletion lifecycle | **Epic:** E07 | **Priority:** P0 | **Dependencies:** S022; D08 privacy/security review

**User story:** As the owner, I want to control sessions, preferences and deletion of private data.

**Inputs (data/API/preconditions):** Authenticated owner with step-up confirmation; reviewed retention policy.

**Outputs (UI/API/schema/docs):** Settings, revoke sessions, export/delete request and purge state machine.

**Implementation tasks:**

- [ ] Inventory all stores.
- [ ] Include objects/caches/backups.
- [ ] Implement recovery window.
- [ ] Expire access.
- [ ] Audit without retaining unnecessary PII.
- [ ] Update relevant foundational docs and requirement/test links; record migration/security review and reproducible evidence.

**Acceptance criteria (Given/When/Then):** Given a deletion request, when its reviewed lifecycle completes, then active stores are purged and backup retention/restore tombstone behavior matches the policy.

**Unit tests:** State transitions, retention dates and purge retry idempotency.

**Integration/E2E tests:** Export-before-delete, revoke, interrupted purge and restore suppression.

**Failure/edge cases:** Lost owner access, legal retention policy, object-store failure and incomplete purge.

**Rollback/migration notes:** Recovery only during approved window; irreversible purge requires explicit informed confirmation.

**Definition of done:** Acceptance behavior demonstrated; boundary validation and server authorization verified; applicable empty/loading/error/success and keyboard states verified; migration rehearsal or safe recovery plan recorded; formatting, lint, typecheck, relevant unit/integration/E2E checks and build green with command outputs; docs and traceability updated; required accounting/security review recorded; PR reviewed and merged. Until merge this story is not done.

## S024 — Restore drill and private release gate

**ID:** S024 | **Title:** Restore drill and private release gate | **Epic:** E07 | **Priority:** P0 | **Dependencies:** S023; D07 operations review

**User story:** As the owner, I want to rely on a recoverable private installation.

**Inputs (data/API/preconditions):** Approved environment, secrets/retention/RPO/RTO and private deployment authorization.

**Outputs (UI/API/schema/docs):** Backup/restore runbooks, isolated restore evidence, release report and private release if authorized.

**Implementation tasks:**

- [ ] Encrypt backups.
- [ ] Test full DB/object restoration.
- [ ] Validate ledger and scope after restore.
- [ ] Configure monitoring.
- [ ] Run security/accounting review and all gates.
- [ ] Update relevant foundational docs and requirement/test links; record migration/security review and reproducible evidence.

**Acceptance criteria (Given/When/Then):** Given a fresh isolated restore target, when the documented drill runs, then data/attachments and invariants recover within approved objectives; public access stays denied.

**Unit tests:** Backup configuration validation and health signal redaction.

**Integration/E2E tests:** Destructive drill only on disposable target; full regression, session boundary and restore-tombstone check.

**Failure/edge cases:** Lost keys, corrupt/incomplete backup, object mismatch and provider outage.

**Rollback/migration notes:** Release rollback uses compatible app/schema or rehearsed restore; no public/paid provisioning without approval.

**Definition of done:** Acceptance behavior demonstrated; boundary validation and server authorization verified; applicable empty/loading/error/success and keyboard states verified; migration rehearsal or safe recovery plan recorded; formatting, lint, typecheck, relevant unit/integration/E2E checks and build green with command outputs; docs and traceability updated; required accounting/security review recorded; PR reviewed and merged. Until merge this story is not done.
