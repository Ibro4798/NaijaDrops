"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { ArrowLeft, ArrowRight, MapPin, X, Link as LinkIcon, Loader2, Plus, User, Phone } from "lucide-react";
import { getMapboxSuggestions, reverseGeocodeMapbox } from "@/utils/mapbox";
import { extractFirstUrl } from "@/utils/MapResolver";
import { createClient } from "@/utils/supabase/client";
import { fetchPricingSettings, getFuelMultiplier } from "@/utils/pricing";
import { MAX_EXTRA_STOPS, extraStopFees } from "@/utils/stops";

const DRAFT_KEY = "nd_order_draft";
const naira = (n) => "\u20A6" + Number(n || 0).toLocaleString();

const INPUT_CLASS =
  "w-full bg-charcoal-900 border border-white/10 rounded-2xl py-4 pl-11 pr-4 text-ink placeholder:text-charcoal-600 focus:outline-none focus:ring-2 focus:ring-emerald-500/40 focus:border-emerald-500/60 transition-all text-sm font-medium";

// Adding a drop-off works exactly like the first one: search (or paste a map
// link) for the place, then give the receiver's name and phone.
export default function StopsPage() {
  const router = useRouter();
  const supabase = createClient();
  const mapboxToken = process.env.NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN;

  const [draft, setDraft] = useState(null);
  const [extras, setExtras] = useState([]);
  const [fuelMultiplier, setFuelMultiplier] = useState(1);

  const [adding, setAdding] = useState(false);
  const [locInput, setLocInput] = useState("");
  const [loc, setLoc] = useState(null); // { name, lat, lng }
  const [suggestions, setSuggestions] = useState([]);
  const [activeInput, setActiveInput] = useState(false);
  const [rName, setRName] = useState("");
  const [rPhone, setRPhone] = useState("");
  const [note, setNote] = useState("");
  const [formError, setFormError] = useState(null);

  const [showLinkModal, setShowLinkModal] = useState(false);
  const [linkInput, setLinkInput] = useState("");
  const [linkError, setLinkError] = useState(null);
  const [linkLoading, setLinkLoading] = useState(false);

  const searchTimeout = useRef(null);

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

  useEffect(() => () => clearTimeout(searchTimeout.current), []);

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
  const canAddMore = extras.length < MAX_EXTRA_STOPS;

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
    return updated;
  }

  // Same search as step 1: live suggestions, biased towards where the order already is.
  function handleSearch(val) {
    setLocInput(val);
    setLoc(null);
    clearTimeout(searchTimeout.current);
    if (val.length < 2) { setSuggestions([]); return; }
    searchTimeout.current = setTimeout(async () => {
      const results = await getMapboxSuggestions(val, mapboxToken, { lat: draft.dropoff.lat, lng: draft.dropoff.lng });
      setSuggestions(results || []);
    }, 280);
  }

  function selectLocation(s) {
    const point = { name: s.description || s.name, lat: s.lat, lng: s.lng };
    setLoc(point);
    setLocInput(point.name);
    setSuggestions([]);
    setActiveInput(false);
  }

  // Same map-link paste as step 1.
  async function handleLinkPaste() {
    if (!linkInput) return;
    const extractedUrl = extractFirstUrl(linkInput);
    if (!extractedUrl) { setLinkError("No valid map link found in the text."); return; }

    setLinkLoading(true);
    setLinkError(null);
    try {
      const resp = await fetch("/api/resolve-link", {
        method: "POST",
        body: JSON.stringify({ url: extractedUrl }),
        headers: { "Content-Type": "application/json" },
      });
      const data = await resp.json();
      if (data?.lat && data?.lng) {
        const name = await reverseGeocodeMapbox(data.lat, data.lng, mapboxToken);
        selectLocation({ name, lat: data.lat, lng: data.lng });
        setShowLinkModal(false);
        setLinkInput("");
      } else {
        setLinkError(data?.message || data?.error || "Unable to resolve this map link. Please try a different link or search manually.");
      }
    } catch {
      setLinkError("Connection failed. Please check your network and try again.");
    } finally {
      setLinkLoading(false);
    }
  }

  function resetForm() {
    setAdding(false);
    setLocInput(""); setLoc(null); setSuggestions([]); setActiveInput(false);
    setRName(""); setRPhone(""); setNote(""); setFormError(null);
  }

  const canAddStop = !!loc && rName.trim().length >= 2 && rPhone.trim().length >= 8;

  function addStop() {
    if (!canAddStop) {
      setFormError("Pick the location and enter the receiver's name and phone.");
      return;
    }
    save([
      ...extras,
      {
        name: loc.name,
        lat: loc.lat,
        lng: loc.lng,
        recipient_name: rName.trim(),
        recipient_phone: rPhone.trim(),
        note: note.trim(),
      },
    ]);
    resetForm();
  }

  function removeStop(index) {
    save(extras.filter((_, i) => i !== index));
  }

  // Re-save on the way out so the price always matches the stops shown here.
  function handleContinue() {
    save(extras);
    router.push("/send-package/step-3");
  }

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
        {/* Stops so far */}
        <div className="bg-white/[0.04] border border-white/10 rounded-3xl p-5 space-y-3">
          <div className="flex items-start gap-3">
            <MapPin size={16} className="text-emerald-500 mt-0.5 shrink-0" />
            <div className="min-w-0">
              <p className="text-[10px] font-black text-charcoal-500 uppercase tracking-widest">Stop 1</p>
              <p className="text-ink font-bold text-sm">{draft.dropoff?.name}</p>
              <p className="text-charcoal-500 text-xs">{draft.recipient_name}</p>
            </div>
          </div>
          {extras.map((s, i) => (
            <div key={i} className="flex items-start gap-3 border-t border-white/5 pt-3">
              <MapPin size={16} className="text-amber-400 mt-0.5 shrink-0" />
              <div className="min-w-0 flex-1">
                <p className="text-[10px] font-black text-charcoal-500 uppercase tracking-widest">Stop {i + 2} &middot; +{naira(fees[i])}</p>
                <p className="text-ink font-bold text-sm">{s.name}</p>
                <p className="text-charcoal-500 text-xs">{s.recipient_name} &middot; {s.recipient_phone}</p>
              </div>
              <button onClick={() => removeStop(i)} className="w-8 h-8 rounded-lg bg-white/5 flex items-center justify-center text-charcoal-400 hover:text-red-400" aria-label="Remove stop">
                <X size={14} />
              </button>
            </div>
          ))}
        </div>

        {/* Add a drop-off: same fields and steps as the first one */}
        {adding ? (
          <div className="space-y-4">
            <div>
              <label className="text-[10px] font-black text-charcoal-500 uppercase tracking-widest ml-1 mb-2 block">Dropoff Location (Stop {extras.length + 2})</label>
              <div className="relative">
                <MapPin className="absolute left-3.5 top-1/2 -translate-y-1/2 text-emerald-500" size={15} />
                <input
                  type="text"
                  placeholder="Where to deliver to?"
                  value={locInput}
                  onFocus={() => setActiveInput(true)}
                  onChange={(e) => handleSearch(e.target.value)}
                  className="w-full bg-charcoal-900 border border-white/10 rounded-2xl py-4 pl-10 pr-4 text-ink placeholder:text-charcoal-600 focus:outline-none focus:ring-2 focus:ring-emerald-500/40 focus:border-emerald-500/60 transition-all text-sm font-medium"
                />
                {locInput && (
                  <button onClick={() => { setLocInput(""); setLoc(null); setSuggestions([]); }} className="absolute right-4 top-1/2 -translate-y-1/2 text-charcoal-500">
                    <X size={14} />
                  </button>
                )}
              </div>
              <div className="flex gap-2 mt-2">
                <button onClick={() => setShowLinkModal(true)} className="flex-1 flex items-center justify-center gap-1.5 py-2.5 bg-charcoal-800 hover:bg-charcoal-700 border border-white/10 rounded-xl text-charcoal-300 text-xs font-bold transition-all">
                  <LinkIcon size={12} />
                  Paste map link
                </button>
              </div>

              <AnimatePresence>
                {activeInput && suggestions.length > 0 && (
                  <motion.div initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="mt-2 bg-charcoal-900 border border-white/10 rounded-2xl overflow-hidden shadow-xl">
                    {suggestions.map((s, i) => (
                      <button key={i} onClick={() => selectLocation(s)} className="w-full flex items-start gap-3 px-4 py-3.5 text-left hover:bg-white/5 border-b border-white/5 last:border-0 transition-colors">
                        <MapPin className="text-emerald-500 shrink-0 mt-0.5" size={14} />
                        <div>
                          <div className="text-ink text-sm font-semibold leading-tight">{s.name}</div>
                          <div className="text-charcoal-500 text-xs mt-0.5 leading-tight">{s.description}</div>
                        </div>
                      </button>
                    ))}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            <AnimatePresence>
              {loc && (
                <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} className="space-y-3">
                  <label className="text-[10px] font-black text-charcoal-500 uppercase tracking-widest ml-1 block">Receiver Info</label>
                  <div className="relative">
                    <User className="absolute left-4 top-1/2 -translate-y-1/2 text-charcoal-600" size={15} />
                    <input type="text" placeholder="Receiver full name" value={rName} onChange={(e) => setRName(e.target.value)} className={INPUT_CLASS} />
                  </div>
                  <div className="relative">
                    <Phone className="absolute left-4 top-1/2 -translate-y-1/2 text-charcoal-600" size={15} />
                    <input type="tel" placeholder="Receiver phone (e.g. 08012345678)" value={rPhone} onChange={(e) => setRPhone(e.target.value)} className={INPUT_CLASS} />
                  </div>
                  <div className="bg-white/[0.03] border border-white/10 rounded-2xl p-4">
                    <div className="flex items-center gap-2 mb-2">
                      <span className="text-xs font-bold text-charcoal-400">Help your rider find them</span>
                      <span className="text-[9px] font-black uppercase tracking-widest text-charcoal-600 bg-white/5 px-2 py-0.5 rounded-full">Optional</span>
                    </div>
                    <textarea
                      value={note}
                      onChange={(e) => setNote(e.target.value)}
                      placeholder={'e.g. "Blue gate, ask for the security man"'}
                      rows={2}
                      className="w-full bg-charcoal-950 border border-white/10 rounded-xl p-3 text-ink placeholder:text-charcoal-600 text-sm outline-none focus:border-emerald-500 transition-colors resize-none"
                    />
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {formError && <p className="text-red-400 text-xs font-bold">{formError}</p>}

            <div className="flex gap-3">
              <button onClick={resetForm} className="flex-1 py-4 rounded-2xl bg-white/5 border border-white/10 text-charcoal-300 font-black text-sm">Cancel</button>
              <button onClick={addStop} disabled={!canAddStop} className="flex-1 py-4 rounded-2xl bg-emerald-500 hover:bg-emerald-400 text-charcoal-950 font-black text-sm disabled:opacity-40 disabled:cursor-not-allowed">Add this stop</button>
            </div>
          </div>
        ) : canAddMore ? (
          <button onClick={() => setAdding(true)} className="w-full py-4 rounded-2xl bg-white/5 border border-dashed border-emerald-500/40 text-emerald-400 font-black text-sm flex items-center justify-center gap-2">
            <Plus size={16} /> Add another drop-off
          </button>
        ) : (
          <p className="text-charcoal-500 text-xs font-bold text-center">Maximum of {MAX_EXTRA_STOPS + 1} drop-offs per order.</p>
        )}

        {/* Price */}
        <div className="bg-white/[0.04] border border-white/10 rounded-3xl p-5 space-y-2 text-sm">
          <div className="flex justify-between"><span className="text-charcoal-500 font-bold">Delivery to stop 1</span><span className="text-ink font-black">{naira(basePrice)}</span></div>
          {extras.map((s, i) => (
            <div key={i} className="flex justify-between"><span className="text-charcoal-500 font-bold">Stop {i + 2}</span><span className="text-ink font-black">+{naira(fees[i])}</span></div>
          ))}
          <div className="flex justify-between border-t border-white/10 pt-2"><span className="text-ink font-black">Total</span><span className="text-emerald-400 font-black">{naira(total)}</span></div>
        </div>

        <button onClick={handleContinue} disabled={adding} className="w-full bg-emerald-500 hover:bg-emerald-400 disabled:opacity-40 text-charcoal-950 font-black py-5 rounded-2xl text-lg flex items-center justify-center gap-3">
          {extras.length > 0 ? "Continue" : "Continue with one drop-off"} <ArrowRight size={20} />
        </button>
      </div>

      {/* Paste link modal (same as step 1) */}
      <AnimatePresence>
        {showLinkModal && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-50 bg-charcoal-950/90 backdrop-blur-sm flex items-end">
            <motion.div initial={{ y: 100 }} animate={{ y: 0 }} exit={{ y: 100 }} className="w-full bg-charcoal-900 border-t border-white/10 rounded-t-[2rem] p-6">
              <h3 className="text-ink font-black text-lg mb-1">Paste a Map Link</h3>
              <p className="text-charcoal-500 text-sm mb-4">Works with Google Maps, Apple Maps URLs</p>
              <div className="relative mb-4">
                <textarea
                  value={linkInput}
                  onChange={(e) => { setLinkInput(e.target.value); setLinkError(null); }}
                  rows={3}
                  disabled={linkLoading}
                  placeholder="Paste your maps link here..."
                  className={"w-full bg-charcoal-800 border " + (linkError ? "border-red-500/50" : "border-white/10") + " rounded-2xl p-4 text-ink placeholder:text-charcoal-600 focus:outline-none focus:ring-2 focus:ring-emerald-500/40 text-sm font-medium resize-none transition-all"}
                />
                {linkLoading && (
                  <div className="absolute inset-0 bg-charcoal-900/60 backdrop-blur-[2px] rounded-2xl flex flex-col items-center justify-center gap-2">
                    <Loader2 className="text-emerald-500 animate-spin" size={24} />
                    <span className="text-emerald-500 text-[10px] font-black uppercase tracking-widest">Resolving coordinates...</span>
                  </div>
                )}
              </div>
              {linkError && (
                <div className="mb-4 p-4 bg-red-500/10 border border-red-500/20 rounded-2xl flex items-center gap-3">
                  <X className="text-red-500 shrink-0" size={18} />
                  <p className="text-red-400 text-xs font-bold leading-tight">{linkError}</p>
                </div>
              )}
              <div className="flex gap-3">
                <button onClick={() => { setShowLinkModal(false); setLinkInput(""); setLinkError(null); }} disabled={linkLoading} className="flex-1 py-3.5 bg-white/5 border border-white/10 rounded-2xl text-charcoal-300 font-bold text-sm disabled:opacity-50">Cancel</button>
                <button onClick={handleLinkPaste} disabled={linkLoading || !linkInput.trim()} className="flex-1 py-3.5 bg-emerald-500 hover:bg-emerald-400 rounded-2xl text-charcoal-950 font-black text-sm disabled:opacity-50">
                  {linkLoading ? "Extracting..." : "Extract Location"}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
