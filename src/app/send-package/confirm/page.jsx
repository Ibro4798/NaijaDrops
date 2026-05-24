"use client";

import { Suspense, useState, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/utils/supabase/client";
import { motion } from "framer-motion";
import { ArrowLeft, ShieldCheck, Star, Clock } from "lucide-react";
import dynamic from 'next/dynamic';
const PaystackButton = dynamic(
  () => import('react-paystack').then((mod) => mod.PaystackButton),
  { ssr: false }
);
function ConfirmContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const orderId = searchParams.get("orderId");
  const supabase = createClient();

  const [order, setOrder] = useState(null);
  const [rider, setRider] = useState(null);
  const [loading, setLoading] = useState(true);
  const [cancelling, setCancelling] = useState(false);

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

  async function cancelMatch() {
    setCancelling(true);
    await supabase.from("orders").update({ 
      rider_id: null, 
      status: "pending" 
    }).eq("id", orderId);
    router.replace(`/send-package/step-3?orderId=${orderId}`);
  }

  const paystackConfig = {
    reference: (new Date()).getTime().toString(),
    email: rider?.users?.email || "customer@naijadrops.com",
    amount: (order?.agreed_price || 0) * 100, // Paystack uses kobo
    publicKey: process.env.NEXT_PUBLIC_PAYSTACK_PUBLIC_KEY,
    metadata: {
      orderId: orderId,
      riderId: rider?.user_id,
      vendorId: order?.vendor_id,
    }
  };

  const handlePaystackSuccessAction = (reference) => {
    // We don't update state here! The webhook handles it.
    // But we redirect to a 'waiting' or 'tracking' page
    router.push(`/track/${orderId}?payment=verifying`);
  };

  const handlePaystackCloseAction = () => {
    console.log('closed');
  };

  const componentProps = {
    ...paystackConfig,
    text: 'Pay & Dispatch Driver',
    onSuccess: (reference) => handlePaystackSuccessAction(reference),
    onClose: handlePaystackCloseAction,
  };

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
          <div className="text-[10px] font-black text-charcoal-500 uppercase tracking-widest">Safe Escrow Bridge</div>
          <h1 className="text-xl font-black text-white tracking-tight">Checkout Portal</h1>
        </div>
      </div>

      <div className="flex-1 px-5 overflow-y-auto pb-6 space-y-4">
        {/* Driver card */}
        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}
          className="bg-white/[0.04] border border-white/10 rounded-3xl p-5">
          <div className="flex justify-between items-center mb-4">
            <div className="text-[10px] font-black text-charcoal-500 uppercase tracking-widest">Matched Dispatcher</div>
            <div className="flex items-center gap-1.5 px-2 py-1 bg-emerald-500/10 border border-emerald-500/20 rounded-lg">
               <div className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse" />
               <span className="text-[9px] font-black text-emerald-500 uppercase">Reserved</span>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <div className="w-16 h-16 bg-emerald-500/10 border border-emerald-500/20 rounded-2xl flex items-center justify-center text-3xl">
              {order?.vehicle_type === "car" ? "ðŸš—" : "ðŸï¸"}
            </div>
            <div className="flex-1">
              <div className="flex items-center gap-2">
                <span className="text-white font-black text-xl">{rider?.users?.full_name || "Verified Driver"}</span>
                <ShieldCheck size={16} className="text-blue-400" />
              </div>
              <div className="flex items-center gap-3 mt-1">
                <div className="flex items-center gap-1 text-amber-400">
                  <Star size={12} fill="currentColor" />
                  <span className="text-xs font-black">{rider?.rating || "5.0"}</span>
                </div>
                <span className="text-charcoal-600 text-xs">Â·</span>
                <span className="text-charcoal-400 text-xs capitalize font-medium">{order?.vehicle_type || "motorcycle"}</span>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3 mt-4">
            <div className="bg-white/[0.03] rounded-2xl p-3">
              <Clock size={14} className="text-emerald-400 mb-1" />
              <div className="text-white font-black text-lg">{etaMin} min</div>
              <div className="text-charcoal-500 text-[10px] font-bold uppercase tracking-widest">ETA to pickup</div>
            </div>
            <div className="bg-white/[0.03] rounded-2xl p-3">
              <div className="text-emerald-400 font-black text-xl mb-1">â‚¦{order?.agreed_price?.toLocaleString()}</div>
              <div className="text-charcoal-500 text-[10px] font-bold uppercase tracking-widest">Escrow Hold</div>
            </div>
          </div>
        </motion.div>

        {/* Route card */}
        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.08 }}
          className="bg-white/[0.04] border border-white/10 rounded-3xl p-5">
          <div className="text-[10px] font-black text-charcoal-500 uppercase tracking-widest mb-4">Logistics Route</div>
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

        {/* Price Summary */}
        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.16 }}
          className="bg-emerald-500/[0.06] border border-emerald-500/20 rounded-3xl p-5">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-[10px] font-black text-charcoal-500 uppercase tracking-widest mb-1">Authorization Amount</div>
              <div className="text-emerald-400 font-black text-4xl">â‚¦{order?.agreed_price?.toLocaleString()}</div>
            </div>
          </div>
          <div className="mt-4 pt-4 border-t border-emerald-500/10 flex items-center gap-3">
             <ShieldCheck size={24} className="text-emerald-500" />
             <p className="text-[10px] text-charcoal-400 font-medium leading-tight uppercase tracking-tight">
               Funds are held in escrow and only released to the rider once the package is delivered. 100% refund available before pickup.
             </p>
          </div>
        </motion.div>
      </div>

      {/* CTA */}
      <div className="px-5 pb-8 pt-4 border-t border-white/[0.06] space-y-3">
        <PaystackButton {...componentProps} className="w-full bg-emerald-500 hover:bg-emerald-400 text-charcoal-950 font-black py-5 rounded-2xl flex items-center justify-center gap-2 text-lg shadow-[0_0_24px_rgba(16,185,129,0.4)] transition-all" />
        
        <button 
          onClick={cancelMatch}
          disabled={cancelling}
          className="w-full py-4 text-charcoal-500 font-black uppercase text-[10px] tracking-widest hover:text-white transition-colors"
        >
          {cancelling ? "Releasing Driver..." : "Cancel & Change Driver"}
        </button>
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
