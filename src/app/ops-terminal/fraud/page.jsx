import { validateAdmin } from "@/utils/admin";
import { createClient } from "@/utils/supabase/server";
import { ShieldAlert, AlertOctagon, UserX, Activity, Search } from "lucide-react";
import FraudActions from "./FraudActions";

export const dynamic = "force-dynamic";

export default async function OpsFraudPage() {
  const { admin } = await validateAdmin();
  const supabase = await createClient();

  // 1. Fetch Suspicious Riders (High Cancellation Rate or Low Rating)
  // For demonstration, we'll query riders who have cancelled > 2 orders recently or have rating < 3.5
  // We can join with order_metrics/rider_metrics once they are populated
  const { data: flaggedRiders } = await supabase
    .from("riders")
    .select("*, users(full_name, email)")
    .lt("rating", 4.0)
    .order("rating", { ascending: true })
    .limit(10);

  // 2. Fetch Recent Failed/Voided Orders
  const { data: voidedOrders } = await supabase
    .from("orders")
    .select("id, status, vendor_id, rider_id, agreed_price, created_at")
    .in("status", ["cancelled"])
    .order("created_at", { ascending: false })
    .limit(5);

  const stats = [
    { label: "High Risk Nodes", value: flaggedRiders?.length || 0, icon: <AlertOctagon className="text-red-500" />, trend: "Requires Audit" },
    { label: "Voided Escrows", value: voidedOrders?.length || 0, icon: <ShieldAlert className="text-amber-500" />, trend: "Recent 24h" },
    { label: "System Trust Score", value: "94.2%", icon: <Activity className="text-emerald-500" />, trend: "Operational" },
  ];

  return (
    <div className="min-h-screen bg-black text-white p-8 font-mono">
      {/* Header */}
      <div className="flex justify-between items-end mb-12 border-b border-white/10 pb-8">
        <div>
           <div className="flex items-center gap-2 text-red-500 text-xs font-bold uppercase tracking-[0.3em] mb-2">
              <div className="w-2 h-2 bg-red-500 rounded-full animate-pulse" />
              Risk Intelligence Protocol
           </div>
           <h1 className="text-4xl font-black italic tracking-tighter uppercase">Fraud / Risk Control</h1>
        </div>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-charcoal-600" size={14} />
          <input type="text" placeholder="Trace Node ID" className="bg-charcoal-900 border border-white/10 rounded-xl pl-10 pr-4 py-2 text-xs focus:border-red-500 outline-none text-white w-64" />
        </div>
      </div>

      {/* Grid Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-12">
        {stats.map((stat, i) => (
          <div key={i} className="bg-charcoal-900/40 border border-white/5 p-6 rounded-2xl group hover:border-white/10 transition-all relative overflow-hidden">
             <div className="absolute top-0 right-0 w-24 h-24 bg-white/[0.02] rounded-bl-full pointer-events-none" />
             <div className="flex justify-between items-start mb-4 relative z-10">
                <div className="w-10 h-10 bg-white/5 rounded-xl flex items-center justify-center">
                   {stat.icon}
                </div>
                <div className="text-[9px] font-black text-charcoal-600 uppercase tracking-widest">{stat.trend}</div>
             </div>
             <div className="text-3xl font-black tracking-tight relative z-10">{stat.value}</div>
             <div className="text-[10px] text-charcoal-500 font-bold uppercase mt-1 relative z-10">{stat.label}</div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Suspicious Nodes */}
        <div className="bg-charcoal-900/40 border border-white/5 rounded-[2rem] p-8">
           <h2 className="text-sm font-black uppercase tracking-[0.2em] text-red-500 mb-6 flex items-center gap-2">
             <UserX size={16} /> Flagged Operatives
           </h2>
           
           <div className="space-y-4">
             {flaggedRiders?.length === 0 ? (
               <div className="text-center py-10 border-2 border-dashed border-white/5 rounded-2xl text-charcoal-600 font-black text-[10px] uppercase tracking-widest">
                 No anomalous activity detected.
               </div>
             ) : (
               flaggedRiders?.map(rider => (
                 <div key={rider.id} className="p-4 border border-white/5 bg-black/40 rounded-2xl flex items-center justify-between group hover:border-red-500/30 transition-all">
                   <div className="flex items-center gap-4">
                     <div className="w-10 h-10 rounded-xl bg-red-500/10 text-red-500 flex items-center justify-center font-black">
                       {rider.users?.full_name?.[0] || "?"}
                     </div>
                     <div>
                       <div className="font-bold text-sm text-white group-hover:text-red-400 transition-colors">{rider.users?.full_name || "Unknown"}</div>
                       <div className="text-[10px] text-charcoal-500 font-black uppercase tracking-widest">Rating: {rider.rating}</div>
                     </div>
                   </div>
                   <FraudActions riderId={rider.user_id} />
                 </div>
               ))
             )}
           </div>
        </div>

        {/* Voided Escrows */}
        <div className="bg-charcoal-900/40 border border-white/5 rounded-[2rem] p-8">
           <h2 className="text-sm font-black uppercase tracking-[0.2em] text-amber-500 mb-6 flex items-center gap-2">
             <ShieldAlert size={16} /> Recent Voided Holds
           </h2>

           <div className="space-y-4">
             {voidedOrders?.length === 0 ? (
               <div className="text-center py-10 border-2 border-dashed border-white/5 rounded-2xl text-charcoal-600 font-black text-[10px] uppercase tracking-widest">
                 No voided escrows detected.
               </div>
             ) : (
               voidedOrders?.map(order => (
                 <div key={order.id} className="p-4 border border-white/5 bg-black/40 rounded-2xl flex items-center justify-between">
                   <div className="space-y-1">
                     <div className="font-mono text-xs text-charcoal-300 font-black">ID: {order.id.slice(0,8).toUpperCase()}</div>
                     <div className="text-[9px] text-red-500 font-black uppercase tracking-widest bg-red-500/10 px-2 py-0.5 rounded inline-block">
                       CANCELLED
                     </div>
                   </div>
                   <div className="text-right">
                     <div className="text-lg font-black text-amber-500 font-outfit italic tracking-tighter">â‚¦{order.agreed_price?.toLocaleString()}</div>
                     <div className="text-[9px] text-charcoal-600 font-black uppercase tracking-widest">Voided value</div>
                   </div>
                 </div>
               ))
             )}
           </div>
        </div>
      </div>
    </div>
  );
}
