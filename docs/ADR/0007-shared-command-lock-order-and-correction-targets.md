# ADR-007 — Shared financial command locking and explicit correction targets

**Status: owner accepted with minor documentation amendments incorporated; planning merged `b31ab0b` with exact-head checks; guarded R/C implementation/tests under review in PR #26; no production approval.** Story [P1-S06C](../stories/P1-S06C_BREAKDOWN.md), [issue #10](https://github.com/i-am-tj/LedgerOne/issues/10). Predecessor: reviewed S06B merge `5af4c19`. This ADR adds no writer, grants, schema or migration. INR-only and SELECT-only financial runtime grants remain unchanged.

## Context

S06B already has one authenticated command boundary and one bounded SERIALIZABLE transaction/retry runner. Its order is workspace → idempotency receipt → sorted accounts → private journal/postings/audit. REVERSE/CORRECT additionally contend on existing journals. Locking an original first and then its accounts would invert POST and future lifecycle operations, and database triggers acquire additional locks. Resolving that order is a prerequisite to handler implementation.

## Accepted planning direction

Reuse and generalize the existing server-only runner with a closed typed command plan, preserving POST v1 behavior and its regression suite. One owner/session resolver, invariant verifier, connection lifecycle, retry classifier, deadline/cancellation policy and transactional audit path serve all commands. No nested call to public POST from CORRECT, duplicated executor, alternate authentication or independent retry loop.

Each **new** operation follows this global hierarchy:

1. Authorize owned workspace and acquire workspace `FOR KEY SHARE`.
2. Look up/reserve the scoped idempotency receipt. Matching authorized replay returns its immutable result before mutable account/target eligibility checks. Different kind/hash conflicts. Every command kind shares the existing owner/workspace/key namespace.
3. For REVERSE/CORRECT, discover the explicitly named posted original and immutable posting/provenance data with scoped **unlocked reads**. Derive the complete original/replacement account union. Acquire no original-journal shared/update lock at this point.
4. Lock distinct account UUIDs in normalized ascending order with `FOR UPDATE`; recheck ownership, archive and native currency. POST uses this same step. No account may be added after acquiring an existing-journal lock.
5. Reserve this position for future mutable reconciliation/closed-period resources, if S07 introduces them: account-scoped then stable resource-ID order, after accounts and before existing journals. S07 must specify any such resources before implementation; this ADR does not implement closed periods. Immutable opening markers/provenance can be read without locks; new markers belong to the private operation.
6. Lock the **exact original journal** `FOR UPDATE` within owner/workspace. If future commands need multiple existing journals, sort their UUIDs. Recheck target identity, POSTED state, direct reversal absence, scope, provenance and operation separation under the lock. Never silently choose a latest descendant or substitute a replacement. PostgreSQL uniqueness remains the final concurrent full-reversal defense.
7. Create private child journals/postings, finalize, insert the mandatory scoped audit and COMMIT in the same transaction. CORRECT creates reversal then GENERAL replacement under one receipt; child IDs are server-generated, invisible outside the transaction until commit.

Current S05/S06A triggers take account `FOR SHARE`, reversal-predecessor `FOR SHARE`, and draft-parent/finalization locks. Account and predecessor locks are already held when those triggers run; private draft locks contend only within this operation. An implementation must verify this against the actual trigger definitions and test the ordering, rather than assuming the ADR itself enforces it. Do not acquire an ancestor lock while traversing immutable provenance. PostgreSQL deadlocks from external participants still require bounded complete-transaction retries.

A future metadata-only account rename/archive/restore uses workspace → sorted accounts and must not wait for a receipt or existing journal afterward. A future financial OPENING/account correction/reconciliation operation joins the same command transaction with receipt reservation **before** account locks; it must not first lock an account then call the public executor. A lifecycle operation requiring additional resources must extend this hierarchy through a reviewed ADR before shipping. No silent unarchive is allowed.

## Exact target and history

REVERSE derives the opposite **multiset**, preserving each account, currency, native/functional minor quantity, FX evidence and duplicate multiplicity; it flips only DEBIT/CREDIT and generates new row identities. No aggregation or caller reversal legs. In INR, native equals functional and FX references remain absent. SQL deferred invariants continue to independently enforce balancing and exactness.

CORRECT names original O, creates a reversal whose predecessor is O, plus one GENERAL replacement. One operation, one receipt, one `ledger.corrected` audit targeting O; the replacement is never the predecessor. Do not reuse POST's result query unchanged: it associates an audit target with the newly posted journal, whereas REVERSE/CORRECT audits target the pre-existing original. Result recovery must verify the exact child kinds/counts, scope and links.

Original journals remain POSTED and immutable; derived reversal state is not a destructive status update. Each journal permits one direct full reversal. A reversal can itself be reversed if otherwise eligible, producing an acyclic chain of already-posted predecessors. Reversing that reversal does not remove O's existing reversal link or authorize a second direct reversal of O. The caller must explicitly name the intended eligible node with a new key. Partial reversal is unsupported.

## S07 ownership and conservative availability

New S06C handler operations reject archived accounts; authorized replay remains valid after archive/rename. S07 owns exposed OPENING, account/opening correction and reconciliation, including any reviewed archived-account exception. S06C may exercise opening-marker provenance with ledger-level fixtures, preserving the one original marker through GENERAL replacements, without exposing these workflows.

Proposed boundary: S06C handlers accept eligible GENERAL/REVERSAL originals outside opening-derived chains. Reject OPENING and opening-derived corrections/reversals until S07 supplies the business contract. A bounded immutable provenance walk follows reversal predecessors and, for a CORRECT replacement, the same-operation reversal's predecessor; cap at 128 visited journals, fail closed on missing/cross-scope/cyclic/over-limit evidence. No header, environment switch or caller flag bypasses this check. Core ledger fixture tests can exercise opening provenance directly without adding a public capability. The bounded availability limit and this exclusion require planning acceptance; they are not claimed as earlier approved behavior.

## Consequences and alternatives

Unlocked immutable discovery makes account-first locking possible. A stale direct-reversal observation cannot authorize a commit: locked recheck, SERIALIZABLE retry and unique reversal linkage remain mandatory. Test POST versus correction and lifecycle contention, plus real command-victim 40001/40P01 failures. Do not classify reversal uniqueness as idempotent success; roll back, reauthorize and use a fresh scoped lookup to distinguish matching receipt recovery from target conflict.

Rejecting all reverse/correct operations after archive is conservative and may require a later S07 workflow; mutating historical accounts to force a correction is rejected. Locking original before accounts or using advisory locks without one common hierarchy is rejected. Globally serializing all workspace writes is unnecessary and would conceal contention bugs. No migration is expected; if implementation reveals a missing database guarantee, propose an additive migration with fresh/upgrade/checksum/attestation evidence, never edit migrations 001–007.

## Required evidence

C-T01 must first publish `docs/reports/P1-S06C_LOCK_MATRIX.md`: SQL acquisition order/modes/resources for POST, REVERSE, CORRECT and future account archival; explicit and implicit trigger/FK locks, including parent ownership/workspace/operation/journal/audit checks, deferred constraint/finalization locks, source references and inversion risks. Real PostgreSQL barrier tests cover reversed inputs, POST/archival contention, implicit locks and deliberately inverted external fixtures. Record matrix/test/refactor review and unchanged POST contracts before C-T02 handlers. Future archival remains a fixture/contract, not exposed S07 implementation. C-T04 proves cross-command/lifecycle races, exact target conflicts, fresh retry/replay and unknown-COMMIT recovery; C-T05 proves real-handler security and atomic audit. Owner acceptance in chat is conditional on the two incorporated documentation amendments and updated-head CI/reviewed planning merge. Story completion still requires final adversarial review and reviewed implementation merge. Neither acceptance enables production writes.

## Effective dates, reporting periods and immutable posting times

Original, reversal and replacement each contribute at their own explicit `effectiveAt`; their `postedAt` server/database finalization timestamps remain independent, immutable and stable on replay. Period queries use half-open reporting-timezone boundaries (default Asia/Kolkata); do not hide the original, infer a replacement date, or net all children into the original/current month. January expense 1,000 / February reversal 1,000 / March replacement 900 produce January +1,000, February -1,000, March +900, cumulative +900. Explicit January reversal and replacement instead recompute January to +900. Backdating may therefore change a recomputed historical period; closed-period and as-known-at reporting workflows are not implemented by S06C.

C-T03/C-T05 require actual-handler cross-month totals and balance-as-of queries, explicit prior-period restatement, timezone boundaries, immutable original/new effective and posted timestamps, stable replay and atomic failure across all affected periods. These are planned ledger regressions, not consumer reports/UI. See the detailed story's correction-date contract.
