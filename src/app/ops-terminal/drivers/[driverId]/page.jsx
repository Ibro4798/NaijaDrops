import { validateAdmin } from "@/utils/admin";
import { createClient } from "@/utils/supabase/server";
import Link from "next/link";
import { ArrowLeft, Phone, Truck, Hash, FileText, IdCard, Bike, UserCircle2 } from "lucide-react";
import DriverReviewActions from "./DriverReviewActions";

export const dynamic = "force-dynamic";

const STATUS_STYLES = {
  draft:    "bg-charcoal-700/40 text-charcoal-300",
  pending:  "bg-amber-500/20 text-amber-400",
  approved: "bg-emerald-500/20 text-emerald-400",
  paused:   "bg-amber-500/20 text-amber-400",
  rejected: "bg-red-500/20 text-red-400",
};

function DocCard({ label, url, Icon }) {
  return (
    <div className="bg-charcoal-900/40 border border-white/5 rounded-2xl overflow-hidden">
      <div className="aspect-[4/3] bg-black/40 flex items-center justify-center relative">
        {url ? (
          <a href={url} target="_blank" rel="noopener noreferrer" className="block w-full h-full">
            <img src={url} alt={label} className="w-full h-full object-cover hover:opacity-80 transition-opacity" />
          </a>
        ) : (
          <div className="flex flex-col items-center gap-2 text-charcoal-700">
            <Icon size={28} />
            <span className="text-[10px] font-black uppercase tracking-widest">Not submitted</span>
          </div>
        )}
      </div>
      <div className="p-3 flex items-center gap-2">
        <Icon size={14} className="text-charcoal-500" />
        <span className="text-[10px] font-black uppercase tracking-widest text-charcoal-400">{label}</span>
        {url && <span className="ml-auto text-[9px] font-black uppercase text-emerald-500">Tap to enlarge</span>}
      </div>
    </div>
  );
}

export default async function DriverReviewPage({ params }) {
  await validateAdmin();
  const supabase = await createClient();
  const { driverId } = await params;

  const { data: riderRaw } = await supabase
    .from("riders")
    .select("*, users(full_name, email, phone)")
    .eq("user_id", driverId)
    .single();

  const rider = riderRaw ? await resolveRiderDocUrls(supabase, riderRaw) : null;

  if (!rider) {
    return (
      <div className="min-h-screen bg-black text-white p-8 font-mono">
        <Link href="/ops-terminal/drivers" className="inline-flex items-center gap-2 text-charcoal-400 hover:text-white text-sm font-bold mb-8">
          <ArrowLeft size={16} /> Back to Registry
        </Link>
        <p className="text-charcoal-500">No rider found for this ID.</p>
      </div>
    );
  }

  const name = rider.users?.full_name || rider.full_name || "Unnamed Rider";
  const statusStyle = STATUS_STYLES[rider.status] || STATUS_STYLES.draft;

  return (
    <div className="min-h-screen bg-black text-white p-8 font-mono">
      <Link href="/ops-terminal/drivers" className="inline-flex items-center gap-2 text-charcoal-400 hover:text-white text-sm font-bold mb-8 transition-colors">
        <ArrowLeft size={16} /> Back to Registry
      </Link>

      {/* Header */}
      <div className="flex items-start gap-6 mb-10 border-b border-white/10 pb-8">
        <div className="w-20 h-20 rounded-2xl bg-charcoal-800 flex-shrink-0 flex items-center justify-center overflow-hidden">
          {rider.profile_photo_url ? (
            <img src={rider.profile_photo_url} alt={name} className="w-full h-full object-cover" />
          ) : (
            <UserCircle2 size={36} className="text-charcoal-600" />
          )}
        </div>
        <div className="flex-1">
          <div className="flex items-center gap-3 mb-1">
            <h1 className="text-2xl font-black tracking-tight">{name}</h1>
            <span className={`text-[10px] font-black px-3 py-1 rounded-full uppercase tracking-widest ${statusStyle}`}>
              {rider.status || 'draft'}
            </span>
          </div>
          <div className="flex flex-wrap gap-x-6 gap-y-1 text-charcoal-400 text-xs font-bold">
            {(rider.users?.email) && <span>{rider.users.email}</span>}
            {(rider.phone || rider.users?.phone) && (
              <span className="flex items-center gap-1.5"><Phone size={12} /> {rider.phone || rider.users?.phone}</span>
            )}
            {rider.vehicle_type && (
              <span className="flex items-center gap-1.5"><Truck size={12} /> {rider.vehicle_type}</span>
            )}
            {rider.plate_number && (
              <span className="flex items-center gap-1.5"><Hash size={12} /> {rider.plate_number}</span>
            )}
          </div>
        </div>
      </div>

      {/* Prior reason on file, if any (rejection or pause) */}
      {rider.rejection_reason && (
        <div className="bg-charcoal-900/40 border border-white/10 rounded-2xl p-5 mb-8">
          <div className="text-[10px] font-black uppercase tracking-widest text-charcoal-500 mb-1">
            Reason on file ({rider.status})
          </div>
          <p className="text-white text-sm">{rider.rejection_reason}</p>
        </div>
      )}

      {/* Documents */}
      <div className="mb-10">
        <h2 className="text-sm font-black uppercase tracking-[0.2em] text-emerald-500 mb-6 flex items-center gap-2">
          <FileText size={16} /> Submitted Documents
        </h2>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <DocCard label="Profile Photo" url={rider.profile_photo_url} Icon={UserCircle2} />
          <DocCard label="ID Card" url={rider.id_card_url} Icon={IdCard} />
          <DocCard label="Driver's License" url={rider.license_url} Icon={FileText} />
          <DocCard label="Vehicle Photo" url={rider.vehicle_photo_url} Icon={Bike} />
        </div>
      </div>

      {/* Actions */}
      <div>
        <h2 className="text-sm font-black uppercase tracking-[0.2em] text-emerald-500 mb-6">Decision</h2>
        <DriverReviewActions riderId={rider.user_id} status={rider.status} />
      </div>
    </div>
  );
}