# Architecture proposal

Status: proposed; see ADR-001 and DECISIONS_NEEDED.md. No infrastructure exists yet.

## Application boundaries

Use a modular monolith: Next.js App Router, strict TypeScript, Tailwind CSS, shadcn/ui, React Hook Form and Zod; PostgreSQL and Prisma; Auth.js subject to a compatibility/security spike; Vitest, Playwright and GitHub Actions. Select supported compatible versions and pin the lockfile during S001; no versions have been verified or dependencies installed in this increment.

Modules: identity/workspaces; currencies; ledger; accounts; transaction classification; attachments; imports; budgets; recurring; goals; investments; loans; reporting; privacy/operations. Route handlers and server actions call application services. UI and background jobs may not directly mutate accounting tables. Validation at boundaries is repeated in domain services, with database constraints as the final guard. Server-only modules must not be importable into client bundles.

## Proposed entities and invariants

| Entity                                 | Purpose / important keys                                                                                              |
| -------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| User, Session, Workspace, Membership   | One owner initially; workspace-scoped isolation; membership verified server-side                                      |
| Currency                               | Code, scale, effective metadata; immutable scale once used                                                            |
| Account                                | Workspace, kind (asset/liability/equity/income/expense), currency, archivedAt; physical/institution metadata optional |
| Journal                                | Workspace, postingDate, occurredAt, timezone, functionalCurrency, operationId, reversalOf, source, actor              |
| Posting                                | Journal, account, debit/credit functional minor units, original amount/currency, locked rate, valuation metadata      |
| Purchase / SplitLine                   | Parent merchant/payee/payer/receipt and timestamp; split category, amount, purpose, beneficiary; posting link         |
| Category, Merchant, Tag, TagAssignment | Scoped metadata; archived referenced records; split tag override/addition policy                                      |
| Operation / AuditEvent                 | Unique workspace/idempotency key, canonical request hash, outcome; actor/action/IDs without secrets                   |
| Reconciliation                         | Account, statement date/amount, locked statement entries and explicit adjustments                                     |
| ImportBatch / SourceRecord             | Source identity, content digest, row provenance, mappings, duplicate decisions, journal linkage                       |
| Budget / Goal / Allocation             | Period/category plan and independent earmarks; not asset postings                                                     |
| RecurringTemplate / Occurrence         | Due date, local timezone, unique template/occurrence date; draft-first policy                                         |
| Loan / LoanPayment                     | Debt account and explicit principal/interest/fee allocation                                                           |
| Instrument / Trade / Lot / Valuation   | Asset quantity, fees, cost lots, source/date, separate unrealized changes                                             |
| Attachment                             | Private object key, validated MIME/size/hash, owner and scan state                                                    |

Every foreign key between tenant records includes workspace identity or an equivalent database-enforced ownership constraint. Never rely on a client-supplied user/workspace ID. Cross-workspace linking must fail even if IDs are valid. Tags, metadata, imports, reports, exports and signed attachment access use the same scope checks as posting.

## Financial write path

Authenticate → resolve membership → parse decimal strings and input contract → verify operation key and payload hash → validate accounts/classification/rates → within a database transaction lock affected records deterministically, write operation, journal/postings and audit → enforce deferred balancing/immutability constraints → commit → return stable operation result. On a retry return the existing result for the same payload, reject key reuse with a different payload. Retry bounded serialization/deadlock failures using the same key. A failure must roll back all business and audit mutations; security failures may use a separate sanitized security event channel.

Drafts are editable and excluded from balances. Posting is a separate atomic transition. Posted financial rows are append-only; corrections use linked reversal and replacement. Reversal uniqueness and account locks prevent concurrent duplicates. Database migrations include SQL constraint triggers where Prisma cannot express cross-row checks. A normal application role cannot bypass journal balance or append-only enforcement. Migration/admin access is separate and audited. The final mechanism must be reviewed and integration-tested against PostgreSQL, not an in-memory substitute.

## Precision and reporting

Use integer minor units in NUMERIC(38,0), parsed to bigint/domain values and serialized as strings. Currency scales are explicit; rates and instrument quantities use fixed-scale decimal strings (proposed NUMERIC(38,18)). Never coerce accounting values to Number. Rates are positive with bounded magnitude and explicit quotation direction. Reject unsupported scale/overflow instead of silently rounding input. ROUND_HALF_EVEN applies only at documented conversion boundaries, with explicit rounding postings. ACCOUNTING.md defines the invariants.

Reports derive from posted journals and classified leaf lines. Any summary/cache is rebuildable and keyed by workspace, filters and revision. All sums are within a currency or translated under the stated historical/valuation policy. Interactive display charts may use derived presentation numbers only after decimal-safe aggregation and bounded conversion; displayed totals retain exact formatted values. Pagination and date/category/tag/account filters must share a consistent query contract.

## Security and operation

Private invite-only access by default. Session cookies: secure in production, HttpOnly, appropriate SameSite and expiry; CSRF/origin protection for writes. Validate session revocation and ownership, rate-limit sensitive endpoints, sanitize user-visible errors and do not log financial payloads, tokens or receipts. TLS at deployment, secret manager/environment injection with no committed keys, least-privilege database/object storage, isolated environments and encrypted backups. At-rest storage and key custody must be selected before deployment.

Files: private storage, generated names, allowlist types, byte signature validation, size/count limits, quarantine/scanning and short-lived authorized download links. Never serve untrusted HTML/SVG inline. Import previews parse without executing formulas or macros; CSV exports neutralize spreadsheet formula injection while documenting the export contract. Background jobs re-authorize their workspace and use unique occurrence keys.

Testing: exact domain unit tests; real PostgreSQL integration tests for constraints, isolation and races; browser tests for keyboard and user journeys; backup restore drills against an isolated database. CI gates formatting, lint, typecheck, tests and production build. S024 defines deployment/runbooks; this proposal provisions nothing.

## Implemented presentation boundary — P1-S02

The root shell provides semantic main/navigation landmarks and a Radix modal mobile menu. Only Overview, Appearance and Component library routes are linked. Upcoming finance modules are plain text and do not query or fabricate balances. Local UI primitives follow the shadcn/Radix composition convention (Slot, CVA, Tailwind tokens); `components.json` records aliases and CSS location. A CSS-based decorative illustration contains no financial metrics.

`next-themes` sets the root class with Light/Dark/System support and persists only `ledgerone-theme` in browser storage. The initial theme script and root hydration suppression follow that library's pattern; no user-specific financial facts enter the theme layer. Colors, focus indicators, spacing and breakpoints are in globals.css. System fonts avoid external asset requests. Reduced-motion rules disable animation.

The RHF/Zod component preview validates locally and explicitly stores nothing. Reusable loading/error/empty/success components are also used by route boundaries. No financial write service or identity check is represented as implemented by these UI examples. P1-S03 must protect future private routes before private data is added.

Playwright drives the production build on port 3100 for desktop/mobile Chromium, with axe A/AA-tagged checks and screenshot evidence. These complement TypeScript/ESLint and do not assert complete accessibility, security or accounting correctness. CI adds browser execution after build. No migration is introduced by this story.
