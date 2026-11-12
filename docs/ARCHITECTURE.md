# Architecture and implementation boundaries

> Current status (2026-11-12): S06B completed/reviewed merge `5af4c19`; S06C planning merged `b31ab0b`; guarded implementation, corrected review and actual closure are tracked in [PR #26](https://github.com/i-am-tj/LedgerOne/pull/26). Full S06 gate closed, Phase 1 incomplete, normal-runtime financial writes disabled. [Verified closure](reports/S06B_CLOSURE.md). Earlier dated checkpoints retain the state and decisions recorded at the time.

Status: foundation/S05/S06A/S06B implemented; S06C guarded implementation awaits independent review/reviewed merge. PostgreSQL/Prisma and private Google sign-in through Better Auth (ADR-002) exist; no production financial writer is provisioned.

## Application boundaries

Use a modular monolith: Next.js App Router, strict TypeScript, Tailwind CSS, shadcn/ui, React Hook Form and Zod; PostgreSQL and Prisma; Better Auth as the reviewed supported alternative (ADR-002); Vitest, Playwright and GitHub Actions. Versions and lockfile are pinned in the repository; see package.json and recorded foundation verification.

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

## Implemented identity boundary — P1-S03

Better Auth 1.7.20 and its pinned Prisma adapter implement Google-only admission and server-side database sessions; the supported-alternative rationale and security review surface are in ADR-002. Prisma now includes User plus AuthSession/AuthAccount/AuthVerification/AuthRateLimit, with provider-binding uniqueness and user foreign keys. The OAuth AuthAccount name reserves Account for the future financial schema. No financial table or entity authorization is introduced.

The public root layout hosts the theme provider; `/login` is public. The `(workspace)` route group retains existing URLs and adds a dynamic authenticated layout. Each private page also invokes the server guard, avoiding layout-only protection and cached build-time redirect behavior. Route handlers authorize independently. Health remains public/minimal. `/api/session` emits only owner ID/name/email/expiry with private/no-store headers; the raw library session/token endpoints are deliberately not exposed.

Server-only modules isolate auth/DB code from client bundles. The client login controls submit strict same-origin JSON commands; Better Auth owns OAuth state/PKCE and cookie signing. Sessions are fixed at eight hours with no refresh or cookie cache. Admission precedes new identity persistence and repeats for returning Google identities; every private read rechecks current verified allowlist policy. The database adapter uses transactions. Provider tokens are encrypted and no account cookie is enabled. Direct credentials, ID-token admission, linking, profile/email updates and deletion are not exposed. Production/non-loopback origins require HTTPS; loopback HTTP supports local dev and production-build tests.

Tests use a dedicated `_test` database. Integration replaces the external Google exchange only in its own auth instance, preserving the real admission/session/adapter flow. Browser fixtures insert signed opaque sessions in the isolated DB and use a random per-run secret supplied only to the test server; there is no runtime test-auth mode. Real Google configuration/consent and independent security review remain pending. P1-S04 must implement resource ownership, request tracing and audit; authentication alone is not sufficient authorization for future financial services.

## P1-S04 implemented ownership/audit boundary

Workspace is the explicit single-owner container, with unique owner and `(id, ownerId)` keys. User owns one workspace; admission remains distinct from resource authorization. Server-only `src/lib/ownership/` verifies the current session at HTTP entry, scopes list/read/update predicates by that user, and performs success audit atomically. API contracts and intentional limits are in `docs/stories/P1-S04.md` and ADR-003. The owned API handlers emit fresh UUID correlation IDs and fixed-field traces, with raw Next logging suppressed for those paths. No private body/URL/token/error is a trace field.

AuditEvent uses actor=owner CHECK and a composite workspace/owner FK, and SQL append-only/ownership triggers. The current dev app DB role still owns migrations; these are not proof against an elevated administrator. Least-privilege deployment credentials, retention/purge, monitored storage and backup controls remain prerequisites. The new schema does not create monetary accounts or ledger records; their composite ownership links and adversarial tests are required with S05–S08.

## P1-S04A environment and entry boundary

Public `/` is static and contains no database/session data; `/login` enters the current allowed-provider flow, `/home` is protected. Production targets Supabase PostgreSQL through server-only Prisma using private `ledgerone` schema, verified TLS and separate migration/runtime roles; local/test tooling rejects remote DBs and never loads production `.env`. See `docs/setup/SUPABASE.md`. Hosted connectivity/roles and app hosting remain pending. The local Google/GitHub adapter registry is an OAuth extension seam; email/passkey/SAML and other protocols remain unimplemented and need separate contracts. See `docs/security/AUTH_ADAPTER_REVIEW.md`.

## S05 ledger persistence boundary

`Workspace` owns immutable-identity `Account`, `Journal`, `FXRate` and `LedgerOperation` records; `Posting` and opening provenance repeat composite scope/currency FKs. Journal balances are commit-time PostgreSQL constraints, not client promises. Draft mutations write parent versions to serialize finalization; posted history is immutable, with exact linked reversals. Pure bigint money/chart code is separate from server-only scoped read queries. No financial write API exists before S06; production financial grants remain SELECT-only. Staged FX and administrator/trusted-service boundaries are specified in ADR-004 and ACCOUNTING. Schema readiness version is centralized in `src/lib/schema-version.ts`; S05 forward migrations finish at 6.

## Planned S06 command boundary

[Four ordered reviewed slices](HANDOFF_S05_S06.md) cover control/audit schema and invariant attestation; session-derived POST with canonical idempotency and atomic audit; exact authorized REVERSE/CORRECT; and a fail-closed write gate. Drafts are private to a command transaction, not externally mutable server draft records. Target-state catalog attestation must supplement migration hashes and Prisma diff. Application/receipt/audit commit-time atomicity, deterministic ownership/locking and bounded full retries are acceptance requirements, not current functionality. Published financial runtime grants remain SELECT-only; no S06 source/migration is implemented until S05 reviewed merge.

## Confirmed S05 closure and active S06A slice

The owner explicitly confirmed: “It was reviewed by me and merged. So please for anything new use s06 branch or a different handoff branch.” [Human review evidence](https://github.com/i-am-tj/LedgerOne/pull/1#issuecomment-6796866109) records this confirmation without fabricating a native GitHub APPROVED review. PR #1 merged implementation `1243360` at `54efed5e266847ec66c0a54caf15b9c4e5fb358a`; its two original foundation CI checks passed. Tracker #6 is closed as completed. Earlier pending-review statements in historical checkpoints describe the state when written, not the current closure status.

New work is on `feat/p1-s06a-command-controls`, based on the owner's merged main. Post-merge review/handoff documentation was carried onto this separate branch. S06A #8 is the only active implementation slice: migration 007 adds scoped immutable financial audit context and rejects CORRECT's same-operation predecessor; invariant attestation/mutation regressions cover SQL/privilege/migration state. It adds no financial write handler or runtime grant. S06B/C/D remain blocked until the active slice's required checks, human review and reviewed merge. Findings remain open for their full linked acceptance; the complete S06 write gate and Phase 1 gate remain closed.

## S06B implementation checkpoint

S06B commands are separated into strict immutable contract/hash, authenticated HTTP boundary, transaction executor and retry policy under src/lib/ledger/commands. The App Router adapter always passes null capability. Positive construction is guarded to newly generated loopback test databases with non-owner roles and trusted target invariant snapshots; no env/header/URL switch enables production writes. Tests use real sessions plus a test-only Node HTTP adapter to the same handler. Production/private target provisioning and exposure are S06D, not inferred from this test activation.

## S06C restricted shared command extension

The [S06C breakdown](stories/P1-S06C_BREAKDOWN.md) generalizes the existing command runner; no parallel authentication/retry/orchestration system is permitted. [ADR-007](ADR/0007-shared-command-lock-order-and-correction-targets.md) proposes the global trigger-aware hierarchy before handlers. The accepted plan is implemented/tested in guarded PR #26 pending independent review; the actual Next writer stays disabled.
