import { createClient } from "@/utils/supabase/server";
import { Package, Truck, Clock, ArrowUpRight, Map as MapIcon, Plus } from "lucide-react";
import Link from "next/link";
import MapCanvas from "@/components/MapCanvas";

export default async function VendorDashboard() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();

  // Fetch Vendor Stats
  const { data: orders } = await supabase
    .from("orders")
    .select("status, created_at")
    .eq("vendor_id", user.id);

  const activeOrders = orders?.filter(o => ["pending", "assigned", "picked_up", "in_transit"].includes(o.status)) || [];
  const completedToday = orders?.filter(o => 
    o.status === "delivered" && 
    new Date(o.created_at).toDateString() === new Date().toDateString()
  ) || [];

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-700">
      {/* Header section */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-black text-white tracking-tight font-outfit italic">
            Network <span className="text-emerald-500">Overview</span>
          </h1>
          <p className="text-charcoal-400 text-sm font-medium">Real-time status of your logistics node.</p>
        </div>
        <Link 
          href="/vendor/create-delivery"
          className="bg-emerald-500 hover:bg-emerald-400 text-charcoal-950 px-6 py-3 rounded-2xl font-black text-sm uppercase tracking-widest flex items-center justify-center gap-2 transition-all active:scale-95 shadow-[0_0_20px_rgba(16,185,129,0.2)]"
        >
          <Plus size={18} strokeWidth={3} /> Dispatch New Load
        </Link>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
        {[
          { label: "Active Loads", value: activeOrders.length, icon: <Truck className="text-emerald-400" />, detail: "In-transit or pending" },
          { label: "Delivered Today", value: completedToday.length, icon: <Package className="text-emerald-400" />, detail: "Successfully completed" },
          { label: "Fleet Latency", value: "12m", icon: <Clock className="text-emerald-400" />, detail: "Avg. assignment time" },
        ].map((stat, i) => (
          <div key={i} className="bg-white/[0.03] border border-white/10 p-6 rounded-[2rem] hover:bg-white/[0.05] transition-colors group">
            <div className="flex items-start justify-between mb-4">
              <div className="w-10 h-10 bg-emerald-500/10 rounded-xl flex items-center justify-center border border-emerald-500/20">
                {stat.icon}
              </div>
              <ArrowUpRight className="text-charcoal-600 group-hover:text-emerald-500 transition-colors" size={20} />
            </div>
            <div className="text-3xl font-black text-white mb-1">{stat.value}</div>
            <div className="text-[10px] font-black text-emerald-500 uppercase tracking-widest mb-1">{stat.label}</div>
            <div className="text-xs text-charcoal-500 font-medium">{stat.detail}</div>
          </div>
        ))}
      </div>

      {/* Main Content Area: Map + Active List Feed */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Live Tracking Map Preview */}
        <div className="lg:col-span-2 bg-white/[0.03] border border-white/10 rounded-[2.5rem] overflow-hidden min-h-[400px] relative">
          <div className="absolute top-6 left-6 z-10 flex items-center gap-2 px-4 py-2 rounded-full bg-charcoal-900/80 backdrop-blur-md border border-white/10 font-black text-[10px] uppercase tracking-widest text-white shadow-xl">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
            </span>
            Live Node Telemetry
          </div>
          <MapCanvas orders={activeOrders} />
        </div>

        {/* Recent Feed */}
        <div className="bg-white/[0.03] border border-white/10 rounded-[2.5rem] p-8 flex flex-col">
          <div className="flex items-center justify-between mb-6">
            <h3 className="font-black text-white uppercase tracking-widest text-xs">Recent Operations</h3>
            <Link href="/vendor/history" className="text-[10px] font-black text-charcoal-500 hover:text-emerald-500 transition-colors uppercase tracking-[0.15em]">View All</Link>
          </div>
          
          <div className="flex-1 space-y-4">
            {activeOrders.length > 0 ? (
              activeOrders.slice(0, 5).map((order) => (
                <div key={order.id} className="p-4 rounded-2xl bg-white/[0.02] border border-white/5 hover:border-emerald-500/30 transition-all flex items-center gap-4 group">
                  <div className="w-10 h-10 rounded-full border border-white/10 flex items-center justify-center text-emerald-400 bg-charcoal-900 group-hover:bg-emerald-500 group-hover:text-charcoal-950 transition-colors">
                    <MapIcon size={18} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-bold text-white truncate">Order #{order.id.slice(0, 8)}</div>
                    <div className="text-[10px] font-black uppercase tracking-widest text-charcoal-500 group-hover:text-emerald-500 transition-colors">Status: {order.status}</div>
                  </div>
                </div>
              ))
            ) : (
              <div className="h-full flex flex-col items-center justify-center text-center opacity-40">
                <Package size={48} className="mb-4 text-charcoal-600" />
                <p className="text-xs font-bold uppercase tracking-widest text-charcoal-500">No active dispatches</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
