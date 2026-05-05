import { redirect } from "next/navigation";
import { createClient } from "@/utils/supabase/server";
import { Clock, ShieldAlert, AlertTriangle, PhoneCall } from "lucide-react";

export default async function RiderLayout({ children }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    redirect("/auth/login");
  }

  // Access control is strictly enforced by the Bouncer Middleware.
  if (!user) redirect("/auth/login");

  // 2. Fetch Driver Profile & Enrollment Status
  const { data: rider } = await supabase
    .from("riders")
    .select("status, rejection_reason, full_name")
    .eq("user_id", user.id)
    .single();

  // Redirect to onboarding if they haven't submitted anything yet
  if (!rider || (!rider.full_name && rider.status !== 'rejected')) {
    redirect("/driver/onboarding");
  }

  const isApproved = rider.status === "approved";
  const isPending = rider.status === "pending";
  const isRejected = rider.status === "rejected";
  const isPaused = rider.status === "paused";

  return (
    <div className="flex flex-col min-h-[100dvh] bg-charcoal-950 text-white selection:bg-emerald-500 overflow-x-hidden">
      {/* Universal Driver Header */}
      <nav className="border-b border-white/5 px-6 pt-12 pb-4 flex justify-between items-center bg-charcoal-950/80 backdrop-blur-xl z-50 sticky top-0">
        <div className="font-outfit font-black text-xl italic tracking-tighter">NaijaDrops <span className="text-emerald-500">Rider</span></div>
        <div className="flex gap-4 text-[10px] font-black uppercase tracking-widest text-charcoal-500">
           {isApproved && (
             <>
               <a href="/rider/home" className="hover:text-emerald-400">Feed</a>
               <a href="/rider/active-job" className="hover:text-emerald-400">Active</a>
               <a href="/rider/earnings" className="hover:text-emerald-400">Money</a>
             </>
           )}
        </div>
      </nav>
      
      <main className="flex-1 w-full max-w-lg mx-auto relative px-5 py-4">
        {/* SOFT-LOCK OVERLAYS (STRICT SPEC RULE #16) */}
        
        {/* 1. Pending Lock */}
        {isPending && (
          <div className="fixed inset-0 z-[100] bg-charcoal-950 flex flex-col items-center justify-center p-8 text-center">
            <div className="w-24 h-24 bg-emerald-500/10 border border-emerald-500/20 rounded-full flex items-center justify-center mb-8 relative">
               <Clock className="text-emerald-500 animate-pulse" size={40} />
               <div className="absolute inset-0 w-24 h-24 rounded-full border border-emerald-500/20 animate-ping opacity-30" />
            </div>
            <h2 className="text-2xl font-black text-white mb-4">Application Under Review</h2>
            <p className="text-charcoal-400 text-sm leading-relaxed mb-8 max-w-xs">
              We've received your documents. Our team in Kano is currently verifying your license and vehicle details.
            </p>
            <div className="w-full bg-white/[0.03] border border-white/10 rounded-2xl p-5 text-left mb-8">
               <div className="text-[10px] font-black text-charcoal-500 uppercase tracking-widest mb-3">Next Steps</div>
               <div className="space-y-3">
                  <div className="flex items-center gap-3 text-xs text-white font-bold">
                     <div className="w-1.5 h-1.5 bg-emerald-500 rounded-full" /> Manual verification of ID
                  </div>
                  <div className="flex items-center gap-3 text-xs text-charcoal-500">
                     <div className="w-1.5 h-1.5 bg-charcoal-700 rounded-full" /> Background check
                  </div>
                  <div className="flex items-center gap-3 text-xs text-charcoal-500">
                     <div className="w-1.5 h-1.5 bg-charcoal-700 rounded-full" /> Profile activation
                  </div>
               </div>
            </div>
            <a href="https://wa.me/234XXXXXXXX" className="flex items-center gap-2 text-emerald-500 font-black text-sm">
               <PhoneCall size={16} /> Contact Support
            </a>
          </div>
        )}

        {/* 2. Rejected / Paused Lock */}
        {(isRejected || isPaused) && (
          <div className="fixed inset-0 z-[100] bg-charcoal-950 flex flex-col items-center justify-center p-8 text-center">
            <div className="w-20 h-20 bg-red-500/10 border border-red-500/20 rounded-full flex items-center justify-center mb-8">
               <ShieldAlert className="text-red-500" size={36} />
            </div>
            <h2 className="text-2xl font-black text-white mb-2">{isRejected ? "Access Denied" : "Account Paused"}</h2>
            <p className="text-red-400/80 text-xs font-black uppercase tracking-widest mb-6">Status ID: {rider.status}</p>
            
            <div className="bg-red-500/5 border border-red-500/20 rounded-2xl p-5 mb-8 w-full">
               <div className="flex items-start gap-3 text-left">
                  <AlertTriangle className="text-red-400 shrink-0 mt-0.5" size={16} />
                  <div>
                    <div className="text-white text-sm font-bold mb-1">Reason for restriction:</div>
                    <p className="text-charcoal-400 text-xs leading-relaxed">
                      {rider.rejection_reason || "Your profile requires further verification or violated terms of service. Please contact our Kano operations center."}
                    </p>
                  </div>
               </div>
            </div>

            <button onClick={() => redirect("/auth/login")} className="w-full py-4 bg-white/5 border border-white/10 rounded-2xl text-white font-black text-sm">Sign Out</button>
          </div>
        )}

        {/* 3. Approved Content */}
        {isApproved && children}
      </main>
    </div>
  );
}
