"use client";

import { useState, useEffect, useRef, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { createClient } from "@/utils/supabase/client";
import {
  ArrowLeft, Star, Zap, MessageCircle, Clock, Bike, Car,
  CheckCircle2, X, ChevronRight, Loader2, AlertCircle, DollarSign, Lock
} from "lucide-react";

const DRAFT_KEY = "nd_order_draft";
const NEGOTIATION_TIMEOUT = 60; // seconds

function Step3Content() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const supabase = createClient();

  const [draft, setDraft] = useState(null);
  const [orderId, setOrderId] = useState(searchParams.get("orderId") || null);
  const [mode, setMode] = useState("quickmatch"); // 'quickmatch' | 'negotiate'
  const [matchState, setMatchState] = useState("idle"); // 'idle' | 'searching' | 'found' | 'accepted' | 'no_drivers'
  const [matchedRider, setMatchedRider] = useState(null);
  const [bids, setBids] = useState([]);
  const [offerPrice, setOfferPrice] = useState("");
  const [offerSent, setOfferSent] = useState(false);
  const [timeLeft, setTimeLeft] = useState(NEGOTIATION_TIMEOUT);
  const [creatingOrder, setCreatingOrder] = useState(false);
  const [error, setError] = useState(null);

  // ✅ NEW: Auth gate state — show signup prompt instead of redirecting
  const [showAuthGate, setShowAuthGate] = useState(false);
  const [showLaunchGate, setShowLaunchGate] = useState(false);

  const timerRef = useRef(null);
  const channelRef = useRef(null);
  const pollingRef = useRef(null);

  // Load draft on mount — do NOT create order or check auth yet
  useEffect(() => {
    try {
      const d = JSON.parse(sessionStorage.getItem(DRAFT_KEY));
      if (!d?.pickup || !d?.estimated_price) { router.replace("/send-package/step-2"); return; }
      setDraft(d);
      setOfferPrice(String(d.estimated_price));
      // If we already have an orderId (returning to this page), resume match
      if (d.orderId) {
        setOrderId(d.orderId);
        setMatchState("searching");
        startQuickMatch(d.orderId);
      }
    } catch { router.replace("/send-package/step-2"); }
  }, []);

  // ✅ NEW: "Find My Driver" button handler — checks auth before creating order
  // Soft pre-launch gate: everyone except this one test account sees the
  // launch-date message instead of actually dispatching. Intentionally a UI-
  // level check, not a hard backend block - this isn't protecting anything
  // sensitive, just managing expectations before the real pilot goes live.
  const LAUNCH_GATE_ALLOWED_EMAIL = "ibroibrahim665@gmail.com";

  async function handleFindDriver() {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      // Show auth gate instead of redirecting away
      setShowAuthGate(true);
      return;
    }
    if (user.email !== LAUNCH_GATE_ALLOWED_EMAIL) {
      setShowLaunchGate(true);
      return;
    }
    await createOrder();
  }

  async function createOrder() {
    setCreatingOrder(true);
    setMatchState("searching");
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { setShowAuthGate(true); setCreatingOrder(false); return; }

      // Get Vendor Profile ID (Required for Foreign Key)
      const { data: vendorProfile } = await supabase
        .from("vendors")
        .select("id")
        .eq("user_id", user.id)
        .single();

      if (!vendorProfile) throw new Error("Vendor profile not found. Please go back and select 'Send Packages' again.");

      const { data: order, error: err } = await supabase.from("orders").insert({
        vendor_id: vendorProfile.id,
        pickup_name: draft.pickup.name,
        pickup_lat: draft.pickup.lat,
        pickup_lng: draft.pickup.lng,
        dropoff_name: draft.dropoff.name,
        dropoff_lat: draft.dropoff.lat,
        dropoff_lng: draft.dropoff.lng,
        item_size: draft.size,
        vehicle_type: draft.vehicle,
        item_description: draft.description,
        voice_note_url: draft.voice_note,
        // ✅ FIX: Use correct column names matching DB schema
        recipient_name: draft.recipient_name,
        recipient_phone: draft.recipient_phone,
        notify_receiver: draft.notify_receiver,
        agreed_price: draft.estimated_price,
        status: "pending",
      }).select().single();

      if (err) throw err;
      setOrderId(order.id);
      sessionStorage.setItem(DRAFT_KEY, JSON.stringify({ ...draft, orderId: order.id }));
      startQuickMatch(order.id);
    } catch (e) {
      setError("Failed to create order: " + e.message);
      setMatchState("idle");
    } finally {
      setCreatingOrder(false);
    }
  }

  async function startQuickMatch(oid) {
    setMatchState("searching");
    setError(null);
    if (pollingRef.current) clearInterval(pollingRef.current);
    
    // Setup Realtime listener first (to catch the update when matched/assigned)
    const channel = supabase.channel(`order-match-${oid}`)
      .on("postgres_changes", {
        event: "UPDATE", schema: "public", table: "orders", filter: `id=eq.${oid}`
      }, async (payload) => {
        if (payload.new.rider_id && payload.new.status === "matched") {
          if (pollingRef.current) clearInterval(pollingRef.current);
          const { data: rider } = await supabase
            .from("riders")
            .select("*, users(full_name, email)")
            .eq("id", payload.new.rider_id)
            .single();
            
          setMatchedRider({
            id: payload.new.rider_id,
            name: rider?.users?.full_name || "Rider",
            vehicle_type: rider?.vehicle_type || "bike",
            plate: rider?.plate_number || "",
            rating: rider?.rating || 5.0,
            eta_min: Math.round(5 + Math.random() * 10),
            price: payload.new.agreed_price,
          });
          setMatchState("found");
        }
      })
      .subscribe();
    channelRef.current = channel;

    // Trigger the actual Dispatch Engine
    const triggerDispatch = async () => {
      try {
        const response = await fetch("/api/dispatch", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ orderId: oid })
        });
        return await response.json();
      } catch (e) {
        console.error("Dispatch Fault:", e);
        return { success: false, message: e.message };
      }
    };

    // FIX: this result used to be thrown away entirely - if dispatch failed
    // for any reason (including the RLS bug that silently blocked every
    // broadcast until now), the vendor just watched "searching..." with zero
    // explanation until the 15s poll cycle eventually gave up.
    const firstAttempt = await triggerDispatch();
    if (firstAttempt && firstAttempt.success === false && firstAttempt.message) {
      setError(firstAttempt.message);
    }

    // Poll every 15 seconds to check status and expand radius if necessary
    pollingRef.current = setInterval(async () => {
      const { data: order, error: orderErr } = await supabase
        .from("orders")
        .select("status, broadcast_radius_km, max_broadcast_radius_km")
        .eq("id", oid)
        .single();

      if (orderErr || !order) return;

      if (order.status !== "pending") {
        clearInterval(pollingRef.current);
        return;
      }

      const currentRadius = Number(order.broadcast_radius_km) || 1.5;
      const maxRadius = Number(order.max_broadcast_radius_km) || 8;

      if (currentRadius >= maxRadius) {
        clearInterval(pollingRef.current);
        setMatchState("no_drivers");
        setError("No riders nearby within the maximum search radius.");
        return;
      }

      // Expand order radius in DB
      await supabase.rpc('expand_order_radius', { p_order_id: oid });

      // Re-trigger dispatch API to broadcast to the new radius pool
      await triggerDispatch();
    }, 15000);
  }

  function startNegotiationTimer() {
    setTimeLeft(NEGOTIATION_TIMEOUT);
    timerRef.current = setInterval(() => {
      setTimeLeft(t => {
        if (t <= 1) {
          clearInterval(timerRef.current);
          setMode("quickmatch");
          setOfferSent(false);
          setBids([]);
          if (orderId) startQuickMatch(orderId);
          return 0;
        }
        return t - 1;
      });
    }, 1000);
  }

  async function sendOffer() {
    if (!offerPrice || !orderId) return;
    const price = parseInt(offerPrice);
    if (isNaN(price) || price < 100) { setError("Please enter a valid price (min ₦100)"); return; }

    await supabase.from("orders").update({ agreed_price: price, status: "negotiating" }).eq("id", orderId);

    // ✅ FIX: Use correct column names in join
    const channel = supabase.channel(`bids-${orderId}`)
      .on("postgres_changes", {
        event: "INSERT", schema: "public", table: "bids", filter: `order_id=eq.${orderId}`
      }, async (payload) => {
        const { data: bid } = await supabase.from("bids")
          .select("*, riders(user_id, vehicle_type, plate_number, rating, users(full_name))")
          .eq("id", payload.new.id).single();
        if (bid) setBids(prev => [...prev, bid]);
      })
      .subscribe();
    channelRef.current = channel;

    setOfferSent(true);
    startNegotiationTimer();
  }

  async function acceptBid(bid) {
    clearInterval(timerRef.current);
    if (pollingRef.current) clearInterval(pollingRef.current);
    if (channelRef.current) supabase.removeChannel(channelRef.current);

    const { error: rpcErr } = await supabase.rpc('accept_bid', { p_order_id: orderId, p_bid_id: bid.id });
    if (rpcErr) {
      setError("Failed to accept bid: " + rpcErr.message);
      return;
    }

    setMatchedRider({
      id: bid.rider_id,
      // ✅ FIX: full_name not name
      name: bid.riders?.users?.full_name || "Driver",
      vehicle_type: bid.riders?.vehicle_type || "bike",
      plate: bid.riders?.plate_number || "",
      // ✅ FIX: rating not avg_rating
      rating: bid.riders?.rating || 5.0,
      eta_min: Math.round(5 + Math.random() * 10),
      price: bid.amount,
    });
    setMatchState("accepted");
    setTimeout(() => router.push(`/send-package/confirm?orderId=${orderId}`), 1000);
  }

  async function cancelMatch() {
    if (!orderId) return;
    if (pollingRef.current) clearInterval(pollingRef.current);
    
    const { data: order } = await supabase.from("orders").select("rider_id").eq("id", orderId).single();
    if (order?.rider_id) {
      await supabase.from("riders").update({ operational_status: "online" }).eq("user_id", order.rider_id);
    }

    setMatchState("searching");
    await supabase.from("orders").update({ rider_id: null, status: "pending" }).eq("id", orderId);
    setMatchedRider(null);
    setBids([]);
    setOfferSent(false);
    if (orderId) startQuickMatch(orderId);
  }

  async function acceptQuickMatch() {
    if (!matchedRider) return;
    await supabase.from("riders").update({ operational_status: "awaiting_payment" }).eq("user_id", matchedRider.id);
    setMatchState("accepted");
    setTimeout(() => router.push(`/send-package/confirm?orderId=${orderId}`), 800);
  }

  useEffect(() => {
    return () => {
      clearInterval(timerRef.current);
      if (pollingRef.current) clearInterval(pollingRef.current);
      if (channelRef.current) supabase.removeChannel(channelRef.current);
    };
  }, []);

  if (!draft) return (
    <div className="min-h-screen bg-charcoal-950 flex items-center justify-center">
      <div className="w-8 h-8 border-2 border-emerald-500/30 border-t-emerald-500 rounded-full animate-spin" />
    </div>
  );

  return (
    <div className="min-h-[100dvh] bg-charcoal-950 flex flex-col">
      {/* Header */}
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
            <div key={s} className={`h-1.5 rounded-full transition-all w-6 bg-emerald-500`} />
          ))}
        </div>
      </div>

      {/* ✅ NEW: Auth Gate Modal — shown instead of redirect */}
      <AnimatePresence>
        {showAuthGate && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-charcoal-950/90 backdrop-blur-md z-50 flex items-end justify-center pb-10 px-5"
          >
            <motion.div
              initial={{ y: 80, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 80, opacity: 0 }}
              className="w-full max-w-sm bg-charcoal-900 border border-white/10 rounded-[2rem] p-8 text-center"
            >
              <div className="w-16 h-16 bg-emerald-500/10 border border-emerald-500/20 rounded-full flex items-center justify-center mx-auto mb-6">
                <Lock size={28} className="text-emerald-500" />
              </div>
              <h2 className="text-xl font-black text-ink mb-3">Almost there!</h2>
              <p className="text-charcoal-400 text-sm leading-relaxed mb-8">
                Create a free account to confirm your delivery. Your route and pricing are saved — just sign in and dispatch.
              </p>
              <button
                onClick={() => router.push('/auth/login?next=/send-package/step-3')}
                className="w-full bg-emerald-500 hover:bg-emerald-400 text-charcoal-950 font-black py-4 rounded-2xl mb-3 transition-all"
              >
                Create Free Account
              </button>
              <button
                onClick={() => setShowAuthGate(false)}
                className="w-full py-4 text-charcoal-500 font-bold text-sm"
              >
                ← Back to preview
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Pre-launch gate: everyone except the one test account sees this
          instead of actually dispatching a rider. */}
      <AnimatePresence>
        {showLaunchGate && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-charcoal-950/90 backdrop-blur-md z-50 flex items-end justify-center pb-10 px-5"
          >
            <motion.div
              initial={{ y: 80, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 80, opacity: 0 }}
              className="w-full max-w-sm bg-charcoal-900 border border-white/10 rounded-[2rem] p-8 text-center"
            >
              <div className="w-16 h-16 bg-emerald-500/10 border border-emerald-500/20 rounded-full flex items-center justify-center mx-auto mb-6">
                <Clock size={28} className="text-emerald-500" />
              </div>
              <h2 className="text-xl font-black text-ink mb-3">We're almost open!</h2>
              <p className="text-charcoal-400 text-sm leading-relaxed mb-2">
                NaijaDrops launches fully in Kano on <span className="text-ink font-bold">Monday, August 10, 2026</span>.
              </p>
              <p className="text-charcoal-500 text-xs leading-relaxed mb-8">
                Your route and pricing are saved - come back after launch and dispatch will be live.
              </p>
              <button
                onClick={() => setShowLaunchGate(false)}
                className="w-full bg-emerald-500 hover:bg-emerald-400 text-charcoal-950 font-black py-4 rounded-2xl transition-all"
              >
                Got it
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ✅ NEW: Idle state — shown before user clicks "Find My Driver" */}
      {matchState === "idle" && (
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
              <div className="flex justify-between text-sm">
                <span className="text-charcoal-500 font-bold">Estimated Fare</span>
                <span className="text-emerald-400 font-black">₦{draft.estimated_price?.toLocaleString()}</span>
              </div>
            </div>
          </div>
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
            {creatingOrder ? <Loader2 size={22} className="animate-spin" /> : <><Zap size={22} /> Find My Rider</>}
          </button>
          <p className="text-charcoal-600 text-xs font-bold mt-4 uppercase tracking-widest">No payment until delivery</p>
        </div>
      )}

      {/* Mode Toggle — only show when actively searching/matching */}
      {matchState !== "idle" && (
        <>
          <div className="mx-5 mb-6 bg-white/[0.04] border border-white/10 rounded-2xl p-1 flex gap-1">
            <button onClick={() => { setMode("quickmatch"); setOfferSent(false); clearInterval(timerRef.current); if (orderId && matchState !== "found") startQuickMatch(orderId); }}
              className={`flex-1 py-2.5 rounded-xl text-sm font-black transition-all flex items-center justify-center gap-1.5 ${mode === "quickmatch" ? "bg-emerald-500 text-charcoal-950 shadow-[0_0_12px_rgba(16,185,129,0.4)]" : "text-charcoal-500 hover:text-ink"}`}>
              <Zap size={14} /> Quick Match
            </button>
            <button onClick={() => setMode("negotiate")}
              className={`flex-1 py-2.5 rounded-xl text-sm font-black transition-all flex items-center justify-center gap-1.5 ${mode === "negotiate" ? "bg-white/10 text-ink" : "text-charcoal-500 hover:text-ink"}`}>
              <MessageCircle size={14} /> Negotiate Price
            </button>
          </div>

          <div className="flex-1 px-5 overflow-y-auto pb-8">
            <AnimatePresence mode="wait">

              {/* ====== QUICK MATCH MODE ====== */}
              {(mode === "quickmatch" || (mode === "negotiate" && matchState === "found")) && (
                <motion.div key="quickmatch" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} className="space-y-6">
                  {mode === "negotiate" && <div className="text-[10px] font-black text-charcoal-500 uppercase tracking-widest px-1">Instant Match Available</div>}
                  
                  {matchState === "searching" && mode === "quickmatch" && (
                    <div className="flex flex-col items-center py-16">
                      <div className="relative mb-8">
                        <div className="w-32 h-32 rounded-full bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center">
                          <div className="w-16 h-16 bg-emerald-500/20 rounded-full flex items-center justify-center">
                            <Loader2 size={32} className="text-emerald-500 animate-spin" />
                          </div>
                        </div>
                        <div className="absolute inset-0 w-32 h-32 rounded-full border border-emerald-500/30 animate-ping opacity-20" />
                      </div>
                      <h2 className="text-ink font-black text-xl mb-2">Finding nearby riders...</h2>
                      <p className="text-charcoal-500 text-sm text-center max-w-[240px]">Scanning riders within 3km of your pickup point</p>
                    </div>
                  )}

                  {matchState === "found" && matchedRider && (
                    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="space-y-4">
                      <div className="bg-white/[0.04] border border-white/10 rounded-3xl p-5 relative overflow-hidden">
                        <div className="absolute top-0 right-0 px-3 py-1 bg-emerald-500 text-charcoal-950 font-black text-[10px] uppercase tracking-widest rounded-bl-xl">Best Value</div>
                        <div className="flex items-center gap-4 mb-5">
                          <div className="w-16 h-16 bg-emerald-500/10 rounded-2xl flex items-center justify-center text-3xl border border-emerald-500/20">
                            {matchedRider.vehicle_type === "car" ? "🚗" : "🏍️"}
                          </div>
                          <div className="flex-1">
                            <div className="text-ink font-black text-xl">{matchedRider.name}</div>
                            <div className="flex items-center gap-2 mt-1">
                              <div className="flex items-center gap-1 text-amber-400 font-black text-xs">⭐ {matchedRider.rating}</div>
                              <span className="text-charcoal-600">·</span>
                              <span className="text-ink font-black text-lg">₦{matchedRider.price?.toLocaleString()}</span>
                            </div>
                          </div>
                        </div>

                        <div className="flex gap-3">
                          <button onClick={cancelMatch} className="flex-1 py-4 bg-white/5 border border-white/10 text-ink font-black rounded-2xl uppercase text-[10px] tracking-widest">
                            Cancel Match
                          </button>
                          <button onClick={acceptQuickMatch}
                            className="flex-[2] bg-emerald-500 hover:bg-emerald-400 text-charcoal-950 font-black py-4 rounded-2xl flex items-center justify-center gap-2 transition-all active:scale-[0.98]">
                            Instant Start <Zap size={18} />
                          </button>
                        </div>
                      </div>
                    </motion.div>
                  )}

                  {matchState === "accepted" && (
                    <div className="flex flex-col items-center py-16">
                      <div className="w-20 h-20 bg-emerald-500/20 border border-emerald-500/40 rounded-full flex items-center justify-center mb-6">
                        <CheckCircle2 size={40} className="text-emerald-400" />
                      </div>
                      <h2 className="text-ink font-black text-2xl mb-2">Rider Accepted!</h2>
                      <p className="text-charcoal-500 text-sm">Redirecting to confirmation...</p>
                    </div>
                  )}

                  {matchState === "no_drivers" && mode === "quickmatch" && (
                    <div className="flex flex-col items-center py-12 text-center">
                      <div className="w-20 h-20 bg-amber-500/10 border border-amber-500/20 rounded-full flex items-center justify-center mb-6">
                        <AlertCircle size={36} className="text-amber-400" />
                      </div>
                      <h2 className="text-ink font-black text-xl mb-3">No riders nearby</h2>
                      <p className="text-charcoal-400 text-sm mb-6 leading-relaxed max-w-[260px]">
                        No immediate match found at ₦{draft.estimated_price?.toLocaleString()}. Try negotiating for a faster response.
                      </p>
                      <button onClick={() => setMode("negotiate")}
                        className="bg-amber-500/20 border border-amber-500/40 text-amber-400 font-black px-6 py-3.5 rounded-2xl text-sm flex items-center gap-2 hover:bg-amber-500/30 transition-all">
                        <MessageCircle size={16} /> Negotiate Price
                      </button>
                    </div>
                  )}
                </motion.div>
              )}

              {/* ====== NEGOTIATE MODE ====== */}
              {mode === "negotiate" && (
                <motion.div key="negotiate" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} className="space-y-5 mt-4">
                  {!offerSent ? (
                    <div className="space-y-4">
                      <div className="bg-white/[0.03] border border-white/5 p-5 rounded-3xl">
                        <label className="text-[10px] font-black text-charcoal-500 uppercase tracking-widest ml-1 mb-2 block">Set Your Offer</label>
                        <div className="relative">
                          <span className="absolute left-5 top-1/2 -translate-y-1/2 text-emerald-400 font-black text-xl">₦</span>
                          <input type="number" value={offerPrice} onChange={e => setOfferPrice(e.target.value)}
                            className="w-full bg-charcoal-900 border border-white/10 rounded-2xl py-5 pl-12 pr-4 text-ink text-2xl font-black focus:outline-none focus:ring-2 focus:ring-emerald-500/40 transition-all" />
                        </div>
                        <div className="flex justify-between mt-3 px-1 text-[10px] font-black uppercase text-charcoal-600">
                           <span>Recommended: ₦{draft.estimated_price}</span>
                        </div>
                      </div>

                      <button onClick={sendOffer}
                        className="w-full bg-white/5 border border-white/10 text-ink font-black py-4 rounded-2xl hover:bg-white/10 transition-all">
                         Broadcast New Offer 📢
                      </button>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      <div className="flex items-center justify-between px-5 py-4 bg-charcoal-900 border border-emerald-500/20 rounded-2xl">
                         <div className="text-charcoal-500 text-[10px] font-black uppercase">Current Offer</div>
                         <div className="text-ink font-black text-xl">₦{parseInt(offerPrice).toLocaleString()}</div>
                      </div>

                      {bids.length === 0 ? (
                        <div className="text-center py-6 bg-charcoal-900/50 rounded-2xl">
                          <Loader2 className="text-emerald-500 animate-spin mx-auto mb-3" size={24} />
                          <p className="text-charcoal-500 text-xs font-black uppercase tracking-widest">Awaiting Driver Bids...</p>
                        </div>
                      ) : (
                        <div className="space-y-3">
                          {bids.map(bid => (
                            <motion.div key={bid.id} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
                              className="bg-white/[0.04] border border-white/10 rounded-2xl p-4 flex items-center justify-between">
                              <div className="flex items-center gap-3">
                                <div className="w-10 h-10 bg-emerald-500/10 rounded-xl flex items-center justify-center text-xl border border-emerald-500/20">🏍️</div>
                                <div>
                                  {/* ✅ FIX: full_name not name, rating not avg_rating */}
                                  <div className="text-ink font-black text-sm">{bid.riders?.users?.full_name || "Rider"}</div>
                                  <div className="text-amber-400 font-bold text-[10px]">⭐ {bid.riders?.rating || "4.8"}</div>
                                </div>
                              </div>
                              <div className="flex items-center gap-3">
                                 <div className="text-emerald-400 font-black">₦{bid.amount?.toLocaleString()}</div>
                                 <button onClick={() => acceptBid(bid)} className="bg-emerald-500 text-charcoal-950 font-black px-4 py-2 rounded-xl text-xs">Accept</button>
                              </div>
                            </motion.div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </>
      )}
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
