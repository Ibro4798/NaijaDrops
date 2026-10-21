"use client";

import { useState } from "react";
import { Loader2, UserCheck } from "lucide-react";
import { assignRiderToOrder } from "./actions";

// Offer this order to a chosen rider (works alongside the automatic broadcast; first to accept wins).
export default function AssignRider({ orderId, riders }) {
  const [riderId, setRiderId] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);

  if (!riders || riders.length === 0) return null;

  async function assign() {
    if (!riderId || busy) return;
    setBusy(true);
    setMsg(null);
    const res = await assignRiderToOrder(orderId, riderId);
    setBusy(false);
    setMsg(res?.success
      ? { ok: true, text: "Offered to " + res.name + ". They can accept now." }
      : { ok: false, text: res?.error || "Failed." });
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
            <option key={r.id} value={r.id}>
              {(r.users?.name || "Rider") + (r.operational_status === "online" ? " (online)" : "")}
            </option>
          ))}
        </select>
        <button
          type="button"
          onClick={assign}
          disabled={!riderId || busy}
          className="px-3 py-2 rounded-xl bg-emerald-500 text-charcoal-950 text-[10px] font-black uppercase tracking-widest disabled:opacity-40 flex items-center gap-1"
        >
          {busy ? <Loader2 size={12} className="animate-spin" /> : <UserCheck size={12} />} Assign
        </button>
      </div>
      {msg && <p className={"text-[10px] font-bold " + (msg.ok ? "text-emerald-500" : "text-red-400")}>{msg.text}</p>}
    </div>
  );
}
