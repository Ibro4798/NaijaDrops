"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/utils/supabase/client";
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
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        let prof = { full_name: user.user_metadata?.full_name || 'User', role: 'user' };
        
        // WATERFALL ROLE CHECK (Robust & Predictable)
        // 1. Check Admin Table (High Priority)
        const { data: adminProf } = await supabase.from('admins').select('*').eq('id', user.id).maybeSingle();
        if (adminProf || user.email?.endsWith('@naijadrops.tech')) {
            prof = { ...(adminProf || {}), full_name: adminProf?.full_name || user.user_metadata?.full_name || 'Admin', role: 'admin' };
        } else {
            // 2. Check Driver Table
            const { data: driverProf } = await supabase.from('drivers').select('*').eq('id', user.id).maybeSingle();
            if (driverProf) {
                prof = { ...driverProf, role: 'driver' };
            } else {
                // 3. Default to Customer
                const { data: custProf } = await supabase.from('customers').select('*').eq('id', user.id).maybeSingle();
                if (custProf) {
                    prof = { ...custProf, role: 'user' };
                } else {
                    prof = { full_name: user.user_metadata?.full_name || 'User', role: 'user' };
                }
            }
        }
        setProfile(prof);

        // 1. Check if they are a driver on an active trip
        const { data: driverOrders } = await supabase.from('orders')
          .select('*')
          .eq('driver_id', user.id)
          .in('status', ['accepted', 'arriving_pickup', 'picked_up', 'arriving'])
          .order('created_at', { ascending: false });

        if (driverOrders && driverOrders.length > 0) {
          router.push('/driver');
          return;
        }

        // 2. Check if they are a customer with an active trip
        const { data: orders } = await supabase.from('orders')
          .select('*')
          .eq('user_id', user.id)
          .in('status', ['looking_for_driver', 'awaiting_payment', 'accepted', 'picked_up', 'arriving'])
          .order('created_at', { ascending: false });
        
        if (orders && orders.length > 0) {
          const active = orders[0];
          // Determine where to redirect based on status
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

        // 3. If no active trip, auto-redirect based on role
        if (prof.role === 'driver' || prof.role === 'admin') {
          router.push(prof.role === 'admin' ? '/admin' : '/driver');
          return;
        } else {
          router.push('/send');
          return;
        }
      }
      setIsCheckingAuth(false);
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

      <div className="relative z-10 max-w-7xl mx-auto px-6 pt-[calc(8rem+var(--safe-top))] pb-[calc(6rem+var(--safe-bottom))]">
        
        {/* Hero Branding */}
        <div className="text-center mb-16">
          <AnimatePresence mode="wait">
            {!profile ? (
              <motion.div 
                key="anon"
                initial={{ opacity: 0, y: -20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 20 }}
                className="space-y-6"
              >
                <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-sm font-black uppercase tracking-[0.2em]">
                  <Zap size={14} className="fill-current" /> Live in Kano
                </div>
                <h1 className="text-6xl sm:text-7xl lg:text-8xl font-black text-white tracking-tight leading-[0.9]">
                  Logistics <br/>
                  <span className="text-transparent bg-clip-text bg-gradient-to-r from-emerald-400 to-emerald-600">Reimagined.</span>
                </h1>
                <p className="text-charcoal-400 font-medium text-xl max-w-2xl mx-auto leading-relaxed">
                  Drop a Precise Pin anywhere in Kano — no street address needed. 
                  Real-time mapping, verified drivers, instant delivery.
                </p>
              </motion.div>
            ) : (
              <motion.div 
                key="user"
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                className="space-y-4"
              >
                <div className="w-20 h-20 bg-gradient-to-br from-emerald-400 to-emerald-700 rounded-3xl mx-auto flex items-center justify-center shadow-glow mb-6">
                  <Package size={40} className="text-white" />
                </div>
                <h1 className="text-4xl sm:text-6xl font-black text-white tracking-tight leading-tight">
                  Welcome back, <br/>
                  <span className="text-emerald-500">{profile.full_name?.split(' ')[0]}</span>
                </h1>
                <p className="text-charcoal-400 font-medium text-lg">Your logistics command center is ready.</p>
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
              <div className="h-full glass rounded-[3.5rem] p-10 flex flex-col relative overflow-hidden transition-all border-white/20 shadow-premium">
                {/* Visual Accent */}
                <div className="absolute -top-10 -right-10 w-40 h-40 bg-emerald-500/20 rounded-full blur-3xl transition-all group-hover:bg-emerald-500/40"></div>
                
                <div className="w-16 h-16 bg-white text-emerald-700 rounded-2xl flex items-center justify-center mb-8 shadow-xl group-hover:scale-110 transition-transform">
                  <Package size={32} />
                </div>
                
                <h2 className="text-4xl font-black text-charcoal-900 mb-4 tracking-tight">Customer</h2>
                <p className="text-charcoal-600 font-medium text-lg mb-10 flex-1 leading-relaxed">
                  Send anything, anywhere in Kano. Precise Pin technology ensures your driver finds you without a phone call.
                </p>

                <div className="flex items-center justify-between w-full py-5 px-8 bg-charcoal-900 text-white rounded-2xl font-black text-xl transition-all group-hover:bg-black group-hover:shadow-glow/20">
                  {profile ? "Ship Now" : "Get Started"} <ChevronRight size={24} className="group-hover:translate-x-1 transition-transform" />
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
