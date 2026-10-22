"use client";

import { useState, useEffect, Suspense } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { createClient } from "@/utils/supabase/client";
import { ArrowLeft, Zap, Loader2, Lock } from "lucide-react";
import { cancelOrder } from "@/app/vendor/active-orders/actions";
import { formatWindowRange, formatWindowTime } from "@/utils/windows";

const DRAFT_KEY = "nd_order_draft";

// A window can be booked while it is open, before its cut-off, and while places remain.
const isJoinable = (w) =>
  w.is_open && Date.now() < new Date(w.cutoff_at).getTime() && (w.spots_left === null || w.spots_left > 0);

// FIX: this page used to run its own entire parallel matching + negotiation
// system - a "Quick Match" vs "Negotiate Price" toggle, its own bid
// polling, its own accept-bid flow - completely separate from (and
// inconsistent with) the tracking page, which now already owns all of
// this: the waiting-for-rider screen with auto-expanding search radius,
// the incoming-bids inbox, and real offer/accept negotiation in chat. The
// duplicate "Broadcast New Offer" flow here even had the exact same
// one-sided price bug already fixed elsewhere (it wrote agreed_price
// straight to the order the instant an offer was sent, no acceptance
// needed).
//
// This page's only real job is creating the order from the draft built up
// across steps 1-2. Once that's done, everything else - waiting, bidding,
// negotiating, paying - happens on /tracking/[orderId], so this redirects
// there immediately instead of re-implementing any of it here.
function Step3Content() {
  const router = useRouter();
  const supabase = createClient();

  const [draft, setDraft] = useState(null);
  const [creatingOrder, setCreatingOrder] = useState(false);
  const [redirecting, setRedirecting] = useState(false);
  const [error, setError] = useState(null);

  // Scheduled delivery: only vendors ops has switched on, and only into windows ops has created.
  const [scheduledEnabled, setScheduledEnabled] = useState(false);
  const [windowChoice, setWindowChoice] = useState("now");
  const [windows, setWindows] = useState([]);
  // "after_match": pay once a price is agreed. "at_pickup": pay when the rider reaches the pickup point.
  const [paymentTiming, setPaymentTiming] = useState("after_match");

  // Scheduling stays completely hidden until the access check AND the window list have
  // both loaded, and both are applied in one update, so nothing pops in and then vanishes.
  // The list refreshes every minute and when the tab regains focus, so a window ops closes
  // (or whose cut-off passes) disappears cleanly instead of failing at submit.
  const [windowNotice, setWindowNotice] = useState(null);
  useEffect(() => {
    let alive = true;
    const load = async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;
        const [{ data: vendor }, { data: ws }] = await Promise.all([
          supabase.from("vendors").select("scheduled_enabled").eq("user_id", user.id).maybeSingle(),
          supabase.rpc("open_schedule_windows"),
        ]);
        if (!alive) return;
        const enabled = vendor?.scheduled_enabled === true;
        const list = enabled ? (ws || []) : [];
        setScheduledEnabled(enabled);
        setWindows(list);
        setWindowChoice((choice) => {
          if (choice === "now" || list.some((w) => w.id === choice && isJoinable(w))) return choice;
          setWindowNotice("The delivery window you picked just closed, so we switched you back to Now.");
          return "now";
        });
      } catch { /* feature simply stays hidden */ }
    };
    load();
    const refresh = () => { if (document.visibilityState === "visible") load(); };
    const timer = setInterval(refresh, 60000);
    document.addEventListener("visibilitychange", refresh);
    return () => { alive = false; clearInterval(timer); document.removeEventListener("visibilitychange", refresh); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const [showAuthGate, setShowAuthGate] = useState(false);
  const [showPhoneGate, setShowPhoneGate] = useState(false);
  const [phoneInput, setPhoneInput] = useState("");
  const [savingPhone, setSavingPhone] = useState(false);
  const [phoneGateError, setPhoneGateError] = useState(null);

  // Load draft on mount. If an order was already created for this draft
  // (returning to this page, e.g. back button), skip straight to tracking
  // instead of re-showing "Find My Rider".
  useEffect(() => {
    try {
      const d = JSON.parse(sessionStorage.getItem(DRAFT_KEY));
      if (!d?.pickup || !d?.estimated_price) { router.replace("/send-package/step-2"); return; }
      setDraft(d);
      if (d.orderId) {
        setRedirecting(true);
        router.replace(`/tracking/${d.orderId}`);
      }
    } catch { router.replace("/send-package/step-2"); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleFindDriver() {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      setShowAuthGate(true);
      return;
    }

    const { data: userRow } = await supabase.from("users").select("phone").eq("id", user.id).single();
    if (!userRow?.phone) {
      setShowPhoneGate(true);
      return;
    }

    await createOrder();
  }

  async function savePhoneAndContinue() {
    setPhoneGateError(null);
    const cleaned = phoneInput.trim();
    if (cleaned.length < 10) {
      setPhoneGateError("Enter a valid phone number.");
      return;
    }
    setSavingPhone(true);
    const { data: { user } } = await supabase.auth.getUser();
    const { error } = await supabase.from("users").update({ phone: cleaned }).eq("id", user.id);
    setSavingPhone(false);
    if (error) {
      setPhoneGateError("Couldn't save that - try again.");
      return;
    }
    setShowPhoneGate(false);
    await handleFindDriver();
  }

  async function createOrder() {
    setCreatingOrder(true);
    setError(null);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { setShowAuthGate(true); setCreatingOrder(false); return; }

      const { data: vendorProfile } = await supabase
        .from("vendors")
        .select("id")
        .eq("user_id", user.id)
        .single();

      if (!vendorProfile) throw new Error("Vendor profile not found. Please go back and select 'Send Packages' again.");

      const extras = Array.isArray(draft.extra_stops) ? draft.extra_stops : [];
      if (extras.length > 0 && Number(draft.stop_count) !== 1 + extras.length) {
        throw new Error("Please review your drop-offs again before continuing.");
      }

      let scheduledWindow = null;
      if (windowChoice !== "now") {
        scheduledWindow = windows.find((w) => w.id === windowChoice) || null;
        if (!scheduledWindow || !isJoinable(scheduledWindow)) {
          throw new Error("That delivery window has just closed. Please pick another.");
        }
      }

      const { data: order, error: err } = await supabase.from("orders").insert({
        vendor_id: vendorProfile.id,
        pickup_name: draft.pickup.name,
        pickup_lat: draft.pickup.lat,
        pickup_lng: draft.pickup.lng,
        pickup_details: draft.pickup_note || null,
        pickup_voice_note_url: draft.pickup_voice_note_url || null,
        dropoff_name: draft.dropoff.name,
        dropoff_lat: draft.dropoff.lat,
        dropoff_lng: draft.dropoff.lng,
        dropoff_details: draft.dropoff_note || null,
        dropoff_voice_note_url: draft.dropoff_voice_note_url || null,
        item_size: draft.size,
        vehicle_type: draft.vehicle,
        item_description: draft.description,
        package_photo_url: draft.package_photo_url || null,
        voice_note_url: draft.voice_note,
        recipient_name: draft.recipient_name,
        recipient_phone: draft.recipient_phone,
        notify_receiver: draft.notify_receiver,
        agreed_price: draft.estimated_price,
        // Scheduled orders always pay first; the database enforces that regardless of this value.
        payment_timing: windowChoice === "now" ? paymentTiming : "after_match",
        ...(extras.length > 0 ? { stop_count: 1 + extras.length } : {}),
        ...(scheduledWindow ? { schedule_window_id: scheduledWindow.id, scheduled_at: scheduledWindow.starts_at } : {}),
        status: "pending",
      }).select().single();

      if (err) throw err;

      if (extras.length > 0) {
        const stopRows = [
          {
            order_id: order.id,
            seq: 1,
            dropoff_name: draft.dropoff.name,
            dropoff_lat: draft.dropoff.lat,
            dropoff_lng: draft.dropoff.lng,
            dropoff_details: draft.dropoff_note || null,
            recipient_name: draft.recipient_name || null,
            recipient_phone: draft.recipient_phone || null,
          },
          ...extras.map((s, i) => ({
            order_id: order.id,
            seq: i + 2,
            dropoff_name: s.name,
            dropoff_lat: s.lat,
            dropoff_lng: s.lng,
            dropoff_details: s.note || null,
            recipient_name: s.recipient_name || null,
            recipient_phone: s.recipient_phone || null,
          })),
        ];
        const { error: stopsErr } = await supabase.from("order_stops").insert(stopRows);
        if (stopsErr) {
          await cancelOrder(order.id, "Extra drop-offs could not be saved").catch(() => {});
          throw new Error("Could not save your extra drop-offs. Please try again.");
        }
      }

      sessionStorage.setItem(DRAFT_KEY, JSON.stringify({ ...draft, orderId: order.id }));

      setRedirecting(true);
      if (order.payment_required) {
        // PAY FIRST (decided per order by the database from your payment
        // policy): riders are only notified once payment is confirmed (see
        // /api/verify-payment and the Paystack webhook).
        router.replace(`/payment?orderId=${order.id}`);
      } else {
        // Payment not required up front: dispatch straight away, as before.
        fetch("/api/dispatch", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ orderId: order.id })
        }).catch(() => { /* tracking page's own retry loop covers this */ });
        router.replace(`/tracking/${order.id}`);
      }
    } catch (e) {
      const msg = String(e?.message || "");
      if (/WINDOW_FULL/.test(msg)) setError("That delivery window just filled up. Please pick another.");
      else if (/WINDOW_CLOSED|WINDOW_REQUIRED/.test(msg)) setError("That delivery window has just closed. Please pick another.");
      else if (/SCHEDULING_NOT_ENABLED/.test(msg)) setError("Scheduled delivery isn't available on your account yet.");
      else setError("Failed to create order: " + msg);
      setCreatingOrder(false);
    }
  }

  if (!draft || redirecting) return (
    <div className="min-h-screen bg-charcoal-950 flex flex-col items-center justify-center gap-4">
      <div className="w-8 h-8 border-2 border-emerald-500/30 border-t-emerald-500 rounded-full animate-spin" />
      {redirecting && <p className="text-charcoal-500 text-xs font-black uppercase tracking-widest">Taking you to tracking...</p>}
    </div>
  );

  return (
    <div className="min-h-[100dvh] bg-charcoal-950 flex flex-col">
      <div className="flex items-center gap-4 px-5 pt-14 pb-5">
        <button onClick={() => router.push("/send-package/step-2")} className="w-10 h-10 rounded-2xl bg-white/[0.05] border border-white/10 flex items-center justify-center text-ink hover:bg-white/10 transition-colors">
          <ArrowLeft size={18} />
        </button>
        <div>
          <div className="text-[10px] font-black text-charcoal-500 uppercase tracking-widest">Step 3 of 3</div>
          <h1 className="text-xl font-black text-ink tracking-tight">Find a Driver</h1>
        </div>
        <div className="ml-auto flex gap-1.5">
          {[1, 2, 3].map(s => (
            <div key={s} className="h-1.5 rounded-full transition-all w-6 bg-emerald-500" />
          ))}
        </div>
      </div>

      <AnimatePresence>
        {showAuthGate && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 bg-charcoal-950/90 backdrop-blur-md z-50 flex items-end justify-center pb-10 px-5">
            <motion.div initial={{ y: 80, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 80, opacity: 0 }} className="w-full max-w-sm bg-charcoal-900 border border-white/10 rounded-[2rem] p-8 text-center max-h-[90dvh] overflow-y-auto overscroll-contain">
              <div className="w-16 h-16 bg-emerald-500/10 border border-emerald-500/20 rounded-full flex items-center justify-center mx-auto mb-6">
                <Lock size={28} className="text-emerald-500" />
              </div>
              <h2 className="text-xl font-black text-ink mb-3">Almost there!</h2>
              <p className="text-charcoal-400 text-sm leading-relaxed mb-8">
                Create a free account to confirm your delivery. Your route and pricing are saved — just sign in and dispatch.
              </p>
              <button onClick={() => router.push('/auth/login?next=/send-package/step-3')} className="w-full bg-emerald-500 hover:bg-emerald-400 text-charcoal-950 font-black py-4 rounded-2xl mb-3 transition-all">
                Create Free Account
              </button>
              <button onClick={() => setShowAuthGate(false)} className="w-full py-4 text-charcoal-500 font-bold text-sm">
                ← Back to preview
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showPhoneGate && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 bg-charcoal-950/90 backdrop-blur-md z-50 flex items-end justify-center pb-10 px-5">
            <motion.div initial={{ y: 80, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 80, opacity: 0 }} className="w-full max-w-sm bg-charcoal-900 border border-white/10 rounded-[2rem] p-8 text-center max-h-[90dvh] overflow-y-auto overscroll-contain">
              <div className="w-16 h-16 bg-emerald-500/10 border border-emerald-500/20 rounded-full flex items-center justify-center mx-auto mb-6">
                <Lock size={28} className="text-emerald-500" />
              </div>
              <h2 className="text-xl font-black text-ink mb-3">One quick thing</h2>
              <p className="text-charcoal-400 text-sm leading-relaxed mb-6">
                We need a phone number so we can reach you if a rider has trouble finding the pickup, or anything else comes up during this delivery.
              </p>
              <input
                type="tel"
                value={phoneInput}
                onChange={(e) => setPhoneInput(e.target.value)}
                placeholder="e.g. 0803xxxxxxx"
                className="w-full bg-white/5 border-2 border-white/10 rounded-2xl px-5 py-4 text-ink font-bold tracking-tight focus:border-emerald-500 outline-none transition-all mb-3"
              />
              {phoneGateError && <p className="text-red-400 text-xs font-bold mb-3">{phoneGateError}</p>}
              <button onClick={savePhoneAndContinue} disabled={savingPhone} className="w-full bg-emerald-500 hover:bg-emerald-400 disabled:opacity-60 text-charcoal-950 font-black py-4 rounded-2xl mb-3 transition-all">
                {savingPhone ? "Saving..." : "Save & Continue"}
              </button>
              <button onClick={() => setShowPhoneGate(false)} className="w-full py-4 text-charcoal-500 font-bold text-sm">
                ← Back to preview
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="flex-1 flex flex-col items-center justify-center px-5 pb-10">
        <div className="w-full max-w-sm bg-white/[0.04] border border-white/10 rounded-3xl p-6 mb-8">
          <div className="text-[10px] font-black text-emerald-500 uppercase tracking-widest mb-4">Your Delivery Summary</div>
          <div className="space-y-3">
            <div className="flex justify-between text-sm">
              <span className="text-charcoal-500 font-bold">From</span>
              <span className="text-ink font-black text-right max-w-[180px] truncate">{draft.pickup?.name}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-charcoal-500 font-bold">To</span>
              <span className="text-ink font-black text-right max-w-[180px] truncate">{draft.dropoff?.name}</span>
            </div>
            {Array.isArray(draft.extra_stops) && draft.extra_stops.length > 0 && (
              <div className="flex justify-between text-sm">
                <span className="text-charcoal-500 font-bold">Extra drop-offs</span>
                <span className="text-ink font-black">+{draft.extra_stops.length}</span>
              </div>
            )}
            <div className="flex justify-between text-sm">
              <span className="text-charcoal-500 font-bold">Estimated Fare</span>
              <span className="text-emerald-400 font-black">₦{draft.estimated_price?.toLocaleString()}</span>
            </div>
          </div>
        </div>
        {scheduledEnabled && (
          <div className="w-full max-w-sm mb-6 bg-white/[0.04] border border-white/10 rounded-3xl p-5">
            <div className="text-[10px] font-black text-emerald-500 uppercase tracking-widest mb-3">Delivery time</div>
            <div className="grid grid-cols-1 gap-2">
              <button
                type="button"
                onClick={() => setWindowChoice("now")}
                className={"w-full text-left px-4 py-3 rounded-2xl border text-sm font-black " + (windowChoice === "now" ? "border-emerald-500 bg-emerald-500/10 text-emerald-400" : "border-white/10 text-ink")}
              >
                Now - find a rider right away
              </button>
              {windows.map((w) => {
                const open = isJoinable(w);
                return (
                  <button
                    key={w.id}
                    type="button"
                    disabled={!open}
                    onClick={() => setWindowChoice(w.id)}
                    className={"w-full text-left px-4 py-3 rounded-2xl border " + (!open ? "opacity-40 border-white/10 text-ink" : windowChoice === w.id ? "border-emerald-500 bg-emerald-500/10 text-emerald-400" : "border-white/10 text-ink")}
                  >
                    <div className="text-sm font-black">{w.label || formatWindowRange(w.starts_at, w.duration_minutes)}</div>
                    <div className="text-xs font-medium mt-1 text-charcoal-400">
                      {w.label ? formatWindowRange(w.starts_at, w.duration_minutes) + " - " : ""}
                      {open
                        ? "book before " + formatWindowTime(w.cutoff_at) + (w.spots_left !== null ? " - " + w.spots_left + " left" : "")
                        : w.spots_left === 0 ? "Full" : "Closed"}
                    </div>
                  </button>
                );
              })}
            </div>
            {windows.length === 0 && (
              <p className="text-charcoal-500 text-xs mt-3 leading-relaxed">
                No scheduled delivery window is open right now. Check back later, or send now.
              </p>
            )}
            {windowNotice && <p className="text-amber-400 text-xs mt-3 leading-relaxed">{windowNotice}</p>}
          </div>
        )}
        {windowChoice === "now" && (
          <div className="w-full max-w-sm mb-6 bg-white/[0.04] border border-white/10 rounded-3xl p-5">
            <div className="text-[10px] font-black text-emerald-500 uppercase tracking-widest mb-3">When do you pay?</div>
            <div className="grid grid-cols-1 gap-2">
              <button
                type="button"
                onClick={() => setPaymentTiming("after_match")}
                className={"w-full text-left px-4 py-3 rounded-2xl border " + (paymentTiming === "after_match" ? "border-emerald-500 bg-emerald-500/10" : "border-white/10")}
              >
                <div className={"text-sm font-black " + (paymentTiming === "after_match" ? "text-emerald-400" : "text-ink")}>After you agree a price</div>
                <div className="text-xs text-charcoal-400 font-medium mt-1 leading-relaxed">Negotiate with riders first. Once you accept one, you pay and they head to pickup.</div>
              </button>
              <button
                type="button"
                onClick={() => setPaymentTiming("at_pickup")}
                className={"w-full text-left px-4 py-3 rounded-2xl border " + (paymentTiming === "at_pickup" ? "border-emerald-500 bg-emerald-500/10" : "border-white/10")}
              >
                <div className={"text-sm font-black " + (paymentTiming === "at_pickup" ? "text-emerald-400" : "text-ink")}>At pickup</div>
                <div className="text-xs text-charcoal-400 font-medium mt-1 leading-relaxed">Your rider heads to pickup first. You pay when they arrive, then they set off with your package.</div>
              </button>
            </div>
          </div>
        )}
        {error && (
          <div className="w-full max-w-sm mb-6 p-4 bg-red-500/10 border border-red-500/20 rounded-2xl text-red-400 text-sm font-bold">
            {error}
          </div>
        )}
        <button
          onClick={handleFindDriver}
          disabled={creatingOrder}
          className="w-full max-w-sm bg-emerald-500 hover:bg-emerald-400 text-charcoal-950 font-black py-5 rounded-2xl text-lg flex items-center justify-center gap-3 shadow-[0_0_24px_rgba(16,185,129,0.3)] transition-all active:scale-95 disabled:opacity-50"
        >
          {creatingOrder ? <Loader2 size={22} className="animate-spin" /> : <><Zap size={22} /> {windowChoice !== "now" ? "Pay & Schedule" : "Find My Rider"}</>}
        </button>
        <p className="text-charcoal-600 text-xs font-bold mt-4 uppercase tracking-widest">{windowChoice !== "now" ? "Pay securely first" : (paymentTiming === "at_pickup" ? "Pay when your rider arrives" : "Pay after you agree a price")}</p>
        <p className="text-charcoal-700 text-[10px] font-bold mt-6 uppercase tracking-widest text-center max-w-xs leading-relaxed">
          {windowChoice !== "now" ? "You'll pay with Paystack next. Once paid, nearby riders are notified right away (scheduled orders are handed to a rider before your window)." : "You'll be taken straight to live tracking, where you can negotiate price and see bids from nearby riders. " + (paymentTiming === "at_pickup" ? "Your rider heads to pickup first - you pay when they arrive, then they set off with your package." : "Once you accept a rider, you pay and they head to pickup.")}
        </p>
      </div>
    </div>
  );
}

export default function Step3Page() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-charcoal-950 flex items-center justify-center"><div className="w-8 h-8 border-2 border-emerald-500/30 border-t-emerald-500 rounded-full animate-spin" /></div>}>
      <Step3Content />
    </Suspense>
  );
}
