import { Camera, Inbox, Mic, MicOff, X } from "lucide-react";
import { Children, useEffect, useRef, useState } from "react";
import { BANDS, GREY, bandFor, ratingStatus, ratingsFor } from "../core/rating.js";
import { addDays, endOfMonth, money, parseISO, startOfMonth, today, uid } from "../core/util.js";
import { compressImage, getFile, putFile } from "../lib/files.js";
import { L, getLang, tl } from "../lib/i18n.js";
import { useStore } from "../lib/store.jsx";

export const Money = ({ v, className = "" }) => <span className={`mono ${className}`}>{money(v)}</span>;

export function Card({ title, actions, children, className = "", id }) {
  return (
    <section className={`card ${className}`} id={id}>
      {(title || actions) && (
        <div className="between mb">
          {title && <h2>{title}</h2>}
          {actions && <div className="row">{actions}</div>}
        </div>
      )}
      {children}
    </section>
  );
}

// A labelled field. Groups of buttons (chips) get a <div role="group"> instead of a <label>,
// so tapping the label never presses the first button and each button keeps its own name.
export function Field({ label, hint, children, className = "" }) {
  const group = Children.toArray(children).some((c) => c?.type === Chips);
  if (group) {
    return (
      <div className={`field ${className}`} role="group" aria-label={typeof label === "string" ? label : undefined}>
        {label && <span>{label}</span>}
        {children}
        {hint && <small>{hint}</small>}
      </div>
    );
  }
  return (
    <label className={`field ${className}`}>
      {label && <span>{label}</span>}
      {children}
      {hint && <small>{hint}</small>}
    </label>
  );
}

export function Text({ value, onChange, ...rest }) {
  return <input className="input" value={value ?? ""} onChange={(e) => onChange(e.target.value)} {...rest} />;
}

export function Area({ value, onChange, ...rest }) {
  return <textarea className="input" value={value ?? ""} onChange={(e) => onChange(e.target.value)} {...rest} />;
}

// Amount input with thousands separators; value is a number or "".
export function AmountInput({ value, onChange, big, placeholder = "0", allowNegative = false, ...rest }) {
  const shown = value === "" || value == null ? "" : `${value < 0 ? "-" : ""}${Math.abs(Number(value)).toLocaleString("en-US")}`;
  return (
    <input
      className={`input ${big ? "amount" : ""}`}
      inputMode="numeric"
      placeholder={placeholder}
      value={shown}
      onChange={(e) => {
        const raw = e.target.value.replace(/[^\d-]/g, "");
        if (raw === "" || raw === "-") return onChange("");
        const n = Number(allowNegative ? raw : raw.replace(/-/g, ""));
        onChange(Number.isFinite(n) ? n : "");
      }}
      {...rest}
    />
  );
}

export function Select({ value, onChange, options, placeholder, ...rest }) {
  return (
    <select className="input" value={value ?? ""} onChange={(e) => onChange(e.target.value)} {...rest}>
      {placeholder != null && <option value="">{placeholder}</option>}
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

export function Chips({ options, value, onChange, multi = false }) {
  const on = (v) => (multi ? (value || []).includes(v) : value === v);
  const click = (v) => (multi ? onChange(on(v) ? value.filter((x) => x !== v) : [...(value || []), v]) : onChange(v));
  return (
    <div className="chips">
      {options.map((o) => (
        <button type="button" key={o.value} className={`chip ${on(o.value) ? "on" : ""}`} onClick={() => click(o.value)}>
          {o.icon}
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Tabs({ tabs, value, onChange }) {
  return (
    <div className="tabs no-print" role="tablist">
      {tabs.map((t) => (
        <button key={t.value} role="tab" aria-selected={value === t.value} className={`tab ${value === t.value ? "on" : ""}`} onClick={() => onChange(t.value)}>
          {t.label}
          {t.count ? <span className="pill orange" style={{ marginLeft: 6 }}>{t.count}</span> : null}
        </button>
      ))}
    </div>
  );
}

export function Modal({ title, onClose, children, actions, wide }) {
  useEffect(() => {
    const k = (e) => e.key === "Escape" && onClose?.();
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [onClose]);
  return (
    <div className="modal-back" onMouseDown={(e) => e.target === e.currentTarget && onClose?.()}>
      <div className={`modal ${wide ? "wide" : ""}`} role="dialog" aria-modal="true" aria-label={title}>
        <div className="between">
          <h2>{title}</h2>
          {onClose && (
            <button className="icon-btn" onClick={onClose} aria-label={L("Close", "Funga")}>
              <X size={18} />
            </button>
          )}
        </div>
        <div className="mt">{children}</div>
        {actions && <div className="actions">{actions}</div>}
      </div>
    </div>
  );
}

// Designed confirmation (no browser pop-ups anywhere: REC-06).
export function Confirm({ title, body, okLabel, danger, onOk, onClose }) {
  return (
    <Modal
      title={title}
      onClose={onClose}
      actions={
        <>
          <button className="btn" onClick={onClose}>{L("Cancel", "Ghairi")}</button>
          <button className={`btn ${danger ? "danger" : "primary"}`} onClick={() => { onOk(); onClose(); }}>{okLabel || L("Confirm", "Thibitisha")}</button>
        </>
      }
    >
      <div className="stack">{typeof body === "string" ? <p>{body}</p> : body}</div>
    </Modal>
  );
}

// Every Admin change needs a written reason (ROLE-05).
export function ReasonModal({ title, intro, okLabel, danger, onSubmit, onClose, children, min = 5 }) {
  const [reason, setReason] = useState("");
  const ok = reason.trim().length >= min;
  return (
    <Modal
      title={title}
      onClose={onClose}
      actions={
        <>
          <button className="btn" onClick={onClose}>{L("Cancel", "Ghairi")}</button>
          <button className={`btn ${danger ? "danger" : "primary"}`} disabled={!ok} onClick={() => { if (onSubmit(reason.trim()) !== false) onClose(); }}>
            {okLabel || L("Save", "Hifadhi")}
          </button>
        </>
      }
    >
      <div className="form">
        {intro && <p>{intro}</p>}
        {children}
        <Field label={L("Reason (required)", "Sababu (lazima)")} hint={L("Kept in the audit trail.", "Inahifadhiwa kwenye kumbukumbu za mabadiliko.")}>
          <Area value={reason} onChange={setReason} rows={3} />
        </Field>
      </div>
    </Modal>
  );
}

export function Stat({ label, value, note, onClick }) {
  const Tag = onClick ? "button" : "div";
  return (
    <Tag className="stat" onClick={onClick}>
      <small>{label}</small>
      <strong>{value}</strong>
      {note && <em>{note}</em>}
    </Tag>
  );
}

export function Empty({ text, icon: Icon = Inbox }) {
  return (
    <div className="empty">
      <Icon size={30} />
      <p className="mt">{text}</p>
    </div>
  );
}

export function Steps({ count, at }) {
  return (
    <div className="steps" aria-label={`${at + 1} / ${count}`}>
      {Array.from({ length: count }, (_, i) => <i key={i} className={i <= at ? "on" : ""} />)}
    </div>
  );
}

export const Pill = ({ tone = "", children }) => <span className={`pill ${tone}`}>{children}</span>;

export function StatusPill({ status }) {
  const map = {
    posted: ["green", L("Posted", "Imeingizwa")], held: ["orange", L("Waiting for Admin", "Inasubiri Msimamizi")], declined: ["red", L("Declined", "Imekataliwa")],
    pending: ["orange", L("Waiting", "Inasubiri")], approved: ["green", L("Approved", "Imeidhinishwa")], submitted: ["orange", L("Submitted", "Imewasilishwa")], draft: ["grey", L("Draft", "Rasimu")],
    requested: ["orange", L("Requested", "Imeombwa")], offered: ["orange", L("Offer made", "Ofa imetolewa")], accepted: ["green", L("Accepted", "Imekubaliwa")], rejected: ["red", L("Not approved", "Haikuidhinishwa")],
    disbursed: ["green", L("Disbursed", "Imetolewa")], repaid: ["green", L("Repaid", "Imelipwa yote")], quoted: ["orange", L("Quoted", "Nukuu imetolewa")], ordered: ["orange", L("Ordered", "Imeagizwa")],
    invoiced: ["orange", L("Invoiced", "Ankara imetolewa")], delivered: ["green", L("Delivered", "Imefikishwa")], received: ["green", L("Received", "Imepokelewa")], paid: ["green", L("Paid", "Imelipwa")],
    open: ["orange", L("Open", "Wazi")], answered: ["green", L("Answered", "Imejibiwa")], reviewed: ["green", L("Reviewed", "Imekaguliwa")], active: ["green", L("Active", "Hai")],
    final: ["green", L("Final", "Ya mwisho")], disputed: ["orange", L("Under review", "Inapitiwa")], success: ["green", L("Paid", "Imelipwa")], failed: ["red", L("Failed", "Imeshindikana")]
  };
  const [tone, label] = map[status] || ["grey", status];
  return <Pill tone={tone}>{label}</Pill>;
}

// Records Rating badge: colour plus band name and date, never colour alone (RAT-09, UX-06).
export function RatingBadge({ business, big, withDate = true }) {
  const { state } = useStore();
  if (!business) return null;
  const rs = ratingStatus(state, business, today(state));
  let label;
  if (rs.state === "not_checked") label = L("Not yet checked", "Bado haijakaguliwa");
  else if (rs.state === "under_review") label = `${tl(rs.band)}, ${rs.rating.score}% · ${L("under review", "inapitiwa")}`;
  else if (rs.state === "overdue") label = `${L("Check overdue", "Ukaguzi umechelewa")} · ${L("last", "mwisho")}: ${tl(rs.band)} ${rs.rating.score}%`;
  else label = `${tl(rs.band)}, ${rs.rating.score}%`;
  return (
    <span className={`badge ${big ? "big" : ""}`} style={{ background: rs.color }} title={L("TijaPass Records Rating", "Kiwango cha Kumbukumbu cha TijaPass")}>
      <i className="sw" />
      {label}
      {withDate && rs.rating && <span style={{ fontWeight: 500, opacity: 0.9 }}>· {fmtDate(rs.rating.date)}</span>}
    </span>
  );
}

export const bandLabel = (score) => `${tl(bandFor(score))}, ${score}%`;

// Monthly trend of ratings (RAT-14).
export function RatingTrend({ businessId, months = 6 }) {
  const { state } = useStore();
  const list = ratingsFor(state, businessId).filter((r) => r.status !== "draft").slice(-months);
  if (!list.length) return <p className="muted small">{L("No ratings yet.", "Bado hakuna viwango.")}</p>;
  return (
    <div className="bars" aria-label={L("Records Rating trend", "Mwenendo wa Kiwango cha Kumbukumbu")}>
      {list.map((r) => (
        <div className="bar" key={r.id}>
          <b>{r.score}%</b>
          <i style={{ height: `${Math.max(6, r.score)}%`, background: bandFor(r.score).color }} />
          <small>{fmtDate(r.date, true)}</small>
        </div>
      ))}
    </div>
  );
}

export const BandLegend = () => (
  <div className="row small">
    {BANDS.map((b) => (
      <span key={b.key} className="badge" style={{ background: b.color }}><i className="sw" />{tl(b)} {b.key === "excellent" ? "≥90" : b.key === "good" ? "70–89" : b.key === "okay" ? "50–69" : "<50"}</span>
    ))}
    <span className="badge" style={{ background: GREY }}><i className="sw" />{L("Not yet checked / overdue", "Bado / umechelewa")}</span>
  </div>
);

const MONTHS = { en: ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"], sw: ["Jan", "Feb", "Mac", "Apr", "Mei", "Jun", "Jul", "Ago", "Sep", "Okt", "Nov", "Des"] };
export function fmtDate(iso, short = false) {
  if (!iso) return "";
  const d = parseISO(String(iso).slice(0, 10));
  const m = MONTHS[getLang()][d.getMonth()];
  return short ? `${m} ${String(d.getFullYear()).slice(2)}` : `${d.getDate()} ${m} ${d.getFullYear()}`;
}
export const fmtTime = (iso) => (iso ? new Date(iso).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" }) : "");
export const fmtDateTime = (iso) => (iso ? `${fmtDate(iso)} ${fmtTime(iso)}` : "");

// Date range with presets (REP-02).
export function rangeFor(preset, todayISO) {
  const d = parseISO(todayISO);
  const dow = (d.getDay() + 6) % 7;
  if (preset === "today") return { from: todayISO, to: todayISO };
  if (preset === "week") return { from: addDays(todayISO, -dow), to: todayISO };
  if (preset === "month") return { from: startOfMonth(todayISO), to: todayISO };
  if (preset === "last") {
    const lastEnd = addDays(startOfMonth(todayISO), -1);
    return { from: startOfMonth(lastEnd), to: endOfMonth(lastEnd) };
  }
  if (preset === "90") return { from: addDays(todayISO, -89), to: todayISO };
  return null;
}

export function DateRange({ value, onChange }) {
  const { state } = useStore();
  const t = today(state);
  const presets = [
    ["today", L("Today", "Leo")], ["week", L("This week", "Wiki hii")], ["month", L("This month", "Mwezi huu")],
    ["last", L("Last month", "Mwezi uliopita")], ["custom", L("Custom", "Chagua")]
  ];
  return (
    <div className="stack no-print">
      <div className="chips">
        {presets.map(([k, label]) => (
          <button key={k} className={`chip ${value.preset === k ? "on" : ""}`} onClick={() => onChange(k === "custom" ? { ...value, preset: k } : { preset: k, ...rangeFor(k, t) })}>
            {label}
          </button>
        ))}
      </div>
      {value.preset === "custom" && (
        <div className="form two">
          <Field label={L("From", "Kuanzia")}><input type="date" className="input" value={value.from} max={value.to} onChange={(e) => onChange({ ...value, from: e.target.value })} /></Field>
          <Field label={L("To", "Hadi")}><input type="date" className="input" value={value.to} min={value.from} onChange={(e) => onChange({ ...value, to: e.target.value })} /></Field>
        </div>
      )}
    </div>
  );
}

export const useRange = (preset = "month") => {
  const { state } = useStore();
  return useState(() => ({ preset, ...rangeFor(preset, today(state)) }));
};

// Photo from the phone camera or a file; kept in IndexedDB, the state stores only its id.
export function PhotoInput({ value, onChange, label, required }) {
  const ref = useRef(null);
  const [busy, setBusy] = useState(false);
  const pick = async (file) => {
    if (!file) return;
    setBusy(true);
    try {
      const data = file.type.startsWith("image/") ? await compressImage(file) : await new Promise((res) => { const r = new FileReader(); r.onload = () => res(r.result); r.readAsDataURL(file); });
      const id = uid("F");
      await putFile(id, { name: file.name, type: file.type, data });
      onChange(id);
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="field">
      {label && <span>{label}{required && " *"}</span>}
      <div className="row">
        {value && <StoredImage id={value} />}
        <button type="button" className="btn" onClick={() => ref.current?.click()} disabled={busy}>
          <Camera size={18} />
          {busy ? L("Saving…", "Inahifadhi…") : value ? L("Change photo", "Badilisha picha") : L("Take or choose photo", "Piga au chagua picha")}
        </button>
      </div>
      <input ref={ref} type="file" accept="image/*" capture="environment" hidden onChange={(e) => pick(e.target.files?.[0])} />
    </div>
  );
}

export function StoredImage({ id, className = "photo-thumb" }) {
  const [src, setSrc] = useState(null);
  useEffect(() => {
    let live = true;
    getFile(id).then((f) => live && setSrc(f?.data || null)).catch(() => {});
    return () => { live = false; };
  }, [id]);
  if (!src) return <span className="pill grey">{L("Photo", "Picha")}</span>;
  return <img src={src} alt="" className={className} />;
}

// Voice input with the browser's speech recognition (Kiswahili or English), where available.
export function VoiceButton({ onText }) {
  const [on, setOn] = useState(false);
  const recRef = useRef(null);
  const SR = typeof window !== "undefined" ? window.SpeechRecognition || window.webkitSpeechRecognition : null;
  if (!SR) return null;
  const toggle = () => {
    if (on) { recRef.current?.stop(); return; }
    const rec = new SR();
    rec.lang = getLang() === "sw" ? "sw-TZ" : "en-GB";
    rec.interimResults = false;
    rec.onresult = (e) => onText(Array.from(e.results).map((r) => r[0].transcript).join(" "));
    rec.onend = () => setOn(false);
    rec.onerror = () => setOn(false);
    recRef.current = rec;
    rec.start();
    setOn(true);
  };
  return (
    <button type="button" className={`btn ${on ? "navy" : ""}`} onClick={toggle} aria-label={L("Speak", "Ongea")}>
      {on ? <MicOff size={18} /> : <Mic size={18} />}
      {on ? L("Stop", "Simamisha") : L("Speak", "Ongea")}
    </button>
  );
}

export function Meter({ value, color }) {
  return <div className="meter"><i style={{ width: `${Math.max(0, Math.min(100, value * 100))}%`, background: color }} /></div>;
}

export function BusinessPicker({ businesses, value, onChange, placeholder }) {
  return (
    <Select
      value={value}
      onChange={onChange}
      placeholder={placeholder ?? L("Choose a business", "Chagua biashara")}
      options={businesses.map((b) => ({ value: b.id, label: `${b.profile.businessName} · ${b.profile.ownerName}` }))}
    />
  );
}

export function downloadText(name, text, type = "text/csv") {
  const blob = new Blob([text], { type });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
}
