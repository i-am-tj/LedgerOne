# S05 → S06 engineering handoff

> Current status (2026-11-12): S06B completed/reviewed merge `5af4c19`; S06C predecessor satisfied, planning acceptance pending. Full S06 gate closed, Phase 1 incomplete, normal-runtime financial writes disabled. [Verified closure](reports/S06B_CLOSURE.md). Earlier dated checkpoints retain the state and decisions recorded at the time.

S06A review artifact: [PR #18](https://github.com/i-am-tj/LedgerOne/pull/18), implementation commit `cf37cda`; required local pipeline **89 unit / 70 integration / 46 browser tests PASS**, plus schema/attestation/build. Remote checks and human review are reported on the PR.

**Recommendation: CONDITIONAL PASS for S06A review readiness; full S06 financial write gate: FAIL (closed).** No financial API write, production readiness or Phase 1 completion is claimed.

## S05 closure — confirmed

PR #1 merged source `12433608f7a7de51f3f445dd333a74b77fd9fd4b` as `54efed5e266847ec66c0a54caf15b9c4e5fb358a`. The owner confirmed they personally reviewed and merged it; [review evidence](https://github.com/i-am-tj/LedgerOne/pull/1#issuecomment-6796866109) transparently records that statement. Formal GitHub review submissions remain empty; no native APPROVED review is fabricated. Original remote checks passed. S05 closure issue [#6](https://github.com/i-am-tj/LedgerOne/issues/6) is completed. The conditional read-only INR foundation scope and all five finding obligations remain intact.

The merge occurred while the handoff was being prepared and before the two new documentation commits. New work moved to `feat/p1-s06a-command-controls` on merged main at the user's instruction; those docs and S06A code belong to the new PR, not PR #1. Historical pending-review observations in PROGRESS remain dated evidence, superseded by this confirmation.

## GitHub hierarchy and ordered delivery

Phase = [Phase 1 milestone](https://github.com/i-am-tj/LedgerOne/milestone/1); parent epic [P1-E3 #2](https://github.com/i-am-tj/LedgerOne/issues/2); sub-epics [controls #3](https://github.com/i-am-tj/LedgerOne/issues/3), [command workflows #4](https://github.com/i-am-tj/LedgerOne/issues/4), [write gate #5](https://github.com/i-am-tj/LedgerOne/issues/5). Issue bodies/labels record parentage; tasks are checkboxes. Sixteen epic/story/finding issues and the required workflow labels were created; no native sub-issue configuration is claimed.

| Order  | Story                                                         | Scope                                                                             | Status                                                  |
| ------ | ------------------------------------------------------------- | --------------------------------------------------------------------------------- | ------------------------------------------------------- |
| Parent | [P1-S06 #7](https://github.com/i-am-tj/LedgerOne/issues/7)    | Authenticated audited idempotent command aggregate                                | In progress in S06A only                                |
| 1      | [P1-S06A #8](https://github.com/i-am-tj/LedgerOne/issues/8)   | Additive audit/correction controls and invariant attestation                      | Implemented locally; final checks/review/merge required |
| 2      | [P1-S06B #9](https://github.com/i-am-tj/LedgerOne/issues/9)   | Real-handler POST, trusted actor, canonical replay, atomic audit and full retries | Blocked on reviewed S06A merge                          |
| 3      | [P1-S06C #10](https://github.com/i-am-tj/LedgerOne/issues/10) | Exact authorized REVERSE/CORRECT and concurrent correction semantics              | Blocked on reviewed S06B merge                          |
| 4      | [P1-S06D #11](https://github.com/i-am-tj/LedgerOne/issues/11) | Actual-role/handler/drift/concurrency write-enablement gate                       | Blocked on reviewed S06C merge                          |
| Next   | [P1-S07 #12](https://github.com/i-am-tj/LedgerOne/issues/12)  | Account metadata/opening history/native reconciliation                            | Deferred until reviewed S06 completion                  |

Full mandatory contracts and acceptance/unit/integration/security/concurrency/recovery requirements are in corresponding `docs/stories/P1-S06{,A,B,C,D}.md` and `P1-S07.md`, mirrored into their issues. One implementation slice/PR at a time; no next slice until required checks and reviewed merge pass.

## Finding traceability

| Finding       | Issue                                                 | Required delivery and current limit                                                                                                                                           |
| ------------- | ----------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A05-01 Medium | [#13](https://github.com/i-am-tj/LedgerOne/issues/13) | S06A/B/D: private atomic drafts selected; editable saved draft finalization excluded. Actual strict/stale handler tests remain B/C. DB revision is not a full header version. |
| A05-02 Medium | [#14](https://github.com/i-am-tj/LedgerOne/issues/14) | S06A/C/D: same-operation predecessor SQL defense implemented/tested in 007; exact authorized original selection/locking through real handlers remains C.                      |
| A05-03 Medium | [#15](https://github.com/i-am-tj/LedgerOne/issues/15) | S06A/D: catalog comparator/mutation tests/local operator attestation implemented; actual production profile/permissions and pre-exposure integration remain unverified.       |
| A05-04 Low    | [#16](https://github.com/i-am-tj/LedgerOne/issues/16) | S07, checked by S06D: audited current-label/original-context policy; no account mutation or original-name reporting exposed in S06.                                           |
| A05-05 Medium | [#17](https://github.com/i-am-tj/LedgerOne/issues/17) | S06B/C/D and S07: real financial handler authorization tests not yet implemented. Existing DB/helper tests are insufficient.                                                  |

All five issues remain open for their full reviewed acceptance. [Finding register](security/S05_FINDINGS.md) preserves exact verified scenarios/severity/impact/fixes/regressions. No conditional approval has been converted to production readiness.

## S06A implementation and acceptance

Migration `202611110007_command_audit_controls` is additive over unchanged 001–006 and advances readiness to 7. It adds immutable financial audit action/reason/scoped operation/target references with unique audit per operation; legacy workspace actions retain null financial context. Deferred checks validate action/operation kind and exact journal target. CORRECT cannot reverse a journal in the same operation. Existing receipts/SQL fixtures are not retroactively invented as audited commands: S06B must guarantee mandatory audit insertion in its command transaction.

The catalog verifier captures CHECK definitions/validation, triggers/enabled state, function bodies/search paths/security/ACL, schema/table ownership/ACL/default privileges, roles/memberships when configured, columns, indexes, enums, readiness and applied migration history. It compares the same schema/profile; SQL source/literals remain unmodified by metadata role aliases. Consistent reads use REPEATABLE READ/read-only with pinned search path. `npm run ledger:attest` attests only the actual guarded local test schema against a fresh reference; private-schema rehearsal separately verifies audit/permissions. Hosted/private production attestation remains an explicit prerequisite. No source/DB dump or credential is emitted by the verifier.

Acceptance demonstrated by SQL tests: exact POST/REVERSE/CORRECT audit target, duplicate audit rejection, append-only audit, unchanged counts on invalid audit/commit, wrong scope/action/target/reason rejection, original legacy action compatibility, own-replacement rejection and temporary-schema spoofing failure. Scratch mutations cover disabled triggers, changed/unvalidated CHECKs, unexpected helper/security/search-path/function changes, grants and migration history. Existing S05 cases remain required. Final full command results are in PROGRESS.

Changed source: Prisma financial audit relations; migration 007; schema version; invariant module/server-only entry and unit tests; local disposable-reference helper/operator CLI; new command-control integration tests; restricted-role rehearsal; CI/pipeline/package scripts. No financial command route/UI, financial runtime grant, FX restriction or production environment is changed.

## Gate and remaining risks

[W01–W15](gates/S06_WRITES.md) remain NOT RUN for full S06 acceptance; write-enablement recommendation is FAIL. Missing: actual session-derived HTTP commands/two-user attacks, canonical payload/hash replay/conflicts, mandatory transactional audit, deterministic service locks, real serialization/deadlock retries, exact authorized correction service, full restricted-runtime gate and approved target profile/grants. Partial schema/control tests do not substitute for these commands.

Preserve SELECT-only financial runtime grants and the INR-only FX CHECK. New posted history is corrected only by exact linked reversals. S07 must preserve original opening provenance and derive correction chains; audit metadata/archive/restore and explicit reconciliation differences without balance overwrite or silent unarchive. Production deployment, hosted SQL/grants, backup/restore, paid services and real-bank connections remain outside this change.

Next: complete/review/merge the S06A PR; only then begin S06B. No S06A review/merge or complete Phase 1 PASS is inferred from compiled code or owner approval of the earlier S05 PR.

## CI repair and safe reference cleanup

Ubuntu DNS failures were fixed by the version-matched official Playwright container step: remote PR run 43052573744 executed Node 22.22.0 and all 46 browser tests successfully. A parallel push run exposed a separate attestation-reference cleanup race after comparison; the tool force-dropped a backend whose pool socket was still closing. Cleanup now waits for zero connections, refuses active connections after a bounded deadline, and never uses FORCE. The CLI handles idle pool errors without raw connection dumps and prints PASS only after cleanup; private rehearsal uses the same safe cleanup. A new regression holds a reference connection open, verifies cleanup refusal and a still-working connection, then closes/retries successfully. Final local pipeline: 89 unit / 70 integration / 46 browser PASS (26.3s), all schema/attestation/build checks PASS. Current-head CI and human review remain merge requirements; no gate is waived.

## S06A final review/merge and S06B planning checkpoint

S06A final head 423c6bd passed fresh accounting/security/migration review and both exact-head CI runs (89 unit / 76 integration / 46 browser). PR #18 merged as df56d46; #8/#3/#19 done. [Review provenance, owner conditional authorization and merge evidence](https://github.com/i-am-tj/LedgerOne/pull/18#issuecomment-6801618802) are recorded without fabricating new human/peer/native approval. Earlier pending-review notes are historical.

The next story is P1-S06B #9, with its [detailed plan](stories/P1-S06B_BREAKDOWN.md) prepared on a separate documentation branch after the merge. No S06B implementation PR/handler exists yet. B-T01–05 and B-AC01–09 cover validated authenticated POST, canonical hashing/replay, atomic audit, real retry/concurrency/security tests and disabled exposure. A05 #13–#17 stay open; S07 explicitly tracks its additive OPENING-audit contract. Complete S06 write gate and Phase 1 remain closed; financial runtime grants stay SELECT-only and posting stays INR-only.

## S06B implementation review handoff — 2026-11-12 (historical checkpoint)

Planning PR #20 merged 75f8795 after review at 21df416. Separate implementation PR #21 contains sequential B-T01–05 with immutable archived-account replay, fresh-snapshot/uncertain-COMMIT recovery, mandatory audit and real HTTP atomicity/isolation/balance/replay coverage. Final source 004252e complete local pipeline PASS: 129 unit / 119 integration / 48 browser (19.5s). [Report](reports/P1-S06B.md) records exact commands, roles, source files, limits and review prerequisites. Final-head CI/accounting/security review and reviewed merge remain required; no S06C work or production write/grant/phase-gate enablement. Original findings #13–#17 remain open for full linked acceptance.
