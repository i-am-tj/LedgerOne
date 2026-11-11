# ADR-001: Modular monolith with an immutable journal ledger

Date: 2026-11-11. Status: PROPOSED, not approved or implemented.

## Context

A private finance application must preserve balanced history, user isolation, exact amounts and reproducible reporting while supporting small independently reviewed increments. The repository is empty.

## Decision proposed

Use the default Next.js/TypeScript/PostgreSQL/Prisma stack as one modular application. Keep the financial domain independent of UI and ORM. Use posted immutable journals with original quantities and functional-currency amounts, append-only corrections and transactional operation keys. Enforce critical invariants in PostgreSQL as well as services. Use server-only writes and private authenticated access. Start with INR functional currency and a development-only dataset.

Auth.js remains a candidate until S002 verifies maintained compatibility, secure session handling and the selected identity provider. A supported alternative needs a separate ADR. Dependencies are pinned only after verification in S001.

## Alternatives and consequences

Simple mutable transaction totals are easy to build but cannot safely explain transfers, debt and FX history. Microservices increase consistency and operational burden without an initial need. Event sourcing across the entire product adds complexity; append-only financial journals and audit history meet the current requirement without making every settings edit an event stream.

This proposal requires SQL migrations beyond ORM-generated constraints, real PostgreSQL tests, explicit reversal workflows and carefully separated historical/market valuations. It supports one transaction boundary and reproducible reporting, but it does not by itself prove correctness or security.

## Review

Approval evidence: none. Ledger/sign/FX review is required before S004/S006/S020. Identity/session review is required before S002 writes authentication behavior. Superseding decisions receive new ADR files; do not silently rewrite accepted history.

## P1-S01 tooling verification

The first story pins Next.js 16.4.6 and stable Prisma 7.10.1 rather than the Prisma 8 release candidate. Sources consulted: https://nextjs.org/docs/pages/getting-started/installation and https://www.prisma.io/docs/orm/v7. Node 22.22 satisfies their relevant runtime requirements. The Prisma PostgreSQL driver adapter and explicit Prisma config are included.

ESLint 10 with the direct recommended JavaScript/TypeScript configurations is used for the initial lint baseline. The current Next ESLint bundle pulled React/import/accessibility plugins whose declared peer support stops at ESLint 9; installing it with ESLint 10 emitted peer conflicts, while ESLint 9 is deprecated. It was removed rather than accepting unsupported peers. Framework-specific lint and accessibility tooling must be selected and verified in P1-S02; the current baseline does not claim those rules. TypeScript and production compilation also run. No Auth.js provider/session or ledger decision is implemented by this tooling choice.
