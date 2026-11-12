# S06C capacity risks retained for S06D

**Status: NOT RUN on hosted environment; full write gate remains closed.** Owner: [S06D / #11](https://github.com/i-am-tj/LedgerOne/issues/11). This is review handoff only; no S06D implementation, production grant, hosted connection or S07 workflow is authorized/performed here.

Local independent probe I09 successfully corrected 500 distinct original + 500 distinct replacement accounts with 1,000 MAX-sized new postings in approximately 2.28s (subsequent full run ~2.22s). Original author fixture verified the same leg-count/quantity bounds with far fewer distinct accounts. Neither establishes a production SLA. The capacity safety probe permits a bounded 503 only if all new financial/receipt/audit rows roll back; do not count such a result as a positive hosted capacity result.

## Confirmed implementation characteristics; conditional risks

- `executor.writeJournal` performs one SQL INSERT per posting, plus per-journal creation/sealing. A maximum correction entails at least 1,000 sequential posting round trips and other SQL. Network latency can consume the ten-second execution budget even when PostgreSQL execution is fast. This is a concrete operation-count risk, not evidence of an observed hosted defect.
- Migration 004 queues deferred journal validation for posting/journal events. Each validation recomputes the journal sum and locks/checks its distinct accounts; reversal validation compares original/reversal multisets. Work can grow roughly with events multiplied by journal legs/distinct accounts. A maximum correction concentrates substantial work in COMMIT; existing 2s statement limit and 10s transaction budget may reject it on a smaller or loaded target.
- Shared runtime/verifier pools, repeated attestation, authentication, hot-account locks and same-key reservation queues contribute additional time. Lock timeout is not a reason to invent success or a new idempotency key. Body/auth/execution budgets are distinct; do not claim a ten-second total HTTP SLA.

## S06D acceptance tasks before any write enablement

- [ ] On the explicitly approved hosted/private target and actual restricted role/profile, measure authentication, attestation, connection queue, account locks, insert/seal, deferred COMMIT and total latency separately. Preserve current no-secret trace policy.
- [ ] Run positive capacity scenarios for 2/50/500 legs per journal, 2 versus 1,000 distinct account union, duplicate/MAX quantities, low/expected cross-region RTT and representative concurrent same-key/different-key load. Record repeatable p50/p95/p99 and error rates; CI/local safety acceptance is not hosted success evidence.
- [ ] Show all promised public workload sizes succeed within a reviewed service budget, or explicitly narrow documented limits before exposure. If batching is required, retain server authorization, parameterization, exact quantities, account-first locking, trigger/FK/commit invariants, atomic audit and same-key recovery. No disabling checks or rewriting applied migrations for speed; any schema optimization is additive/reviewed/checksum-safe.
- [ ] Force statement/lock/transaction timeouts and dropped COMMIT acknowledgement on the actual target; verify full rollback for known aborts, own-client disposal, no leaked transactions, and authorized same-key recovery for uncertain durability.
- [ ] Verify actual role/catalog/history/grant attestation, complete W01–W15 acceptance, independent accounting/security review and explicit exposure approval. No production DML grant or native write capability until that separate gate passes.

No new confirmed performance defect is alleged against the restricted local S06C contract. Hosted latency/load/provisioning and administrator-after-attestation limitations remain unverified. INR-only, SELECT-only published financial runtime grants and normal Next null capability remain unchanged.
