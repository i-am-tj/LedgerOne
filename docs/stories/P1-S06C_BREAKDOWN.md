# P1-S06C — Detailed REVERSE and CORRECT delivery plan

**Status: planning only; implementation NOT STARTED.** Expands [P1-S06C](P1-S06C.md), story [#10](https://github.com/i-am-tj/LedgerOne/issues/10), epic [P1-E3B / #4](https://github.com/i-am-tj/LedgerOne/issues/4), under Phase 1 milestone [#1](https://github.com/i-am-tj/LedgerOne/milestone/1). Five task packages are checkboxes in this one story, delivered sequentially with tests in a separate implementation PR after planning acceptance/reviewed merge. This documentation PR completes no implementation task.

**Predecessor satisfied:** S06B [PR #21](https://github.com/i-am-tj/LedgerOne/pull/21), corrected head `173fd32b293f0beb50369b8aee1347e8395152b0`, merged `5af4c192e533c4c0d4c640363bbb034b818a8404`. [Verified closure](../reports/S06B_CLOSURE.md): #9/#22–#24 closed, final APPROVED for the production-disabled contract only, both exact-head CI runs passed 144 unit / 132 integration / 48 browser. Initial BLOCKED evidence remains intact. This satisfies dependency, not S06C planning or implementation approval.

## Story contract

**ID:** P1-S06C | **Title:** Authorized exact REVERSE and CORRECT | **Epic:** P1-E3B | **Priority:** P0 | **Dependencies:** reviewed S06B merge, unchanged S05/S06A invariants, planning acceptance/reviewed merge, agreed [ADR-007 lock hierarchy and target policy](../ADR/0007-shared-command-lock-order-and-correction-targets.md).

**User story:** As an allowlisted owner, I can reverse or atomically replace the exact authorized original, preserving its financial meaning and receiving one immutable outcome even after concurrent retries or an uncertain response.

**Inputs (data/API/preconditions):** Existing verified-session/same-origin HTTP boundary, normalized workspace route, caller idempotency key, explicit original journal UUID, reversal effective instant, normalized description and mandatory bounded reason; CORRECT also supplies validated replacement data. Actor/owner/request ID are server-derived. Schema readiness 7, exact invariant attestation and restricted generated disposable database capability remain required for positive tests. The actual Next adapter keeps its null capability; no production environment/header/configuration enables a writer.

**Outputs (UI/API/schema/docs):** Typed REVERSE/CORRECT contracts, shared runner extensions, exact server-derived reversal, atomic CORRECT orchestration, immutable command-specific result recovery, tests and reproducible review evidence. No consumer endpoint exposure, UI, business expense/income/transfer templates, merchants, budgets, FX, exposed OPENING/account correction/reconciliation or production enablement. New database guarantees, if necessary, require an additive reviewed migration; none is proposed by this planning PR.

### Payload and response contracts

Use the existing `POST /api/workspaces/{workspaceId}/ledger/commands` shared dispatcher in guarded tests. The actual native route remains unavailable. Preserve existing POST v1 hashes, DTOs, codes, validation, session policy and all regression tests.

| Input             | REVERSE                                                                                                      | CORRECT                                                                                                                                           |
| ----------------- | ------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| kind              | Literal REVERSE                                                                                              | Literal CORRECT                                                                                                                                   |
| originalJournalId | Explicit normalized UUID of the intended original O                                                          | Same; never infer a latest descendant                                                                                                             |
| effectiveAt       | Reversal effective instant, validated/normalized with existing offset-bearing millisecond date contract      | Same reversal instant                                                                                                                             |
| description       | Existing optional empty-default, trimmed NFC, bounded 500-character text                                     | Description of reversal; replacement has its own                                                                                                  |
| reason            | Existing required nonblank bounded normalized audit reason                                                   | One reason for the whole correction operation                                                                                                     |
| replacement       | Forbidden                                                                                                    | Strict `{effectiveAt, description?, legs}` using existing POST exact INR leg validation; 2–500 legs, no nested command/owner/target/reason fields |
| Rejected          | Caller reversal legs, IDs of new rows, actor/owner, draft/version, audit/FX/internal fields and unknown keys | Same; no caller operation ID, separate child key or replacement journal ID                                                                        |

Reversal and replacement dates are explicit separate instants; neither silently inherits or changes the original date. Effective-date reporting semantics and cross-month regressions are specified below; closed-period enforcement remains outside S06C. Keep existing 128 KiB body bound, five-second upload deadline/nonblocking cancellation cleanup, initial-auth deadline, ten-second execution budget and three-attempt retry bound. Original journals have at most 500 legs; CORRECT has at most 1,000 new postings across two individually bounded journals and at most 1,000 distinct original/replacement accounts. Reject unsupported provenance traversal past 128 visited journals; do not truncate and assume eligibility.

Amounts use the existing decimal-string → bigint parser, no Number conversion for accounting. Derived reversal retains native/functional quantities and FX evidence exactly with opposite side; in current INR scope native=functional and FX references absent. Do not net, deduplicate or regenerate rounded amounts. Maximum-sized and repeated legs must round-trip exactly as decimal strings.

REVERSE result: discriminant kind, operation ID, explicit original journal ID, one stored reversal financial DTO and immutable audit reason. CORRECT result: those fields plus exactly one stored GENERAL replacement DTO. Journal DTOs use stored IDs, effective/posted instants, descriptions and posting quantities as strings. No mutable account names/archive flags, current balances, transient request IDs or newly inferred target metadata. Return 201 for first commit, 200 for matching replay with identical financial JSON; `X-Request-ID` may differ and all responses are no-store. POST's current response is unchanged.

The raw audit reason remains mandatory; future consumer templates may supply controlled defaults, without requiring ordinary purchase users to type an audit reason. Templates and consumer policies remain out of scope.

### Correction dates and cross-period reporting

Each journal contributes to balance-as-of and period activity at its own `effectiveAt`, using half-open `[periodStart, nextPeriodStart)` ranges in the selected reporting timezone (default Asia/Kolkata). A correction never suppresses the original or moves it into the replacement period: original, exact reversal and replacement remain separate immutable journal contributions. Independent dates are part of the canonical command and immutable replay result.

For example, an expense of INR 1,000 effective January, a reversal effective February, and replacement expense of INR 900 effective March yield net expense activity January +1,000, February -1,000, March +900 and cumulative +900 through March. If the caller explicitly dates both reversal and replacement in January, January's effective-date result becomes +900. Backdating is explicit; it can change a recomputed earlier-period result. Do not silently move dates to the current period, net the correction only in one period, or hide the original. No consumer reporting UI, closed-period override or stored-report restatement feature is introduced here.

`postedAt` is the immutable server/database finalization timestamp of each journal, independently of its caller-selected effective instant. Original posting timestamps never change; reversal/replacement retain their own stored finalization timestamps on replay. `createdAt`/operation/audit timestamps are provenance, not substitutes for `effectiveAt` in period totals. A future as-known-at reporting feature must explicitly apply its own knowledge cutoff; S06C does not claim that feature exists.

C-T03/C-T05 must include real-handler cross-month ledger queries that independently assert period totals, balances at each month boundary, original and new `effectiveAt`/`postedAt` preservation, timezone boundary behavior and identical replay. Test both different reversal/replacement periods and explicit same-prior-period restatement, including rollback leaving every period unchanged. No API implementation may infer the replacement date from the reversal or original.

### Canonical hash and replay

Use the existing fixed-order UTF-8 JSON/SHA-256 machinery with distinct command tuples:

- REVERSE: `["ledgerone.command.v1", "REVERSE", owner, workspace, originalJournalId, effectiveAtUtc, description, reason]`.
- CORRECT: `["ledgerone.command.v1", "CORRECT", owner, workspace, originalJournalId, effectiveAtUtc, description, reason, replacementEffectiveAtUtc, replacementDescription, sortedCanonicalReplacementLegs]`.

Canonical replacement leg tuples are the existing account/side/INR/minor-string tuples; sorting preserves duplicate multiplicity. Property/leg order and equivalent money/date spelling hash identically; kind, target, reason or replacement semantic changes conflict. Golden POST v1 vectors cannot change. All command kinds share the existing scoped receipt-key namespace.

Every request and retry uses current verified session authorization. Workspace ownership precedes scoped receipt lookup. Matching immutable receipt recovery precedes current account/target/provenance eligibility: rename/archive/later reversal must not invalidate a historical authorized result. Never use a receipt as authentication. Query the exact stored child kinds/counts/links/audit, not POST's unchanged new-journal-equals-audit-target join; R/C audit targets O. A malformed stored outcome fails closed rather than fabricating success.

Replay after serialization/deadlock/unique contention uses a **fresh transaction/snapshot** following complete rollback and reauthorization. A named receipt uniqueness violation is distinct from named original-reversal uniqueness: the latter is not success and never a blanket retriable 23505. Fresh scoped recovery first recognizes a matching committed receipt, otherwise returns sanitized target conflict for an already reversed O. Different same-key semantics always conflict without leaking the earlier payload.

If COMMIT acknowledgement is ambiguous, destroy only the command's own connection, never claim rollback or issue recovery reads on it. Return the existing sanitized unavailable contract with same-key guidance. A new authorized same-key request on a fresh connection recovers a durable matching outcome, or performs at most one normal operation if no receipt exists. Never invent a new key. Cancellation observed before COMMIT submission rolls back; during/after COMMIT submission requires durable acknowledgement or uncertain-outcome recovery, preserving the B policy.

### Locking, original identity and S07 boundary

[ADR-007](../ADR/0007-shared-command-lock-order-and-correction-targets.md) resolves the common order: **workspace → receipt → unlocked immutable discovery → sorted union of accounts → future lifecycle resource slot → exact existing original journal → private children/audit → COMMIT**. Trigger account/predecessor locks must be reentrant on already-held locks. No original lock before accounts, no account acquisition after target lock, no nested public POST and no competing runner. Future account lifecycle commands must follow this hierarchy; metadata-only archive uses workspace/accounts only. Review the refactor/order in C-T01 before implementing handlers.

Recheck O's scope, POSTED state, direct reversal absence and operation separation after acquiring the exact target lock. Original remains POSTED/immutable. Each node has at most one direct full reversal. Reversing a reversal is allowed for an eligible explicitly named node, but does not remove an earlier link or permit reversing its ancestor again. No partial reversal, descendant auto-selection, cycles or same-operation replacement predecessor.

New operations reject archived original/replacement accounts with no unarchive. S07 retains exposed OPENING/account correction and reconciliation, its immutable original opening marker, any archival exception and required additive OPENING audit contract. S06C handlers conservatively reject OPENING and opening-derived chains; bounded scoped immutable ancestry follows reversal predecessors and CORRECT replacement provenance and fails closed on invalid/cyclic/missing/over-limit chains. Core ledger fixture tests may prove repeated opening correction/undo against GENERAL replacement/equity with the one original marker retained. They must not add a public flag or unsupported business command. These defaults require explicit planning acceptance; S07 may later extend the reviewed contract.

### Strict errors and atomicity

Reuse B's mapping: 400 invalid payload/media/unknown fields, 401 invalid/revoked session, 403 origin, 404 missing/foreign scoped resources, 408 upload deadline, 409 idempotency conflict, 409 owned account unavailable, and 503 disabled/attestation/timeout/exhaustion/ambiguous outcome. Add sanitized 409 `target_unavailable` for an owned nonposted/already-directly-reversed/unsupported original or invalid provenance. Malformed original UUID in JSON is 400. Do not reveal foreign existence, SQL errors, balances, keys, reasons or private IDs in operational logs. Unexpected invariants/errors fail closed through the existing boundary.

Every successful R/C commits exactly one receipt and one immutable correctly scoped audit. REVERSE commits one REVERSAL journal; CORRECT commits one REVERSAL plus one GENERAL. Audit action is ledger.reversed/ledger.corrected, operation kind matches, target is O, owner/workspace/actor match, and reason/hash match command. No financial audit per child or duplicate audit on replay. Audit omission, misassociation, duplication or any stage/deferred-COMMIT failure rolls back all new journals, postings, receipt and audit; original remains untouched. Operational logging cannot change a committed outcome.

## Five ordered task packages

### C-T01 — Shared runner, command contracts and lock protocol

**Dependencies:** accepted planning/reviewed merge, S06B closure. **Inputs:** existing contract/http/executor/retry modules, SQL trigger definitions, ADR-007. **Outputs:** one closed typed shared runner with unchanged POST adapter and pure R/C validators, hash/result schemas and exact multiset derivation.

- [ ] Produce `docs/reports/P1-S06C_LOCK_MATRIX.md` before C-T02: a trigger-aware SQL lock-acquisition matrix for POST, REVERSE, CORRECT and future metadata-only account archival, with ordered SQL sites, row/relation/index resources and modes, explicit locks, implicit trigger/FK referential-check locks (including owner/workspace/operation/journal/audit parents), deferred constraint/finalization order, source references, contention and potential inversions. Record review and inversion-test evidence before handlers; future archival is a test fixture/contract, not an exposed S07 implementation.
- [ ] Refactor the existing runner without copying orchestration/auth/retry/attestation/audit/connection handling; preserve B v1 hashes, result and test-only guards.
- [ ] Add strict R/C validation, separate dates, bounded ancestry/leg unions, fixed hashes, exact reversal derivation and command-specific persisted result verification.
- [ ] Unit regressions: duplicate multiplicity, MAX_MINOR, bigint totals, swapped sides, no FX mutation, normalization/equivalent hashes, target/kind/replacement changes, unknown/internal fields and invalid date/UUID/amount.
- [ ] Integration/security regressions: unchanged full B tests; shared role/capability guard and route default denial; lock resource discovery cannot resolve an unscoped account/target or acquire target before accounts. Use real PostgreSQL barriers to cover trigger/FK lock interactions, reversed account-input order, POST-versus-archival contention and deliberately inverted fixture locks; demonstrate any real deadlock is bounded/retried, without claiming deterministic ordering prevents all external deadlocks.

### C-T02 — Authorized exact REVERSE vertical slice

**Dependencies:** C-T01 green, SQL lock-acquisition matrix produced, and matrix/inversion-test/refactor review recorded in PR before handler implementation. **Inputs:** normalized command, current session, owned exact original. **Outputs:** guarded real-handler REVERSE through the same runner, one exact journal/receipt/audit and stable replay.

- [ ] Authorize discovery, bounded provenance and original/referenced accounts; reserve receipt, lock full account set then exact O, recheck eligibility, derive and seal opposite multiset.
- [ ] Persist ledger.reversed audit targeting O; return/recover exact linked result before mutable eligibility for replay. No caller reversal legs or second direct full reversal.
- [ ] Unit tests: exact multiset inverse/property fixtures, DTO/link/audit verification, target conflict classification and no Number precision loss.
- [ ] Integration tests: two real sessions, duplicate legs and maximum amounts, balances returning to pre-original, reverse-of-reversal chain, original unchanged, archived/foreign/nonposted/unsupported provenance denials.
- [ ] Fault/security tests: each SQL stage and audit/deferred COMMIT failure has no partial rows; cross-owner journal/account/key/body/query attacks leave all rows/balances unchanged.

### C-T03 — Atomic explicit-original CORRECT vertical slice

**Dependencies:** C-T02 green. **Inputs:** O plus validated replacement with separate effective instant. **Outputs:** one operation with exact reversal of O, one GENERAL replacement, one ledger.corrected audit and immutable combined result.

- [ ] Lock original/replacement account union once; reverse exact O and build replacement inside the same runner/transaction, not a nested POST or two receipts.
- [ ] Verify reversal predecessor O is outside this operation; enforce migration 007 same-operation defense and exact audit/child identity in both fresh and recovered outcomes.
- [ ] Unit tests: target/hash semantics, replacement amount/date bounds, independent dates, aggregate exact balances, no target auto-substitution and invalid linked result rejection.
- [ ] Integration tests: replacement failure after reversal creation/seal rolls everything back; mandatory audit wrong operation/target/owner/duplicate/omission rolls back; repeated correction of explicit eligible GENERAL replacement, reversal-of-reversal and own-replacement/cycle negatives.
- [ ] Cross-month real-handler correction tests: independent January/February/March totals and balance-as-of boundaries, explicit prior-period restatement, timezone edge, immutable effective/posting timestamps, identical replay and all-period rollback. Use ledger queries, without implementing reporting UI.
- [ ] Ledger-only opening provenance tests retain the original marker through GENERAL replacements against equity and undo chains; handler rejects opening-derived workflows pending S07, with no bypass flag.

### C-T04 — Contention, replay and bounded recovery

**Dependencies:** C-T03 green. **Inputs:** shared retry/cancellation/connection primitives and actual PostgreSQL barriers. **Outputs:** cross-command recovery evidence; no new retry system or production capability.

- [ ] Same-key identical R/C races commit one operation with identical outcomes; changed kind/target/replacement/reason conflicts. Different-key REVERSE/REVERSE, REVERSE/CORRECT and CORRECT/CORRECT against O yield exactly one winner, losers no receipt/audit/children.
- [ ] Test POST/account union overlap, opposite account order, archive/lifecycle lock compatibility and original recheck after concurrent winner. Distinguish receipt vs reversal constraint names; unknown 23505 is not success/retry.
- [ ] Cause real command-victim 40001 and 40P01 and assert observed SQLSTATE, complete attempt rollback, fresh transaction/snapshot/session/locks, one audit and bounded success/exhaustion. Cover revoked/changed session or ownership during retry; actor cannot switch silently.
- [ ] Replay after account rename/archive and later descendant operations returns identical immutable JSON; conflict cannot mutate original outcome. No stale transaction recovery.
- [ ] Test observed pre-COMMIT cancellation, slow/disconnected body, cancellation during COMMIT, real COMMIT acknowledgement loss and durable HTTP disconnect; own uncertain client destroyed, unrelated active connection survives, authorized same-key recovery succeeds once or safely starts if nothing committed.

### C-T05 — Combined handler gate, adversarial review and evidence

**Dependencies:** C-T01–04 green in order. **Inputs:** all fixtures/real handlers/restricted non-owner role, unchanged S05/S06A/B suites and CI. **Outputs:** acceptance matrix with exact SHA/commands/results, implementation report, final adversarial review and reviewed merge.

- [ ] Combined real-session HTTP POST → REVERSE and POST → CORRECT scenarios prove pre-COMMIT private draft/receipt/posting/audit isolation, exact balances, original-target linkage, complete atomic success/rollback and identical same-key replay, including archive/rename and the cross-month effective-date/immutable-postedAt matrix.
- [ ] Two-user/session/body/origin/ownership negative matrix through actual shared handlers; real native Next browser route still denies all raw financial writes. No test-only capability via production config/env/header/unauthorized caller.
- [ ] Run invariant drift/role/checksum/S05 exact reversal and S06A audit regressions; detect disabled triggers, changed CHECK/function/grants/migration history before guarded writes. No runtime-grant/INR regression. No force cleanup or unrelated connection termination.
- [ ] Full format/lint/typecheck/unit/integration/schema/attestation/build/browser/structural pipeline at final implementation HEAD. If schema change needed, additive migration with fresh/upgrade/checksum/recovery evidence and catalog expectations; no rewrite of 001–007.
- [ ] Independent adversarial accounting/security review of exact final head, traceable fixes and new tests for confirmed defects, exact-head CI and recorded reviewed merge; do not fabricate human/native review. Close #10 only then, update #4/#7, keep #11/full S06/Phase 1 closed.

## Acceptance criteria and requirements-to-tests traceability

All rows are **PLANNED / NOT RUN** for S06C. Test names below are required scenarios, not claims of files already created. Implementation PR must map each to actual file/test name and exact command evidence.

| ID     | Given / When / Then                                                                                                                                                                                | Required regressions                                                                                                                                            | Packages / findings |
| ------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------- |
| C-AC01 | Given valid/invalid R/C payloads, when normalized, then exact amounts/multisets/hashes preserve semantics and reject injected fields/limits without effects                                        | Unit golden POST/R/C vectors, duplicate/MAX/millisecond/date/ancestry limits; strict HTTP invalids                                                              | T01–03; A05-01      |
| C-AC02 | Given owned eligible O, when REVERSE commits, then one exact opposite multiset/receipt/audit restores balances and O is unchanged                                                                  | Real handler duplicate/full-size legs, original snapshots, SQL exactness negatives, reverse-of-reversal                                                         | T02; A05-02         |
| C-AC03 | Given CORRECT explicitly names O, when it succeeds, then exact O reversal plus one GENERAL replacement and one correctly targeted audit commit together                                            | Real handler exact O vs replacement/other journal; same-operation SQL defense; wrong/missing/duplicate audit; cross-month totals/balances/timestamps/replay     | T03; A05-02         |
| C-AC04 | Given failure/cancel at any stage or deferred COMMIT, when unsuccessful before durable commit, then no receipt/children/audit/balance change or visible private draft remains                      | Fault matrix; concurrent reader during seal/audit; combined POST/R/C balance assertions                                                                         | T02–05; A05-01      |
| C-AC05 | Given concurrent identical key/kind/payload, when calls race or replay after archive/rename/later correction, then exactly one immutable outcome and identical JSON result                         | Barrier races for R/C, no extra audit, cross-kind and changed-target/replacement conflict, fresh snapshots                                                      | T04–05              |
| C-AC06 | Given different keys racing against O, when R/R, R/C or C/C run with POST/account lifecycle contention, then one full reversal wins safely and lock order remains compatible                       | SQL lock matrix including implicit trigger/FK locks; inversion barriers, ordered union locks, real PostgreSQL conflicts; loser zero effects; no auto-descendant | T01/T04; A05-02     |
| C-AC07 | Given real 40001/40P01, cancellation or uncertain COMMIT, when retry/recovery occurs, then bounded whole transactions use fresh authorization/connections and commit at most once                  | Observed command-victim states, exhaustion, session/ownership change, ack loss and real HTTP disconnect, unrelated connection survival                          | T04; A05-03/A05-05  |
| C-AC08 | Given missing/expired/revoked/foreign/cross-scope actors/targets/accounts/keys or invalid origin, when actual handlers run, then sanitized denial leaves no side effects or existence leak         | Two persisted sessions, injected owner/draft/internal/query fields, mid-retry revocation and scope loss                                                         | T02–05; A05-05      |
| C-AC09 | Given archived/opening-derived/invalid-chain targets, when a new C handler runs, then fail closed; authorized historical replay still works; core-only opening fixtures retain one original marker | Ancestry cap/cycle/cross-scope, archive races, opening correction/undo fixture vs handler denial                                                                | T02–05; A05-04/S07  |
| C-AC10 | Given normal runtime or invariant/privilege drift, when invoked, then no financial capability is activated and existing S05/A/B invariants/checksums/INR survive                                   | Native route/browser denial, guard/attestation mutation tests, restricted roles, seven-migration/drift tests, full pipeline                                     | T01/T05; A05-03     |

## Failure, recovery and migration notes

Failure scenarios include full/partial target disappearance or scope loss, duplicate original postings, direct reversal committed after discovery, archived account while waiting, over-limit ancestry, malformed replacement, audit failure, transaction timeout, exhausted retries, request cancellation and lost COMMIT response. Each must have a named negative test with complete row-count/balance/audit/receipt assertions. Do not swallow a failed deferred COMMIT or retry partial SQL. Existing committed history/receipts/audits are never deleted to retry.

No new migration/grant is assumed. If invariants require one, stop for an additive reviewed migration and reference manifest update, verify fresh migration plus upgrade from 007 and byte checksums of existing migrations, schema drift, strict-role behavior and safe recovery. Disable the guarded adapter on rollback; retain all successful original/reversal/replacement/audit history. Never destructively roll back posted finance. No hosted database or production grant action is authorized by this story.

## Planning and completion gates

| Gate   | Required evidence                                                                                              | Current disposition                                                                                               |
| ------ | -------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| C-PG01 | Verify S06B reviewed merge/exact-head CI and #22–#24 closure                                                   | PASS; linked closure evidence                                                                                     |
| C-PG02 | Document contracts, shared runner reuse, trigger-aware lock order, dates/archival/provenance and S07 ownership | Owner accepted with two documented amendments; implementation evidence still pending                              |
| C-PG03 | Documentation format/structure/link consistency and milestone/epic/story issue hierarchy                       | Record exact local results in planning report                                                                     |
| C-PG04 | Documentation-only PR current-head required CI green                                                           | Pending publication/current-head CI evidence on PR                                                                |
| C-PG05 | Record planning acceptance/review decision and reviewed planning merge before implementation                   | Owner accepted with minor amendments in chat; updated-head CI/recorded decision and reviewed merge still required |

**Definition of done:** After C-PG01–05, create a separate implementation branch/PR, execute C-T01–05 sequentially with tests, satisfy C-AC01–10 through actual handler-level financial/security/concurrency scenarios, all required checks at exact final head, resolve confirmed adversarial findings, record provenance and reviewed merge. Only then S06C/#10 is complete. Compilation, SQL fixtures, planning acceptance, an agent review or local tests alone are insufficient.

**Exact phase boundary:** S06C reviewed merge satisfies S06D's predecessor only. The complete [S06 gate W01–W15](../gates/S06_WRITES.md) remains closed pending S06D's complete command/exposure evidence and explicit write-enablement review. Phase 1 remains incomplete pending S07–S09 and its published gate. No Phase 2 advancement or production financial writes from any planning/story PASS.

**GitHub issue and pull-request references:** [#10 story](https://github.com/i-am-tj/LedgerOne/issues/10), [#4 epic](https://github.com/i-am-tj/LedgerOne/issues/4), [#7 umbrella](https://github.com/i-am-tj/LedgerOne/issues/7), completed [#9 / PR #21](https://github.com/i-am-tj/LedgerOne/pull/21), [#11 S06D](https://github.com/i-am-tj/LedgerOne/issues/11), [#12 S07](https://github.com/i-am-tj/LedgerOne/issues/12). Findings [#13 A05-01](https://github.com/i-am-tj/LedgerOne/issues/13), [#14 A05-02](https://github.com/i-am-tj/LedgerOne/issues/14), [#15 A05-03](https://github.com/i-am-tj/LedgerOne/issues/15), [#16 A05-04](https://github.com/i-am-tj/LedgerOne/issues/16), [#17 A05-05](https://github.com/i-am-tj/LedgerOne/issues/17) remain open until their full acceptance, not closed by this plan. The documentation-only PR URL and exact-head CI/review will be recorded on #10; implementation PR is intentionally absent until C-PG05.

## Owner planning acceptance — amendments incorporated

The owner reviewed publication `8f014eb` and accepted the architecture, restricted scope and S07 boundaries with two minor documentation amendments: explicit cross-period effective-date reporting/timestamp preservation with cross-month regressions, and a trigger/FK-aware C-T01 SQL lock-acquisition matrix plus inversion tests before C-T02. Both are incorporated above and in ADR-007. This accepts planning only, not implementation results or production deployment; updated-head checks and merge evidence are recorded on [PR #25](https://github.com/i-am-tj/LedgerOne/pull/25). Issue #10 remains open until reviewed implementation merge.
