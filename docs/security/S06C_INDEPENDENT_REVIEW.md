# S06C fresh adversarial review — initial decision

**Initial decision: BLOCKED.** Exact publication reviewed: `2922ce3ccf1de15a475afdb7bc068e7f8f1c9007`, PR #26. Initial review made no implementation, migration, grant or runtime changes; it added a new independent probe file. Prior author reports/green CI were treated as claims, not approval. Original author self-review remains unchanged as historical evidence.

Provenance: fresh agent-led verification under the owner's explicit independent-review request, with newly designed negative/database/network probes. This is not a fabricated external human identity or native GitHub APPROVED review. The same assistant has prior implementation context; this disclosure does not turn earlier author assertions into review evidence. The owner's current instruction authorizes the reviewed-merge process only after actual findings/checks/review requirements pass.

## Confirmed finding S06C-R01 — Medium; blocks reconstruction acceptance

Issue: [#27](https://github.com/i-am-tj/LedgerOne/issues/27), story #10, epic #4, Phase 1.

**Source at reviewed publication:** `src/lib/ledger/commands/executor.ts:565` audit checks, `:598` returning structural-only result; `src/lib/ledger/commands/results.ts:43`–`:110` checks child counts/kinds/scope/link/balanced INR but not binding the returned semantic fields to the canonical request/hash.

**Reproduction:** POST an owned original through the actual authenticated handler. Using the explicitly supported core/legacy SQL fixture path, insert a REVERSE receipt whose requestHash is the canonical hash of a February 1 request, but whose exact balanced reversal journal has effectiveAt April 1 and a different description. Insert its correct scoped financial audit/reason. Commit with all existing constraints and triggers enabled; no catalog/privilege bypass or posted-history mutation. Replay the February command/key through the actual shared authenticated handler.

**Observed:** HTTP **200**, returned `reversal.effectiveAt=2026-04-01T00:00:00.000Z` for requested February 1. All row counts unchanged. New negative test expected fail-closed 503 and failed. This proves a structurally valid receipt/outcome can disagree semantically with the command/hash without being detected.

**Impact and scope:** incorrect successful historical reconstruction of financial period/description, and the same omission applies to CORRECT replacement semantics. This is an inconsistent legacy/stored-evidence defense gap. No ordinary caller/current fresh path was shown to create the misbinding, no cross-owner write/privilege escalation is alleged, and production writes remain disabled. Database balance, exact reversal, ownership and immutable audit constraints can all remain intact while the replay contract is violated.

**Required correction:** compare reconstructed immutable REVERSE/CORRECT semantics with the canonical command/hash before returning fresh/replayed success, reusing existing exact parser/hash. Check independent dates/descriptions and CORRECT replacement leg multiset/amounts. Reject inconsistency with sanitized 503, no new rows/audit. Do not repair old history, consult current account eligibility/names, change POST v1, grants/migrations or retry architecture.

**Permanent regression:** new actual legacy SQL REVERSE date/description and CORRECT replacement date/description/amount mismatch negatives. Positive semantically equivalent requests, archived/later-descendant identical replay, duplicate/MAX and genuine database/network retries must remain green.

## Initial verification (before correction)

Environment: Node 22.22.0/npm 10.9.4; existing local Docker PostgreSQL 17.6; generated fresh loopback databases/restricted non-owner financial role and real persisted sessions only. No hosted/production access or real secrets emitted.

- `npm run test:unit`: **165 PASS**, exit 0.
- First new-probe run `npm run test:integration -- tests/integration/s06c-independent-probes.test.ts`: **6 PASS**, exit 0, 4.68s. Designed new stale-snapshot R/R, R/C, C/C schedules, genuine 40001/revocation and original-journal/advisory 40P01 inversion, plus real TCP acknowledgement-loss proxy. No query-error mocks or injected SQLSTATE used by these six cases.
- Expanded same command with the new legacy semantic mismatch case: **1 failed / 6 passed**, exit 1, 6.55s. Failure: expected 503, received 200. Exact log `/private/tmp/ledgerone-s06c-independent-initial2.log`; public numeric/date evidence captured separately in the OS temp directory, no credentials.
- TCP proxy identifies the generated runtime role's frontend COMMIT frame, forwards COMMIT, withholds its reply, waits until an independent connection sees the durable receipt, then destroys only its own proxy sockets. Actual request returns 503 and authorized same-key recovery returns one immutable operation/receipt/audit. Verifier commits/unrelated connections are not terminated.

The initial blocker is recorded before source correction. Further independent scope/provenance/capacity probes and the full corrected pipeline/current-head CI remain required before any final approval/merge. No approval is inferred from this partial initial evidence. S06D/full write gate/Phase 1 remain closed, normal financial writes disabled, published financial SELECT-only grants and INR restriction unchanged, and S07 is outside this review.
