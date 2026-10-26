# Acceptance tests (web MVP)

The web MVP passes when every test below passes in both Kiswahili and English (spec tab 2). The **Result** column records the developer's own automated browser run (Chromium, 390 px phone width) on 27 October 2026, before handing over to TFL. TFL runs the tests again; the language switch is the globe button in the top bar.

## Before you start

1. Open the site in a fresh browser profile (or **System Admin → Settings → Test tools → Reset all data**).
2. Use the **Test accounts** tab to sign in as each user. Business users sign in with phone number and PIN.
3. Suggested test business, so the sample statements match: owner **Neema Juma Mushi**, business **Neema Mboga Shop**, phone **0712 345 678**, PIN **1234**, one M-Pesa wallet.
4. To test ratings, scores and reports without waiting weeks: **System Admin → Settings → Test tools → Generate sample activity** for that business (95 days).
5. **Tester clock** (clock button in the top bar) jumps to 17:00, the next morning, several days ahead, the end of the month, or 46 days ahead.

## Access and set-up

| # | Test | How | Result |
|---|---|---|---|
| A1 | Sign in as each user type and admin tier; each sees exactly its menu (MENU-01) | Sign in with each test account and compare the side menu with MENU-01 | Passed: all seven menus match, in order |
| A2 | A Supplier cannot reach any business ledger by menu, link or typed address | As Supplier, type `#/ledger?id=…`, `#/business?id=…`, `#/fi-business?id=…`, `#/activity`, `#/reports` | Passed: each returns to the supplier dashboard |
| A3 | An Officer cannot open a business not assigned to them | Onboard with officer 1; sign in as officer 2 and open `#/business?id=…` | Passed: "This business is not assigned to you" |
| A4 | The app starts with no businesses, entries or ratings | Fresh browser | Passed |

## Recording and accounts

| # | Test | How | Result |
|---|---|---|---|
| R1 | Say or type "nimeuza mboga elfu ishirini cash" with no payer; the plain-language reading appears and posts on confirmation | Record → Money in → leave amount empty → type the sentence → Continue | Passed: "You sold goods and received the money, TZS 20,000. Correct?" → designed check screen → Recorded |
| R2 | Two TZS 20,000 sales minutes apart, no payer: both post | Record two more | Passed: all three posted |
| R3 | Two unclear descriptions in a row: the ready phrases appear | Money out, type "xyz abc", Continue, then "qwerty", Continue | Passed: "Choose what happened" list on the third attempt |
| R4 | A personal expense and a mchezo contribution leave profit unchanged and post to drawings and group savings | Ready phrase "I took money for home use"; type "nimechangia mchezo" | Passed (also unit-tested) |
| R5 | Money out larger than the channel holds is held for Data Admin with a plain-language reason | Money out 999,000 from M-Pesa | Passed: "More money goes out than this account holds"; Data Admin sees it with the AI recommendation and declines with a reason |
| R6 | Opening balances lock after Data Admin approval; equity is never typed | Officer enters starting position → Data Admin approves | Passed: business sees a locked summary, no form; owner's stake is calculated |
| R7 | A changed phone number waits for Admin approval | Business Profile → change phone → Data Admin approves | Passed: old number works until approval; sign-in uses the new number after |

## Daily close and statements

| # | Test | How | Result |
|---|---|---|---|
| D1 | Close the day with a count higher than book; "a customer paid" creates the receipt; the rest goes to cash difference | Clock → 17:00 → Close my day → count cash 15,000 above → choose "A customer paid what they owed" 10,000 | Passed: receipt 10,000 created, 5,000 posted as unexplained difference; small M-Pesa difference accepted within tolerance; book figures hidden until counted |
| D2 | Skip a day: the next day is blocked until catch-up and count are done | Clock → +3 days → Record | Passed: "First close your earlier days"; catch-up shows Day 1 of 2, Day 2 of 2, then one count |
| D3 | A PDF statement under another name is flagged; lines without descriptions go back to the business | Record → Upload a statement → `public/samples/nmb-statement-other-name.pdf`; then `mpesa-statement-neema.pdf` | Passed: other name flagged and nothing can be saved; the line "Payment" goes to My activity → "Statement lines to explain" |
| D4 | The business sees only the three statements and My activity, with date ranges; Data Admin sees journal and trial balance | Business → Reports; Data Admin → Ledger, journal and trial balance | Passed; trial balance balanced |

Also checked: password-protected PDF (`mpesa-statement-neema-password-1234.pdf`, password 1234) asks for the password and then reads; uploading the same statement again matches every line ("Already recorded"); CSV reads the same way.

## Records Rating

| # | Test | How | Result |
|---|---|---|---|
| T1 | A new business shows "Not yet checked" in grey | Any new business | Passed |
| T2 | Officer completes a check: GPS and time recorded; every step needs its evidence; the app picks the 10 recorded entries | Officer → Monthly records check → Start | Passed: Next stays disabled until each step has its photo and answers; 10 entries picked at random by the app |
| T3 | Points add up and the band and colour follow the table (e.g. 78 shows "Good, 78%") | Review step | Passed: e.g. "Excellent, 95%", "Okay, 66%"; each check is rounded to whole points so the total equals the sum |
| T4 | The business sees the breakdown and tips, acknowledges, and can dispute; a disputed rating shows "under review" | Business → Home → Records Rating → I have seen my rating / I disagree | Passed |
| T5 | One in ten checks is picked for re-check | Data Admin → Records Rating review → Re-checks | Passed by design: each check has a 1-in-10 random chance of being picked (setting "Share of checks re-checked"); picked checks list under Re-checks and the re-check score and gap show beside the original. Set the share to 1 in Settings to see it on every check |
| T6 | Moving the tester clock past 45 days shows "Check overdue" | Clock → +46 days | Passed: "Check overdue · last: Okay 66%" in grey |
| T7 | A business rated Poor cannot receive a loan offer; one rated Okay can | Dispute decided at 45 → FI offer blocked; new check at 66 → offer sent | Passed (also unit-tested) |
| T8 | The words "audit" and "true and fair" appear nowhere | Search screens | Passed for business, officer, FI, supplier and report screens. Note: the System Admin menu item is called "Audit trail" because MENU-01 names it so; rename to "Change history" if TFL prefers |

## Credit, money and reports

| # | Test | How | Result |
|---|---|---|---|
| C1 | The credit score uses self-posted entries and the latest rating | Finance → Credit passport; FI → business file → "How the score was worked out" | Passed |
| C2 | Prices match the decisions; each user sees only its own packages; no V9 FI fees anywhere | Business → Packages; FI → Packages and billing; Supplier has no packages | Passed: 500 / 1,500 / 5,000 / 10,000; FI 500,000 / 2,000,000 / 6,000,000 a month, annual 5,400,000 / 21,600,000 / 64,800,000, per assessment 3,000 / 1,500 / 500 |
| C3 | A failed simulated payment does not unlock a package | Packages → Choose → Simulate failed payment | Passed; a repeated success confirmation does not charge twice |
| C4 | The BOT dashboard shows the ten KPIs and three extra tiles, with filters; small groups hidden; no single business visible | Sign in as Reports | Passed: hidden below the minimum group size (5); with the minimum lowered to 1 in Report design, KPIs 2–5 first, then 1, 6–10, then cost of credit, complaints and data quality |

## Language and look

| # | Test | How | Result |
|---|---|---|---|
| L1 | No "TFL", "V8" or "V9" label on any screen | Search screens | Passed (the footer names Tracell Finance Limited as operator, as ROLE-04 allows) |
| L2 | Every flow works on a 320 px-wide phone screen | Browser dev tools at 320 px | Run at 390 px automatically; layouts collapse to one column, tables scroll sideways inside their card. TFL to confirm on a small Android phone |
| L3 | Kiswahili | Switch language on Home, Record, Close, Reports, Finance, Rating | Passed for the checked screens; all text pairs are in `docs/translations.csv` for the translator's review |

## Unit tests

`npm test` runs 27 tests: amount words, Kiswahili/English reading, posting and holds, opening equity, personal and group money, cash flow, daily close and catch-up, rating points and bands, sampling, overdue, the credit gate, schedules, prices and sponsorship, KPI privacy, statement parsing, and the main actions (close reasons, decisions, offers, payments, assessments, consent, scope).
