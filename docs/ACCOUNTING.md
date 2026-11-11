# Accounting contract proposal

Status: awaiting accounting/security review; examples are illustrative INR-valued journals, not implemented behavior.

## Ledger conventions

Debits increase assets and expenses. Credits increase liabilities, equity and income. Account balance is debit minus credit; show liabilities/equity/income as credit-normal magnitudes in their domain views. Net worth is asset carrying value minus liability carrying value. A positive user-entered expense amount is transformed into appropriate debit/credit legs; negative UI amounts are not an implicit reversal.

Each journal belongs to one workspace and has one functional currency (proposed INR). Its positive functional-unit debits equal its positive functional-unit credits exactly. Every posting has exactly one nonzero side. All accounts belong to that workspace, are valid for posting and have a fixed account currency. Monetary accounts carry original-currency units; functional values accompany them. Within a monetary account native quantities move according to its debit/credit convention. Nonmonetary investment quantities belong to an instrument subledger. Native amounts of different currencies are never summed.

Currency scale is defined per currency (e.g. INR/EUR 2, JPY 0, KWD 3); support must be explicit, not assumed for every code. Use integer minor units and fixed precision rates, never binary floats. Rate quotation is functional currency per one original currency unit; 1 EUR = 90 INR is stored as 90. Original amount, rate, effective date, source and fee are retained. Half-even rounding converts to functional minor units; a separately identified rounding account balances residuals within a reviewed cap (proposed 1 functional minor unit per converted leg). Larger unexplained residuals fail posting. Rounding is never a substitute for a missing fee or FX difference.

## Worked journals

All table amounts are rupees unless a native quantity is shown. Each journal balances independently. Opening balances pre-exist where relevant; examples do not imply overdraft permission.

| Event                        | Debit                                                       | Credit                                   | Interpretation                                                     |
| ---------------------------- | ----------------------------------------------------------- | ---------------------------------------- | ------------------------------------------------------------------ |
| Cash lunch ₹250              | Food expense 250                                            | Cash asset 250                           | Consumption and cash outflow 250                                   |
| Card purchase ₹1,200         | Groceries expense 1,200                                     | Card liability 1,200                     | Consumption now; debt increases                                    |
| Card settlement ₹1,200       | Card liability 1,200                                        | Bank asset 1,200                         | Debt and cash reduce; no new consumption                           |
| Bank A to Bank B ₹5,000      | Bank B asset 5,000                                          | Bank A asset 5,000                       | Internal transfer; net worth unchanged                             |
| Open FD ₹10,000              | FD asset 10,000                                             | Bank asset 10,000                        | Asset exchange; no expense                                         |
| FD interest accrued ₹500     | Interest receivable asset 500                               | Interest income 500                      | Investment return, distinct from work income                       |
| FD matures ₹10,500           | Bank asset 10,500                                           | FD asset 10,000; interest receivable 500 | Settlement of already accrued interest                             |
| Loan disbursement ₹100,000   | Bank asset 100,000                                          | Loan liability 100,000                   | No income; assets and debt increase                                |
| Loan payment ₹5,700          | Loan liability 5,000; interest expense 600; fee expense 100 | Bank asset 5,700                         | Only 700 is consumption                                            |
| Split card purchase ₹1,500   | Groceries expense 1,000; household expense 500              | Card liability 1,500                     | One parent, two consumption lines                                  |
| INR to EUR transfer with fee | EUR bank asset 9,000 (EUR 100 at 90); FX fee expense 100    | INR bank asset 9,100                     | Native amounts retained; fee is consumption                        |
| Salary ₹50,000               | Bank asset 50,000                                           | Employment income 50,000                 | Income, distinct from loan proceeds                                |
| Investment purchase plus fee | Investment asset 10,100                                     | Bank asset 10,100                        | Proposed capitalized fee 100, asset cost 10,100; approval required |
| Opening bank ₹20,000         | Bank asset 20,000                                           | Opening equity 20,000                    | Opening balance, not income                                        |
| Opening card debt ₹2,000     | Opening equity 2,000                                        | Card liability 2,000                     | Opening debt, not current spending                                 |

FX disposal example: USD 100 has carrying value INR 8,000, later exchanged for INR 9,000. Debit INR bank 9,000; credit USD bank 8,000 (native USD 100 removed); credit realized FX gain 1,000. The execution quote is 90 INR/USD while removed carrying value is 80 INR/USD: store both, do not relabel carrying value as the execution rate. A loss is an expense debit. For partial disposals, proposed weighted-average carrying cost per monetary account must be locked and applied atomically; negative foreign balances and short positions are initially rejected. Revaluation at period end is explicit: debit foreign asset / credit unrealized FX gain (or opposite for loss), native quantity zero with a valuation-only posting subtype. This subtype must be constrained to authorized revaluation journals. Later disposal removes updated carrying value so gains are not counted twice. Monetary liability revaluation uses the opposite economic direction.

## Transactions and classifications

The journal is the accounting source of truth. Purchase/transaction records hold user context, not a second balance ledger. Parent merchant, timestamp, funding account and receipt are shared. Split lines carry expense/income classification, purpose and beneficiary; their amounts must exactly equal the parent amount per currency. Complex multiple funding sources are deferred and must not be simulated with inconsistent parents. Posting links identify expense leaves, not an additional expense at parent level.

Effective split tags = distinct union of parent tags and split-local tags. No implicit tag suppression. Parent tag queries match all splits; split-local tags match only that split. Aggregates count each matched split once even when multiple tags match. Tag group totals can overlap: mark them non-additive; never imply they sum to a grand total. Merchants do not force a category. Archive referenced masters, retain historical names/context or revisions.

## Posting lifecycle and controls

Draft → posted is atomic. Drafts never affect reports. Posted monetary fields and context snapshots are immutable. Correction creates an exact opposite journal linked to the original, then an optional replacement, in one operation. Only one full reversal is allowed; later corrections follow the chain. Refunds are separate linked business events, allow partial amounts up to the unrefunded original amount, and preserve category treatment. Refund and reversal allocations must be locked against races. Closed/reconciled periods require an explicit adjustment workflow, never silent restatement. Backdated open-period entries invalidate relevant summaries.

Reconciliation compares native statement balances with posted native quantities; functional carrying values are reported separately. Differences require an explicit classified adjustment and audit reason. Opening balances post against opening equity with an effective date and provenance. No arbitrary overwrite of account balances. An archived account accepts neither new normal postings nor deletion; controlled reversal/reconciliation behavior must be specified in S014.

Budgets use classified consumption in the budget period, including card purchases, less refunds; no transfer expense. Goals allocate available assets logically; allocation neither changes assets nor net worth and cannot exceed the reviewed available-asset rule. Cash-flow reports define their account perimeter; FD placement may be a cash outflow from that perimeter while still not being consumption. Investments separate contributed capital, cost, realized return and unrealized revaluation. Loans separate principal, interest and fees. Tax treatment and local financial reporting standards are outside this personal-management contract.

## Approval boundaries

INR functional currency is fixed after the first posted journal; changing it requires a future migration policy. Manual rates only initially. Historical flows retain locked values; current net worth can use a dated valuation layer with visible missing/stale rates. Weighted-average monetary FX carrying cost, half-even rounding cap, investment fee capitalization/cost-lot convention, opening equity, refund-period behavior and revaluation treatment require explicit accounting review before their implementation. See DECISIONS_NEEDED.md.

## Core approval checkpoint — 2026-11-11

The user approved INR as fixed functional currency, retained original foreign-currency quantities, the normal debit/credit signs above, and linked-reversal corrections for posted journals. Approval is policy evidence, not implementation. Detailed FX rounding/carrying-cost and investment choices remain pending their explicit review; S04 introduces no financial schema or postings.
