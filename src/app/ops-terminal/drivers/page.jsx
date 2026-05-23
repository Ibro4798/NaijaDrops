import { validateAdmin, logAdminAction } from "@/utils/admin";
import { createClient } from "@/utils/supabase/server";
import { UserCheck, UserX, FileText, Star, ShieldCheck, Search, Filter } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import DriverActions from "./DriverActions";
import InviteDriverButton from "./InviteDriverButton";

export const dynamic = "force-dynamic";

export default async function AdminDriversPage() {
  const { admin } = await validateAdmin();
  const supabase = await createClient();

  const { data: riders, error } = await supabase
    .from("riders")
    .select("*, users(full_name, email, phone)")
    .order("created_at", { ascending: false });

  const pendingRiders = riders?.filter(r => r.status === "pending") || [];
  const approvedRiders = riders?.filter(r => r.status === "approved") || [];

  return (
    <div className="min-h-screen bg-black text-white p-8 font-mono">
      <div className="flex justify-between items-end mb-12 border-b border-white/10 pb-8">
        <div>
           <h1 className="text-3xl font-black italic tracking-tighter uppercase">Registry / Drivers</h1>
           <p className="text-charcoal-500 text-xs mt-2 uppercase tracking-widest">
             {pendingRiders.length} Pending Review · {approvedRiders.length} Active Units
           </p>
        </div>
        <div className="flex gap-4 items-center">
           <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-charcoal-600" size={14} />
              <input type="text" placeholder="Search ID / Name" className="bg-charcoal-900 border border-white/10 rounded-xl pl-10 pr-4 py-2 text-xs focus:border-emerald-500 outline-none" />
           </div>
           <InviteDriverButton />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4">
        {riders && riders.length > 0 ? (
          riders.map((rider) => (
            <Link key={rider.user_id} href={`/ops-terminal/drivers/${rider.user_id}`}>
              <div className="bg-charcoal-900/40 border border-white/5 rounded-2xl p-6 flex flex-wrap lg:flex-nowrap items-center gap-8 hover:border-white/10 hover:bg-charcoal-900/50 transition-all cursor-pointer">
               
                <div className="w-16 h-16 rounded-2xl bg-charcoal-800 border border-white/5 overflow-hidden flex-shrink-0">
                  {rider.profile_photo_url ? (
                    <img src={rider.profile_photo_url} alt="Profile" className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-charcoal-600 uppercase text-xs font-black">ND</div>
                  )}
                </div>

                <div className="flex-1 min-w-[200px]">
                  <div className="flex items-center gap-2 mb-1">
                    <h3 className="text-lg font-black tracking-tight">{rider.users?.full_name || "Unknown"}</h3>
                    <span className={`px-2 py-0.5 rounded-md text-[8px] font-black uppercase tracking-widest ${
                      rider.status === "approved" 
                        ? 'bg-emerald-500/10 text-emerald-500' 
                        : 'bg-amber-500/10 text-amber-500'
                    }`}>
                       {rider.status === "approved" ? 'Approved' : 'Pending'}
                    </span>
                  </div>
                  <div className="text-[10px] text-charcoal-500 font-bold uppercase tracking-widest">{rider.users?.email}</div>
                  <div className="text-[10px] text-charcoal-600 font-bold uppercase tracking-widest">{rider.users?.phone || 'No Phone'}</div>
                    <div className="flex items-center gap-3 mt-3">
                       <div className="flex items-center gap-1 text-amber-500 text-xs font-black">? {rider.rating || "5.0"}</div>
                       <div className="text-[10px] text-charcoal-600 uppercase font-black">{rider.vehicle_type} • {rider.plate_number || 'No Plate'}</div>
                    </div>
                </div>

                <div className="flex gap-4">
                  {rider.driver_license_url && (
                    <div className="flex flex-col items-center p-3 rounded-xl bg-white/5 border border-white/5">
                      <FileText size={18} className="text-charcoal-500" />
                      <span className="text-[8px] font-black text-charcoal-600 mt-2 uppercase">License</span>
                    </div>
                  )}
                  {rider.government_id_url && (
                    <div className="flex flex-col items-center p-3 rounded-xl bg-white/5 border border-white/5">
                      <ShieldCheck size={18} className="text-charcoal-500" />
                      <span className="text-[8px] font-black text-charcoal-600 mt-2 uppercase">Gov ID</span>
                    </div>
                  )}
                </div>

                <DriverActions riderId={rider.user_id} isApproved={rider.status === "approved"} />
              </div>
            </Link>
          ))
        ) : (
          <div className="py-20 text-center border-2 border-dashed border-white/5 rounded-[2rem]">
             <UserX size={40} className="mx-auto mb-4 text-charcoal-800" />
             <p className="text-charcoal-600 font-bold uppercase tracking-widest text-xs">No Workforce Units Registered</p>
          </div>
        )}
      </div>
    </div>
  );
}
