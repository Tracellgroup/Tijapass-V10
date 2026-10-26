// Credit passport and scoring (CRD-01 to CRD-07), affordability and repayment schedules (FIN-04, FIN-05).
import { bookEntries, incomeStatement } from "./accounting.js";
import { closesFor } from "./dailyClose.js";
import { ratingStatus } from "./rating.js";
import { addDays, addMonths, clamp, daysBetween, monthKey, round, sum } from "./util.js";

export const LOAN_TYPES = {
  working_capital: { en: "Working capital", sw: "Mtaji wa kufanyia kazi" },
  asset: { en: "Asset finance (from a supplier quote)", sw: "Mkopo wa mali (kutoka nukuu ya msambazaji)" },
  term: { en: "Term loan", sw: "Mkopo wa muda" }
};

export const FREQUENCIES = {
  daily: { perYear: 365, en: "Daily", sw: "Kila siku", firstMax: 90, laterMax: 90 },
  weekly: { perYear: 52, en: "Weekly", sw: "Kila wiki", firstMax: 26, laterMax: 52 },
  monthly: { perYear: 12, en: "Monthly", sw: "Kila mwezi", firstMax: 12, laterMax: 36 }
};

const KYC_FIELDS = ["ownerName", "phone", "nida", "dob", "gender", "photoId", "idPhotoId", "businessName", "sector", "region"];

export function kycCompleteness(business) {
  const p = business.profile || {};
  const have = KYC_FIELDS.filter((f) => p[f]).length + (business.consent?.at ? 1 : 0) + (p.gps || p.address ? 1 : 0);
  return have / (KYC_FIELDS.length + 2);
}

export const loansFor = (state, businessId) => (state.loans || []).filter((l) => l.businessId === businessId);

function repaymentRecord(state, businessId, todayISO) {
  const due = [];
  for (const l of loansFor(state, businessId)) for (const i of l.schedule || []) if (i.due <= todayISO) due.push(i);
  const onTime = due.filter((i) => i.paidAt && i.paidAt.slice(0, 10) <= i.due).length;
  const repaidLoans = loansFor(state, businessId).filter((l) => l.status === "repaid");
  const repaidOnTime = repaidLoans.filter((l) => (l.schedule || []).every((i) => i.paidAt && i.paidAt.slice(0, 10) <= i.due));
  const allPaid = sum(repaidLoans, (l) => (l.schedule || []).length);
  const allOnTime = sum(repaidLoans, (l) => (l.schedule || []).filter((i) => i.paidAt && i.paidAt.slice(0, 10) <= i.due).length);
  return { dueCount: due.length, onTime, share: due.length ? onTime / due.length : null, repaidLoans: repaidLoans.length, repaidOnTime: repaidOnTime.length, onTimeShareRepaid: allPaid ? allOnTime / allPaid : 0 };
}

export function overdueAmount(state, businessId, todayISO) {
  let total = 0;
  for (const l of loansFor(state, businessId).filter((x) => x.status === "disbursed")) for (const i of l.schedule || []) if (!i.paidAt && i.due < todayISO) total += i.amount;
  return total;
}

export function score(state, business, todayISO) {
  const w = state.settings.scoreWeights || { kyc: 10, coverage: 20, records: 15, months: 10, rating: 30, repayment: 15 };
  const entries = bookEntries(state, business.id, todayISO).filter((e) => !e.contra);
  const since = business.startDate > addDays(todayISO, -90) ? business.startDate : addDays(todayISO, -90);
  const span = Math.max(1, daysBetween(since, todayISO));
  const activeDays = new Set([
    ...entries.filter((e) => e.date >= since).map((e) => e.date),
    ...closesFor(state, business.id).filter((c) => c.date >= since).map((c) => c.date)
  ]);
  const opMonths = (Number(business.profile?.monthsOperating) || 0) + Math.max(0, Math.floor(daysBetween(business.startDate, todayISO) / 30));
  const rs = ratingStatus(state, business, todayISO);
  const rep = repaymentRecord(state, business.id, todayISO);
  const parts = {
    kyc: kycCompleteness(business),
    coverage: clamp(activeDays.size / span, 0, 1),
    records: clamp(entries.length / 300, 0, 1),
    months: clamp(opMonths / 12, 0, 1),
    rating: rs.state === "rated" ? rs.rating.score / 100 : 0,
    repayment: rep.share
  };
  // First-time borrowers have no repayment record: its weight is shared among the other factors.
  const keys = Object.keys(parts).filter((k) => parts[k] != null);
  const totalW = sum(keys, (k) => w[k] || 0);
  const value = totalW ? (sum(keys, (k) => (w[k] || 0) * parts[k]) / totalW) * 100 : 0;
  return { value: Math.round(value), parts, weights: w, firstTime: rep.share == null, repayment: rep, entries: entries.length, months: new Set(entries.map((e) => monthKey(e.date))).size };
}

export const GATES = {
  score: { en: "Score at least the qualifying level", sw: "Alama angalau kiwango cha kufuzu" },
  kyc: { en: "Profile, ID and consent complete", sw: "Wasifu, kitambulisho na ridhaa vimekamilika" },
  records: { en: "At least 30 entries over at least 3 months", sw: "Angalau kumbukumbu 30 kwa miezi 3 au zaidi" },
  overdue: { en: "No overdue TijaPass repayments", sw: "Hakuna marejesho ya TijaPass yaliyochelewa" },
  external: { en: "Declared external loans reviewed by Admin", sw: "Mikopo ya nje iliyotajwa imekaguliwa na Msimamizi" },
  profit: { en: "Positive profit over the last 3 months", sw: "Faida chanya kwa miezi 3 iliyopita" },
  rating: { en: "Records Rating Okay or better, and not overdue", sw: "Kiwango cha Kumbukumbu Wastani au zaidi, na si cha muda uliopita" }
};

export function avgMonthlyProfit(state, business, todayISO) {
  const from = business.startDate > addDays(todayISO, -90) ? business.startDate : addDays(todayISO, -90);
  const days = Math.max(1, daysBetween(from, todayISO));
  const p = incomeStatement(state, business.id, from, todayISO).profit;
  return (p / days) * 30;
}

export function gates(state, business, todayISO) {
  const s = score(state, business, todayISO);
  const rs = ratingStatus(state, business, todayISO);
  const ext = (state.externalLoans || []).filter((x) => x.businessId === business.id && !x.archived);
  const res = {
    score: s.value >= (state.settings.qualifyScore ?? 70),
    kyc: kycCompleteness(business) >= 1 && Boolean(business.consent?.at),
    records: s.entries >= 30 && s.months >= 3,
    overdue: overdueAmount(state, business.id, todayISO) === 0,
    external: ext.every((x) => x.status === "reviewed"),
    profit: avgMonthlyProfit(state, business, todayISO) > 0,
    rating: rs.state === "rated" && rs.rating.score >= 50
  };
  return { results: res, passed: Object.values(res).every(Boolean), score: s };
}

export const toMonthly = (amount, frequency) => (frequency === "daily" ? amount * 30 : frequency === "weekly" ? (amount * 52) / 12 : amount);

export function existingMonthlyInstalments(state, businessId, todayISO) {
  const internal = loansFor(state, businessId)
    .filter((l) => l.status === "disbursed")
    .reduce((t, l) => {
      const next = (l.schedule || []).find((i) => !i.paidAt && i.due >= todayISO) || (l.schedule || []).find((i) => !i.paidAt);
      return t + (next ? toMonthly(next.amount, l.frequency) : 0);
    }, 0);
  const external = (state.externalLoans || [])
    .filter((x) => x.businessId === businessId && !x.archived && Number(x.remaining) > 0)
    .reduce((t, x) => t + toMonthly(Number(x.instalment) || 0, x.frequency), 0);
  return { internal, external, total: internal + external };
}

export function repaymentShare(state, businessId, todayISO) {
  const rep = repaymentRecord(state, businessId, todayISO);
  if (rep.repaidLoans >= 2 && rep.onTimeShareRepaid >= 0.95) return 0.35;
  if (rep.repaidOnTime >= 1) return 0.3;
  return 0.25;
}

export function affordability(state, business, todayISO) {
  const profit = avgMonthlyProfit(state, business, todayISO);
  const share = repaymentShare(state, business.id, todayISO);
  const existing = existingMonthlyInstalments(state, business.id, todayISO);
  const buffer = state.settings.cashBuffer ?? 0.8;
  const capacity = Math.max(0, profit * buffer * share - existing.total);
  return { profit, share, buffer, existing, capacity: round(capacity) };
}

export function maxInstalments(state, businessId, frequency) {
  const later = loansFor(state, businessId).some((l) => l.status === "repaid");
  const f = FREQUENCIES[frequency];
  return later ? f.laterMax : f.firstMax;
}

const periodicRate = (annualPct, frequency) => (Number(annualPct) || 0) / 100 / FREQUENCIES[frequency].perYear;

export function payment(principal, annualPct, frequency, n) {
  const r = periodicRate(annualPct, frequency);
  if (!r) return principal / n;
  return (principal * r) / (1 - (1 + r) ** -n);
}

// Largest principal whose instalment fits the capacity (monthly capacity converted to the frequency).
export function maxPrincipal(capacityMonthly, annualPct, frequency, n) {
  const perPeriod = frequency === "daily" ? capacityMonthly / 30 : frequency === "weekly" ? (capacityMonthly * 12) / 52 : capacityMonthly;
  const r = periodicRate(annualPct, frequency);
  if (perPeriod <= 0) return 0;
  return Math.floor(r ? (perPeriod * (1 - (1 + r) ** -n)) / r : perPeriod * n);
}

export function schedule({ principal, annualRate, frequency, instalments, feePct = 0, feeFixed = 0, start }) {
  const n = Number(instalments);
  const r = periodicRate(annualRate, frequency);
  const pay = payment(principal, annualRate, frequency, n);
  const fees = round((principal * (Number(feePct) || 0)) / 100 + (Number(feeFixed) || 0));
  let balance = principal;
  const rows = [];
  for (let i = 1; i <= n; i++) {
    const interest = round(balance * r);
    let princ = round(pay - interest);
    if (i === n) princ = round(balance);
    balance = round(balance - princ);
    const due = frequency === "daily" ? addDays(start, i) : frequency === "weekly" ? addDays(start, 7 * i) : addMonths(start, i);
    const fee = i === 1 ? fees : 0;
    rows.push({ n: i, due, principal: princ, interest, fee, amount: round(princ + interest + fee), paidAt: null });
  }
  const totalRepay = sum(rows, (x) => x.amount);
  return { rows, fees, totalRepay, costOfCredit: round(totalRepay - principal), firstMaxAmount: Math.max(...rows.map((x) => x.amount)) };
}

// Each instalment must fit capacity (CRD-04): the largest one, usually the first with fees, is checked.
export function offerFits(state, business, offerSched, frequency, todayISO) {
  const a = affordability(state, business, todayISO);
  return toMonthly(offerSched.firstMaxAmount, frequency) <= a.capacity + 0.5;
}
