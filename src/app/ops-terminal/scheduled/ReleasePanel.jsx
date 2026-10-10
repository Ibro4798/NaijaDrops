"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Send } from "lucide-react";
import { releaseToRider } from "./actions";

const naira = (n) => "\u20A6" + Number(n || 0).toLocaleString();

export default function ReleasePanel({ groups, riders }) {
  const router = useRouter();
  const [selected, setSelected] = useState({});
  const [riderId, setRiderId] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState(null);

  const selectedIds = Object.keys(selected).filter((id) => selected[id]);

  function toggle(id) {
    setSelected((s) => ({ ...s, [id]: !s[id] }));
  }

  async function release() {
    setMessage(null);
    if (selectedIds.length === 0) { setMessage({ ok: false, text: "Select at least one order." }); return; }
    if (!riderId) { setMessage({ ok: false, text: "Choose a rider." }); return; }
    setBusy(true);
    const res = await releaseToRider(selectedIds, riderId);
    setBusy(false);
    if (res.success) {
      setMessage({ ok: true, text: "Released " + res.released + " order(s)." + (res.skipped ? " Skipped " + res.skipped + "." : "") + " Call the rider so they open the app." });
      setSelected({});
      router.refresh();
    } else {
      setMessage({ ok: false, text: res.error });
    }
  }

  return (
    <div className="space-y-8">
      {groups.length === 0 && (
        <p className="text-charcoal-500 text-sm font-bold">No paid scheduled orders are waiting.</p>
      )}

      {groups.map((g) => (
        <div key={g.key} className="space-y-3">
          <h2 className="text-emerald-400 font-black text-sm uppercase tracking-widest">{g.label} <span className="text-charcoal-500">({g.orders.length})</span></h2>
          {g.orders.map((o) => (
            <label key={o.id} className="flex items-start gap-4 bg-white/[0.04] border border-white/10 rounded-2xl p-4 cursor-pointer">
              <input type="checkbox" checked={!!selected[o.id]} onChange={() => toggle(o.id)} className="mt-1 w-5 h-5 accent-emerald-500" />
              {o.package_photo_url && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={o.package_photo_url} alt="Package" className="w-16 h-16 rounded-xl object-cover shrink-0" />
              )}
              <div className="min-w-0 flex-1 space-y-1">
                <p className="text-ink font-black text-sm">{o.vendor_name || "Vendor"} &middot; {naira(o.agreed_price)}</p>
                <p className="text-charcoal-400 text-xs truncate">{o.pickup_name} &rarr; {o.dropoff_name}</p>
                <p className="text-charcoal-500 text-[11px] font-bold uppercase tracking-widest">
                  {o.item_size || "size ?"}{Number(o.stop_count) > 1 ? " \u00B7 " + o.stop_count + " drop-offs" : ""}
                  {o.released_to > 0 ? " \u00B7 released to " + o.released_to + " rider(s)" : ""}
                </p>
                {o.item_description && <p className="text-charcoal-500 text-xs truncate">{o.item_description}</p>}
              </div>
            </label>
          ))}
        </div>
      ))}

      <div className="sticky bottom-4 bg-charcoal-900 border border-white/10 rounded-2xl p-4 space-y-3">
        <select value={riderId} onChange={(e) => setRiderId(e.target.value)} className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-ink font-bold">
          <option value="">Choose rider</option>
          {riders.map((r) => (
            <option key={r.id} value={r.id}>{r.full_name || r.phone || r.id.slice(0, 8)} ({r.operational_status})</option>
          ))}
        </select>
        <button onClick={release} disabled={busy} className="w-full bg-emerald-500 disabled:opacity-50 text-charcoal-950 font-black py-4 rounded-xl flex items-center justify-center gap-2 text-sm uppercase tracking-widest">
          {busy ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />} Release {selectedIds.length || ""} to rider
        </button>
        {message && <p className={"text-xs font-bold " + (message.ok ? "text-emerald-400" : "text-red-400")}>{message.text}</p>}
      </div>
    </div>
  );
}
