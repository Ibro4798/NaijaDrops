ï»¿"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/utils/supabase/client";
import { ArrowLeft, Package, MapPin, Clock, Loader2, X, ChevronRight, AlertTriangle } from "lucide-react";
import Skeleton from "@/components/ui/Skeleton";
import { cancelOrder } from "./actions";

const STATUS_LABELS = {
  pending: "Finding a rider",
  looking_for_driver: "Finding a rider",
  matched: "Rider assigned",
  picked_up: "Picked up",
  in_transit: "On the way",
};

const STATUS_STYLES = {
  pending: "bg-amber-500/10 text-amber-400 border-amber-500/20",
  looking_for_driver: "bg-amber-500/10 text-amber-400 border-amber-500/20",
  matched: "bg-blue-500/10 text-blue-400 border-blue-500/20",
  picked_up: "bg-blue-500/10 text-blue-400 border-blue-500/20",
  in_transit: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
};

const CANCELLABLE = ["pending", "looking_for_driver"];

function CancelModal({ order, onClose, onCancelled }) {
  const [reason, setReason] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const handleConfirm = async () => {
    setLoading(true);
    setError(null);
    const res = await cancelOrder(order.id, reason);
    setLoading(false);
    if (!res.success) {
      setError(res.error);
      return;
    }
    onCancelled(order.id);
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="bg-charcoal-900 border border-white/10 rounded-t-3xl sm:rounded-3xl w-full max-w-sm p-6 space-y-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-red-500/10 border border-red-500/20 rounded-xl flex items-center justify-center shrink-0">
            <AlertTriangle className="text-red-400" size={18} />
          </div>
          <div>
            <h3 className="text-ink font-black text-base">Cancel this delivery?</h3>
            <p className="text-charcoal-500 text-xs">No rider has accepted it yet - this is free to cancel.</p>
          </div>
        </div>
        <textarea
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="Optional: why are you cancelling? (helps us improve)"
          className="w-full bg-charcoal-950 border border-white/10 rounded-xl p-3 min-h-[80px] text-ink text-sm outline-none focus:border-emerald-500 transition-all resize-none"
        />
        {error && <p className="text-red-400 text-xs font-bold">{error}</p>}
        <div className="flex gap-3">
          <button
            onClick={onClose}
            disabled={loading}
            className="flex-1 py-3 rounded-xl bg-white/5 border border-white/10 text-ink text-xs font-black uppercase tracking-widest hover:bg-white/10 transition-all"
          >
            Keep Order
          </button>
          <button
            onClick={handleConfirm}
            disabled={loading}
            className="flex-1 py-3 rounded-xl bg-red-500 text-white text-xs font-black uppercase tracking-widest hover:bg-red-400 transition-all flex items-center justify-center gap-2 disabled:opacity-50"
          >
            {loading ? <Loader2 size={14} className="animate-spin" /> : <X size={14} />}
            Cancel It
          </button>
        </div>
      </div>
    </div>
  );
}

export default function ActiveOrdersPage() {
  const router = useRouter();
  const supabase = createClient();
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [cancelTarget, setCancelTarget] = useState(null);

  useEffect(() => {
    let channel;
    async function load() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { router.push("/auth/login"); return; }

      const { data: vendor } = await supabase.from("vendors").select("id").eq("user_id", user.id).single();
      if (!vendor) { setLoading(false); return; }

      const { data } = await supabase
        .from("orders")
        .select("*")
        .eq("vendor_id", vendor.id)
        .in("status", ["pending", "looking_for_driver", "matched", "picked_up", "in_transit"])
        .order("created_at", { ascending: false });

      setOrders(data || []);
      setLoading(false);

      channel = supabase
        .channel(`vendor-active-orders-${vendor.id}`)
        .on("postgres_changes", { event: "*", schema: "public", table: "orders", filter: `vendor_id=eq.${vendor.id}` },
          () => load())
        .subscribe();
    }
    load();
    return () => { if (channel) supabase.removeChannel(channel); };
  }, [supabase, router]);

  const handleCancelled = (orderId) => {
    setOrders(prev => prev.filter(o => o.id !== orderId));
    setCancelTarget(null);
  };

  return (
    <div className="min-h-[100dvh] bg-charcoal-950 pb-24">
      <div className="sticky top-0 z-20 bg-charcoal-950/90 backdrop-blur-xl border-b border-white/5 px-5 py-4 flex items-center gap-4">
        <button onClick={() => router.back()} className="w-10 h-10 flex items-center justify-center text-charcoal-400 hover:text-ink transition-colors">
          <ArrowLeft size={20} />
        </button>
        <div>
          <h1 className="text-ink font-black text-lg font-outfit">Active Orders</h1>
          <p className="text-charcoal-500 text-xs">{orders.length} in progress</p>
        </div>
      </div>

      <div className="px-5 py-6 space-y-4">
        {loading ? (
          <div className="space-y-4">
            {[1, 2, 3].map((i) => (
              <div key={i} className="bg-white/[0.03] border border-white/10 rounded-2xl p-5 space-y-4">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-2">
                    <Skeleton className="w-4 h-4 rounded" />
                    <Skeleton className="h-4 w-32" />
                  </div>
                  <Skeleton className="h-5 w-24 rounded-full" />
                </div>
                <div className="space-y-2">
                  <Skeleton className="h-3 w-4/5" />
                  <Skeleton className="h-3 w-3/5" />
                </div>
                <div className="flex items-center justify-between pt-3 border-t border-white/5">
                  <Skeleton className="h-3 w-14" />
                  <Skeleton className="h-7 w-20 rounded-lg" />
                </div>
              </div>
            ))}
          </div>
        ) : orders.length === 0 ? (
          <div className="text-center py-20">
            <Package className="mx-auto text-charcoal-700 mb-4" size={40} />
            <p className="text-charcoal-500 text-sm">No active orders right now.</p>
          </div>
        ) : (
          orders.map((order) => (
            <div key={order.id} className="bg-white/[0.03] border border-white/10 rounded-2xl p-5 space-y-4">
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-2">
                  <Package size={16} className="text-charcoal-400" />
                  <span className="text-ink font-bold text-sm">{order.item_description || "Package"}</span>
                </div>
                <span className={`text-[9px] font-black uppercase tracking-widest px-2.5 py-1 rounded-full border ${STATUS_STYLES[order.status] || "bg-charcoal-800 text-charcoal-400 border-white/10"}`}>
                  {STATUS_LABELS[order.status] || order.status}
                </span>
              </div>

              <div className="space-y-1.5 text-xs">
                <div className="flex items-start gap-2 text-charcoal-400">
                  <MapPin size={12} className="mt-0.5 shrink-0" />
                  <span className="truncate">{order.pickup_name}</span>
                </div>
                <div className="flex items-start gap-2 text-charcoal-400">
                  <MapPin size={12} className="mt-0.5 shrink-0 text-emerald-500" />
                  <span className="truncate">{order.dropoff_name}</span>
                </div>
              </div>

              <div className="flex items-center justify-between pt-3 border-t border-white/5">
                <div className="flex items-center gap-1.5 text-charcoal-600 text-[10px]">
                  <Clock size={11} />
                  {new Date(order.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </div>
                <div className="flex items-center gap-2">
                  {CANCELLABLE.includes(order.status) && (
                    <button
                      onClick={() => setCancelTarget(order)}
                      className="text-[10px] font-black uppercase tracking-widest text-red-400 hover:text-red-300 px-3 py-2 rounded-lg hover:bg-red-500/10 transition-all"
                    >
                      Cancel
                    </button>
                  )}
                  {order.status === "matched" && order.payment_status !== "paid" ? (
                    <button
                      onClick={() => router.push(`/payment?orderId=${order.id}`)}
                      className="flex items-center gap-1 text-[10px] font-black uppercase tracking-widest bg-emerald-500 hover:bg-emerald-400 text-charcoal-950 px-3 py-2 rounded-lg transition-all active:scale-95"
                    >
                      Pay Now <ChevronRight size={12} />
                    </button>
                  ) : (
                    <button
                      onClick={() => router.push(`/tracking/${order.id}`)}
                      className="flex items-center gap-1 text-[10px] font-black uppercase tracking-widest text-emerald-400 hover:text-emerald-300 px-3 py-2 rounded-lg hover:bg-emerald-500/10 transition-all"
                    >
                      Track <ChevronRight size={12} />
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      {cancelTarget && (
        <CancelModal
          order={cancelTarget}
          onClose={() => setCancelTarget(null)}
          onCancelled={handleCancelled}
        />
      )}
    </div>
  );
}