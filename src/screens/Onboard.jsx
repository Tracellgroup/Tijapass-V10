// Business onboarding (ONB-01 to ONB-07, ONB-10): used for self sign-up and by officers in the field (ONB-05).
import { MapPin, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { openingLines } from "../core/accounting.js";
import { BUSINESS_TYPES, REGIONS, SECTORS } from "../core/seed.js";
import { sum, uid } from "../core/util.js";
import { adminEditOpening, createBusiness, saveOpening } from "../lib/actions.js";
import { getLocation } from "../lib/files.js";
import { L, getLang, tl } from "../lib/i18n.js";
import { useAction, useStore } from "../lib/store.jsx";
import { AmountInput, Card, Chips, Field, Money, PhotoInput, Select, Steps, Text } from "../ui/components.jsx";

export const WALLETS = ["M-Pesa", "Mixx by Yas (Tigo Pesa)", "Airtel Money", "HaloPesa", "AzamPesa", "T-Pesa"];
export const validPhone = (p) => /^(\+?255|0)[67]\d{8}$/.test(String(p || "").replace(/\s/g, ""));
export const normPhone = (p) => {
  const s = String(p || "").replace(/\s/g, "");
  return s.startsWith("0") ? `+255${s.slice(1)}` : s.startsWith("255") ? `+${s}` : s;
};

const BASELINE = {
  bank: [["used", "Yes, used in the last 3 months", "Ndiyo, nimeitumia miezi 3 iliyopita"], ["notUsed", "Yes, but not used in 3 months", "Ndiyo, lakini sijaitumia miezi 3"], ["none", "No bank account", "Sina akaunti ya benki"]],
  mobile: [["personal", "Personal mobile money line", "Laini ya pesa ya simu binafsi"], ["business", "Business till or Lipa number", "Namba ya Lipa ya biashara"], ["none", "None", "Sina"]],
  borrowed: [["now", "Yes, I have a loan now", "Ndiyo, nina mkopo sasa"], ["past", "Yes, in the past", "Ndiyo, zamani"], ["never", "Never", "Sijawahi"]],
  sources: [["family", "Family and friends", "Familia na marafiki"], ["vicoba", "VICOBA or savings group", "VICOBA au kikundi cha akiba"], ["supplier", "Supplier credit", "Mkopo wa msambazaji"], ["app", "Loan app", "Programu ya mikopo"], ["moneylender", "Moneylender", "Mkopeshaji binafsi"], ["formal", "Bank, MFI or SACCO", "Benki, taasisi ndogo au SACCOS"], ["none", "None", "Hakuna"]]
};
const opts = (k) => BASELINE[k].map(([value, en, sw]) => ({ value, label: getLang() === "sw" ? sw : en }));

const emptyForm = () => ({
  ownerName: "", photoId: null, nida: "", idPhotoId: null, dob: "", gender: "", phone: "", phone2: "", email: "", homeAddress: "",
  businessName: "", businessType: "", sector: "", region: "", monthsOperating: "", staffTotal: "", staffWomen: "", staffPaid: "", gps: null, address: "", closingTime: "17:00", custom: {},
  wallets: [{ provider: "M-Pesa", number: "" }], banks: [],
  baseline: { bank: "", mobile: "", borrowed: "", sources: [], needFinance: "", needPurpose: "", needAmount: "" },
  pin: "", pin2: "", consent: false
});

export function BusinessWizard({ mode, onDone }) {
  const { state, user, lang } = useStore();
  const act = useAction();
  const [f, setF] = useState(emptyForm);
  const [step, setStep] = useState(0);
  const [gpsBusy, setGpsBusy] = useState(false);
  const set = (k, v) => setF((x) => ({ ...x, [k]: v }));
  const setB = (k, v) => setF((x) => ({ ...x, baseline: { ...x.baseline, [k]: v } }));
  const fields = state.settings.customFields || [];
  void lang;

  const phoneTaken = state.users.some((u) => u.role === "business" && u.login === normPhone(f.phone));
  const errors = [
    [f.ownerName.trim().length > 2 && validPhone(f.phone) && !phoneTaken && f.dob && f.gender && (!f.phone2 || validPhone(f.phone2)), L("Fill in name, a valid phone number (e.g. 0712 345 678), date of birth and gender.", "Jaza jina, namba sahihi ya simu (k.m. 0712 345 678), tarehe ya kuzaliwa na jinsia.")],
    [f.businessName.trim() && f.businessType && f.sector && f.region && f.closingTime && fields.filter((x) => x.required).every((x) => f.custom[x.id]), L("Fill in business name, type, sector, region and closing time.", "Jaza jina la biashara, aina, sekta, mkoa na muda wa kufunga.")],
    [f.wallets.every((w) => w.provider) && f.banks.every((b) => b.name), L("Each wallet needs a provider and each bank a name.", "Kila pochi inahitaji mtoa huduma na kila benki jina.")],
    [f.baseline.bank && f.baseline.mobile && f.baseline.borrowed && f.baseline.sources.length && f.baseline.needFinance && (f.baseline.needFinance === "no" || f.baseline.needAmount), L("Answer every question.", "Jibu kila swali.")],
    [/^\d{6}$/.test(f.pin) && f.pin === f.pin2 && f.consent, L("Choose a 6-digit PIN, repeat it, and give consent.", "Chagua PIN ya tarakimu 6, irudie, na toa ridhaa.")]
  ];
  const ok = Boolean(errors[step][0]);

  const captureGps = async () => {
    setGpsBusy(true);
    const g = await getLocation();
    setGpsBusy(false);
    if (g) set("gps", g);
  };

  const finish = () => {
    const id = uid("B");
    const userId = uid("U");
    const channels = [
      { id: uid("C"), type: "cash", name: L("Cash in hand", "Pesa taslimu") },
      ...f.wallets.map((w) => ({ id: uid("C"), type: "mobile", name: w.provider, number: w.number })),
      ...f.banks.map((b) => ({ id: uid("C"), type: "bank", name: b.name, number: b.number }))
    ];
    const profile = {
      ownerName: f.ownerName.trim(), photoId: f.photoId, nida: f.nida.trim(), idPhotoId: f.idPhotoId, dob: f.dob, gender: f.gender, phone: normPhone(f.phone), phone2: f.phone2 ? normPhone(f.phone2) : "", email: f.email.trim(), homeAddress: f.homeAddress.trim(),
      businessName: f.businessName.trim(), businessType: f.businessType, sector: f.sector, region: f.region, monthsOperating: Number(f.monthsOperating) || 0, staffTotal: Number(f.staffTotal) || 0, staffWomen: Number(f.staffWomen) || 0, staffPaid: Number(f.staffPaid) || 0,
      gps: f.gps, address: f.address.trim(), custom: f.custom
    };
    const baseline = { ...f.baseline, needAmount: Number(f.baseline.needAmount) || 0 };
    const done = act((d) => createBusiness(d, user || { id: "self", name: profile.ownerName, role: "business" }, { id, userId, profile, channels, baseline, closingTime: f.closingTime, pin: f.pin, officerId: mode === "officer" ? user.id : null, lang: getLang() }), L("Business registered", "Biashara imesajiliwa"));
    if (done) onDone({ businessId: id, userId });
  };

  const titles = [L("Owner", "Mmiliki"), L("Business", "Biashara"), L("Money channels", "Njia za pesa"), L("A few questions", "Maswali machache"), L("PIN and consent", "PIN na ridhaa")];
  return (
    <Card title={`${step + 1}. ${titles[step]}`}>
      <Steps count={5} at={step} />
      {step === 0 && (
        <div className="form two">
          <Field label={L("Full name *", "Jina kamili *")}><Text value={f.ownerName} onChange={(v) => set("ownerName", v)} autoComplete="name" /></Field>
          <Field label={L("Main phone *", "Simu kuu *")} hint={phoneTaken ? L("This number is already registered.", "Namba hii tayari imesajiliwa.") : L("Used to sign in", "Inatumika kuingia")}><Text value={f.phone} onChange={(v) => set("phone", v)} inputMode="tel" placeholder="0712 345 678" /></Field>
          <Field label={L("Date of birth *", "Tarehe ya kuzaliwa *")}><input type="date" className="input" value={f.dob} onChange={(e) => set("dob", e.target.value)} /></Field>
          <Field label={L("Gender *", "Jinsia *")}><Chips value={f.gender} onChange={(v) => set("gender", v)} options={[{ value: "female", label: L("Female", "Mwanamke") }, { value: "male", label: L("Male", "Mwanaume") }]} /></Field>
          <Field label={L("NIDA number", "Namba ya NIDA")} hint={L("Needed before a loan", "Inahitajika kabla ya mkopo")}><Text value={f.nida} onChange={(v) => set("nida", v)} inputMode="numeric" /></Field>
          <Field label={L("Second phone (optional)", "Simu ya pili (si lazima)")}><Text value={f.phone2} onChange={(v) => set("phone2", v)} inputMode="tel" /></Field>
          <Field label={L("Email (optional)", "Barua pepe (si lazima)")}><Text value={f.email} onChange={(v) => set("email", v)} inputMode="email" /></Field>
          <Field label={L("Home address", "Anwani ya nyumbani")}><Text value={f.homeAddress} onChange={(v) => set("homeAddress", v)} /></Field>
          <PhotoInput label={L("Owner photo", "Picha ya mmiliki")} value={f.photoId} onChange={(v) => set("photoId", v)} />
          <PhotoInput label={L("ID photo (NIDA card)", "Picha ya kitambulisho (NIDA)")} value={f.idPhotoId} onChange={(v) => set("idPhotoId", v)} />
        </div>
      )}
      {step === 1 && (
        <div className="form two">
          <Field label={L("Business name *", "Jina la biashara *")}><Text value={f.businessName} onChange={(v) => set("businessName", v)} /></Field>
          <Field label={L("Business type *", "Aina ya biashara *")}><Select value={f.businessType} onChange={(v) => set("businessType", v)} placeholder={L("Choose", "Chagua")} options={BUSINESS_TYPES.map((t) => ({ value: t.id, label: tl(t) }))} /></Field>
          <Field label={L("Sector *", "Sekta *")}><Select value={f.sector} onChange={(v) => set("sector", v)} placeholder={L("Choose", "Chagua")} options={SECTORS.map((t) => ({ value: t.id, label: tl(t) }))} /></Field>
          <Field label={L("Region *", "Mkoa *")}><Select value={f.region} onChange={(v) => set("region", v)} placeholder={L("Choose", "Chagua")} options={REGIONS.map((r) => ({ value: r, label: r }))} /></Field>
          <Field label={L("Months operating", "Miezi ya biashara")}><Text value={f.monthsOperating} onChange={(v) => set("monthsOperating", v.replace(/\D/g, ""))} inputMode="numeric" /></Field>
          <Field label={L("Usual closing time *", "Muda wa kawaida wa kufunga *")} hint={L("The daily close prompt comes at this time", "Ukumbusho wa kufunga siku unakuja muda huu")}><input type="time" className="input" value={f.closingTime} onChange={(e) => set("closingTime", e.target.value)} /></Field>
          <Field label={L("Staff in total", "Wafanyakazi wote")}><Text value={f.staffTotal} onChange={(v) => set("staffTotal", v.replace(/\D/g, ""))} inputMode="numeric" /></Field>
          <div className="form two">
            <Field label={L("Of whom women", "Kati yao wanawake")}><Text value={f.staffWomen} onChange={(v) => set("staffWomen", v.replace(/\D/g, ""))} inputMode="numeric" /></Field>
            <Field label={L("Of whom paid", "Kati yao wanaolipwa")}><Text value={f.staffPaid} onChange={(v) => set("staffPaid", v.replace(/\D/g, ""))} inputMode="numeric" /></Field>
          </div>
          <Field label={L("Written address or landmark", "Anwani au alama ya eneo")}><Text value={f.address} onChange={(v) => set("address", v)} /></Field>
          <div className="field">
            <span>{L("Location (GPS)", "Mahali (GPS)")}</span>
            <button type="button" className="btn" onClick={captureGps} disabled={gpsBusy}><MapPin size={18} />{gpsBusy ? L("Finding location…", "Inatafuta mahali…") : f.gps ? L("Update location", "Sasisha mahali") : L("Capture location", "Chukua mahali")}</button>
            <small>{f.gps ? `${f.gps.lat.toFixed(5)}, ${f.gps.lng.toFixed(5)} (±${f.gps.accuracy} m)` : L("Allow location when the phone asks.", "Ruhusu mahali simu inapouliza.")}</small>
          </div>
          {fields.map((x) => (
            <Field key={x.id} label={`${tl(x.label)}${x.required ? " *" : ""}`}>
              {x.type === "select"
                ? <Select value={f.custom[x.id]} onChange={(v) => set("custom", { ...f.custom, [x.id]: v })} placeholder={L("Choose", "Chagua")} options={(x.options || []).map((o) => ({ value: o, label: o }))} />
                : <Text value={f.custom[x.id]} onChange={(v) => set("custom", { ...f.custom, [x.id]: v })} inputMode={x.type === "number" ? "numeric" : undefined} />}
            </Field>
          ))}
        </div>
      )}
      {step === 2 && (
        <div className="stack">
          <p className="muted">{L("Cash in hand is always included. Add every mobile money wallet and bank account the business uses.", "Pesa taslimu ipo daima. Ongeza kila pochi ya pesa ya simu na akaunti ya benki ambayo biashara inatumia.")}</p>
          <h3>{L("Mobile money", "Pesa ya simu")}</h3>
          {f.wallets.map((w, i) => (
            <div className="row" key={`w${i}`}>
              <div style={{ flex: "1 1 160px" }}><Select value={w.provider} onChange={(v) => set("wallets", f.wallets.map((x, j) => (j === i ? { ...x, provider: v } : x)))} options={WALLETS.map((p) => ({ value: p, label: p }))} /></div>
              <div style={{ flex: "1 1 140px" }}><Text value={w.number} onChange={(v) => set("wallets", f.wallets.map((x, j) => (j === i ? { ...x, number: v } : x)))} placeholder={L("Number (optional)", "Namba (si lazima)")} inputMode="tel" /></div>
              <button className="icon-btn" onClick={() => set("wallets", f.wallets.filter((_, j) => j !== i))} aria-label={L("Remove", "Ondoa")}><Trash2 size={18} /></button>
            </div>
          ))}
          <button className="btn" onClick={() => set("wallets", [...f.wallets, { provider: "Airtel Money", number: "" }])}><Plus size={18} />{L("Add wallet", "Ongeza pochi")}</button>
          <h3 className="mt">{L("Bank accounts", "Akaunti za benki")}</h3>
          {f.banks.map((b, i) => (
            <div className="row" key={`b${i}`}>
              <div style={{ flex: "1 1 160px" }}><Text value={b.name} onChange={(v) => set("banks", f.banks.map((x, j) => (j === i ? { ...x, name: v } : x)))} placeholder={L("Bank name", "Jina la benki")} /></div>
              <div style={{ flex: "1 1 140px" }}><Text value={b.number} onChange={(v) => set("banks", f.banks.map((x, j) => (j === i ? { ...x, number: v } : x)))} placeholder={L("Last 4 digits (optional)", "Tarakimu 4 za mwisho")} inputMode="numeric" /></div>
              <button className="icon-btn" onClick={() => set("banks", f.banks.filter((_, j) => j !== i))} aria-label={L("Remove", "Ondoa")}><Trash2 size={18} /></button>
            </div>
          ))}
          <button className="btn" onClick={() => set("banks", [...f.banks, { name: "", number: "" }])}><Plus size={18} />{L("Add bank account", "Ongeza akaunti ya benki")}</button>
        </div>
      )}
      {step === 3 && (
        <div className="stack">
          <p className="notice">{L("Asked once to understand how TijaPass helps. Your answers are kept as they are and are not changed later.", "Yanaulizwa mara moja kuelewa jinsi TijaPass inavyosaidia. Majibu yako yanahifadhiwa kama yalivyo.")}</p>
          <Field label={L("Do you have a bank account?", "Una akaunti ya benki?")}><Chips value={f.baseline.bank} onChange={(v) => setB("bank", v)} options={opts("bank")} /></Field>
          <Field label={L("Which mobile money do you use?", "Unatumia pesa ya simu ipi?")}><Chips value={f.baseline.mobile} onChange={(v) => setB("mobile", v)} options={opts("mobile")} /></Field>
          <Field label={L("Have you ever borrowed from a bank, MFI or SACCO?", "Umewahi kukopa benki, taasisi ndogo ya fedha au SACCOS?")}><Chips value={f.baseline.borrowed} onChange={(v) => setB("borrowed", v)} options={opts("borrowed")} /></Field>
          <Field label={L("Where do you usually get credit? (choose all)", "Kwa kawaida unapata mkopo wapi? (chagua zote)")}><Chips multi value={f.baseline.sources} onChange={(v) => setB("sources", v)} options={opts("sources")} /></Field>
          <Field label={L("Will you need finance in the next 6 months?", "Utahitaji mkopo ndani ya miezi 6 ijayo?")}><Chips value={f.baseline.needFinance} onChange={(v) => setB("needFinance", v)} options={[{ value: "no", label: L("No", "Hapana") }, { value: "yes", label: L("Yes", "Ndiyo") }]} /></Field>
          {f.baseline.needFinance === "yes" && (
            <div className="form two">
              <Field label={L("For what?", "Kwa ajili ya nini?")}><Text value={f.baseline.needPurpose} onChange={(v) => setB("needPurpose", v)} /></Field>
              <Field label={L("Rough amount (TZS)", "Kiasi cha makadirio (TZS)")}><AmountInput value={f.baseline.needAmount} onChange={(v) => setB("needAmount", v)} /></Field>
            </div>
          )}
        </div>
      )}
      {step === 4 && (
        <div className="form">
          <div className="form two">
            <Field label={L("Choose a 6-digit PIN *", "Chagua PIN ya tarakimu 6 *")}><input className="input" type="password" inputMode="numeric" maxLength={6} value={f.pin} onChange={(e) => set("pin", e.target.value.replace(/\D/g, ""))} /></Field>
            <Field label={L("Repeat the PIN *", "Rudia PIN *")}><input className="input" type="password" inputMode="numeric" maxLength={6} value={f.pin2} onChange={(e) => set("pin2", e.target.value.replace(/\D/g, ""))} /></Field>
          </div>
          <p className="tiny muted">{L("Test version: use a made-up PIN, never a real one.", "Toleo la majaribio: tumia PIN ya kubuni, si halisi.")}</p>
          <div className="notice">
            <b>{L("Consent", "Ridhaa")}</b>
            {L("TijaPass keeps this business's records, statements, credit passport and Records Rating, and its officer visits with photos and location. Lenders see them only after you give each lender consent, which you can withdraw at any time.", "TijaPass inahifadhi kumbukumbu, taarifa za fedha, pasipoti ya mkopo na Kiwango cha Kumbukumbu cha biashara hii, na ziara za afisa kwa picha na mahali. Wakopeshaji wanaziona tu baada ya wewe kumpa kila mmoja ridhaa, unayoweza kuiondoa wakati wowote.")}
          </div>
          <label className="check"><input type="checkbox" checked={f.consent} onChange={(e) => set("consent", e.target.checked)} />{L("I agree", "Nakubali")}</label>
        </div>
      )}
      {!ok && <p className="small amber mt">{errors[step][1]}</p>}
      <div className="between mt2">
        <button className="btn" onClick={() => setStep(step - 1)} disabled={step === 0}>{L("Back", "Rudi")}</button>
        {step < 4 ? <button className="btn primary" disabled={!ok} onClick={() => setStep(step + 1)}>{L("Next", "Endelea")}</button> : <button className="btn primary" disabled={!ok} onClick={finish}>{L("Register business", "Sajili biashara")}</button>}
      </div>
    </Card>
  );
}

// Opening balance sheet in plain words (ONB-07). Equity is calculated, never typed.
export const OPENING_FIELDS = [
  ["inventory", "Stock (value of goods for sale)", "Bidhaa za kuuza (thamani)"],
  ["receivables", "Money customers owe you", "Pesa wateja wanazokudai"],
  ["equipment", "Equipment and other business assets", "Vifaa na mali nyingine za biashara"],
  ["groupSavings", "Savings in mchezo, upatu or VICOBA", "Akiba kwenye mchezo, upatu au VICOBA"],
  ["payables", "Money you owe suppliers", "Pesa unazodaiwa na wasambazaji"],
  ["loansShort", "Loans due within 12 months", "Mikopo ya kulipa ndani ya miezi 12"],
  ["loansLong", "Longer loans", "Mikopo ya muda mrefu"],
  ["groupLoans", "Group loans (VICOBA)", "Mikopo ya kikundi (VICOBA)"]
];

export function OpeningForm({ business, mode = "business", onSaved }) {
  const { user } = useStore();
  const act = useAction();
  const [v, setV] = useState(() => structuredClone(business.opening?.values || { channels: {} }));
  const setCh = (id, n) => setV((x) => ({ ...x, channels: { ...x.channels, [id]: n } }));
  const preview = { ...business, opening: { values: v } };
  const lines = openingLines(preview);
  const assets = sum(lines.filter((l) => l.acc !== "openingEquity"), (l) => l.dr);
  const liabs = sum(lines.filter((l) => l.acc !== "openingEquity"), (l) => l.cr);
  const save = (submit) => act((d) => saveOpening(d, user, business.id, v, submit), submit ? L("Sent to Data Admin for approval", "Imetumwa kwa Msimamizi wa Data kuidhinishwa") : L("Saved", "Imehifadhiwa")) && onSaved?.();
  return (
    <div className="stack">
      <p className="muted">{L("What the business had and owed on its first day with TijaPass. After Data Admin approves, these figures are locked.", "Biashara ilikuwa na nini na ilidaiwa nini siku yake ya kwanza na TijaPass. Baada ya Msimamizi wa Data kuidhinisha, takwimu hizi zinafungwa.")}</p>
      <div className="form two">
        {business.channels.map((c) => (
          <Field key={c.id} label={c.type === "cash" ? L("Cash in hand", "Pesa taslimu mkononi") : `${c.name} ${L("balance", "salio")}`}><AmountInput value={v.channels?.[c.id] ?? ""} onChange={(n) => setCh(c.id, n)} /></Field>
        ))}
        {OPENING_FIELDS.map(([k, en, sw]) => (
          <Field key={k} label={getLang() === "sw" ? sw : en}><AmountInput value={v[k] ?? ""} onChange={(n) => setV((x) => ({ ...x, [k]: n }))} /></Field>
        ))}
      </div>
      <div className="kv card" style={{ boxShadow: "none" }}>
        <span>{L("Everything the business has", "Vyote biashara inavyomiliki")}</span><Money v={assets} />
        <span>{L("Everything the business owes", "Vyote biashara inavyodaiwa")}</span><Money v={liabs} />
        <span>{L("Owner's starting stake (calculated)", "Mtaji wa mmiliki wa kuanzia (umekokotolewa)")}</span><Money v={assets - liabs} />
      </div>
      {mode !== "admin" && (
        <div className="row">
          <button className="btn" onClick={() => save(false)}>{L("Save draft", "Hifadhi rasimu")}</button>
          <button className="btn primary" onClick={() => save(true)}>{L("Send for approval", "Tuma kwa idhini")}</button>
        </div>
      )}
      {mode === "admin" && <OpeningAdminSave business={business} values={v} onSaved={onSaved} />}
    </div>
  );
}

function OpeningAdminSave({ business, values, onSaved }) {
  const { user } = useStore();
  const act = useAction();
  const [reason, setReason] = useState("");
  return (
    <div className="form">
      <Field label={L("Reason for the change (required)", "Sababu ya mabadiliko (lazima)")}><Text value={reason} onChange={setReason} /></Field>
      <button className="btn primary" disabled={reason.trim().length < 5} onClick={() => act((d) => adminEditOpening(d, user, business.id, values, reason.trim()), L("Opening balances changed", "Salio la kuanzia limebadilishwa")) && onSaved?.()}>{L("Save change", "Hifadhi mabadiliko")}</button>
    </div>
  );
}
