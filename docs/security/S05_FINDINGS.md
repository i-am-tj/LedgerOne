# S05 finding disposition register

> Current status (2026-11-12): S06C completed/reviewed merge `3502754` at corrected head `c22488b`; #10/#27 closed. [Verified closure](../reports/S06C_CLOSURE.md). S06D predecessor satisfied; detailed planning awaits acceptance and reviewed planning merge. A05-01–05 remain open. Full S06 gate closed, Phase 1 incomplete, normal-runtime financial writes disabled. Earlier dated checkpoints retain their original decisions and evidence.

Verified input: [S05 adversarial review](S05_ADVERSARIAL_REVIEW.md), reviewed source `1243360`. Conditional S05 approval covers only the read-only INR foundation. Every finding remains open; issue creation is not remediation. The user confirmed completed human S05 review and merge; evidence: https://github.com/i-am-tj/LedgerOne/pull/1#issuecomment-6796866109. New control implementation remains subject to its own review. Original finding severity/classification is preserved.

| Finding | Severity | Engineering issue                                        | Implementation coverage                                                                                                                                                                                                                  | Current disposition                                                                                                                                                                                              |
| ------- | -------- | -------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A05-01  | Medium   | [A05-01](https://github.com/i-am-tj/LedgerOne/issues/13) | [P1-S06A](https://github.com/i-am-tj/LedgerOne/issues/8), [P1-S06B](https://github.com/i-am-tj/LedgerOne/issues/9), [P1-S06D](https://github.com/i-am-tj/LedgerOne/issues/11)                                                            | Open for full S06D acceptance. Private atomic POST drafts implemented/verified in merged S06B; editable saved drafts remain excluded, merged S06C regressions retained; combined S06D target acceptance pending. |
| A05-02  | Medium   | [A05-02](https://github.com/i-am-tj/LedgerOne/issues/14) | [P1-S06A](https://github.com/i-am-tj/LedgerOne/issues/8), [P1-S06C](https://github.com/i-am-tj/LedgerOne/issues/10), [P1-S06D](https://github.com/i-am-tj/LedgerOne/issues/11)                                                           | Open for S06D acceptance; 007 and merged C exact-original mitigation exist, combined target evidence pending.                                                                                                    |
| A05-03  | Medium   | [A05-03](https://github.com/i-am-tj/LedgerOne/issues/15) | [P1-S06A](https://github.com/i-am-tj/LedgerOne/issues/8), [P1-S06D](https://github.com/i-am-tj/LedgerOne/issues/11)                                                                                                                      | Open for target-specific catalog/history/privilege acceptance in S06D.                                                                                                                                           |
| A05-04  | Low      | [A05-04](https://github.com/i-am-tj/LedgerOne/issues/16) | [P1-S07](https://github.com/i-am-tj/LedgerOne/issues/12), [P1-S06D](https://github.com/i-am-tj/LedgerOne/issues/11)                                                                                                                      | Open, explicitly deferred to S07; not resolved by S06 compilation.                                                                                                                                               |
| A05-05  | Medium   | [A05-05](https://github.com/i-am-tj/LedgerOne/issues/17) | [P1-S06B](https://github.com/i-am-tj/LedgerOne/issues/9), [P1-S06C](https://github.com/i-am-tj/LedgerOne/issues/10), [P1-S06D](https://github.com/i-am-tj/LedgerOne/issues/11), [P1-S07](https://github.com/i-am-tj/LedgerOne/issues/12) | Open. Required before each relevant financial handler exposure; account-specific cases carry into S07.                                                                                                           |

All exposed-contract mitigations must pass [the write gate](../gates/S06_WRITES.md). A05-04 remains a tracked S07 deferral; A05-01 uses private atomic command drafts and explicitly excludes persisted editable-draft finalization. Neither deferral silently closes the underlying schema/metadata concern.

## A05-01

### A05-01 — Draft header changes are outside revision CAS

**Severity:** Medium. Verified review input; retain original classification and limits.

**Source:** prisma/migrations/202611110004_ledger_schema/migration.sql:301; prisma/migrations/202611110006_reversal_predecessor/migration.sql:10

**Verified review:** https://github.com/i-am-tj/LedgerOne/blob/feat/p1-s05-ledger-schema/docs/security/S05_ADVERSARIAL_REVIEW.md

**Reproduction:** Draft dated Jan 1 has revision 2. Commit a date/description change to Feb 1; revision remains 2. Finalization WHERE revision=2 succeeds.

**Impact:** A stale confirmation can book in the wrong period if revision is treated as a full draft version. At the S05 review checkpoint no financial HTTP endpoint existed; current guarded handlers and native denial are tracked in the S06D disposition matrix.

**Implementation stories:** [P1-S06A](https://github.com/i-am-tj/LedgerOne/issues/8), [P1-S06B](https://github.com/i-am-tj/LedgerOne/issues/9), [P1-S06D](https://github.com/i-am-tj/LedgerOne/issues/11)

**Resolution / explicit deferral:** Use private atomic command drafts only. Reject persisted draftId/revision and caller-generated internal IDs; never finalize a stored mutable draft through S06. The DB counter remains a child-edit/MVCC mechanism, not a full draft version. A future editable-draft feature must reopen and resolve version coverage.

**Acceptance criteria:**

- [ ] Given draftId/revision/postedAt/owner or other unsupported fields, when submitting any financial command, then strict handler validation rejects with no journal/receipt/audit.
- [ ] Given changed semantic input under an existing idempotency key, when submitted, then return payload conflict and preserve the original outcome.
- [ ] Given private draft construction, when failure or commit abort occurs, then no reusable mutable draft survives.

**Regression tests required:** Unit strict schema and canonical hash; actual handler stale persisted-draft/unknown-field negatives; rollback and retry; no persisted draft finalization API.

**Status:** Open for full S06D acceptance. Private atomic POST drafts implemented/verified in merged S06B; editable saved drafts remain excluded, merged S06C regressions retained; combined S06D target acceptance pending.

**Review/PR:** S05 https://github.com/i-am-tj/LedgerOne/pull/1; reviewed successor PRs #18/#21/#26 provide subset evidence; combined S06D acceptance pending. Do not close this finding until linked acceptance/evidence is reviewed.

## A05-02

### A05-02 — Reject CORRECT reversal of its own replacement

**Severity:** Medium. Verified review input; retain original classification and limits.

**Source:** prisma/migrations/202611110004_ledger_schema/migration.sql:325; prisma/migrations/202611110006_reversal_predecessor/migration.sql:18

**Verified review:** https://github.com/i-am-tj/LedgerOne/blob/feat/p1-s05-ledger-schema/docs/security/S05_ADVERSARIAL_REVIEW.md

**Reproduction:** Within CORRECT receipt C, post GENERAL G; then post its exact reversal R under C. The same-operation pair commits and corrects no preexisting transaction.

**Impact:** Structurally valid receipts do not prove intended correction. Exact multiset/cycle/duplicate reversal controls remain intact.

**Implementation stories:** [P1-S06A](https://github.com/i-am-tj/LedgerOne/issues/8), [P1-S06C](https://github.com/i-am-tj/LedgerOne/issues/10), [P1-S06D](https://github.com/i-am-tj/LedgerOne/issues/11)

**Resolution / explicit deferral:** Add same-operation predecessor defense by forward migration; derive reversal solely from the explicit authorized original, locked/rechecked in the service transaction.

**Acceptance criteria:**

- [ ] Given a CORRECT replacement is also its reversal predecessor, when committing, then reject atomically.
- [ ] Given original O, when correcting through the handler, then reversal references exactly O and one replacement/audit commits.
- [ ] Given simultaneous reverse/correct attempts, when completed, then at most one successful outcome remains.

**Regression tests required:** SQL own-replacement negative; real handler wrong-owner/target/extra-outcome tests; duplicate multiplicity; reversal-of-reversal; concurrent correction rollback.

**Status:** Open for S06D acceptance; 007 and merged C exact-original mitigation exist, combined target evidence pending.

**Review/PR:** S05 https://github.com/i-am-tj/LedgerOne/pull/1; reviewed successor PRs #18/#21/#26 provide subset evidence; combined S06D acceptance pending. Do not close this finding until linked acceptance/evidence is reviewed.

## A05-03

### A05-03 — Attest live SQL invariants before enabling financial writers

**Severity:** Medium. Verified review input; retain original classification and limits.

**Source:** scripts/rehearse-production-schema.ts:72; tests/integration/ledger-schema.test.ts:793

**Verified review:** https://github.com/i-am-tj/LedgerOne/blob/feat/p1-s05-ledger-schema/docs/security/S05_ADVERSARIAL_REVIEW.md

**Reproduction:** Drop scratch CHECK/triggers; Prisma diff still exits 0 and all applied-file hashes still match. Existing sampled local catalogs currently match fresh replay.

**Impact:** Accidental privileged invariant drift can evade current diff/hash checks. No current live drift or runtime privilege escalation was found.

**Implementation stories:** [P1-S06A](https://github.com/i-am-tj/LedgerOne/issues/8), [P1-S06D](https://github.com/i-am-tj/LedgerOne/issues/11)

**Resolution / explicit deferral:** Fresh-replay invariant catalog comparator and fail-closed write-enablement gate covering CHECK/trigger/function/security/privilege state, plus writer-role behavior and checksum-safe migration history.

**Acceptance criteria:**

- [ ] Given a disabled trigger, changed CHECK expression or changed helper body, when attesting, then FAIL before writes.
- [ ] Given extra/missing/unfinished migrations or changed applied bytes, when verifying, then reject.
- [ ] Given unchanged reviewed target, when attesting fresh/private/upgrade schemas, then PASS without false differences.

**Regression tests required:** Independent scratch mutations of trigger state, CHECK, function body/search_path/security and grants; no-change/forward-migration positives; underprivileged runtime cannot disable protections.

**Status:** Open for target-specific catalog/history/privilege acceptance in S06D.

**Review/PR:** S05 https://github.com/i-am-tj/LedgerOne/pull/1; reviewed successor PRs #18/#21/#26 provide subset evidence; combined S06D acceptance pending. Do not close this finding until linked acceptance/evidence is reviewed.

## A05-04

### A05-04 — Preserve original context across account metadata changes

**Severity:** Low. Verified review input; retain original classification and limits.

**Source:** prisma/migrations/202611110004_ledger_schema/migration.sql:270; prisma/schema.prisma:196; docs/ACCOUNTING.md:41

**Verified review:** https://github.com/i-am-tj/LedgerOne/blob/feat/p1-s05-ledger-schema/docs/security/S05_ADVERSARIAL_REVIEW.md

**Reproduction:** Post to Groceries; rename the same EXPENSE account Rent. A join using current account name labels historical posting Rent; no automatic audit exists.

**Impact:** Future reports may imply changed purchase purpose if current names are mistaken for original context. Account identity/class/currency and posted quantities are unchanged.

**Implementation stories:** [P1-S07](https://github.com/i-am-tj/LedgerOne/issues/12), [P1-S06D](https://github.com/i-am-tj/LedgerOne/issues/11)

**Resolution / explicit deferral:** S07 explicitly distinguishes current labels and original context, stores snapshots/revisions where promised, and audits rename/archive/restore. S06 exposes no account mutation or original-label historical report.

**Acceptance criteria:**

- [ ] Given a rename/archive/restore after posting, when viewing original context, then approved historical policy and original quantities remain accurate with audit.
- [ ] Given S06-only scope, when enumerating routes/contracts, then no account metadata mutation or original-name report is exposed.

**Regression tests required:** S07 real handler metadata history, wrong-owner denial, audit rollback, concurrent archive/correction; S06 gate explicit route/contract deferral checks.

**Status:** Open, explicitly deferred to S07; not resolved by S06 compilation.

**Review/PR:** S05 https://github.com/i-am-tj/LedgerOne/pull/1; reviewed successor PRs #18/#21/#26 provide subset evidence; combined S06D acceptance pending. Do not close this finding until linked acceptance/evidence is reviewed.

## A05-05

### A05-05 — Prove financial authorization through actual HTTP handlers

**Severity:** Medium. Verified review input; retain original classification and limits.

**Source:** src/lib/ledger/queries.ts:5; tests/integration/ledger-schema.test.ts:267; src/lib/ownership/http.ts:68

**Verified review:** https://github.com/i-am-tj/LedgerOne/blob/feat/p1-s05-ledger-schema/docs/security/S05_ADVERSARIAL_REVIEW.md

**Reproduction:** A future handler taking owner from a body/header could invoke correctly scoped helpers as another user. Existing financial helper tests supply Actor directly; no current financial HTTP endpoint exists.

**Impact:** Potential future cross-user disclosure/write if trusted Actor wiring is wrong; not a confirmed current IDOR.

**Implementation stories:** [P1-S06B](https://github.com/i-am-tj/LedgerOne/issues/9), [P1-S06C](https://github.com/i-am-tj/LedgerOne/issues/10), [P1-S06D](https://github.com/i-am-tj/LedgerOne/issues/11), [P1-S07](https://github.com/i-am-tj/LedgerOne/issues/12)

**Resolution / explicit deferral:** Derive actor only from current verified allowlisted session; strict body and CSRF/origin controls; transaction-scoped ownership checks; actual route tests under two users and restricted writer credentials.

**Acceptance criteria:**

- [ ] Given owner A supplies any owner/workspace/account/original ID belonging to B, when invoking real handlers, then deny uniformly with no ledger/receipt/audit side effects.
- [ ] Given anonymous/expired/revoked/removed-allowlist session or cross-origin mutation, when invoked, then deny without writes.
- [ ] Given valid owned command, when invoked through handler, then commit exactly authorized journal/receipt/audit.

**Regression tests required:** Real session/handler positive and negative matrix for POST/REVERSE/CORRECT; guessed IDs and ownership injection; strict bounded bodies; audit rollback and role-based SQL negatives.

**Status:** Open. Required before each relevant financial handler exposure; account-specific cases carry into S07.

**Review/PR:** S05 https://github.com/i-am-tj/LedgerOne/pull/1; reviewed successor PRs #18/#21/#26 provide subset evidence; combined S06D acceptance pending. Do not close this finding until linked acceptance/evidence is reviewed.

## S06A implementation disposition (review pending)

A05-02: migration 007 rejects same-operation replacement predecessors, with negative and positive correction/audit SQL tests; explicit authorized original through real handlers remains S06C. A05-03: exact catalog comparison, local target-vs-reference CLI, private ACL capture and scratch mutation regressions are implemented; hosted-profile attestation and integration with actual write exposure remain unverified and required at S06D. A05-01: private atomic command drafts selected, but actual payload/stale-confirmation handler regressions remain S06B/C. A05-04 remains deferred to S07 outside the S06 exposed contract. A05-05 actual financial HTTP authorization remains S06B/C. No finding is closed by these partial implementations or by passing S05 fixture tests.

## 2026-11-12 current partial dispositions

S06B closure does not close the original A05 issues. A05-01 has real-handler private POST draft isolation/rejected draft confirmation evidence; C/D remain pending. A05-02 has S06A database same-operation protection; authorized exact correction still requires C. A05-03 has S06A/B local attestation and bounded inspector cleanup, while hosted/exposure evidence remains D. A05-04 remains S07 archive/correction policy. A05-05 has real-session POST authorization evidence; C and S07 require their own command-level negatives. Earlier implementation checkpoints above are historical.

## Current S06D disposition plan

The [criterion-level disposition matrix](../plans/S06D_FINDINGS.md) maps merged B/C mitigations, remaining private/hosted actual-role evidence and explicit S07 exclusions. All original issues and original acceptance checkboxes remain open/unaccepted here during planning. Closing separate S06C R01/#27 does not close A05-01–05. D-T01/04/05 must record each criterion and reviewer decision before any original issue closure.
