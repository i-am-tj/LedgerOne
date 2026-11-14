# P1-S07 first usable slice

**ID:** P1-S07-A | **Title:** Create account, set opening balance, display posted balance | **Epic:** P1-E3 | **Priority:** P0 | **Dependencies:** S06D restricted local merge 88df395; additive opening-audit accounting/security review required by parent S07 acceptance criterion 4.

**User story:** As an authenticated owner, I can create a physical account with an optional opening amount and see its posted balance.

**Inputs:** Server-derived session and owned workspace, idempotency key, name (1–80 trimmed characters), supported asset/liability account kind, INR, signed decimal opening amount in normal-balance convention and explicit effective instant. Assets are debit-normal and liabilities credit-normal. Unknown owner/internal/journal fields reject. Consumer expense/transfer commands remain S08.

**Outputs:** Typed account command and account UI, original-context creation snapshot, atomic opening receipt/journal/marker/audit, exact per-account displayed balance, replay without new effects. Current increment implements only the unexposed balance service and public/private integration regression. Creation, opening and UI remain unimplemented.

## Required opening-audit contract for review

The parent S07 story already requires this additive contract before opening availability. Propose a new migration after 007, preserving all original bytes and financial runtime SELECT-only grants.

- Add financial audit action `ledger.opened`. It requires nonblank reason and the same operation/target ownership FKs and append-only/uniqueness controls as existing financial audits.
- Map it exclusively to an OPENING receipt and its one posted OPENING journal. The audit target is that journal. Require its original opening marker in the same owner/workspace, and preserve the existing two-leg asset/liability versus OPENING_EQUITY constraints.
- Add an OPENING-only receipt-side deferred check for newly inserted receipts requiring exactly one correctly scoped opening audit. Retain legacy receipts unchanged. This does not include the separately unaccepted POST/REVERSE/CORRECT receipt-audit experiment.
- Opening provenance is server-controlled `User-entered opening balance`; controlled default audit reason is `Opening balance`. Ordinary users need not type an internal audit reason.
- Signed normal-balance amount determines posting sides. Nonzero amounts produce exactly two equal absolute-quantity INR legs. Zero creates the account without zero postings or a fictitious financial receipt.
- Create the account, immutable initial-name context, account creation idempotency result, optional financial opening, marker and audits in one transaction. Use existing shared authorization/retry/uncertain-COMMIT machinery; no competing command runner.
- Replay must use persisted immutable result evidence before mutable archive eligibility. A different payload for the key conflicts. Two distinct opening attempts for the same account cannot create a second original marker.
- Account-first deterministic locking and all current constraints remain authoritative. No temporary unarchive. Opening-derived correction and reconciliation remain later parent-story tasks.

This is a proposed additive financial contract, not an applied migration or permission change.

## Implementation tasks

- [x] Implement exact owner-scoped balance-as-of service, including archived accounts and inclusive effective instant.
- [x] Add public/private schema regressions for exact MAX quantities, asset/liability signs, ownership denial, empty balances and effective boundary.
- [ ] Obtain required opening-audit contract review; implement additive fresh/upgrade migration and negative SQL regressions.
- [ ] Reuse shared command engine for typed atomic account creation/opening, immutable snapshot, idempotent result and transactional audit.
- [ ] Build create-account form and balance view with accessible validation/loading/empty/error/success states.
- [ ] Run real two-user handler tests, replay/conflict/concurrent duplicate-opening, staged/deferred rollback and browser flow.
- [ ] Complete standard pipeline, source review and reviewed merge.

## Acceptance criteria

1. Given no postings, reading an owned account returns exact zero in its own currency.
2. Given a posted leg at instant T, balance at T includes it and T minus one millisecond excludes it, independent of PostgreSQL session timezone.
3. Given a credit-card purchase, its liability balance is credit-normal. Archived balances retain posted history. Foreign-owner reads return 404.
4. Given a valid create/open request, one account and all required financial and audit rows commit atomically; replay returns the same immutable result and no extra rows.
5. Given wrong audit action/owner/operation/target/marker or missing audit, deferred commit rejects every new row. All existing financial audit/legacy tests pass.
6. Given a normal signed-in user, the accessible create form leads to the displayed account balance. No raw generic posting UI/API is exposed.

**Unit tests:** Signed amount/side mapping, zero policy, kind/class restrictions and canonical creation payload.

**Integration/E2E tests:** `account-balance.test.ts` covers implemented reads. Remaining tests cover real-session create/open, audit identities and omissions, duplicate opening/replay, archived replay, negative ownership and complete form flow.

**Failure/edge cases:** Zero/negative opening, invalid/foreign currency, maximum amount, no matching account, archived account, duplicate opening, session revocation, cancelled request and uncertain COMMIT. Balance query uses explicit schema allowlist and an ISO timestamp cast because the installed Prisma adapter showed incorrect timezone conversion in a new local-boundary regression. PostgreSQL stored the original instant correctly. No existing financial writer was changed.

**Rollback/migration notes:** New SQL must be additive and reviewed, applied only to authorized local fixtures during development. Restore original schema via disposable fixture recreation before acceptance. Posted financial history is corrected by linked reversals, never destructive edits. No hosted or production grants are authorized.

**Definition of done:** Complete first flow through actual typed handler/UI, exact authorization/atomicity/audit/idempotency tests, additive migration and recovery evidence, standard checks green and reviewed merge. This document and the read-only service alone do not complete the slice.

**GitHub references:** Parent #12, A05-04 #16 and account authorization #17. Separate S07 draft PR carries this first increment and the required opening-audit contract review.

## Initial balance-query regression evidence

The first new tests failed at the inclusive boundary when Prisma interpreted a timestamptz value as a different instant on the Asia/Kolkata native fixture. PostgreSQL independently returned `2026-02-01 05:30:00+05:30` and confirmed it equals the requested `2026-02-01T00:00:00Z`. The new balance service now sends an ISO string with explicit timestamptz cast and returns SQL numeric SUM as text before BigInt sign formatting. Fixed schema names are runtime-allowlisted; user identifiers/amounts/instants are parameters. No existing S06 source, migration or timeout changed. Corrected public/private results and full pipeline are recorded on the S07 PR after execution.
