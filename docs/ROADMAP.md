# Current delivery roadmap

The user authorized an expanded Phase 1 on 2026-11-11. It replaces the initial seven-phase schedule for implementation order. Local Git initialization is authorized; the user will configure a remote. No remote issue creation or public release is implied.

| Milestone | Epic                        | Ordered stories          | Exit evidence                                                               |
| --------- | --------------------------- | ------------------------ | --------------------------------------------------------------------------- |
| Phase 1   | P1-E1 Repository/platform   | P1-S01 → P1-S02          | Fresh migration/setup and accessible light/dark shell                       |
| Phase 1   | P1-E2 Identity/ownership    | P1-S03 → P1-S04          | Google owner allowlist, sessions and two-user isolation                     |
| Phase 1   | P1-E3 Ledger/accounts       | P1-S05 → P1-S06 → P1-S07 | Exact schema constraints, atomic posting/reversals, openings/reconciliation |
| Phase 1   | P1-E4 Baseline transactions | P1-S08 → P1-S09          | All reference templates/classifications and reproducible financial gate     |

One story/PR at a time. Required checks and reviewed merge block advancement. All epic integration scenarios are in BACKLOG.md. Release-blocking Phase 1 criteria and current status are in gates/PHASE_1.md. Do not begin Phase 2 until the Phase 1 gate is PASS and the next scope is authorized.

Future scope remains tracked in PRD.md and archive/BACKLOG_INITIAL.md: richer capture/splits/tags/merchants/attachments, import/export, budgets/recurring/goals, investments/full FX, analytics, privacy/accessibility and backup/restore. Phase numbers for that work must be replanned after this expanded phase; none is silently removed. Native/functional FX constraints are required now; complete multi-currency execution/revaluation workflows remain future scope. No public deployment, banks or paid services without approval. PWA remains deferred until core stability.

## Current checkpoint

The user's instruction to proceed with S02 authorizes advancement from the local P1-S01 increment. P1-S02 is implemented and locally verified, awaiting review; no remote PR/merge is claimed. Next is P1-S03 (Google sign-in and owner allowlist). P1-E1 local integration scenarios are recorded in `docs/stories/P1-S02.md`; formal epic closure awaits review. The expanded Phase 1 gate remains blocked by identity, ownership and ledger implementation.

## P1-S03 checkpoint

The user authorized S03. Google-only admission and fixed database sessions are implemented; automated evidence and security policy are in `docs/stories/P1-S03.md` and ADR-002. The user is configuring Google locally after receiving exact Console fields and `.env` instructions. Live Google acceptance, security review and remote merge are not claimed. Next is P1-S04 ownership/audit, after S03 acceptance/review. Phase 1 remains blocked by those prerequisites and all ledger stories; no Phase 2 work starts.

## P1-S04 checkpoint

S03's agent-owned technical review is recorded at `docs/security/S03_REVIEW.md` (commit 533003d); it found no blocker for continued local development and lists release prerequisites without claiming an independent audit. S04 ownership/audit foundation is implemented with passing local two-user Workspace evidence, pending review. Financial account/transaction-specific isolation remains required with S05–S08. User approved the core INR/sign/reversal defaults in the accounting question during S04; no S05 implementation has started. Next story: P1-S05, after this increment's review; full phase gate remains blocked.

## Authorized foundation amendment

P1-S04A interrupts the S04→S05 transition at the user's request: Supabase production preparation, separate environment profiles and public-entry/private-home navigation. Local checks and review are recorded in PROGRESS; production credentials/domain/roles and release gates remain pending. The user then requested review and separate commits for their OAuth adapter/login-card edits, retaining the card while deferring provider setup. Neither request authorizes Phase 2 or public deployment.

## S05 checkpoint

User authorized S05 after the successful remote foundation pipeline and approved staged foreign-currency schema support. The exact owned schema, deferred balancing, concurrency guards, opening/reversal structure and scoped reads are implemented with local evidence recorded in PROGRESS. Accounting/security peer review and merge precede S06. S06–S09 and the phase gate remain pending; no Phase 2 work starts.

## S05 → S06 reviewed delivery

Remote tracking is authorized and established under Phase 1 milestone #1. The [handoff](HANDOFF_S05_S06.md) maps P1-E3 sub-epics, findings and four ordered S06 slices. S05 PR #1 awaits the user’s completed accounting/security review and reviewed merge. S06A controls/audit → S06B POST → S06C REVERSE/CORRECT → S06D write gate, each with reviewed merge before the next. No S06 code or financial write enablement has begun.

## Confirmed S05 closure and active S06A slice

The owner explicitly confirmed: “It was reviewed by me and merged. So please for anything new use s06 branch or a different handoff branch.” [Human review evidence](https://github.com/i-am-tj/LedgerOne/pull/1#issuecomment-6796866109) records this confirmation without fabricating a native GitHub APPROVED review. PR #1 merged implementation `1243360` at `54efed5e266847ec66c0a54caf15b9c4e5fb358a`; its two original foundation CI checks passed. Tracker #6 is closed as completed. Earlier pending-review statements in historical checkpoints describe the state when written, not the current closure status.

New work is on `feat/p1-s06a-command-controls`, based on the owner's merged main. Post-merge review/handoff documentation was carried onto this separate branch. S06A #8 is the only active implementation slice: migration 007 adds scoped immutable financial audit context and rejects CORRECT's same-operation predecessor; invariant attestation/mutation regressions cover SQL/privilege/migration state. It adds no financial write handler or runtime grant. S06B/C/D remain blocked until the active slice's required checks, human review and reviewed merge. Findings remain open for their full linked acceptance; the complete S06 write gate and Phase 1 gate remain closed.

## S06A final review/merge and S06B planning checkpoint

S06A final head 423c6bd passed fresh accounting/security/migration review and both exact-head CI runs (89 unit / 76 integration / 46 browser). PR #18 merged as df56d46; #8/#3/#19 done. [Review provenance, owner conditional authorization and merge evidence](https://github.com/i-am-tj/LedgerOne/pull/18#issuecomment-6801618802) are recorded without fabricating new human/peer/native approval. Earlier pending-review notes are historical.

The next story is P1-S06B #9, with its [detailed plan](stories/P1-S06B_BREAKDOWN.md) prepared on a separate documentation branch after the merge. No S06B implementation PR/handler exists yet. B-T01–05 and B-AC01–09 cover validated authenticated POST, canonical hashing/replay, atomic audit, real retry/concurrency/security tests and disabled exposure. A05 #13–#17 stay open; S07 explicitly tracks its additive OPENING-audit contract. Complete S06 write gate and Phase 1 remain closed; financial runtime grants stay SELECT-only and posting stays INR-only.

## S06B implementation checkpoint

Planning PR #20 merged 75f8795 after targeted clarification review and exact-head green CI. S06B #9 code/test packages B-T01–05 are implemented sequentially in separate PR #21; local full pipeline 129/119/48 PASS. S06B awaits final-head accounting/security review and reviewed merge. S06C is the next implementation story only after that merge, with no work begun. Full S06 write gate and Phase 1 remain closed.
