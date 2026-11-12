> 2026-11-11 update: the user authorized expanded Phase 1 P1-S01–P1-S09 (see BACKLOG.md and gates/PHASE_1.md). Initial Sxxx references below are historical scope/test identifiers, not the current execution order. Local Git is authorized; remote configuration belongs to the user. Google sign-in with an owner allowlist is selected. Accounting/security review remains required before dependent implementation.

# Decisions and authorization

> Current status (2026-11-12): S06B completed/reviewed merge `5af4c19`; S06C planning merged `b31ab0b`; guarded implementation, corrected review and actual closure are tracked in [PR #26](https://github.com/i-am-tj/LedgerOne/pull/26). Full S06 gate closed, Phase 1 incomplete, normal-runtime financial writes disabled. [Verified closure](reports/S06B_CLOSURE.md). Earlier dated checkpoints retain the state and decisions recorded at the time.

Current approvals: expanded Phase 1, GitHub delivery and reviewed S05/S06A/S06B merges are confirmed. S06C planning accepted with minor amendments and merged b31ab0b; implementation PR #26 awaits independent accounting/security review and reviewed merge. Google sign-in with an owner allowlist is selected. The table below preserves the initial proposed decisions; outstanding accounting/security reviews still apply before dependent implementation.

| ID  | Decision / proposed default                                                                                                                                           | When required                                                                                             |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| D01 | Authorize Phase 1 only (S001–S003), with local implementation and checks                                                                                              | Before S001                                                                                               |
| D02 | Confirm GitHub owner/repository, whether to initialize local Git, and permission to create milestones/labels/issues/PRs                                               | Before any remote tracker mutation; no identity exists locally                                            |
| D03 | Choose private identity access: proposed single owner, invite-only external OIDC provider with server sessions; provider and bootstrap owner still need selection     | Before S002 authentication implementation; secrets must be configured privately, never in chat/docs       |
| D04 | Approve debit/credit conventions, append-only corrections, opening equity and INR fixed functional currency                                                           | Before S004/S006 schema and posting implementation                                                        |
| D05 | Approve locked manual rates, half-even conversion, one-minor-unit-per-leg rounding cap, weighted-average monetary FX carrying cost and explicit revaluation           | Before S020; functional/native fields reviewed before S004                                                |
| D06 | Approve investment fees capitalized into cost and FIFO instrument lots (separate from monetary FX average cost); manual valuations                                    | Before S018                                                                                               |
| D07 | Choose hosting region, private deployment controls, identity provider, file storage/scanning, at-rest key ownership, backup targets/retention and recovery objectives | Before infrastructure or private release; no paid services or public deployment without separate approval |
| D08 | Approve owner-initiated workspace deletion with retention/purge window and handling of backups/audit                                                                  | Before S023; proposed 30-day recovery window subject to review                                            |

Proposed ordinary product defaults (documented; not individually blocking Phase 1): Asia/Kolkata periods; original local timestamps retained; inclusive parent/split tag union; monthly category budgets without rollover; recurring templates create drafts requiring confirmation; refunds reduce consumption on refund posting date with a link to the purchase; goals are non-ledger earmarks constrained to selected reconciled liquid assets, never a second balance. These can change before the dependent stories are implemented. Report budget/refund and overlapping tag semantics visibly.

Security/accounting decisions require review evidence in the relevant ADR/story before implementation or merge as applicable. Approval of one phase is not approval for subsequent phases, public deployment, paid services or bank access. If D03 is pending, S001 can proceed once D01 is authorized, but S002 cannot claim a working login. Remote issue creation is separate from local implementation permission.

## S02 advancement and remaining prerequisites

The user explicitly requested P1-S02 after Docker became available. This authorizes proceeding from P1-S01; remote setup remains user-owned and no reviewed remote merge is claimed. The Google owner-allowlisted sign-in choice stands for P1-S03. Provider client ID/secret, bootstrap allowlist configuration and session review must be addressed during that story; no credential is requested in this document or committed. Accounting and deployment approvals remain unchanged.

## S03 decisions and acceptance

D03's provider selection is settled: Google-only, exact verified owner allowlist. Better Auth 1.7.20 is the justified supported alternative (ADR-002), with fixed eight-hour database sessions and no cookie cache/refresh. The user authorized S03, initially chose to configure Google afterward, then asked for client creation fields and exact files; `docs/setup/GOOGLE_AUTH.md` provides them. Local `.env` slots and an application secret were created without printing or committing secrets. The owner email and Google client values are user-provided, never inferred from Git identity.

Outstanding: security review of ADR-002 and the auth implementation, plus live Google consent/callback acceptance after private configuration. The pending checklist is not waived by mock-provider tests. No public deployment, paid service, real-bank integration, accounting approval, audit retention choice or user-data deletion policy has been inferred from this story.

## Core accounting approval and S04 retention default

During this increment the user explicitly approved the proposed core ledger defaults: INR fixed functional currency; original foreign-currency quantities retained separately; asset/expense debit-normal and liability/equity/income credit-normal; posted history corrected by linked reversals. This resolves that D04 approval prerequisite for S05. It does not approve deployment, D05's detailed FX carrying-cost/rounding choices, or D06's investment cost policy. S05 code has not begun.

ADR-003 documents the S04 audit default: retain immutable mutation history until the reviewed owner export/delete lifecycle; do not automatically purge or rewrite it. Operational trace retention must be selected/configured before deployment. S03 technical review is recorded by the agent, not left as an unexplained user auditing task; independent peer review/remote merge is still not fabricated.

## Supabase and login-card steering — 2026-11-11

User chose Supabase PostgreSQL for production and created the GitHub-linked Free Mumbai project; app hosting/domain is not set up. Production connection credentials, reviewed roles/schema, hosting and backup/restore remain prerequisites, not approved paid/public deployment. Keep development/test profiles isolated. The user explicitly selected keeping the new login card active while deferring additional provider setup. Google/GitHub OAuth adapters may be committed/reviewed locally; that does not establish live GitHub acceptance or enable email/passkey/SAML/Apple/ChatGPT. See the new setup/review documents. Core accounting defaults remain approved; S05 is paused during this amendment.

## S05 authorization and staged FX approval

The user explicitly authorized completing S05 after the published foundation CI passed. They approved foreign accounts and immutable rate records with foreign-currency posting disabled until detailed FX rounding/carrying-cost review. Core INR/sign/reversal policy remains approved. This permits the S05 schema/accounting evidence, not S06 implementation, financial write exposure, production migrations, independent review claims or deployment. S05's concrete accounting/security review is recorded separately; peer review/merge remains required.

## S05 → S06 handoff authorization

The user authorized GitHub finding/story tracking and S06 delivery after S05 reviewed closure, and selected themselves as the human S05 reviewer. “I will review it” is intent, not approval. GitHub author self-approval is unavailable; retain actual human PR-comment review evidence without fabricating a formal APPROVED review or overriding repository protections. The documented implementation default is private atomic command drafts (persisted editable draft finalization excluded); A05-01 remains explicitly tracked rather than silently fixed. All five findings retain linked acceptance/regression obligations. Hosted migration/grant/deployment approval remains separate. See HANDOFF_S05_S06.md.

## Confirmed S05 closure and active S06A slice

The owner explicitly confirmed: “It was reviewed by me and merged. So please for anything new use s06 branch or a different handoff branch.” [Human review evidence](https://github.com/i-am-tj/LedgerOne/pull/1#issuecomment-6796866109) records this confirmation without fabricating a native GitHub APPROVED review. PR #1 merged implementation `1243360` at `54efed5e266847ec66c0a54caf15b9c4e5fb358a`; its two original foundation CI checks passed. Tracker #6 is closed as completed. Earlier pending-review statements in historical checkpoints describe the state when written, not the current closure status.

New work is on `feat/p1-s06a-command-controls`, based on the owner's merged main. Post-merge review/handoff documentation was carried onto this separate branch. S06A #8 is the only active implementation slice: migration 007 adds scoped immutable financial audit context and rejects CORRECT's same-operation predecessor; invariant attestation/mutation regressions cover SQL/privilege/migration state. It adds no financial write handler or runtime grant. S06B/C/D remain blocked until the active slice's required checks, human review and reviewed merge. Findings remain open for their full linked acceptance; the complete S06 write gate and Phase 1 gate remain closed.

## S06A final review/merge and S06B planning checkpoint

S06A final head 423c6bd passed fresh accounting/security/migration review and both exact-head CI runs (89 unit / 76 integration / 46 browser). PR #18 merged as df56d46; #8/#3/#19 done. [Review provenance, owner conditional authorization and merge evidence](https://github.com/i-am-tj/LedgerOne/pull/18#issuecomment-6801618802) are recorded without fabricating new human/peer/native approval. Earlier pending-review notes are historical.

The next story is P1-S06B #9, with its [detailed plan](stories/P1-S06B_BREAKDOWN.md) prepared on a separate documentation branch after the merge. No S06B implementation PR/handler exists yet. B-T01–05 and B-AC01–09 cover validated authenticated POST, canonical hashing/replay, atomic audit, real retry/concurrency/security tests and disabled exposure. A05 #13–#17 stay open; S07 explicitly tracks its additive OPENING-audit contract. Complete S06 write gate and Phase 1 remain closed; financial runtime grants stay SELECT-only and posting stays INR-only.

## S06B implementation checkpoint

The owner authorized clarified planning review/merge and sequential S06B implementation. PR #20 review/merge is recorded in comment 6802164820 / merge 75f8795; no human/native approval is invented. Raw mandatory audit reasons and future controlled consumer defaults are documented. PR #21 implementation accounting/security review and reviewed merge remain required; planning acceptance does not supply that review. No financial production write/grant/deployment authorization was inferred.

## S06C planning acceptance (now recorded; original request below)

S06B reviewed merge is confirmed. Accept or amend the [S06C breakdown](stories/P1-S06C_BREAKDOWN.md) and proposed [ADR-007](ADR/0007-shared-command-lock-order-and-correction-targets.md) before implementation: shared runner/lock order, explicit separate reversal/replacement effective instants, fresh-operation archive denial with historical replay, and conservative opening-derived exclusion with bounded 128-journal provenance. S07 retains exposed OPENING/account correction/reconciliation. No production write authorization is requested or inferred. Record acceptance/reviewed planning merge on its documentation-only PR; only then open a separate implementation branch/PR.
