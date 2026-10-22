"use client";

import { useState } from "react";
import { Loader2, RefreshCw } from "lucide-react";
import { reassignOrder } from "./actions";

export default function ReassignRider({ orderId, currentRiderId, riders }) {
  const [riderId, setRiderId] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);
  const [open, setOpen] = useState(false);

  if (!riders || riders.length === 0) return null;

  async function handleReassign() {
    if (!riderId || busy || riderId === currentRiderId) return;
    if (!confirm("Reassign this order to the selected rider?")) return;
    setBusy(true);
    setMsg(null);
    const res = await reassignOrder(orderId, riderId);
    setBusy(false);
    if (res?.success) {
      setMsg({ ok: true, text: res.msg || "Reassigned." });
      setOpen(false);
    } else {
      setMsg({ ok: false, text: res?.error || "Failed." });
    }
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="text-[10px] font-bold text-amber-400 hover:text-amber-300 flex items-center gap-1"
      >
        <RefreshCw size={11} /> Reassign Rider
      </button>
    );
  }

  return (
    <div className="space-y-2 pt-2 border-t border-white/5">
      <div className="flex gap-2">
        <select
          value={riderId}
          onChange={(e) => setRiderId(e.target.value)}
          className="flex-1 min-w-0 bg-charcoal-950 border border-white/10 rounded-xl px-2 py-1.5 text-xs text-white"
        >
          <option value="">Select replacement...</option>
          {riders
            .filter((r) => r.id !== currentRiderId)
            .map((r) => (
              <option key={r.id} value={r.id} disabled={r.isOnJob}>
                {r.displayName}
                {r.isOnJob
                  ? " 🔴 On Delivery"
                  : r.operational_status === "online"
                  ? " 🟢 Online"
                  : " ⚪ Offline"}
              </option>
            ))}
        </select>
        <button
          onClick={handleReassign}
          disabled={!riderId || busy || riderId === currentRiderId}
          className="px-3 py-1.5 bg-amber-500 hover:bg-amber-400 text-charcoal-950 font-black rounded-xl text-[10px] uppercase tracking-wider disabled:opacity-40 flex items-center gap-1"
        >
          {busy ? <Loader2 size={11} className="animate-spin" /> : "Confirm"}
        </button>
        <button
          onClick={() => setOpen(false)}
          className="px-2 py-1.5 bg-white/5 text-charcoal-400 rounded-xl text-xs hover:text-white"
        >
          ✕
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
