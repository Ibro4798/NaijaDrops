"use client";

import { useState } from "react";
import { Loader2, UserCheck, Zap } from "lucide-react";
import { assignRiderToOrder, forceAssignRiderToOrder } from "./actions";

/**
 * Two-mode assign control shown on open (pending / looking_for_driver) orders.
 *   "Offer Job"   — inserts a broadcast row; rider still taps Accept (safe default)
 *   "Lock to Rider" — force-assigns directly so vendor is prompted to pay right away
 */
export default function AssignRider({ orderId, riders }) {
  const [riderId, setRiderId] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);

  if (!riders || riders.length === 0) return null;

  async function run(fn) {
    if (!riderId || busy) return;
    setBusy(true);
    setMsg(null);
    const res = await fn(orderId, riderId);
    setBusy(false);
    setMsg(
      res?.success
        ? { ok: true, text: res.msg || "Done." }
        : { ok: false, text: res?.error || "Failed." }
    );
  }

  return (
    <div className="space-y-2">
      <div className="flex gap-2">
        <select
          value={riderId}
          onChange={(e) => setRiderId(e.target.value)}
          className="flex-1 min-w-0 bg-charcoal-950 border border-white/10 rounded-xl px-3 py-2 text-xs text-white"
        >
          <option value="">Assign a rider...</option>
          {riders.map((r) => (
            <option key={r.id} value={r.id} disabled={r.isOnJob}>
              {r.displayName}
              {r.isOnJob
                ? " 🔴 On Active Delivery"
                : r.operational_status === "online"
                ? " 🟢 Online"
                : " ⚪ Offline"}
            </option>
          ))}
        </select>
      </div>

      <div className="flex gap-2">
        {/* Offer: broadcast — rider still taps Accept */}
        <button
          type="button"
          onClick={() => run(assignRiderToOrder)}
          disabled={!riderId || busy}
          className="flex-1 px-3 py-2 rounded-xl bg-charcoal-800 border border-white/10 text-charcoal-300 text-[10px] font-black uppercase tracking-widest disabled:opacity-40 flex items-center justify-center gap-1 hover:bg-charcoal-700 transition-all"
        >
          {busy ? <Loader2 size={12} className="animate-spin" /> : <UserCheck size={12} />} Offer
        </button>

        {/* Force lock: direct match, triggers payment immediately */}
        <button
          type="button"
          onClick={() => run(forceAssignRiderToOrder)}
          disabled={!riderId || busy}
          className="flex-1 px-3 py-2 rounded-xl bg-emerald-500 text-charcoal-950 text-[10px] font-black uppercase tracking-widest disabled:opacity-40 flex items-center justify-center gap-1 hover:bg-emerald-400 transition-all"
          title="Directly match this order to the rider — use when you've called them and they're ready"
        >
          {busy ? <Loader2 size={12} className="animate-spin" /> : <Zap size={12} />} Lock In
        </button>
      </div>

      {msg && (
        <p className={"text-[10px] font-bold " + (msg.ok ? "text-emerald-500" : "text-red-400")}>
          {msg.text}
        </p>
      )}
    </div>
  );
}
