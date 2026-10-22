import { redirect } from "next/navigation";
import { createClient } from "@/utils/supabase/server";
import Link from "next/link";
import { Clock, ShieldAlert, AlertTriangle } from "lucide-react";
import { RiderTopBar, RiderTabBar } from "@/components/rider/RiderNav";
import SignOutButton from "@/components/ui/SignOutButton";

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
    .select("status, rejection_reason, users(full_name)")
    .eq("user_id", user.id)
    .single();

  // Redirect to onboarding if they haven't submitted anything yet
  if (!rider) {
    redirect("/rider/onboarding");
  }

  const isApproved = rider.status === "approved";
  const isPending = rider.status === "pending";
  const isRejected = rider.status === "rejected";
  const isPaused = rider.status === "paused";

  return (
    <div className="rider-theme flex flex-col min-h-[100dvh] bg-charcoal-950 text-ink selection:bg-emerald-500 overflow-x-hidden">
      <RiderTopBar showMenu={isApproved || isPending} />
      
      <main className="flex-1 w-full max-w-lg mx-auto relative px-5 pt-4" style={{ paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 5.5rem)" }}>
        {/* SOFT-LOCK OVERLAYS (STRICT SPEC RULE #16) */}
        
        {/* 1. Pending Toast (Removed Overlay so they can see feed) */}
        {isPending && (
          <div className="fixed top-20 inset-x-0 z-[100] flex justify-center pointer-events-none">
            <div className="bg-emerald-500/10 border border-emerald-500/20 backdrop-blur-md px-6 py-3 rounded-full text-emerald-500 font-black text-[10px] uppercase tracking-widest flex items-center gap-2 shadow-glow">
              <Clock className="animate-pulse" size={14} /> View Only Mode - Verification Pending
            </div>
          </div>
        )}

        {/* 2. Rejected / Paused Lock */}
        {(isRejected || isPaused) && (
          <div className="fixed inset-0 z-[100] bg-charcoal-950 flex flex-col items-center justify-center-safe overflow-y-auto p-8 text-center">
            <div className="w-20 h-20 bg-red-500/10 border border-red-500/20 rounded-full flex items-center justify-center mb-8">
               <ShieldAlert className="text-red-500" size={36} />
            </div>
            <h2 className="text-2xl font-black text-ink mb-2">{isRejected ? "Access Denied" : "Account Paused"}</h2>
            <p className="text-red-400/80 text-xs font-black uppercase tracking-widest mb-6">Status ID: {rider.status}</p>
            
            <div className="bg-red-500/5 border border-red-500/20 rounded-2xl p-5 mb-8 w-full">
               <div className="flex items-start gap-3 text-left">
                  <AlertTriangle className="text-red-400 shrink-0 mt-0.5" size={16} />
                  <div>
                    <div className="text-ink text-sm font-bold mb-1">Reason for restriction:</div>
                    <p className="text-charcoal-400 text-xs leading-relaxed">
                      {rider.rejection_reason || "Your profile requires further verification or violated terms of service. Please contact our Kano operations center."}
                    </p>
                  </div>
               </div>
            </div>

            <SignOutButton className="w-full py-4 bg-white/5 border border-white/10 rounded-2xl text-ink font-black text-sm block text-center cursor-pointer hover:bg-white/10 transition-colors">
              Sign Out
            </SignOutButton>
          </div>
        )}

        {/* 3. Approved Content */}
        {(!isRejected && !isPaused) && children}
      </main>

      {isApproved && <RiderTabBar />}
    </div>
  );
}