"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import { ArrowLeft, ArrowRight, Plus, X, MapPin, Loader2 } from "lucide-react";
import { createClient } from "@/utils/supabase/client";
import { fetchPricingSettings, getFuelMultiplier } from "@/utils/pricing";
import { MAX_EXTRA_STOPS, extraStopFees } from "@/utils/stops";

const MapModal = dynamic(() => import("@/components/MapModal"), { ssr: false });

const DRAFT_KEY = "nd_order_draft";
const naira = (n) => "\u20A6" + Number(n || 0).toLocaleString();

export default function StopsPage() {
  const router = useRouter();
  const supabase = createClient();

  const [draft, setDraft] = useState(null);
  const [extras, setExtras] = useState([]);
  const [fuelMultiplier, setFuelMultiplier] = useState(1);

  const [mapOpen, setMapOpen] = useState(false);
  const [pendingLoc, setPendingLoc] = useState(null);
  const [rName, setRName] = useState("");
  const [rPhone, setRPhone] = useState("");
  const [note, setNote] = useState("");
  const [formError, setFormError] = useState(null);

  useEffect(() => {
    try {
      const d = JSON.parse(sessionStorage.getItem(DRAFT_KEY));
      if (!d?.pickup || !d?.dropoff || !d?.estimated_price) {
        router.replace("/send-package/step-2");
        return;
      }
      setDraft(d);
      setExtras(Array.isArray(d.extra_stops) ? d.extra_stops : []);
    } catch {
      router.replace("/send-package/step-2");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const settings = await fetchPricingSettings(supabase);
        if (!cancelled) setFuelMultiplier(getFuelMultiplier(settings));
      } catch { /* default multiplier of 1 is fine */ }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!draft) {
    return (
      <div className="min-h-screen bg-charcoal-950 flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-emerald-500/30 border-t-emerald-500 rounded-full animate-spin" />
      </div>
    );
  }

  // base_price is written by step-2; the fallback covers a draft saved before it existed.
  const basePrice = Number(draft.base_price ?? (draft.estimated_price - (draft.extras_total || 0)));
  const fees = extraStopFees(draft.dropoff, extras, draft.vehicle, draft.size, fuelMultiplier);
  const extrasTotal = fees.reduce((a, b) => a + b, 0);
  const total = basePrice + extrasTotal;

  function save(nextExtras) {
    const nextFees = extraStopFees(draft.dropoff, nextExtras, draft.vehicle, draft.size, fuelMultiplier);
    const nextExtrasTotal = nextFees.reduce((a, b) => a + b, 0);
    const updated = {
      ...draft,
      base_price: basePrice,
      extra_stops: nextExtras,
      extras_total: nextExtrasTotal,
      stop_count: 1 + nextExtras.length,
      estimated_price: basePrice + nextExtrasTotal,
    };
    sessionStorage.setItem(DRAFT_KEY, JSON.stringify(updated));
    setDraft(updated);
    setExtras(nextExtras);
  }

  function handleLocationPicked({ name, coords }) {
    setMapOpen(false);
    if (!coords) return;
    setPendingLoc({ name, lat: coords.lat, lng: coords.lng });
    setFormError(null);
  }

  function addStop() {
    if (!pendingLoc) return;
    const phoneDigits = rPhone.replace(/\D/g, "");
    if (rName.trim().length < 2) { setFormError("Enter the receiver's name."); return; }
    if (phoneDigits.length < 10) { setFormError("Enter a valid receiver phone number."); return; }
    save([
      ...extras,
      {
        name: pendingLoc.name,
        lat: pendingLoc.lat,
        lng: pendingLoc.lng,
        recipient_name: rName.trim(),
        recipient_phone: rPhone.trim(),
        note: note.trim(),
      },
    ]);
    setPendingLoc(null);
    setRName(""); setRPhone(""); setNote(""); setFormError(null);
  }

  function removeStop(index) {
    save(extras.filter((_, i) => i !== index));
  }

  const canAddMore = extras.length < MAX_EXTRA_STOPS;

  return (
    <div className="min-h-screen bg-charcoal-950 flex flex-col">
      <div className="flex items-center gap-4 px-5 pt-6 pb-4">
        <button onClick={() => router.push("/send-package/step-2")} className="w-10 h-10 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center text-ink">
          <ArrowLeft size={18} />
        </button>
        <div>
          <p className="text-[10px] font-black text-emerald-500 uppercase tracking-widest">Optional</p>
          <h1 className="text-ink font-black text-xl">More drop-offs</h1>
        </div>
      </div>

      <div className="flex-1 px-5 pb-10 max-w-md w-full mx-auto space-y-4">
        <div className="bg-white/[0.04] border border-white/10 rounded-3xl p-5 space-y-3">
          <div className="flex items-start gap-3">
            <MapPin size={16} className="text-emerald-500 mt-0.5 shrink-0" />
            <div className="min-w-0">
              <p className="text-[10px] font-black text-charcoal-500 uppercase tracking-widest">Stop 1</p>
              <p className="text-ink font-bold text-sm truncate">{draft.dropoff?.name}</p>
              <p className="text-charcoal-500 text-xs">{draft.recipient_name}</p>
            </div>
          </div>
          {extras.map((s, i) => (
            <div key={i} className="flex items-start gap-3 border-t border-white/5 pt-3">
              <MapPin size={16} className="text-amber-400 mt-0.5 shrink-0" />
              <div className="min-w-0 flex-1">
                <p className="text-[10px] font-black text-charcoal-500 uppercase tracking-widest">Stop {i + 2} &middot; +{naira(fees[i])}</p>
                <p className="text-ink font-bold text-sm truncate">{s.name}</p>
                <p className="text-charcoal-500 text-xs">{s.recipient_name} &middot; {s.recipient_phone}</p>
              </div>
              <button onClick={() => removeStop(i)} className="w-8 h-8 rounded-lg bg-white/5 flex items-center justify-center text-charcoal-400 hover:text-red-400" aria-label="Remove stop">
                <X size={14} />
              </button>
            </div>
          ))}
        </div>

        {pendingLoc ? (
          <div className="bg-white/[0.04] border border-emerald-500/30 rounded-3xl p-5 space-y-3">
            <p className="text-[10px] font-black text-emerald-500 uppercase tracking-widest">Stop {extras.length + 2}</p>
            <p className="text-ink font-bold text-sm">{pendingLoc.name}</p>
            <input value={rName} onChange={(e) => setRName(e.target.value)} placeholder="Receiver name" className="w-full bg-white/5 border-2 border-white/10 rounded-2xl px-4 py-3 text-ink font-bold focus:border-emerald-500 outline-none" />
            <input value={rPhone} onChange={(e) => setRPhone(e.target.value)} placeholder="Receiver phone e.g. 0803xxxxxxx" inputMode="tel" className="w-full bg-white/5 border-2 border-white/10 rounded-2xl px-4 py-3 text-ink font-bold focus:border-emerald-500 outline-none" />
            <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Landmark or note (optional)" className="w-full bg-white/5 border-2 border-white/10 rounded-2xl px-4 py-3 text-ink font-bold focus:border-emerald-500 outline-none" />
            {formError && <p className="text-red-400 text-xs font-bold">{formError}</p>}
            <div className="flex gap-3">
              <button onClick={() => { setPendingLoc(null); setFormError(null); }} className="flex-1 py-3 rounded-2xl bg-white/5 border border-white/10 text-ink font-black text-xs uppercase tracking-widest">Cancel</button>
              <button onClick={addStop} className="flex-1 py-3 rounded-2xl bg-emerald-500 text-charcoal-950 font-black text-xs uppercase tracking-widest">Add stop</button>
            </div>
          </div>
        ) : canAddMore ? (
          <button onClick={() => setMapOpen(true)} className="w-full py-4 rounded-2xl bg-white/5 border border-dashed border-emerald-500/40 text-emerald-400 font-black text-sm flex items-center justify-center gap-2">
            <Plus size={16} /> Add another drop-off
          </button>
        ) : (
          <p className="text-charcoal-500 text-xs font-bold text-center">Maximum of {MAX_EXTRA_STOPS + 1} drop-offs per order.</p>
        )}

        <div className="bg-white/[0.04] border border-white/10 rounded-3xl p-5 space-y-2 text-sm">
          <div className="flex justify-between"><span className="text-charcoal-500 font-bold">Delivery to stop 1</span><span className="text-ink font-black">{naira(basePrice)}</span></div>
          {extras.map((s, i) => (
            <div key={i} className="flex justify-between"><span className="text-charcoal-500 font-bold">Stop {i + 2}</span><span className="text-ink font-black">+{naira(fees[i])}</span></div>
          ))}
          <div className="flex justify-between border-t border-white/10 pt-2"><span className="text-ink font-black">Total</span><span className="text-emerald-400 font-black">{naira(total)}</span></div>
        </div>

        <button onClick={() => router.push("/send-package/step-3")} disabled={!!pendingLoc} className="w-full bg-emerald-500 hover:bg-emerald-400 disabled:opacity-40 text-charcoal-950 font-black py-5 rounded-2xl text-lg flex items-center justify-center gap-3">
          {extras.length > 0 ? "Continue" : "Continue with one drop-off"} <ArrowRight size={20} />
        </button>
      </div>

      <MapModal
        isOpen={mapOpen}
        onClose={() => setMapOpen(false)}
        onConfirm={handleLocationPicked}
        title={"Drop-off " + (extras.length + 2)}
      />
    </div>
  );
}
