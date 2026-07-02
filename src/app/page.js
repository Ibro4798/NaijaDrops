"use client";

import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import {
  MapPin, Zap, Shield, ArrowRight, Clock, Star,
  Package, ChevronRight, Globe, CheckCircle2
} from "lucide-react";
import { createClient } from "@/utils/supabase/client";
import { useRouter } from "next/navigation";

const STEPS = [
  { icon: MapPin,     label: "Pin your locations",  sub: "Pickup & drop-off in seconds" },
  { icon: Package,    label: "Describe your parcel", sub: "Size, vehicle & recipient" },
  { icon: Zap,        label: "Get matched instantly",sub: "A verified rider picks up & goes" },
];

const TRUST = [
  { icon: Shield,     stat: "Verified",   label: "Professional Fleet" },
  { icon: Clock,      stat: "~20 min",    label: "Avg Pickup Time" },
  { icon: Star,       stat: "4.9 ★",      label: "Rider Rating" },
  { icon: Globe,      stat: "Kano NG",    label: "Pilot City" },
];

export default function LandingPage() {
  const [checking, setChecking] = useState(true);
  const supabase = createClient();
  const router = useRouter();

  // Logged-in users skip straight to their dashboard
  useEffect(() => {
    async function checkAuth() {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const { data: profile } = await supabase
          .from("users").select("role").eq("id", user.id).single();
        if (profile?.role === "vendor")  { router.replace("/dashboard"); return; }
        if (profile?.role === "rider")   { router.replace("/rider"); return; }
        if (profile?.role === "admin")   { router.replace("/ops-terminal/dashboard"); return; }
      }
      setChecking(false);
    }
    checkAuth();
  }, [router, supabase]);

  if (checking) {
    return (
      <div className="min-h-screen bg-charcoal-950 flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-emerald-500/30 border-t-emerald-500 rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <main className="min-h-screen bg-charcoal-950 text-white selection:bg-emerald-500/30 overflow-x-hidden">

      {/* ─── Ambient glow ─── */}
      <div className="fixed inset-0 z-0 pointer-events-none overflow-hidden">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_50%_0%,#10b98118,transparent_65%)]" />
        <div className="absolute -top-32 left-1/2 -translate-x-1/2 w-[800px] h-[500px] bg-emerald-500/[0.04] blur-[100px] rounded-full" />
      </div>

      {/* ─── Navbar ─── */}
      <nav className="relative z-20 flex justify-between items-center px-6 pt-6 pb-4 max-w-6xl mx-auto">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 bg-emerald-500 rounded-xl flex items-center justify-center shadow-[0_0_20px_rgba(16,185,129,0.35)]">
            <span className="text-charcoal-950 font-black text-base font-outfit">N</span>
          </div>
          <span className="text-white font-black text-lg tracking-tight font-outfit">NaijaDrops</span>
        </div>

        <div className="flex items-center gap-6">
          <a href="/pricing" className="hidden md:block text-[11px] font-black uppercase tracking-widest text-charcoal-400 hover:text-emerald-400 transition-colors">
            Pricing
          </a>
          <button
            onClick={() => router.push("/auth/login")}
            className="text-[11px] font-black uppercase tracking-widest text-charcoal-400 hover:text-white transition-colors px-4 py-2 rounded-xl border border-white/10 hover:border-white/20"
          >
            Log In
          </button>
        </div>
      </nav>

      {/* ─── HERO ─── */}
      <section className="relative z-10 max-w-6xl mx-auto px-6 pt-10 pb-8 text-center">
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
        >
          {/* Pill */}
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-emerald-500/10 border border-emerald-500/25 text-emerald-400 text-[10px] font-black uppercase tracking-[0.18em] mb-7">
            <Globe size={11} className="animate-pulse" />
            Kano Pilot · Live Now
          </div>

          {/* Headline */}
          <h1 className="text-5xl md:text-7xl font-black text-white tracking-tighter leading-[0.95] mb-5 font-outfit">
            Same-day delivery,<br />
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-emerald-400 to-emerald-600 italic">
              no account needed.
            </span>
          </h1>

          <p className="text-charcoal-400 font-medium max-w-xl mx-auto text-lg leading-relaxed mb-10">
            Enter your pickup and drop-off, get a price, and a verified rider
            picks up your parcel — create an account only when you need to track.
          </p>

          {/* PRIMARY CTA */}
          <motion.button
            whileHover={{ scale: 1.03 }}
            whileTap={{ scale: 0.97 }}
            onClick={() => router.push("/send-package/step-1")}
            className="group relative inline-flex items-center gap-3 bg-emerald-500 hover:bg-emerald-400 text-charcoal-950 px-10 py-5 rounded-2xl font-black text-lg uppercase tracking-wide shadow-[0_0_40px_rgba(16,185,129,0.35)] transition-all"
          >
            <Package size={22} />
            Send a Package Now
            <ArrowRight size={20} className="group-hover:translate-x-1 transition-transform" />
          </motion.button>

          <p className="text-charcoal-600 text-xs font-bold uppercase tracking-widest mt-4">
            No sign-up required to get a quote
          </p>
        </motion.div>
      </section>

      {/* ─── HOW IT WORKS ─── */}
      <section className="relative z-10 max-w-4xl mx-auto px-6 py-12">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {STEPS.map((step, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.15 + i * 0.1, duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
              className="flex items-start gap-4 p-5 bg-white/[0.03] border border-white/[0.07] rounded-2xl hover:bg-white/[0.05] transition-all"
            >
              <div className="w-10 h-10 bg-emerald-500/10 border border-emerald-500/20 rounded-xl flex items-center justify-center shrink-0">
                <step.icon size={18} className="text-emerald-400" />
              </div>
              <div>
                <div className="flex items-center gap-2 mb-0.5">
                  <span className="text-[10px] font-black text-emerald-500/60 uppercase tracking-widest">Step {i + 1}</span>
                </div>
                <div className="text-white font-black text-sm tracking-tight">{step.label}</div>
                <div className="text-charcoal-500 text-xs font-medium mt-0.5">{step.sub}</div>
              </div>
            </motion.div>
          ))}
        </div>
      </section>

      {/* ─── TRUST STATS ─── */}
      <section className="relative z-10 max-w-4xl mx-auto px-6 pb-12">
        <div className="border-t border-white/[0.06] pt-10">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
            {TRUST.map((t, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.4 + i * 0.08 }}
                className="text-center"
              >
                <t.icon className="text-emerald-500 mx-auto mb-2" size={20} />
                <div className="text-white font-black text-xl leading-none">{t.stat}</div>
                <div className="text-charcoal-600 text-[10px] font-bold uppercase tracking-widest mt-1">{t.label}</div>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* ─── VALUE STRIP ─── */}
      <section className="relative z-10 max-w-4xl mx-auto px-6 pb-16">
        <div className="bg-emerald-500/5 border border-emerald-500/15 rounded-3xl p-8 flex flex-col md:flex-row items-center gap-6 text-center md:text-left">
          <div className="flex-1">
            <h2 className="text-white font-black text-2xl tracking-tight mb-2">
              Ready to track your order?
            </h2>
            <p className="text-charcoal-400 text-sm leading-relaxed">
              Create a free account after placing your order to get live tracking, delivery history, and rider chat.
            </p>
          </div>
          <button
            onClick={() => router.push("/auth/login?mode=signup")}
            className="shrink-0 flex items-center gap-2 px-7 py-3.5 bg-white/[0.08] border border-white/15 rounded-2xl text-white font-black text-sm uppercase tracking-wide hover:bg-white/[0.12] transition-all"
          >
            Create Account <ChevronRight size={16} />
          </button>
        </div>
      </section>

      {/* ─── PERKS ─── */}
      <section className="relative z-10 max-w-4xl mx-auto px-6 pb-20">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {[
            { title: "Instant pricing",     sub: "See your fare before you commit — no hidden fees." },
            { title: "Live map tracking",   sub: "Watch your rider in real time from pickup to door." },
            { title: "Verified riders only",sub: "Every rider is background-checked and rated by users." },
          ].map((p, i) => (
            <div key={i} className="flex items-start gap-3 p-5 rounded-2xl bg-white/[0.02] border border-white/[0.05]">
              <CheckCircle2 size={18} className="text-emerald-500 shrink-0 mt-0.5" />
              <div>
                <div className="text-white font-black text-sm mb-1">{p.title}</div>
                <div className="text-charcoal-500 text-xs leading-relaxed">{p.sub}</div>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ─── STICKY BOTTOM CTA (mobile) ─── */}
      <div className="fixed bottom-0 left-0 right-0 z-50 md:hidden px-4 pb-6 pt-3 bg-gradient-to-t from-charcoal-950 via-charcoal-950/90 to-transparent pointer-events-none">
        <motion.button
          initial={{ y: 80 }}
          animate={{ y: 0 }}
          transition={{ delay: 0.6, type: "spring", damping: 20 }}
          onClick={() => router.push("/send-package/step-1")}
          className="w-full pointer-events-auto bg-emerald-500 hover:bg-emerald-400 text-charcoal-950 py-4 rounded-2xl font-black text-base uppercase tracking-wide shadow-[0_0_30px_rgba(16,185,129,0.4)] flex items-center justify-center gap-2"
        >
          <Zap size={18} /> Send a Package Now
        </motion.button>
      </div>

      {/* ─── Footer ─── */}
      <footer className="relative z-10 border-t border-white/[0.06] py-10 px-6">
        <div className="max-w-6xl mx-auto flex flex-col md:flex-row justify-between items-center gap-4">
          <div className="text-charcoal-600 text-xs">© 2026 NaijaDrops Technologies. All rights reserved.</div>
          <div className="flex gap-6 text-[11px] font-bold uppercase tracking-widest text-charcoal-500">
            <a href="/terms"   className="hover:text-white transition-colors">Terms</a>
            <a href="/privacy" className="hover:text-white transition-colors">Privacy</a>
            <a href="/pricing" className="hover:text-white transition-colors">Pricing</a>
          </div>
        </div>
      </footer>

    </main>
  );
}
