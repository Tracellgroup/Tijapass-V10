# TijaPass V10 web MVP · release notes

Built from the *TijaPass V10 Developer Specification* (tabs 1 and 2). V10 is a new code base in the V9 look (navy #071B3D, orange #F86C12, card layout); V9's repository, site and data are untouched. Each line gives the requirement ID and where it lives.

## Biggest changes from V9

- **Real sign-in per user type** instead of V9's role drop-down and business/FI/supplier pickers. Every screen checks access, not just the menu.
- **One Record screen**, description first, read by AI (or built-in rules) and confirmed in plain words; V9's Business Transactions form and `window.confirm` pop-ups are gone.
- **Entries post at once**; only serious conflicts wait for Data Admin. All posted entries count for credit.
- **Daily close** with counting of all money, per-channel differences, guided reasons, catch-up and the tester clock. New.
- **TijaPass Records Rating**: monthly officer checklist, five checks, bands, badges, disputes and re-checks, linked to credit. New.
- **Clean start**: no seeded businesses; test accounts only. Storage key `tijapass-v10`.
- **New prices, FI packages and sponsorship**; V9 FI fees removed.
- **BOT dashboard** with ten KPIs and three extra tiles, privacy by minimum group size. New.
- **Kiswahili and English everywhere**, switchable at any time; all text in `docs/translations.csv`.

## Requirement map

### Users, access and admin

| ID | Implemented in |
|---|---|
| ROLE-01 | `src/screens/SignIn.jsx`: business phone + PIN, lenders/suppliers by email, test accounts tab (web MVP only); no role switcher anywhere |
| ROLE-02 | `src/lib/access.js` `businessesInScope`: officers see assigned businesses, FIs only consenting ones, suppliers and report users none; supplier screens show only their own requests, quotes, orders |
| ROLE-03 | `src/App.jsx` route table: each screen lists allowed user types; any other address returns to the user's home. Business data reads are re-checked inside screens (`canSeeBusiness`) |
| ROLE-04 | Texts use TijaPass and Business / Mjasiriamali; footer names Tracell Finance Limited as operator |
| ROLE-05 | `src/lib/actions.js` `audit()`: who, when, before, after, reason; every Admin change asks for a reason (`ReasonModal`); corrections are reversals |
| ADM-01 | Four tiers with menus in `src/ui/menus.js`; officers limited to assigned businesses |
| ADM-02 | Approval queue `src/screens/admin/DataAdmin.jsx`: held entries with AI recommendation, starting positions, profile changes, corrections and stock updates from ratings, declared loans, new lenders and suppliers, businesses without an officer, rating disputes |
| ADM-03 | Settings screen: tolerance, flag level, duplicate window, dispute window, rating frequency per band, minimum group size, score weights, support contacts and more |
| ADM-04 | Input fields screen: optional onboarding fields (text, number, choice; required or not) |
| ADM-05 | Assign officer from My businesses or the approval queue, with history |

### Menus and homes

| ID | Implemented in |
|---|---|
| MENU-01 | `src/ui/menus.js`, exactly as specified; alerts behind the bell. Super user has the System Admin menu plus the KPI dashboard |
| HOME-01 | Business home: Record money in / out first, today's totals, close status, Records Rating badge, passport score, last sign-in, new messages, to-dos |
| HOME-02 | FI dashboard: consenting businesses, requests by status, portfolio, due and overdue, assessments this month; each tile opens its list |
| HOME-03 | Supplier dashboard: open requests, quotes awaiting reply, orders to deliver, payments due |
| HOME-04 | Officer/Admin home (My businesses): businesses in scope, closed today, flagged differences, checks due this week, pending approvals, open queries |

### Onboarding and profile

| ID | Implemented in |
|---|---|
| ONB-01 to ONB-03 | `src/screens/Onboard.jsx` five-step wizard: owner (photo, NIDA and ID photo, DOB, gender, phones, email, address), business (type, sector, region, months, staff, GPS + address, closing time, custom fields), money channels (cash, each wallet, each bank) |
| ONB-04, ONB-05 | Self sign-up leaves the officer empty and alerts Data Admin; officers onboard in the field and the business can sign in at once |
| ONB-06 | Baseline questions asked once, stored on the business, never editable; feed KPIs 2, 4, 7 |
| ONB-07, ONB-08 | Starting position in plain words, equity calculated; submitted by business or officer, approved by Data Admin, then locked (only Admin edits, with a reason) |
| ONB-09 | Phone, second phone, email, address and location changes go to the approval queue; identity fields are Admin-only |
| ONB-10 | Consent with scope and time; per-FI consent and withdrawal in Profile; FI access stops at once |

### Recording

| ID | Implemented in |
|---|---|
| REC-01 | Only the Record screen (and the close/catch-up quick-add that uses the same form) creates entries |
| REC-02 | Field order: in/out/move, amount, channel, date, description (typed or voice); payer, reference and receipt photo optional |
| REC-03 | `src/lib/ai.js` → Netlify Function `ai` (task `read_entry`); fallback `src/core/reader.js` reads Kiswahili/English number words, slang and channels |
| REC-04 | Reading card: plain sentence + amount + "Correct?", Yes, up to three alternatives, or write again; no account names on business screens |
| REC-05 | After two failed tries the ready phrases appear (also available at any time via "Choose from a list") |
| REC-06 | Designed check screen (amount, in/out, where, date, who, meaning) with Edit / Save; no browser pop-ups anywhere |
| REC-07, REC-08 | `src/core/posting.js`: duplicate only with same payer and reference or same payer within the window; holds for direction conflict, unusual amount, overdraw, with plain reasons to the business and the AI recommendation to Admin |
| REC-09, REC-10 | Drawings, capital, group savings (payout surplus → other income), group loans, transfers: `src/core/kinds.js`, `accounting.js` |
| REC-11 | Catch-up screen, one missed day at a time, oldest first |

### Statement upload

| ID | Implemented in |
|---|---|
| IMP-01 | PDF (with password), CSV and Excel (.xlsx) in `Record.jsx` → `src/lib/pdf.js` (PDF.js), `xlsxReader.js`; AI task `read_statement` when available, otherwise text rules |
| IMP-02, IMP-03 | `checkStatement`: name match, layout, running balances, date range, matched lines; shown as a reliability list that never claims the file is genuine; another name blocks saving |
| IMP-04 | Unclear lines go to My activity → "Statement lines to explain"; the rest post as normal entries (no automatic hold). Lines dated before the business joined are skipped |
| IMP-05 | Original file kept (IndexedDB) and linked from every entry it produced; Admin opens it from the journal |

### Daily close

| ID | Implemented in |
|---|---|
| DAY-01 | Alert and home banner at each business's closing time; "Close my day" always available |
| DAY-02 to DAY-05 | `src/screens/business/Close.jsx`: summary and "Anything missing?", count of all money with book figures hidden, per-channel comparison, tolerance from Settings |
| DAY-06, DAY-07 | Guided reasons create their entries; remainder posts to cash difference; large or repeated differences flagged to the officer |
| DAY-08 | 09:00 reminder; Record blocked while earlier days are open; catch-up then one count covering the gap |
| DAY-09 | On time = closed the same day or before 09:00 next morning; feeds timeliness and "days closed" on the passport |

### Records Rating

| ID | Implemented in |
|---|---|
| RAT-01 | Name "TijaPass Records Rating" / "Kiwango cha Kumbukumbu cha TijaPass" (translator to confirm) |
| RAT-02 | `dueList`, `nextDue`: first check about 30 days after joining, then per band frequency (Settings) |
| RAT-03, RAT-08 | `src/core/rating.js` scoring table; each check rounded to whole points so the total equals the sum |
| RAT-04 to RAT-07 | `src/screens/admin/RatingCheck.jsx`: one check per screen with required photos and answers, GPS and time stamp, distance flag, app-picked sample, no editing; wrong entries become correction requests and stock differences become stock update requests |
| RAT-09 | `RatingBadge`: colour + band name + date everywhere (home, profile, passport, FI directory and file, officer and admin lists) |
| RAT-10 | Business rating screen: breakdown, tips, acknowledge, dispute within the window; "under review" until Data Admin decides |
| RAT-11 | Random re-check share (Settings), re-check score and gap flag beside the original |
| RAT-12 | Business: all; FI with consent: band, score, date, checks, six months; Admin: all plus evidence; Reports: band shares only |
| RAT-13, RAT-14 | Credit gate and score factor; monthly trend chart |

### Accounting and reports

| ID | Implemented in |
|---|---|
| ACC-01 to ACC-04 | `src/core/accounting.js`, `kinds.js` (see `docs/ACCOUNTING_MAP.md`); entries store their source (typed, voice, ready phrase, upload, close, Admin, loan) and approver |
| REP-01 to REP-03 | Business Reports: income statement, balance sheet, direct cash flow, date presets and custom range, PDF via the browser's print to PDF in the chosen language; My activity |
| REP-04 | Data Admin ledger screen: journal (source filter), ledger by account, trial balance, reverse, change treatment, stock adjustment |

### Credit, finance, suppliers, FI workspace

| ID | Implemented in |
|---|---|
| CRD-01 to CRD-07 | `src/core/credit.js`: all posted entries count; rating factor with weights from Settings; gates incl. rating; affordability with external loans; instalment limits; passport; "indicative" labels |
| FIN-01 to FIN-06 | Loan types (asset needs an accepted supplier quote), external-loan declaration (Admin edits with history), three-month questions, offers with full cost, checks at request/offer/disbursement, tracker, asset finance paid to the supplier with delivery confirmation |
| SUP-01 to SUP-04 | Quote requests from businesses and FIs, supplier product list, quote → invoice → payment → delivery → receipt, supplier self-registration with approval |
| FIW-01 to FIW-06 | FI self-registration with approval, consent-only directory with filters, business file (passport, rating history, statements, cash movement, loans, messages), products, assessment logging and billing, no accounting screens |
| WAL-01 | Wallet screens labelled "Simulated wallet" |
| PKG-01 to PKG-06 | Per-user packages, new prices, FI packages with 10% annual discount, sponsorship tiers and limits (1 VIP, 2 Partners), simulated payments (failure and repeat-safe), no V9 FI fees |

### Help, alerts, BOT, language

| ID | Implemented in |
|---|---|
| HLP-01 to HLP-04 | Guide per user type with screenshots (`public/guide/en.json`, `sw.json`), searchable FAQ by topic, chat (AI or FAQ) that becomes an Admin query with the chat attached, WhatsApp and phone from Settings |
| NOT-01, NOT-02 | Bell alerts for close, 09:00 reminder, holds, decisions, ratings, offers, repayments, quotes, answers; officers' weekly list of checks due |
| MSG-01 | Threads tied to a loan, quote, business file or Admin conversation |
| BOT-01 to BOT-08 | `src/core/kpi.js`, `src/screens/reports/Kpi.jsx`: aggregated only, minimum group size, priority KPIs first, KPI 2 as two shares, KPI 4 requests vs approvals, three extra tiles, definitions, filters, CSV and PDF export; more Reports users can be added in Users and roles |
| UX-01 to UX-06 | Kiswahili/English toggle on every screen; V9 brand; plain words on business screens; 320 px layouts and voice input; one "Test version" marker; band names with colours |

## Web MVP simulations (tab 2)

Sign-in with test accounts; AI through a Netlify Function with labelled rules fallback; tester clock; officer checklist with camera/upload photos and browser location; simulated payments and wallets; messages, queries and approvals stored in the browser; BOT dashboard from browser data with an adjustable minimum group size.
