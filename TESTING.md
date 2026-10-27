# Acceptance tests (web MVP)

This file mirrors **tab 4, Acceptance-test matrix**, of the *TijaPass V10 Master Functional Specification*. The web MVP passes when every test passes in both Kiswahili and English. The **Result** column is the developer's automated browser run (Chromium, 390 px and 320 px) on 27 October 2026, after the revisions agreed that day. TFL runs every test again on the deployed site. The language switch is the globe button in the top bar.

"Rule test" means the outcome is checked by the automated rule tests (`npm test`, 36 tests) rather than clicked through on screen.

## Before you start

1. Open the site in a fresh browser profile, or use **System Admin → Settings → Test tools → Reset all data**.
2. Use the **Test accounts** tab to sign in as each user. Business users sign in with phone number and a **6-digit PIN**.
3. Suggested hand-made test business, so the sample statements match: owner **Neema Juma Mushi**, business **Neema Mboga Shop**, phone **0712 345 678**, PIN **123456**, one M-Pesa wallet.
4. Ready-made data: **Super user → Test data → Load test data** loads 10 fictional businesses (TPDEMO-B01 to B10), the 100 sample transactions and 8 Records Ratings. Tick "Add 6 months of earlier activity" to test loan journeys. Business logins are `+2557000010xx` (B01 = `+255700001001`), PIN **246810**. **Remove test data** deletes all of it.
5. To fill one hand-made business with past activity: **System Admin → Settings → Test tools → Generate sample activity** (95 days).
6. **Tester clock** (clock button in the top bar): 17:00, next morning, several days ahead, end of month, or 46 days ahead.

Expected spread after loading test data with history: B01, B02, B03, B05 and B07 are automatically eligible for a loan; B04 and B06 (Okay) need the lender's recorded review; B08 (Poor) is blocked; B09 and B10 are not yet rated.

## Matrix

| ID | User | Action | Expected outcome | Requirements | Result |
|---|---|---|---|---|---|
| A1 | Each user type | Sign in with each test account | Exactly its own menu, in MENU-01 order | MENU-01, ROLE-01 | Passed |
| A2 | Supplier | Type a ledger, business, FI-business, activity or reports address | Sent back to the supplier dashboard | ROLE-02, ROLE-03 | Passed |
| A3 | Officer 2 | Open a business assigned to officer 1 | "This business is not assigned to you" | ROLE-03 | Passed |
| A4 | Tester | Open the app in a fresh browser | No businesses, entries, ratings or loans | Tab 2, Test data | Passed |
| A5 | Business | Register, then sign in | 6-digit PIN required; phone and PIN sign-in works | ROLE-01 | Passed |
| O1 | Officer, Data Admin | Officer enters opening balances; Data Admin approves with a reason | Locked; business sees a summary, no form; equity calculated | ONB-07, ONB-08 | Passed |
| O2 | Business, Data Admin | Change the main phone number | Old number works until Data Admin approves | ONB-09 | Passed |
| O3 | Data Admin | Correct an inclusion-baseline answer with a reason (Officer → business file → Inclusion baseline) | Original kept; correction shown beside it with who and why | ONB-06 | Passed (rule test) |
| R1 | Business | Type "nimeuza mboga elfu ishirini cash" with no payer | Plain reading of a TZS 20,000 cash sale; posts after the check screen | REC-02 to REC-04, REC-06 | Passed |
| R2 | Business | Record two TZS 20,000 sales minutes apart, no payer | Both post | REC-07 | Passed |
| R3 | Business | Give two unclear descriptions in a row | Ready phrases on the third attempt | REC-05 | Passed |
| R4 | Business | Type "nimechangia mchezo" | One group question; saved as group savings; profit unchanged | REC-09 | Passed |
| R5 | Business | Record a group payout received early, then a contribution | Excess over savings is owed to the group; the contribution repays it; no income | REC-09 | Passed (rule test) |
| R6 | Business, Data Admin | Money out TZS 999,000 from M-Pesa | Held with a plain reason; Data Admin declines with a reason | REC-08 | Passed |
| R7 | Business, Data Admin | Record a material uncertain entry (TZS 50,000 or more, by ready phrase or low AI confidence) | Posts at once; joins **Approval queue → Accountant review**; Data Admin confirms or changes the treatment with a reason | REC-12 | Passed (rule test) |
| S1 | Business | Upload `nmb-statement-other-name.pdf` | Flagged, grade D; nothing can be saved | IMP-02, IMP-03 | Passed |
| S2 | Business | Upload `mpesa-statement-neema-password-1234.pdf` (password 1234) | Asks for the password; checks listed; grade A; no claim the PDF is genuine | IMP-01 to IMP-03 | Passed |
| S3 | Business | Save that statement | The unclear line and the withdrawal go to "Statement lines to explain"; transfer suggested, never assumed | IMP-04 | Passed |
| S4 | Business | Upload the same statement again, then `mpesa-statement-neema.csv` | Lines matched as "Already recorded", never posted twice | IMP-02 | Passed |
| D1 | Business | Clock 17:00; count cash 15,000 above book; choose "A customer paid what they owed" 10,000 | Receipt of 10,000 created; 5,000 waits in suspense, not profit; small M-Pesa difference accepted | DAY-01 to DAY-07 | Passed |
| D2 | Business | Clock +3 days, then Record | Recording works with a warning banner; records-reconciled gate fails; Catch up now shows Day 1 of 2, Day 2 of 2, then one count | DAY-08, REC-11, CRD-03 | Passed |
| D3 | Data Admin | Approval queue → Cash differences to resolve → Resolve to sales with a reason | Suspense cleared and logged; reconciled gate passes | DAY-07 | Passed |
| D4 | Business, Data Admin | Open Reports; open Ledger, journal and trial balance | Business sees the three statements and My activity; trial balance balanced | ACC, REP | Passed |
| T1 | Business | Open Home as a new business | "Not yet checked" in grey | RAT-09 | Passed |
| T2 | Officer | Complete a monthly check | GPS and time stamped; each step needs its evidence; the app picks 10 entries, half of them higher-risk | RAT-04 to RAT-06 | Passed |
| T3 | Officer | Review the points | Total equals the sum; band follows the table (e.g. "Excellent, 94%", "Okay, 54%") | RAT-03, RAT-08 | Passed |
| T4 | Business, Data Admin | Acknowledge a rating, then dispute one | "Under review" until Data Admin decides | RAT-10 | Passed |
| T5 | Data Admin | Records Rating review → Re-checks | About 1 in 10 checks picked; with "Share of checks re-checked" set to 1, every check is picked | RAT-11 | Passed by design |
| T6 | Business | Clock +46 days | "Check overdue" | RAT-02, RAT-13 | Passed |
| T7 | Each user type | Search every screen | No "audit" or "true and fair" (the System Admin menu item "Audit trail" is kept from MENU-01) | RAT-01, UX-05 | Passed |
| C1 | FI | Offer a loan to a business rated Poor | Blocked | CRD-03, RAT-13 | Passed |
| C2 | FI | Offer a loan to a business rated Okay (54%) | Allowed only after ticking "I have reviewed this business's records myself" and writing a note | CRD-03, RAT-13 | Passed |
| C3 | FI | Offer a loan to test business B01 (Excellent, clean gates) | Automatically eligible | CRD-03 | Passed |
| C4 | Business, FI | Open the credit passport | Five criteria plus rating with their weights; "How reliable the records are" card; affordability shows profit, cash and the lower one used | CRD-01, CRD-02, CRD-04, CRD-06 | Passed |
| C5 | FI, Supplier | Disburse, take the first instalment, then an asset loan paid to a supplier | First-loan weights until an instalment falls due; asset paid to the supplier, delivery confirmed, equipment on the books | CRD-02, FIN, SUP | Passed |
| C6 | System Admin, FI | Packages and prices → Optional lender services: switch fees on, then off | Off (default): no fee anywhere. On: the FI bill lists each disbursement and collection | PKG-06 | Passed (rule test; "off" checked on screen) |
| P1 | Business | Fail a payment, pay, then repeat the confirmation | A failed payment unlocks nothing; no double charge | PKG-05 | Passed |
| P2 | Business, FI, Supplier | Open packages | Prices match (500 / 1,500 / 5,000 / 10,000; FI 500,000 / 2,000,000 / 6,000,000 a month); each sees only its own packages | PKG-01 to PKG-03 | Passed |
| B1 | Reports | Open the dashboard (minimum group 10) | Small groups hidden; no business name visible | BOT-01, RAT-12 | Passed |
| B2 | Reports | Filter to a small group | Hidden, including the complementary figure; export blocked below twice the minimum | BOT-01, BOT-07 | Passed |
| B3 | Reports | Export to CSV | Same suppression plus a privacy note; the export is logged | BOT-07 | Passed (rule test) |
| B4 | Reports | System Admin lowers the minimum group to 1 in Report design | Ten KPIs, priorities first, then three tiles | BOT-02, BOT-03, BOT-05 | Passed |
| H1 | Business, Data Admin | Ask the help chat, send it as a complaint; Data Admin replies | The query carries the chat; the business sees the reply | HLP | Passed |
| H2 | Each user type | Open Help → Guide | A screenshot for every menu item, in English and Kiswahili | HLP-01 | Passed |
| L1 | Business | Switch to Kiswahili on Home, Record, Close, Reports, Finance, Rating | No English left; no TFL, V8 or V9 labels | UX-01, UX-05 | Passed |
| L2 | Each user type | Open every menu item at 320 px wide | No sideways scrolling | UX-04 | Passed |
| X1 | Super user | Test data → Load (with history and closes) | 10 businesses, all 100 transactions with their references, 8 ratings; System Admin has no loader | Tab 2, Test data | Passed |
| X2 | Super user, FI, Reports | Check the loaded spread | B01 Excellent 94%; B08 Poor 42%; B09 not yet checked; FI directory lists them; Reports sees them only in aggregate | CRD-03, BOT-01 | Passed |
| X3 | Super user | Test data → Remove | Every test record deleted in one step and logged | Tab 2, Test data | Passed |

## Rule tests

`npm test` runs 36 tests: amount words, Kiswahili/English reading, posting and holds, opening equity, personal and group money (including early rotating payouts), cash flow, daily close, suspense and its resolution, catch-up, rating points, bands and risk-based sampling, overdue, the revised credit gates (automatic, lender review, blocked), first-loan versus repeat-borrower weights, evidence weighting, affordability, schedules, prices and sponsorship, optional FI fees, KPI privacy with complementary suppression, statement parsing, the test-data loader, the accountant review after posting, baseline corrections, and the main actions (decisions, offers, payments, assessments, consent, scope).
