# Phase 1 gate — Foundation, accounting engine and security

Date: 2026-11-11 (Asia/Kolkata). Result: **NOT RUN / BLOCKED FOR RELEASE**.

This report uses the user's expanded Phase 1 scope (P1-E1–P1-E4; P1-S01–P1-S09), superseding the earlier three-story foundation phase. No Phase 2 implementation is authorized by a partial Phase 1 result.

| Requirement                          | Evidence required                                  | Current result                                                                                               |
| ------------------------------------ | -------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| Clean setup and migration            | P1-S01 fresh DB/setup command evidence             | Local checks PASS; Compose healthy and migration/integration rerun verified                                  |
| Private auth and isolation           | P1-S03/P1-S04 two-user/session/CSRF negative tests | S03 local/live sign-in + internal review recorded; S04 Workspace isolation PASS; financial isolation pending |
| Every journal balanced               | P1-S05/P1-S06 commit-time DB invariants            | Not implemented                                                                                              |
| Atomic and idempotent writes         | P1-S06 failure/retry/concurrency evidence          | Not implemented                                                                                              |
| Opening balances and reversals       | P1-S06/P1-S07 exact expected balances              | Not implemented                                                                                              |
| Card/transfer/FD/loan classification | P1-S08/P1-S09 independent scenario totals          | Not implemented                                                                                              |
| Concurrency consistency              | P1-S09 actual PostgreSQL races                     | Not implemented                                                                                              |
| Required checks green                | Formatting/lint/typecheck/build/unit/integration   | P1-S01–S04 local checks pass; financial isolation/ledger and reviewed merges pending                         |
| Reviews and merges                   | Per-story PR/commit and accounting/security review | Not recorded                                                                                                 |

Accounting invariants are release-blocking. Phase 2 cannot start until all rows pass with reproducible evidence. Remote CI is not claimed to have run. No application check is inferred from documentation checks. Story evidence and command summaries are recorded in PROGRESS.md; final gate evidence belongs here when P1-S09 runs.

## P1-S02 local checkpoint

The user authorized S02 after enabling Docker. Compose was confirmed healthy, the existing migration rerun exited 0 and its PostgreSQL integration test passed. P1-S02's 16 desktop/mobile browser journeys pass, including keyboard, theme persistence, visible states, reflow and automated accessibility scans; formatting/lint/typecheck/unit/build checks also passed. Evidence and limitations are in `docs/stories/P1-S02.md` and PROGRESS.md. This is P1-E1 local integration evidence, not a Phase 1 PASS or remote review/merge record. P1-S03 authentication and all later ownership/financial invariants remain unimplemented and release-blocking.

## P1-S03 local checkpoint

Google-only admission and fixed database sessions are implemented using the supported alternative documented in ADR-002. Local unit (38), PostgreSQL integration (8), browser (32), formatting/lint/typecheck/build/schema comparison and runtime audit pass. Auth integration substitutes the external Google exchange only in its own test instance; browser fixtures use the real session boundary with an isolated test DB and random test secret. Real Google setup/consent/callback acceptance and security review remain pending. P1-S04 resource isolation/audit and all financial invariant scenarios remain unimplemented. This is not a Phase 1 gate PASS. See PROGRESS.md, `docs/stories/P1-S03.md` and `docs/setup/GOOGLE_AUTH.md`.

## Live owner sign-in checkpoint — 2026-11-11

User-assisted Google sign-in was observed returning to the authenticated workspace in Chrome. Local DB metadata confirms the current allowlisted verified Google identity and an active eight-hour session; independent anonymous API/page requests are denied. No token data or private identity was copied into evidence, and the user's session was left active. This closes the live owner login/callback item only. Live logout/alternate-user manual checks, security review, S04 ownership/audit and all ledger invariants still block the Phase 1 gate. See the S03 story for precise evidence and limitations.

## P1-S04 checkpoint

The agent-owned S03 technical review is recorded, with no local-development blocker and explicit deployment prerequisites. S04 adds passing two-user Workspace/API/audit tests and atomic audit rollback/database constraints; 38 unit, 18 integration and 34 browser tests pass. The current-resource proof is not financial Account/Journal/Posting isolation: those tests remain blocked on S05–S08, as do all balancing, reversal, classification and ledger concurrency scenarios. Phase 1 is still NOT RUN/BLOCKED FOR RELEASE, with no reviewed remote merge or public deployment claimed. User approval of the core INR/sign/reversal policy is recorded for S05, not counted as implemented accounting.
