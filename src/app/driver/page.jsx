"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/utils/supabase/client";
import { useRouter } from "next/navigation";
import { 
  Briefcase, 
  Clock, 
  MapPin, 
  Truck, 
  ShieldCheck, 
  AlertCircle, 
  Loader2,
  ChevronRight,
  User
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

export default function DriverDashboard() {
  const supabase = createClient();
  const router = useRouter();
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function checkDriverStatus() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        router.replace("/auth/login");
        return;
      }

      // Check if driver profile exists
      const { data: driver } = await supabase
        .from("riders") // Current table name for drivers in this codebase
        .select("*")
        .eq("user_id", user.id)
        .maybeSingle();

      if (!driver) {
        // Redirect to onboarding if no profile exists
        router.replace("/driver/onboarding");
        return;
      }

      setProfile(driver);
      setLoading(false);
    }

    checkDriverStatus();
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen bg-charcoal-950 flex items-center justify-center">
        <Loader2 className="text-emerald-500 animate-spin" size={32} />
      </div>
    );
  }

  // If status is not approved, show the status screen (same as onboarding)
  if (profile.status !== 'approved') {
    router.replace("/driver/onboarding");
    return null;
  }

  return (
    <div className="flex flex-col gap-6 p-6">
      <header className="pt-8">
        <div className="text-[10px] font-black text-emerald-500 uppercase tracking-[0.2em] mb-2">Available for Jobs</div>
        <h1 className="text-3xl font-black text-white italic uppercase tracking-tighter font-outfit">Driver Terminal</h1>
      </header>

      {/* Online/Offline Toggle */}
      <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-3xl p-6 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <div className="relative">
            <div className="w-12 h-12 bg-emerald-500 rounded-full flex items-center justify-center text-charcoal-950">
              <Truck size={24} />
            </div>
            <div className="absolute -top-1 -right-1 w-4 h-4 bg-emerald-400 rounded-full border-2 border-charcoal-950 animate-pulse" />
          </div>
          <div>
            <div className="text-white font-black uppercase text-sm italic tracking-tight">Status: Online</div>
            <div className="text-emerald-500/60 text-[10px] font-bold uppercase tracking-widest">Awaiting dispatch</div>
          </div>
        </div>
        <button className="px-5 py-2.5 bg-white/5 border border-white/10 rounded-xl text-white text-[10px] font-black uppercase tracking-widest hover:bg-white/10 transition-all">
          Go Offline
        </button>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-2 gap-4">
        <div className="bg-charcoal-900 border border-white/10 rounded-3xl p-5">
          <div className="text-charcoal-500 text-[10px] font-black uppercase tracking-widest mb-1">Today's Jobs</div>
          <div className="text-2xl font-black text-white font-outfit italic">0</div>
        </div>
        <div className="bg-charcoal-900 border border-white/10 rounded-3xl p-5">
          <div className="text-charcoal-500 text-[10px] font-black uppercase tracking-widest mb-1">Earnings</div>
          <div className="text-2xl font-black text-emerald-500 font-outfit italic">₦0</div>
        </div>
      </div>

      {/* Jobs List */}
      <div className="flex-1">
        <div className="flex items-center justify-between mb-4 px-2">
          <h2 className="text-xs font-black text-charcoal-500 uppercase tracking-[0.2em]">Live Job Stream</h2>
          <div className="flex items-center gap-1.5 text-[10px] font-bold text-emerald-500">
            <div className="w-1 h-1 bg-emerald-500 rounded-full animate-ping" />
            LIVE
          </div>
        </div>

        <div className="bg-white/[0.02] border border-dashed border-white/10 rounded-[2rem] p-12 flex flex-col items-center text-center">
          <div className="w-16 h-16 bg-white/[0.03] rounded-full flex items-center justify-center mb-6">
            <Briefcase className="text-charcoal-700" size={32} />
          </div>
          <h3 className="text-white font-bold text-sm mb-2">No active jobs in your area</h3>
          <p className="text-charcoal-500 text-[10px] leading-relaxed max-w-[180px]">
            New orders from Kano vendors will appear here as they come in.
          </p>
        </div>
      </div>
    </div>
  );
}
