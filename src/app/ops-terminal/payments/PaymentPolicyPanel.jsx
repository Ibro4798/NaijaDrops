"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { setPaymentMode, setVendorPolicy, setVendorScheduled, setExpiryMinutes, expireUnpaidNow } from "./actions";

export default function PaymentPolicyPanel({ mode, expiryMinutes, vendors }) {
  const router = useRouter();
  const [busy, setBusy] = useState(null);
  const [message, setMessage] = useState(null);
  const [minutes, setMinutes] = useState(String(expiryMinutes));

  async function run(key, fn) {
    setBusy(key);
    setMessage(null);
    const res = await fn();
    setBusy(null);
    if (res?.success) {
      if (typeof res.cancelled === "number") setMessage({ ok: true, text: "Cancelled " + res.cancelled + " unpaid order(s)." });
      router.refresh();
    } else {
      setMessage({ ok: false, text: res?.error || "Failed." });
    }
  }

  const modeButton = (value, title, body) => (
    <button
      type="button"
      disabled={busy === "mode"}
      onClick={() => value !== mode && run("mode", () => setPaymentMode(value))}
      className={"text-left p-5 rounded-2xl border transition-colors " + (mode === value ? "border-emerald-500 bg-emerald-500/10" : "border-white/10 bg-white/[0.03] hover:border-white/20")}
    >
      <p className={"font-black text-sm " + (mode === value ? "text-emerald-400" : "text-ink")}>{title}{mode === value ? "  (active)" : ""}</p>
      <p className="text-charcoal-500 text-xs mt-1 leading-relaxed">{body}</p>
    </button>
  );

  return (
    <div className="space-y-8">
      <section className="space-y-3">
        <h2 className="text-ink font-black text-sm uppercase tracking-widest">Default for all vendors</h2>
        <div className="grid gap-3 md:grid-cols-2">
          {modeButton("optional", "Payment not required up front", "Orders are sent to riders straight away, price can be negotiated, and the vendor pays after a rider accepts. This is how the app works today.")}
          {modeButton("required", "Pay first", "The vendor pays before any rider is notified. Fixed price, no negotiation. Unpaid orders are cancelled automatically after the time below.")}
        </div>
        <p className="text-charcoal-500 text-xs">Scheduled-window orders always require payment first, whatever you choose here.</p>
      </section>

      <section className="space-y-3">
        <h2 className="text-ink font-black text-sm uppercase tracking-widest">Cancel unpaid pay-first orders after</h2>
        <div className="flex items-center gap-3">
          <input value={minutes} onChange={(e) => setMinutes(e.target.value)} inputMode="numeric" className="w-24 bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-ink font-bold" />
          <span className="text-charcoal-400 text-sm font-bold">minutes (0 = never)</span>
          <button disabled={busy === "expiry"} onClick={() => run("expiry", () => setExpiryMinutes(minutes))} className="ml-auto px-4 py-3 rounded-xl bg-emerald-500 text-charcoal-950 font-black text-xs uppercase tracking-widest disabled:opacity-50">
            {busy === "expiry" ? <Loader2 size={14} className="animate-spin" /> : "Save"}
          </button>
          <button disabled={busy === "now"} onClick={() => run("now", () => expireUnpaidNow())} className="px-4 py-3 rounded-xl bg-white/5 border border-white/10 text-ink font-black text-xs uppercase tracking-widest disabled:opacity-50">
            {busy === "now" ? <Loader2 size={14} className="animate-spin" /> : "Run now"}
          </button>
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-ink font-black text-sm uppercase tracking-widest">Per vendor</h2>
        {vendors.length === 0 && <p className="text-charcoal-500 text-sm">No vendors yet.</p>}
        {vendors.map((v) => (
          <div key={v.id} className="flex flex-wrap items-center gap-3 bg-white/[0.04] border border-white/10 rounded-2xl p-4">
            <p className="text-ink font-black text-sm flex-1 min-w-[140px]">{v.business_name || v.id.slice(0, 8)}</p>
            <select
              value={v.payment_policy || "default"}
              disabled={busy === "p" + v.id}
              onChange={(e) => run("p" + v.id, () => setVendorPolicy(v.id, e.target.value))}
              className="bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-ink text-xs font-bold"
            >
              <option value="default">Use default</option>
              <option value="required">Pay first</option>
              <option value="optional">Not required</option>
            </select>
            <label className="flex items-center gap-2 text-xs font-bold text-charcoal-400">
              <input
                type="checkbox"
                checked={!!v.scheduled_enabled}
                disabled={busy === "s" + v.id}
                onChange={(e) => run("s" + v.id, () => setVendorScheduled(v.id, e.target.checked))}
                className="w-4 h-4 accent-emerald-500"
              />
              Scheduled windows
            </label>
          </div>
        ))}
      </section>

      {message && <p className={"text-xs font-bold " + (message.ok ? "text-emerald-400" : "text-red-400")}>{message.text}</p>}
    </div>
  );
}
