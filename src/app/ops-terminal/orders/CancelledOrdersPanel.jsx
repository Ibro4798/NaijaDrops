"use client";

import { XCircle } from "lucide-react";

/**
 * Surfaces cancellation_reason, which was already being captured on every
 * vendor-cancelled order but was never displayed anywhere in the app - it
 * was written to the orders table and then effectively discarded.
 */
export default function CancelledOrdersPanel({ orders }) {
  if (!orders || orders.length === 0) {
    return <p className="text-charcoal-500 text-sm italic py-6 text-center">No recent cancellations.</p>;
  }

  return (
    <div className="space-y-3">
      {orders.map((order) => (
        <div key={order.id} className="bg-charcoal-900/40 border border-white/5 rounded-2xl p-5">
          <div className="flex justify-between items-start gap-4 mb-3">
            <div className="flex items-center gap-2">
              <XCircle size={16} className="text-red-500 shrink-0" />
              <span className="text-white font-black text-sm">ID: {order.id.slice(0, 8)}</span>
            </div>
            <span className="text-charcoal-500 text-xs shrink-0">{new Date(order.updated_at).toLocaleString()}</span>
          </div>
          <div className="text-xs text-charcoal-400 mb-2">
            <span className="text-charcoal-600">{order.pickup_name?.split(',')[0]}</span>
            {" → "}
            <span className="text-charcoal-600">{order.dropoff_name?.split(',')[0]}</span>
          </div>
          <div className="bg-red-500/5 border border-red-500/10 rounded-xl px-4 py-3">
            <div className="text-[9px] font-black text-red-500/70 uppercase tracking-widest mb-1">Reason Given</div>
            <p className="text-red-200/90 text-sm">{order.cancellation_reason || "No reason given"}</p>
          </div>
        </div>
      ))}
    </div>
  );
}
