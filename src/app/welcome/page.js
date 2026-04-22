"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/utils/supabase/client";
import { getUserRole, getRoleRedirectPath } from "@/utils/auth";
import { Package, Truck, ArrowRight, Zap, Shield } from "lucide-react";
import { motion } from "framer-motion";

export default function WelcomePage() {
  const router = useRouter();
  const supabase = createClient();
  const [checking, setChecking] = useState(true);

  // If already logged in, send them to their dashboard
  useEffect(() => {
    async function check() {
      const { user, role } = await getUserRole(supabase);
      if (user && role) {
        router.replace(getRoleRedirectPath(role));
        return;
      }
      setChecking(false);
    }
    check();
  }, []);

  if (checking) {
    return (
      <div className="min-h-[100dvh] aura-gradient flex items-center justify-center">
        <div className="w-10 h-10 border-4 border-emerald-500/30 border-t-emerald-500 rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-[100dvh] aura-gradient flex flex-col items-center justify-center px-6 py-12 relative overflow-hidden">
      {/* Decorative glows */}
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[600px] h-[600px] bg-emerald-500/8 rounded-full blur-[150px] pointer-events-none" />
      <div className="absolute bottom-0 right-0 w-[400px] h-[400px] bg-emerald-500/5 rounded-full blur-[120px] pointer-events-none" />

      {/* Logo + Header */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="text-center mb-14 relative z-10"
      >
        <div className="w-20 h-20 bg-emerald-500 rounded-[1.75rem] flex items-center justify-center shadow-glow mx-auto mb-6">
          <Package className="h-10 w-10 text-white" />
        </div>
        <h1 className="text-5xl font-black text-white tracking-tighter leading-none mb-3 font-outfit">
          NaijaDrops
        </h1>
        <p className="text-charcoal-500 font-bold text-[11px] uppercase tracking-[0.3em]">
          Kano&apos;s Fastest Logistics
        </p>
      </motion.div>

      {/* Portal Cards */}
      <div className="w-full max-w-md space-y-4 relative z-10">
        {/* Customer Portal */}
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.15 }}
        >
          <Link
            href="/login?role=user"
            className="block w-full bg-white rounded-[2rem] p-8 shadow-premium group hover:scale-[1.02] active:scale-[0.98] transition-all"
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-5">
                <div className="w-14 h-14 bg-emerald-50 rounded-2xl flex items-center justify-center group-hover:bg-emerald-100 transition-colors">
                  <Package size={28} className="text-emerald-600" />
                </div>
                <div>
                  <h2 className="text-xl font-black text-charcoal-900 tracking-tight leading-none mb-1">
                    Send a Package
                  </h2>
                  <p className="text-[10px] font-bold text-charcoal-400 uppercase tracking-widest">
                    Customer Portal
                  </p>
                </div>
              </div>
              <div className="w-10 h-10 bg-charcoal-900 text-white rounded-xl flex items-center justify-center group-hover:bg-emerald-600 transition-colors">
                <ArrowRight size={18} />
              </div>
            </div>
          </Link>
        </motion.div>

        {/* Driver Portal */}
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.25 }}
        >
          <Link
            href="/login?role=driver"
            className="block w-full bg-charcoal-900 rounded-[2rem] p-8 shadow-premium group hover:scale-[1.02] active:scale-[0.98] transition-all border border-white/5"
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-5">
                <div className="w-14 h-14 bg-emerald-500/10 rounded-2xl flex items-center justify-center group-hover:bg-emerald-500/20 transition-colors">
                  <Truck size={28} className="text-emerald-400" />
                </div>
                <div>
                  <h2 className="text-xl font-black text-white tracking-tight leading-none mb-1">
                    Drive & Earn
                  </h2>
                  <p className="text-[10px] font-bold text-charcoal-500 uppercase tracking-widest">
                    Driver Portal
                  </p>
                </div>
              </div>
              <div className="w-10 h-10 bg-emerald-500 text-white rounded-xl flex items-center justify-center group-hover:bg-emerald-400 transition-colors">
                <ArrowRight size={18} />
              </div>
            </div>
          </Link>
        </motion.div>
      </div>

      {/* Footer */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.4 }}
        className="mt-14 text-center relative z-10"
      >
        <p className="text-[10px] text-charcoal-600 font-bold uppercase tracking-widest flex items-center justify-center gap-2">
          <Zap size={12} className="text-emerald-500" />
          Secured by NaijaDrops
        </p>
      </motion.div>
    </div>
  );
}
