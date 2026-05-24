"use client";

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { User, Truck, ArrowRight, Loader2, Search, MapPin, ShieldCheck, Globe } from "lucide-react";
import { createClient } from "@/utils/supabase/client";
import { useRouter } from "next/navigation";

export default function LandingPage() {
  const [loading, setLoading] = useState(false);
  const [checking, setChecking] = useState(true);
  const supabase = createClient();
  const router = useRouter();

  // If already logged in, skip to dashboard
  useEffect(() => {
    async function checkExistingAuth() {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const { data: profile } = await supabase
          .from("users")
          .select("role")
          .eq("id", user.id)
          .single();

        if (profile?.role === "vendor") router.push("/dashboard");
        else if (profile?.role === "rider") router.push("/rider");
        else if (profile?.role === "admin") router.push("/ops-terminal/dashboard");
      }
      setChecking(false);
    }
    checkExistingAuth();
  }, [router, supabase]);

  function handleRoleChoice(role) {
    // Save preference to sessionStorage so login page can pick it up
    sessionStorage.setItem("nd_intended_role", role);
    router.push("/auth/login");
  }

  if (checking) {
    return (
      <div className="min-h-screen bg-charcoal-950 flex items-center justify-center">
        <Loader2 className="text-emerald-500 animate-spin" size={32} />
      </div>
    );
  }

  return (
    <main className="min-h-screen bg-charcoal-950 text-white selection:bg-emerald-500/30 overflow-x-hidden">
      {/* Ambient background */}
      <div className="fixed inset-0 z-0 pointer-events-none">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_-10%,#10b98112,transparent_70%)]"></div>
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[1000px] h-[600px] bg-emerald-500/[0.03] blur-[120px] rounded-full"></div>
      </div>

      {/* Modern Mini-Nav */}
      <nav className="relative z-20 flex justify-between items-center p-6 lg:px-12 max-w-7xl mx-auto">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 bg-emerald-500 rounded-xl flex items-center justify-center shadow-[0_0_20px_rgba(16,185,129,0.3)]">
            <span className="text-charcoal-950 font-black text-base font-outfit">N</span>
          </div>
          <span className="text-white font-black text-lg tracking-tight font-outfit">NaijaDrops</span>
        </div>
        
        <div className="hidden md:flex items-center gap-8 text-[11px] font-black uppercase tracking-widest text-charcoal-400">
          <a href="/pricing" className="hover:text-emerald-400 transition-colors">Pricing</a>
          <a href="/track" className="hover:text-emerald-400 transition-colors">Track Item</a>
          <a href="/support" className="hover:text-emerald-400 transition-colors">Support</a>
          <button onClick={() => router.push('/auth/login')} className="px-5 py-2.5 bg-white/5 border border-white/10 rounded-full hover:bg-white/10 transition-all text-white">
            Log In
          </button>
        </div>
      </nav>

      {/* Hero Section */}
      <section className="relative z-10 pt-16 pb-24 px-6 max-w-7xl mx-auto text-center">
        <motion.div
           initial={{ opacity: 0, y: 20 }}
           animate={{ opacity: 1, y: 0 }}
           transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
        >
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-[10px] font-black uppercase tracking-[0.2em] mb-8">
            <Globe size={12} className="animate-pulse" /> Precision Logistics Â· Kano, NG
          </div>
          <h1 className="text-5xl md:text-7xl font-black text-white tracking-tighter leading-[1] mb-6 font-outfit">
            Logistics that moves <br/> 
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-emerald-400 to-emerald-600 italic">at your speed.</span>
          </h1>
          <p className="text-charcoal-400 font-medium max-w-2xl mx-auto text-lg md:text-xl leading-relaxed mb-16 px-4">
            Reliable, real-time dispatch for business owners and professional carriers across the city.
          </p>
        </motion.div>

        {/* Universal Primary CTA */}
        <div className="flex flex-col items-center gap-6">
          <motion.button
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.98 }}
            onClick={() => router.push("/auth/login")}
            className="group relative bg-emerald-500 hover:bg-emerald-400 text-charcoal-950 px-12 py-6 rounded-3xl font-black text-xl uppercase tracking-wider shadow-[0_0_40px_rgba(16,185,129,0.3)] transition-all flex items-center gap-3"
          >
            Start Dispatching Packages
            <ArrowRight size={24} className="group-hover:translate-x-1.5 transition-transform" />
          </motion.button>
          
          <p className="text-charcoal-500 text-sm font-bold uppercase tracking-[0.2em]">
            Launching in Kano â€” Join the pilot waitlist</p>
        </div>

        {/* Quick Stats / Trust */}
        <div className="flex flex-wrap justify-center gap-12 border-t border-white/5 pt-16 mt-8">
           <div className="flex items-center gap-3">
              <MapPin className="text-emerald-500" size={20} />
              <div className="text-left">
                <div className="text-white font-black text-xl leading-none">Precise</div>
                <div className="text-charcoal-600 text-[10px] font-bold uppercase tracking-widest">Pin Resolution</div>
              </div>
           </div>
           <div className="flex items-center gap-3">
              <ShieldCheck className="text-emerald-500" size={20} />
              <div className="text-left">
                <div className="text-white font-black text-xl leading-none">Verified</div>
                <div className="text-charcoal-600 text-[10px] font-bold uppercase tracking-widest">Professional Fleet</div>
              </div>
           </div>
           <div className="flex items-center gap-3">
              <Search className="text-emerald-500" size={20} />
              <div className="text-left">
                <div className="text-white font-black text-xl leading-none">Live</div>
                <div className="text-charcoal-600 text-[10px] font-bold uppercase tracking-widest">Map Tracking</div>
              </div>
           </div>
        </div>
      </section>

      {/* Simple Footer */}
      <footer className="relative z-10 border-t border-white/5 py-12 px-6">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row justify-between items-center gap-6">
          <div className="text-charcoal-600 text-sm">Â© 2026 NaijaDrops Technologies. All rights reserved.</div>
          <div className="flex gap-6 text-xs font-bold uppercase tracking-widest text-charcoal-500">
             <a href="/terms" className="hover:text-white">Terms</a>
             <a href="/privacy" className="hover:text-white">Privacy</a>
             <a href="/contact" className="hover:text-white">Contact</a>
          </div>
        </div>
      </footer>
    </main>
  );
}
