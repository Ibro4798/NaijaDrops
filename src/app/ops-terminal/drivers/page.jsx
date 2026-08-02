import { validateAdmin } from "@/utils/admin";
import { createClient } from "@/utils/supabase/server";
import { FileText, IdCard, ShieldCheck, ArrowRight } from "lucide-react";
import Link from "next/link";
import InviteDriverButton from "./InviteDriverButton";

export const dynamic = "force-dynamic";

function RiderRow({ rider }) {
  const name = rider.users?.full_name || rider.full_name || "Unnamed Rider";
  return (
    <Link href={`/ops-terminal/drivers/${rider.user_id}`}>
      <div className="bg-charcoal-900/40 border border-white/5 rounded-2xl p-6 flex items-center gap-6 hover:border-emerald-500/20 transition-all cursor-pointer">
        <div className="w-16 h-16 rounded-2xl bg-charcoal-800 flex-shrink-0 flex items-center justify-center text-xs font-black overflow-hidden">
          {rider.profile_photo_url ? (
            <img src={rider.profile_photo_url} alt="Profile" className="w-full h-full object-cover" />
          ) : (
            "ND"
          )}
        </div>
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <h3 className="text-lg font-black">{name}</h3>
            <span className={`text-xs font-black px-2 py-1 rounded ${rider.status === "approved" ? "bg-emerald-500/20 text-emerald-400" : rider.status === "rejected" ? "bg-red-500/20 text-red-400" : "bg-amber-500/20 text-amber-400"}`}>
              {rider.status}
            </span>
          </div>
          <p className="text-charcoal-500 text-sm">{rider.users?.email || rider.phone || "No contact on file"}</p>
        </div>
        <div className="flex gap-2 items-center">
          {rider.license_url && <FileText size={18} className="text-blue-500" title="License submitted" />}
          {rider.id_card_url && <ShieldCheck size={18} className="text-emerald-500" title="ID submitted" />}
        </div>
        <div className="flex items-center gap-2 text-charcoal-500 text-[10px] font-black uppercase tracking-widest ml-4">
          Review <ArrowRight size={14} />
        </div>
      </div>
    </Link>
  );
}

export default async function AdminDriversPage() {
  await validateAdmin();
  const supabase = await createClient();

  const { data: riders } = await supabase
    .from("riders")
    .select("*, users(full_name, email, phone)")
    .order("created_at", { ascending: false });

  const all = await Promise.all(
    (riders || []).map(async (r) => ({
      ...r,
      profile_photo_url: await getSignedDocUrl(supabase, r.profile_photo_url),
    }))
  );
  const pendingRiders = all.filter(r => r.status === "pending");
  const approvedRiders = all.filter(r => r.status === "approved");
  const pausedRiders = all.filter(r => r.status === "paused");
  const rejectedRiders = all.filter(r => r.status === "rejected");
  const draftRiders = all.filter(r => r.status === "draft" || !r.status);

  return (
    <div className="min-h-screen bg-black text-white p-8 font-mono">
      <div className="flex justify-between items-end mb-12 border-b border-white/10 pb-8">
        <div>
          <h1 className="text-3xl font-black italic tracking-tighter uppercase">Registry / Riders</h1>
          <p className="text-charcoal-500 text-xs mt-2 uppercase tracking-widest">
            {pendingRiders.length} Pending Review · {approvedRiders.length} Active · {pausedRiders.length} Paused
          </p>
        </div>
        <InviteDriverButton />
      </div>

      {pendingRiders.length > 0 && (
        <div className="mb-10">
          <h2 className="text-xs font-black uppercase tracking-[0.2em] text-amber-500 mb-4">Awaiting Review ({pendingRiders.length})</h2>
          <div className="grid grid-cols-1 gap-4">
            {pendingRiders.map((rider) => <RiderRow key={rider.user_id} rider={rider} />)}
          </div>
        </div>
      )}

      {pausedRiders.length > 0 && (
        <div className="mb-10">
          <h2 className="text-xs font-black uppercase tracking-[0.2em] text-amber-500 mb-4">Paused ({pausedRiders.length})</h2>
          <div className="grid grid-cols-1 gap-4">
            {pausedRiders.map((rider) => <RiderRow key={rider.user_id} rider={rider} />)}
          </div>
        </div>
      )}

      {approvedRiders.length > 0 && (
        <div className="mb-10">
          <h2 className="text-xs font-black uppercase tracking-[0.2em] text-emerald-500 mb-4">Active ({approvedRiders.length})</h2>
          <div className="grid grid-cols-1 gap-4">
            {approvedRiders.map((rider) => <RiderRow key={rider.user_id} rider={rider} />)}
          </div>
        </div>
      )}

      {rejectedRiders.length > 0 && (
        <div className="mb-10">
          <h2 className="text-xs font-black uppercase tracking-[0.2em] text-red-500 mb-4">Rejected ({rejectedRiders.length})</h2>
          <div className="grid grid-cols-1 gap-4">
            {rejectedRiders.map((rider) => <RiderRow key={rider.user_id} rider={rider} />)}
          </div>
        </div>
      )}

      {draftRiders.length > 0 && (
        <details className="mb-10">
          <summary className="text-xs font-black uppercase tracking-[0.2em] text-charcoal-600 mb-4 cursor-pointer select-none">
            In Progress, Not Yet Submitted ({draftRiders.length})
          </summary>
          <div className="grid grid-cols-1 gap-4 mt-4">
            {draftRiders.map((rider) => <RiderRow key={rider.user_id} rider={rider} />)}
          </div>
        </details>
      )}

      {all.length === 0 && (
        <div className="text-center py-20 text-charcoal-600">No riders yet</div>
      )}
    </div>
  );
}