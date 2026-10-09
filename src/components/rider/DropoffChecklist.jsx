"use client";

import { useState, useEffect, useCallback } from "react";
import { MapPin, Phone, Navigation, CheckCircle2, Loader2 } from "lucide-react";
import { createClient } from "@/utils/supabase/client";

// Drop-off list for an order with more than one stop. The order's own
// "Mark Delivered" slider stays locked until every stop here is delivered.
export default function DropoffChecklist({ orderId, canComplete = false, onProgress }) {
  const [supabase] = useState(() => createClient());
  const [stops, setStops] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState(null);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    const { data, error: loadErr } = await supabase
      .from("order_stops")
      .select("id, seq, dropoff_name, dropoff_lat, dropoff_lng, dropoff_details, recipient_name, recipient_phone, status")
      .eq("order_id", orderId)
      .order("seq", { ascending: true });
    if (loadErr) {
      setError("Couldn't load the drop-off list. Pull to refresh and try again.");
      onProgress?.(false);
    } else {
      const rows = data || [];
      setStops(rows);
      setError(null);
      onProgress?.(rows.length > 0 && rows.every((s) => s.status === "delivered"));
    }
    setLoading(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [supabase, orderId]);

  useEffect(() => { load(); }, [load]);

  async function complete(stopId) {
    setBusyId(stopId);
    setError(null);
    const { error: rpcErr } = await supabase.rpc("complete_order_stop", { p_stop_id: stopId });
    if (rpcErr) setError(rpcErr.message || "Couldn't mark that stop delivered.");
    await load();
    setBusyId(null);
  }

  const doneCount = stops.filter((s) => s.status === "delivered").length;

  return (
    <div className="bg-white/[0.04] border border-white/10 rounded-[2rem] p-5 space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-[10px] font-black text-emerald-500 uppercase tracking-widest">Drop-offs</p>
        <p className="text-charcoal-400 text-[10px] font-black uppercase tracking-widest">{doneCount}/{stops.length} done</p>
      </div>

      {loading && <div className="flex justify-center py-4"><Loader2 size={18} className="animate-spin text-emerald-500" /></div>}
      {error && <p className="text-red-400 text-xs font-bold">{error}</p>}

      {stops.map((s) => {
        const done = s.status === "delivered";
        return (
          <div key={s.id} className={"rounded-2xl border p-4 space-y-3 " + (done ? "border-emerald-500/30 bg-emerald-500/5" : "border-white/10 bg-white/[0.03]")}>
            <div className="flex items-start gap-3">
              {done ? <CheckCircle2 size={18} className="text-emerald-500 mt-0.5 shrink-0" /> : <MapPin size={18} className="text-amber-400 mt-0.5 shrink-0" />}
              <div className="min-w-0 flex-1">
                <p className="text-[10px] font-black text-charcoal-500 uppercase tracking-widest">Stop {s.seq}</p>
                <p className="text-ink font-bold text-sm">{s.dropoff_name}</p>
                {s.recipient_name && <p className="text-charcoal-400 text-xs mt-0.5">{s.recipient_name}</p>}
                {s.dropoff_details && <p className="text-charcoal-500 text-xs mt-1">{s.dropoff_details}</p>}
              </div>
            </div>
            {!done && (
              <div className="grid grid-cols-3 gap-2">
                <a href={"https://www.google.com/maps/dir/?api=1&destination=" + s.dropoff_lat + "," + s.dropoff_lng} target="_blank" rel="noreferrer" className="flex items-center justify-center gap-1.5 py-3 rounded-xl bg-white/5 border border-white/10 text-ink text-[10px] font-black uppercase tracking-widest">
                  <Navigation size={12} /> Go
                </a>
                <a href={"tel:" + (s.recipient_phone || "")} className="flex items-center justify-center gap-1.5 py-3 rounded-xl bg-white/5 border border-white/10 text-ink text-[10px] font-black uppercase tracking-widest">
                  <Phone size={12} /> Call
                </a>
                <button onClick={() => complete(s.id)} disabled={!canComplete || busyId === s.id} className="flex items-center justify-center gap-1.5 py-3 rounded-xl bg-emerald-500 disabled:opacity-40 text-charcoal-950 text-[10px] font-black uppercase tracking-widest">
                  {busyId === s.id ? <Loader2 size={12} className="animate-spin" /> : "Delivered"}
                </button>
              </div>
            )}
          </div>
        );
      })}

      {!canComplete && stops.length > 0 && doneCount < stops.length && (
        <p className="text-charcoal-500 text-[10px] font-bold uppercase tracking-widest text-center">You can mark stops delivered once the trip is in transit.</p>
      )}
    </div>
  );
}
