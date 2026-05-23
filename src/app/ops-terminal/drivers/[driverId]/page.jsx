import { createClient } from "@/utils/supabase/server";
import { validateAdmin } from "@/utils/admin";
import { ArrowLeft, FileText, MessageCircle } from "lucide-react";
import Link from "next/link";
import DriverFeedbackWidget from "./DriverFeedbackWidget";

export const dynamic = "force-dynamic";

export default async function DriverDetailPage({ params }) {
  const { driverId } = await params;
  const { admin } = await validateAdmin();
  const supabase = await createClient();

  const { data: rider, error } = await supabase
    .from("riders")
    .select("*, users(id, full_name, email, phone)")
    .eq("user_id", driverId)
    .single();

  if (error || !rider) {
    return (
      <div className="min-h-screen bg-black text-white p-8 flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-3xl font-black mb-4">Driver Not Found</h1>
          <Link href="/ops-terminal/drivers" className="text-emerald-500">← Back</Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-black text-white p-8">
      <Link href="/ops-terminal/drivers" className="inline-flex items-center gap-2 text-charcoal-500 hover:text-white mb-8">
        <ArrowLeft size={18} /> Back to Registry
      </Link>

      <div className="max-w-4xl">
        <div className="bg-charcoal-900/50 border border-white/10 rounded-3xl p-8 mb-8">
          <div className="flex gap-6">
            <div className="w-24 h-24 rounded-2xl bg-charcoal-800 border border-white/10 overflow-hidden flex-shrink-0">
              {rider.profile_photo_url ? (
                <img src={rider.profile_photo_url} alt="Profile" className="w-full h-full object-cover" />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-charcoal-600 text-xs">NO PHOTO</div>
              )}
            </div>

            <div className="flex-1">
              <div className="flex items-center gap-3 mb-2">
                <h1 className="text-3xl font-black">{rider.users?.full_name}</h1>
                <span className={`px-3 py-1 rounded-lg text-xs font-black uppercase ${rider.status === "approved" ? "bg-emerald-500/20 text-emerald-400" : "bg-amber-500/20 text-amber-400"}`}>
                  {rider.status}
                </span>
              </div>
              <p className="text-charcoal-400 mb-1">{rider.users?.email}</p>
              <p className="text-charcoal-500 text-sm mb-4">{rider.users?.phone || "No phone"}</p>
              <div className="grid grid-cols-3 gap-4">
                <div className="bg-white/5 rounded-xl p-3">
                  <div className="text-[10px] text-charcoal-500 font-bold uppercase">Vehicle</div>
                  <div className="text-lg font-black">{rider.vehicle_type}</div>
                </div>
                <div className="bg-white/5 rounded-xl p-3">
                  <div className="text-[10px] text-charcoal-500 font-bold uppercase">Plate</div>
                  <div className="text-lg font-black">{rider.plate_number || "N/A"}</div>
                </div>
                <div className="bg-white/5 rounded-xl p-3">
                  <div className="text-[10px] text-charcoal-500 font-bold uppercase">Rating</div>
                  <div className="text-lg font-black text-amber-400">⭐ {rider.rating || "5.0"}</div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="bg-charcoal-900/50 border border-white/10 rounded-3xl p-8 mb-8">
          <h2 className="text-2xl font-black mb-6">Documents</h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {rider.government_id_url && (
              <a href={rider.government_id_url} target="_blank" className="bg-white/5 border border-white/10 rounded-2xl p-4 hover:bg-white/10 text-center">
                <FileText size={32} className="mx-auto mb-3 text-emerald-500" />
                <span className="text-xs font-black uppercase">Gov ID</span>
              </a>
            )}
            {rider.driver_license_url && (
              <a href={rider.driver_license_url} target="_blank" className="bg-white/5 border border-white/10 rounded-2xl p-4 hover:bg-white/10 text-center">
                <FileText size={32} className="mx-auto mb-3 text-blue-500" />
                <span className="text-xs font-black uppercase">License</span>
              </a>
            )}
            {rider.vehicle_photo_url && (
              <a href={rider.vehicle_photo_url} target="_blank" className="bg-white/5 border border-white/10 rounded-2xl p-4 hover:bg-white/10 text-center">
                <FileText size={32} className="mx-auto mb-3 text-purple-500" />
                <span className="text-xs font-black uppercase">Vehicle</span>
              </a>
            )}
            {!rider.government_id_url && !rider.driver_license_url && !rider.vehicle_photo_url && (
              <div className="col-span-full text-center py-8 text-charcoal-600">No documents uploaded</div>
            )}
          </div>
        </div>

        <DriverFeedbackWidget driverId={driverId} riderName={rider.users?.full_name} currentStatus={rider.status} />
      </div>
    </div>
  );
}