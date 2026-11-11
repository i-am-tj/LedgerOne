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

S03's agent-owned technical review is recorded at `docs/security/S03_REVIEW.md` (commit e1f6d4b); it found no blocker for continued local development and lists release prerequisites without claiming an independent audit. S04 ownership/audit foundation is implemented with passing local two-user Workspace evidence, pending review. Financial account/transaction-specific isolation remains required with S05–S08. User approved the core INR/sign/reversal defaults in the accounting question during S04; no S05 implementation has started. Next story: P1-S05, after this increment's review; full phase gate remains blocked.
