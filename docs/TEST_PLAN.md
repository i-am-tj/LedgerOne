> 2026-11-11 update: the user authorized expanded Phase 1 P1-S01–P1-S09 (see BACKLOG.md and gates/PHASE_1.md). Initial Sxxx references below are historical scope/test identifiers, not the current execution order. Local Git is authorized; remote configuration belongs to the user. Google sign-in with an owner allowlist is selected. Accounting/security review remains required before dependent implementation.

# Verification and traceability

Status: planned tests, not executed application evidence. There is no application or test runner yet. Only documentation structural checks have run; see PROGRESS.md.

## Required check policy

S001 must establish executable formatting, lint, strict typecheck, Vitest, PostgreSQL integration, Playwright and production-build commands in package scripts and CI. Expected command names: `format:check`, `lint`, `typecheck`, `test:unit`, `test:integration`, `test:e2e`, `build`; exact package manager and invocation are selected/pinned in S001. These are proposed names, not commands currently available. Per story run all baseline checks and relevant domain/integration/E2E checks, retaining summaries and failures. A check may be documented as not applicable with a concrete reason, never silently skipped or reported passed. Fix required failures before proceeding.

Real PostgreSQL is mandatory for SQL constraints, transaction isolation, tenant foreign keys and race tests. Browser tests must drive the real server write path. Domain tests use exact decimal strings/integers and reproducible generated seeds. Never use production data in fixtures. Future release/restore scenarios use disposable environments and explicitly approved storage. No network services were contacted in this planning increment.

## Requirements-to-tests matrix

Test IDs below are stable planned identifiers. Test files and CI evidence must be linked as stories implement them. Every row is currently NOT IMPLEMENTED / NOT RUN.

| Requirement | Stories             | Planned test IDs and behavior                                                                                            |
| ----------- | ------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| R01         | S001,S003,S009,S022 | T01 clean install; T03 keyboard/mobile/all states; T09 capture retry; T22 accessibility and performance                  |
| R02         | S002,S005,S023      | T02 unauthenticated/uninvited/expired/revoked/CSRF denial; T05 cross-owner accounts; T23 session revocation              |
| R03         | S004–S007           | T04 exact scale/overflow/balance/immutability; T06 idempotency and atomic audit; T07 race/direct-SQL/property invariants |
| R04         | S005,S014           | T05 asset/debt opening signs; T14 native reconciliation, archived accounts and period adjustment                         |
| R05         | S006,S009,S019      | T06 cash/card/payment/FD/transfer journals; T09 captured history; T19 proceeds/principal/interest/fees                   |
| R06         | S008,S010           | T08 category cycles/independent merchant/archive snapshots; T10 parent/split effective tags                              |
| R07         | S010                | T10 split sums, leaf-only aggregation, partial refund races and double-count prevention                                  |
| R08         | S011                | T11 unauthorized/expired attachment access, MIME/signature/size/quarantine/scanner failures                              |
| R09         | S015                | T15 card purchase versus settlement; transfer/principal exclusion; refund posting-period actual                          |
| R10         | S016                | T16 cadence/month-end/leap/DST and repeated scheduler → one draft, no automatic posting                                  |
| R11         | S017                | T17 constrained concurrent allocation; assets/net worth unchanged by earmark                                             |
| R12         | S018,S021           | T18 FIFO/fee/partial sale and dated valuation; T21 cost/contribution/return reconciliation                               |
| R13         | S019                | T19 debt disbursement and explicit payment allocation; corrections and overpayment policy                                |
| R14         | S004,S020           | T04 original scales; T20 locked FX/fees/rounding, partial carrying cost, native-zero revaluation then disposal           |
| R15         | S012,S013           | T12 duplicate file/rows/provenance/retry; T13 lossless exact JSON round trip and safe CSV                                |
| R16         | S021                | T21 exact drilldowns, scoped filters, cash perimeter, tag overlap and stale valuation disclosure                         |
| R17         | S013,S023           | T13 portable export; T23 retention/purge retries, object cleanup, restore tombstones and settings                        |
| R18         | S024                | T24 encrypted database/object restore and invariant verification with measured approved RPO/RTO                          |
| R19         | S001,S007,S022,S024 | T01 CI parity; T07 invariant evidence; T22 measured UX; T24 release regression                                           |
| R20         | S003,S024           | T03 production seed refusal; T24 private access and explicit provisioning approval audit                                 |

## Canonical financial scenario

Create development-only fixtures with dated opening asset/debt journals and every example in ACCOUNTING.md. Include purchases on cash/card, card settlement, internal bank transfer, FD and interest, salary, loan and split payment, investment buy/sell, partial refund, overlapping tags, foreign transfer/fee/revaluation/disposal. Independently calculate expected native quantities, functional carrying values, category consumption, cash-perimeter movements, debt and net worth. Store exact expected amounts in reviewed test fixtures; do not derive expected totals with the implementation under test. Reconcile journal totals, account totals and report drilldowns. Exercise two users with indistinguishable names/amounts to expose scope leakage.

## Epic integration scenarios and phase gates

| Gate / epic | Scenarios and required evidence                                                                                                                                                                                                                                                                                                    |
| ----------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| G1 / E01    | Clean checkout install, documented runtime/env, CI commands pass; invite-only login/logout/expiry and write-origin protections demonstrated; shell keyboard/mobile states; production seed refusal. Authentication review recorded.                                                                                                |
| G2 / E02    | Canonical accounting examples balance at database commit; raw invalid writes rejected; immutable history enforced; retries and concurrent reversal/refund attempts produce one valid outcome; cross-owner references denied; rollback leaves no partial audit/journal. Review D04 and core FX field design.                        |
| G3 / E03    | Capture → split → tags → refund → history; archive masters without losing context; attach/download only authorized safe receipt; network failure/retry; keyboard and mobile completion.                                                                                                                                            |
| G4 / E04    | CSV preview → duplicate decision → commit → repeated import → export → fixture round trip → statement reconciliation; period lock/adjustment and provenance remain consistent.                                                                                                                                                     |
| G5 / E05    | Card spend versus settlement budget; duplicate scheduler and explicit draft confirmation; goal earmarks constrained under race without changing ledger or net worth.                                                                                                                                                               |
| G6 / E06    | Independently reviewed canonical totals across investments/loans/FX; partial disposal and revaluation then sale; missing/stale valuations; filter drilldowns and tag deduplication. D05/D06 review recorded.                                                                                                                       |
| G7 / E07    | All prior gates still green; measured agreed performance targets and manual/automated accessibility; threat-model review and dependency/security checks with no unresolved release blockers; export/delete retention; isolated DB/object restore within approved RPO/RTO; private access verified. Explicit release authorization. |

Every gate requires baseline formatting/lint/typecheck/unit/relevant integration/E2E/build checks; reviewed merged stories; updated docs and evidence links. Record PASS only with actual evidence. FAIL and NOT RUN block the next phase. No performance/recovery target is claimed passed until agreed and measured.

## Gate report template

`Gate | Date/time/timezone | Commit/PR | Environment/runtime/DB | Commands + exit codes | Scenario evidence | Accounting/security reviewers | Failures/limitations | PASS/FAIL/NOT RUN | Next-phase authorization`

## Current gate register

| Gate | Result  | Evidence                                                   |
| ---- | ------- | ---------------------------------------------------------- |
| G1   | NOT RUN | No implementation authorized; no runtime or Git repository |
| G2   | NOT RUN | Depends on G1 and Phase 2 authorization                    |
| G3   | NOT RUN | Depends on G2 and Phase 3 authorization                    |
| G4   | NOT RUN | Depends on G3 and Phase 4 authorization                    |
| G5   | NOT RUN | Depends on G4 and Phase 5 authorization                    |
| G6   | NOT RUN | Depends on G5 and Phase 6 authorization                    |
| G7   | NOT RUN | Depends on G6 and Phase 7 authorization                    |

## Current expanded Phase 1 traceability

The original Txx identifiers above describe planned product coverage. Current story links supersede their old Sxxx execution references:

| Current stories | Requirements | Evidence/status                                                                                                     |
| --------------- | ------------ | ------------------------------------------------------------------------------------------------------------------- |
| P1-S01          | R01,R19,R20  | `environment.test.ts` (6); `platform.test.ts` (1); clean-source build/check evidence in PROGRESS.md; review pending |
| P1-S02          | R01,R19      | Shell/state/accessibility browser coverage planned                                                                  |
| P1-S03–P1-S04   | R02,R03      | Google allowlist/session and two-user negative tests planned                                                        |
| P1-S05–P1-S06   | R03,R14      | Exact money, DB constraints, atomicity/idempotency/reversal tests planned                                           |
| P1-S07          | R04          | Openings/native reconciliation/as-of balance tests planned                                                          |
| P1-S08          | R05,R13      | Canonical cash/card/transfer/FD/loan classification and minimal capture tests planned                               |
| P1-S09          | R03,R05,R19  | Property/isolation/concurrency suite and expanded Phase 1 gate planned                                              |

R06–R12 and R15–R18 plus full FX/analytics/privacy/release capabilities remain future scope in the archived backlog and PRD; this is not evidence of their implementation. The current authoritative gate is `docs/gates/PHASE_1.md`; initial G1–G7 remain historical NOT RUN entries.
