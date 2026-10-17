"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { formatWindowRange, formatWindowTime } from "@/utils/windows";
import { createWindow, setWindowOpen, deleteWindow, setVendorScheduled } from "./actions";

const input = "w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-ink font-bold text-sm";

function statusOf(w, now) {
  if (new Date(w.starts_at).getTime() <= now) return { text: "Past", tone: "text-charcoal-500 border-white/10" };
  if (!w.is_open) return { text: "Closed by you", tone: "text-amber-400 border-amber-500/30 bg-amber-500/10" };
  if (now >= new Date(w.cutoff_at).getTime()) return { text: "Cut-off passed", tone: "text-charcoal-400 border-white/10" };
  if (w.max_orders && w.booked >= w.max_orders) return { text: "Full", tone: "text-amber-400 border-amber-500/30 bg-amber-500/10" };
  return { text: "Open to vendors", tone: "text-emerald-400 border-emerald-500/30 bg-emerald-500/10" };
}

export default function SchedulingPanel({ windows, vendors, today }) {
  const router = useRouter();
  const [busy, setBusy] = useState(null);
  const [now] = useState(() => Date.now());
  const [message, setMessage] = useState(null);
  const [form, setForm] = useState({ date: today, time: "12:30", durationMinutes: "60", cutoffMinutes: "60", maxOrders: "", label: "" });
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  async function run(key, fn, okText) {
    setBusy(key);
    setMessage(null);
    const res = await fn();
    setBusy(null);
    if (res?.success) {
      if (okText) setMessage({ ok: true, text: okText });
      router.refresh();
    } else {
      setMessage({ ok: false, text: res?.error || "Failed." });
    }
  }

  const enabledCount = vendors.filter((v) => v.scheduled_enabled).length;
  const todays = windows.filter((w) => new Date(w.starts_at).getTime() > now);

  return (
    <div className="space-y-8">
      <section className="space-y-3">
        <h2 className="text-ink font-black text-sm uppercase tracking-widest">New delivery window</h2>
        <div className="bg-white/[0.04] border border-white/10 rounded-2xl p-4 space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <label className="space-y-1"><span className="text-charcoal-500 text-[10px] font-black uppercase tracking-widest">Date</span>
              <input type="date" value={form.date} onChange={set("date")} className={input} /></label>
            <label className="space-y-1"><span className="text-charcoal-500 text-[10px] font-black uppercase tracking-widest">Starts (Lagos time)</span>
              <input type="time" value={form.time} onChange={set("time")} className={input} /></label>
            <label className="space-y-1"><span className="text-charcoal-500 text-[10px] font-black uppercase tracking-widest">Duration (minutes)</span>
              <input inputMode="numeric" value={form.durationMinutes} onChange={set("durationMinutes")} className={input} /></label>
            <label className="space-y-1"><span className="text-charcoal-500 text-[10px] font-black uppercase tracking-widest">Cut-off (minutes before start)</span>
              <input inputMode="numeric" value={form.cutoffMinutes} onChange={set("cutoffMinutes")} className={input} /></label>
            <label className="space-y-1"><span className="text-charcoal-500 text-[10px] font-black uppercase tracking-widest">Max orders (optional)</span>
              <input inputMode="numeric" value={form.maxOrders} onChange={set("maxOrders")} placeholder="No limit" className={input} /></label>
            <label className="space-y-1"><span className="text-charcoal-500 text-[10px] font-black uppercase tracking-widest">Name (optional)</span>
              <input value={form.label} onChange={set("label")} placeholder="e.g. Lunch run" className={input} /></label>
          </div>
          <button
            disabled={busy === "create"}
            onClick={() => run("create", () => createWindow(form), "Window created. Vendors you have switched on can see it now.")}
            className="w-full px-4 py-3 rounded-xl bg-emerald-500 text-charcoal-950 font-black text-xs uppercase tracking-widest disabled:opacity-60"
          >
            {busy === "create" ? <Loader2 size={14} className="animate-spin inline" /> : "Create window"}
          </button>
          <p className="text-charcoal-500 text-xs leading-relaxed">
            Vendors must pay when they book. Unpaid bookings lapse automatically at the cut-off.
          </p>
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-ink font-black text-sm uppercase tracking-widest">Windows</h2>
        {windows.length === 0 && <p className="text-charcoal-500 text-sm">No windows yet. Vendors see &quot;no window open&quot; until you create one.</p>}
        {todays.length === 0 && windows.length > 0 && <p className="text-amber-400 text-xs font-bold">No upcoming window. Vendors currently see &quot;no window open&quot;.</p>}
        {windows.map((w) => {
          const st = statusOf(w, now);
          const isPast = new Date(w.starts_at).getTime() <= now;
          return (
            <div key={w.id} className="bg-white/[0.04] border border-white/10 rounded-2xl p-4 space-y-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-ink font-black text-sm">{w.label || formatWindowRange(w.starts_at, w.duration_minutes)}</p>
                  <p className="text-charcoal-500 text-xs mt-0.5">
                    {w.label ? formatWindowRange(w.starts_at, w.duration_minutes) + " - " : ""}cut-off {formatWindowTime(w.cutoff_at)}
                  </p>
                  <p className="text-charcoal-400 text-xs mt-1">
                    {w.booked} booked ({w.paid} paid){w.max_orders ? " of " + w.max_orders : ""}
                  </p>
                </div>
                <span className={"shrink-0 text-[10px] font-black uppercase tracking-widest px-3 py-1 rounded-full border " + st.tone}>{st.text}</span>
              </div>
              {!isPast && (
                <div className="grid grid-cols-2 gap-2">
                  <button
                    disabled={busy === "o" + w.id}
                    onClick={() => run("o" + w.id, () => setWindowOpen(w.id, !w.is_open))}
                    className="px-3 py-2.5 rounded-xl bg-white/5 border border-white/10 text-ink font-black text-[11px] uppercase tracking-wider disabled:opacity-60"
                  >
                    {w.is_open ? "Close to new bookings" : "Reopen"}
                  </button>
                  <button
                    disabled={busy === "d" + w.id || w.booked > 0}
                    onClick={() => window.confirm("Delete this window?") && run("d" + w.id, () => deleteWindow(w.id))}
                    className="px-3 py-2.5 rounded-xl border border-red-500/30 text-red-400 font-black text-[11px] uppercase tracking-wider disabled:opacity-40"
                  >
                    Delete
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </section>

      <section className="space-y-3">
        <h2 className="text-ink font-black text-sm uppercase tracking-widest">Vendors who can book windows ({enabledCount})</h2>
        <p className="text-charcoal-500 text-xs">Only these vendors see windows. Everyone else sees nothing about scheduling.</p>
        {vendors.length === 0 && <p className="text-charcoal-500 text-sm">No vendors yet.</p>}
        {vendors.map((v) => (
          <button
            key={v.id}
            type="button"
            disabled={busy === "v" + v.id}
            onClick={() => run("v" + v.id, () => setVendorScheduled(v.id, !v.scheduled_enabled))}
            className="w-full flex items-center justify-between gap-3 px-4 py-3 rounded-xl bg-white/[0.03] border border-white/10 text-left disabled:opacity-60"
          >
            <p className="text-ink text-sm font-black min-w-0 truncate">{v.business_name || v.id.slice(0, 8)}</p>
            <div className={"w-11 h-6 rounded-full relative transition-all shrink-0 " + (v.scheduled_enabled ? "bg-emerald-500" : "bg-charcoal-700")}>
              <div className={"absolute top-1 w-4 h-4 bg-white rounded-full shadow transition-all " + (v.scheduled_enabled ? "left-6" : "left-1")} />
            </div>
          </button>
        ))}
      </section>

      {message && <p className={"text-xs font-bold " + (message.ok ? "text-emerald-400" : "text-red-400")}>{message.text}</p>}
    </div>
  );
}
