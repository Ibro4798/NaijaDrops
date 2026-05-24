"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, usePathname } from "next/navigation";
import { Package, LogOut, Shield, User, Wallet, ArrowRight, CreditCard, MessageCircle, Phone, Smartphone, Sun, Moon } from "lucide-react";
import { createClient } from "@/utils/supabase/client";
import { getUserRole } from "@/utils/auth";
import { motion, AnimatePresence } from "framer-motion";
import { useTheme } from "@/components/ThemeProvider";

export default function Navbar() {
  const router = useRouter();
  const pathname = usePathname();
  const supabase = createClient();
  const [profile, setProfile] = useState(null);
  const [activeOrder, setActiveOrder] = useState(null);
  const [scrolled, setScrolled] = useState(false);
  const [isCheckingAuth, setIsCheckingAuth] = useState(true);
  const { theme, toggleTheme } = useTheme();

  useEffect(() => {
    const handleScroll = () => setScrolled(window.scrollY > 20);
    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  useEffect(() => {
    async function setupProfile() {
      try {
        const { user, role, profile: prof } = await getUserRole(supabase);
        
        if (user) {
          if (role) {
            setProfile({ role, email: user.email, ...prof });
          } else {
            setProfile({ role: 'vendor', email: user.email });
          }
  
          // âœ… FIX: Check role is 'vendor' not 'user', and query by vendor_id not user_id
          if (role === 'vendor' || !role) {
              const checkActiveOrder = async () => {
                  // âœ… FIX: orders table has vendor_id not user_id
                  const { data: orders } = await supabase.from('orders')
                    .select('id, status')
                    .eq('vendor_id', user.id)
                    .in('status', ['looking_for_driver', 'awaiting_payment', 'accepted', 'picked_up', 'arriving'])
                    .order('created_at', { ascending: false })
                    .limit(1);
                    
                  setActiveOrder(orders?.[0] || null);
              };
              
              await checkActiveOrder();
              const channel = supabase.channel(`navbar-orders-${user.id}`)
                .on('postgres_changes', { event: '*', schema: 'public', table: 'orders', filter: `vendor_id=eq.${user.id}` }, checkActiveOrder)
                .subscribe();
              return () => supabase.removeChannel(channel);
          }
        } else {
          setProfile(null);
        }
      } finally {
        setIsCheckingAuth(false);
      }
    }

    setupProfile();

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_IN') setupProfile();
      if (event === 'SIGNED_OUT') {
        setProfile(null);
        setActiveOrder(null);
      }
    });

    return () => subscription.unsubscribe();
  }, [supabase]);

  // âœ… FIX: Also hide on /ops-terminal, not just /admin (which is being removed)
  if (pathname?.startsWith('/ops-terminal') || pathname?.startsWith('/driver')) return null;

  return (
    <nav className={`fixed top-0 left-0 right-0 z-[100] transition-all duration-500 ${scrolled ? 'py-3' : 'py-5'}`}>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className={`relative flex justify-between h-16 sm:h-20 items-center px-6 rounded-[2rem] transition-all duration-500 ${scrolled ? 'glass-dark shadow-premium' : 'bg-transparent'}`}>
          
          {/* Logo */}
          <Link href="/" className="flex-shrink-0 flex items-center h-10 sm:h-12 group">
            <div className="bg-emerald-500 p-2 rounded-xl mr-3 group-hover:rotate-12 transition-transform hidden sm:flex">
                <Package size={24} className="text-white" />
            </div>
            <span className="text-2xl font-black tracking-tighter text-charcoal-900 dark:text-white group-hover:text-emerald-700 transition-colors">
                NaijaDrops<span className="text-emerald-500">.</span>
            </span>
          </Link>
          
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1 sm:gap-2 mr-2">
            </div>

            <AnimatePresence>
                {/* âœ… FIX: Admin badge links to /ops-terminal/dashboard not /admin */}
                {profile?.role === 'admin' && (
                <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }}>
                    <Link 
                        href="/ops-terminal/dashboard" 
                        className="hidden sm:flex items-center gap-2 bg-charcoal-900 text-white px-5 py-2.5 rounded-2xl text-xs font-black uppercase tracking-widest hover:bg-black transition-all shadow-lg"
                    >
                        <Shield size={16} className="text-emerald-400" /> Terminal
                    </Link>
                </motion.div>
                )}

                {/* âœ… FIX: Rider wallet links to /rider/earnings not /driver/earnings */}
                {profile?.role === 'rider' && (
                <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }}>
                    <Link 
                        href="/rider/earnings" 
                        className="flex items-center gap-2 bg-emerald-500 text-white px-4 py-2.5 rounded-2xl text-xs font-black uppercase tracking-widest hover:bg-emerald-600 transition-all shadow-glow"
                    >
                        <Wallet size={16} /> Wallet
                    </Link>
                </motion.div>
                )}

                {/* âœ… FIX: Active Trip Bubble uses 'vendor' role not 'user' */}
                {profile?.role === 'vendor' && activeOrder && (
                <motion.div initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }}>
                    <Link 
                        href={
                          activeOrder.status === 'looking_for_driver' ? `/send-package/step-3?orderId=${activeOrder.id}` :
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

            <button 
              onClick={toggleTheme}
              className="w-10 h-10 flex items-center justify-center text-charcoal-400 dark:text-white hover:text-emerald-500 hover:bg-emerald-50 dark:hover:bg-white/10 rounded-2xl transition-all border border-transparent"
              title="Toggle Theme"
            >
              {theme === 'dark' ? <Sun size={20} /> : <Moon size={20} />}
            </button>

            {profile && (
              <>
                <Link 
                  href="/profile"
                  className="w-10 h-10 flex items-center justify-center text-charcoal-400 dark:text-white hover:text-emerald-500 hover:bg-emerald-50 dark:hover:bg-white/10 rounded-2xl transition-all border border-transparent"
                  title="Profile Settings"
                >
                  <User size={20} />
                </Link>

                <form action="/api/auth/signout" method="POST" className="m-0 p-0">
                  <button 
                    type="submit"
                    className="w-10 h-10 flex items-center justify-center text-charcoal-400 hover:text-red-500 hover:bg-red-50 rounded-2xl transition-all border border-transparent hover:border-red-100"
                    title="Logout"
                  >
                    <LogOut size={20} />
                  </button>
                </form>
              </>
            )}

            {!profile && !isCheckingAuth && (
                <Link 
                    href="/auth/login" 
                    className="bg-charcoal-900 text-white px-6 py-3 rounded-2xl text-[11px] font-black uppercase tracking-[0.15em] hover:bg-black transition-all shadow-premium"
                >
                    Login
                </Link>
            )}
          </div>
        </div>
      </div>

      {/* Floating Active Order Status Bar */}
      <AnimatePresence>
        {profile?.role === 'vendor' && activeOrder && (
            <motion.div 
                initial={{ opacity: 0, y: 100 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 100 }}
                className="fixed bottom-6 left-6 right-6 z-[150] pointer-events-none"
            >
                <Link 
                href={
                    activeOrder.status === 'looking_for_driver' ? `/send-package/step-3?orderId=${activeOrder.id}` :
                    activeOrder.status === 'awaiting_payment' ? `/payment?orderId=${activeOrder.id}` :
                    `/tracking/${activeOrder.id}`
                }
                className={`max-w-md mx-auto glass rounded-[2.5rem] p-5 flex items-center justify-between shadow-premium border-2 pointer-events-auto transition-transform hover:scale-[1.02] active:scale-95 ${
                    activeOrder.status === 'awaiting_payment' ? 'border-amber-500/30' : 'border-emerald-500/20'
                }`}
                >
                    <div className="flex items-center gap-4">
                        <div className={`w-12 h-12 rounded-2xl flex items-center justify-center text-white shadow-lg ${
                            activeOrder.status === 'awaiting_payment' ? 'bg-amber-500' : 'bg-emerald-600'
                        }`}>
                            {activeOrder.status === 'awaiting_payment' ? <CreditCard size={22} className="animate-pulse" /> : <Package size={22} />}
                        </div>
                        <div>
                            <div className="text-[10px] font-black uppercase text-charcoal-500 tracking-widest mb-0.5">
                                {activeOrder.status === 'awaiting_payment' ? 'Action Required' : 'Live Order'}
                            </div>
                            <div className="text-sm font-black text-charcoal-900 tracking-tight">
                                {activeOrder.status === 'awaiting_payment' ? 'Complete Payment' : 
                                 activeOrder.status === 'looking_for_driver' ? 'Searching Drivers...' : 'Trip in Progress'}
                            </div>
                        </div>
                    </div>
                    <div className="bg-charcoal-900 text-base text-white w-10 h-10 rounded-xl flex items-center justify-center">
                        <ArrowRight size={18} />
                    </div>
                </Link>
            </motion.div>
        )}
      </AnimatePresence>
    </nav>
  );
}
