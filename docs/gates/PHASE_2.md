# Phase 2 gate — Everyday spending, merchants, tags and budgets

Date: 2026-11-11 (Asia/Kolkata). Result: **NOT RUN / BLOCKED BY PHASE 1**.

The user supplied Phase 2 scope, P2-E1 through P2-E4, on this date. This records the requested next scope; no Phase 2 implementation has started. The explicit Phase 1 gate rule remains in force.

## Verified prerequisite state

Repository inspected at commit `8996627` (`[P1-S01] Establish local platform, PostgreSQL migration and CI baseline`). Working tree was clean before this report. No remote is configured. `prisma/schema.prisma` defines only AppMetadata. Application source contains the foundation landing page, health routes, database helper and seed guard. There is no implemented authentication, ownership boundary, Account, Journal, Posting or financial posting service.

`docs/gates/PHASE_1.md` remains NOT RUN / BLOCKED FOR RELEASE. P1-S01 awaits review; P1-S02 through P1-S09 have not been implemented. The phrase “approved Phase 1 ledger” in the new request does not constitute evidence that the ledger exists or its invariants pass.

## Requested scope retained

| Epic                        | Ordered stories                                                                |
| --------------------------- | ------------------------------------------------------------------------------ |
| P2-E1 Classification model  | P2-S01 Categories/subcategories; P2-S02 Merchants/aliases; P2-S03 Tags/context |
| P2-E2 Fast capture          | P2-S04 Atomic splits/receipts; P2-S05 Transaction workflow/history             |
| P2-E3 Budgeting/recurrence  | P2-S06 Budgets/allocations/rollover; P2-S07 Recurring drafts/confirmation      |
| P2-E4 Operational dashboard | P2-S08 Ledger-backed daily dashboard/account views                             |

Full implementation issue contracts must be added to the current backlog before beginning these stories. Phase 2 scope updates earlier defaults: rollover options must be explicitly specified; savings allocations remain separate from consumption; recurring posting preferences must never silently finalize variable bills. Those contracts must preserve the reviewed Phase 1 accounting model.

## Release-blocking scenarios

All scenarios below are **NOT IMPLEMENTED / NOT RUN**:

- A ₹2,000 Blinkit purchase splits into vegetables ₹500, eggs ₹400, meat ₹800 and cleaning ₹300. Funding totals count it once; categorized leaves total ₹2,000. Malformed splits fail atomically.
- Merchant and category analytics reconcile to line totals; merchant aliases/merges retain provenance and do not duplicate totals.
- Parent/split tag queries count matching leaves once; contextual tags span categories.
- Recurring retries produce one occurrence; variable bills require explicit confirmation.
- ₹55,000 allocation separates ₹40,500 expense budget from ₹14,500 savings allocation. Transfers and investment purchases do not inflate spending.
- Used-category archive/merge/reassignment preserves historical reports and audit history.
- Mobile expense capture, keyboard interaction and transaction search work end to end.
- Dashboard totals reconcile to posted ledger and filtered history; card settlement adds no expense.
- Formatting, lint, typecheck, unit/integration/E2E and production build checks pass for implemented stories, with reproducible evidence and required reviews.

PASS requires Phase 1 PASS evidence first, every Phase 2 story reviewed and merged, and all scenarios above demonstrated. Phase 3 cannot begin before this gate passes. No Phase 2 tests or application checks ran during this documentation-only prerequisite assessment.
