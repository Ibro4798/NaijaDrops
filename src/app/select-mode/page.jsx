"use client";

import { motion } from "framer-motion";
import { Package, Bike, ArrowRight, LogOut } from "lucide-react";
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

  const handleLogout = async () => {
    await supabase.auth.signOut();
    router.replace("/auth/login");
  };

  async function handleSelection(mode) {
    if (!user) {
      router.push("/auth/login");
      return;
    }

    setLoading(mode);
    try {
      // THE RULE: Database is Source of Truth
      const { error: updateErr } = await supabase
        .from("users")
        .update({ active_mode: mode })
        .eq("id", user.id);

      if (updateErr) throw updateErr;

      // SET HINT: Tell middleware to trust this mode for 30 seconds while DB propagates
      document.cookie = `nd_mode_hint=${mode}; path=/; max-age=30; SameSite=Lax`;

      if (mode === "customer") {
        // Ensure Vendor Profile exists
        const { data: vendor } = await supabase.from("vendors").select("id").eq("user_id", user.id).single();
        if (!vendor) {
          await supabase.from("vendors").insert({
            user_id: user.id,
            business_name: user.email?.split('@')[0] || "New Vendor"
          });
        }
        router.push("/dashboard"); 
      } else {
        const { data: rider } = await supabase.from("riders").select("id").eq("user_id", user.id).single();
        if (!rider) {
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
    <main className="min-h-screen bg-charcoal-950 flex flex-col items-center justify-center p-6 font-outfit relative">
      <button 
        onClick={handleLogout} 
        className="absolute top-6 right-6 p-3 bg-white/[0.02] border border-white/10 rounded-2xl text-charcoal-500 hover:text-red-400 hover:border-red-500/30 hover:bg-red-500/5 transition-all"
      >
        <LogOut size={20} />
      </button>

      <div className="text-center mb-10">
        <h1 className="text-3xl font-black text-white tracking-tight mb-2">Select Your Portal</h1>
        <p className="text-charcoal-400 text-sm">Switch anytime from your profile settings.</p>
        {error && <p className="mt-4 text-red-400 font-bold uppercase tracking-widest text-xs">âš ï¸ {error}</p>}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 w-full max-w-3xl">
        <motion.button whileHover={{ scale: 1.02 }} onClick={() => handleSelection("customer")}
          className={`text-left p-8 rounded-[2rem] border ${loading === "customer" ? "border-emerald-500 bg-emerald-500/5" : "border-white/10 bg-white/[0.02] hover:bg-white/[0.04]"}`}>
          <Package className="text-emerald-500 mb-6" size={32} />
          <h2 className="text-2xl font-black text-white mb-2">Send Packages</h2>
          <div className="flex items-center text-emerald-500 font-bold text-sm">Continue to Dashboard <ArrowRight size={16} className="ml-2" /></div>
        </motion.button>

        <motion.button whileHover={{ scale: 1.02 }} onClick={() => handleSelection("rider")}
          className={`text-left p-8 rounded-[2rem] border ${loading === "rider" ? "border-amber-500 bg-amber-500/5" : "border-white/10 bg-white/[0.02] hover:bg-white/[0.04]"}`}>
          <Bike className="text-amber-500 mb-6" size={32} />
          <h2 className="text-2xl font-black text-white mb-2">Deliver Packages</h2>
          <div className="flex items-center text-amber-500 font-bold text-sm">Start Earning <ArrowRight size={16} className="ml-2" /></div>
        </motion.button>
      </div>
    </main>
  );
}
