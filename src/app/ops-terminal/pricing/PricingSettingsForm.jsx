"use client";

import { useState } from "react";
import { Loader2, Save, Settings2, CheckCircle2, AlertTriangle } from "lucide-react";
import { updateFuelPrice, updatePricingBounds } from "./actions";

function fmtNaira(n) {
  if (n === null || n === undefined) return "—";
  return `₦${Number(n).toLocaleString()}`;
}

function fmtDate(d) {
  if (!d) return "Never";
  return new Date(d).toLocaleString("en-NG", { dateStyle: "medium", timeStyle: "short" });
}

export default function PricingSettingsForm({ settings, history, multiplier, effectiveRates, baseRates }) {
  const [priceInput, setPriceInput] = useState(settings?.fuel_price_per_litre ?? "");
  const [baselineInput, setBaselineInput] = useState(settings?.fuel_price_baseline ?? "");
  const [minInput, setMinInput] = useState(settings?.min_multiplier ?? "");
  const [maxInput, setMaxInput] = useState(settings?.max_multiplier ?? "");

  const [savingPrice, setSavingPrice] = useState(false);
  const [savingBounds, setSavingBounds] = useState(false);
  const [message, setMessage] = useState(null); // { type: 'success' | 'error', text }

  async function handlePriceSave() {
    setSavingPrice(true);
    setMessage(null);
    const res = await updateFuelPrice(priceInput);
    setSavingPrice(false);
    setMessage(res.success
      ? { type: "success", text: "Fuel price updated - new deliveries will quote using this price right away." }
      : { type: "error", text: res.error });
  }

  async function handleBoundsSave() {
    setSavingBounds(true);
    setMessage(null);
    const res = await updatePricingBounds({
      fuel_price_baseline: baselineInput,
      min_multiplier: minInput,
      max_multiplier: maxInput,
    });
    setSavingBounds(false);
    setMessage(res.success
      ? { type: "success", text: "Pricing bounds updated." }
      : { type: "error", text: res.error });
  }

  return (
    <div className="space-y-8">
      {message && (
        <div className={`flex items-start gap-3 p-4 rounded-2xl border text-sm font-medium ${
          message.type === "success"
            ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-400"
            : "bg-red-500/10 border-red-500/20 text-red-400"
        }`}>
          {message.type === "success" ? <CheckCircle2 size={16} className="mt-0.5 shrink-0" /> : <AlertTriangle size={16} className="mt-0.5 shrink-0" />}
          <span>{message.text}</span>
        </div>
      )}

      {/* Current state */}
      <div className="grid grid-cols-3 gap-4">
        <div className="bg-white/5 border border-white/10 rounded-2xl p-4">
          <div className="text-[10px] font-black uppercase tracking-widest text-charcoal-500 mb-1">Current price</div>
          <div className="text-white font-black text-xl">{fmtNaira(settings?.fuel_price_per_litre)}<span className="text-charcoal-500 text-xs font-bold">/L</span></div>
        </div>
        <div className="bg-white/5 border border-white/10 rounded-2xl p-4">
          <div className="text-[10px] font-black uppercase tracking-widest text-charcoal-500 mb-1">Baseline</div>
          <div className="text-white font-black text-xl">{fmtNaira(settings?.fuel_price_baseline)}<span className="text-charcoal-500 text-xs font-bold">/L</span></div>
        </div>
        <div className="bg-white/5 border border-white/10 rounded-2xl p-4">
          <div className="text-[10px] font-black uppercase tracking-widest text-charcoal-500 mb-1">Active multiplier</div>
          <div className="text-emerald-400 font-black text-xl">{multiplier.toFixed(2)}×</div>
        </div>
      </div>

      {/* Effective rate preview */}
      <div className="bg-white/5 border border-white/10 rounded-2xl p-5">
        <div className="text-[10px] font-black uppercase tracking-widest text-charcoal-500 mb-3">Effective per-km rate right now</div>
        <div className="grid grid-cols-3 gap-4">
          {["BIKE", "CAR", "VAN"].map((key) => (
            <div key={key}>
              <div className="text-charcoal-500 text-[10px] font-bold uppercase mb-1">{key}</div>
              <div className="text-white font-black text-sm">{fmtNaira(effectiveRates?.[key]?.perKm)}<span className="text-charcoal-500 text-[10px]">/km</span></div>
              <div className="text-charcoal-600 text-[10px]">base {fmtNaira(baseRates?.[key]?.perKm)}/km</div>
            </div>
          ))}
        </div>
      </div>

      {/* Manual price update - the whole point: type a number, click update */}
      <div className="bg-white/5 border border-white/10 rounded-2xl p-5 space-y-4">
        <div className="text-[10px] font-black uppercase tracking-widest text-charcoal-500">Set current price</div>
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <span className="absolute left-4 top-1/2 -translate-y-1/2 text-charcoal-500 font-bold">₦</span>
            <input
              type="number"
              value={priceInput}
              onChange={(e) => setPriceInput(e.target.value)}
              placeholder="Price per litre"
              className="w-full bg-charcoal-800 border border-white/10 rounded-2xl pl-8 pr-4 py-3 text-white font-bold focus:outline-none focus:ring-2 focus:ring-emerald-500/40"
            />
          </div>
          <button
            onClick={handlePriceSave}
            disabled={savingPrice}
            className="flex items-center justify-center gap-2 px-5 py-3 bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 text-charcoal-950 rounded-2xl font-black text-xs uppercase tracking-widest transition-all active:scale-95"
          >
            {savingPrice ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />} Update
          </button>
        </div>
        <p className="text-charcoal-500 text-xs">
          Type today&apos;s pump price per litre and click Update - every delivery quoted after that uses the new price immediately. Nothing runs automatically; this is the only way the price changes.
        </p>
      </div>

      {/* Advanced bounds - optional, collapsed by default */}
      <details className="bg-white/5 border border-white/10 rounded-2xl p-5">
        <summary className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-charcoal-400 cursor-pointer select-none">
          <Settings2 size={14} /> Advanced: baseline &amp; safety bounds
        </summary>
        <div className="mt-4 grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div>
            <label className="text-charcoal-500 text-[10px] font-bold uppercase block mb-1">Baseline (₦/L)</label>
            <input type="number" value={baselineInput} onChange={(e) => setBaselineInput(e.target.value)}
              className="w-full bg-charcoal-800 border border-white/10 rounded-xl px-3 py-2 text-white text-sm font-bold focus:outline-none focus:ring-2 focus:ring-emerald-500/40" />
          </div>
          <div>
            <label className="text-charcoal-500 text-[10px] font-bold uppercase block mb-1">Min multiplier</label>
            <input type="number" step="0.05" value={minInput} onChange={(e) => setMinInput(e.target.value)}
              className="w-full bg-charcoal-800 border border-white/10 rounded-xl px-3 py-2 text-white text-sm font-bold focus:outline-none focus:ring-2 focus:ring-emerald-500/40" />
          </div>
          <div>
            <label className="text-charcoal-500 text-[10px] font-bold uppercase block mb-1">Max multiplier</label>
            <input type="number" step="0.05" value={maxInput} onChange={(e) => setMaxInput(e.target.value)}
              className="w-full bg-charcoal-800 border border-white/10 rounded-xl px-3 py-2 text-white text-sm font-bold focus:outline-none focus:ring-2 focus:ring-emerald-500/40" />
          </div>
        </div>
        <button
          onClick={handleBoundsSave}
          disabled={savingBounds}
          className="mt-4 flex items-center justify-center gap-2 px-5 py-3 bg-white/5 hover:bg-white/10 border border-white/10 disabled:opacity-50 text-white rounded-2xl font-black text-xs uppercase tracking-widest transition-all active:scale-95"
        >
          {savingBounds ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />} Save bounds
        </button>
        <p className="text-charcoal-500 text-xs mt-3">
          Baseline is the price PRICING_RATES.perKm was calibrated at (multiplier = current ÷ baseline).
          Min/max clamp how far a single price update can move rates in one step, so a typo can&apos;t send prices to zero or 10x.
        </p>
      </details>

      {/* History */}
      <div>
        <div className="text-[10px] font-black uppercase tracking-widest text-charcoal-500 mb-3">Recent changes</div>
        {history.length === 0 ? (
          <p className="text-charcoal-600 text-sm italic">No price changes logged yet.</p>
        ) : (
          <div className="space-y-2">
            {history.map((h) => (
              <div key={h.id} className="flex items-center justify-between bg-white/5 border border-white/10 rounded-xl px-4 py-3">
                <div>
                  <span className="text-white font-bold text-sm">{fmtNaira(h.price)}/L</span>
                  <span className="text-charcoal-500 text-xs ml-2">by {h.users?.full_name || "admin"}</span>
                </div>
                <span className="text-charcoal-500 text-xs shrink-0 ml-3">{fmtDate(h.created_at)}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
