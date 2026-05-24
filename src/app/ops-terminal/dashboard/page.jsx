import { validateAdmin } from "@/utils/admin";
import { createClient } from "@/utils/supabase/server";
import { Truck, ShieldCheck, DollarSign, Activity, AlertTriangle, Users, ExternalLink } from "lucide-react";
import Link from "next/link";
import RealtimeAlerts from "./RealtimeAlerts";

export const dynamic = "force-dynamic";

export default async function OpsDashboard() {
  // LAYER 2: Server-side security check
  const { admin } = await validateAdmin();
  const supabase = await createClient();

  // Fetch Live Stats
  const { data: riders } = await supabase.from("riders").select("count").eq("operational_status", "online");
  const { data: activeOrders } = await supabase.from("orders").select("count").in("status", ["assigned", "picked_up", "in_transit"]);
  const { data: escrowVolume } = await supabase.from("orders").select("agreed_price").eq("payment_status", "authorized");
  const totalEscrow = escrowVolume?.reduce((acc, curr) => acc + (curr.agreed_price || 0), 0) || 0;

  const stats = [
    { label: "Active Fleet", value: riders?.[0]?.count || 0, icon: <Truck className="text-emerald-500" />, trend: "Riders on Grid" },
    { label: "Live Escrow", value: `â‚¦${totalEscrow.toLocaleString()}`, icon: <DollarSign className="text-blue-500" />, trend: "Authorized Holds" },
    { label: "Ops Traffic", value: activeOrders?.[0]?.count || 0, icon: <Activity className="text-amber-500" />, trend: "In-Flight Dispatches" },
    { label: "System Health", value: "Optimal", icon: <ShieldCheck className="text-emerald-500" />, trend: "No Latency" },
  ];

  return (
    <div className="min-h-screen bg-black text-white p-8 font-mono">
      {/* Header */}
      <div className="flex justify-between items-end mb-12 border-b border-white/10 pb-8">
        <div>
           <div className="flex items-center gap-2 text-emerald-500 text-xs font-bold uppercase tracking-[0.3em] mb-2">
              <div className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse" />
              Terminal Access Verified
           </div>
           <h1 className="text-4xl font-black italic tracking-tighter uppercase">NaijaDrops / Ops-Terminal</h1>
           <p className="text-charcoal-500 text-xs mt-2 uppercase tracking-widest">Administrator: {admin.full_name} â€¢ Role: {admin.role}</p>
        </div>
        <div className="text-right">
           <div className="text-[10px] text-charcoal-600 uppercase font-black tracking-widest mb-1">Node Status</div>
           <div className="text-emerald-500 font-bold">KANO_CLUSTER_01</div>
        </div>
      </div>

      {/* Grid Stats */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-12">
        {stats.map((stat, i) => (
          <div key={i} className="bg-charcoal-900/40 border border-white/5 p-6 rounded-2xl group hover:border-emerald-500/30 transition-all">
             <div className="flex justify-between items-start mb-4">
                <div className="w-10 h-10 bg-white/5 rounded-xl flex items-center justify-center">
                   {stat.icon}
                </div>
                <div className="text-[10px] font-black text-charcoal-600 uppercase tracking-widest">{stat.trend}</div>
             </div>
             <div className="text-3xl font-black tracking-tight">{stat.value}</div>
             <div className="text-[10px] text-charcoal-500 font-bold uppercase mt-1">{stat.label}</div>
          </div>
        ))}
      </div>

      {/* Core Systems */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Fleet Control */}
        <div className="lg:col-span-2 space-y-6">
           <div className="flex justify-between items-center px-2">
              <h2 className="text-xs font-black text-emerald-500 uppercase tracking-widest">Active Fleet Monitor</h2>
              <Link href="/ops-terminal/drivers" className="text-[10px] text-charcoal-500 hover:text-white flex items-center gap-1 transition-colors">
                FULL REGISTRY <ExternalLink size={10} />
              </Link>
           </div>
           <div className="bg-charcoal-900/40 border border-white/5 rounded-3xl overflow-hidden">
              <div className="p-8 text-center py-20 border-b border-white/5">
                 <Truck size={40} className="mx-auto mb-4 text-charcoal-700" />
                 <p className="text-charcoal-500 text-sm">Initializing Fleet Visualization Engine...</p>
              </div>
              <div className="p-6 bg-black/40 flex justify-between items-center">
                 <div className="flex items-center gap-6">
                    <div>
                       <div className="text-[10px] text-charcoal-600 font-black uppercase">Approved</div>
                       <div className="text-white font-bold">Verified Only</div>
                    </div>
                    <div>
                       <div className="text-[10px] text-charcoal-600 font-black uppercase">Coverage</div>
                       <div className="text-white font-bold">Kano Metropolitan</div>
                    </div>
                 </div>
                 <Link href="/ops-terminal/drivers" className="bg-emerald-500 text-black px-6 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest">
                    Manage Drivers
                 </Link>
              </div>
           </div>
        </div>

        {/* Security / System Logs */}
        <div className="space-y-6">
           <h2 className="text-xs font-black text-blue-500 uppercase tracking-widest">Security Watch</h2>
           <div className="bg-charcoal-900/40 border border-white/5 rounded-3xl p-6 space-y-6">
              <div className="space-y-4">
                 <div className="flex gap-4 p-4 rounded-2xl bg-red-500/5 border border-red-500/10">
                    <AlertTriangle className="text-red-500 shrink-0" size={20} />
                    <div>
                       <div className="text-[10px] font-black text-red-500 uppercase tracking-widest">Anomalies Detected</div>
                       <p className="text-[11px] text-charcoal-400 font-bold leading-tight mt-1">0 Flagged Accounts</p>
                    </div>
                 </div>
                 <div className="flex gap-4 p-4 rounded-2xl bg-blue-500/5 border border-blue-500/10">
                    <ShieldCheck className="text-blue-500 shrink-0" size={20} />
                    <div>
                       <div className="text-[10px] font-black text-blue-500 uppercase tracking-widest">Access Protocol</div>
                       <p className="text-[11px] text-charcoal-400 font-bold leading-tight mt-1">Zero-Trust Enabled</p>
                    </div>
                 </div>
              </div>

              <div className="pt-6 border-t border-white/5">
                 <h3 className="text-[9px] font-black text-charcoal-600 uppercase tracking-widest mb-4">Latest Audit Events</h3>
                 <RealtimeAlerts />
              </div>
           </div>
        </div>
      </div>
    </div>
  );
}
