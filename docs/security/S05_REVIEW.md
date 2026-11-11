# S05 accounting/security technical review

Date: 2026-11-11. Scope: local S05 schema/domain/read boundaries and additive migrations 004–006. User approved core INR/sign/reversal and staged FX rules and authorized this story. Agent-owned review only; peer accounting/security review and reviewed merge remain pending.

## Controls and demonstrated evidence

- Composite workspace/owner/currency foreign keys on financial references; trusted server-only query helpers repeat current actor scope and return identical foreign/missing 404. Bigint monetary DTOs serialize as strings. No public financial endpoint or caller-selected owner identity was added.
- Immutable currency definitions and account identity/class/kind/currency; correct normal-side mapping; positive bounded minor-unit postings; exact SQL numeric sums and bigint application arithmetic. Canonical input validation never coerces JS numbers. Normal-side display rules do not enforce available-funds/credit limits.
- DRAFT→POSTED final-state checks cover nonempty balanced 2–500 legs, active compatible accounts, timestamp and atomic operation outcome. Posted context/postings and FX/operation evidence reject UPDATE/DELETE/TRUNCATE. Original opening provenance has no duplicated money amount.
- Exact multiset reversals (including duplicate-line multiplicity), one full reversal per original, same scope and already-posted predecessor. The immediate predecessor guard prevents circular draft reversals from appearing valid only at deferred-check time.
- Draft child edits write parent revisions, so finalization cannot validate a stale MVCC snapshot; explicit account locks reject archive races. Deterministic real-DB lock-wait and repeatable-read tests verify both serialized success and rejected stale commits.
- Pinned function search paths include pg_temp explicitly last; temporary-table spoofing test fails closed. Functions use invoker rights and no privileged dynamic owner context. The disposable private-schema test explicitly grants assertion-helper execution to a temporary non-owner writer and verifies constraints/rollback/immutability. Published financial runtime grants remain SELECT-only before S06.
- Three forward migrations preserve prior applied-file hashes; integration compares SHA-256 of every applied migration. Fresh private-schema migrations and Prisma diff have zero drift. Constraint/trigger tests are separate because Prisma schema diff alone cannot prove SQL invariants.

## Review findings resolved during this story

After 004's initial local test application, review found PostgreSQL's implicit temporary-schema precedence; 005 hardened it without editing applied SQL. Review then identified a possible circular reversal graph with deferred-only predecessor validation; 006 added an immediate already-posted guard. Readiness version 6 requires the full sequence. Test-title formatting initially attempted JSON serialization of bigint fixtures; labels were fixed. These failures were not waived and applied migration checksums remain intact.

## Limits and next review

No financial write API or UI is exposed. S06 must derive actor from a verified session, validate command payloads, compare idempotency payload hashes on retries, emit transactional financial audit, handle serialization/deadlock retry safely and define correction results before financial write grants are enabled. S07 must implement account/opening correction/reconciliation and controlled archived-account behavior. Current archived accounts accept no new journal, including reversals. Existing raw SQL/fixture tests are not full endpoint authorization or idempotent replay service evidence.

Foreign accounts/manual rates are modeled; foreign postings/conversion/rounding/carrying cost and valuation-only legs are disabled pending explicit review. FX quote precision is bounded; a future endpoint must use strict decimal-string validation rather than SQL's implicit numeric coercion. Shared runtime SQL credentials are trusted; FK scope checks do not replace per-query authorization and are not user-specific RLS. A privileged migration administrator can disable/drop protections. Production role provisioning/connectivity, independent review, backup/restore, financial transaction templates and Phase 1 gate remain pending.

Concrete review requested: ACCOUNTING.md / ADR-004, migration SQL and `tests/integration/ledger-schema.test.ts`, particularly ownership keys, revision/lock isolation, opening/reversal semantics and staged FX. Tests and exact command results are recorded in PROGRESS.
