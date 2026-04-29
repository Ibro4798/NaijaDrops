"use client";

import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { User, Truck, ArrowRight, Loader2, Info } from "lucide-react";
import { createClient } from "@/utils/supabase/client";
import { useRouter } from "next/navigation";

export default function RoleSelectPage() {
  const [loading, setLoading] = useState(false);
  const [checking, setChecking] = useState(true);
  const supabase = createClient();
  const router = useRouter();

  // Check if user already has a role to prevent loops
  useEffect(() => {
    async function checkExistingRole() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        router.push("/auth/login");
        return;
      }

      const { data: profile } = await supabase
        .from("users")
        .select("role")
        .eq("id", user.id)
        .single();

      if (profile?.role === "vendor") router.push("/vendor/dashboard");
      else if (profile?.role === "rider") router.push("/rider");
      
      setChecking(false);
    }
    checkExistingRole();
  }, [router, supabase]);

  async function handleRoleSelect(role) {
    setLoading(role);
    const { data: { user } } = await supabase.auth.getUser();

    // Update profile in users table
    const { error: userError } = await supabase
      .from("users")
      .update({ role, name: user.email?.split('@')[0] || 'User' })
      .eq("id", user.id);

    if (userError) {
      console.error(userError);
      setLoading(false);
      return;
    }

    // Initialize Sub-profile if it doesn't exist
    if (role === "vendor") {
      const { error: ventError } = await supabase
        .from("vendors")
        .upsert({ user_id: user.id, business_name: user.email?.split('@')[0] + ' Biz' }, { onConflict: 'user_id' });
      if (ventError) console.error("Vendor init failed", ventError);
      router.push("/vendor/dashboard");
    } else if (role === "rider") {
      const { error: rideError } = await supabase
        .from("riders")
        .upsert({ user_id: user.id, approved: false }, { onConflict: 'user_id' });
      if (rideError) console.error("Rider init failed", rideError);
      router.push("/rider");
    }
  }

  if (checking) {
    return (
      <div className="min-h-screen bg-charcoal-950 flex items-center justify-center">
        <Loader2 className="text-emerald-500 animate-spin" size={32} />
      </div>
    );
  }

  return (
    <main className="min-h-screen bg-charcoal-950 flex flex-col items-center justify-center p-6 relative overflow-hidden">
      {/* Background Ambience */}
      <div className="absolute inset-0 z-0">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_-10%,#10b98115,transparent_60%)]"></div>
        <div className="absolute inset-0 opacity-[0.03] bg-[url('https://grainy-gradients.vercel.app/noise.svg')] mix-blend-overlay"></div>
      </div>

      <div className="relative z-10 w-full max-w-4xl mx-auto flex flex-col items-center">
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-center mb-16"
        >
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-[10px] font-black uppercase tracking-[0.2em] mb-6">
            Identity Verification
          </div>
          <h1 className="text-4xl md:text-5xl font-black text-white tracking-tight font-outfit mb-4">
            Select Your <span className="text-emerald-500 italic">Interface.</span>
          </h1>
          <p className="text-charcoal-400 font-medium max-w-md mx-auto text-sm md:text-base leading-relaxed tracking-tight">
            NaijaDrops adapts to your role. Choose how you will interact with the Kano logistics network.
          </p>
        </motion.div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 w-full max-w-3xl">
          {/* Vendor Card */}
          <motion.button
            whileHover={{ y: -8, scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            onClick={() => handleRoleSelect("vendor")}
            disabled={!!loading}
            className="group relative bg-white/[0.03] backdrop-blur-xl border border-white/10 p-8 rounded-[2.5rem] text-left hover:border-emerald-500/50 hover:bg-emerald-500/[0.02] transition-all duration-500 overflow-hidden"
          >
            <div className="absolute -top-12 -right-12 w-32 h-32 bg-emerald-500/5 blur-[60px] group-hover:bg-emerald-500/10 transition-colors"></div>
            
            <div className="w-14 h-14 bg-emerald-500/10 rounded-2xl flex items-center justify-center mb-6 border border-emerald-500/20 group-hover:bg-emerald-500 group-hover:text-charcoal-950 transition-all duration-500">
              {loading === "vendor" ? <Loader2 className="animate-spin" /> : <User size={28} />}
            </div>
            
            <h3 className="text-2xl font-black text-white mb-2 font-outfit">I am a <span className="text-emerald-500">Sender</span></h3>
            <p className="text-charcoal-500 text-sm font-medium leading-relaxed mb-8 group-hover:text-charcoal-400 transition-colors">
              I have packages that need to move across the city. Access business tools, order history, and live tracking.
            </p>
            
            <div className="flex items-center gap-2 text-emerald-500 font-black text-xs uppercase tracking-widest group-hover:gap-4 transition-all">
              Enter Dashboard <ArrowRight size={16} />
            </div>
          </motion.button>

          {/* Rider Card */}
          <motion.button
            whileHover={{ y: -8, scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            onClick={() => handleRoleSelect("rider")}
            disabled={!!loading}
            className="group relative bg-white/[0.03] backdrop-blur-xl border border-white/10 p-8 rounded-[2.5rem] text-left hover:border-emerald-500/50 hover:bg-emerald-500/[0.02] transition-all duration-500 overflow-hidden"
          >
            <div className="absolute -top-12 -right-12 w-32 h-32 bg-emerald-500/5 blur-[60px] group-hover:bg-emerald-500/10 transition-colors"></div>
            
            <div className="w-14 h-14 bg-emerald-500/10 rounded-2xl flex items-center justify-center mb-6 border border-emerald-500/20 group-hover:bg-emerald-500 group-hover:text-charcoal-950 transition-all duration-500">
              {loading === "rider" ? <Loader2 className="animate-spin" /> : <Truck size={28} />}
            </div>
            
            <h3 className="text-2xl font-black text-white mb-2 font-outfit">I am a <span className="text-emerald-500 font-outfit italic">Carrier</span></h3>
            <p className="text-charcoal-500 text-sm font-medium leading-relaxed mb-8 group-hover:text-charcoal-400 transition-colors">
              I am a rider moving loads. Access job feeds, delivery tools, navigation, and earnings management.
            </p>
            
            <div className="flex items-center gap-2 text-emerald-500 font-black text-xs uppercase tracking-widest group-hover:gap-4 transition-all">
              Initialize Console <ArrowRight size={16} />
            </div>
          </motion.button>
        </div>

        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 1 }}
          className="mt-16 bg-white/[0.02] border border-white/5 rounded-2xl px-6 py-4 flex items-center gap-4 max-w-lg"
        >
          <Info className="text-emerald-500 shrink-0" size={20} />
          <p className="text-charcoal-600 text-[10px] font-bold uppercase tracking-widest leading-relaxed">
            Note: This selection will lock your account interface to the specific toolset required for your operations.
          </p>
        </motion.div>
      </div>
    </main>
  );
}
