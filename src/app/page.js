"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/utils/supabase/client";
import { getUserRole } from "@/utils/auth";
import { MapPin, Package, ShoppingCart, ChevronRight, LayoutDashboard, Truck, ShieldCheck, Zap, Globe, Star, ArrowRight } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

export default function Home() {
  const [profile, setProfile] = useState(null);
  const [isCheckingAuth, setIsCheckingAuth] = useState(true);
  const router = useRouter();
  const supabase = createClient();

  useEffect(() => {
    async function loadData() {
      try {
        const { user, role, profile: prof } = await getUserRole(supabase);

        if (user && role) {
          setProfile(prof);

          if (role === 'admin') { router.push('/admin'); return; }
          
          if (role === 'driver') {
            const { data: driverOrders } = await supabase.from('orders')
              .select('id')
              .eq('driver_id', user.id)
              .in('status', ['accepted', 'arriving_pickup', 'picked_up', 'arriving'])
              .limit(1);

            if (driverOrders?.length > 0) { router.push('/driver'); return; }
            router.push('/driver');
            return;
          }

          const { data: orders } = await supabase.from('orders')
            .select('id, status')
            .eq('user_id', user.id)
            .in('status', ['looking_for_driver', 'awaiting_payment', 'accepted', 'picked_up', 'arriving'])
            .order('created_at', { ascending: false })
            .limit(1);
          
          if (orders?.length > 0) {
            const active = orders[0];
            if (active.status === 'looking_for_driver') router.push(`/matching?orderId=${active.id}`);
            else if (active.status === 'awaiting_payment') router.push(`/payment?orderId=${active.id}`);
            else router.push(`/tracking/${active.id}`);
            return;
          }
          router.push('/send');
        }
      } finally {
        setIsCheckingAuth(false);
      }
    }
    loadData();
  }, [supabase, router]);

  // Design Tokens
  const cardVariants = {
    initial: { opacity: 0, scale: 0.98, y: 40 },
    animate: { opacity: 1, scale: 1, y: 0, transition: { duration: 0.8, ease: [0.16, 1, 0.3, 1] } },
    hover: { y: -10, transition: { duration: 0.4, ease: "easeOut" } }
  };

  if (isCheckingAuth) {
    return (
      <div className="min-h-screen bg-charcoal-950 flex items-center justify-center">
        <div className="w-12 h-12 border-4 border-emerald-500/20 border-t-emerald-500 rounded-full animate-spin"></div>
      </div>
    );
  }

  return (
    <main className="min-h-[100dvh] relative overflow-x-hidden bg-charcoal-950">
      
      {/* Background System */}
      <div className="fixed inset-0 z-0">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_-20%,#10b98120,transparent_50%)]"></div>
        <div className="absolute inset-0 opacity-[0.03] bg-[url('https://grainy-gradients.vercel.app/noise.svg')]"></div>
      </div>

      <div className="relative z-10 max-w-7xl mx-auto px-6 pt-[calc(8rem+var(--safe-top))] pb-[calc(10rem+var(--safe-bottom))]">
        
        {/* Hero Section: Industry Standard Architecture */}
        <div className="max-w-4xl mb-32">
          <motion.div
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.8 }}
          >
            <div className="inline-flex items-center gap-3 px-4 py-2 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-[10px] font-black uppercase tracking-[0.3em] mb-8">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
              </span>
              Kano Operational Area
            </div>
            
            <h1 className="text-6xl sm:text-8xl lg:text-[9rem] font-black text-white tracking-tighter leading-[0.9] mb-8 font-outfit">
              The Logistics <br/>
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-emerald-400 via-emerald-500 to-emerald-200">Standard.</span>
            </h1>

            <p className="text-charcoal-400 font-medium text-xl sm:text-3xl max-w-2xl leading-relaxed tracking-tight mb-12">
              Next-generation delivery infrastructure for Kano. <br className="hidden md:block"/>
              High-precision mapping. Instant dispatch. Verified trust.
            </p>

            <div className="flex flex-wrap gap-5">
              <Link href="/send" className="px-10 py-5 bg-emerald-500 hover:bg-emerald-400 text-white rounded-[2rem] font-black text-xl transition-all shadow-glow hover:-translate-y-1 active:scale-95 flex items-center gap-3">
                Ship Package <ArrowRight size={24} />
              </Link>
              <Link href="/welcome" className="px-10 py-5 bg-white/5 hover:bg-white/10 text-white border border-white/10 rounded-[2rem] font-black text-xl transition-all backdrop-blur-md">
                Carrier Portal
              </Link>
            </div>
          </motion.div>
        </div>

        {/* Features / Nexus Hub */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-10">
          
          {/* Customer Terminal */}
          <motion.div
            variants={cardVariants}
            initial="initial"
            whileInView="animate"
            whileHover="hover"
            viewport={{ once: true }}
            className="group"
          >
            <Link href={profile ? "/send" : "/login?role=user"} className="block h-full">
              <div className="h-full glass rounded-[4rem] p-12 flex flex-col relative overflow-hidden transition-all border-white/20 shadow-premium group-hover:bg-white group-hover:border-transparent">
                <div className="absolute top-0 right-0 w-80 h-80 bg-emerald-500/10 rounded-full blur-[100px] group-hover:bg-emerald-500/30 transition-all translate-x-1/4 -translate-y-1/4"></div>
                
                <div className="w-16 h-16 bg-charcoal-950 text-emerald-400 rounded-2xl flex items-center justify-center mb-8 shadow-2xl group-hover:scale-110 transition-transform group-hover:bg-emerald-500 group-hover:text-white">
                  <Package size={32} />
                </div>
                
                <h2 className="text-5xl font-black text-charcoal-900 mb-6 tracking-tighter">I'm Shipping</h2>
                <p className="text-charcoal-600 font-bold text-2xl mb-12 flex-1 leading-snug tracking-tight">
                  Premium city-wide delivery. Pin-point accuracy across all Kano districts with verified carriers.
                </p>

                <div className="flex items-center justify-between w-full p-8 bg-charcoal-950 text-white rounded-[2.5rem] font-black text-2xl transition-all group-hover:bg-emerald-600">
                  {profile ? "Enter Terminal" : "Get Started"} <ChevronRight size={32} />
                </div>
              </div>
            </Link>
          </motion.div>

          {/* Driver Terminal */}
          <motion.div
            variants={cardVariants}
            initial="initial"
            whileInView="animate"
            whileHover="hover"
            viewport={{ once: true }}
            className="group"
          >
            <Link href={profile ? "/driver" : "/login?role=driver"} className="block h-full">
              <div className="h-full glass-dark rounded-[4rem] p-12 flex flex-col relative overflow-hidden transition-all border-white/10 shadow-2xl backdrop-blur-3xl group-hover:bg-emerald-950/40">
                <div className="absolute bottom-0 left-0 w-80 h-80 bg-emerald-500/5 rounded-full blur-[100px] transition-all -translate-x-1/4 translate-y-1/4"></div>
                
                <div className="w-16 h-16 bg-white/10 text-white rounded-2xl border border-white/20 flex items-center justify-center mb-8 group-hover:rotate-12 transition-transform backdrop-blur-xl">
                  <Truck size={32} />
                </div>
                
                <h2 className="text-5xl font-black text-white mb-6 tracking-tighter">I'm Driving</h2>
                <p className="text-charcoal-400 font-bold text-2xl mb-12 flex-1 leading-snug tracking-tight">
                  Maximize your earnings with the city's highest-accuracy dispatch engine and instant payouts.
                </p>

                <div className="flex items-center justify-between w-full p-8 bg-emerald-500 text-white rounded-[2.5rem] font-black text-2xl transition-all group-hover:bg-emerald-400 group-hover:shadow-glow">
                   {profile?.role === 'driver' ? "Dashboard" : "Apply as Carrier"} <Zap size={32} />
                </div>
              </div>
            </Link>
          </motion.div>
        </div>

        {/* Global Performance Layer */}
        <div className="mt-40 grid grid-cols-2 md:grid-cols-4 gap-8">
          {[
            { label: "Uptime", val: "99.9%", sub: "Operational Status" },
            { label: "Accuracy", val: "< 5m", sub: "Dispatch Radius" },
            { label: "Volume", val: "10k+", sub: "Monthly Drops" },
            { label: "Trust", val: "4.9/5", sub: "User Satisfaction" }
          ].map((stat, i) => (
            <motion.div 
              key={i}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.1 }}
              className="p-6 rounded-[2rem] bg-white/5 border border-white/10 backdrop-blur-sm hover:bg-white/10 transition-colors"
            >
              <div className="text-3xl font-black text-white mb-0.5">{stat.val}</div>
              <div className="text-[9px] font-black text-emerald-500 uppercase tracking-[0.2em] mb-3">{stat.label}</div>
              <div className="text-charcoal-500 text-[10px] font-bold">{stat.sub}</div>
            </motion.div>
          ))}
        </div>

        {/* Strategic Partnerships / Trust */}
        <div className="mt-40 pt-20 border-t border-white/5 text-center">
           <div className="inline-flex items-center gap-4 px-8 py-4 rounded-3xl bg-emerald-500/5 border border-emerald-500/10 backdrop-blur-md">
              <ShieldCheck className="text-emerald-500" size={24} />
              <p className="text-charcoal-300 font-black text-sm tracking-wide uppercase">Official Logistics Partner for Kano Metropolis</p>
           </div>
        </div>

      </div>
    </main>
  );
}
