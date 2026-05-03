import { validateAdmin, logAdminAction } from "@/utils/admin";
import { createClient } from "@/utils/supabase/server";
import { UserCheck, UserX, FileText, Star, ShieldCheck, Search, Filter } from "lucide-react";
import Image from "next/image";
import DriverActions from "./DriverActions";

export const dynamic = "force-dynamic";

export default async function AdminDriversPage() {
  const { admin } = await validateAdmin(); // Layer 2 Security
  const supabase = createClient();

  const { data: riders } = await supabase
    .from("riders")
    .select("*, users(full_name, email)")
    .order("created_at", { ascending: false });

  return (
    <div className="min-h-screen bg-black text-white p-8 font-mono">
      {/* Header */}
      <div className="flex justify-between items-end mb-12 border-b border-white/10 pb-8">
        <div>
           <h1 className="text-3xl font-black italic tracking-tighter uppercase">Registry / Drivers</h1>
           <p className="text-charcoal-500 text-xs mt-2 uppercase tracking-widest">Managing {riders?.length || 0} Registered Workforce Units</p>
        </div>
        <div className="flex gap-4">
           <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-charcoal-600" size={14} />
              <input type="text" placeholder="Search ID / Name" className="bg-charcoal-900 border border-white/10 rounded-xl pl-10 pr-4 py-2 text-xs focus:border-emerald-500 outline-none" />
           </div>
        </div>
      </div>

      {/* Driver Grid */}
      <div className="grid grid-cols-1 gap-4">
        {riders?.map((rider) => (
          <div key={rider.user_id} className="bg-charcoal-900/40 border border-white/5 rounded-2xl p-6 flex flex-wrap lg:flex-nowrap items-center gap-8 hover:border-white/10 transition-all">
             
             {/* Profile Photo */}
             <div className="w-16 h-16 rounded-2xl bg-charcoal-800 border border-white/5 overflow-hidden flex-shrink-0">
                {rider.profile_photo_url ? (
                  <img src={rider.profile_photo_url} alt="Profile" className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-charcoal-600 uppercase text-xs font-black">ND</div>
                )}
             </div>

             {/* Identity Info */}
             <div className="flex-1 min-w-[200px]">
                <div className="flex items-center gap-2 mb-1">
                   <h3 className="text-lg font-black tracking-tight">{rider.users?.full_name || "Unknown Identity"}</h3>
                   <span className={`px-2 py-0.5 rounded-md text-[8px] font-black uppercase tracking-widest ${rider.operational_status === 'online' ? 'bg-emerald-500/10 text-emerald-500' : 'bg-charcoal-800 text-charcoal-600'}`}>
                      {rider.operational_status}
                   </span>
                </div>
                <div className="text-[10px] text-charcoal-500 font-bold uppercase tracking-widest">{rider.users?.email}</div>
                <div className="flex items-center gap-3 mt-3">
                   <div className="flex items-center gap-1 text-amber-500 text-xs font-black">
                      <Star size={12} fill="currentColor" /> {rider.rating || "5.0"}
                   </div>
                   <div className="text-[10px] text-charcoal-600 uppercase font-black">{rider.vehicle_type} • {rider.plate_number || 'No Plate'}</div>
                </div>
             </div>

             {/* Document Status */}
             <div className="flex gap-4">
                {rider.driver_license_url && (
                  <a href={rider.driver_license_url} target="_blank" className="flex flex-col items-center p-3 rounded-xl bg-white/5 border border-white/5 hover:bg-white/10 transition-all group">
                    <FileText size={18} className="text-charcoal-500 group-hover:text-white" />
                    <span className="text-[8px] font-black text-charcoal-600 mt-2 uppercase">License</span>
                  </a>
                )}
                {rider.government_id_url && (
                  <a href={rider.government_id_url} target="_blank" className="flex flex-col items-center p-3 rounded-xl bg-white/5 border border-white/5 hover:bg-white/10 transition-all group">
                    <ShieldCheck size={18} className="text-charcoal-500 group-hover:text-white" />
                    <span className="text-[8px] font-black text-charcoal-600 mt-2 uppercase">Gov ID</span>
                  </a>
                )}
             </div>

             {/* Operational Actions */}
             <DriverActions riderId={rider.user_id} currentStatus={rider.status} />
          </div>
        ))}


        {riders?.length === 0 && (
          <div className="py-20 text-center border-2 border-dashed border-white/5 rounded-[2rem]">
             <UserX size={40} className="mx-auto mb-4 text-charcoal-800" />
             <p className="text-charcoal-600 font-bold uppercase tracking-widest text-xs">No Workforce Units Registered</p>
          </div>
        )}
      </div>
    </div>
  );
}
