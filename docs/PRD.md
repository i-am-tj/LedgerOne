> 2026-11-11 update: the user authorized expanded Phase 1 P1-S01–P1-S09 (see BACKLOG.md and gates/PHASE_1.md). Initial Sxxx references below are historical scope/test identifiers, not the current execution order. Local Git is authorized; remote configuration belongs to the user. Google sign-in with an owner allowlist is selected. Accounting/security review remains required before dependent implementation.

# LedgerOne product requirements

> Current status (2026-11-12): S06C completed/reviewed merge `3502754` at corrected head `c22488b`; #10/#27 closed. [Verified closure](reports/S06C_CLOSURE.md). S06D planning PR #28 accepted/amended and merged `d048d8b`; isolated local implementation now proceeds in a separate PR. Hosted operations remain unauthorized. A05-01–05 remain open. Full S06 gate closed, Phase 1 incomplete, normal-runtime financial writes disabled. Earlier dated checkpoints retain their original decisions and evidence.

Status: foundation through reviewed S06B implemented for its production-disabled contract. Remaining product scope is planned. Baseline: 2026-11-11 (Asia/Kolkata).

## Initial repository inspection (historical)

The project directory was empty before this documentation increment. No application, package manifest, database, tests, CI, Git repository, remote, or applicable AGENTS.md was found. No implementation or remote resources have been created. Documentation does not demonstrate working functionality.

## Product and audience

A private personal finance web application for everyday and international use. Isolation must be enforced per user even in a private deployment. A transaction must explain what was bought, where, why, for whom, when, which account paid, and its cash-flow and net-worth effects.

## Requirements inventory

| ID  | Requirement                                                                            | Planned stories        |
| --- | -------------------------------------------------------------------------------------- | ---------------------- |
| R01 | Responsive accessible shell; mobile capture; honest empty/loading/error/success states | S001, S003, S009, S022 |
| R02 | Secure authentication, sessions, user isolation and private access                     | S002, S005, S023       |
| R03 | Decimal-safe currencies, balanced immutable ledger, audit, idempotency                 | S004–S007              |
| R04 | Physical accounts, assets, liabilities, opening balances and reconciliation            | S005, S014             |
| R05 | Expense, income, transfer, card, FD and loan-safe posting                              | S006, S009, S019       |
| R06 | Independent merchants, category trees, tags and inheritance                            | S008, S010             |
| R07 | Split purchases, parent context and no double counting                                 | S010                   |
| R08 | Validated private receipts/attachments                                                 | S011                   |
| R09 | Budgets and consumption reporting, including credit-card spending                      | S015                   |
| R10 | Recurring templates, bill due dates and explicit generation policy                     | S016                   |
| R11 | Goals/earmarks independent of accounts                                                 | S017                   |
| R12 | Investments, cost basis, valuations and net worth                                      | S018, S021             |
| R13 | Loans: debt, principal, interest, fees and payment allocation                          | S019                   |
| R14 | Multi-currency, captured FX/fees, historical quantities and valuations                 | S004, S020             |
| R15 | Import provenance, duplicate review, export                                            | S012, S013             |
| R16 | Dashboard and analytics from real posted records                                       | S021                   |
| R17 | Settings, export/delete lifecycle and retention                                        | S013, S023             |
| R18 | Backups and demonstrated restore                                                       | S024                   |
| R19 | CI, automated tests, phase gates, reproducible evidence                                | S001, S007, S022, S024 |
| R20 | Development-only demo data, no banks/paid services/public release without approval     | S003, S024             |

## Product rules

Modules: Dashboard, Transactions, Categories, Merchants, Tags, Accounts, Budgets, Analytics, Goals, Investments, Loans, FX, Import/Export and Settings. Show only implemented routes/actions. Use informative empty states until real data exists; no fabricated metrics or inactive controls presented as usable. Posting date drives accounting reports; occurrence timestamp and original timezone remain available. Initial monthly periods use Asia/Kolkata. Currency formatting must not change stored values.

Consumption reports count categorized expense postings exactly once, including card purchases, interest and fees, less explicit reversals/refunds. Transfers, card settlement, deposits to FD, loan principal and investment acquisitions are not consumption. Cash-flow reports separately explain movements of cash and cash-equivalent accounts and exclude internal transfers within the selected perimeter. Net worth equals assets less liabilities with a stated valuation date, source and currency basis. Stale or missing valuations must be visible.

Defaults: single owner per workspace, no household sharing, no automatic bank integration, manual FX rates, no automatic public signup. Merchant is independent of category. Category deletion becomes archive once referenced. A goal is an earmark, never a new bank balance. Historical transaction facts remain available after master data is archived.

## Intentional deferrals

PWA/offline writes are deferred until core gates pass; offline financial conflict resolution is not approved. Bank connections, public deployment and paid services require separate approval. Automatic investment feeds, tax filing, trading, household sharing and automated loan amortization are not MVP promises; manual records and valuations remain in scope. Supporting international currencies does not claim jurisdiction-specific tax compliance. Core import begins with a documented CSV contract; additional source formats require their own stories. No broad module is silently omitted: the roadmap places every requirement above.

## Success and release acceptance

A user can enter and reconcile representative activity, explain category consumption without transfer double counting, export their original facts, and restore a backup. All financial writes are server-authorized and atomic. Each phase must pass its published gate. A story remains awaiting review until merged after review; local checks alone cannot mark it done. No implementation authorization is inferred from approval of this planning document.

## P1-S02 product evidence

R01's responsive shell, theme, keyboard navigation and shared visible states are implemented for Overview, Appearance and Component library; financial module states remain future work. The overview explicitly discloses that account setup/capture are unavailable and displays no invented totals. R19 gains production-build browser journeys and automated accessibility evidence. Details and limitations: `docs/stories/P1-S02.md`. The overall Phase 1 and financial requirements remain incomplete.

## P1-S03 product evidence

R02 now has an implemented Google-only login/logout boundary, verified exact owner allowlist, database sessions, absolute eight-hour expiry, per-page/API checks, safe public configuration/error states and automated negative/session tests. User/provider credentials are still configured privately and live Google acceptance is pending. Public registration, password login and implicit account linking are not available. Real two-user financial entity isolation remains P1-S04; the full R02 requirement and Phase 1 gate are not complete. See `docs/setup/GOOGLE_AUTH.md` and ADR-002 for setup/policy review.

## P1-S04 product evidence

R02 gains an implemented resource boundary: allowed identities can access only their own Workspace and latest audit events. R03's audit foundation records workspace mutations atomically and rejects history edits. These APIs have no new UI and contain no monetary account/transaction behavior. Financial R02/R03 tests and all accounting requirements remain pending S05–S08; see the explicit dependency reconciliation in the S04 story. No deployment or full Phase 1 PASS is claimed.

## Public entry clarification — P1-S04A

A visitor can view a data-free dashboard preview at `/` and select Sign in. Private workspace/actions require an allowed session at `/home` and independent server API authorization. The user retained the refreshed login card while deferring additional provider integrations. No public registration or personal financial data is exposed by this entry view.

## S05 delivery boundary (historical checkpoint)

Chart/owned financial schema and invariant enforcement are implemented for review. Exact INR postings are supported at the DB foundation only; foreign account/rate records are modeled while foreign posting is explicitly disabled by user approval. User account management, transaction capture, balances/reconciliation and command audit/idempotent replay remain S06–S09. No financial UI or public mutation endpoint is presented as working in S05.

## S05 → S06 delivery contract (historical checkpoint)

The user-authorized [GitHub handoff](HANDOFF_S05_S06.md) makes all five S05 findings traceable to S06/S07 issues and acceptance tests. S06 consists of four reviewed slices; runtime write exposure stays disabled until actual handler, replay/audit, correction, concurrency and invariant-drift gate evidence passes. Account metadata/history/reconciliation remains S07. The foundation’s conditional approval does not establish production readiness, implemented commands or Phase 1 PASS.

## Confirmed S05 closure and active S06A slice (historical checkpoint)

The owner explicitly confirmed: “It was reviewed by me and merged. So please for anything new use s06 branch or a different handoff branch.” [Human review evidence](https://github.com/i-am-tj/LedgerOne/pull/1#issuecomment-6796866109) records this confirmation without fabricating a native GitHub APPROVED review. PR #1 merged implementation `1243360` at `54efed5e266847ec66c0a54caf15b9c4e5fb358a`; its two original foundation CI checks passed. Tracker #6 is closed as completed. Earlier pending-review statements in historical checkpoints describe the state when written, not the current closure status.

New work is on `feat/p1-s06a-command-controls`, based on the owner's merged main. Post-merge review/handoff documentation was carried onto this separate branch. S06A #8 is the only active implementation slice: migration 007 adds scoped immutable financial audit context and rejects CORRECT's same-operation predecessor; invariant attestation/mutation regressions cover SQL/privilege/migration state. It adds no financial write handler or runtime grant. S06B/C/D remain blocked until the active slice's required checks, human review and reviewed merge. Findings remain open for their full linked acceptance; the complete S06 write gate and Phase 1 gate remain closed.

## S06B implementation checkpoint (historical checkpoint)

S06B now implements the raw authenticated INR POST boundary in guarded disposable tests, with canonical replay/audit/retry and normal Next writes disabled. No transaction UI, merchant/budget/template/correction/FX feature is introduced. See reports/P1-S06B.md; #21 awaits implementation review/merge.
