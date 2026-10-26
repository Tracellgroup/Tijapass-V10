// Business profile (ONB-08 to ONB-10): details, contact changes through Admin, starting position, consent per lender.
import { MapPin } from "lucide-react";
import { useState } from "react";
import { balanceSheet } from "../../core/accounting.js";
import { BUSINESS_TYPES, SECTORS } from "../../core/seed.js";
import { uid } from "../../core/util.js";
import { requestChange, setConsent } from "../../lib/actions.js";
import { myBusiness } from "../../lib/access.js";
import { getLocation } from "../../lib/files.js";
import { L, tl } from "../../lib/i18n.js";
import { useAction, useStore } from "../../lib/store.jsx";
import { Card, Confirm, Field, Money, RatingBadge, StatusPill, StoredImage, Tabs, Text, fmtDate, fmtDateTime } from "../../ui/components.jsx";
import { OpeningForm, normPhone, validPhone } from "../Onboard.jsx";

export function ProfileDetails({ business }) {
  const p = business.profile;
  const sector = SECTORS.find((s) => s.id === p.sector);
  const type = BUSINESS_TYPES.find((s) => s.id === p.businessType);
  return (
    <div className="grid g2">
      <Card title={L("Owner", "Mmiliki")}>
        <div className="row mb">{p.photoId && <StoredImage id={p.photoId} />}{p.idPhotoId && <StoredImage id={p.idPhotoId} />}</div>
        <div className="kv">
          <span>{L("Name", "Jina")}</span><span>{p.ownerName}</span>
          <span>NIDA</span><span>{p.nida || "—"}</span>
          <span>{L("Date of birth", "Tarehe ya kuzaliwa")}</span><span>{fmtDate(p.dob)}</span>
          <span>{L("Gender", "Jinsia")}</span><span>{p.gender === "female" ? L("Female", "Mwanamke") : L("Male", "Mwanaume")}</span>
          <span>{L("Phone", "Simu")}</span><span>{p.phone}</span>
          <span>{L("Second phone", "Simu ya pili")}</span><span>{p.phone2 || "—"}</span>
          <span>{L("Email", "Barua pepe")}</span><span>{p.email || "—"}</span>
          <span>{L("Home address", "Anwani ya nyumbani")}</span><span>{p.homeAddress || "—"}</span>
        </div>
      </Card>
      <Card title={L("Business", "Biashara")}>
        <div className="kv">
          <span>{L("Name", "Jina")}</span><span>{p.businessName}</span>
          <span>{L("Type", "Aina")}</span><span>{tl(type)}</span>
          <span>{L("Sector", "Sekta")}</span><span>{tl(sector)}</span>
          <span>{L("Region", "Mkoa")}</span><span>{p.region}</span>
          <span>{L("Months operating", "Miezi ya biashara")}</span><span>{p.monthsOperating}</span>
          <span>{L("Staff (women, paid)", "Wafanyakazi (wanawake, wanaolipwa)")}</span><span>{p.staffTotal} ({p.staffWomen}, {p.staffPaid})</span>
          <span>{L("Address", "Anwani")}</span><span>{p.address || "—"}</span>
          <span>{L("Location", "Mahali")}</span><span>{p.gps ? <a href={`https://www.openstreetmap.org/?mlat=${p.gps.lat}&mlon=${p.gps.lng}#map=17/${p.gps.lat}/${p.gps.lng}`} target="_blank" rel="noreferrer">{L("Open map", "Fungua ramani")}</a> : "—"}</span>
          <span>{L("Closing time", "Muda wa kufunga")}</span><span>{business.closingTime}</span>
          <span>{L("Money channels", "Njia za pesa")}</span><span>{business.channels.map((c) => c.name).join(", ")}</span>
          <span>{L("Joined", "Alijiunga")}</span><span>{fmtDate(business.startDate)}</span>
        </div>
      </Card>
    </div>
  );
}

function ChangeContact({ business }) {
  const { state, user } = useStore();
  const act = useAction();
  const p = business.profile;
  const [f, setF] = useState({ phone: p.phone, phone2: p.phone2, email: p.email, address: p.address, gps: null });
  const pending = state.changeRequests.filter((c) => c.businessId === business.id && c.type === "profile");
  const changed = {};
  if (normPhone(f.phone) !== p.phone) changed.phone = normPhone(f.phone);
  if ((f.phone2 ? normPhone(f.phone2) : "") !== (p.phone2 || "")) changed.phone2 = f.phone2 ? normPhone(f.phone2) : "";
  if (f.email !== p.email) changed.email = f.email.trim();
  if (f.address !== p.address) changed.address = f.address.trim();
  if (f.gps) changed.gps = f.gps;
  const valid = validPhone(f.phone) && (!f.phone2 || validPhone(f.phone2)) && !(changed.phone && state.users.some((u) => u.role === "business" && u.login === changed.phone));
  return (
    <Card title={L("Change my contact details", "Badilisha mawasiliano yangu")}>
      <p className="small muted mb">{L("Changes take effect after TijaPass Admin approves them. Name, ID and date of birth can only be changed by Admin.", "Mabadiliko yanaanza kutumika baada ya TijaPass Admin kuidhinisha. Jina, kitambulisho na tarehe ya kuzaliwa vinabadilishwa na Msimamizi tu.")}</p>
      <div className="form two">
        <Field label={L("Main phone", "Simu kuu")}><Text value={f.phone} onChange={(v) => setF({ ...f, phone: v })} inputMode="tel" /></Field>
        <Field label={L("Second phone", "Simu ya pili")}><Text value={f.phone2} onChange={(v) => setF({ ...f, phone2: v })} inputMode="tel" /></Field>
        <Field label={L("Email", "Barua pepe")}><Text value={f.email} onChange={(v) => setF({ ...f, email: v })} /></Field>
        <Field label={L("Business address", "Anwani ya biashara")}><Text value={f.address} onChange={(v) => setF({ ...f, address: v })} /></Field>
        <div className="field"><span>{L("Business location", "Mahali pa biashara")}</span><button className="btn" onClick={async () => { const g = await getLocation(); if (g) setF({ ...f, gps: g }); }}><MapPin size={18} />{f.gps ? L("New location captured", "Mahali papya pamechukuliwa") : L("Capture new location", "Chukua mahali papya")}</button></div>
      </div>
      <button className="btn primary mt" disabled={!Object.keys(changed).length || !valid} onClick={() => act((d) => requestChange(d, user, { id: uid("CR"), businessId: business.id, type: "profile", fields: changed, note: `Contact change: ${Object.keys(changed).join(", ")}` }), L("Sent for approval", "Imetumwa kwa idhini"))}>{L("Send for approval", "Tuma kwa idhini")}</button>
      {pending.length > 0 && (
        <div className="list mt">
          {pending.slice(0, 6).map((c) => (
            <div className="item" key={c.id}><div className="grow"><b>{Object.keys(c.fields || {}).join(", ")}</b><div className="small muted">{fmtDateTime(c.at)}{c.reason ? ` · ${c.reason}` : ""}</div></div><StatusPill status={c.status} /></div>
          ))}
        </div>
      )}
    </Card>
  );
}

export function StartingPosition({ business }) {
  const { state } = useStore();
  const o = business.opening;
  if (o?.status === "approved") {
    const bs = balanceSheet(state, business.id, o.date);
    return (
      <Card title={L("Starting position (locked)", "Hali ya kuanzia (imefungwa)")}>
        <p className="small muted mb">{L("Approved by TijaPass Admin. Only Admin can change it, with a reason.", "Imeidhinishwa na TijaPass Admin. Msimamizi pekee anaweza kuibadilisha, kwa sababu.")} {fmtDate(o.date)}</p>
        <div className="kv">
          <span>{L("Everything the business had", "Vyote biashara ilivyokuwa navyo")}</span><Money v={bs.totalAssets} />
          <span>{L("Everything it owed", "Vyote ilivyodaiwa")}</span><Money v={bs.totalLiabilities} />
          <span>{L("Owner's starting stake", "Mtaji wa mmiliki wa kuanzia")}</span><Money v={bs.equity[0].amount} />
        </div>
      </Card>
    );
  }
  if (o?.status === "submitted") return <Card title={L("Starting position", "Hali ya kuanzia")}><p>{L("Sent to TijaPass Admin. You will be told when it is approved.", "Imetumwa kwa TijaPass Admin. Utajulishwa ikiidhinishwa.")}</p></Card>;
  return <Card title={L("Starting position", "Hali ya kuanzia")}>{o?.reason && <p className="notice warn mb">{L("Admin asked for changes", "Msimamizi ameomba marekebisho")}: {o.reason}</p>}<OpeningForm business={business} /></Card>;
}

function ConsentCard({ business }) {
  const { state, user } = useStore();
  const act = useAction();
  const [ask, setAsk] = useState(null);
  const fis = state.fis.filter((f) => f.status === "approved");
  return (
    <Card title={L("Who can see my records", "Nani anaweza kuona kumbukumbu zangu")}>
      <p className="small muted mb">{L("Consent given", "Ridhaa ilitolewa")}: {fmtDateTime(business.consent?.at)}. {L("Each lender sees your passport, rating and statements only if you allow it here.", "Kila mkopeshaji anaona pasipoti, kiwango na taarifa zako ukiruhusu hapa tu.")}</p>
      <div className="list">
        {fis.map((f) => {
          const on = business.consent?.fis?.[f.id]?.granted;
          return (
            <div key={f.id} className="item">
              <div className="grow"><b>{f.name}</b><div className="small muted">{on ? `${L("Allowed since", "Imeruhusiwa tangu")} ${fmtDate(business.consent.fis[f.id].at)}` : L("Not allowed", "Hairuhusiwi")}</div></div>
              <button className={`btn small ${on ? "danger" : ""}`} onClick={() => setAsk({ fi: f, grant: !on })}>{on ? L("Withdraw", "Ondoa") : L("Allow", "Ruhusu")}</button>
            </div>
          );
        })}
      </div>
      {ask && <Confirm title={ask.grant ? L("Allow this lender?", "Ruhusu mkopeshaji huyu?") : L("Withdraw consent?", "Ondoa ridhaa?")} body={ask.grant ? L(`${ask.fi.name} will see your credit passport, Records Rating and statements.`, `${ask.fi.name} ataona pasipoti yako, Kiwango cha Kumbukumbu na taarifa zako.`) : L(`${ask.fi.name} will lose access at once.`, `${ask.fi.name} atapoteza ruhusa mara moja.`)} danger={!ask.grant} onClose={() => setAsk(null)} onOk={() => act((d) => setConsent(d, user, business.id, ask.fi.id, ask.grant), L("Saved", "Imehifadhiwa"))} />}
    </Card>
  );
}

export default function Profile() {
  const { state, user, params } = useStore();
  const b = myBusiness(state, user);
  const [tab, setTab] = useState(params.tab || "details");
  const officer = state.users.find((u) => u.id === b.officerId);
  return (
    <div className="stack">
      <div className="between"><RatingBadge business={b} big /><span className="small muted">{L("Your officer", "Afisa wako")}: <b>{officer?.name || L("being assigned", "anapangwa")}</b></span></div>
      <Tabs value={tab} onChange={setTab} tabs={[{ value: "details", label: L("My details", "Taarifa zangu") }, { value: "opening", label: L("Starting position", "Hali ya kuanzia") }, { value: "consent", label: L("Consent", "Ridhaa") }]} />
      {tab === "details" && <><ProfileDetails business={b} /><ChangeContact business={b} /></>}
      {tab === "opening" && <StartingPosition business={b} />}
      {tab === "consent" && <ConsentCard business={b} />}
    </div>
  );
}
