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
