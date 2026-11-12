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

## Exact baseline and implementation checkpoints

Metric-only baseline `31b5341e6b074193b4c4d816d698090cf0d05991` (row loop unchanged) has execution digest `edd11eec65516ef545b096b10192d391bb34f7d63e836e66541868b6aab24f90`. Fresh [48-cell baseline](../evidence/s06d/BATCHING_BEFORE_SMOKE.json): **44 pass / 4 fail**, Vitest 185.78s; all six safe-only stress/challenge tests are included and their positive FAIL results remain in the artifact. The largest single-command distinct-union correction succeeded once and failed twice; its failure is not hidden behind earlier positive stress runs. Fresh [critical baseline](../evidence/s06d/BATCHING_BEFORE_CRITICAL.json): **1 pass / 1 fail**, 270.37s. POST2/c4 993/1000 successes, 7 failures, command p99 209.16ms; CORRECT50/max/c1 789 successes / 1 cancellation / 210 unmeasured and p99 NOT PROVEN. Baseline smoke starts clean; critical has documentation/test-only dirty state, with the identical recorded execution digest. Each process loads/captures its baseline source before later batch editing; no hot reload or changed workload is used.

Prototype source `95f1efe8e75bcc8dc325a0a2327334b10088eef5` replaces only the shared insertion loop with one bound JSON recordset SELECT/INSERT, per-row server UUIDs and numeric string casts. Both null and short driver affected counts fail closed. Every row still increments the private draft revision through its unchanged trigger; maximum values are `999999999999999999` minor units. No migration, grants, command contracts, result reconstruction, locks, retry or native-route change.

Targeted `npx vitest run --project integration tests/integration/batching-prototype.test.ts`: **14 pass**, 15.36s. This includes 2/50/500-leg POST/inverse/CORRECT; 500+500/1,000-account actual sorted lock union; exact duplicate multiset/MAX values; actual final-row 23514 after all 50 row evaluations (test-owned temporary sequence survives rollback); zero journal/posting/receipt/audit effects; short/null count rollback; before/observed in-statement cancellation; actual PostgreSQL 40001/40P01 and full retries; private restricted-role real HTTP authorization, revoked session, archive replay; successful SQL COMMIT with deliberately lost driver acknowledgement followed by exact replay. Fault SQL, temporary sequence, advisory gate and driver acknowledgement loss are trusted test instrumentation, never request capabilities. Existing S06C TCP proxy probes additionally drop real PostgreSQL response transport.

Full `npm run verify:pipeline`: **exit 0; 220 unit / 242 integration / 48 browser pass**, browser 40.2s, no flaky summary. Formatting, lint, typecheck, local migrations, private-schema/grant rehearsal, live invariant attestation, production build and foundation check pass. Earlier new-test-helper UUID typecheck failure was corrected before this pipeline; no financial behavior was changed to make the tests pass. Full log retained privately as `/private/tmp/ledgerone-batch-pipeline.log`. Heavy capacity is not included in this pipeline.

All DB commands in this report explicitly use `LEDGERONE_ENV=test`, `DATABASE_URL`, `DIRECT_DATABASE_URL`, and `TEST_DATABASE_URL` set to `postgresql://ledgerone:local-development-only@127.0.0.1:5432/ledgerone_test?schema=public`; fixtures create generated disposable private-schema targets through the local guard. Node 22.22.0, PostgreSQL 17.6 Docker, direct loopback, six writer/two verifier connections, actual separate writer/verifier/auth roles. No `.env` production URL is selected. Baseline/after workloads, sampling and 240s critical cap are unchanged; host scheduling/cache/thermal state is uncontrolled and results are local samples, not a hosted SLA.

## Separate SSI diagnostic (not capacity samples)

`npx vitest run --project verification tests/verification/ssi.benchmark.ts`: **1 pass**, 7.13s at prototype 95f1efe. [Sanitized artifact](../evidence/s06d/BATCHING_SSI_DIAGNOSIS.json) records actual 40001 exceptions at COMMIT, journal finalization, audit insertion and reads despite disjoint accounts. No SQLSTATE fixture is injected. Real runtime predicate locks include page locks on journal/posting/audit/account indexes and a relation-level predicate lock on the receipt-key index. Standalone equivalent validation/result queries use existing index or bitmap scans after this sample; adding a guessed missing index is not justified. These equivalent EXPLAINs are not a trace of every cached nested trigger plan and locks are not a full SSI dependency graph. The routine/phase evidence confirms SSI aborts beyond the posting INSERT, but does not prove one unique root cause.

PostgreSQL explains that predicate locks can be coarsened and query plans affect serialization conflicts. [Official PostgreSQL 17 documentation](https://www.postgresql.org/docs/17/transaction-iso.html#XACT-SERIALIZABLE). We do not change planner/predicate-lock settings, disable triggers, add an index or widen retry limits in this prototype. Diagnostic hooks add overhead; their abort rate and latency are excluded from the before/after performance comparison. All diagnostic aggregate journals balance, no drafts/audit gaps survive, and owned cleanup completed without force termination.

## Matching 48-cell comparison — capacity remains FAIL

Batched measurement head `85cbdfafc57b1a45cf36b85f2b07fd12bcf664a7`, clean at campaign start; execution digest `5eba37c0ce00d5538207d2d367b9395ef7756b4cfcb461e2206e7fcb73af3255`. Its catalog digest equals the baseline exactly (`8bce7905c92637cc89c31c876f47cefae1e38f52075ee77566e88328207b9547`). Workload descriptors are pairwise identical. [Full after artifact](../evidence/s06d/BATCHING_AFTER_SMOKE.json); 44 PASS / 4 FAIL, Vitest 144.73s, exit 1. There are 892 measured requests in each campaign; baseline 14 failed / 225 serialization aborts in 1,113 attempts, batch 18 failed / 296 aborts in 1,178 attempts. These mixed-workload totals are disclosure, not a representative SLA or evidence of a statistically established rate increase. Both have zero cancellations/unmeasured/setup failures. No deadlock occurs in these capacity samples; genuine deadlocks are reproduced separately in tests. All aggregate safety checks remain true.

Posting persistence includes server UUID generation/JSON preparation plus driver/database time; command latency includes authentication/attestation/retries. Posting values sum all executed insertion phases/attempts and both journals for CORRECT; a request failing before insertion has no posting observation. Quantiles retain failures; a maximum-case before median containing failures is not a successful-throughput claim. All matrix p99 values are **NOT PROVEN** (too few samples). Client COMMIT includes deferred validation/network; no separate server-only trigger timing is fabricated. Handler-local benchmark uses the real request/service path but not Next HTTP transport; real HTTP/security/transport faults are separate tests.

| Workload (max union, c1) | N before/after | Posting p50/p95 ms before → after | Command p50/p95 ms before → after | Success before → after |
| ------------------------ | -------------- | --------------------------------- | --------------------------------- | ---------------------- |
| POST 500                 | 3/3            | 329.06/424.93 → 54.03/54.36       | 1212.16/1331.57 → 709.45/720.96   | 3 → 3                  |
| REVERSE 500              | 3/3            | 628.05/663.94 → 58.55/62.76       | 3131.62/3256.48 → 1666.81/1671.68 | 3 → 3                  |
| CORRECT 500              | 3/3            | 1078.64/1633.69 → 108.12/190.20   | 4382.17/5118.05 → 2937.10/3017.90 | 1 → 3                  |
| POST 50                  | 30/30          | 24.22/56.69 → 4.68/8.56           | 82.44/151.95 → 56.67/78.10        | 30 → 30                |
| REVERSE 50               | 30/30          | 20.98/39.58 → 6.42/7.38           | 80.78/115.97 → 75.45/133.34       | 30 → 30                |
| CORRECT 50               | 30/30          | 50.73/69.19 → 12.80/21.26         | 175.53/221.77 → 134.68/177.08     | 30 → 30                |

All six batched single-command MAX 500-leg/small/max-union cells positively succeed (three requests each), including 500+500/1,000-account CORRECT. Four-way and six-way shared maximum correction stress each produce one success, with respectively three/five bounded failures; both **positive stress FAIL**. Safe rejection is not capacity success.

| Failed batched representative cell (small union, c4, N=32) | Success/failure | Real 40001 / attempts | Failure at attempt 3 |
| ---------------------------------------------------------- | --------------- | --------------------- | -------------------- |
| POST 2                                                     | 30/2            | 34/64                 | 2                    |
| REVERSE 2                                                  | 30/2            | 36/66                 | 2                    |
| REVERSE 50                                                 | 27/5            | 39/66                 | 5                    |
| CORRECT 2                                                  | 31/1            | 33/64                 | 1                    |

Thus the prototype improves measured insertion costs but does **not** resolve #32. Required four-way failures remain above 1%; do not advance D-T04/D-T05 or close capacity. Critical results and remaining review/SSI proposal are recorded separately below.

## Matching critical-tail comparison

`npx vitest run --project verification tests/verification/critical.benchmark.ts` at 85cbdfa: **exit 1; 1 PASS / 1 FAIL**, 268.90s. [Full after critical artifact](../evidence/s06d/BATCHING_AFTER_CRITICAL.json). Documentation-only dirty state at launch; exact execution digest remains `5eba37c0ce00d5538207d2d367b9395ef7756b4cfcb461e2206e7fcb73af3255`. Neither workload, retry bounds nor the 240s per-cell cap changed.

| Critical workload | N before → after | Posting p50/p95/p99 ms before → after            | Command p50/p95/p99 ms before → after               | Fail/cancel/unmeasured before → after |
| ----------------- | ---------------- | ------------------------------------------------ | --------------------------------------------------- | ------------------------------------- |
| POST 2 / c4       | 1000 → 1000      | 1.51/4.62/7.30 → 1.15/3.84/7.54                  | 50.46/162.92/209.16 → 54.76/146.57/212.74           | 7/0/0 → 3/0/0                         |
| CORRECT 50 / c1   | 790 → 574        | 50.56/102.19/NOT PROVEN → 17.58/44.99/NOT PROVEN | 162.99/284.26/NOT PROVEN → 141.88/292.67/NOT PROVEN | 0/1/210 → 0/1/426                     |

POST2: baseline 429 actual 40001/1,422 attempts and seven third-attempt failures versus batch 290/1,287 and three third-attempt failures (0.7% → 0.3%). Both empirical critical cells PASS, but neither has 100% success and the medians/tails do not improve uniformly. CORRECT50: no serialization/deadlock aborts; baseline 790 measured requests versus batch 574, despite a lower batch insertion/command median. Both exhaust the same **setup-inclusive** resource budget; setup is completed before measured commands, not interleaved. More unmeasured requests after batching are reported, not extrapolated as throughput or hidden. Posting phase observations are 790 before/573 after, since the after cancellation occurred before its insertion timer; command denominators retain both cancellations. Critical p99 qualification is an empirical sample statistic, not a population/hosted guarantee. No value is invented for insufficient samples.

All aggregate accounting safety checks pass. The canceled command is not presumed committed or rolled back from its transport result alone. Harness afterAll cleanup completed (no cleanup hook errors); the separate SSI artifact records successful cleanup. A post-campaign local catalog check records remaining generated fixtures below. No active/unrelated connection is terminated.

## D-T03 assessment and next decision

**Recommendation: FAIL / retain #32 open.** The local batch source and full ordinary regression pipeline are verified, but representative and maximum concurrent stress still fail and the correction critical p99 remains NOT PROVEN. Do not merge PR #30, advance D-T04/D-T05, close #11/A05 findings or declare S06/Phase 1 complete. [Fresh insertion-path assessment](../security/S06D_BATCHING_PATH_REVIEW.md) records author-context review with no fabricated independent approval; independent accounting/security review and a new owner decision remain pending. [Separate SSI follow-up proposal](../plans/S06D_SSI_FOLLOWUP_PROPOSAL.md) is documentation only and requires its own review before experimentation. No further optimization, planner setting, retry, limit, migration or grant change is made here.

Exact protected-file comparison against 4aed8b3 covers migrations001–007, published bootstrap/runtime grants, retry policy, command contract/original/result code and the native null writer route. All are byte-unchanged. No hosted operation or production activation occurs. Local changes are limited to executor insertion, posting timer, test/diagnostic tools and traceable documentation/evidence.

Post-campaign catalog check on explicit local dummy `ledgerone_test`: **0 remaining generated `ledgerone_controls_*_test` databases / 0 generated post writer/auth/verifier roles**. This is a read-only aggregate check, not a cleanup operation. macOS 26.3.1; npm 10.9.4. Raw logs stay private; only sanitized aggregate evidence is published.
