# P1-S06B — Detailed POST command delivery plan

**Status: planned only; no command implementation or financial write enablement.** Prepared after S06A merged. This expands [story P1-S06B](P1-S06B.md), [issue #9](https://github.com/i-am-tj/LedgerOne/issues/9), under [epic P1-E3B / #4](https://github.com/i-am-tj/LedgerOne/issues/4). Phase is milestone #1; task packages below are checkboxes within this one implementation story, not separate partially exposed APIs. Implementation PR: **not opened**. The separate documentation PR is planning evidence only.

**Predecessor:** reviewed [PR #18](https://github.com/i-am-tj/LedgerOne/pull/18), head `423c6bd148ce86048ea3c3fa8e1510c45a72fb4c`, merged as `df56d4647169f289ac22aef8338f5f8fd8dc964a`. [Decision and exact-head CI](https://github.com/i-am-tj/LedgerOne/pull/18#issuecomment-6801618802): APPROVED for S06A only; 89 unit / 76 integration / 46 browser PASS in both remote runs. S06A-R01 #19 resolved; A05 issues #13–#17 remain open. This is not production readiness.

## Story contract

**ID:** P1-S06B | **Title:** Authenticated POST with canonical replay and atomic audit | **Epic:** P1-E3B | **Priority:** P0 | **Dependencies:** reviewed S06A merge, existing trusted session policy/ownership services, exact-money parser, scoped schema/audit controls, reviewed disposable test writer profile.

**User story:** As an allowlisted owner, I want one authorized balanced journal and one immutable financial audit per logical command, including concurrent retries and uncertain responses.

**Inputs (data/API/preconditions):** Proposed `POST /api/workspaces/{workspaceId}/ledger/commands`, JSON with kind POST, valid idempotency header, verified server session and exact trusted origin. Workspace comes from a validated route, owner from session; neither is accepted from JSON. Schema readiness 7 and the appropriate trusted local test attestation profile must match. Published financial runtime permissions remain SELECT-only throughout this story; the new route is unavailable by default. Production preflight/exposure remains S06D.

**Outputs (UI/API/schema/docs):** Server-only validator/canonicalizer, authenticated HTTP boundary, private atomic POST orchestrator, replay lookup, bounded full-transaction retry, financial DTO/error mapping, tests and updated story/gate evidence. Minimal API vertical slice; transaction capture UI/templates are S08/Phase 2. No new migration expected; any necessary change requires an additive reviewed migration, never edits to 001–007.

### Planned payload and result

The following defaults are explicit implementation/review contracts, not descriptions of existing endpoints:

| Field                  | Validation / canonical meaning                                                                                                                                                                                                                   |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| HTTP body              | application/json; bounded streaming read, at most 128 KiB regardless of Content-Length; reject invalid UTF-8/JSON, array/null root and unknown keys                                                                                              |
| Idempotency-Key header | one key matching existing SQL `^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$`; no default generated for caller, no silent truncation                                                                                                                       |
| kind                   | literal POST; no OPENING/REVERSE/CORRECT or saved-draft confirmation                                                                                                                                                                             |
| effectiveAt            | valid offset-bearing RFC3339 instant, year 0001–9999, at most millisecond precision matching timestamptz(3); reject invalid calendar dates, leap seconds, missing offset and silent precision truncation; canonical UTC instant                  |
| description            | optional, default empty; trim ends and normalize Unicode NFC before both hashing and persistence; at most 500 characters, reject NUL; preserve internal text/whitespace                                                                          |
| reason                 | required nonblank after the same normalization, at most 500 characters, reject NUL; persisted in audit and included in hash                                                                                                                      |
| legs                   | 2–500 strict objects `{accountId, side, currency, amount}`; UUID normalized to lowercase; side DEBIT or CREDIT; currency literal INR; amount decimal string parsed by existing exact parser, positive and at most `MAX_MINOR=999999999999999999` |
| Derived values         | nativeMinor=functionalMinor from exact parsed INR quantity; no supplied functional amount/rate/FX fields; bigint sums must balance before SQL and again at database COMMIT                                                                       |
| Rejected internals     | ownerId, actorId, workspaceId, requestId, journal/operation/posting IDs, requestHash, postedAt, status, kind overrides, revision, draftId, audit context and every unknown key                                                                   |
| Result                 | operationId, journalId, original postedAt, canonical effectiveAt and bounded posting DTO with bigint quantities as decimal strings; one documented response shape for fresh/replayed success; no raw ORM row or unscoped audit data              |

Successful fresh submission returns 201; same-key replay returns 200 with the same persisted financial result. A new request ID belongs only in `X-Request-ID`, not in the canonical financial result. Responses use no-store. Map invalid payload/media/body to 400 `invalid_request`, missing/expired/revoked session to 401 `unauthorized`, origin failure to 403 `forbidden`, invalid/foreign resource IDs to 404 `not_found`, hash conflict to 409 `idempotency_conflict`, owned archived/incompatible account to 409 `account_unavailable`, and disabled/failed-attestation/retry-exhausted/ambiguous outcomes to 503 `service_unavailable`. Other methods return 405. No exception/SQL details or foreign existence hints in response or operational logs; trace only fixed command name/status/duration/request ID.

Same-origin policy must match the configured canonical origin, deny cross-site mutations, and use the existing session resolver to enforce expiry/revocation/current verified allowlist. Reauthorize every request, including replay; an old receipt is not an authentication credential. No user identity from body/query/headers or caller-supplied Actor object may reach the public command boundary.

### Canonical hash protocol v1

Use SHA-256 over UTF-8 bytes of a fixed-order JSON tuple:

`["ledgerone.command.v1", "POST", trustedOwnerId, workspaceId, effectiveAtUtc, normalizedDescription, normalizedReason, sortedLegTuples]`

Each leg tuple is `[accountId, side, "INR", minorUnitsString]`, sorted lexicographically with an explicit deterministic comparator. Preserve repeated tuples and their multiplicity. Object property order, equivalent valid amount spelling (`1`, `1.0`, `1.00`), offset representations of the same millisecond instant and input leg order must not change the hash. Any persisted semantic change, including reason, scope, duplicate multiplicity, side, amount or account, must change it. Never hash floating point or serialize bigint as Number. Persist the normalized values that were hashed.

Exclude idempotency key, generated IDs/timestamps/request IDs and secrets from the semantic hash. Scope the unique key by trusted owner + workspace as the existing schema does. Bind protocol version to durable replay interpretation: retain v1 verification for receipts created under v1; a future protocol change needs an explicit version/migration strategy. Do not silently compare an old receipt against a changed algorithm.

## Ordered implementation tasks

All tasks remain unchecked. Deliver as one reviewed POST vertical slice in its own PR, with the route unavailable outside guarded test activation. No other implementation story starts while its required checks are red.

### B-T01 — Payload, exact amounts, canonical representation

- [ ] Implement strict bounded request and DTO schemas; validate route/header/media type/stream size and calendar/precision before SQL.
- [ ] Reuse exact-money parser; enforce positive INR amounts, 2–500 legs, bounded text and bigint balance equality.
- [ ] Implement versioned canonical tuple and digest; document golden vectors with no secrets.
- [ ] Unit tests: property order, offsets, amount spelling, leg permutation, duplicate preservation, owner/workspace/reason changes, unsafe Number inputs, MAX_MINOR boundary, malformed Unicode/calendar/UUID, oversized body and unknown/internal fields.

### B-T02 — Authenticated private atomic POST and mandatory audit

- [ ] Actual App Router handler resolves the existing verified session and generates request ID; enforce origin/CSRF policy and no query parameters. No financial public export accepts an arbitrary owner as authorization.
- [ ] In a SERIALIZABLE transaction, authorize/lock the owned workspace before scoped receipt lookup; authorize every distinct account and lock in ascending normalized UUID order, then recheck archive/currency/classification constraints. No account ID may be resolved globally before checking scope.
- [ ] Insert operation receipt, private DRAFT journal, every posting, finalization and exactly one `ledger.posted` audit with server actor/request, matching operation/target and normalized reason. Return success only after COMMIT and deferred checks pass.
- [ ] Never persist or expose an editable draft token. Any submitted draft/revision field rejects before mutation, resolving A05-01 only for this excluded saved-draft contract.
- [ ] Test failure after each mutation boundary, audit insert and deferred COMMIT validation; compare journal/posting/receipt/audit counts and balances. SQL support alone is insufficient: drive the actual handler with real sessions and database role.

### B-T03 — Idempotent replay, conflicts and concurrent keys

- [ ] After authorization, existing same-scope key + equal v1 hash returns the original committed result with no new audit or timestamp; different hash or operation kind returns sanitized conflict.
- [ ] Let the database unique scope/key enforce contention; no check-then-insert guarantee. Handle only the named receipt-key conflict as replay contention, not every 23505 as a successful replay.
- [ ] After a unique/serialization loser rolls back, open a fresh authorized transaction/snapshot and read the winner; compare hash and exact original outcome. Never query in an aborted transaction or authorize based on matching key alone.
- [ ] Concurrent identical requests must yield one journal/receipt/audit and the same operation/result. Different payloads sharing a key yield one winner and conflict, with no losing rows.
- [ ] Reproduce lost HTTP response after successful COMMIT, then replay same key. Do not duplicate the journal or financial audit. No receipt deletion/expiry while its immutable outcome is retained.

### B-T04 — Locks, whole-transaction retry and error boundaries

- [ ] Stable lock sequence: owned workspace → scoped receipt/key contention → distinct account UUID order → private new journal/postings/audit. Document compatibility with later original-journal correction and account archive locks; no silent unarchive.
- [ ] Retry only full aborted transactions on PostgreSQL 40001/40P01, at most three total attempts, bounded jitter (base 25 ms/cap 200 ms), within a 10-second command budget. Reacquire connection, session-scope checks and locks each attempt; preserve semantic payload/key/hash, discard rolled-back generated IDs. Never retry only finalization or audit insertion.
- [ ] Apply transaction-local statement/lock timeouts bounded by remaining budget (proposed maxima 2,000/1,500 ms). Do not leak SET ROLE/search_path/timeout settings into pooled requests. Stop and release/destroy failed clients correctly.
- [ ] Retry exhaustion/lock timeout/cancellation/unavailable attestation map to sanitized unavailable; unexpected SQL errors remain private. Never report successful rollback after an ambiguous network loss during COMMIT: return unavailable with same-key replay guidance, preserving any server-committed result.
- [ ] Unit-test retry classification, budget/exhaustion and strict mapping. Integration must cause real 40001 and 40P01 at the command transaction using barriers and a competing connection; assert the command actually observed each SQLSTATE, retried completely and committed once. A mocked error alone or a deadlock where only the contender aborts is not evidence.

### B-T05 — Real-handler isolation, disabled exposure and reviewed evidence

- [ ] Two real allowlisted test users, separate workspaces and accounts; test forged body/header/query identity, mixed-owner legs, foreign workspace/receipt IDs, cross-scope replay, anonymous/expired/revoked/removed-allowlist sessions and origin bypass. Assert stable non-disclosing errors and zero losing financial effects.
- [ ] Temporary least-privilege writer and reviewed attestation baseline exist only inside guarded disposable local test DBs; test both privilege denial and service authorization. Keep published production financial grants SELECT-only. Authentication mocks or owner/superuser-only tests do not satisfy this requirement.
- [ ] Attestation failure/unknown version/connection failure prevents command execution in the guarded test activation path. Production exposure remains unavailable until S06D validates the deployed target/profile and the complete gate, even if S06B tests pass.
- [ ] Re-run every S05/S06A regression, format/lint/typecheck/build/unit/integration/schema/attestation and relevant browser checks. Attach exact commands, counts, role/profile and SHA; request accounting/security review of the final implementation head and merge only after its checks/review.

## Acceptance criteria and test traceability

| ID / Given–When–Then                                                                                                                                                         | Unit evidence                                            | Integration / security / concurrency evidence                                                                         |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| B-AC01: Given valid owned balanced POST, when handler commits, then one immutable journal/receipt/audit exists and result uses exact strings                                 | Validator, exact parser, DTO                             | Actual authenticated handler, non-owner test writer, balances and linked audit after COMMIT                           |
| B-AC02: Given semantically equivalent payload variants, when hashed, then v1 digests match; semantic changes conflict                                                        | Golden/property vectors including duplicate multiplicity | Same key/reordered payload replays; changed amount/side/account/reason/scope never reuses a result                    |
| B-AC03: Given simultaneous same-key calls, when complete, then one result commits; mismatched hashes yield conflict                                                          | Conflict mapping                                         | Real concurrent same/different-payload calls, winner/loser counts; unrelated unique violation never treated as replay |
| B-AC04: Given invalid identity/scope/session/origin/body, when real handler runs, then deny without financial effects or foreign existence disclosure                        | Strict boundary schemas                                  | Two users, real sessions/revocation, forged inputs, foreign accounts/receipts and restricted SQL role                 |
| B-AC05: Given failure at any mutation or deferred COMMIT, when transaction aborts, then no partial journal/postings/receipt/audit survive                                    | Error mapping                                            | Injected boundary failures and invalid deferred audit/imbalance, before/after all counts and balances                 |
| B-AC06: Given draftId/revision/internal state, when submitted, then reject; no mutable saved draft can be finalized                                                          | Unknown field rejection                                  | Actual stale-draft confirmation requests leave zero new financial rows (A05-01 scoped disposition)                    |
| B-AC07: Given actual 40001/40P01, when retry succeeds or exhausts, then bounded complete retry commits once or nothing                                                       | Retry bounds/jitter/budget classification                | Barrier-driven real abort, reacquired locks/snapshot, atomic audit and exhausted/cancelled cases                      |
| B-AC08: Given response/connection loss around COMMIT, when same key is replayed, then original committed result is returned exactly once or a new first commit occurs safely | Ambiguous outcome mapping                                | Lost response and ambiguous-commit replay; no automatic new key or duplicate audit                                    |
| B-AC09: Given disabled exposure or failed attestation, when handler invoked, then no financial mutation occurs                                                               | Gate/error boundary                                      | Actual target drift/unavailable baseline under test fixture, default production denial and unchanged published grants |

**Failure/edge cases:** Archive-vs-post race must recheck under lock; repeated legs count separately; huge aggregate uses bigint; unsupported FX/OPENING stays rejected; whitespace/Unicode normalized consistently; 500-leg/body boundary; backdated effective time differs from server postedAt; audit failure at COMMIT; exhausted/ambiguous network outcome; generic constraint errors cannot leak SQL or foreign IDs. No insufficient-funds policy, closed-period policy, category templates, saved drafts or FX support is inferred from this story.

**Rollback/migration notes:** Disable exposure and retain immutable committed receipts/journals/audits. Roll back application code only to a version that still interprets existing v1 receipts; never rewrite request hashes or blindly regenerate keys. No destructive migration; recovery from a required future additive migration is separately reviewed. Do not apply production DML grants in S06B.

**Definition of done:** All B-AC01–09 demonstrated with reproducible tests; existing regressions and required checks green at final implementation head; input/session/ownership controls and atomic audit enforced; fresh migration/checksum/recovery evidence if schema changes; final accounting/security review and reviewed merge. Planning, compilation, SQL tests, or this documentation PR do not complete S06B. Complete write gate W01–W15 remains closed pending S06C/D and explicit enablement approval.

**Finding/gate links:** A05-01 #13 → B-AC06; A05-05 #17 → B-AC04; A05-03 #15 → B-AC09 plus S06D hosted integration. W01–W04/W08/W09 are primary B evidence; W07/W10/W13 need actual handler/profile integration. A05-02 remains S06C exact authorized original; A05-04 remains S07 metadata lifecycle. S07 OPENING audit extension is separate and is not smuggled into POST.

**GitHub references:** Story [#9](https://github.com/i-am-tj/LedgerOne/issues/9), epic [#4](https://github.com/i-am-tj/LedgerOne/issues/4), umbrella [#7](https://github.com/i-am-tj/LedgerOne/issues/7), next correction story [#10](https://github.com/i-am-tj/LedgerOne/issues/10), write gate [#11](https://github.com/i-am-tj/LedgerOne/issues/11). Implementation PR: not opened; all implementation/test tasks NOT STARTED.
