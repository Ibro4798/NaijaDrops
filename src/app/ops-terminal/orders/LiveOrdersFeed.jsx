"use client";

import { useState, useEffect } from "react";
import { createClient } from "@/utils/supabase/client";
import { forceCancelOrder } from "./actions";
import { motion, AnimatePresence } from "framer-motion";
import { Package, Truck, Navigation, AlertOctagon, XCircle, Info, Loader2, Map as MapIcon } from "lucide-react";
import dynamic from "next/dynamic";

const MapCanvas = dynamic(() => import("@/components/MapCanvas"), { ssr: false });

const STATUS_CONFIG = {
  pending: { label: "Pending Search", color: "text-amber-500", bg: "bg-amber-500/10 border-amber-500/20" },
  matched: { label: "Matched", color: "text-blue-500", bg: "bg-blue-500/10 border-blue-500/20" },
  authorized: { label: "Payment Hold", color: "text-purple-500", bg: "bg-purple-500/10 border-purple-500/20" },
  picked_up: { label: "Picked Up", color: "text-emerald-500", bg: "bg-emerald-500/10 border-emerald-500/20" },
  in_transit: { label: "In Transit", color: "text-emerald-500", bg: "bg-emerald-500/10 border-emerald-500/20" },
};

export default function LiveOrdersFeed({ initialOrders }) {
  const [orders, setOrders] = useState(initialOrders);
  const [isCancelling, setIsCancelling] = useState(null);
  const supabase = createClient();

  useEffect(() => {
    const channel = supabase.channel('ops-orders-sync')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, async (payload) => {
        // Full refresh of order data to get joined relations (riders/users)
        const { data: updatedOrder } = await supabase
          .from("orders")
          .select("*, riders(user_id, users(full_name)), users(full_name, phone)")
          .eq("id", payload.new.id || payload.old.id)
          .single();

        if (payload.eventType === 'DELETE' || (updatedOrder && ["cancelled", "delivered"].includes(updatedOrder.status))) {
          setOrders(prev => prev.filter(o => o.id !== (payload.old.id || payload.new.id)));
        } else if (updatedOrder) {
          setOrders(prev => {
            const exists = prev.find(o => o.id === updatedOrder.id);
            if (exists) {
              return prev.map(o => o.id === updatedOrder.id ? updatedOrder : o);
            }
            return [updatedOrder, ...prev];
          });
        }
      })
      .subscribe();

    return () => supabase.removeChannel(channel);
  }, [supabase]);

  const handleForceCancel = async (orderId) => {
    if (!confirm("CRITICAL ACTION: This will force-cancel the order and void the payment hold. Proceed?")) return;
    setIsCancelling(orderId);
    const res = await forceCancelOrder(orderId, "Manual Admin Override");
    if (res.error) alert(`Protocol Failure: ${res.error}`);
    setIsCancelling(null);
  };

  // Map orders to MapCanvas markers format
  const markers = orders.flatMap(order => {
    const list = [];
    // Pickup point
    if (order.pickup_lat && order.pickup_lng) {
      list.push({ lat: order.pickup_lat, lng: order.pickup_lng, color: 'white', type: 'pickup' });
    }
    // Rider location (if assigned and has telemetry)
    if (order.riders?.current_lat && order.riders?.current_lng) {
      list.push({ lat: order.riders.current_lat, lng: order.riders.current_lng, color: 'emerald', type: 'rider' });
    }
    return list;
  });

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 h-[calc(100vh-200px)]">
      
      {/* GOD-MODE MAP (Section 6.2) */}
      <div className="lg:col-span-2 bg-charcoal-900/40 border border-white/5 rounded-3xl overflow-hidden relative shadow-2xl">
        <MapCanvas markers={markers} zoom={12} interactive={false} />
        <div className="absolute top-6 left-6 z-10 bg-black/60 backdrop-blur-md border border-white/10 rounded-xl px-4 py-2 flex items-center gap-3">
          <div className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse" />
          <span className="text-[10px] font-black uppercase tracking-widest text-emerald-500">Node: Kano Pilot Geofence</span>
        </div>
      </div>

      {/* DISPATCH FEED */}
      <div className="flex flex-col gap-4 overflow-y-auto pr-2 custom-scrollbar">
        <div className="flex items-center justify-between px-2 mb-2">
           <h2 className="text-[10px] font-black text-charcoal-500 uppercase tracking-[0.2em]">Live Dispatches ({orders.length})</h2>
           <div className="flex gap-1">
             <div className="w-1 h-1 bg-charcoal-800 rounded-full" />
             <div className="w-1 h-1 bg-charcoal-800 rounded-full" />
             <div className="w-1 h-1 bg-charcoal-800 rounded-full" />
           </div>
        </div>

        <AnimatePresence mode="popLayout">
          {orders.map((order) => (
            <motion.div
              key={order.id}
              layout
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, scale: 0.9 }}
              className="bg-charcoal-900/40 border border-white/5 p-6 rounded-2xl space-y-4 hover:border-white/10 transition-all group"
            >
              <div className="flex justify-between items-start">
                <div className="space-y-1">
                  <div className={`px-2 py-0.5 rounded text-[8px] font-black uppercase tracking-widest border inline-block ${STATUS_CONFIG[order.status]?.bg || "bg-white/5"}`}>
                    {STATUS_CONFIG[order.status]?.label || order.status}
                  </div>
                  <div className="text-sm font-black text-white truncate max-w-[150px]">ID: {order.id.slice(0, 8)}</div>
                </div>
                <button 
                  onClick={() => handleForceCancel(order.id)}
                  disabled={isCancelling === order.id}
                  className="w-8 h-8 bg-red-500/10 text-red-500 rounded-lg flex items-center justify-center border border-red-500/20 hover:bg-red-500 hover:text-white transition-all active:scale-90"
                >
                  {isCancelling === order.id ? <Loader2 size={14} className="animate-spin" /> : <XCircle size={14} />}
                </button>
              </div>

              <div className="space-y-3">
                 <div className="flex items-center gap-3 text-xs">
                    <Package size={14} className="text-charcoal-600" />
                    <span className="text-charcoal-300 truncate">{order.pickup_name?.split(',')[0]}</span>
                 </div>
                 <div className="flex items-center gap-3 text-xs">
                    <Navigation size={14} className="text-charcoal-600" />
                    <span className="text-charcoal-300 truncate">{order.dropoff_name?.split(',')[0]}</span>
                 </div>
              </div>

              <div className="pt-4 border-t border-white/5 flex justify-between items-center">
                 <div className="flex items-center gap-2">
                    <div className="w-6 h-6 rounded-full bg-charcoal-800 flex items-center justify-center text-[8px] font-black text-charcoal-500">
                       {order.riders?.users?.full_name?.slice(0, 1) || "?"}
                    </div>
                    <div className="text-[10px] font-bold text-charcoal-400">
                       {order.riders?.users?.full_name || "Unassigned"}
                    </div>
                 </div>
                 <div className="text-[10px] font-black text-emerald-500 tracking-tighter">
                    â‚¦{order.agreed_price?.toLocaleString()}
                 </div>
              </div>
            </motion.div>
          ))}
        </AnimatePresence>

        {orders.length === 0 && (
          <div className="py-20 text-center border-2 border-dashed border-white/5 rounded-3xl">
             <MapIcon size={32} className="mx-auto mb-3 text-charcoal-800" />
             <p className="text-[10px] font-black text-charcoal-600 uppercase tracking-widest">No Active Traffic</p>
          </div>
        )}
      </div>
    </div>
  );
}
