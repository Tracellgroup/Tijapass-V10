// System Admin screens (ADM-03, ADM-04, PKG-01 to PKG-04, BOT-08, ROLE-05) and web MVP test tools.
import { Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { annualFromMonthly, canAssignTier, sponsorCounts } from "../../core/billing.js";
import { DEFAULT_SETTINGS } from "../../core/seed.js";
import { money, uid } from "../../core/util.js";
import { audit, generateSampleActivity } from "../../lib/actions.js";
import { ROLE_NAMES } from "../../lib/access.js";
import { clearFiles } from "../../lib/files.js";
import { L, tl } from "../../lib/i18n.js";
import { useAction, useStore } from "../../lib/store.jsx";
import { AmountInput, BusinessPicker, Card, Chips, Confirm, Empty, Field, Pill, ReasonModal, Select, Text, fmtDateTime } from "../../ui/components.jsx";

const STAFF_ROLES = ["officer", "dataAdmin", "systemAdmin", "super", "reports"];

export function Users() {
  const { state, user } = useStore();
  const act = useAction();
  const [f, setF] = useState({ role: "officer", name: "", login: "", password: "", orgName: "" });
  const [modal, setModal] = useState(null);
  const [role, setRole] = useState("");
  const staff = state.users.filter((u) => STAFF_ROLES.includes(u.role) || ["fi", "supplier"].includes(u.role));
  const ok = f.name.trim() && /@/.test(f.login) && f.password.length >= 6 && !state.users.some((u) => u.login === f.login.trim().toLowerCase());
  return (
    <div className="stack">
      <Card title={L("Add a user", "Ongeza mtumiaji")}>
        <div className="form two">
          <Field label={L("Role", "Jukumu")}><Select value={f.role} onChange={(v) => setF({ ...f, role: v })} options={STAFF_ROLES.map((r) => ({ value: r, label: tl(ROLE_NAMES[r]) }))} /></Field>
          <Field label={L("Name", "Jina")}><Text value={f.name} onChange={(v) => setF({ ...f, name: v })} /></Field>
          <Field label={L("Sign-in email", "Barua pepe ya kuingia")}><Text value={f.login} onChange={(v) => setF({ ...f, login: v })} /></Field>
          <Field label={L("Password (6+)", "Nenosiri (6+)")} hint={L("Test version only.", "Toleo la majaribio tu.")}><input className="input" type="password" value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} /></Field>
          {f.role === "reports" && <Field label={L("Organisation (e.g. Bank of Tanzania, an NGO)", "Taasisi (k.m. Benki Kuu, NGO)")}><Text value={f.orgName} onChange={(v) => setF({ ...f, orgName: v })} /></Field>}
        </div>
        <button className="btn primary mt" disabled={!ok} onClick={() => { act((d) => { const id = uid("U"); d.users.push({ id, role: f.role, name: f.name.trim(), login: f.login.trim().toLowerCase(), password: f.password, orgName: f.orgName.trim() || undefined, active: true }); audit(d, user, "User added", id, { after: { role: f.role, name: f.name } }); }, L("User added", "Mtumiaji ameongezwa")); setF({ role: "officer", name: "", login: "", password: "", orgName: "" }); }}>{L("Add user", "Ongeza")}</button>
      </Card>
      <Card title={L("Users", "Watumiaji")}>
        <div className="table-wrap"><table className="t"><thead><tr><th>{L("Name", "Jina")}</th><th>{L("Role", "Jukumu")}</th><th>{L("Sign-in", "Kuingia")}</th><th>{L("Status", "Hali")}</th><th /></tr></thead><tbody>
          {staff.map((u) => (
            <tr key={u.id}>
              <td>{u.name}{u.test && <Pill tone="grey">test</Pill>}</td><td>{tl(ROLE_NAMES[u.role])}</td><td className="small">{u.login}<div className="tiny muted">{u.lastSignIn ? fmtDateTime(u.lastSignIn) : ""}</div></td>
              <td>{u.active === false ? <Pill tone="red">{L("Inactive", "Imezimwa")}</Pill> : <Pill tone="green">{L("Active", "Hai")}</Pill>}</td>
              <td className="nowrap">{u.id !== user.id && STAFF_ROLES.includes(u.role) && <button className="btn small" onClick={() => { setRole(u.role); setModal({ type: "role", u }); }}>{L("Role", "Jukumu")}</button>} {u.id !== user.id && <button className="btn small" onClick={() => setModal({ type: "active", u })}>{u.active === false ? L("Activate", "Washa") : L("Deactivate", "Zima")}</button>}</td>
            </tr>
          ))}
        </tbody></table></div>
      </Card>
      {modal?.type === "role" && (
        <ReasonModal title={`${L("Change role", "Badilisha jukumu")}: ${modal.u.name}`} onClose={() => setModal(null)} onSubmit={(reason) => act((d) => { const u = d.users.find((x) => x.id === modal.u.id); const before = u.role; u.role = role; audit(d, user, "User role changed", u.id, { before, after: role, reason }); }, L("Saved", "Imehifadhiwa"))}>
          <Field label={L("Role", "Jukumu")}><Select value={role} onChange={setRole} options={STAFF_ROLES.map((r) => ({ value: r, label: tl(ROLE_NAMES[r]) }))} /></Field>
        </ReasonModal>
      )}
      {modal?.type === "active" && <ReasonModal title={modal.u.active === false ? L("Activate user", "Washa mtumiaji") : L("Deactivate user", "Zima mtumiaji")} danger={modal.u.active !== false} onClose={() => setModal(null)} onSubmit={(reason) => act((d) => { const u = d.users.find((x) => x.id === modal.u.id); u.active = u.active === false; audit(d, user, u.active ? "User activated" : "User deactivated", u.id, { reason }); }, L("Saved", "Imehifadhiwa"))} />}
    </div>
  );
}

export function AdminPackages() {
  const { state, user } = useStore();
  const act = useAction();
  const [pk, setPk] = useState(() => structuredClone(state.packages));
  const [reason, setReason] = useState("");
  const [tierFor, setTierFor] = useState(null);
  const [tier, setTier] = useState("");
  const counts = sponsorCounts(state);
  const save = () => act((d) => { const before = d.packages; for (const p of pk.fi) p.annual = annualFromMonthly(p.monthly); d.packages = pk; audit(d, user, "Packages and prices changed", "packages", { before, after: pk, reason }); }, L("Prices saved", "Bei zimehifadhiwa"));
  const setBiz = (i, k, v) => setPk({ ...pk, business: pk.business.map((p, j) => (j === i ? { ...p, [k]: v } : p)) });
  const setFi = (i, k, v) => setPk({ ...pk, fi: pk.fi.map((p, j) => (j === i ? { ...p, [k]: v } : p)) });
  return (
    <div className="stack">
      <Card title={L("Business packages", "Vifurushi vya biashara")}>
        <p className="small muted mb">{L("Seen only by businesses. Recording is always free on Basic.", "Vinaonekana na biashara tu. Kuandika ni bure daima kwenye Msingi.")}</p>
        {pk.business.map((p, i) => (
          <div key={p.id} className="form two mb">
            <Field label={`${tl(p)} · ${L("price (TZS)", "bei (TZS)")}`}><AmountInput value={p.price} onChange={(v) => setBiz(i, "price", Number(v) || 0)} disabled={p.id === "basic"} /></Field>
            <Field label={L("Features (one per line, English | Kiswahili)", "Huduma (moja kwa mstari, Kiingereza | Kiswahili)")}><textarea className="input" rows={2} value={p.featuresEn.map((x, k) => `${x} | ${p.featuresSw[k] || ""}`).join("\n")} onChange={(e) => { const rows = e.target.value.split("\n"); setPk({ ...pk, business: pk.business.map((q, j) => (j === i ? { ...q, featuresEn: rows.map((r) => r.split("|")[0].trim()), featuresSw: rows.map((r) => (r.split("|")[1] || "").trim()) } : q)) }); }} /></Field>
          </div>
        ))}
      </Card>
      <Card title={L("Lender packages", "Vifurushi vya wakopeshaji")}>
        <div className="table-wrap"><table className="t"><thead><tr><th>{L("Package", "Kifurushi")}</th><th>{L("Monthly", "Kwa mwezi")}</th><th className="num">{L("Annual (10% off)", "Kwa mwaka (punguzo 10%)")}</th><th>{L("Per assessment", "Kwa tathmini")}</th></tr></thead><tbody>
          {pk.fi.map((p, i) => <tr key={p.id}><td>{tl(p)}</td><td><AmountInput value={p.monthly} onChange={(v) => setFi(i, "monthly", Number(v) || 0)} /></td><td className="num">{money(annualFromMonthly(p.monthly))}</td><td><AmountInput value={p.perAssessment} onChange={(v) => setFi(i, "perAssessment", Number(v) || 0)} /></td></tr>)}
        </tbody></table></div>
        <p className="small muted mt">{L("Assessments are unlimited; each one is charged at the package rate.", "Tathmini hazina kikomo; kila moja inalipiwa kwa kiwango cha kifurushi.")}</p>
      </Card>
      <Card title={L("Pilot sponsorship tiers", "Ngazi za udhamini wa majaribio")}>
        <div className="table-wrap"><table className="t"><thead><tr><th>{L("Tier", "Ngazi")}</th><th className="num">{L("Contribution", "Mchango")}</th><th className="num">{L("Year 1", "Mwaka 1")}</th><th className="num">{L("Years 2–3", "Miaka 2–3")}</th><th className="num">{L("Used / max", "Imetumika / juu")}</th></tr></thead><tbody>
          {pk.sponsorTiers.map((t) => <tr key={t.id}><td>{tl(t)}</td><td className="num">{money(t.contribution)}</td><td className="num">{t.year1}%</td><td className="num">{t.years23}%</td><td className="num">{t.id === "standard" ? "—" : `${counts[t.id]} / ${t.max}`}</td></tr>)}
        </tbody></table></div>
        <p className="small muted mt">{L("Discounts apply to subscription and assessment fees; standard pricing from year 4; no ownership or exclusive rights.", "Punguzo linahusu ada za usajili na tathmini; bei ya kawaida kuanzia mwaka 4; hakuna umiliki wala haki za kipekee.")}</p>
        <div className="list mt">
          {state.fis.filter((f) => f.status === "approved").map((f) => (
            <div key={f.id} className="item"><div className="grow"><b>{f.name}</b><div className="small muted">{tl(state.packages.fi.find((p) => p.id === f.packageId))} · {f.billing}</div></div><Pill>{tl(state.packages.sponsorTiers.find((t) => t.id === (f.sponsorTier || "standard")))}</Pill><button className="btn small" onClick={() => { setTier(f.sponsorTier || "standard"); setTierFor(f); }}>{L("Change tier", "Badilisha ngazi")}</button></div>
          ))}
        </div>
      </Card>
      <Card>
        <Field label={L("Reason for the price change", "Sababu ya mabadiliko ya bei")}><Text value={reason} onChange={setReason} /></Field>
        <button className="btn primary mt" disabled={reason.trim().length < 5} onClick={save}>{L("Save prices", "Hifadhi bei")}</button>
      </Card>
      {tierFor && (
        <ReasonModal title={`${L("Sponsorship tier", "Ngazi ya udhamini")}: ${tierFor.name}`} onClose={() => setTierFor(null)} onSubmit={(r) => { if (!canAssignTier(state, tierFor, tier)) { act(() => { throw new Error(L("That tier is full.", "Ngazi hiyo imejaa.")); }); return false; } return act((d) => { const f = d.fis.find((x) => x.id === tierFor.id); const before = f.sponsorTier; f.sponsorTier = tier; audit(d, user, "Sponsorship tier changed", f.id, { before, after: tier, reason: r }); }, L("Saved", "Imehifadhiwa")); }}>
          <Field label={L("Tier", "Ngazi")}><Chips value={tier} onChange={setTier} options={state.packages.sponsorTiers.map((t) => ({ value: t.id, label: `${tl(t)}${t.id !== "standard" ? ` (${counts[t.id]}/${t.max})` : ""}` }))} /></Field>
        </ReasonModal>
      )}
    </div>
  );
}

const SETTING_FIELDS = [
  ["closeToleranceAbs", "Daily close tolerance (TZS)", "Kiwango cha kuvumilia tofauti (TZS)"], ["closeTolerancePct", "Daily close tolerance (% of balance)", "Kiwango cha kuvumilia (% ya salio)"],
  ["differenceFlagLevel", "Flag differences to officer from (TZS)", "Ripoti tofauti kwa afisa kuanzia (TZS)"], ["duplicateWindowMin", "Duplicate time window (minutes)", "Muda wa kurudia (dakika)"],
  ["unusualFactor", "Unusual amount: times the usual", "Kiasi kisicho cha kawaida: mara ya kawaida"], ["unusualFloor", "Unusual amount: at least (TZS)", "Kiasi kisicho cha kawaida: angalau (TZS)"],
  ["disputeDays", "Rating dispute window (days)", "Muda wa kupinga kiwango (siku)"], ["ratingOverdueDays", "Rating overdue after (days)", "Kiwango kimechelewa baada ya (siku)"],
  ["firstCheckDays", "First check after joining (days)", "Ukaguzi wa kwanza baada ya kujiunga (siku)"], ["recheckRate", "Share of checks re-checked (0–1)", "Sehemu ya ukaguzi upya (0–1)"],
  ["recheckGapFlag", "Re-check gap flagged above (points)", "Tofauti ya ukaguzi upya inayoripotiwa (alama)"], ["visitDistanceFlagM", "Visit distance flagged above (metres)", "Umbali wa ziara unaoripotiwa (mita)"],
  ["minGroupSize", "Minimum group size in reports", "Ukubwa wa chini wa kundi kwenye ripoti"], ["activeMinDays", "Active = days with entries in last 30", "Hai = siku zenye miamala katika 30"],
  ["youthMaxAge", "Youth: age up to", "Vijana: umri hadi"], ["qualifyScore", "Qualifying credit score", "Alama ya kufuzu mkopo"], ["cashBuffer", "Cash buffer (0–1)", "Akiba ya pesa (0–1)"], ["quarterlyDays", "Quarterly questions every (days)", "Maswali ya robo mwaka kila (siku)"]
];

export function Settings() {
  const { state, user } = useStore();
  const act = useAction();
  const [s, setS] = useState(() => structuredClone(state.settings));
  const num = (k, v) => setS({ ...s, [k]: v === "" ? "" : Number(v) });
  const save = () => act((d) => { const before = d.settings; d.settings = { ...s }; audit(d, user, "Settings changed", "settings", { before, after: s }); }, L("Settings saved", "Mipangilio imehifadhiwa"));
  return (
    <div className="stack">
      <Card title={L("Rules", "Kanuni")}>
        <div className="form two">
          {SETTING_FIELDS.map(([k, en, sw]) => <Field key={k} label={L(en, sw)}><input className="input" inputMode="decimal" value={s[k] ?? ""} onChange={(e) => num(k, e.target.value.replace(/[^\d.]/g, ""))} /></Field>)}
        </div>
      </Card>
      <Card title={L("Records Rating frequency per band (months)", "Marudio ya ukaguzi kwa kiwango (miezi)")}>
        <div className="form two">{["excellent", "good", "okay", "poor"].map((k) => <Field key={k} label={k}><input className="input" inputMode="numeric" value={s.ratingFrequency[k]} onChange={(e) => setS({ ...s, ratingFrequency: { ...s.ratingFrequency, [k]: Number(e.target.value.replace(/\D/g, "")) || 1 } })} /></Field>)}</div>
      </Card>
      <Card title={L("Credit score weights", "Uzito wa alama ya mkopo")}>
        <div className="form two">{Object.keys(DEFAULT_SETTINGS.scoreWeights).map((k) => <Field key={k} label={k}><input className="input" inputMode="numeric" value={s.scoreWeights[k]} onChange={(e) => setS({ ...s, scoreWeights: { ...s.scoreWeights, [k]: Number(e.target.value.replace(/\D/g, "")) || 0 } })} /></Field>)}</div>
        <p className="small muted mt">{L("Total", "Jumla")}: {Object.values(s.scoreWeights).reduce((a, b) => a + b, 0)}</p>
      </Card>
      <Card title={L("Support contacts", "Mawasiliano ya msaada")}>
        <div className="form two">
          <Field label="WhatsApp"><Text value={s.support.whatsapp} onChange={(v) => setS({ ...s, support: { ...s.support, whatsapp: v } })} /></Field>
          <Field label={L("Phone", "Simu")}><Text value={s.support.phone} onChange={(v) => setS({ ...s, support: { ...s.support, phone: v } })} /></Field>
          <Field label={L("Hours", "Saa")}><Text value={s.support.hours} onChange={(v) => setS({ ...s, support: { ...s.support, hours: v } })} /></Field>
        </div>
      </Card>
      <button className="btn primary" onClick={save}>{L("Save settings", "Hifadhi mipangilio")}</button>
      <TestTools />
    </div>
  );
}

function TestTools() {
  const { state, user, resetAll, signOut } = useStore();
  const act = useAction();
  const [bid, setBid] = useState("");
  const [days, setDays] = useState("95");
  const [share, setShare] = useState("0.9");
  const [confirm, setConfirm] = useState(false);
  return (
    <Card title={L("Test tools (web MVP only)", "Zana za majaribio (toleo la wavuti tu)")}>
      <p className="small muted mb">{L("Fill a business with sample past activity and daily closes, so ratings, scores and reports can be tested without waiting weeks. Replaces that business's earlier entries and closes.", "Jaza biashara kwa shughuli za mfano za nyuma na kufunga siku, ili viwango, alama na ripoti vijaribiwe bila kusubiri wiki. Inabadilisha miamala na kufunga siku kwa biashara hiyo.")}</p>
      <div className="form two">
        <Field label={L("Business", "Biashara")}><BusinessPicker businesses={state.businesses} value={bid} onChange={setBid} /></Field>
        <Field label={L("Days of history", "Siku za historia")}><Text value={days} onChange={(v) => setDays(v.replace(/\D/g, ""))} inputMode="numeric" /></Field>
        <Field label={L("Share of days closed on time (0–1)", "Sehemu ya siku zilizofungwa kwa wakati (0–1)")}><Text value={share} onChange={(v) => setShare(v.replace(/[^\d.]/g, ""))} /></Field>
      </div>
      <button className="btn mt" disabled={!bid || !(Number(days) > 0)} onClick={() => act((d) => generateSampleActivity(d, user, bid, Number(days), Number(share)), L("Sample activity added", "Shughuli za mfano zimeongezwa"))}>{L("Generate sample activity", "Tengeneza shughuli za mfano")}</button>
      <hr style={{ border: 0, borderTop: "1px solid var(--line)", margin: "18px 0" }} />
      <button className="btn danger" onClick={() => setConfirm(true)}>{L("Reset all data", "Futa data yote")}</button>
      {confirm && <Confirm title={L("Reset all test data?", "Futa data yote ya majaribio?")} danger okLabel={L("Reset everything", "Futa kila kitu")} body={L("All businesses, entries, ratings, loans, messages and photos in this browser are removed. Test sign-in accounts and default settings come back. This cannot be undone.", "Biashara, miamala, viwango, mikopo, ujumbe na picha zote kwenye kivinjari hiki zinaondolewa. Akaunti za majaribio na mipangilio ya awali zinarudi. Haiwezi kurudishwa.")} onClose={() => setConfirm(false)} onOk={async () => { await clearFiles().catch(() => {}); resetAll(); signOut(); }} />}
    </Card>
  );
}

export function Fields() {
  const { state, user } = useStore();
  const act = useAction();
  const [f, setF] = useState({ en: "", sw: "", type: "text", options: "", required: false });
  const list = state.settings.customFields || [];
  return (
    <div className="stack">
      <Card title={L("Optional onboarding fields", "Sehemu za hiari za usajili")}>
        {!list.length && <Empty text={L("No extra fields yet.", "Bado hakuna sehemu za ziada.")} />}
        <div className="list">
          {list.map((x) => (
            <div key={x.id} className="item"><div className="grow"><b>{tl(x.label)}</b><div className="small muted">{x.type}{x.required ? ` · ${L("required", "lazima")}` : ""}{x.options?.length ? ` · ${x.options.join(", ")}` : ""}</div></div>
              <button className="icon-btn" aria-label={L("Remove", "Ondoa")} onClick={() => act((d) => { d.settings.customFields = d.settings.customFields.filter((y) => y.id !== x.id); audit(d, user, "Input field removed", x.id, { before: x }); })}><Trash2 size={18} /></button>
            </div>
          ))}
        </div>
      </Card>
      <Card title={L("Add a field", "Ongeza sehemu")}>
        <div className="form two">
          <Field label={L("Label in English", "Jina kwa Kiingereza")}><Text value={f.en} onChange={(v) => setF({ ...f, en: v })} /></Field>
          <Field label={L("Label in Kiswahili", "Jina kwa Kiswahili")}><Text value={f.sw} onChange={(v) => setF({ ...f, sw: v })} /></Field>
          <Field label={L("Type", "Aina")}><Chips value={f.type} onChange={(v) => setF({ ...f, type: v })} options={[{ value: "text", label: L("Text", "Maandishi") }, { value: "number", label: L("Number", "Namba") }, { value: "select", label: L("Choice", "Chaguo") }]} /></Field>
          {f.type === "select" && <Field label={L("Choices (comma separated)", "Machaguo (tenganisha kwa koma)")}><Text value={f.options} onChange={(v) => setF({ ...f, options: v })} /></Field>}
          <label className="check"><input type="checkbox" checked={f.required} onChange={(e) => setF({ ...f, required: e.target.checked })} />{L("Required", "Lazima")}</label>
        </div>
        <button className="btn primary mt" disabled={!f.en.trim() || !f.sw.trim()} onClick={() => { act((d) => { const x = { id: uid("FLD"), label: { en: f.en.trim(), sw: f.sw.trim() }, type: f.type, options: f.type === "select" ? f.options.split(",").map((o) => o.trim()).filter(Boolean) : [], required: f.required }; d.settings.customFields = [...(d.settings.customFields || []), x]; audit(d, user, "Input field added", x.id, { after: x }); }, L("Field added", "Sehemu imeongezwa")); setF({ en: "", sw: "", type: "text", options: "", required: false }); }}><Plus size={18} />{L("Add field", "Ongeza sehemu")}</button>
      </Card>
    </div>
  );
}

const TILES = [["k2", "2 Financial inclusion"], ["k3", "3 Credit readiness"], ["k4", "4 Financing gap"], ["k5", "5 Credit access"], ["k1", "1 Registered and active"], ["k6", "6 Portfolio quality"], ["k7", "7 Digital adoption"], ["k8", "8 Women and youth"], ["k9", "9 Productive assets"], ["k10", "10 Business growth"], ["extra", "Extra tiles"]];

export function ReportDesign() {
  const { state, user } = useStore();
  const act = useAction();
  const [tiles, setTiles] = useState(() => ({ ...state.settings.reportTiles }));
  const [min, setMin] = useState(String(state.settings.minGroupSize));
  return (
    <Card title={L("KPI dashboard design", "Muundo wa dashibodi ya viashiria")}>
      <p className="small muted mb">{L("Report users only ever see totals and shares for groups of businesses.", "Watumiaji wa ripoti wanaona jumla na sehemu za makundi ya biashara tu.")}</p>
      <div className="stack">{TILES.map(([k, label]) => <label key={k} className="check"><input type="checkbox" checked={tiles[k] !== false} onChange={(e) => setTiles({ ...tiles, [k]: e.target.checked })} />{label}</label>)}</div>
      <Field label={L("Minimum group size (smaller groups hidden)", "Ukubwa wa chini wa kundi (madogo yanafichwa)")} className="mt"><Text value={min} onChange={(v) => setMin(v.replace(/\D/g, ""))} inputMode="numeric" /></Field>
      <button className="btn primary mt" onClick={() => act((d) => { const before = { tiles: d.settings.reportTiles, min: d.settings.minGroupSize }; d.settings.reportTiles = tiles; d.settings.minGroupSize = Math.max(1, Number(min) || 1); audit(d, user, "Report design changed", "reports", { before, after: { tiles, min } }); }, L("Saved", "Imehifadhiwa"))}>{L("Save", "Hifadhi")}</button>
    </Card>
  );
}

export function Audit() {
  const { state } = useStore();
  const [q, setQ] = useState("");
  const list = state.audit.filter((a) => !q || JSON.stringify(a).toLowerCase().includes(q.toLowerCase())).slice(0, 300);
  const show = (v) => (v == null ? "" : typeof v === "object" ? JSON.stringify(v).slice(0, 300) : String(v));
  return (
    <Card title={L("Audit trail", "Kumbukumbu za mabadiliko")}>
      <input className="input mb" placeholder={L("Search", "Tafuta")} value={q} onChange={(e) => setQ(e.target.value)} />
      {!list.length && <Empty text={L("Nothing yet.", "Bado hakuna.")} />}
      <div className="table-wrap"><table className="t"><thead><tr><th>{L("When", "Lini")}</th><th>{L("Who", "Nani")}</th><th>{L("What", "Nini")}</th><th>{L("Before → after", "Kabla → baada")}</th><th>{L("Reason", "Sababu")}</th></tr></thead><tbody>
        {list.map((a) => (
          <tr key={a.id}><td className="nowrap small">{fmtDateTime(a.at)}</td><td className="small">{a.actor.name}<div className="tiny muted">{a.actor.role}</div></td><td className="small">{a.action}<div className="tiny muted">{a.target}</div></td><td className="tiny" style={{ maxWidth: 320, overflowWrap: "anywhere" }}>{show(a.before)}{a.before != null || a.after != null ? " → " : ""}{show(a.after)}</td><td className="small">{a.reason}</td></tr>
        ))}
      </tbody></table></div>
    </Card>
  );
}

