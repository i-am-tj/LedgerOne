# S06D capacity blocker and proposed optimization review

**Status: PROPOSED; no optimization, retry-policy or schema change implemented.** D-T03 capacity qualification is FAIL; D-T04 progression is blocked by its accepted D-T01–03-green dependency. Local work is not blocked by missing hosted authorization; it is blocked by an observed required local capacity failure. Full S06/Phase 1 gates stay closed and native financial capability remains null.

## Confirmed evidence and limits

The first 24-cell smoke campaign produced 22 PASS / 2 FAIL with shared account unions and setup interleaved with measured commands. Its failures are retained. An expanded 45-cell diagnostic run produced 38 PASS / 7 FAIL. These runs are contention evidence, not clean uncontended qualification.

A corrected 48-cell campaign uses disjoint account unions across simultaneous logical commands and completes original setup before measuring REVERSE/CORRECT. It produced **42 PASS / 6 FAIL**, 164.47s. Six representative four-way POST/REVERSE cells failed the ≤1% unexpected failure budget. In those cells 1–4 of 32 requests exhausted three full attempts after actual 40001 errors; command latency itself remained within candidate limits. All observed committed journals balanced, no drafts survived, and no operation lacked its audit. All single-command maximum stress fixtures succeeded. Shared-account and maximum-load failures are separately labelled, never counted as successful capacity.

These results confirm a local availability gap, not incorrect ledger quantities or an ownership bypass. Observed SQLSTATEs prove serialization retries occurred; they do not by themselves prove which predicate, query plan or index caused the dependency. PostgreSQL documents that serializable predicate locks depend on query plans and that broader scans can increase abort rates. Query-plan/lock diagnosis remains necessary; no new index is justified merely by guessing. [PostgreSQL 17 isolation documentation](https://www.postgresql.org/docs/17/transaction-iso.html).

## Proposed reviewed change: bounded posting insertion batching

Candidate scope is the existing `PostExecutor.writeJournal` persistence step only. Keep authenticated actor derivation, private draft, idempotency hash/receipt, sorted account union, exact-original locking, SERIALIZABLE transaction, immutable result reconstruction, audit and COMMIT/retry lifecycle intact. Do not introduce a second runner or a consumer endpoint.

Replace one INSERT per validated leg with one bounded parameterized multi-row insertion per journal, up to the existing 500 legs. Generate posting IDs on the server and bind all account IDs and original fixed-precision minor quantities as strings. A possible SQL shape is:

```sql
INSERT INTO posting
 (id,"journalId","workspaceId","ownerId","accountId","currencyCode",side,"nativeMinor","functionalMinor")
SELECT x.id,$2,$3,$4,x."accountId",'INR',x.side::"PostingSide",x.minor::numeric,x.minor::numeric
FROM jsonb_to_recordset($1::jsonb) AS x(id uuid,"accountId" uuid,side text,minor text);
```

Identifiers resolve through the reviewed transaction schema, never user input. The bound JSON is created from the already validated internal legs; amounts remain strings throughout JSON and are parsed by PostgreSQL numeric, never JS floating point. Preserve exact duplicate multiplicity; do not group or aggregate legs. Keep every per-row trigger, CHECK, FK, revision update, reversal multiset and deferred audit/journal/operation check active. Assert affected rows equal input legs. A single malformed row must abort the statement and then the entire command transaction, including receipt and private draft.

This reduces round trips and transaction duration but is **not proven** to solve the measured serialization-exhaustion rate. No claim of PASS is made without rerunning identical workloads and critical-tail qualification. Avoid premature retry tuning: retain three attempts, existing backoff/deadlines and full fresh authorization/snapshot recovery while testing this proposal. Any change to those policies or operational limits requires a separately recorded review decision.

## Required tests before accepting the candidate

- Exact 2/50/500-leg decimal quantities, duplicate legs and maximum native/functional sums; CORRECT 500+500 legs and 1,000 distinct-account union.
- A test-only corrupted final row causes a real database constraint failure after prior rows have been processed; zero surviving journal/posting/receipt/audit, no reusable private draft. Label privileged/test faults honestly.
- Real two-user handlers, actual private restricted roles and all S05/S06A/B/C regressions, audit and immutable replay semantics unchanged.
- Cancellation before and during insertion, genuine serialization/deadlock whole retries, deferred-COMMIT rejection and ambiguous COMMIT recovery.
- Same benchmark matrix/source/role/schema conditions, preserved before/after artifacts, full failure denominator and qualified critical p99. Maximum-load safe rejection remains explicit FAIL for positive capacity.
- Full required pipeline, independent adversarial accounting/security review and current-head CI; no production activation from a performance result.

No migration is assumed for batching. If diagnosis instead requires an index or function change, propose an additive reviewed migration with original 001–007 checksums unchanged, fresh/upgrade/reference evidence and forward recovery. Never edit applied migration bytes, disable triggers, weaken grant checks or silently reduce the 500-leg protocol contract.

## Decisions needed

Review the capacity diagnosis and candidate bounded batching contract before changing the financial insertion path. An alternative is an explicitly reviewed narrower operational concurrency envelope, while retaining protocol maximum correctness/stress; do not silently redefine the already proposed four-way budget. Hosted profiling remains separately unauthorized and is not substituted by local results. This proposal approves neither implementation results nor deployment.
