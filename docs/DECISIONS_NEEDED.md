> 2026-11-11 update: the user authorized expanded Phase 1 P1-S01–P1-S09 (see BACKLOG.md and gates/PHASE_1.md). Initial Sxxx references below are historical scope/test identifiers, not the current execution order. Local Git is authorized; remote configuration belongs to the user. Google sign-in with an owner allowlist is selected. Accounting/security review remains required before dependent implementation.

# Decisions and authorization

Current approvals: expanded Phase 1 and local Git initialization are authorized; the user will configure the remote. Google sign-in with an owner allowlist is selected. The table below preserves the initial proposed decisions; outstanding accounting/security reviews still apply before dependent implementation.

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
