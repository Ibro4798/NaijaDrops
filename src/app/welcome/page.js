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
      <div className="min-h-[100dvh] bg-gray-50 dark:bg-charcoal-950 transition-colors flex items-center justify-center">
        <div className="w-10 h-10 border-4 border-emerald-500/20 border-t-emerald-500 rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-[100dvh] bg-gray-50 dark:bg-charcoal-950 transition-colors flex flex-col items-center justify-center px-6 py-12 relative overflow-hidden">
      {/* Decorative glows */}
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[600px] h-[600px] bg-emerald-500/5 dark:bg-emerald-500/10 rounded-full blur-[150px] pointer-events-none" />
      <div className="absolute bottom-0 right-0 w-[400px] h-[400px] bg-blue-500/5 dark:bg-blue-500/10 rounded-full blur-[120px] pointer-events-none" />

      {/* Logo + Header */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="text-center mb-14 relative z-10"
      >
        <div className="w-20 h-20 bg-emerald-500 rounded-[1.75rem] flex items-center justify-center shadow-glow mx-auto mb-6">
          <Package className="h-10 w-10 text-white" />
        </div>
        <h1 className="text-6xl font-black text-gray-900 dark:text-white tracking-tighter leading-none mb-4 font-outfit italic">
          NaijaDrops
        </h1>
        <p className="text-emerald-600 dark:text-emerald-400 font-black text-[10px] uppercase tracking-[0.5em] opacity-80 mb-2">
          Kano&apos;s Premium Logistics Grid
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
            className="block w-full bg-white dark:bg-charcoal-800 rounded-[2.5rem] p-10 shadow-premium dark:shadow-premium-dark group hover:scale-[1.02] active:scale-[0.98] transition-all border border-gray-100 dark:border-white/5"
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-6">
                <div className="w-16 h-16 bg-emerald-50 dark:bg-emerald-500/10 rounded-[1.4rem] flex items-center justify-center group-hover:bg-emerald-100 dark:group-hover:bg-emerald-500/20 transition-colors">
                  <Package size={32} className="text-emerald-600 dark:text-emerald-500" />
                </div>
                <div>
                  <h2 className="text-2xl font-black text-gray-900 dark:text-white tracking-tight leading-none mb-1.5 italic">
                    Send a Package
                  </h2>
                  <p className="text-[10px] font-black text-gray-400 dark:text-emerald-500/50 uppercase tracking-[0.2em]">
                    Logistics Interface
                  </p>
                </div>
              </div>
              <div className="w-12 h-12 bg-gray-900 dark:bg-white text-white dark:text-charcoal-900 rounded-xl flex items-center justify-center group-hover:bg-emerald-600 dark:group-hover:bg-emerald-500 transition-colors shadow-lg">
                <ArrowRight size={20} />
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
            className="block w-full bg-charcoal-900 dark:bg-charcoal-800 rounded-[2.5rem] p-10 shadow-premium group hover:scale-[1.02] active:scale-[0.98] transition-all border border-white/10"
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-6">
                <div className="w-16 h-16 bg-emerald-500/10 rounded-[1.4rem] flex items-center justify-center group-hover:bg-emerald-500/20 transition-colors">
                  <Truck size={32} className="text-emerald-400" />
                </div>
                <div>
                  <h2 className="text-2xl font-black text-white tracking-tight leading-none mb-1.5 italic">
                    Drive & Earn
                  </h2>
                  <p className="text-[10px] font-black text-charcoal-500 dark:text-emerald-400/50 uppercase tracking-[0.2em]">
                    Carrier Interface
                  </p>
                </div>
              </div>
              <div className="w-12 h-12 bg-emerald-500 text-charcoal-900 rounded-xl flex items-center justify-center group-hover:bg-emerald-400 transition-colors shadow-glow">
                <ArrowRight size={20} />
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
