// Domain action tests: daily close, holds and decisions, Records Rating gate on offers, packages, assessments, consent.
import assert from "node:assert/strict";
import test from "node:test";
import { balanceSheet, channelBalances, trialBalance } from "../src/core/accounting.js";
import { activePackage } from "../src/core/billing.js";
import { initialState } from "../src/core/seed.js";
import { addDays, today } from "../src/core/util.js";
import { addEntry, closeDay, createBusiness, decideHeld, generateSampleActivity, logAssessment, makeOffer, payPackage, requestLoan, reverseEntry, saveOpening, decideOpening, saveRating, setConsent } from "../src/lib/actions.js";
import { businessesInScope } from "../src/lib/access.js";

const ADMIN = { id: "U-DATA", name: "Data Admin", role: "dataAdmin" };
const OFF = { id: "U-OFF1", name: "Officer", role: "officer" };

function world() {
  const d = initialState(today(null));
  createBusiness(d, OFF, {
    id: "B1", userId: "UB1", officerId: "U-OFF1", pin: "1234",
    profile: { ownerName: "Neema Juma Mushi", phone: "+255712345678", nida: "1", dob: "1994-05-12", gender: "female", photoId: "p", idPhotoId: "i", businessName: "Neema Shop", sector: "produce", region: "Dar es Salaam", gps: { lat: -6.8, lng: 39.28 }, monthsOperating: 24 },
    channels: [{ id: "C1", type: "cash", name: "Cash" }, { id: "C2", type: "mobile", name: "M-Pesa" }],
    baseline: { bank: "none", mobile: "personal", borrowed: "never", sources: ["vicoba"], needFinance: "no" }
  });
  saveOpening(d, OFF, "B1", { channels: { C1: 50000, C2: 20000 }, inventory: 300000 }, true);
  decideOpening(d, ADMIN, "B1", true, "Checked");
  return d;
}
const biz = (d) => d.businesses.find((b) => b.id === "B1");
const entry = (over) => ({ id: `E${Math.random()}`, businessId: "B1", date: over.date, kind: "sale_cash", amount: 1000, channelId: "C1", ...over });

test("daily close: a guided reason creates its entry and the rest goes to cash difference", () => {
  const d = world();
  const t = today(d);
  addEntry(d, OFF, entry({ date: t, amount: 20000 }));
  closeDay(d, OFF, { businessId: "B1", from: t, to: t, counts: { C1: 85000, C2: 20000 }, reasons: [{ kind: "debtor_receipt", amount: 10000, channelId: "C1", label: "A customer paid" }] });
  assert.ok(d.entries.some((e) => e.kind === "debtor_receipt" && e.amount === 10000 && e.source === "close"));
  assert.ok(d.entries.some((e) => e.kind === "cash_over" && e.amount === 5000));
  const cash = channelBalances(d, "B1", t).find((x) => x.channel.id === "C1").balance;
  assert.equal(cash, 85000, "after the close the books match the count");
  const tb = trialBalance(d, "B1", t);
  assert.ok(Math.abs(tb.totalDebit - tb.totalCredit) < 0.01);
});

test("held entry: Admin decline keeps it out of the books; reversal balances", () => {
  const d = world();
  const t = today(d);
  const ev = addEntry(d, OFF, entry({ id: "BIG", date: t, kind: "rent", amount: 999000, channelId: "C2" }));
  assert.equal(ev.action, "hold");
  assert.deepEqual(ev.reasons, ["overdraw"]);
  decideHeld(d, ADMIN, "BIG", "decline", { reason: "Wrong account" });
  assert.equal(d.entries.find((e) => e.id === "BIG").status, "declined");
  addEntry(d, OFF, entry({ id: "S1", date: t, amount: 7000 }));
  const before = balanceSheet(d, "B1", t).totalAssets;
  reverseEntry(d, ADMIN, "S1", "Entered twice by mistake");
  assert.equal(balanceSheet(d, "B1", t).totalAssets, before - 7000);
  assert.ok(d.audit.some((a) => a.action === "Entry reversed" && a.reason));
});

test("credit gate: Poor rating blocks an offer, Okay allows it", () => {
  const d = world();
  generateSampleActivity(d, ADMIN, "B1", 95, 1);
  setConsent(d, OFF, "B1", "FI-1", true);
  requestLoan(d, OFF, { id: "L1", businessId: "B1", fiId: "FI-1", productId: "P-1", type: "working_capital", amount: 200000, purpose: "stock", frequency: "monthly" });
  const product = d.fis[0].products[0];
  const rating = (score) => ({ id: `R${score}`, businessId: "B1", date: today(d), points: { cash: 25, completeness: 0, correctness: 0, timeliness: 15, stock: 0 }, score, details: {} });
  saveRating(d, OFF, rating(45));
  assert.throws(() => makeOffer(d, { id: "U-FI1", name: "FI", role: "fi" }, "L1", { fiId: "FI-1", product, principal: 200000, frequency: "monthly", instalments: 6 }), /Records Rating/);
  saveRating(d, OFF, rating(62));
  makeOffer(d, { id: "U-FI1", name: "FI", role: "fi" }, "L1", { fiId: "FI-1", product, principal: 200000, frequency: "monthly", instalments: 6 });
  assert.equal(d.loans[0].status, "offered");
  assert.ok(d.loans[0].offer.totalRepay > 200000);
});

test("packages: a failed payment never unlocks; a repeated confirmation never charges twice", () => {
  const d = world();
  const b = biz(d);
  assert.equal(payPackage(d, OFF, { ownerId: "B1", packageId: "week", method: "mobile", outcome: "failed", reference: "R1" }), "failed");
  assert.equal(activePackage(d, b, today(d)), "basic");
  assert.equal(payPackage(d, OFF, { ownerId: "B1", packageId: "week", method: "mobile", outcome: "success", reference: "R2" }), "success");
  assert.equal(payPackage(d, OFF, { ownerId: "B1", packageId: "week", method: "mobile", outcome: "success", reference: "R2" }), "duplicate");
  assert.equal(d.payments.filter((p) => p.status === "success").length, 1);
  assert.equal(activePackage(d, b, today(d)), "week");
  assert.equal(activePackage(d, b, addDays(today(d), 7)), "basic");
});

test("assessments: billed once per FI per business per day", () => {
  const d = world();
  const fi = { id: "U-FI1", name: "FI", role: "fi" };
  assert.equal(logAssessment(d, fi, "FI-1", "B1"), true);
  assert.equal(logAssessment(d, fi, "FI-1", "B1"), false);
  assert.equal(d.assessments.length, 1);
  assert.equal(d.assessments[0].fee, 3000);
});

test("consent: withdrawing removes the FI's access at once", () => {
  const d = world();
  const fiUser = d.users.find((u) => u.id === "U-FI1");
  assert.equal(businessesInScope(d, fiUser).length, 0);
  setConsent(d, OFF, "B1", "FI-1", true);
  assert.equal(businessesInScope(d, fiUser).length, 1);
  setConsent(d, OFF, "B1", "FI-1", false);
  assert.equal(businessesInScope(d, fiUser).length, 0);
});

test("officers see only their own businesses; suppliers and reports users see none", () => {
  const d = world();
  assert.equal(businessesInScope(d, d.users.find((u) => u.id === "U-OFF1")).length, 1);
  assert.equal(businessesInScope(d, d.users.find((u) => u.id === "U-OFF2")).length, 0);
  assert.equal(businessesInScope(d, d.users.find((u) => u.id === "U-SUP1")).length, 0);
  assert.equal(businessesInScope(d, d.users.find((u) => u.id === "U-BOT")).length, 0);
});
