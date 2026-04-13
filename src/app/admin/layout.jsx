"use client";

import { useEffect, useState } from 'react';
import { createClient } from '@/utils/supabase/client';
import { useRouter, usePathname } from 'next/navigation';
import { ShieldAlert, BarChart3, Users, Package, Power, ChevronRight, Zap } from 'lucide-react';
import Link from 'next/link';
import { motion, AnimatePresence } from 'framer-motion';

export default function AdminLayout({ children }) {
  const supabase = createClient();
  const router = useRouter();
  const pathname = usePathname();
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function checkAdmin() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        router.push('/login');
        return;
      }

      const { data: adminData } = await supabase
        .from('admins')
        .select('id')
        .eq('id', user.id)
        .maybeSingle();
      
      if (!adminData) {
        router.push('/'); 
      } else {
        setIsAdmin(true);
      }
      setLoading(false);
    }
    checkAdmin();
  }, [supabase, router]);

  if (loading) {
    return (
      <div className="min-h-screen bg-charcoal-950 flex flex-col items-center justify-center relative overflow-hidden">
        {/* Aura Loader Background */}
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] bg-emerald-500/10 rounded-full blur-[100px]"></div>
        <div className="relative z-10 flex flex-col items-center">
            <div className="w-16 h-16 border-4 border-emerald-500/20 border-t-emerald-500 rounded-full animate-spin mb-6"></div>
            <p className="text-white font-black text-sm uppercase tracking-[0.3em] font-outfit animate-pulse">Authenticating Command Hub</p>
        </div>
      </div>
    );
  }

  if (!isAdmin) return null;

  const navItems = [
    { name: 'Dashboard', icon: BarChart3, path: '/admin' },
    { name: 'Driver Fleet', icon: Users, path: '/admin/drivers' },
    { name: 'All Orders', icon: Package, path: '/admin/orders' },
  ];

  return (
    <div className="min-h-screen bg-charcoal-950 text-white flex overflow-hidden font-inter selection:bg-emerald-500/30">
      {/* Sidebar - Desktop Only for now */}
      <aside className="w-80 glass-dark border-r border-white/5 flex flex-col p-8 relative z-20 hidden md:flex">
        <div className="flex items-center gap-4 mb-20 group cursor-pointer" onClick={() => router.push('/admin')}>
          <div className="w-12 h-12 bg-emerald-500 rounded-2xl flex items-center justify-center shadow-glow group-hover:scale-110 transition-transform">
            <ShieldAlert size={24} className="text-charcoal-950" />
          </div>
          <div>
            <span className="font-black tracking-tighter text-2xl font-outfit block leading-none">NAIJA<span className="text-emerald-500 italic">DROPS</span></span>
            <span className="text-[10px] font-bold text-gray-500 uppercase tracking-[0.3em] mt-1 block">Command Hub</span>
          </div>
        </div>

        <nav className="flex-1 space-y-3">
          {navItems.map((item) => {
            const isActive = pathname === item.path || (item.path !== '/admin' && pathname.startsWith(item.path));
            return (
              <Link 
                key={item.name}
                href={item.path} 
                className={`flex items-center justify-between p-4 rounded-2xl transition-all group ${isActive ? 'bg-emerald-500 text-charcoal-950 shadow-glow' : 'text-gray-400 hover:text-white hover:bg-white/5'}`}
              >
                <div className="flex items-center gap-4">
                  <item.icon size={22} className={isActive ? 'text-charcoal-950' : 'group-hover:text-emerald-400 transition-colors'} />
                  <span className="font-black text-xs uppercase tracking-[0.2em]">{item.name}</span>
                </div>
                {isActive && <motion.div layoutId="nav-pill" className="w-1.5 h-1.5 bg-charcoal-950 rounded-full" />}
                {!isActive && <ChevronRight size={14} className="opacity-0 group-hover:opacity-100 transition-all group-hover:translate-x-1" />}
              </Link>
            );
          })}
        </nav>

        <div className="mt-auto pt-10 border-t border-white/5">
            <div className="glass-dark p-4 rounded-3xl border-emerald-500/10 mb-6 flex items-center gap-3">
                 <div className="w-10 h-10 rounded-full bg-charcoal-900 border border-white/10 flex items-center justify-center">
                    <Zap size={18} className="text-emerald-500" />
                 </div>
                 <div>
                    <div className="text-[10px] font-black text-white/40 uppercase tracking-widest">System Status</div>
                    <div className="text-[11px] font-bold text-emerald-500">OPTIMIZED</div>
                 </div>
            </div>
            <button 
                onClick={() => supabase.auth.signOut().then(() => router.push('/'))}
                className="w-full flex items-center gap-4 p-4 rounded-2xl text-red-500 hover:bg-red-500/10 transition-all font-black text-[11px] uppercase tracking-[0.25em] border border-transparent hover:border-red-500/20"
            >
                <Power size={20} /> Sign Out
            </button>
        </div>
      </aside>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col relative overflow-hidden h-screen">
        {/* Background Aura Elements */}
        <div className="absolute inset-0 pointer-events-none z-0">
          <div className="absolute top-0 right-0 w-[800px] h-[800px] bg-emerald-500/5 rounded-full blur-[150px] -mr-64 -mt-64"></div>
          <div className="absolute bottom-0 left-0 w-[600px] h-[600px] bg-emerald-500/5 rounded-full blur-[120px] -ml-64 -mb-64"></div>
        </div>

        {/* Global Header (Optional, if needed for mobile) */}
        <header className="h-20 border-b border-white/5 flex items-center justify-between px-10 relative z-10 md:hidden">
             <div className="flex items-center gap-3">
                 <ShieldAlert size={20} className="text-emerald-500" />
                 <span className="font-black text-sm uppercase tracking-widest">Admin Hub</span>
             </div>
             <button className="w-10 h-10 glass-dark rounded-xl flex items-center justify-center">
                 <Users size={20} />
             </button>
        </header>

        {/* Dynamic Content Container */}
        <main className="flex-1 overflow-y-auto p-8 md:p-12 relative z-10 scroll-smooth hide-scrollbar">
          <AnimatePresence mode="wait">
            <motion.div
              key={pathname}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
            >
              {children}
            </motion.div>
          </AnimatePresence>
        </main>
      </div>

      <style jsx global>{`
        .hide-scrollbar::-webkit-scrollbar {
          display: none;
        }
        .hide-scrollbar {
          -ms-overflow-style: none;  /* IE and Edge */
          scrollbar-width: none;  /* Firefox */
        }
      `}</style>
    </div>
  );
}
