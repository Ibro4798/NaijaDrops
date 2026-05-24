import { validateAdmin } from "@/utils/admin";
import { createClient } from "@/utils/supabase/server";
import { UserX, FileText, Star, ShieldCheck, Search } from "lucide-react";
import Link from "next/link";
import DriverActions from "./DriverActions";
import InviteDriverButton from "./InviteDriverButton";

export const dynamic = "force-dynamic";

export default async function AdminDriversPage() {
  const { admin } = await validateAdmin();
  const supabase = await createClient();

  const { data: riders } = await supabase
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
            {pendingRiders.length} Pending Review Â· {approvedRiders.length} Active Units
          </p>
        </div>
        <InviteDriverButton />
      </div>

      <div className="grid grid-cols-1 gap-4">
        {riders && riders.length > 0 ? (
          riders.map((rider) => (
            <Link key={rider.user_id} href={`/ops-terminal/drivers/${rider.user_id}`}>
              <div className="bg-charcoal-900/40 border border-white/5 rounded-2xl p-6 flex items-center gap-6 hover:border-emerald-500/20 transition-all cursor-pointer">
                <div className="w-16 h-16 rounded-2xl bg-charcoal-800 flex-shrink-0 flex items-center justify-center text-xs font-black">
                  {rider.profile_photo_url ? (
                    <img src={rider.profile_photo_url} alt="Profile" className="w-full h-full object-cover rounded-2xl" />
                  ) : (
                    "ND"
                  )}
                </div>
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <h3 className="text-lg font-black">{rider.users?.full_name}</h3>
                    <span className={`text-xs font-black px-2 py-1 rounded ${rider.status === "approved" ? "bg-emerald-500/20 text-emerald-400" : "bg-amber-500/20 text-amber-400"}`}>
                      {rider.status}
                    </span>
                  </div>
                  <p className="text-charcoal-500 text-sm">{rider.users?.email}</p>
                </div>
                <div className="flex gap-2">
                  {rider.driver_license_url && <FileText size={18} className="text-blue-500" />}
                  {rider.government_id_url && <ShieldCheck size={18} className="text-emerald-500" />}
                </div>
                <DriverActions riderId={rider.user_id} isApproved={rider.status === "approved"} />
              </div>
            </Link>
          ))
        ) : (
          <div className="text-center py-20 text-charcoal-600">No drivers</div>
        )}
      </div>
    </div>
  );
}
