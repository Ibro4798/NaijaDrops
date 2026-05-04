"use client";

import { motion } from "framer-motion";
import { Package, Bike, ArrowRight, CheckCircle2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { createClient } from "@/utils/supabase/client";
import { useState, useEffect } from "react";

export default function SelectModePage() {
  const router = useRouter();
  const supabase = createClient();
  const [loading, setLoading] = useState(null);
  const [user, setUser] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setUser(data?.user));
  }, []);

  async function handleSelection(mode) {
    if (!user) {
      router.push("/auth/login");
      return;
    }

    try {
      // 1. Set Mode Cookie (For Middleware Guards)
      document.cookie = `nd_active_mode=${mode}; path=/; max-age=31536000; SameSite=Lax`;
      
      // 2. Set Mode in Local Storage (For UI checks)
      localStorage.setItem("nd_active_mode", mode);

      // 3. Ensure User exists in public.users (Identity Sync)
      const { data: profile } = await supabase.from("users").select("id").eq("id", user.id).single();
      if (!profile) {
        await supabase.from("users").insert({
          id: user.id,
          phone: user.phone || null,
          name: user.user_metadata?.full_name || user.email?.split('@')[0] || "New User"
        });
      }

      if (mode === "customer") {
        // 3. Update User Role
        await supabase.from("users").update({ role: 'vendor' }).eq("id", user.id);
        
        // 4. Ensure Vendor Profile exists
        const { data: vendor } = await supabase.from("vendors").select("id").eq("user_id", user.id).single();
        if (!vendor) {
          await supabase.from("vendors").insert({
            user_id: user.id,
            business_name: user.email?.split('@')[0] || "New Vendor"
          });
        }
        router.push("/dashboard"); 
      } else if (mode === "rider") {
        // 3. Check if Rider Profile Exists
        const { data: rider, error: fetchError } = await supabase
          .from("riders")
          .select("status")
          .eq("user_id", user.id)
          .single();

        if (!rider) {
          // Create initial pending rider row
          const { error: insertError } = await supabase.from("riders").insert({
            user_id: user.id,
            status: 'offline', // Complying with DB check constraint
            operational_status: 'offline'
          });
          
          if (insertError) throw insertError;
          router.push("/driver/onboarding");
        } else {
          router.push("/rider"); 
        }
      }
    } catch (err) {
      console.error("Selection Error:", err);
      setError(err.message);
      setLoading(null);
    }
  }

  return (
    <main className="min-h-screen bg-charcoal-950 flex flex-col items-center justify-center p-6 relative overflow-hidden font-outfit">
      {/* Background glow */}
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute top-1/4 left-1/2 -translate-x-1/2 w-[800px] h-[400px] bg-emerald-500/[0.03] blur-[100px] rounded-full" />
      </div>

      <div className="text-center mb-10 relative z-10">
        <h1 className="text-3xl font-black text-white tracking-tight mb-2">How do you want to use NaijaDrops?</h1>
        <p className="text-charcoal-400 text-sm font-medium">You can always switch modes later in your profile.</p>
        
        {error && (
          <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} 
            className="mt-6 p-4 bg-red-500/10 border border-red-500/20 rounded-2xl text-red-400 text-xs font-bold uppercase tracking-widest">
            ⚠️ Connection Error: {error}
          </motion.div>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 w-full max-w-3xl relative z-10">
        {/* Customer Option */}
        <motion.button
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
          onClick={() => handleSelection("customer")}
          disabled={loading !== null}
          className={`relative group text-left overflow-hidden rounded-[2rem] border ${loading === "customer" ? "border-emerald-500/50 bg-emerald-500/5" : "border-white/10 bg-white/[0.02] hover:bg-white/[0.04]"} p-8 transition-all duration-300`}
        >
          <div className="w-14 h-14 bg-charcoal-900 border border-white/10 rounded-2xl flex items-center justify-center mb-6 group-hover:border-emerald-500/50 group-hover:bg-emerald-500/10 transition-all">
            <Package size={28} className="text-emerald-500" />
          </div>
          <h2 className="text-2xl font-black text-white tracking-tight mb-2">Send Packages</h2>
          <p className="text-charcoal-400 text-sm leading-relaxed mb-8">
            Create deliveries, track orders in real-time, and negotiate prices directly with drivers in your area.
          </p>
          <div className="flex items-center text-emerald-500 font-bold text-sm">
            {loading === "customer" ? "Setting up..." : "Continue to Dashboard"} <ArrowRight size={16} className="ml-2 group-hover:translate-x-1 transition-transform" />
          </div>
        </motion.button>

        {/* Rider Option */}
        <motion.button
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
          onClick={() => handleSelection("rider")}
          disabled={loading !== null}
          className={`relative group text-left overflow-hidden rounded-[2rem] border ${loading === "rider" ? "border-amber-500/50 bg-amber-500/5" : "border-white/10 bg-white/[0.02] hover:bg-white/[0.04]"} p-8 transition-all duration-300`}
        >
          <div className="w-14 h-14 bg-charcoal-900 border border-white/10 rounded-2xl flex items-center justify-center mb-6 group-hover:border-amber-500/50 group-hover:bg-amber-500/10 transition-all">
            <Bike size={28} className="text-amber-500" />
          </div>
          <h2 className="text-2xl font-black text-white tracking-tight mb-2">Become a Rider</h2>
          <p className="text-charcoal-400 text-sm leading-relaxed mb-8">
            Accept dispatches, negotiate your own fares, and earn money on your own schedule.
          </p>
          <div className="flex items-center text-amber-500 font-bold text-sm">
             {loading === "rider" ? "Preparing Onboarding..." : "Start Earning"} <ArrowRight size={16} className="ml-2 group-hover:translate-x-1 transition-transform" />
          </div>
        </motion.button>
      </div>
      
      <div className="mt-12 flex items-center gap-2 text-[10px] font-black text-charcoal-600 uppercase tracking-widest">
        <CheckCircle2 size={12} className="text-emerald-500" /> One Unified Account
      </div>
    </main>
  );
}
