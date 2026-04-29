"use client";

import { useState, useEffect, useRef, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { createClient } from "@/utils/supabase/client";
import {
  ArrowLeft, Star, Zap, MessageCircle, Clock, Bike, Car,
  CheckCircle2, X, ChevronRight, Loader2, AlertCircle, DollarSign
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
  const [matchState, setMatchState] = useState("searching"); // 'searching' | 'found' | 'accepted' | 'no_drivers'
  const [matchedRider, setMatchedRider] = useState(null);
  const [bids, setBids] = useState([]);
  const [offerPrice, setOfferPrice] = useState("");
  const [offerSent, setOfferSent] = useState(false);
  const [timeLeft, setTimeLeft] = useState(NEGOTIATION_TIMEOUT);
  const [creatingOrder, setCreatingOrder] = useState(false);
  const [error, setError] = useState(null);

  const timerRef = useRef(null);
  const channelRef = useRef(null);

  // Load draft on mount
  useEffect(() => {
    try {
      const d = JSON.parse(sessionStorage.getItem(DRAFT_KEY));
      if (!d?.pickup || !d?.estimated_price) { router.replace("/send-package/step-2"); return; }
      setDraft(d);
      setOfferPrice(String(d.estimated_price));
    } catch { router.replace("/send-package/step-2"); }
  }, []);

  // Create order in DB when draft is ready and we don't have an orderId yet
  useEffect(() => {
    if (!draft || orderId) return;
    createOrder();
  }, [draft]);

  async function createOrder() {
    setCreatingOrder(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { router.replace("/auth/login"); return; }

      const { data: order, error: err } = await supabase.from("orders").insert({
        vendor_id: user.id,
        pickup_name: draft.pickup.name,
        pickup_lat: draft.pickup.lat,
        pickup_lng: draft.pickup.lng,
        dropoff_name: draft.dropoff.name,
        dropoff_lat: draft.dropoff.lat,
        dropoff_lng: draft.dropoff.lng,
        item_size: draft.size,
        vehicle_type: draft.vehicle,
        item_description: draft.description,
        receiver_name: draft.receiver_name,
        receiver_phone: draft.receiver_phone,
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
    } finally {
      setCreatingOrder(false);
    }
  }

  async function startQuickMatch(oid) {
    setMatchState("searching");
    // Listen for a rider to accept via realtime
    const channel = supabase.channel(`order-match-${oid}`)
      .on("postgres_changes", {
        event: "UPDATE", schema: "public", table: "orders", filter: `id=eq.${oid}`
      }, async (payload) => {
        if (payload.new.rider_id && payload.new.status === "assigned") {
          // Fetch rider profile
          const { data: rider } = await supabase
            .from("riders")
            .select("*, users(full_name, email)")
            .eq("user_id", payload.new.rider_id)
            .single();
          setMatchedRider({
            id: payload.new.rider_id,
            name: rider?.users?.full_name || "Driver",
            vehicle_type: rider?.vehicle_type || "bike",
            plate: rider?.plate_number || "",
            rating: rider?.avg_rating || 4.8,
            eta_min: Math.round(5 + Math.random() * 10),
            price: payload.new.agreed_price,
          });
          setMatchState("found");
        }
      })
      .subscribe();
    channelRef.current = channel;

    // Timeout: 10 seconds with no match → show no_drivers
    setTimeout(() => {
      if (matchState !== "found" && matchState !== "accepted") {
        setMatchState("no_drivers");
      }
    }, 10000);
  }

  function startNegotiationTimer() {
    setTimeLeft(NEGOTIATION_TIMEOUT);
    timerRef.current = setInterval(() => {
      setTimeLeft(t => {
        if (t <= 1) {
          clearInterval(timerRef.current);
          // Auto-switch back to Quick Match
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

    // Update order with offer price and broadcast
    await supabase.from("orders").update({ agreed_price: price, status: "negotiating" }).eq("id", orderId);

    // Subscribe to bids
    const channel = supabase.channel(`bids-${orderId}`)
      .on("postgres_changes", {
        event: "INSERT", schema: "public", table: "bids", filter: `order_id=eq.${orderId}`
      }, async (payload) => {
        const { data: bid } = await supabase.from("bids")
          .select("*, riders(user_id, vehicle_type, plate_number, avg_rating, users(full_name))")
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
    if (channelRef.current) supabase.removeChannel(channelRef.current);

    // Lock: assign this rider, reject all other bids
    await supabase.from("orders").update({ rider_id: bid.rider_id, agreed_price: bid.amount, status: "assigned" }).eq("id", orderId);
    await supabase.from("bids").update({ status: "rejected" }).eq("order_id", orderId).neq("id", bid.id);
    await supabase.from("bids").update({ status: "accepted" }).eq("id", bid.id);

    setMatchedRider({
      id: bid.rider_id,
      name: bid.riders?.users?.full_name || "Driver",
      vehicle_type: bid.riders?.vehicle_type || "bike",
      plate: bid.riders?.plate_number || "",
      rating: bid.riders?.avg_rating || 4.8,
      eta_min: Math.round(5 + Math.random() * 10),
      price: bid.amount,
    });
    setMatchState("accepted");
    setTimeout(() => router.push(`/send-package/confirm?orderId=${orderId}`), 1000);
  }

  function acceptQuickMatch() {
    if (!matchedRider) return;
    setMatchState("accepted");
    setTimeout(() => router.push(`/send-package/confirm?orderId=${orderId}`), 800);
  }

  useEffect(() => {
    return () => {
      clearInterval(timerRef.current);
      if (channelRef.current) supabase.removeChannel(channelRef.current);
    };
  }, []);

  if (!draft || creatingOrder) return (
    <div className="min-h-screen bg-charcoal-950 flex items-center justify-center">
      <div className="text-center">
        <div className="w-12 h-12 border-2 border-emerald-500/30 border-t-emerald-500 rounded-full animate-spin mx-auto mb-4" />
        <p className="text-charcoal-400 text-sm font-medium">Setting up your delivery…</p>
      </div>
    </div>
  );

  return (
    <div className="min-h-[100dvh] bg-charcoal-950 flex flex-col">
      {/* Header */}
      <div className="flex items-center gap-4 px-5 pt-14 pb-5">
        <button onClick={() => router.push("/send-package/step-2")} className="w-10 h-10 rounded-2xl bg-white/[0.05] border border-white/10 flex items-center justify-center text-white hover:bg-white/10 transition-colors">
          <ArrowLeft size={18} />
        </button>
        <div>
          <div className="text-[10px] font-black text-charcoal-500 uppercase tracking-widest">Step 3 of 3</div>
          <h1 className="text-xl font-black text-white tracking-tight">Find a Driver</h1>
        </div>
        <div className="ml-auto flex gap-1.5">
          {[1, 2, 3].map(s => (
            <div key={s} className={`h-1.5 rounded-full transition-all w-6 bg-emerald-500`} />
          ))}
        </div>
      </div>

      {/* Mode Toggle */}
      <div className="mx-5 mb-6 bg-white/[0.04] border border-white/10 rounded-2xl p-1 flex gap-1">
        <button onClick={() => { setMode("quickmatch"); setOfferSent(false); clearInterval(timerRef.current); if (orderId && matchState !== "found") startQuickMatch(orderId); }}
          className={`flex-1 py-2.5 rounded-xl text-sm font-black transition-all flex items-center justify-center gap-1.5 ${mode === "quickmatch" ? "bg-emerald-500 text-charcoal-950 shadow-[0_0_12px_rgba(16,185,129,0.4)]" : "text-charcoal-500 hover:text-white"}`}>
          <Zap size={14} /> Quick Match
        </button>
        <button onClick={() => setMode("negotiate")}
          className={`flex-1 py-2.5 rounded-xl text-sm font-black transition-all flex items-center justify-center gap-1.5 ${mode === "negotiate" ? "bg-white/10 text-white" : "text-charcoal-500 hover:text-white"}`}>
          <MessageCircle size={14} /> Negotiate Price
        </button>
      </div>

      <div className="flex-1 px-5 overflow-y-auto pb-8">
        <AnimatePresence mode="wait">

          {/* ====== QUICK MATCH MODE ====== */}
          {mode === "quickmatch" && (
            <motion.div key="quickmatch" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} className="space-y-6">

              {/* Searching state */}
              {matchState === "searching" && (
                <div className="flex flex-col items-center py-16">
                  <div className="relative mb-8">
                    <div className="w-32 h-32 rounded-full bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center">
                      <div className="w-16 h-16 bg-emerald-500/20 rounded-full flex items-center justify-center">
                        <Loader2 size={32} className="text-emerald-500 animate-spin" />
                      </div>
                    </div>
                    <div className="absolute inset-0 w-32 h-32 rounded-full border border-emerald-500/30 animate-ping opacity-20" />
                  </div>
                  <h2 className="text-white font-black text-xl mb-2">Finding nearby drivers…</h2>
                  <p className="text-charcoal-500 text-sm text-center max-w-[240px]">Scanning riders within 3km of your pickup point</p>
                </div>
              )}

              {/* Driver found */}
              {matchState === "found" && matchedRider && (
                <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="space-y-4">
                  <div className="text-center mb-6">
                    <div className="inline-flex items-center gap-2 bg-emerald-500/20 border border-emerald-500/40 px-4 py-2 rounded-full mb-4">
                      <div className="w-2 h-2 bg-emerald-400 rounded-full animate-pulse" />
                      <span className="text-emerald-400 text-xs font-black uppercase tracking-widest">Best driver found</span>
                    </div>
                  </div>

                  <div className="bg-white/[0.04] border border-white/10 rounded-3xl p-5">
                    <div className="flex items-center gap-4 mb-5">
                      <div className="w-16 h-16 bg-emerald-500/10 rounded-2xl flex items-center justify-center text-3xl border border-emerald-500/20">
                        {matchedRider.vehicle_type === "car" ? "🚗" : "🏍️"}
                      </div>
                      <div className="flex-1">
                        <div className="text-white font-black text-xl">{matchedRider.name}</div>
                        <div className="flex items-center gap-2 mt-1">
                          <div className="flex items-center gap-1 text-amber-400">
                            <Star size={12} fill="currentColor" />
                            <span className="text-xs font-black">{matchedRider.rating}</span>
                          </div>
                          <span className="text-charcoal-600">·</span>
                          <span className="text-charcoal-400 text-xs font-medium capitalize">{matchedRider.vehicle_type}</span>
                          {matchedRider.plate && <><span className="text-charcoal-600">·</span><span className="text-charcoal-400 text-xs">{matchedRider.plate}</span></>}
                        </div>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div className="bg-white/[0.03] rounded-2xl p-3 text-center">
                        <Clock size={16} className="text-emerald-400 mx-auto mb-1" />
                        <div className="text-white font-black text-lg">{matchedRider.eta_min} min</div>
                        <div className="text-charcoal-500 text-[10px] font-bold uppercase tracking-widest">ETA to pickup</div>
                      </div>
                      <div className="bg-white/[0.03] rounded-2xl p-3 text-center">
                        <DollarSign size={16} className="text-emerald-400 mx-auto mb-1" />
                        <div className="text-emerald-400 font-black text-lg">₦{matchedRider.price?.toLocaleString()}</div>
                        <div className="text-charcoal-500 text-[10px] font-bold uppercase tracking-widest">Total price</div>
                      </div>
                    </div>
                  </div>

                  <button onClick={acceptQuickMatch}
                    className="w-full bg-emerald-500 hover:bg-emerald-400 text-charcoal-950 font-black py-5 rounded-2xl flex items-center justify-center gap-2 text-lg shadow-[0_0_24px_rgba(16,185,129,0.4)] transition-all active:scale-[0.98]">
                    Accept & Continue <ChevronRight size={20} />
                  </button>
                </motion.div>
              )}

              {/* Accepted feedback */}
              {matchState === "accepted" && (
                <div className="flex flex-col items-center py-16">
                  <div className="w-20 h-20 bg-emerald-500/20 border border-emerald-500/40 rounded-full flex items-center justify-center mb-6">
                    <CheckCircle2 size={40} className="text-emerald-400" />
                  </div>
                  <h2 className="text-white font-black text-2xl mb-2">Driver Accepted!</h2>
                  <p className="text-charcoal-500 text-sm">Redirecting to confirmation…</p>
                </div>
              )}

              {/* No drivers */}
              {matchState === "no_drivers" && (
                <div className="flex flex-col items-center py-12 text-center">
                  <div className="w-20 h-20 bg-amber-500/10 border border-amber-500/20 rounded-full flex items-center justify-center mb-6">
                    <AlertCircle size={36} className="text-amber-400" />
                  </div>
                  <h2 className="text-white font-black text-xl mb-3">No drivers nearby</h2>
                  <p className="text-charcoal-400 text-sm mb-6 leading-relaxed max-w-[260px]">
                    No available riders found in your area right now.<br />Try increasing your offer price to attract more drivers.
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
            <motion.div key="negotiate" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} className="space-y-5">
              <div className="bg-white/[0.03] border border-white/10 rounded-2xl p-4">
                <p className="text-charcoal-400 text-sm leading-relaxed">
                  <span className="text-white font-bold">How it works:</span> Set your price. Nearby drivers will see it and can accept or counter. First to accept gets the job — all others are closed immediately.
                </p>
              </div>

              {!offerSent ? (
                <div className="space-y-4">
                  <div>
                    <label className="text-[10px] font-black text-charcoal-500 uppercase tracking-widest ml-1 mb-2 block">Your Offer Price</label>
                    <div className="relative">
                      <span className="absolute left-5 top-1/2 -translate-y-1/2 text-emerald-400 font-black text-xl">₦</span>
                      <input type="number" value={offerPrice} onChange={e => setOfferPrice(e.target.value)} placeholder="0"
                        className="w-full bg-charcoal-900 border border-white/10 rounded-2xl py-5 pl-12 pr-4 text-white text-2xl font-black placeholder:text-charcoal-700 focus:outline-none focus:ring-2 focus:ring-emerald-500/40 focus:border-emerald-500/60 transition-all" />
                    </div>
                    <p className="text-charcoal-600 text-xs mt-2 ml-1">Suggested: ₦{draft.estimated_price?.toLocaleString()}</p>
                  </div>

                  {error && (
                    <div className="flex items-center gap-2 p-3 bg-red-500/10 border border-red-500/20 rounded-xl">
                      <AlertCircle size={14} className="text-red-400" />
                      <p className="text-red-400 text-xs font-medium">{error}</p>
                    </div>
                  )}

                  <button onClick={sendOffer}
                    className="w-full bg-emerald-500 hover:bg-emerald-400 text-charcoal-950 font-black py-4 rounded-2xl flex items-center justify-center gap-2 text-base transition-all active:scale-[0.98] shadow-[0_0_20px_rgba(16,185,129,0.3)]">
                    Broadcast Offer <ChevronRight size={18} />
                  </button>
                </div>
              ) : (
                <div className="space-y-4">
                  {/* Timer */}
                  <div className={`flex items-center justify-between px-5 py-3.5 rounded-2xl border ${timeLeft > 20 ? "border-emerald-500/30 bg-emerald-500/10" : "border-amber-500/30 bg-amber-500/10"}`}>
                    <div className="flex items-center gap-2">
                      <Clock size={16} className={timeLeft > 20 ? "text-emerald-400" : "text-amber-400"} />
                      <span className={`text-sm font-black ${timeLeft > 20 ? "text-emerald-400" : "text-amber-400"}`}>
                        Offer expires in {timeLeft}s
                      </span>
                    </div>
                    <div className="flex items-center gap-2 text-white">
                      <span className="text-lg font-black">₦{parseInt(offerPrice).toLocaleString()}</span>
                    </div>
                  </div>

                  {bids.length === 0 ? (
                    <div className="text-center py-10">
                      <Loader2 className="text-emerald-500 animate-spin mx-auto mb-3" size={28} />
                      <p className="text-charcoal-400 text-sm">Waiting for driver responses…</p>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      <div className="text-[10px] font-black text-charcoal-500 uppercase tracking-widest">Driver Responses</div>
                      {bids.map(bid => (
                        <motion.div key={bid.id} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
                          className="bg-white/[0.04] border border-white/10 rounded-2xl p-4 flex items-center justify-between">
                          <div className="flex items-center gap-3">
                            <div className="w-12 h-12 bg-emerald-500/10 rounded-xl flex items-center justify-center text-xl border border-emerald-500/20">
                              {bid.riders?.vehicle_type === "car" ? "🚗" : "🏍️"}
                            </div>
                            <div>
                              <div className="text-white font-black text-base">{bid.riders?.users?.full_name || "Driver"}</div>
                              <div className="flex items-center gap-1 text-amber-400">
                                <Star size={10} fill="currentColor" />
                                <span className="text-xs font-bold">{bid.riders?.avg_rating || "4.8"}</span>
                              </div>
                            </div>
                          </div>
                          <div className="flex items-center gap-3">
                            <div className="text-right">
                              <div className="text-emerald-400 font-black text-lg">₦{bid.amount?.toLocaleString()}</div>
                              <div className="text-charcoal-600 text-[10px] font-bold">{bid.status === "counter" ? "Counter" : "Accepted"}</div>
                            </div>
                            <button onClick={() => acceptBid(bid)}
                              className="bg-emerald-500 hover:bg-emerald-400 text-charcoal-950 font-black px-4 py-2.5 rounded-xl text-sm transition-all active:scale-95">
                              Accept
                            </button>
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
