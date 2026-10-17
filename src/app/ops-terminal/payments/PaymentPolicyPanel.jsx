"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { setExpiryMinutes, expireUnpaidNow } from "./actions";

export default function PaymentPolicyPanel({ expiryMinutes }) {
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

  return (
    <div className="space-y-8">
      <section className="space-y-3">
        <h2 className="text-ink font-black text-sm uppercase tracking-widest">How customers pay</h2>
        <p className="text-charcoal-400 text-sm leading-relaxed">
          Customers choose when they pay as they create an order: after they agree a price with a rider, or at pickup.
          Scheduled orders always pay first. There is nothing to configure here.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-ink font-black text-sm uppercase tracking-widest">Cancel unpaid scheduled orders after</h2>
        <div className="flex items-center gap-3">
          <input value={minutes} onChange={(e) => setMinutes(e.target.value)} inputMode="numeric" className="w-24 bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-ink font-bold" />
          <span className="text-charcoal-400 text-sm font-bold">minutes (0 = never)</span>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <button disabled={busy === "expiry"} onClick={() => run("expiry", () => setExpiryMinutes(minutes))} className="px-4 py-3 rounded-xl bg-emerald-500 text-charcoal-950 font-black text-xs uppercase tracking-widest disabled:opacity-60">
            {busy === "expiry" ? <Loader2 size={14} className="animate-spin inline" /> : "Save time"}
          </button>
          <button disabled={busy === "now"} onClick={() => run("now", () => expireUnpaidNow())} className="px-4 py-3 rounded-xl bg-white/5 border border-white/10 text-ink font-black text-xs uppercase tracking-widest disabled:opacity-60">
            {busy === "now" ? <Loader2 size={14} className="animate-spin inline" /> : "Clean up now"}
          </button>
        </div>
        <p className="text-charcoal-500 text-xs leading-relaxed">
          A booking that is still unpaid after this time, or when its window&apos;s cut-off passes, is cancelled automatically so it
          never holds a place. <span className="text-ink font-bold">Clean up now</span> runs that check immediately.
        </p>
      </section>

      {message && <p className={"text-xs font-bold " + (message.ok ? "text-emerald-400" : "text-red-400")}>{message.text}</p>}
    </div>
  );
}
