// Officer screens (MENU-01, HOME-04, ONB-05, ADM-05). Data Admin and above see every business.
import { AlertTriangle, ChevronRight } from "lucide-react";
import { useMemo, useState } from "react";
import { closesFor, isClosed, unclosedPastDays } from "../../core/dailyClose.js";
import { dueList, nextDue } from "../../core/rating.js";
import { SECTORS } from "../../core/seed.js";
import { addDays, money, today, uid } from "../../core/util.js";
import { assignOfficer, requestChange } from "../../lib/actions.js";
import { atLeast, businessesInScope, canSeeBusiness } from "../../lib/access.js";
import { L, tl } from "../../lib/i18n.js";
import { useAction, useStore } from "../../lib/store.jsx";
import { BusinessPicker, Card, DateRange, Empty, Field, ReasonModal, RatingBadge, Select, Stat, StatusPill, Tabs, Text, fmtDate, fmtDateTime, useRange } from "../../ui/components.jsx";
import { ActivityList, LoanTracker, RatingHistory, Statements, crType, daysClosed30 } from "../common.jsx";
import { ProfileDetails } from "../business/Profile.jsx";
import { BusinessWizard, OpeningForm } from "../Onboard.jsx";
import { approvalCounts } from "./DataAdmin.jsx";

export function OfficerHome() {
  const { state, user, go } = useStore();
  const act = useAction();
  const t = today(state);
  const list = businessesInScope(state, user);
  const [q, setQ] = useState("");
  const [assign, setAssign] = useState(null);
  const [officerId, setOfficerId] = useState("");
  const closedToday = list.filter((b) => isClosed(state, b.id, t)).length;
  const flagged = state.closes.filter((c) => c.flagged && c.date >= addDays(t, -7) && list.some((b) => b.id === c.businessId));
  const due = dueList(state, list, addDays(t, 7));
  const pendingApprovals = atLeast(user, "dataAdmin") ? approvalCounts(state).total : state.changeRequests.filter((c) => c.status === "pending" && list.some((b) => b.id === c.businessId)).length;
  const openQueries = state.queries.filter((x) => x.status === "open").length;
  const officers = state.users.filter((u) => u.role === "officer" && u.active !== false);
  const shown = list.filter((b) => !q || `${b.profile.businessName} ${b.profile.ownerName} ${b.profile.phone}`.toLowerCase().includes(q.toLowerCase()));
  return (
    <div className="stack">
      <div className="grid g4 keep2">
        <Stat label={L("Businesses", "Biashara")} value={list.length} note={atLeast(user, "dataAdmin") ? L("All businesses", "Biashara zote") : L("Assigned to you", "Ulizopangiwa")} />
        <Stat label={L("Closed today", "Zimefunga leo")} value={`${closedToday} / ${list.length}`} onClick={() => go("off-close")} />
        <Stat label={L("Flagged differences (7 days)", "Tofauti zilizoletwa (siku 7)")} value={flagged.length} onClick={() => go("off-close")} />
        <Stat label={L("Records checks due this week", "Ukaguzi wiki hii")} value={due.length} note={`${due.filter((x) => x.overdue).length} ${L("overdue", "umechelewa")}`} onClick={() => go("off-rating")} />
        <Stat label={L("Pending approvals", "Zinazosubiri idhini")} value={pendingApprovals} onClick={() => go(atLeast(user, "dataAdmin") ? "approvals" : "off-changes")} />
        {atLeast(user, "dataAdmin") && <Stat label={L("Open queries", "Maswali wazi")} value={openQueries} onClick={() => go("admin-queries")} />}
      </div>
      <Card title={L("Businesses", "Biashara")} actions={<button className="btn small primary" onClick={() => go("off-onboard")}>{L("Onboard a business", "Sajili biashara")}</button>}>
        <input className="input mb" placeholder={L("Search name or phone", "Tafuta jina au simu")} value={q} onChange={(e) => setQ(e.target.value)} />
        {!shown.length && <Empty text={L("No businesses yet. Onboard one to start.", "Bado hakuna biashara. Sajili moja kuanza.")} />}
        <div className="list">
          {shown.map((b) => {
            const dc = daysClosed30(state, b);
            const missed = unclosedPastDays(state, b, t).length;
            const officer = state.users.find((u) => u.id === b.officerId);
            return (
              <div key={b.id} className="item" style={{ flexWrap: "wrap" }}>
                <div className="grow" style={{ minWidth: 200 }}>
                  <button className="btn ghost" style={{ padding: 0, minHeight: 0 }} onClick={() => go("business", { id: b.id })}><b>{b.profile.businessName}</b></button>
                  <div className="small muted">{b.profile.ownerName} · {b.profile.phone} · {tl(SECTORS.find((s) => s.id === b.profile.sector))} · {b.profile.region}</div>
                  <div className="small muted">{L("Days closed", "Siku zilizofungwa")} {dc.closed}/{dc.days}{missed ? ` · ${missed} ${L("not closed", "hazijafungwa")}` : ""} · {L("Next check", "Ukaguzi ujao")} {fmtDate(nextDue(state, b))}</div>
                  {atLeast(user, "dataAdmin") && <div className="small">{L("Officer", "Afisa")}: <b className={officer ? "" : "red"}>{officer?.name || L("none", "hakuna")}</b> <button className="btn small ghost" onClick={() => { setAssign(b); setOfficerId(b.officerId || ""); }}>{L("Assign", "Panga")}</button></div>}
                </div>
                <RatingBadge business={b} />
                <button className="icon-btn" onClick={() => go("business", { id: b.id })} aria-label={L("Open", "Fungua")}><ChevronRight size={18} /></button>
              </div>
            );
          })}
        </div>
      </Card>
      {assign && (
        <ReasonModal title={`${L("Assign officer", "Panga afisa")}: ${assign.profile.businessName}`} onClose={() => setAssign(null)} onSubmit={(reason) => (officerId ? act((d) => assignOfficer(d, user, assign.id, officerId, reason), L("Officer assigned", "Afisa amepangwa")) : false)}>
          <Field label={L("Officer", "Afisa")}><Select value={officerId} onChange={setOfficerId} placeholder={L("Choose", "Chagua")} options={officers.map((o) => ({ value: o.id, label: o.name }))} /></Field>
          {(assign.officerHistory || []).length > 0 && <p className="small muted">{L("History", "Historia")}: {assign.officerHistory.map((h) => `${state.users.find((u) => u.id === h.officerId)?.name} (${fmtDate(h.at)})`).join(" → ")}</p>}
        </ReasonModal>
      )}
    </div>
  );
}

export function OfficerOnboard() {
  const { state, go } = useStore();
  const [made, setMade] = useState(null);
  const b = made && state.businesses.find((x) => x.id === made);
  if (b) {
    return (
      <div className="stack">
        <p className="notice good"><b>{L("Business registered", "Biashara imesajiliwa")}</b>{L(`${b.profile.ownerName} can now sign in with ${b.profile.phone} and the PIN chosen.`, `${b.profile.ownerName} sasa anaweza kuingia kwa ${b.profile.phone} na PIN aliyochagua.`)}</p>
        <Card title={L("Starting position", "Hali ya kuanzia")}><OpeningForm business={b} mode="officer" onSaved={() => go("business", { id: b.id })} /></Card>
        <button className="btn" onClick={() => go("business", { id: b.id })}>{L("Skip for now", "Ruka kwa sasa")}</button>
      </div>
    );
  }
  return <BusinessWizard mode="officer" onDone={({ businessId }) => setMade(businessId)} />;
}

// A business's file for officers and admins: details, activity, statements, rating, starting position, loans.
export function BusinessFile({ businessId, initial = "activity" }) {
  const { state, user, go } = useStore();
  const [tab, setTab] = useState(initial);
  const [range, setRange] = useRange("week");
  const b = state.businesses.find((x) => x.id === businessId);
  if (!b || !canSeeBusiness(state, user, businessId)) return <Empty text={L("This business is not assigned to you.", "Biashara hii haijapangiwa kwako.")} />;
  const loans = state.loans.filter((l) => l.businessId === b.id);
  return (
    <div className="stack">
      <div className="between">
        <div><h2>{b.profile.businessName}</h2><p className="small muted">{b.profile.ownerName} · {b.profile.phone}</p></div>
        <div className="row"><RatingBadge business={b} />{["officer", "dataAdmin", "systemAdmin", "super"].includes(user.role) && <button className="btn small primary" onClick={() => go("rating-check", { id: b.id })}>{L("Start records check", "Anza ukaguzi wa kumbukumbu")}</button>}</div>
      </div>
      <Tabs value={tab} onChange={setTab} tabs={[
        { value: "activity", label: L("Activity", "Shughuli") }, { value: "statements", label: L("Statements", "Taarifa za fedha") }, { value: "rating", label: L("Records Rating", "Kiwango cha Kumbukumbu") },
        { value: "profile", label: L("Profile", "Wasifu") }, { value: "opening", label: L("Starting position", "Hali ya kuanzia") }, { value: "loans", label: L("Loans", "Mikopo") }
      ]} />
      {tab === "activity" && <><DateRange value={range} onChange={setRange} /><ActivityList business={b} from={range.from} to={range.to} /></>}
      {tab === "statements" && <Statements business={b} />}
      {tab === "rating" && <RatingHistory business={b} mode="admin" />}
      {tab === "profile" && <><ProfileDetails business={b} /><Card title={L("Inclusion baseline (asked once)", "Maswali ya msingi (yaliulizwa mara moja)")}><pre className="small" style={{ whiteSpace: "pre-wrap", margin: 0 }}>{Object.entries(b.baseline || {}).filter(([k]) => k !== "at").map(([k, v]) => `${k}: ${Array.isArray(v) ? v.join(", ") : v}`).join("\n")}</pre></Card></>}
      {tab === "opening" && (
        <Card title={L("Starting position", "Hali ya kuanzia")} actions={b.opening ? <StatusPill status={b.opening.status} /> : null}>
          {b.opening?.status === "approved" ? (atLeast(user, "dataAdmin") ? <OpeningForm business={b} mode="admin" /> : <p>{L("Approved and locked. Only Data Admin can change it.", "Imeidhinishwa na imefungwa. Msimamizi wa Data pekee anaweza kuibadilisha.")}</p>)
            : b.opening?.status === "submitted" ? <p>{L("Waiting for Data Admin approval.", "Inasubiri idhini ya Msimamizi wa Data.")}</p> : <OpeningForm business={b} mode="officer" />}
        </Card>
      )}
      {tab === "loans" && (loans.length ? loans.map((l) => <Card key={l.id} title={`${l.id} · ${money(l.offer?.principal || l.amount)}`} actions={<StatusPill status={l.status} />}>{l.schedule ? <LoanTracker loan={l} business={b} /> : <p className="small muted">{l.purpose}</p>}</Card>) : <Empty text={L("No loans.", "Hakuna mikopo.")} />)}
    </div>
  );
}

export function BusinessRoute() {
  const { params } = useStore();
  return <BusinessFile businessId={params.id} initial={params.tab || "activity"} />;
}

export function OffActivity() {
  const { state, user, params, go } = useStore();
  const list = businessesInScope(state, user);
  const id = params.id || "";
  return (
    <div className="stack">
      <BusinessPicker businesses={list} value={id} onChange={(v) => go("off-activity", { id: v })} />
      {id ? <BusinessFile key={id} businessId={id} initial="activity" /> : <Empty text={L("Choose a business to see its activity and statements.", "Chagua biashara kuona shughuli na taarifa zake.")} />}
    </div>
  );
}

export function OffClose() {
  const { state, user, go } = useStore();
  const t = today(state);
  const list = businessesInScope(state, user);
  const rows = list.map((b) => ({ b, closed: isClosed(state, b.id, t), missed: unclosedPastDays(state, b, t), last: closesFor(state, b.id).slice(-1)[0] }));
  const flags = state.closes.filter((c) => c.flagged && list.some((b) => b.id === c.businessId)).slice(-30).reverse();
  return (
    <div className="stack">
      <Card title={L("Flagged cash differences", "Tofauti za pesa zilizoletwa")}>
        {!flags.length && <Empty text={L("No flagged differences.", "Hakuna tofauti zilizoletwa.")} />}
        <div className="list">
          {flags.map((c) => {
            const b = list.find((x) => x.id === c.businessId);
            return <div key={c.id} className="item"><AlertTriangle size={18} className="amber" /><div className="grow"><b>{b.profile.businessName}</b><div className="small muted">{fmtDate(c.date)} · {L("unexplained", "haielezeki")} {money(c.remainder)}</div></div><button className="btn small" onClick={() => go("business", { id: b.id })}>{L("Open", "Fungua")}</button></div>;
          })}
        </div>
      </Card>
      <Card title={`${L("Today", "Leo")}: ${fmtDate(t)}`}>
        <div className="table-wrap">
          <table className="t">
            <thead><tr><th>{L("Business", "Biashara")}</th><th>{L("Today", "Leo")}</th><th>{L("Missed days", "Siku zilizokosa")}</th><th>{L("Last close", "Kufunga kwa mwisho")}</th></tr></thead>
            <tbody>
              {rows.map(({ b, closed, missed, last }) => (
                <tr key={b.id}><td>{b.profile.businessName}<div className="tiny muted">{b.profile.phone} · {L("closes at", "hufunga")} {b.closingTime}</div></td><td>{closed ? <span className="pill green">{L("Closed", "Imefungwa")}</span> : <span className="pill grey">{L("Open", "Wazi")}</span>}</td><td>{missed.length ? <span className="pill red">{missed.length}</span> : "0"}</td><td className="small">{last ? `${fmtDateTime(last.closedAt)}${Math.abs(last.remainder) > 0.5 ? ` · ${money(last.remainder)}` : ""}` : "—"}</td></tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}

const CHANGE_FIELDS = [
  ["phone", "Main phone", "Simu kuu"], ["phone2", "Second phone", "Simu ya pili"], ["email", "Email", "Barua pepe"], ["address", "Business address", "Anwani ya biashara"], ["closingTime", "Closing time", "Muda wa kufunga"],
  ["businessName", "Business name", "Jina la biashara"], ["ownerName", "Owner name", "Jina la mmiliki"], ["nida", "NIDA number", "Namba ya NIDA"], ["dob", "Date of birth", "Tarehe ya kuzaliwa"], ["region", "Region", "Mkoa"], ["monthsOperating", "Months operating", "Miezi ya biashara"], ["staffTotal", "Staff total", "Wafanyakazi wote"]
];

export function OffChanges() {
  const { state, user } = useStore();
  const act = useAction();
  const list = businessesInScope(state, user);
  const [bid, setBid] = useState("");
  const [field, setField] = useState("phone");
  const [value, setValue] = useState("");
  const [note, setNote] = useState("");
  const ids = useMemo(() => new Set(list.map((b) => b.id)), [list]);
  const requests = state.changeRequests.filter((c) => ids.has(c.businessId)).slice(0, 60);
  const b = list.find((x) => x.id === bid);
  const current = b ? (field === "closingTime" ? b.closingTime : b.profile[field]) : "";
  return (
    <div className="stack">
      <Card title={L("Recommend a change", "Pendekeza mabadiliko")}>
        <p className="small muted mb">{L("Officers cannot change data directly. Your recommendation waits for Data Admin.", "Maafisa hawabadilishi taarifa moja kwa moja. Pendekezo lako linasubiri Msimamizi wa Data.")}</p>
        <div className="form two">
          <Field label={L("Business", "Biashara")}><BusinessPicker businesses={list} value={bid} onChange={setBid} /></Field>
          <Field label={L("What to change", "Nini kibadilishwe")}><Select value={field} onChange={setField} options={CHANGE_FIELDS.map(([v, en, sw]) => ({ value: v, label: L(en, sw) }))} /></Field>
          <Field label={L("Now", "Sasa")}><input className="input" disabled value={current ?? ""} /></Field>
          <Field label={L("New value", "Thamani mpya")}><Text value={value} onChange={setValue} /></Field>
          <Field label={L("Why", "Kwa nini")}><Text value={note} onChange={setNote} /></Field>
        </div>
        <button className="btn primary mt" disabled={!b || !value.trim() || note.trim().length < 5} onClick={() => { act((d) => requestChange(d, user, { id: uid("CR"), businessId: bid, type: "profile", fields: { [field]: field === "monthsOperating" || field === "staffTotal" ? Number(value) || 0 : value.trim() }, note: `Officer: ${note.trim()}` }), L("Sent to Data Admin", "Imetumwa kwa Msimamizi wa Data")); setValue(""); setNote(""); }}>{L("Send recommendation", "Tuma pendekezo")}</button>
      </Card>
      <Card title={L("Change requests", "Maombi ya mabadiliko")}>
        {!requests.length && <Empty text={L("None yet.", "Bado hakuna.")} />}
        <div className="list">
          {requests.map((c) => (
            <div key={c.id} className="item">
              <div className="grow"><b>{state.businesses.find((x) => x.id === c.businessId)?.profile.businessName}</b><div className="small muted">{crType(c.type)} · {c.note || Object.keys(c.fields || {}).join(", ")}</div><div className="tiny muted">{c.proposedBy?.name} · {fmtDateTime(c.at)}{c.reason ? ` · ${c.reason}` : ""}</div></div>
              <StatusPill status={c.status} />
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}
