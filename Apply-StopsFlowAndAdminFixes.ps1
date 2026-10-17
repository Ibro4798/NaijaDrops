<#
  Apply-StopsFlowAndAdminFixes.ps1

  1. "Add another drop-off" now works like the first drop-off: search with
     suggestions or paste a map link, then receiver name + phone (same screens'
     look and wording). Also fixes the price not refreshing if you went back and
     forth between steps.
  2. Admin Payment Policy page: proper 3-button choice per vendor (no more
     white drop-down), a clear "Pays first / Pays after rider accepts" label on
     every vendor, a clearer Scheduled switch, and plain-English help for
     "Save time" and "Clean up now".

  Replaces 3 files (each is backed up first). No database changes.
  Run from the project root:
      powershell -ExecutionPolicy Bypass -File .\Apply-StopsFlowAndAdminFixes.ps1
  Add -DryRun to preview.
#>
param([switch]$DryRun)
$ErrorActionPreference = 'Stop'

$root = (Get-Location).Path
if (-not (Test-Path -LiteralPath (Join-Path $root 'package.json')) -or -not (Test-Path -LiteralPath (Join-Path $root 'src'))) {
  Write-Host 'Run this from your project root (the folder containing package.json and src).' -ForegroundColor Red
  exit 1
}
$stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$backupRoot = Join-Path $root ('_backup_stopsflow_' + $stamp)

function ToLf([string]$s) { return $s.Replace("`r`n", "`n") }

$files = @(
  @{
    Path = 'src/app/ops-terminal/payments/PaymentPolicyPanel.jsx'
    Content = @'
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { setPaymentMode, setVendorPolicy, setVendorScheduled, setExpiryMinutes, expireUnpaidNow } from "./actions";

const POLICY_OPTIONS = [
  { value: "default", label: "Default" },
  { value: "required", label: "Pay first" },
  { value: "optional", label: "Not required" },
];

export default function PaymentPolicyPanel({ mode, expiryMinutes, vendors }) {
  const router = useRouter();
  const [busy, setBusy] = useState(null);
  const [message, setMessage] = useState(null);
  const [minutes, setMinutes] = useState(String(expiryMinutes));

  async function run(key, fn) {
    setBusy(key);
    setMessage(null);
    const res = await fn();
    setBusy(null);
    if (res?.success) {
      if (typeof res.cancelled === "number") {
        setMessage({ ok: true, text: res.cancelled === 0 ? "No unpaid orders were old enough to cancel." : "Cancelled " + res.cancelled + " unpaid order(s)." });
      }
      router.refresh();
    } else {
      setMessage({ ok: false, text: res?.error || "Failed." });
    }
  }

  const modeButton = (value, title, body) => (
    <button
      type="button"
      disabled={busy === "mode"}
      onClick={() => value !== mode && run("mode", () => setPaymentMode(value))}
      className={"text-left p-5 rounded-2xl border transition-colors " + (mode === value ? "border-emerald-500 bg-emerald-500/10" : "border-white/10 bg-white/[0.03] hover:border-white/20")}
    >
      <p className={"font-black text-sm " + (mode === value ? "text-emerald-400" : "text-ink")}>{title}{mode === value ? "  (active)" : ""}</p>
      <p className="text-charcoal-500 text-xs mt-1 leading-relaxed">{body}</p>
    </button>
  );

  return (
    <div className="space-y-8">
      <section className="space-y-3">
        <h2 className="text-ink font-black text-sm uppercase tracking-widest">Default for all vendors</h2>
        <div className="grid gap-3 md:grid-cols-2">
          {modeButton("optional", "Payment not required up front", "Orders are sent to riders straight away, price can be negotiated, and the vendor pays after a rider accepts. This is how the app worked before.")}
          {modeButton("required", "Pay first", "The vendor pays before any rider is notified. Fixed price, no negotiation. Unpaid orders are cancelled automatically after the time below.")}
        </div>
        <p className="text-charcoal-500 text-xs">
          Only vendors set to <span className="text-ink font-bold">Default</span> follow this. A vendor set to Pay first or Not required ignores it.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-ink font-black text-sm uppercase tracking-widest">Cancel unpaid pay-first orders after</h2>
        <div className="flex items-center gap-3">
          <input value={minutes} onChange={(e) => setMinutes(e.target.value)} inputMode="numeric" className="w-24 bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-ink font-bold" />
          <span className="text-charcoal-400 text-sm font-bold">minutes (0 = never)</span>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <button disabled={busy === "expiry"} onClick={() => run("expiry", () => setExpiryMinutes(minutes))} className="px-4 py-3 rounded-xl bg-emerald-500 text-charcoal-950 font-black text-xs uppercase tracking-widest disabled:opacity-50 flex items-center justify-center">
            {busy === "expiry" ? <Loader2 size={14} className="animate-spin" /> : "Save time"}
          </button>
          <button disabled={busy === "now"} onClick={() => run("now", () => expireUnpaidNow())} className="px-4 py-3 rounded-xl bg-white/5 border border-white/10 text-ink font-black text-xs uppercase tracking-widest disabled:opacity-50 flex items-center justify-center">
            {busy === "now" ? <Loader2 size={14} className="animate-spin" /> : "Clean up now"}
          </button>
        </div>
        <p className="text-charcoal-500 text-xs leading-relaxed">
          <span className="text-ink font-bold">Save time</span> only remembers the number of minutes. The app checks for stale orders by itself every 5 minutes.{" "}
          <span className="text-ink font-bold">Clean up now</span> does that check immediately and cancels any unpaid pay-first order older than the saved time. If you changed the number, press Save time first.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-ink font-black text-sm uppercase tracking-widest">Per vendor</h2>
        {vendors.length === 0 && <p className="text-charcoal-500 text-sm">No vendors yet.</p>}
        {vendors.map((v) => {
          const policy = v.payment_policy || "default";
          const effective = policy === "default" ? mode : policy;
          const paysFirst = effective === "required";
          return (
            <div key={v.id} className="bg-white/[0.04] border border-white/10 rounded-2xl p-4 space-y-3">
              <div className="flex items-center justify-between gap-3">
                <p className="text-ink font-black text-sm min-w-0 truncate">{v.business_name || v.id.slice(0, 8)}</p>
                <span className={"shrink-0 text-[10px] font-black uppercase tracking-widest px-3 py-1 rounded-full border " + (paysFirst ? "text-emerald-400 border-emerald-500/30 bg-emerald-500/10" : "text-charcoal-300 border-white/10 bg-white/5")}>
                  {paysFirst ? "Pays first" : "Pays after rider accepts"}
                </span>
              </div>

              <div className="grid grid-cols-3 gap-1 bg-charcoal-950 rounded-xl p-1">
                {POLICY_OPTIONS.map((o) => (
                  <button
                    key={o.value}
                    type="button"
                    disabled={busy === "p" + v.id}
                    onClick={() => o.value !== policy && run("p" + v.id, () => setVendorPolicy(v.id, o.value))}
                    className={"py-2.5 rounded-lg text-[11px] font-black uppercase tracking-wider transition-colors disabled:opacity-60 " + (policy === o.value ? "bg-emerald-500 text-charcoal-950" : "text-charcoal-400 hover:text-ink")}
                  >
                    {o.label}
                  </button>
                ))}
              </div>

              <button
                type="button"
                disabled={busy === "s" + v.id}
                onClick={() => run("s" + v.id, () => setVendorScheduled(v.id, !v.scheduled_enabled))}
                className="w-full flex items-center justify-between gap-3 px-4 py-3 rounded-xl bg-white/[0.03] border border-white/10 text-left disabled:opacity-60"
              >
                <div>
                  <p className="text-ink text-xs font-black">Scheduled windows</p>
                  <p className="text-charcoal-500 text-[11px] mt-0.5">Orders booked for 12:30 / 3:30 always pay first.</p>
                </div>
                <div className={"w-11 h-6 rounded-full relative transition-all shrink-0 " + (v.scheduled_enabled ? "bg-emerald-500" : "bg-charcoal-700")}>
                  <div className={"absolute top-1 w-4 h-4 bg-white rounded-full shadow transition-all " + (v.scheduled_enabled ? "left-6" : "left-1")} />
                </div>
              </button>
            </div>
          );
        })}
      </section>

      {message && <p className={"text-xs font-bold " + (message.ok ? "text-emerald-400" : "text-red-400")}>{message.text}</p>}
    </div>
  );
}
'@
  }
  @{
    Path = 'src/app/ops-terminal/payments/page.jsx'
    Content = @'
import { validateAdmin } from "@/utils/admin";
import { createAdminClient } from "@/utils/supabase/admin";
import PaymentPolicyPanel from "./PaymentPolicyPanel";

export const dynamic = "force-dynamic";

export default async function PaymentPolicyPage() {
  await validateAdmin();
  const db = createAdminClient();

  const { data: settings, error: settingsErr } = await db
    .from("app_settings")
    .select("key, value, updated_at");

  const { data: vendors, error: vendorsErr } = await db
    .from("vendors")
    .select("id, business_name, payment_policy, scheduled_enabled")
    .order("business_name", { ascending: true });

  const setupError = settingsErr || vendorsErr;
  const byKey = Object.fromEntries((settings || []).map((s) => [s.key, s]));
  const mode = byKey.payment_policy?.value?.mode === "required" ? "required" : "optional";
  const expiryMinutes = Number(byKey.unpaid_expiry_minutes?.value?.minutes ?? 30);

  return (
    <div className="p-6 md:p-10 max-w-3xl space-y-6">
      <div>
        <p className="text-[10px] font-black text-emerald-500 uppercase tracking-[0.3em]">Operations</p>
        <h1 className="text-ink font-black text-3xl font-outfit">Payment policy</h1>
        <p className="text-charcoal-500 text-sm mt-1">
          Decide whether vendors pay before riders are notified. The choice is stamped on each order when it is created, so changing it never affects orders already in progress.
        </p>
      </div>

      {setupError ? (
        <div className="p-4 rounded-2xl bg-red-500/10 border border-red-500/20 text-red-400 text-sm font-bold">
          The database is not set up for this yet. Run the SQL migration in Supabase first. ({setupError.message})
        </div>
      ) : (
        <PaymentPolicyPanel mode={mode} expiryMinutes={expiryMinutes} vendors={vendors || []} />
      )}
    </div>
  );
}
'@
  }
  @{
    Path = 'src/app/send-package/stops/page.jsx'
    Content = @'
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
'@
  }
)

$todo = New-Object System.Collections.ArrayList
foreach ($f in $files) {
  $full = Join-Path $root $f.Path
  $content = (ToLf $f.Content) + "`n"
  if (Test-Path -LiteralPath $full) {
    $existing = ToLf ([System.IO.File]::ReadAllText($full))
    if ($existing.TrimStart([char]0xFEFF) -eq $content) { Write-Host "  already up to date: $($f.Path)"; continue }
    [void]$todo.Add(@{ Full = $full; Rel = $f.Path; Content = $content; Exists = $true })
    Write-Host "  will replace:       $($f.Path)"
  } else {
    [void]$todo.Add(@{ Full = $full; Rel = $f.Path; Content = $content; Exists = $false })
    Write-Host "  will create:        $($f.Path)"
  }
}

if ($DryRun) { Write-Host ''; Write-Host 'Dry run only - nothing was written.' -ForegroundColor Cyan; exit 0 }

$enc = New-Object System.Text.UTF8Encoding($false)
foreach ($t in $todo) {
  $dir = Split-Path -Parent $t.Full
  if (-not (Test-Path -LiteralPath $dir)) { New-Item -ItemType Directory -Force -Path $dir | Out-Null }
  if ($t.Exists) {
    $bk = Join-Path $backupRoot $t.Rel
    $bkDir = Split-Path -Parent $bk
    if (-not (Test-Path -LiteralPath $bkDir)) { New-Item -ItemType Directory -Force -Path $bkDir | Out-Null }
    Copy-Item -LiteralPath $t.Full -Destination $bk -Force
  }
  [System.IO.File]::WriteAllText($t.Full, $t.Content, $enc)
}

Write-Host ''
Write-Host "Done. Updated $($todo.Count) file(s)." -ForegroundColor Green
if ($todo.Count -gt 0) { Write-Host "Backups: $backupRoot" -ForegroundColor Green }
Write-Host ''
Write-Host 'NEXT: git checkout -b fix/stops-flow-admin ; git add . ; git commit -m "Stops use first-order flow; clearer admin payment policy" ; git push -u origin fix/stops-flow-admin' -ForegroundColor Cyan
