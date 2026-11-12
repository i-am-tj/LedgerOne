# S06D bounded batching prototype — local authorization and verification

**Status: local prototype authorized; implementation/results not yet approved.** Owner reviewed PR #30 at 4aed8b3, proposal at 1b29221, #32 and before/after requirements. Authorization is explicitly isolated local only. PR #30 remains draft, #32/open A05 findings remain open, full S06/Phase 1 gate closed. No D-T04/D-T05 advancement, hosted operation, migration, production grant/deploy or native writer activation.

## Preserved baseline and comparison method

The original 4aed8b3 evidence remains unchanged: standard 220/228/48 green, required matrix 43 PASS / 5 FAIL; critical POST2/c4 1000 observations/p99 166.68ms/0.2% failures (cell PASS); CORRECT50 critical 806 observations and p99 NOT PROVEN at resource cap. These are not retrospectively approved by prototype permission.

A fresh **metric-only row-loop baseline** adds `sql.postings` around the unchanged per-leg loop. Existing `sql.insertion` includes journal creation/sealing and cannot honestly be called posting-only time. The same posting-only timer and unchanged workload generator will be used after batching. Source commits/code fingerprints, schema/migration/role profiles, PostgreSQL settings and sample conditions must be recorded for each run. Benchmark resource caps and all financial retry/timeout/limit policies remain unchanged.

Default query plans and predicate-lock observations are captured separately by an isolated SSI diagnostic. It logs sanitized plan node/index/relation names, lock granularity and actual error phase/SQLSTATE, never parameters or financial/user/session identifiers. Diagnostic probes add overhead; their timings/rates cannot serve as capacity results. Coarse locks and sequential scans are evidence of possible SSI contributors, not proof of a unique causal conflict graph.

## Authorized insertion contract

Only the existing shared `PostExecutor.writeJournal()` posting persistence changes: one bounded parameterized INSERT per journal, generated UUIDs, minor quantities bound as strings and converted by PostgreSQL numeric, duplicates retained without aggregation. Affected-row count must exactly equal validated legs. Keep every row/deferred trigger, constraint, ownership/currency check, sorted account lock, SERIALIZABLE transaction, canonical receipt, immutable replay, audit and uncertain-COMMIT behavior. No migration, another runner or retry/deadline expansion.

## Verification and review gate

Targeted probes must demonstrate 2/50/500-leg POST/REVERSE/CORRECT, 500+500 correction/1000-account union, MAX exact values/duplicate multiplicity, malformed-row and affected-count failure rollback, cancellation before/during insertion, real 40001/40P01 whole retries, ambiguous COMMIT recovery and private restricted-role two-user HTTP denial. Full original S05–S06C pipeline and before/after matrix/critical campaigns remain required; failed, canceled and unmeasured samples stay visible.

Final insertion-path adversarial review needs fresh negative probes and honest provenance. Author inspection or compilation is not independent peer approval. A new review decision is required before any merge; no native APPROVED/human approval will be fabricated. Even a faster insertion cannot close #32 or produce a capacity PASS if any required cell remains red/NOT PROVEN. If so, record a separate diagnosis/proposal and retain the closed gate.
