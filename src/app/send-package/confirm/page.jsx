"use client";

import { useState, useEffect, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { motion } from "framer-motion";
import { createClient } from "@/utils/supabase/client";
import { ArrowLeft, Star, Clock, MapPin, ShieldCheck, Bike, Car, ChevronRight, Loader2 } from "lucide-react";

const DRAFT_KEY = "nd_order_draft";

function ConfirmContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const orderId = searchParams.get("orderId");
  const supabase = createClient();

  const [order, setOrder] = useState(null);
  const [rider, setRider] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!orderId) { router.replace("/send-package/step-3"); return; }
    async function fetchData() {
      const { data: o } = await supabase.from("orders").select("*").eq("id", orderId).single();
      if (!o) { router.replace("/send-package/step-3"); return; }
      setOrder(o);

      if (o.rider_id) {
        const { data: r } = await supabase
          .from("riders")
          .select("*, users(full_name, email)")
          .eq("user_id", o.rider_id)
          .single();
        setRider(r);
      }
      setLoading(false);
    }
    fetchData();
  }, [orderId]);

  function handleProceed() {
    // Clear the draft
    sessionStorage.removeItem(DRAFT_KEY);
    router.push(`/payment?orderId=${orderId}`);
  }

  if (loading) return (
    <div className="min-h-screen bg-charcoal-950 flex items-center justify-center">
      <div className="w-8 h-8 border-2 border-emerald-500/30 border-t-emerald-500 rounded-full animate-spin" />
    </div>
  );

  const etaMin = order?.eta_min || Math.round(8 + Math.random() * 7);

  return (
    <div className="min-h-[100dvh] bg-charcoal-950 flex flex-col">
      {/* Header */}
      <div className="flex items-center gap-4 px-5 pt-14 pb-5">
        <button onClick={() => router.back()} className="w-10 h-10 rounded-2xl bg-white/[0.05] border border-white/10 flex items-center justify-center text-white hover:bg-white/10 transition-colors">
          <ArrowLeft size={18} />
        </button>
        <div>
          <div className="text-[10px] font-black text-charcoal-500 uppercase tracking-widest">Match Confirmed</div>
          <h1 className="text-xl font-black text-white tracking-tight">Review & Pay</h1>
        </div>
      </div>

      <div className="flex-1 px-5 overflow-y-auto pb-6 space-y-4">
        {/* Driver card */}
        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}
          className="bg-white/[0.04] border border-white/10 rounded-3xl p-5">
          <div className="text-[10px] font-black text-charcoal-500 uppercase tracking-widest mb-4">Your Driver</div>
          <div className="flex items-center gap-4">
            <div className="w-16 h-16 bg-emerald-500/10 border border-emerald-500/20 rounded-2xl flex items-center justify-center text-3xl">
              {order?.vehicle_type === "car" ? "🚗" : "🏍️"}
            </div>
            <div className="flex-1">
              <div className="flex items-center gap-2">
                <span className="text-white font-black text-xl">{rider?.users?.full_name || "Verified Driver"}</span>
                <ShieldCheck size={16} className="text-blue-400" />
              </div>
              <div className="flex items-center gap-3 mt-1">
                <div className="flex items-center gap-1 text-amber-400">
                  <Star size={12} fill="currentColor" />
                  <span className="text-xs font-black">{rider?.avg_rating || "4.9"}</span>
                </div>
                <span className="text-charcoal-600 text-xs">·</span>
                <span className="text-charcoal-400 text-xs capitalize font-medium">{order?.vehicle_type || "motorcycle"}</span>
                {rider?.plate_number && (
                  <><span className="text-charcoal-600 text-xs">·</span>
                    <span className="text-charcoal-400 text-xs">{rider.plate_number}</span></>
                )}
              </div>
            </div>
          </div>

          {/* ETA + Price */}
          <div className="grid grid-cols-2 gap-3 mt-4">
            <div className="bg-white/[0.03] rounded-2xl p-3">
              <Clock size={14} className="text-emerald-400 mb-1" />
              <div className="text-white font-black text-lg">{etaMin} min</div>
              <div className="text-charcoal-500 text-[10px] font-bold uppercase tracking-widest">ETA to pickup</div>
            </div>
            <div className="bg-white/[0.03] rounded-2xl p-3">
              <div className="text-emerald-400 font-black text-xl mb-1">₦{order?.agreed_price?.toLocaleString()}</div>
              <div className="text-charcoal-500 text-[10px] font-bold uppercase tracking-widest">Final price</div>
            </div>
          </div>
        </motion.div>

        {/* Route card */}
        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.08 }}
          className="bg-white/[0.04] border border-white/10 rounded-3xl p-5">
          <div className="text-[10px] font-black text-charcoal-500 uppercase tracking-widest mb-4">Delivery Route</div>
          <div className="space-y-4 relative">
            <div className="absolute left-3 top-6 bottom-6 w-0.5 bg-gradient-to-b from-charcoal-600 to-emerald-500" />
            <div className="flex items-start gap-4">
              <div className="w-6 h-6 bg-charcoal-700 border-2 border-charcoal-600 rounded-full flex items-center justify-center shrink-0 z-10">
                <div className="w-2 h-2 bg-white rounded-full" />
              </div>
              <div>
                <div className="text-[10px] font-black text-charcoal-500 uppercase tracking-widest mb-0.5">Pickup</div>
                <div className="text-white font-semibold text-sm leading-tight">{order?.pickup_name}</div>
              </div>
            </div>
            <div className="flex items-start gap-4">
              <div className="w-6 h-6 bg-emerald-500/20 border-2 border-emerald-500 rounded-full flex items-center justify-center shrink-0 z-10">
                <div className="w-2 h-2 bg-emerald-400 rounded-full animate-pulse" />
              </div>
              <div>
                <div className="text-[10px] font-black text-emerald-500 uppercase tracking-widest mb-0.5">Dropoff</div>
                <div className="text-white font-semibold text-sm leading-tight">{order?.dropoff_name}</div>
              </div>
            </div>
          </div>
        </motion.div>

        {/* Package details */}
        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.12 }}
          className="bg-white/[0.04] border border-white/10 rounded-3xl p-5">
          <div className="text-[10px] font-black text-charcoal-500 uppercase tracking-widest mb-4">Package & Receiver</div>
          <div className="space-y-3">
            {[
              { label: "Package", value: order?.item_description },
              { label: "Receiver", value: order?.receiver_name },
              { label: "Phone", value: order?.receiver_phone },
              { label: "Size", value: order?.item_size },
            ].filter(x => x.value).map((item, i) => (
              <div key={i} className="flex items-center justify-between">
                <span className="text-charcoal-500 text-sm font-medium">{item.label}</span>
                <span className="text-white text-sm font-bold text-right max-w-[200px] truncate">{item.value}</span>
              </div>
            ))}
          </div>
        </motion.div>

        {/* Price breakdown */}
        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.16 }}
          className="bg-emerald-500/[0.06] border border-emerald-500/20 rounded-3xl p-5">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-[10px] font-black text-charcoal-500 uppercase tracking-widest mb-1">Total to Pay</div>
              <div className="text-emerald-400 font-black text-4xl">₦{order?.agreed_price?.toLocaleString()}</div>
            </div>
            <div className="text-right">
              <div className="text-[10px] font-black text-charcoal-500 uppercase tracking-widest mb-1">Payment</div>
              <div className="text-white text-sm font-bold">Due before dispatch</div>
            </div>
          </div>
        </motion.div>
      </div>

      {/* CTA */}
      <div className="px-5 pb-8 pt-4 border-t border-white/[0.06]">
        <motion.button whileTap={{ scale: 0.97 }} onClick={handleProceed}
          className="w-full bg-emerald-500 hover:bg-emerald-400 text-charcoal-950 font-black py-5 rounded-2xl flex items-center justify-center gap-2 text-lg shadow-[0_0_24px_rgba(16,185,129,0.4)] transition-all">
          Proceed to Payment <ChevronRight size={20} />
        </motion.button>
        <p className="text-center text-charcoal-600 text-xs mt-3">Payment is required before your driver departs</p>
      </div>
    </div>
  );
}

export default function ConfirmPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-charcoal-950 flex items-center justify-center"><div className="w-8 h-8 border-2 border-emerald-500/30 border-t-emerald-500 rounded-full animate-spin" /></div>}>
      <ConfirmContent />
    </Suspense>
  );
}
