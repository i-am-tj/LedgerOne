# P1-S06D — Financial verification and release-gate breakdown

**Status: PLANNING ONLY; acceptance and reviewed planning merge pending.** No implementation or hosted operation is authorized by this document. The complete S06 gate is NOT RUN / FAIL (closed). Production financial writes remain disabled; published financial grants SELECT-only; consumer raw posting unavailable; INR-only posting unchanged.

**ID:** P1-S06D | **Title:** Complete financial-command verification and separate activation design | **Epic:** [P1-E3C #5](https://github.com/i-am-tj/LedgerOne/issues/5) | **Priority:** P0 | **Dependencies:** reviewed S06A/B/C merges, accepted/merged S06D planning, task-specific owner permissions below

**User story:** As the owner, I need reproducible evidence that the restricted POST, REVERSE and CORRECT engine preserves accounting and security on the intended database profile before considering any separately approved production activation.

**Inputs (data/API/preconditions):** [S06C closure](../reports/S06C_CLOSURE.md), immutable reviews and corrected regressions, existing command runner/authentication/replay/attestation contracts, 001–007 migration bytes, W01–W15, original A05 issues, target/role manifest, synthetic fixtures and explicit approvals for any hosted work. Existing local credentials or earlier project creation are not such approval.

**Outputs (UI/API/schema/docs):** Combined actual-handler/restricted-role verification, safe offline verification harness, target/catalog/history/privilege evidence, bounded performance campaign, final W01–W15 matrix, reviewed finding dispositions, adversarial report and activation/rollback runbook. No consumer API/UI or production writer. New constraints, if necessary, require separately reviewed additive migrations; none is assumed.

## Scope, reuse and approval boundaries

Use the verified shared command runner, canonical contracts, exact-original derivation, immutable result reconstruction, authentication and bounded whole-transaction retry primitives. Do not create parallel financial engines, copy orchestration or weaken the existing disposable factory to accept arbitrary targets. D-T02 must introduce only a reviewed offline verification composition for an explicitly authorized isolated target; the native Next routes retain null write capability. The current production profile supports migrator/app roles, not a financial verification writer; the public-schema-only disposable executor is not hosted/private-schema support.

Technical gate PASS means W01–W15 are proven for a recorded restricted verification contract and target profile. It does not enable any route, grant production DML, approve deployment, expose generic raw commands, prove consumer transaction rules or complete Phase 1. A local-only subset cannot satisfy hosted-profile rows; missing authorized hosted evidence means NOT RUN and overall FAIL. Technical verification may use a dedicated isolated hosted verification database; it does not require production financial write grants.

Excluded: consumer Expense/Income/Transfer/Credit Card Payment/Loan/Investment templates, merchants, budgets, UI, FX posting, generic consumer journal APIs, exposed OPENING/account correction/reconciliation, account lifecycle APIs/original-label reporting, persisted editable-draft finalization. S07 owns account lifecycle, opening provenance/workflows, reconciliation and the mandatory additive OPENING audit contract; S08 and separately accepted stories own typed business rules. Ledger provenance tests confer no consumer capability. INR, immutable effective dates/posted timestamps, explicit reversal/correction and read-only normal financial grants remain unchanged.

### Task order and GitHub hierarchy

Milestone [Phase 1](https://github.com/i-am-tj/LedgerOne/milestone/1) → epic [#5](https://github.com/i-am-tj/LedgerOne/issues/5) → story [#11](https://github.com/i-am-tj/LedgerOne/issues/11) → D-T01–05 checkboxes. Umbrella [#7](https://github.com/i-am-tj/LedgerOne/issues/7) remains open. Planning PR and later implementation PR are separate. Planning publication is tracked on #11; no speculative implementation PR or invented review. Findings [#13–#17](../plans/S06D_FINDINGS.md) stay open until their own criteria and scope are accepted.

**Implementation tasks:** Every package below is unimplemented in S06D. Tests accompany each package, and a package cannot advance with red required checks. Implement on a separate branch/PR only after accepted planning is merged; obtain reviewed package/vertical-slice evidence under the established workflow. Final implementation merge requires independent adversarial review and current-head CI. Any additional PR split is sequential and separately reviewed, not concurrent scope.

- [ ] D-T01 — Gate contracts and findings.
- [ ] D-T02 — Deployment target and permissions.
- [ ] D-T03 — Performance and capacity.
- [ ] D-T04 — Complete accounting/security verification.
- [ ] D-T05 — Release evidence and adversarial review.

## D-T01 — Gate contracts and findings

**Dependencies:** Planning gate D-PG01–05; S06C merged `3502754` at corrected `c22488b` verified. No hosted access.

**Inputs:** Existing W01–15, A05-01–05 original criteria, B/C tests and corrected R01 evidence, ADR-007 lock matrix, current schema/grants/routes.

**Outputs:** Executable gate manifest and test IDs, immutable evidence identifiers/profile rules, reviewed supported-scope finding dispositions, explicit exclusions and technical-versus-activation decision model.

**Implementation requirements/tasks:**

- Inventory every command entry point and caller capability; map each W row to current evidence and missing assertions using [the requirements matrix](../gates/S06D_REQUIREMENTS_TO_TESTS.md).
- Define PASS/FAIL/NOT RUN: missing, stale, skipped or wrong-profile evidence never passes. Bind source SHA, migration digests, catalog manifest, role/schema/connection mode and environment to every result. A final-head change requires impact assessment and renewed required checks/review.
- Convert [A05 disposition criteria](../plans/S06D_FINDINGS.md) into traceable tests; preserve original issue severities and initial BLOCKED review evidence. Private drafts and excluded metadata workflows are scope restrictions, not schema repairs or automatic issue closure.
- Inventory generic native routes and imports; require default denial and no consumer-accessible configuration/header/environment escape. Mandatory audit reason remains validated; future typed templates may supply a controlled server default instead of asking users to type a reason for every purchase.
- Reconfirm account-first sorted union → exact-original lock ordering, implicit trigger/FK locks and no nested financial transactions; retain existing lock matrix and inversion regressions.

**Acceptance (Given/When/Then):** D-AC01/02/03 below. A gate decision from missing hosted evidence must fail without touching a database.

**Unit tests:** Gate manifest includes exactly W01–15, all five A05 IDs and supported commands; missing/stale/profile-mismatched artifacts fail; technical PASS cannot produce activation authorization.

**Integration/security/concurrency regressions:** Inventory actual route denial and private draft isolation; retain changed-key-payload/immutable semantic replay probes; demonstrate no flag or untrusted caller can instantiate a writer. No new runtime command exposure.

## D-T02 — Deployment target and permissions

**Dependencies:** D-T01 green/reviewed; [target plan](../plans/S06D_TARGET_AND_ROLES.md). Local disposable work may proceed after planning acceptance. Every hosted action additionally requires its exact O-H* authorization; production remains excluded.

**Inputs:** Approved non-secret target manifest, reviewed provisioning/ACL candidates, TLS mode, pinned migration checksums/catalog baseline, dedicated synthetic-only environment and cleanup policy.

**Outputs:** Reproducible fresh/upgrade public/private rehearsals; offline private-schema target adapter using the same handlers/runner; least-privilege role matrix and denial evidence; target attestation/history results; owned-connection cleanup evidence. Candidate scripts are not production grants.

**Implementation requirements/tasks:**

- Separate provisioner/migrator, read-only verifier, authentication runtime and restricted offline writer. Reject role ownership/DDL/unsafe inheritance, SECURITY DEFINER escalation, schema shadowing, excessive grants and mismatched target identity. Derive exact DML/function privileges from exercised SQL, not blanket ALL or service-role substitution.
- Preserve existing disposable loopback guards and native null capability. Parameterize reviewed private schema safely throughout SQL, catalog normalization, trigger/function search paths and FK resolution; reject arbitrary schema/host strings. No competing retry/auth system.
- Rehearse fresh and upgrade 001–007 with current bytes and additive successors only. Check the target's successful ordered migration history and actual CHECK/trigger/function/ACL catalog, not merely an equivalent scratch DB or Prisma drift.
- Run real session-backed HTTP handlers under actual non-owner roles against the same schema/catalog. Test denied direct DDL/TRUNCATE/posted mutation, foreign IDs, role membership/SET ROLE and unauthorized schemas. A writer credential is never a substitute for handler ownership checks.
- Fail closed before any write or historical replay on drift/unknown/unavailable attestation. Test verifier failure, migration mismatch and privilege changes only in disposable targets. Drain only harness-owned clients; never force-drop or terminate unrelated/active sessions.

**Acceptance:** D-AC04/05/06. No hosted credentials are read or used before scoped permission; denied/missing approval produces no connection attempt.

**Unit tests:** Target/approval parser, explicit schema allowlist, TLS and role identity, unsafe mode/privilege rejection, cleanup ownership and redaction.

**Integration/security/concurrency regressions:** Local private fresh/upgrade; actual restricted-role handler success/negative isolation; drift mutations and checksum mismatches; unexpected active connection leaves cleanup safely blocked; connection/pool cancellation releases owned resources. Repeat on the authorized hosted verification profile before its gate rows pass.

## D-T03 — Performance and capacity

**Dependencies:** D-T02 local role/schema controls green; hosted permissions separately recorded before hosted measurements; no benchmark on production data.

**Inputs:** [Performance campaign](../plans/S06D_PERFORMANCE.md), synthetic datasets, exact target/role/region/connection mode and approved workload/cost cap.

**Outputs:** Reproducible stage timings, p50/p95/p99, failure/correctness counts, declared capacity/concurrency envelope and explicit proposed service budget accepted or rejected by evidence.

**Implementation requirements/tasks:**

- Benchmark POST, REVERSE and CORRECT at 2/50/500 legs per journal; small and maximum distinct-account union (up to 1,000 across CORRECT original/replacement), duplicate legs, maximum decimal-safe quantities, cold/warm and representative contention/RTT/load.
- Measure body/authentication, fresh attestation, connection queue, receipt/account/target locks, SQL insertion/sealing, deferred COMMIT, ACK/recovery and response. Distinguish actual database aborts from injected fixtures; record pool waits and retry amplification.
- Keep timeout/retry bounds explicit. Atomic 503 at maximum size demonstrates safety but fails a successful-capacity requirement. Do not advertise unmeasured tails or omit failed attempts from rates.
- If insertion/trigger cost exceeds the accepted budget, propose a reviewed bounded batching change with exact-multiset/amount/ownership/audit/COMMIT regressions before implementation. Never disable triggers, CHECKs, foreign keys or invariants to gain speed. Changed supported limits or timeouts require review and full relevant reruns.

**Acceptance:** D-AC07. Performance PASS requires positive maximum-size success as well as invariant-safe failures, measured against accepted limits.

**Unit tests:** Stage accounting, histogram/percentile and failure denominators, timeout categorization, redaction and benchmark matrix completeness.

**Integration/security/concurrency regressions:** Maximum union/multiplicity/MAX amounts; realistic bounded load and pool saturation; actual lock/statement/COMMIT timeout rollback; cancellation/lost-ACK recovery; no leaked connections. Instrumentation must not log tokens, keys, amounts or private payloads or change lock order.

## D-T04 — Complete accounting/security verification

**Dependencies:** D-T01–03 green for the declared profile; resolved capacity findings; all needed hosted permissions. Existing B/C primitives remain the implementation authority.

**Inputs:** Full [W01–15 matrix](../gates/S06D_REQUIREMENTS_TO_TESTS.md), accepted A05 dispositions, target-role catalog and observed service envelope.

**Outputs:** Combined actual-handler suite and evidence covering POST/REVERSE/CORRECT, fresh/upgrade private/public profiles and the authorized hosted verification target. No consumer feature implementation.

**Implementation requirements/tasks:**

- Assert exact fixed-precision balances, native currency restrictions, duplicate multiset inversion, explicit original O and one GENERAL replacement, immutable timestamps/independent dates and January/February/March Asia/Kolkata reports.
- Assert complete journal/receipt/audit semantic binding and rollback at every staged/deferred failure; immutable original audit and exactly one event, including associated owner/op/target identity. Exercise legacy compatibility and corrupted-evidence fail-closed probes separately from ordinary caller attacks.
- Run combined POST/REVERSE/CORRECT two-user real HTTP cases: revoked/expired sessions including retries, foreign or missing targets/accounts, forged internals, archived accounts for new commands, original replay after rename/archive/descendants, cross-origin/body/slow-stream limits.
- Reproduce same-key identical/conflicting races plus distinct-key REVERSE/REVERSE, REVERSE/CORRECT and CORRECT/CORRECT against one O. Observe genuine 40001/40P01; retry the complete transaction with fresh authorization/snapshot, deterministic locks and bounded exhaustion.
- Cancel pre-COMMIT and assert rollback. Forward COMMIT then lose ACK using harness-owned network resources; distinguish uncertain outcome, recover in a fresh transaction with the same authorized key and immutable result, never create a new key or claim rollback after ambiguous COMMIT.
- Repeat drift/history/ACL negatives, full draft isolation and consumer raw-endpoint default-deny with environment/header/config spoofing. Capture actual native Next runtime denial, not only a mock shared handler.

**Acceptance:** D-AC02–09. Each exposed verification command has success and negative assertions through actual handlers; core SQL fixtures alone cannot substitute.

**Unit tests:** Existing canonical money/hash/exact-original/results/retry/error suites plus any new gate/profile logic.

**Integration/security/concurrency regressions:** Full named W matrix, S05/S06A/B/C suites, corrected R01 mismatch probes, 128/129 provenance limits/cycles and opening-derived denial, all real restricted-role/HTTP/network races above. Privileged corruption/drift fixtures are labeled and isolated; do not present them as unprivileged exploits.

## D-T05 — Release evidence and adversarial review

**Dependencies:** D-T01–04 green, every W row has reproducible exact-profile evidence; unresolved exposed-contract findings block. Hosted rows cannot be waived by absence of approval.

**Inputs:** Exact final source/manifest/migration SHA, raw sanitized results, package acceptance, issue state, limitations and [activation/rollback design](../plans/S06D_ACTIVATION_AND_ROLLBACK.md).

**Outputs:** Final PASS/FAIL W01–15 report, A05 acceptance/deferral decisions, capacity/target evidence, independent adversarial review with honest provenance, current-head CI and reviewed implementation merge. Separate non-executed production activation runbook; no activation side effect.

**Implementation requirements/tasks:**

- Execute `npm run verify:pipeline` and the new documented profile/benchmark commands once implemented. Record exact commands, versions, schema/roles, migration history, row counts, hashes, load and limitations; avoid secrets in committed logs. A command named in this plan is not evidence it ran.
- Independently review accounting, auth, SQL privileges, semantic replay binding, private-schema drift, concurrency, COMMIT and cleanup at exact publication head. Record initial decision even when BLOCKED; create linked issues, separate fixes/regressions, rerun required checks and perform corrected-head review.
- Verify final-head push and PR CI, repository protections and required review provenance; no fabricated human/native approval or self-review substitution. Merge only after reviewed-merge requirements pass; close #11 only after actual accepted implementation merge, not planning merge.
- Publish each W result PASS/FAIL with links to commands/assertions/profile/artifacts; NOT RUN contributes FAIL. A05-04 remains open for S07 even if its S06 scope exclusion is accepted. Keep any other original finding open until its own full criteria are met.

**Acceptance:** D-AC10–12. A new head invalidates stale approval/evidence as applicable. Technical gate PASS does not alter grants/routes/deployment or imply S07–09 completion.

**Unit tests:** Gate decision truth table, incomplete-evidence rejection, activation cannot follow technical PASS alone.

**Integration/security/concurrency regressions:** Entire required pipeline, independently selected negative probes and safe rollback rehearsal on disposable target; rerun impacted and full required suites after fixes. Actual hosted results require authorized target execution; no fictional success.

## Acceptance criteria

| ID     | Given                                                                                   | When                                                                     | Then                                                                                                                             |
| ------ | --------------------------------------------------------------------------------------- | ------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------- |
| D-AC01 | All W/A05 contracts and exclusions                                                      | Assess planning or execution                                             | Every item has task, test, profile and review ownership; missing evidence blocks technical PASS                                  |
| D-AC02 | Unsupported fields, owner IDs, decimal/date/size violations or persisted drafts         | Any POST/REVERSE/CORRECT handler executes                                | Reject atomically with no journal/receipt/audit; private drafts never escape                                                     |
| D-AC03 | Existing authorized immutable outcome                                                   | Same-key replay after metadata/archive/descendants, or changed semantics | Identical immutable response or payload conflict; inconsistent stored semantics fail closed, never depend on mutable eligibility |
| D-AC04 | Wrong target/schema/TLS/role, unsafe privileges or missing owner approval               | Verification setup is requested                                          | Refuse before connection when unauthorized, and before financial work on invalid profile; no normal-runtime writer exists        |
| D-AC05 | Fresh/upgrade public/private target and catalog/history mutations                       | Attest with actual verifier/restricted writer                            | Valid target works; altered CHECK/trigger/function/grants/history and unavailable verifier deny writes and replay                |
| D-AC06 | Owned and unrelated/active database clients                                             | Failure/cancel/cleanup runs                                              | Only owned resources close; active/unrelated sessions are never terminated or force-dropped; leftovers reported                  |
| D-AC07 | 2/50/500-leg commands and small/maximum unions under declared load                      | Benchmark accepted service envelope                                      | Stage p50/p95/p99, failures and successful max-size capacity meet reviewed limits without weakening invariants                   |
| D-AC08 | Exact O, duplicates/MAX values, concurrent reversal/correction and real database aborts | Commands run together                                                    | Exact one immutable authorized outcome, balanced journals/audit, fresh bounded whole-transaction recovery and no partial changes |
| D-AC09 | Cancellation before COMMIT or ambiguous COMMIT after durability                         | Retry/replay through real authenticated handlers                         | Pre-COMMIT rollback or safe same-key fresh-snapshot recovery; session/scope rechecked, no duplicate audit or fabricated rollback |
| D-AC10 | Completed supported-scope A05 acceptance or explicit exclusion                          | Accounting/security reviewer evaluates all W01–15                        | Every row has exact-profile evidence and decision; unsupported S07 features remain inaccessible and their issues open            |
| D-AC11 | Exact final head, full pipeline, independent adversarial review                         | Implementation merge is proposed                                         | Fixes traceable, current CI green, repository reviewed-merge requirements fulfilled before #11 closure                           |
| D-AC12 | Technical S06D PASS and reviewed merge                                                  | Someone attempts activation or claims Phase 1 completion                 | No automatic DML grant/deploy/raw consumer exposure; separate typed-story/owner approval and S07–09/phase gate still required    |

**Unit tests:** Package-specific suites above, with gate/capability truth tables and exact money/canonical semantics retained.

**Integration/E2E tests:** Actual session-backed shared HTTP handlers and native runtime denial, restricted SQL roles, fresh/upgrade schemas, complete W matrix, performance and failure campaigns; browser checks verify no raw writer activation. No UI feature added.

**Failure/edge cases:** Missing hosting/domain/target approval, wrong schema/role, migration drift, compromised privileged DDL during attestation, connection loss/slow uploads, revoked sessions, pool saturation, partial cleanup, review head changes, timeout tails, deferred audit failure and uncertain COMMIT. Record limits; do not silently redefine scope or rerun only favorable samples.

**Rollback/migration notes:** Planning adds no migration. If implementation needs changes, use additive migration with untouched 001–007 checksums, fresh/upgrade rehearsal and forward recovery. Disable only the verification composition and drain owned pools; preserve immutable journals/receipts/audits. No production grants or hosted cleanup is authorized by planning. See the separate activation runbook for later owner-approved operations.

## Planning, story and phase gates

| Gate   | Requirement                                                                                          | Current status                                         |
| ------ | ---------------------------------------------------------------------------------------------------- | ------------------------------------------------------ |
| D-PG01 | Verify S06C actual reviewed merge, #10/#27 closed, preserve initial/final evidence                   | PASS; closure report                                   |
| D-PG02 | Five packages, W matrix, A05 matrix, target/role/performance/activation plans and explicit approvals | Prepared; documentation review required                |
| D-PG03 | Format, foundation, link/traceability consistency and clean documentation-only diff                  | Results recorded in planning report                    |
| D-PG04 | Planning PR exact-head required CI                                                                   | Pending publication/results; no inherited S06C CI PASS |
| D-PG05 | Owner accepts exact plan/amendments; record reviewed planning merge under protections                | NOT RUN; implementation blocked                        |

**Definition of done:** Planning D-PG01–05 precedes a separate implementation branch/PR. S06D is complete only after ordered D-T01–05, D-AC01–12, final W01–15 PASS for the defined target, approved supported-scope A05 dispositions, full exact-head checks, independent adversarial review and reviewed implementation merge. Technical completion does not activate production. Phase 1 remains incomplete until S07–S09 and its quality gate pass.

**GitHub issue and pull-request references:** [#11 story](https://github.com/i-am-tj/LedgerOne/issues/11), [#5 epic](https://github.com/i-am-tj/LedgerOne/issues/5), [#7 umbrella](https://github.com/i-am-tj/LedgerOne/issues/7), predecessor [PR #26](https://github.com/i-am-tj/LedgerOne/pull/26), S07 [#12](https://github.com/i-am-tj/LedgerOne/issues/12), A05 [#13–#17](../plans/S06D_FINDINGS.md). Planning PR will be recorded on #11 after publication; implementation PR not opened.
