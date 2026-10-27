// Domain actions. Each takes a draft of the state (`d`), the acting user and arguments, and changes the draft.
// Every Admin change carries a reason and lands in the audit trail (ROLE-05).
import { balancesAt, channelBalances, channelBalance } from "../core/accounting.js";
import { assessmentFee, needsAssessment } from "../core/billing.js";
import { GATES, gates, isSupported, offerFits, schedule } from "../core/credit.js";
import { isOnTime, shouldFlag, tolerance } from "../core/dailyClose.js";
import { KINDS, SUSPENSE_TARGETS } from "../core/kinds.js";
import { evaluateEntry } from "../core/posting.js";
import { pickForRecheck } from "../core/rating.js";
import { addDays, dateRange, nowISO, seeded, today, uid } from "../core/util.js";

const by = (actor) => ({ id: actor?.id || "system", name: actor?.name || "System", role: actor?.role || "system" });

export function audit(d, actor, action, target, extra = {}) {
  d.audit.unshift({ id: uid("AU"), at: nowISO(d), actor: by(actor), action, target, ...extra });
  if (d.audit.length > 3000) d.audit.length = 3000;
}

// target: { userId } | { role } | { businessId } | { fiId } | { supplierId } | { officerOf: businessId }
export function notify(d, target, title, body, link = null) {
  let t = target;
  if (target.officerOf) {
    const b = d.businesses.find((x) => x.id === target.officerOf);
    t = b?.officerId ? { userId: b.officerId } : { role: "dataAdmin" };
  }
  d.notifications.unshift({ id: uid("N"), at: nowISO(d), ...t, title, body, link, readBy: [] });
  if (d.notifications.length > 2000) d.notifications.length = 2000;
}

const adminNotice = (d, title, body, link) => notify(d, { role: "dataAdmin" }, title, body, link);

// ---------------------------------------------------------------- Businesses
export function createBusiness(d, actor, { id, userId, profile, channels, baseline, closingTime, pin, officerId, lang }) {
  const startDate = today(d);
  d.businesses.push({
    id, status: "active", startDate, closingTime: closingTime || "17:00", createdAt: nowISO(d), createdBy: by(actor),
    officerId: officerId || null, profile, channels, baseline: { ...baseline, at: nowISO(d), original: { ...baseline }, corrections: [] }, opening: null,
    consent: { at: nowISO(d), scope: "records, statements, credit passport, Records Rating, officer visits with photos and location", fis: {} },
    lastSignIn: null, lang: lang || "sw", customFields: {}
  });
  d.users.push({ id: userId, role: "business", name: profile.ownerName, login: profile.phone, pin, businessId: id, active: true });
  audit(d, actor, "Business created", id, { after: { businessName: profile.businessName } });
  if (!officerId) adminNotice(d, { en: "New business needs an officer", sw: "Biashara mpya inahitaji afisa" }, { en: `${profile.businessName} signed up alone. Assign an officer.`, sw: `${profile.businessName} imejisajili yenyewe. Mpangie afisa.` }, "approvals");
}

export function assignOfficer(d, actor, businessId, officerId, reason) {
  const b = d.businesses.find((x) => x.id === businessId);
  const before = b.officerId;
  b.officerId = officerId;
  b.officerHistory = [...(b.officerHistory || []), { officerId, at: nowISO(d), by: by(actor), reason }];
  audit(d, actor, "Officer assigned", businessId, { before, after: officerId, reason });
  notify(d, { userId: officerId }, { en: "New business assigned to you", sw: "Umepangiwa biashara mpya" }, { en: b.profile.businessName, sw: b.profile.businessName }, "officer-businesses");
}

export function saveOpening(d, actor, businessId, values, submit) {
  const b = d.businesses.find((x) => x.id === businessId);
  if (b.opening?.status === "approved") throw new Error("Opening balances are locked.");
  b.opening = { status: submit ? "submitted" : "draft", date: b.startDate, values, by: by(actor), at: nowISO(d) };
  audit(d, actor, submit ? "Opening balances submitted" : "Opening balances saved", businessId);
  if (submit) adminNotice(d, { en: "Opening balances to approve", sw: "Salio la kuanzia la kuidhinisha" }, { en: b.profile.businessName, sw: b.profile.businessName }, "approvals");
}

export function decideOpening(d, actor, businessId, approve, reason) {
  const b = d.businesses.find((x) => x.id === businessId);
  b.opening.status = approve ? "approved" : "draft";
  b.opening.decidedBy = by(actor);
  b.opening.decidedAt = nowISO(d);
  b.opening.reason = reason;
  audit(d, actor, approve ? "Opening balances approved and locked" : "Opening balances returned", businessId, { reason });
  notify(d, { businessId }, approve ? { en: "Starting position approved", sw: "Hali ya kuanzia imeidhinishwa" } : { en: "Starting position needs changes", sw: "Hali ya kuanzia inahitaji marekebisho" }, { en: reason || "", sw: reason || "" }, "profile");
}

export function adminEditOpening(d, actor, businessId, values, reason) {
  const b = d.businesses.find((x) => x.id === businessId);
  const before = b.opening?.values;
  b.opening = { ...(b.opening || {}), status: "approved", date: b.opening?.date || b.startDate, values, editedBy: by(actor), editedAt: nowISO(d) };
  audit(d, actor, "Opening balances edited by Admin", businessId, { before, after: values, reason });
}

// ONB-09 / RAT-07 / officer recommendations: a change waits for Data Admin.
export function requestChange(d, actor, { id, businessId, type, fields, note, entryId }) {
  d.changeRequests.unshift({ id, businessId, type, fields, note, entryId, status: "pending", proposedBy: by(actor), at: nowISO(d) });
  adminNotice(d, { en: "Change waiting for approval", sw: "Mabadiliko yanasubiri idhini" }, { en: note || type, sw: note || type }, "approvals");
}

export function decideChange(d, actor, id, approve, reason) {
  const cr = d.changeRequests.find((x) => x.id === id);
  cr.status = approve ? "approved" : "declined";
  cr.decidedBy = by(actor);
  cr.decidedAt = nowISO(d);
  cr.reason = reason;
  const b = d.businesses.find((x) => x.id === cr.businessId);
  if (approve && cr.type === "stock" && b) {
    const bookStock = balancesAt(d, b.id, today(d)).inventory || 0;
    const delta = Math.round(Number(cr.fields.estimate) - bookStock);
    if (delta) stockAdjust(d, actor, b.id, delta, `Stock count by officer: ${reason}`);
  } else if (approve && cr.type === "profile" && b) {
    const before = {};
    for (const [k, v] of Object.entries(cr.fields || {})) {
      if (k === "closingTime") {
        before[k] = b.closingTime;
        b.closingTime = v;
        continue;
      }
      before[k] = b.profile[k];
      b.profile[k] = v;
      if (k === "phone") {
        const u = d.users.find((x) => x.businessId === b.id);
        if (u) u.login = v;
      }
    }
    audit(d, actor, "Profile change approved", cr.businessId, { before, after: cr.fields, reason });
  } else audit(d, actor, approve ? `Change approved (${cr.type})` : `Change declined (${cr.type})`, cr.businessId, { reason });
  notify(d, { businessId: cr.businessId }, approve ? { en: "Your change was approved", sw: "Mabadiliko yako yameidhinishwa" } : { en: "Your change was declined", sw: "Mabadiliko yako yamekataliwa" }, { en: reason || "", sw: reason || "" }, "profile");
}

export function setConsent(d, actor, businessId, fiId, granted) {
  const b = d.businesses.find((x) => x.id === businessId);
  b.consent.fis = b.consent.fis || {};
  b.consent.fis[fiId] = granted ? { granted: true, at: nowISO(d) } : { granted: false, withdrawnAt: nowISO(d) };
  audit(d, actor, granted ? "Consent given to FI" : "Consent withdrawn from FI", businessId, { after: fiId });
}

// ---------------------------------------------------------------- Entries
export function addEntry(d, actor, entry, { directionConflict = false, aiRecommendation = null } = {}) {
  const e = { status: "posted", createdAt: nowISO(d), createdBy: by(actor), ...entry };
  e.evidence = isSupported(e) ? "supported" : "declared";
  const ev = evaluateEntry(d, e, { directionConflict });
  if (ev.action === "hold") {
    e.status = "held";
    e.heldReasons = ev.reasons;
    e.aiRecommendation = aiRecommendation;
    adminNotice(d, { en: "Entry held for review", sw: "Muamala umesimamishwa kwa ukaguzi" }, { en: `${e.amount} · ${ev.reasons.join(", ")}`, sw: `${e.amount} · ${ev.reasons.join(", ")}` }, "approvals");
  } else {
    // Second stage (accountant review after posting): uncertain readings of material amounts are checked by
    // a TijaPass accountant without stopping the business (AI proposes, rules post, people review exceptions).
    const material = Number(e.amount) >= (d.settings.reviewFloor ?? 50000);
    const uncertain = (e.ai && (e.ai.confidence ?? 1) < 0.6) || e.source === "ready" || (e.ai?.suggested && e.ai.suggested !== e.kind);
    if (material && uncertain) {
      e.review = { status: "open", reason: e.source === "ready" ? "ready" : e.ai?.suggested && e.ai.suggested !== e.kind ? "override" : "confidence", aiRecommendation };
    }
  }
  d.entries.push(e);
  return ev;
}

export function reviewPosted(d, actor, entryId, decision, { kind, reason } = {}) {
  const e = d.entries.find((x) => x.id === entryId);
  if (decision === "change" && kind && kind !== e.kind) changeTreatment(d, actor, entryId, kind, reason);
  e.review = { ...(e.review || {}), status: decision === "change" ? "changed" : "confirmed", by: by(actor), at: nowISO(d), note: reason };
  if (decision !== "change") audit(d, actor, "Posted entry confirmed by accountant", entryId, { reason });
}

export function decideHeld(d, actor, entryId, decision, { kind, reason } = {}) {
  const e = d.entries.find((x) => x.id === entryId);
  const before = { status: e.status, kind: e.kind };
  if (decision === "decline") e.status = "declined";
  else {
    if (decision === "change" && kind) e.kind = kind;
    e.status = "posted";
  }
  e.decidedBy = by(actor);
  e.decisionReason = reason;
  audit(d, actor, `Held entry ${decision}`, entryId, { before, after: { status: e.status, kind: e.kind }, reason });
  notify(d, { businessId: e.businessId }, decision === "decline" ? { en: "An entry was declined", sw: "Muamala umekataliwa" } : { en: "An entry was approved", sw: "Muamala umeidhinishwa" }, { en: reason || "", sw: reason || "" }, "activity");
}

export function reverseEntry(d, actor, entryId, reason) {
  const e = d.entries.find((x) => x.id === entryId);
  if (!reason || reason.trim().length < 5) throw new Error("A reason is required.");
  const rev = { ...e, id: uid("E"), contra: true, reversalOf: e.id, source: "admin", createdAt: nowISO(d), createdBy: by(actor), description: `Reversal: ${e.description || ""}`, reason };
  d.entries.push(rev);
  e.reversedBy = rev.id;
  audit(d, actor, "Entry reversed", entryId, { reason });
  return rev.id;
}

export function changeTreatment(d, actor, entryId, newKind, reason) {
  const e = d.entries.find((x) => x.id === entryId);
  reverseEntry(d, actor, entryId, reason);
  const fresh = { ...e, id: uid("E"), kind: newKind, reversedBy: undefined, review: undefined, createdAt: nowISO(d), createdBy: by(actor), source: e.source, correctionOf: e.id, evidence: "supported" };
  d.entries.push(fresh);
  audit(d, actor, "Entry treatment changed", entryId, { before: e.kind, after: newKind, reason });
}

export function stockAdjust(d, actor, businessId, delta, reason) {
  d.entries.push({ id: uid("E"), businessId, date: today(d), kind: "stock_adjust", amount: delta, status: "posted", source: "admin", description: reason, createdAt: nowISO(d), createdBy: by(actor) });
  audit(d, actor, "Stock value adjusted", businessId, { after: delta, reason });
}

// ---------------------------------------------------------------- Daily close
export function closeDay(d, actor, { businessId, from, to, counts, reasons, catchUp }) {
  const b = d.businesses.find((x) => x.id === businessId);
  // 1. Each guided reason creates its entry (DAY-06), dated the last day being closed.
  for (const r of reasons || []) {
    if (!r.amount) continue;
    d.entries.push({ id: uid("E"), businessId, date: to, kind: r.kind, amount: Math.abs(r.amount), channelId: r.channelId, status: "posted", source: "close", description: r.label, createdAt: nowISO(d), createdBy: by(actor) });
  }
  // 2. Differences within tolerance are accepted (DAY-05); the rest waits in suspense for an authorised
  //    person to resolve, so unexplained money never lands straight in profit (DAY-07, revised 27 Oct).
  const book = {};
  const diffs = {};
  let remainder = 0;
  for (const { channel, balance } of channelBalances(d, businessId, to)) {
    const counted = Number(counts[channel.id]) || 0;
    book[channel.id] = balance;
    const diff = Math.round((counted - balance) * 100) / 100;
    diffs[channel.id] = diff;
    if (Math.abs(diff) <= 0.004) continue;
    const small = Math.abs(diff) <= tolerance(d.settings, balance);
    const kind = small ? (diff > 0 ? "cash_over_small" : "cash_short_small") : diff > 0 ? "cash_over" : "cash_short";
    d.entries.push({ id: uid("E"), businessId, date: to, kind, amount: Math.abs(diff), channelId: channel.id, status: "posted", source: "close", description: "Daily close difference", createdAt: nowISO(d), createdBy: by(actor) });
    if (!small) remainder += diff;
  }
  const closedAt = nowISO(d);
  const close = { id: uid("K"), businessId, date: to, from, to, counts, book, diffs, remainder, open: Math.abs(remainder) > 0.004 ? remainder : 0, resolutions: [], catchUp: Boolean(catchUp), closedAt, onTime: from === to && isOnTime(to, closedAt), by: by(actor) };
  if (close.open) adminNotice(d, { en: "Cash difference to resolve", sw: "Tofauti ya pesa ya kutatua" }, { en: `${b.profile.businessName}: TZS ${Math.round(remainder).toLocaleString("en-US")} (${to})`, sw: `${b.profile.businessName}: TZS ${Math.round(remainder).toLocaleString("en-US")} (${to})` }, "approvals");
  if (Math.abs(remainder) > 0.004 && shouldFlag(d, businessId, remainder, to)) {
    close.flagged = true;
    notify(d, { officerOf: businessId }, { en: "Cash difference to follow up", sw: "Tofauti ya pesa ya kufuatilia" }, { en: `${b.profile.businessName}: TZS ${Math.round(remainder).toLocaleString("en-US")} unexplained (${to})`, sw: `${b.profile.businessName}: TZS ${Math.round(remainder).toLocaleString("en-US")} haielezeki (${to})` }, "officer-close");
  }
  d.closes.push(close);
  audit(d, actor, catchUp ? "Days caught up and closed" : "Day closed", businessId, { after: { from, to, remainder } });
  return close;
}

// Resolve a cash difference held in suspense: an authorised person sends it to the right account, with a reason.
export function resolveSuspense(d, actor, closeId, resolveTo, amount, reason) {
  const c = d.closes.find((x) => x.id === closeId);
  const side = c.open > 0 ? "over" : "short";
  if (!SUSPENSE_TARGETS[side].some((t) => t.acc === resolveTo)) throw new Error("Choose where the difference belongs.");
  const amt = Math.min(Math.abs(Number(amount) || 0), Math.abs(c.open));
  if (!amt) throw new Error("Enter an amount.");
  if (!reason || reason.trim().length < 5) throw new Error("A reason is required.");
  d.entries.push({ id: uid("E"), businessId: c.businessId, date: today(d), kind: "suspense_resolve", side, resolveTo, amount: amt, status: "posted", source: "admin", description: `Cash difference of ${c.to} resolved`, reason, closeId, createdAt: nowISO(d), createdBy: by(actor) });
  c.open = Math.round((c.open - Math.sign(c.open) * amt) * 100) / 100;
  c.resolutions.push({ at: nowISO(d), by: by(actor), resolveTo, amount: amt, reason });
  audit(d, actor, "Cash difference resolved", c.businessId, { before: { open: c.open + Math.sign(c.open || 1) * amt }, after: { resolveTo, amount: amt }, reason });
  notify(d, { businessId: c.businessId }, { en: "A cash difference was resolved", sw: "Tofauti ya pesa imetatuliwa" }, { en: reason, sw: reason }, "activity");
}

// Baseline answers are corrected through an audited process; the first answers are kept unchanged (ONB-06 revised).
export function correctBaseline(d, actor, businessId, field, value, reason) {
  const b = d.businesses.find((x) => x.id === businessId);
  if (!b.baseline.original) b.baseline.original = { ...b.baseline, corrections: undefined, original: undefined };
  const before = b.baseline[field];
  b.baseline[field] = value;
  b.baseline.corrections = [...(b.baseline.corrections || []), { field, before, after: value, at: nowISO(d), by: by(actor), reason }];
  audit(d, actor, "Baseline answer corrected", businessId, { before: { [field]: before }, after: { [field]: value }, reason });
}

// ---------------------------------------------------------------- Records Rating
export function saveRating(d, actor, rating) {
  const r = { ...rating, status: "final", createdAt: nowISO(d), officer: by(actor) };
  r.recheck = { selected: pickForRecheck(d.settings.recheckRate ?? 0.1) };
  d.ratings.push(r);
  // Entries the officer confirmed against evidence become supported evidence for credit.
  for (const item of rating.details?.correctness?.items || []) {
    if (item.ok === true) {
      const e = d.entries.find((x) => x.id === item.entryId);
      if (e) { e.verifiedInRating = r.id; e.evidence = "supported"; }
    }
  }
  // RAT-07: errors become correction requests; the rating scores the records as found.
  for (const item of rating.details?.correctness?.items || []) {
    if (item.ok === false) {
      d.changeRequests.unshift({ id: uid("CR"), businessId: r.businessId, type: "correction", entryId: item.entryId, note: item.note || "Officer found an error during the Records Rating check", status: "pending", proposedBy: by(actor), at: nowISO(d), ratingId: r.id });
    }
  }
  // Stock found differs from the books: the officer's count goes to Data Admin as a stock update request.
  const st = rating.details?.stock;
  if (st && Math.abs((Number(st.stockEst) || 0) - (Number(st.bookStock) || 0)) > 0.1 * Math.max(1, Number(st.bookStock) || 0)) {
    d.changeRequests.unshift({ id: uid("CR"), businessId: r.businessId, type: "stock", fields: { estimate: Number(st.stockEst) || 0 }, note: `Stock counted at visit: TZS ${Math.round(Number(st.stockEst) || 0).toLocaleString("en-US")} (books: TZS ${Math.round(Number(st.bookStock) || 0).toLocaleString("en-US")})`, status: "pending", proposedBy: by(actor), at: nowISO(d), ratingId: r.id });
  }
  audit(d, actor, "Records Rating completed", r.businessId, { after: { score: r.score, ratingId: r.id } });
  notify(d, { businessId: r.businessId }, { en: "Your Records Rating is ready", sw: "Kiwango chako cha Kumbukumbu kiko tayari" }, { en: `${r.score}%`, sw: `${r.score}%` }, "rating");
  if (r.recheck.selected) adminNotice(d, { en: "Records Rating picked for re-check", sw: "Kiwango kimechaguliwa kukaguliwa upya" }, { en: r.businessName || r.businessId, sw: r.businessName || r.businessId }, "rating-review");
  if (r.locationFlag) adminNotice(d, { en: "Rating visit far from the business location", sw: "Ukaguzi ulifanyika mbali na eneo la biashara" }, { en: r.businessName || r.businessId, sw: r.businessName || r.businessId }, "rating-review");
}

export function acknowledgeRating(d, actor, ratingId) {
  const r = d.ratings.find((x) => x.id === ratingId);
  r.acknowledgedAt = nowISO(d);
  audit(d, actor, "Records Rating acknowledged", r.businessId, { after: ratingId });
}

export function disputeRating(d, actor, ratingId, reason) {
  const r = d.ratings.find((x) => x.id === ratingId);
  r.status = "disputed";
  r.dispute = { reason, at: nowISO(d), by: by(actor) };
  audit(d, actor, "Records Rating disputed", r.businessId, { reason });
  adminNotice(d, { en: "Records Rating disputed", sw: "Kiwango cha Kumbukumbu kimepingwa" }, { en: reason, sw: reason }, "rating-review");
}

export function decideDispute(d, actor, ratingId, revisedScore, reason) {
  const r = d.ratings.find((x) => x.id === ratingId);
  const before = r.score;
  if (revisedScore != null && revisedScore !== "") r.score = Math.max(0, Math.min(100, Math.round(Number(revisedScore))));
  r.status = "final";
  r.dispute = { ...r.dispute, decidedAt: nowISO(d), decidedBy: by(actor), decision: reason, before, after: r.score };
  audit(d, actor, "Records Rating dispute decided", r.businessId, { before, after: r.score, reason });
  notify(d, { businessId: r.businessId }, { en: "Decision on your rating dispute", sw: "Uamuzi kuhusu pingamizi la kiwango chako" }, { en: reason, sw: reason }, "rating");
}

export function recordRecheck(d, actor, ratingId, score, note) {
  const r = d.ratings.find((x) => x.id === ratingId);
  const gap = Math.abs(Number(score) - r.score);
  r.recheck = { ...(r.recheck || {}), selected: true, done: true, score: Number(score), gap, flagged: gap > (d.settings.recheckGapFlag ?? 15), by: by(actor), at: nowISO(d), note };
  audit(d, actor, "Records Rating re-checked", r.businessId, { before: r.score, after: Number(score), reason: note });
}

// ---------------------------------------------------------------- External loans (FIN-02)
export function declareExternalLoan(d, actor, loan) {
  d.externalLoans.push({ ...loan, status: "submitted", submittedBy: by(actor), submittedAt: nowISO(d), revisions: [] });
  audit(d, actor, "External loan declared", loan.businessId, { after: loan.lender });
  adminNotice(d, { en: "External loan to review", sw: "Mkopo wa nje wa kukagua" }, { en: loan.lender, sw: loan.lender }, "approvals");
}

export function reviewExternalLoan(d, actor, id, changes, reason, archive = false) {
  const x = d.externalLoans.find((l) => l.id === id);
  const before = { ...x, revisions: undefined };
  Object.assign(x, changes);
  x.status = "reviewed";
  if (archive) x.archived = true;
  x.revisions.push({ at: nowISO(d), by: by(actor), before, after: changes, reason, archive });
  audit(d, actor, archive ? "External loan archived" : "External loan reviewed", x.businessId, { before, after: changes, reason });
  notify(d, { businessId: x.businessId }, { en: "Your declared loan was reviewed", sw: "Mkopo uliotaja umekaguliwa" }, { en: reason, sw: reason }, "finance");
}

// ---------------------------------------------------------------- Loans (FIN-01 to FIN-06)
export function requestLoan(d, actor, loan) {
  d.loans.push({ ...loan, status: "requested", requestedAt: nowISO(d), history: [{ at: nowISO(d), event: "requested", by: by(actor) }] });
  const b = d.businesses.find((x) => x.id === loan.businessId);
  for (const fi of d.fis.filter((f) => f.status === "approved" && (!loan.fiId || f.id === loan.fiId) && b.consent?.fis?.[f.id]?.granted)) {
    notify(d, { fiId: fi.id }, { en: "New loan request", sw: "Ombi jipya la mkopo" }, { en: `${b.profile.businessName}: TZS ${Number(loan.amount).toLocaleString("en-US")}`, sw: `${b.profile.businessName}: TZS ${Number(loan.amount).toLocaleString("en-US")}` }, "fi-loans");
  }
  audit(d, actor, "Loan requested", loan.businessId, { after: { amount: loan.amount, type: loan.type } });
}

export function makeOffer(d, actor, loanId, { fiId, product, principal, frequency, instalments, manualReview = null }) {
  const l = d.loans.find((x) => x.id === loanId);
  const b = d.businesses.find((x) => x.id === l.businessId);
  const g = gates(d, b, today(d));
  // Automatic eligibility needs a rating of 70+; 50-69 is allowed only with the lender's own recorded review.
  const reviewed = g.needsReview && manualReview && String(manualReview.reason || "").trim().length >= 10;
  if (!g.passed && !reviewed) {
    if (g.needsReview) throw new Error("Records Rating is Okay (50–69): record your own review of this business's records before offering.");
    throw new Error(`No offer possible yet. Not met: ${Object.keys(g.results).filter((k) => g.results[k] !== true).map((k) => GATES[k].en).join("; ")}.`);
  }
  const sc = schedule({ principal, annualRate: product.annualRate, frequency, instalments, feePct: product.feePct, feeFixed: product.feeFixed, start: today(d) });
  if (!offerFits(d, b, sc, frequency, today(d))) throw new Error("The largest instalment does not fit this business's affordability.");
  l.fiId = fiId;
  l.status = "offered";
  l.offeredAt = nowISO(d);
  l.offer = { manualReview: reviewed ? { ...manualReview, by: by(actor), at: nowISO(d) } : null, productId: product.id, productName: product.name, annualRate: product.annualRate, feePct: product.feePct, feeFixed: product.feeFixed, principal, frequency, instalments, rows: sc.rows, fees: sc.fees, totalRepay: sc.totalRepay, costOfCredit: sc.costOfCredit };
  l.history.push({ at: nowISO(d), event: "offered", by: by(actor) });
  audit(d, actor, "Loan offer made", l.businessId, { after: { principal, totalRepay: sc.totalRepay } });
  notify(d, { businessId: l.businessId }, { en: "You have a loan offer", sw: "Una ofa ya mkopo" }, { en: `Total to repay TZS ${Math.round(sc.totalRepay).toLocaleString("en-US")}`, sw: `Jumla ya kurejesha TZS ${Math.round(sc.totalRepay).toLocaleString("en-US")}` }, "finance");
}

export function respondOffer(d, actor, loanId, accept, channelId) {
  const l = d.loans.find((x) => x.id === loanId);
  l.status = accept ? "accepted" : "declined";
  l.channelId = channelId;
  l.history.push({ at: nowISO(d), event: accept ? "accepted" : "declined", by: by(actor) });
  audit(d, actor, accept ? "Loan offer accepted" : "Loan offer declined", l.businessId);
  notify(d, { fiId: l.fiId }, accept ? { en: "Offer accepted", sw: "Ofa imekubaliwa" } : { en: "Offer declined", sw: "Ofa imekataliwa" }, { en: l.id, sw: l.id }, "fi-loans");
}

export function rejectLoan(d, actor, loanId, reason) {
  const l = d.loans.find((x) => x.id === loanId);
  l.status = "rejected";
  l.history.push({ at: nowISO(d), event: "rejected", by: by(actor), reason });
  audit(d, actor, "Loan request rejected", l.businessId, { reason });
  notify(d, { businessId: l.businessId }, { en: "Loan request not approved", sw: "Ombi la mkopo halikuidhinishwa" }, { en: reason, sw: reason }, "finance");
}

export function disburse(d, actor, loanId) {
  const l = d.loans.find((x) => x.id === loanId);
  const b = d.businesses.find((x) => x.id === l.businessId);
  const sc = schedule({ principal: l.offer.principal, annualRate: l.offer.annualRate, frequency: l.offer.frequency, instalments: l.offer.instalments, feePct: l.offer.feePct, feeFixed: l.offer.feeFixed, start: today(d) });
  if (!offerFits(d, b, sc, l.offer.frequency, today(d))) throw new Error("This loan no longer fits the business's affordability. Disbursement stopped.");
  const g = gates(d, b, today(d));
  const ratingOk = g.results.rating === true || (g.results.rating === "review" && l.offer.manualReview);
  if (!ratingOk || !g.results.overdue || !g.results.reconciled) throw new Error(`Disbursement stopped. Not met: ${["rating", "overdue", "reconciled"].filter((k) => (k === "rating" ? !ratingOk : g.results[k] !== true)).map((k) => GATES[k].en).join("; ")}.`);
  l.schedule = sc.rows;
  l.frequency = l.offer.frequency;
  l.status = "disbursed";
  l.disbursedAt = nowISO(d);
  const long = l.offer.frequency === "monthly" ? l.offer.instalments > 12 : l.offer.frequency === "weekly" ? l.offer.instalments > 52 : false;
  if (l.type === "asset") {
    d.entries.push({ id: uid("E"), businessId: l.businessId, date: today(d), kind: "asset_financed", amount: l.offer.principal, longTerm: long, status: "posted", source: "loan", loanId, description: `Asset finance ${l.id}`, createdAt: nowISO(d), createdBy: by(actor) });
    const qr = d.quoteRequests.find((q) => q.id === l.quoteId);
    if (qr) {
      qr.status = "paid";
      qr.history.push({ at: nowISO(d), event: "paid by lender", by: by(actor) });
      const sup = d.suppliers.find((s) => s.id === qr.supplierId);
      if (sup) sup.walletBalance = (sup.walletBalance || 0) + l.offer.principal;
      notify(d, { supplierId: qr.supplierId }, { en: "Payment received from lender", sw: "Malipo yamepokelewa kutoka kwa mkopeshaji" }, { en: "Deliver and confirm delivery", sw: "Peleka na thibitisha kufikisha" }, "supplier-orders");
    }
  } else {
    d.entries.push({ id: uid("E"), businessId: l.businessId, date: today(d), kind: "loan_received", amount: l.offer.principal, longTerm: long, channelId: l.channelId, status: "posted", source: "loan", loanId, description: `Loan ${l.id}`, createdAt: nowISO(d), createdBy: by(actor) });
  }
  const fi = d.fis.find((f) => f.id === l.fiId);
  if (fi) fi.walletBalance = (fi.walletBalance || 0) - l.offer.principal;
  l.history.push({ at: nowISO(d), event: "disbursed", by: by(actor) });
  audit(d, actor, "Loan disbursed", l.businessId, { after: l.offer.principal });
  notify(d, { businessId: l.businessId }, { en: "Loan disbursed", sw: "Mkopo umetolewa" }, { en: `TZS ${Math.round(l.offer.principal).toLocaleString("en-US")}`, sw: `TZS ${Math.round(l.offer.principal).toLocaleString("en-US")}` }, "finance");
}

export function payInstalment(d, actor, loanId, n, channelId) {
  const l = d.loans.find((x) => x.id === loanId);
  const i = l.schedule.find((x) => x.n === n);
  if (i.paidAt) return;
  const bal = channelBalance(d, l.businessId, channelId, today(d));
  if (bal + 0.5 < i.amount) throw new Error("Not enough money in this account for the instalment.");
  d.entries.push({ id: uid("E"), businessId: l.businessId, date: today(d), kind: "loan_repayment", amount: i.principal, channelId, status: "posted", source: "loan", loanId, description: `Instalment ${n} of ${l.id}`, createdAt: nowISO(d), createdBy: by(actor) });
  if (i.interest + i.fee > 0) d.entries.push({ id: uid("E"), businessId: l.businessId, date: today(d), kind: "loan_interest", amount: i.interest + i.fee, channelId, status: "posted", source: "loan", loanId, description: `Interest and fees, instalment ${n} of ${l.id}`, createdAt: nowISO(d), createdBy: by(actor) });
  i.paidAt = nowISO(d);
  const fi = d.fis.find((f) => f.id === l.fiId);
  if (fi) fi.walletBalance = (fi.walletBalance || 0) + i.amount;
  if (l.schedule.every((x) => x.paidAt)) {
    l.status = "repaid";
    l.history.push({ at: nowISO(d), event: "repaid", by: by(actor) });
  }
  audit(d, actor, "Instalment paid", l.businessId, { after: { loanId, n } });
}

// ---------------------------------------------------------------- Suppliers and quotes
export function requestQuote(d, actor, q) {
  d.quoteRequests.unshift({ ...q, status: "requested", createdAt: nowISO(d), history: [{ at: nowISO(d), event: "requested", by: by(actor) }] });
  notify(d, { supplierId: q.supplierId }, { en: "New quote request", sw: "Ombi jipya la nukuu" }, { en: q.item, sw: q.item }, "supplier-quotes");
}

export function quoteStep(d, actor, id, event, patch = {}) {
  const q = d.quoteRequests.find((x) => x.id === id);
  Object.assign(q, patch);
  const status = { quoted: "quoted", accepted: "accepted", ordered: "ordered", invoiced: "invoiced", delivered: "delivered", received: "received", paid: "paid", declined: "declined" }[event];
  if (status) q.status = status;
  q.history.push({ at: nowISO(d), event, by: by(actor) });
  const toRequester = q.requester.type === "business" ? { businessId: q.requester.id } : { fiId: q.requester.id };
  if (["quoted", "invoiced", "delivered"].includes(event)) notify(d, toRequester, { en: `Quote ${event}`, sw: `Nukuu: ${event}` }, { en: q.item, sw: q.item }, "suppliers");
  if (["accepted", "received", "paid"].includes(event)) notify(d, { supplierId: q.supplierId }, { en: `Quote ${event}`, sw: `Nukuu: ${event}` }, { en: q.item, sw: q.item }, "supplier-quotes");
}

// ---------------------------------------------------------------- Messages, queries, quarterly
export function sendMessage(d, actor, { threadKey, title, text, participants }) {
  d.messages.push({ id: uid("M"), threadKey, title, text, at: nowISO(d), from: by(actor), participants });
  for (const p of participants) if (!(p.userId && p.userId === actor.id)) notify(d, p, { en: "New message", sw: "Ujumbe mpya" }, { en: title || text.slice(0, 60), sw: title || text.slice(0, 60) }, "messages");
}

export function createQuery(d, actor, q) {
  d.queries.unshift({ ...q, status: "open", createdAt: nowISO(d), by: by(actor) });
  adminNotice(d, { en: "New help query", sw: "Swali jipya la msaada" }, { en: q.topic || "", sw: q.topic || "" }, "admin-queries");
}

export function answerQuery(d, actor, id, answer) {
  const q = d.queries.find((x) => x.id === id);
  q.status = "answered";
  q.answer = answer;
  q.answeredBy = by(actor);
  q.answeredAt = nowISO(d);
  notify(d, { userId: q.by.id }, { en: "Your question was answered", sw: "Swali lako limejibiwa" }, { en: answer.slice(0, 80), sw: answer.slice(0, 80) }, "help");
}

export function saveQuarterly(d, actor, a) {
  d.quarterly.push({ ...a, at: nowISO(d), by: by(actor) });
  const b = d.businesses.find((x) => x.id === a.businessId);
  b.lastQuarterlyAt = nowISO(d);
}

// ---------------------------------------------------------------- Packages, payments and billing
export function payPackage(d, actor, { ownerId, packageId, method, outcome, reference }) {
  if (d.payments.some((p) => p.reference === reference && p.status === "success")) return "duplicate";
  const pkg = d.packages.business.find((p) => p.id === packageId);
  d.payments.push({ id: uid("PAY"), ownerId, packageId, amount: pkg.price, method, reference, status: outcome, at: nowISO(d), by: by(actor) });
  if (outcome !== "success") return "failed";
  const days = { day: 1, week: 7, month: 30 }[pkg.period] || 30;
  d.subscriptions.push({ id: uid("SUB"), ownerId, packageId, from: today(d), to: addDays(today(d), days - 1), status: "active" });
  audit(d, actor, "Package paid", ownerId, { after: packageId });
  return "success";
}

export function setFiPackage(d, actor, fiId, packageId, billing) {
  const fi = d.fis.find((f) => f.id === fiId);
  const before = { packageId: fi.packageId, billing: fi.billing };
  fi.packageId = packageId;
  fi.billing = billing;
  audit(d, actor, "FI package changed", fiId, { before, after: { packageId, billing } });
}

export function logAssessment(d, actor, fiId, businessId) {
  const day = today(d);
  if (!needsAssessment(d, fiId, businessId, day)) return false;
  const fi = d.fis.find((f) => f.id === fiId);
  d.assessments.push({ id: uid("AS"), fiId, businessId, date: day, at: nowISO(d), fee: assessmentFee(d, fi, day), by: by(actor) });
  audit(d, actor, "Assessment opened (billed)", businessId, { after: fiId });
  return true;
}

// ---------------------------------------------------------------- Organisations
export function registerOrg(d, actor, kind, org) {
  const list = kind === "fi" ? d.fis : d.suppliers;
  list.push({ ...org, status: "pending", joinedAt: today(d), walletBalance: kind === "fi" ? 0 : 0, products: [], ...(kind === "fi" ? { packageId: "starter", billing: "monthly", sponsorTier: "standard" } : {}) });
  d.users.push({ id: uid("U"), role: kind, name: org.contactName || org.name, login: org.email, password: org.password, orgId: org.id, active: true });
  adminNotice(d, { en: `New ${kind === "fi" ? "FI" : "supplier"} to approve`, sw: `${kind === "fi" ? "Taasisi" : "Msambazaji"} mpya wa kuidhinisha` }, { en: org.name, sw: org.name }, "approvals");
}

export function decideOrg(d, actor, kind, id, approve, reason) {
  const list = kind === "fi" ? d.fis : d.suppliers;
  const o = list.find((x) => x.id === id);
  o.status = approve ? "approved" : "declined";
  audit(d, actor, `${kind === "fi" ? "FI" : "Supplier"} ${approve ? "approved" : "declined"}`, id, { reason });
}

// ---------------------------------------------------------------- Test tools (web MVP only)
// Moves a business's start date back and fills it with realistic sample activity and daily closes,
// so ratings, scoring and reports can be tested without waiting weeks.
export function generateSampleActivity(d, actor, businessId, days = 60, onTimeShare = 0.9) {
  const b = d.businesses.find((x) => x.id === businessId);
  const end = addDays(today(d), -1);
  const start = addDays(today(d), -days);
  b.startDate = start;
  if (b.opening) b.opening.date = start;
  // Earlier entries are replaced; daily-close differences and their resolutions go with the closes they belong to.
  d.entries = d.entries.filter((e) => !(e.businessId === businessId && (e.date < today(d) || e.source === "close" || e.kind === "suspense_resolve")));
  d.closes = d.closes.filter((c) => c.businessId !== businessId);
  const rnd = seeded(`${businessId}-${days}`);
  const cash = b.channels.find((c) => c.type === "cash") || b.channels[0];
  const mobile = b.channels.find((c) => c.type === "mobile") || cash;
  const mk = (date, kind, amount, ch, desc) => d.entries.push({ id: uid("E"), businessId, date, kind, amount: Math.round(amount / 100) * 100, channelId: ch.id, status: "posted", source: "typed", description: desc, createdAt: `${date}T${String(8 + Math.floor(rnd() * 9)).padStart(2, "0")}:${String(Math.floor(rnd() * 60)).padStart(2, "0")}:00`, createdBy: by(actor), sample: true });
  for (const date of dateRange(start, end)) {
    const sales = 2 + Math.floor(rnd() * 5);
    for (let i = 0; i < sales; i++) mk(date, "sale_cash", 5000 + rnd() * 30000, rnd() < 0.7 ? cash : mobile, "Nimeuza bidhaa");
    if (rnd() < 0.5) mk(date, "stock_cash", 20000 + rnd() * 60000, cash, "Nimenunua mzigo");
    if (rnd() < 0.3) mk(date, "transport", 2000 + rnd() * 5000, cash, "Nauli");
    if (rnd() < 0.15) mk(date, "drawings", 5000 + rnd() * 10000, cash, "Matumizi ya nyumbani");
    if (date.endsWith("-01")) mk(date, "rent", 60000, mobile, "Kodi ya pango");
    if (rnd() < onTimeShare) {
      const counts = {};
      for (const { channel, balance } of channelBalances(d, businessId, date)) counts[channel.id] = Math.max(0, balance);
      d.closes.push({ id: uid("K"), businessId, date, from: date, to: date, counts, book: counts, diffs: {}, remainder: 0, closedAt: `${date}T18:00:00`, onTime: true, sample: true });
    } else {
      d.closes.push({ id: uid("K"), businessId, date, from: date, to: date, counts: {}, book: {}, diffs: {}, remainder: 0, closedAt: `${addDays(date, 1)}T11:00:00`, onTime: false, sample: true });
    }
  }
  audit(d, actor, "Test tool: sample activity generated", businessId, { after: { days } });
}
