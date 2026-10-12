"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { setPaymentMode, setVendorPolicy, setVendorScheduled, setExpiryMinutes, expireUnpaidNow } from "./actions";

const POLICY_OPTIONS = [
  { value: "default", label: "Default" },
  { value: "required", label: "Pay first" },
  { value: "optional", label: "Not required" },
];

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
      if (typeof res.cancelled === "number") {
        setMessage({ ok: true, text: res.cancelled === 0 ? "No unpaid orders were old enough to cancel." : "Cancelled " + res.cancelled + " unpaid order(s)." });
      }
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
          {modeButton("optional", "Payment not required up front", "Orders are sent to riders straight away, price can be negotiated, and the vendor pays after a rider accepts. This is how the app worked before.")}
          {modeButton("required", "Pay first", "The vendor pays before any rider is notified. Fixed price, no negotiation. Unpaid orders are cancelled automatically after the time below.")}
        </div>
        <p className="text-charcoal-500 text-xs">
          Only vendors set to <span className="text-ink font-bold">Default</span> follow this. A vendor set to Pay first or Not required ignores it.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-ink font-black text-sm uppercase tracking-widest">Cancel unpaid pay-first orders after</h2>
        <div className="flex items-center gap-3">
          <input value={minutes} onChange={(e) => setMinutes(e.target.value)} inputMode="numeric" className="w-24 bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-ink font-bold" />
          <span className="text-charcoal-400 text-sm font-bold">minutes (0 = never)</span>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <button disabled={busy === "expiry"} onClick={() => run("expiry", () => setExpiryMinutes(minutes))} className="px-4 py-3 rounded-xl bg-emerald-500 text-charcoal-950 font-black text-xs uppercase tracking-widest disabled:opacity-50 flex items-center justify-center">
            {busy === "expiry" ? <Loader2 size={14} className="animate-spin" /> : "Save time"}
          </button>
          <button disabled={busy === "now"} onClick={() => run("now", () => expireUnpaidNow())} className="px-4 py-3 rounded-xl bg-white/5 border border-white/10 text-ink font-black text-xs uppercase tracking-widest disabled:opacity-50 flex items-center justify-center">
            {busy === "now" ? <Loader2 size={14} className="animate-spin" /> : "Clean up now"}
          </button>
        </div>
        <p className="text-charcoal-500 text-xs leading-relaxed">
          <span className="text-ink font-bold">Save time</span> only remembers the number of minutes. The app checks for stale orders by itself every 5 minutes.{" "}
          <span className="text-ink font-bold">Clean up now</span> does that check immediately and cancels any unpaid pay-first order older than the saved time. If you changed the number, press Save time first.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-ink font-black text-sm uppercase tracking-widest">Per vendor</h2>
        {vendors.length === 0 && <p className="text-charcoal-500 text-sm">No vendors yet.</p>}
        {vendors.map((v) => {
          const policy = v.payment_policy || "default";
          const effective = policy === "default" ? mode : policy;
          const paysFirst = effective === "required";
          return (
            <div key={v.id} className="bg-white/[0.04] border border-white/10 rounded-2xl p-4 space-y-3">
              <div className="flex items-center justify-between gap-3">
                <p className="text-ink font-black text-sm min-w-0 truncate">{v.business_name || v.id.slice(0, 8)}</p>
                <span className={"shrink-0 text-[10px] font-black uppercase tracking-widest px-3 py-1 rounded-full border " + (paysFirst ? "text-emerald-400 border-emerald-500/30 bg-emerald-500/10" : "text-charcoal-300 border-white/10 bg-white/5")}>
                  {paysFirst ? "Pays first" : "Pays after rider accepts"}
                </span>
              </div>

              <div className="grid grid-cols-3 gap-1 bg-charcoal-950 rounded-xl p-1">
                {POLICY_OPTIONS.map((o) => (
                  <button
                    key={o.value}
                    type="button"
                    disabled={busy === "p" + v.id}
                    onClick={() => o.value !== policy && run("p" + v.id, () => setVendorPolicy(v.id, o.value))}
                    className={"py-2.5 rounded-lg text-[11px] font-black uppercase tracking-wider transition-colors disabled:opacity-60 " + (policy === o.value ? "bg-emerald-500 text-charcoal-950" : "text-charcoal-400 hover:text-ink")}
                  >
                    {o.label}
                  </button>
                ))}
              </div>

              <button
                type="button"
                disabled={busy === "s" + v.id}
                onClick={() => run("s" + v.id, () => setVendorScheduled(v.id, !v.scheduled_enabled))}
                className="w-full flex items-center justify-between gap-3 px-4 py-3 rounded-xl bg-white/[0.03] border border-white/10 text-left disabled:opacity-60"
              >
                <div>
                  <p className="text-ink text-xs font-black">Scheduled windows</p>
                  <p className="text-charcoal-500 text-[11px] mt-0.5">Orders booked for 12:30 / 3:30 always pay first.</p>
                </div>
                <div className={"w-11 h-6 rounded-full relative transition-all shrink-0 " + (v.scheduled_enabled ? "bg-emerald-500" : "bg-charcoal-700")}>
                  <div className={"absolute top-1 w-4 h-4 bg-white rounded-full shadow transition-all " + (v.scheduled_enabled ? "left-6" : "left-1")} />
                </div>
              </button>
            </div>
          );
        })}
      </section>

      {message && <p className={"text-xs font-bold " + (message.ok ? "text-emerald-400" : "text-red-400")}>{message.text}</p>}
    </div>
  );
}
