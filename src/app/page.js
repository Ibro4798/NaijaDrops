"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/utils/supabase/client";
import { getUserRole } from "@/utils/auth";
import { MapPin, Package, ShoppingCart, ChevronRight, LayoutDashboard, Truck, ShieldCheck, Zap } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

export default function Home() {
  const [profile, setProfile] = useState(null);
  const [activeOrders, setActiveOrders] = useState([]);
  const [isCheckingAuth, setIsCheckingAuth] = useState(true);
  const router = useRouter();
  const supabase = createClient();

  useEffect(() => {
    async function loadData() {
      const { user, role, profile: prof } = await getUserRole(supabase);

      if (user && role) {
        setProfile(prof);

        // ── Admins: go straight to command hub, skip order checks ──
        if (role === 'admin') {
          router.push('/admin');
          return;
        }

        // ── Drivers: check if on an active trip (though normally just to /driver) ──
        if (role === 'driver') {
          const { data: driverOrders } = await supabase.from('orders')
            .select('*')
            .eq('driver_id', user.id)
            .in('status', ['accepted', 'arriving_pickup', 'picked_up', 'arriving'])
            .order('created_at', { ascending: false });

          if (driverOrders && driverOrders.length > 0) {
            router.push('/driver');
            return;
          }
          router.push('/driver');
          return;
        }

        // ── Customers: check if on an active order ──
        const { data: orders } = await supabase.from('orders')
          .select('*')
          .eq('user_id', user.id)
          .in('status', ['looking_for_driver', 'awaiting_payment', 'accepted', 'picked_up', 'arriving'])
          .order('created_at', { ascending: false });
        
        if (orders && orders.length > 0) {
          const active = orders[0];
          if (active.status === 'looking_for_driver') {
            router.push(`/matching?orderId=${active.id}`);
            return;
          } else if (active.status === 'awaiting_payment') {
            router.push(`/payment?orderId=${active.id}`);
            return;
          } else {
            router.push(`/tracking/${active.id}`);
            return;
          }
        }

        // No active order — send to send page
        router.push('/send');
      } else {
        // Not logged in — send to portal chooser
        router.push('/welcome');
      }
    }
    loadData();
  }, [supabase, router]);

  // Design Tokens
  const cardVariants = {
    initial: { opacity: 0, scale: 0.95, y: 30 },
    animate: { opacity: 1, scale: 1, y: 0, transition: { duration: 0.6, ease: "easeOut" } },
    hover: { scale: 1.02, transition: { duration: 0.3, ease: "easeInOut" } }
  };

  return (
    <main className="min-h-[100dvh] relative overflow-x-hidden aura-gradient">
      
      {/* Mesh Background Overlay */}
      <div className="absolute inset-0 z-0 opacity-40 bg-[url('https://grainy-gradients.vercel.app/noise.svg')] blend-overlay"></div>

      <div className="relative z-10 max-w-7xl mx-auto px-6 pt-[calc(10rem+var(--safe-top))] pb-[calc(8rem+var(--safe-bottom))]">
        
        {/* Hero Branding */}
        <div className="text-center mb-24">
          <AnimatePresence mode="wait">
            {!profile ? (
              <motion.div 
                key="anon"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                className="space-y-8"
              >
                <div className="inline-flex items-center gap-3 px-5 py-2 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs font-black uppercase tracking-[0.25em]">
                  <div className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse"></div>
                  Kano State Preferred
                </div>
                <h1 className="text-7xl sm:text-8xl lg:text-9xl font-black text-white tracking-tighter leading-[0.85] italic">
                  Move <span className="text-transparent bg-clip-text bg-gradient-to-br from-emerald-400 to-emerald-600 not-italic">City.</span>
                </h1>
                <p className="text-charcoal-400 font-medium text-xl sm:text-2xl max-w-2xl mx-auto leading-relaxed tracking-tight">
                  A high-accuracy logistics layer for Kano. <br className="hidden sm:block"/>
                  Drop a pin, we'll do the rest.
                </p>
              </motion.div>
            ) : (
              <motion.div 
                key="user"
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                className="space-y-6"
              >
                <div className="w-24 h-24 bg-gradient-to-br from-emerald-400/20 to-emerald-700/20 rounded-[2.5rem] mx-auto flex items-center justify-center border-2 border-emerald-500/30 shadow-glow mb-8">
                  <Package size={48} className="text-emerald-400" />
                </div>
                <h1 className="text-5xl sm:text-7xl font-black text-white tracking-tighter leading-tight">
                  Hello, <br/>
                  <span className="text-transparent bg-clip-text bg-gradient-to-r from-emerald-400 to-emerald-600">{profile.full_name?.split(' ')[0] || 'User'}</span>
                </h1>
                <p className="text-charcoal-500 font-bold text-xl uppercase tracking-widest">Select your terminal below</p>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Roles Grid (The Nexus) */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 max-w-5xl mx-auto">
          
          {/* Customer Portal Card */}
          <motion.div
            variants={cardVariants}
            initial="initial"
            animate="animate"
            whileHover="hover"
            className="group relative"
          >
            <Link href={profile ? "/send" : "/login?role=user"} className="block h-full">
              <div className="h-full glass rounded-[4rem] p-12 flex flex-col relative overflow-hidden transition-all border-white/20 shadow-premium group-hover:bg-white">
                {/* Visual Accent */}
                <div className="absolute top-0 right-0 w-64 h-64 bg-emerald-500/10 rounded-full blur-[80px] transition-all group-hover:bg-emerald-500/20 translate-x-1/2 -translate-y-1/2"></div>
                
                <div className="w-20 h-20 bg-charcoal-900 text-emerald-400 rounded-3xl flex items-center justify-center mb-10 shadow-2xl group-hover:scale-110 transition-transform group-hover:bg-emerald-600 group-hover:text-white">
                  <Package size={40} />
                </div>
                
                <h2 className="text-5xl font-black text-charcoal-900 mb-6 tracking-tighter">Customer</h2>
                <p className="text-charcoal-600 font-bold text-xl mb-12 flex-1 leading-snug tracking-tight">
                  Instant pickup, zero phone calls. Your reliable city-wide delivery partner.
                </p>

                <div className="flex items-center justify-between w-full py-6 px-10 bg-charcoal-900 text-white rounded-[2rem] font-black text-2xl transition-all group-hover:bg-emerald-600 group-hover:shadow-glow/40">
                  {profile ? "Ship Now" : "Register"} <ChevronRight size={28} className="group-hover:translate-x-2 transition-transform" />
                </div>
              </div>
            </Link>
          </motion.div>

          {/* Driver Portal Card */}
          <motion.div
            variants={cardVariants}
            initial="initial"
            animate="animate"
            whileHover="hover"
            className="group relative"
          >
            <Link href={profile ? "/driver" : "/login?role=driver"} className="block h-full">
              <div className="h-full glass-dark rounded-[3.5rem] p-10 flex flex-col relative overflow-hidden transition-all border-white/5 shadow-2xl">
                {/* Visual Accent */}
                <div className="absolute -bottom-10 -left-10 w-40 h-40 bg-emerald-500/10 rounded-full blur-3xl transition-all group-hover:bg-emerald-500/20"></div>

                <div className="w-16 h-16 bg-white/10 text-white rounded-2xl border border-white/20 flex items-center justify-center mb-8 backdrop-blur-md group-hover:scale-110 transition-transform">
                  <Truck size={32} />
                </div>
                
                <h2 className="text-4xl font-black text-white mb-4 tracking-tight">Driver</h2>
                <p className="text-charcoal-400 font-medium text-lg mb-10 flex-1 leading-relaxed">
                  Build your career moving the city. High-accuracy navigation and instant payouts for Kano fleet of experts.
                </p>

                <div className="flex items-center justify-between w-full py-5 px-8 bg-emerald-500 text-white rounded-2xl font-black text-xl transition-all group-hover:bg-emerald-400 group-hover:shadow-glow">
                  {profile?.role === 'driver' ? "Dashboard" : "Apply as Driver"} <LayoutDashboard size={24} className="group-hover:rotate-12 transition-transform" />
                </div>
              </div>
            </Link>
          </motion.div>
        </div>

        {/* Global Stats / Trust Indicators */}
        <motion.div 
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true }}
          className="mt-24 pt-16 border-t border-white/5 flex flex-wrap justify-center gap-10 md:gap-20"
        >
          <div className="text-center">
            <div className="text-4xl font-black text-white mb-1">99.8%</div>
            <div className="text-xs font-black text-charcoal-500 uppercase tracking-widest">Pin Accuracy</div>
          </div>
          <div className="text-center">
            <div className="text-4xl font-black text-emerald-500 mb-1">15m</div>
            <div className="text-xs font-black text-charcoal-500 uppercase tracking-widest">Avg. Pickup</div>
          </div>
          <div className="text-center">
            <div className="text-4xl font-black text-white mb-1">5k+</div>
            <div className="text-xs font-black text-charcoal-500 uppercase tracking-widest">Verified Drivers</div>
          </div>
        </motion.div>

        {/* Platform Verification Section */}
        <div className="mt-24 text-center">
          <div className="inline-flex items-center gap-2 px-6 py-3 rounded-2xl bg-white/5 backdrop-blur-sm border border-white/10">
             <ShieldCheck size={20} className="text-emerald-500" />
             <span className="text-charcoal-300 font-bold text-sm tracking-wide">Enterprise-grade logistics infrastructure for Kano state.</span>
          </div>
        </div>

      </div>
    </main>
  );
}
