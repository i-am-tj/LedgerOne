# S06D performance and capacity campaign

**Plan, not measured S06D evidence.** Hosted results NOT RUN. D-T03 follows accepted planning and D-T02 controls. Every hosted connection, fixture, benchmark or cleanup needs the [separate target permissions](S06D_TARGET_AND_ROLES.md). No paid service, production load or database size increase is authorized.

## Baseline and risk

[S06C I09](../gates/S06C_PERFORMANCE_HANDOFF.md) observed approximately 2.28s/2.22s locally for a correction with 500 distinct original accounts plus 500 distinct replacement accounts and 1,000 new postings. That probe permits bounded atomic 503 as well as successful 201, so it is not proof of a successful hosted maximum-size service envelope. Current per-posting sequential INSERTs, repeated trigger work and deferred COMMIT checks can amplify latency with network RTT and account count. This is an unverified capacity risk, not a confirmed hosted defect.

## Workload matrix

| Dimension     | Required cells / assertions                                                                                                                                                                         |
| ------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Commands      | POST, REVERSE, CORRECT separately and combined workload; replay reported separately from new work                                                                                                   |
| Size          | 2, 50, 500 postings per journal; CORRECT writes reversal plus replacement, up to 1,000 new postings                                                                                                 |
| Small union   | Two reused accounts with duplicate legs and independently balanced debit/credit totals                                                                                                              |
| Maximum union | POST/REVERSE 2/50/500 distinct accounts; CORRECT disjoint original/replacement sets up to 4/100/1,000 accounts; same-set correction comparison                                                      |
| Quantities    | Representative values plus decimal-safe maximum per-leg minor quantities and duplicate multiplicity; no JS float sums                                                                               |
| Data scale    | Explicit initial journal/account/receipt/audit counts; small and growing synthetic history within owner-approved storage cap; record index/planner statistics                                       |
| Load          | Concurrency 1, 4 and 6 against current six-writer/two-verifier pool limits; mixed workload plus separately bounded saturation/queue test; report arrival rate and achieved throughput               |
| Contention    | Uncontended distinct originals; same-key same/different payload; distinct-key R/R, R/C, C/C on one original; sorted overlapping account unions                                                      |
| Network       | Exact runner/database region and measured RTT; local baseline and approved hosted mode; controlled latency/fault tests with separate owned proxy, no claim that local simulation is hosted evidence |
| Lifecycle     | Cold/warm pool, fresh/upgrade schema, initial command versus immutable replay, account rename/archive after success; no exposed lifecycle API                                                       |
| Failure       | Pool/lock/statement/deferred COMMIT timeout, genuine 40001/40P01, cancellation pre-COMMIT, forwarded COMMIT/lost ACK and fresh same-key recovery                                                    |

Not every stress dimension needs a full Cartesian product; predeclare a coverage manifest pairing every command/size/union/load primary cell, and add named worst-case MAX/duplicate/contention/fault campaigns. Never silently drop a failing cell. HTTP body constraints still apply; generated maximum-size fixtures must be valid within the existing 128 KiB payload contract. A valid 500-leg request that cannot meet the declared service budget blocks that capacity claim.

## Measurements and reproducibility

Record source SHA, dirty state, OS/Node/npm/PostgreSQL, schema/roles/catalog and migration digests, database tier/configuration, actual RTT/connection mode/TLS, pool sizes, warm-up policy, dataset sizes, workload seed/distribution, concurrency/arrival rate, duration and cost cap. No secrets or real financial data. Use a monotonic clock; record timings at existing boundaries without changing command logic or lock order.

Measure: request body read; initial session authentication; each attempt's session revalidation; live attestation; writer/verifier connection wait; receipt reservation/conflict wait; account-union locks; exact-original lock/provenance reads; journal/posting insertion and sealing; audit work; COMMIT send through deferred checks to ACK; fresh recovery; server response and client-observed end-to-end latency. Client COMMIT duration includes network/deferred SQL; where server-side attribution is unavailable, report that limitation rather than inventing a separate trigger timing. Record SQL statement counts, retries, real SQLSTATEs, pool queue length, timeout classes and cleanup results.

Publish p50/p95/p99 and total/failed/conflicted/cancelled/uncertain/recovered counts for each primary cell; retain failed attempts in denominators. Expected same-key conflicts or already-reversed business rejections have separate rates, never hide unexpected failures among them. Distinguish logical commands from retry attempts. Use at least 1,000 completed observations per reported primary-cell p99, with warm-up excluded by a declared rule and repeated batches for variance; fewer observations are smoke evidence only and cannot prove a tail target. Owner-approved quotas may require a smaller initial rehearsal; insufficient samples remain NOT PROVEN rather than estimated PASS.

Store sanitized aggregate artifacts and reproducible runner commands, not raw payloads/session tokens/idempotency keys/account identifiers. Sampling/instrumentation must not affect correctness, bypass attestation or leak private values. Stop at owner-approved duration/storage/cost limits, any correctness violation, unexpected privilege/schema drift or unexplained connection growth.

## Proposed service and capacity budget — requires planning acceptance

These are candidate verification budgets, not a consumer UX promise or a claim they already pass. D-T03 must report observed limits and obtain review before changing any accepted bound.

| Measure                       | Proposed acceptance                                                                                                                                       |
| ----------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Correctness                   | Zero unbalanced, unauthorized, duplicate or partial committed outcomes, precision loss, missing/misbound audit or mutable replay results at every load    |
| Supported successful envelope | Valid uncontended 2/50/500-leg POST/R/C and corresponding maximum account unions at declared concurrency 1/4/6; positive canonical fixtures all succeed   |
| Command execution latency     | p95 ≤1s for 2 legs, ≤3s for 50, ≤8s for 500 per journal; p99 ≤10s; includes fresh attestation, connection wait and retries within execution boundary      |
| Unexpected failure rate       | ≤1% of uncontended valid logical commands in every measured primary cell; zero correctness failures; report all 503/timeouts and confidence/sample limits |
| Resource limit                | Existing six writer/two verifier pools per runner; aggregate runner count/connection quota must be declared and owner-approved, not multiplied silently   |
| HTTP timing                   | Report full body/auth/response p50/p95/p99 separately; existing body and initial auth budgets are each 5s, not part of a fictional 10s whole-request SLA  |

Retain current execution deadline 10s, at most three complete attempts, bounded retry jitter, SQL statement timeout up to 2s, lock timeout up to 1.5s, client query timeout 3s and remaining-budget cancellation. A p99 threshold does not authorize exceeding a deadline; successes and deadline failures are reported separately. SQL/COMMIT deadlines may be more restrictive than aggregate latency. A 503 with no partial writes proves safety, not successful throughput. Saturation/fault campaigns expect safe rejections and recovery rather than the uncontended success rate; report them separately.

If a required cell fails, gate recommendation is FAIL for that envelope. Review a narrower explicit supported capacity or optimization; changing the accepted 500-leg contract requires renewed architectural/accounting review and negative compatibility tests, not a silent benchmark exclusion or larger timeout. Do not relax trigger/check/FK/audit/ownership/idempotency constraints.

## Optimization and recovery policy

If needed, propose bounded parameterized multi-row INSERT batching as a separate reviewed change. Preserve exact quantities and multiplicity, deterministic account-first locking, shared SERIALIZABLE transaction, receipt/hash contract, immutable original target, all deferred constraints and audit atomicity. Verify affected-row equality, chunk-boundary faults, duplicate/MAX legs, parameter/query limits, cancellation and uncertain COMMIT. Any SQL invariant changes require additive migration and catalog/history evidence; existing migrations remain byte-identical.

Repeat positive and negative campaigns after optimization, then full W01–15 and independent review. Do not disable triggers even temporarily for benchmark speed. Negative drift probes run only as separately labeled disposable correctness tests. Close only owned connections; never force-terminate other sessions to recover throughput. Record unresolved hosted limitations and keep technical gate FAIL when required evidence is missing.
