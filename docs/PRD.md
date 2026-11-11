> 2026-11-11 update: the user authorized expanded Phase 1 P1-S01–P1-S09 (see BACKLOG.md and gates/PHASE_1.md). Initial Sxxx references below are historical scope/test identifiers, not the current execution order. Local Git is authorized; remote configuration belongs to the user. Google sign-in with an owner allowlist is selected. Accounting/security review remains required before dependent implementation.

# LedgerOne product requirements

Status: proposed foundation, awaiting review. Baseline: 2026-11-11 (Asia/Kolkata).

## Repository inspection

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
