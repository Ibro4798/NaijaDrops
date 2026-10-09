"use client";

import Link from "next/link";
import { CalendarClock, CheckCircle2, MapPin, Loader2 } from "lucide-react";
import { formatWindowTime } from "@/utils/windows";

// Shown on the tracking page for a paid order that is waiting for its window.
// Nothing is broadcast to riders for these; ops hands them to a rider.
export default function ScheduledOrderView({ order, isVendorView, onCancel, cancelling }) {
  function confirmCancel() {
    if (window.confirm("Cancel this scheduled delivery? Your payment will be refunded within 24 hours.")) {
      onCancel?.();
    }
  }

  return (
    <div className="min-h-screen bg-charcoal-950 flex flex-col items-center justify-center px-6 text-center gap-6">
      <div className="w-20 h-20 rounded-full bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center">
        <CalendarClock className="text-emerald-500" size={36} />
      </div>
      <div className="space-y-2">
        <p className="text-charcoal-400 text-[11px] font-black uppercase tracking-widest">Scheduled delivery</p>
        <h1 className="text-ink font-black text-3xl font-outfit">{formatWindowTime(order.scheduled_at)}</h1>
        <p className="inline-flex items-center gap-1.5 text-emerald-400 text-xs font-black uppercase tracking-widest">
          <CheckCircle2 size={14} /> Paid
        </p>
      </div>
      <div className="w-full max-w-sm bg-white/[0.04] border border-white/10 rounded-3xl p-5 text-left space-y-3">
        <div className="flex items-start gap-3">
          <MapPin size={16} className="text-emerald-500 mt-0.5 shrink-0" />
          <div className="min-w-0">
            <p className="text-[10px] font-black text-charcoal-500 uppercase tracking-widest">From</p>
            <p className="text-ink font-bold text-sm">{order.pickup_name}</p>
          </div>
        </div>
        <div className="flex items-start gap-3">
          <MapPin size={16} className="text-amber-400 mt-0.5 shrink-0" />
          <div className="min-w-0">
            <p className="text-[10px] font-black text-charcoal-500 uppercase tracking-widest">To{Number(order.stop_count) > 1 ? " (+" + (Number(order.stop_count) - 1) + " more)" : ""}</p>
            <p className="text-ink font-bold text-sm">{order.dropoff_name}</p>
          </div>
        </div>
      </div>
      <p className="text-charcoal-500 text-sm max-w-xs leading-relaxed">
        A rider is assigned shortly before your window. Live tracking appears here as soon as they accept.
      </p>
      <div className="w-full max-w-sm space-y-3">
        {isVendorView && (
          <button onClick={confirmCancel} disabled={cancelling} className="w-full py-4 rounded-2xl bg-white/5 border border-white/10 text-red-400 text-xs font-black uppercase tracking-widest disabled:opacity-50 flex items-center justify-center gap-2">
            {cancelling ? <Loader2 size={14} className="animate-spin" /> : null} Cancel order
          </button>
        )}
        {isVendorView && (
          <Link href="/vendor/active-orders" className="block w-full py-4 rounded-2xl bg-emerald-500 text-charcoal-950 text-xs font-black uppercase tracking-widest">
            Back to my orders
          </Link>
        )}
      </div>
    </div>
  );
}
