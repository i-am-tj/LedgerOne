# P1-S07 — Opening and archived-account corrections

## Delivery scope

Branch `feat/p1-s07-account-corrections`, based on merged main `20c195a4962bf27a32df550d592907d0f069d422` (S09 PR45). Story [#12](https://github.com/i-am-tj/ledger-one/issues/12) remains open pending owner independent review and manual merge. No self-approval or merge is authorized.

The owner approved opening corrections and expense/income corrections only, retaining original accounts and classification. Transfers, card settlements, FD and loan corrections are unavailable pending their own correction-specific principal rules. Reconciliation remains an immutable audited comparison, without adjustment journals.

## Accounting and authorization contract

- Typed `CORRECT_OPENING` and `CORRECT_ACCOUNT_ENTRY` commands accept an exact amount, exact current target, independent reversal/replacement effective instants and mandatory reason. Actor and workspace authorization are server-derived. Browser payloads cannot supply posting legs, owner or an archive bypass.
- The existing executor retains SERIALIZABLE isolation, workspace/account/target lock order, three attempts, one ten-second deadline, atomic receipt/journal/audit and uncertain-COMMIT recovery. No second runner or retry loop.
- Nonzero replacement uses CORRECT. Zero uses exact REVERSE without fictitious zero postings. A later nonzero correction of that registered zero uses a narrowly bound POST continuation. Opening provenance remains linked through that continuation and unavailable to generic correction commands.
- Original opening marker and all original journals/captures remain immutable. Signed asset/debt openings retain debit/credit-normal conventions. Expense/income corrections retain both original accounts and category. History keeps the original business event; totals derive from posted legs rather than business captures.
- Archived accounts are never restored or temporarily unarchived. Only a registered, scoped correction can admit its exact original accounts. Normal new operations remain denied. Lifecycle races share workspace/account locks.
- Same-key replay validates immutable command evidence before current account eligibility. Changed payload and reused metadata-command keys conflict. Stale/current-target and distinct-key zero-resumption contention cannot create duplicate corrections.

## Migration and permissions

Additive migration013 introduces immutable `account_correction` intent and deferred validation of scope, root, exact target/children, replacement amount, original accounts/classification and mandatory audit. Existing immediate revision/row guards and deferred journal families remain; only archived-account admission gains the scoped exception. Correction operations cannot acquire a second business capture, including later direct-SQL inserts. Functions are invoker-security with pinned schema search paths.

Migrations001–012 must remain byte-identical. Fresh and012-to013 upgrades are tested in public and ledgerone schemas. No persistent or hosted database has been migrated. Generated disposable local writers receive scoped test grants; the published runtime template adds SELECT only for correction-history reads. No published financial DML grant or native generic writer is enabled. Blocked queue/coalescing and separate receipt-audit experiments remain excluded.

## Acceptance and regression traceability

| Requirement                                                                      | Evidence                                                                                                                                                              |
| -------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Signed opening correction, one immutable marker, zero/resumption and as-of dates | account-corrections integration; original marker/journal snapshots; asset/debt fixed expected balances                                                                |
| Archived expense/income correction without metadata mutation                     | same suite in both schemas; original capture amount/name/category unchanged; archive timestamp retained                                                               |
| Wrong-owner/workspace, anonymous, origin/raw-field denial                        | real session-derived account handlers and full persisted-state comparisons                                                                                            |
| Same-key replay/conflict, namespace conflicts, stale target                      | handler integration; same/distinct-key contention; zero-resumption contention                                                                                         |
| Atomic receipt/posting/audit failure rollback                                    | four executor write-stage probes, full persisted snapshots; malformed direct SQL                                                                                      |
| Lifecycle concurrency and original target identity                               | archive/correction race, same/different correction keys, terminal zero race                                                                                           |
| Generic opening-provenance exclusion and duplicate-capture denial                | restored opening generic reversal rejection; direct-SQL correction capture alias rejection                                                                            |
| Responsive working UI and recovery                                               | account-corrections browser tests on desktop/mobile, actual local handlers/DB; persisted refresh, archived edits, lost acknowledgement and retained same-key recovery |
| Fresh/upgrade/checksum/drift/attestation and old regressions                     | standard complete pipeline and exact-head CI; results recorded below                                                                                                  |

## Observed development results (not final acceptance)

- Focused unit suite:13 passing; complete unit suite298 passing.
- Focused correction/upgrade suite:32 passing (both supported schemas).
- Focused desktop/mobile account/correction browser suite:8 passing before the final read-context refinements; complete pipeline will verify final source.
- Retained failed development attempts: copied upgrade assertion expected11 historical migrations instead of12; corrected fixture assertion. Initial browser locator did not address a wrapped select label; changed to its actual accessible combobox name without weakening monetary/count assertions. Initial lint found unused correction metadata and an unused import; metadata is now returned in activity, import removed. No failing product invariant was relabeled as a fixture issue.
- Final full-pipeline and exact-head CI: PENDING. This document does not claim they ran or passed.

## Review and limitations

Implementation is author-produced, not independently approved. Owner will review the draft PR. #16 and #17 were closed after original acceptance-criteria verification using merged evidence and the owner's confirmed independent gap review; evidence comments preserve scope. #12 remains open. Phase1/P1-E3 advancement remains unapproved; hosted verification NOT RUN; default/production/generic financial writes disabled. Docker follow-up #34, historical capacity failures and the bounded dependency deferral remain unchanged. No unrelated capacity campaign is needed for this bounded two-leg correction slice.
