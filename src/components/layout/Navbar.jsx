"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, usePathname } from "next/navigation";
import { Package, LogOut, Shield, User, Wallet, ArrowRight, CreditCard, MessageCircle, Phone, Smartphone } from "lucide-react";
import { createClient } from "@/utils/supabase/client";
import { getUserRole } from "@/utils/auth";
import { motion, AnimatePresence } from "framer-motion";

export default function Navbar() {
  const router = useRouter();
  const pathname = usePathname();
  const supabase = createClient();
  const [profile, setProfile] = useState(null);
  const [activeOrder, setActiveOrder] = useState(null);
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const handleScroll = () => setScrolled(window.scrollY > 20);
    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  useEffect(() => {
    async function setupProfile() {
      const { user, role, profile: prof } = await getUserRole(supabase);
      
      if (user && role) {
        setProfile({ role, email: user.email, ...prof });

        if (role === 'user') {
            const checkActiveOrder = async () => {
                const { data: orders } = await supabase.from('orders')
                  .select('id, status')
                  .eq('user_id', user.id)
                  .in('status', ['looking_for_driver', 'awaiting_payment', 'accepted', 'picked_up', 'arriving'])
                  .order('created_at', { ascending: false })
                  .limit(1);
                  
                setActiveOrder(orders?.[0] || null);
            };
            
            await checkActiveOrder();
            const channel = supabase.channel(`navbar-orders-${user.id}`)
              .on('postgres_changes', { event: '*', schema: 'public', table: 'orders', filter: `user_id=eq.${user.id}` }, checkActiveOrder)
              .subscribe();
            return () => supabase.removeChannel(channel);
        }
      }
    }
    setupProfile();
  }, [supabase]);

  // Navbar component logic

  if (pathname?.startsWith('/admin')) return null;

  return (
    <nav className={`fixed top-0 left-0 right-0 z-[100] transition-all duration-500 ${scrolled ? 'py-3' : 'py-5'}`}>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className={`relative flex justify-between h-16 sm:h-20 items-center px-6 rounded-[2rem] transition-all duration-500 ${scrolled ? 'glass-dark shadow-premium' : 'bg-transparent'}`}>
          
          {/* Logo */}
          <Link href="/" className="flex-shrink-0 flex items-center h-10 sm:h-12 group">
            <div className="bg-emerald-500 p-2 rounded-xl mr-3 group-hover:rotate-12 transition-transform hidden sm:flex">
                <Package size={24} className="text-white" />
            </div>
            <span className="text-2xl font-black tracking-tighter text-charcoal-900 group-hover:text-emerald-700 transition-colors">
                NaijaDrops<span className="text-emerald-500">.</span>
            </span>
          </Link>
          
          <div className="flex items-center gap-3">
            {/* Action Group */}
            <div className="flex items-center gap-1 sm:gap-2 mr-2">
              <Link 
                href="/contact" 
                className="text-charcoal-500 hover:text-emerald-700 p-2 transition-colors"
                title="Support"
              >
                <Smartphone size={20} />
              </Link>
            </div>

            <AnimatePresence>
                {/* Admin Badge */}
                {profile?.role === 'admin' && (
                <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }}>
                    <Link 
                        href="/admin" 
                        className="hidden sm:flex items-center gap-2 bg-charcoal-900 text-white px-5 py-2.5 rounded-2xl text-xs font-black uppercase tracking-widest hover:bg-black transition-all shadow-lg"
                    >
                        <Shield size={16} className="text-emerald-400" /> Admin
                    </Link>
                </motion.div>
                )}

                {/* Driver Wallet */}
                {profile?.role === 'driver' && (
                <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }}>
                    <Link 
                        href="/driver/wallet" 
                        className="flex items-center gap-2 bg-emerald-500 text-white px-4 py-2.5 rounded-2xl text-xs font-black uppercase tracking-widest hover:bg-emerald-600 transition-all shadow-glow"
                    >
                        <Wallet size={16} /> Wallet
                    </Link>
                </motion.div>
                )}

                {/* Active Trip Bubble */}
                {profile?.role === 'user' && activeOrder && !pathname?.startsWith('/driver') && (
                <motion.div initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }}>
                    <Link 
                        href={
                        activeOrder.status === 'looking_for_driver' ? `/matching?orderId=${activeOrder.id}` :
                        activeOrder.status === 'awaiting_payment' ? `/payment?orderId=${activeOrder.id}` :
                        `/tracking/${activeOrder.id}`
                        }
                        className="flex items-center gap-2 bg-charcoal-900 text-white px-4 py-2.5 rounded-2xl text-[10px] font-black uppercase tracking-widest hover:bg-black transition-all shadow-premium border border-white/10"
                    >
                        <div className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse shadow-[0_0_8px_rgba(16,185,129,0.8)]"></div>
                        Live Trip
                    </Link>
                </motion.div>
                )}
            </AnimatePresence>

            {profile && (
              <form action="/api/auth/signout" method="POST" className="m-0 p-0">
                <button 
                  type="submit"
                  className="w-10 h-10 flex items-center justify-center text-charcoal-400 hover:text-red-500 hover:bg-red-50 rounded-2xl transition-all border border-transparent hover:border-red-100"
                  title="Logout"
                >
                  <LogOut size={20} />
                </button>
              </form>
            )}

            {!profile && (
                <Link 
                    href="/login" 
                    className="bg-charcoal-900 text-white px-6 py-3 rounded-2xl text-[11px] font-black uppercase tracking-[0.15em] hover:bg-black transition-all shadow-premium"
                >
                    Login
                </Link>
            )}
          </div>
        </div>
      </div>

      {/* Persistent Status Bar for Active Orders */}
      <AnimatePresence>
        {profile?.role === 'user' && activeOrder && !pathname?.startsWith('/driver') && scrolled && (
            <motion.div 
                initial={{ opacity: 0, y: -50 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -50 }}
                className="absolute top-full left-0 right-0 px-4 pt-2"
            >
                <Link 
                href={
                    activeOrder.status === 'looking_for_driver' ? `/matching?orderId=${activeOrder.id}` :
                    activeOrder.status === 'awaiting_payment' ? `/payment?orderId=${activeOrder.id}` :
                    `/tracking/${activeOrder.id}`
                }
                className="max-w-xl mx-auto glass rounded-2xl p-3 flex items-center justify-between shadow-premium border-emerald-500/20"
                >
                    <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-lg bg-emerald-500 flex items-center justify-center text-white">
                            <CreditCard size={16} />
                        </div>
                        <span className="text-[11px] font-black uppercase text-charcoal-900 tracking-tight">
                            {activeOrder.status === 'awaiting_payment' ? 'Action Required: Pay' : 'Trip in Progress'}
                        </span>
                    </div>
                    <ArrowRight size={14} className="text-emerald-500" />
                </Link>
            </motion.div>
        )}
      </AnimatePresence>
    </nav>
  );
}
