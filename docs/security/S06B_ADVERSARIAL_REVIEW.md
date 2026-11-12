# P1-S06B adversarial review — initial decision

Date: 2026-11-12. PR #21 exact initial HEAD: `fd889e468f8e6c7ca07f8074b377886e1782ec7c`. Working tree was clean; no implementation or existing test file changed during initial source analysis/reproduction. The prior report and green tests were treated as claims. This is a fresh agent-led verification, not human/native approval.

**Initial decision: BLOCKED.** Three confirmed Medium defects require correction before the reviewed merge. No confirmed Critical/High ledger integrity/precision/ownership defect was found in the currently closed production contract. All positives below concern guarded disposable activation, not production readiness.

## S06B-R01 — Medium — Bound request-body reads and cancellation cleanup

**Exact initial-head source:** src/lib/ledger/commands/contract.ts:157–184; src/lib/ledger/commands/http.ts:58–59; tests/support/post-http.ts:12–17.

**Reproduction:** Supply an authenticated POST body stream that never ends; abort its signal and observe readCommandBody still pending after 100 ms. Separately send 131073 bytes with a stream cancel callback that never settles: the size rejection still waits indefinitely. The disabled normal route also reads the body before checking its null capability. The HTTP test adapter buffers the complete request before invoking the handler, masking slow-stream behavior.

**Impact:** Authenticated slow or malicious clients can retain request resources indefinitely despite the byte bound, including on the disabled write route. Availability defect; no production financial writes are enabled.

**Required correction:** Bound complete body-read time, observe abort, enforce the byte cap without awaiting untrusted cancellation cleanup, and reject disabled write capability before consuming a body. Exercise actual streaming in the test-only HTTP adapter.

**Required regression:** Stalled/slow/aborted bodies, exact/excess byte limits with lying lengths, never-settling cancel callback, disabled handler with unread stream, and real HTTP streaming rejection with no financial effects.

**Disposition:** confirmed merge blocker; separate issue and correction commit required.

## S06B-R02 — Medium — Reject cancelled commands before new financial COMMIT

**Exact initial-head source:** src/lib/ledger/commands/http.ts:35–65; src/lib/ledger/commands/executor.ts:144–166,182–215,302–309.

**Reproduction:** Pass an already-aborted Request with a valid persisted session and valid balanced JSON to the real shared handler and restricted disposable executor. Independently observed HTTP status 201 and counts journal/posting/receipt/audit changing 0/0/0/0 to 1/2/1/1. The signal is never forwarded to financial execution.

**Impact:** A cancelled command can create an unwanted new immutable financial operation. Currently confined to guarded positive-test activation; normal Next production writes remain disabled. Cancellation before COMMIT must be distinguished from an unknown/durable outcome during or after COMMIT.

**Required correction:** Propagate Request.signal through guarded execution and deadline waits; reject pre-aborted commands and abort/roll back on cancellation observed before sending COMMIT. Preserve same-key recovery if cancellation races with/occurs after COMMIT. Reauthenticate retries and retain ownership checks.

**Required regression:** Already-aborted authenticated requests leave no rows; real HTTP disconnect while paused before COMMIT rolls back; cancellation during retry/connection acquisition disposes late clients; existing post-COMMIT disconnect and uncertain-ack recovery remain green.

**Disposition:** confirmed merge blocker; separate issue and correction commit required.

## S06B-R03 — Medium — Release attestation database work after bounded failure

**Exact initial-head source:** src/lib/ledger/commands/executor.ts:93–102,129–154; src/lib/ledger/invariant-manifest.ts:195–209.

**Reproduction:** After creating the restricted fresh harness, hold ACCESS EXCLUSIVE on its _prisma_migrations table. POST returns 503 after about 10 seconds, but pg_stat_activity still shows one active catalog query waiting on a lock. Independent observed elapsed 10112 ms; query starts SELECT column:..., so filtering only migration_name queries incorrectly misses it. Release the owned lock before cleanup.

**Impact:** The promise deadline stops the response wait but not the underlying read transaction. Repeated requests can exhaust verifier connections or delay safe cleanup indefinitely. No financial mutation occurs; no unrelated connection is terminated.

**Required correction:** Bound actual verifier SQL/read transaction duration and client read waits, destroy unusable own clients, and release/rollback the read snapshot on timeout. Preserve invariant capture/comparison, migration bytes and read-only runtime grants.

**Required regression:** Hold a catalog-dependent lock, obtain bounded 503, assert no verifier query/transaction remains blocked after failure while the external lock is still held, then release it and demonstrate clean fresh execution and safe resource cleanup.

**Disposition:** confirmed merge blocker; separate issue and correction commit required.

## Independently checked scope

| Required check                  | Initial evidence / conclusion                                                                                                                                                                                                                                                                                                                                                                                                  |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1 Exact precision               | New independent 500-leg journal at MAX_MINOR returned/stored every quantity as 999999999999999999; 250-debit sum was 249999999999999999750, beyond bigint/JS-safe totals, with no precision loss. Native/functional INR quantities identical.                                                                                                                                                                                  |
| 2 Ownership / accounts          | Reviewed scoped SQL, composite constraints and immutable workspace ownership; unchanged suite denies foreign/archived accounts and archive race, with no losing financial rows.                                                                                                                                                                                                                                                |
| 3–4 Concurrent replay/conflicts | Independently reran real barrier-based identical/conflicting requests. Unique scoped receipt, immutable original, fresh snapshots and hash conflict prevent replacement/duplicate outcomes.                                                                                                                                                                                                                                    |
| 5 Historical replay             | Reads scoped immutable journal/posting/audit, never account name/archive; rename/archive replay passes actual handler tests.                                                                                                                                                                                                                                                                                                   |
| 6 Actual PostgreSQL failures    | Unchanged suite re-executed real 40001 retry/exhaustion and actual command-victim 40P01, not just mocked SQLSTATEs.                                                                                                                                                                                                                                                                                                            |
| 7 Ambiguous COMMIT              | Adapter acknowledgement-loss test executes real COMMIT then injects transport failure; separate actual HTTP client disconnect after COMMIT replays once. Pre-COMMIT cancellation is R02, not covered by those positives.                                                                                                                                                                                                       |
| 8 Mandatory audit               | New POST unconditionally inserts audit before COMMIT; missing/invalid/duplicate audit failures abort the transaction. Deferred exact operation/target/scope validator and append-only SQL remain; legacy unaudited SQL receipts intentionally fail compatible replay rather than receiving invented history.                                                                                                                   |
| 9 Retry identity                | Existing real-session revocation-during-retry and cross-scope tests pass; callback actor changes reject. Database ownership changes are forbidden by retained SQL triggers. No ownership-transfer feature exists.                                                                                                                                                                                                              |
| 10 Test capability              | Actual Next adapter supplies null and has no env/header activation. Construction additionally requires test profile, matching generated loopback targets, reviewed manifest and non-owner role. External clients cannot provide that trusted server capability or resolver. More explicit negative construction tests are required with corrections.                                                                           |
| 11 Streaming / cancellation     | Confirmed R01/R02; initial HTTP test adapter prebuffers body and does not forward disconnect signal, so its passing post-COMMIT test did not prove pre-COMMIT cancellation or streaming deadlines.                                                                                                                                                                                                                             |
| 12 Future templates             | No business-specific templates exist and raw POST only enforces generic ledger rules. It cannot currently prove card settlement/loan/category business intent. This is an explicit future release precondition, not a current production exploit: normal raw Next writes are closed. S06D/S08 must never expose generic raw posting as a bypass around typed business-command rules. No template implementation is added here. |
| 13 Invariants / migrations      | Empty diff from merged planning base for Prisma schema, migrations 001–007 and production grants. INR CHECK, exact reversal constraints and SELECT-only published financial grants unchanged; all existing S05/S06A tests pass.                                                                                                                                                                                                |

## Initial executed evidence

- `npm run test:unit`: PASS 129 / 8 files.
- `npm run test:integration`: PASS 119 / 7 files; real concurrency tests rerun. Passing tests missed all three new defects.
- `node --conditions=react-server --import tsx /private/tmp/ledgerone-s06b-review-probes.mjs`: exit 0; aborted-body and blocked-cancel promises remained pending; already-cancelled authenticated command committed; MAX precision passed. First lock observer filtered the wrong catalog query and was not used as evidence of absence.
- `node --conditions=react-server --import tsx /private/tmp/ledgerone-s06b-attest-review.mjs`: exit 0; corrected lock observer confirmed one blocked verifier query after 503 at 10112 ms. All owned locks/connections released and generated databases removed without FORCE.
- Untouched-head build/browser checks and final corrected pipeline are recorded below when executed, not inferred from prior CI.

Prerequisites: Node 22.22.0/npm 10.9.4, local Docker PostgreSQL 17.6, installed dependencies, ignored guarded loopback test profile, local CREATE DATABASE/CREATE ROLE for generated fixtures. Only synthetic verified users/session rows and generated disposable financial databases were mutated. No hosted/production DB, real credentials/data, bank, deployment or grant action.

## Provenance and merge boundary

Initial PR body displayed checked review/merge boxes, but GitHub showed PR OPEN/unmerged and zero native reviews. Those boxes are unverified claims, not approval evidence. Record this fresh review decision, each corrective commit, exact final-head CI and actual merge separately. The user's instruction authorizes adversarial review, blocker fixes and merge only after project review/check requirements are met; no human/native approval may be fabricated or branch rule bypassed.

Full financial write gate remains closed. No S06C begins. Final decision after correction must explicitly supersede this initial BLOCKED decision and must not silently turn it into production approval.

## Traceable correction issues

- S06B-R01: https://github.com/i-am-tj/LedgerOne/issues/22
- S06B-R02: https://github.com/i-am-tj/LedgerOne/issues/23
- S06B-R03: https://github.com/i-am-tj/LedgerOne/issues/24

Untouched-head `npm run build` PASS; `npm run test:e2e` PASS, 48 actual desktop/mobile browser tests (23.5s). These successes did not override the three independently confirmed blockers. Only review documentation was added before the initial review was recorded.
