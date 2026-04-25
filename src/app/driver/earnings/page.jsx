"use client";

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/utils/supabase/client';
import { getUserRole } from '@/utils/auth';
import { 
  ArrowLeft, Wallet, TrendingUp, History, 
  ChevronRight, Calendar, DollarSign, ArrowUpRight,
  Filter, Download
} from 'lucide-react';
import { motion } from 'framer-motion';
import DriverBottomNav from '@/components/driver/DriverBottomNav';

export default function DriverEarnings() {
  const router = useRouter();
  const supabase = createClient();
  const [profile, setProfile] = useState(null);
  const [earningsData, setEarningsData] = useState({ total: 0, weekly: 0, daily: 0 });
  const [transactions, setTransactions] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchData() {
        const { user, role, profile: prof } = await getUserRole(supabase);
        if (!user || role !== 'driver') {
            router.push('/login?role=driver');
            return;
        }
        setProfile(prof);

        // Fetch completed orders to calculate earnings
        const { data: orders } = await supabase
            .from('orders')
            .select('*')
            .eq('driver_id', user.id)
            .eq('status', 'delivered')
            .order('created_at', { ascending: false });

        if (orders) {
            const total = orders.reduce((sum, o) => sum + (o.price || 0), 0);
            setEarningsData({
                total,
                weekly: total * 0.4, // Mock data for now
                daily: orders.length > 0 ? orders[0].price : 0
            });
            setTransactions(orders.slice(0, 5));
        }
        setLoading(false);
    }
    fetchData();
  }, [supabase, router]);

  if (loading) {
    return (
      <div className="min-h-screen bg-charcoal-950 flex items-center justify-center">
        <div className="w-12 h-12 border-4 border-emerald-500/20 border-t-emerald-500 rounded-full animate-spin"></div>
      </div>
    );
  }

  return (
    <main className="min-h-screen bg-charcoal-950 pb-32">
      {/* Header */}
      <div className="pt-10 px-6 pb-12 bg-gradient-to-b from-emerald-950/40 to-transparent">
         <div className="flex items-center justify-between mb-10">
            <button onClick={() => router.back()} className="w-12 h-12 bg-white/5 rounded-2xl flex items-center justify-center text-white">
                <ArrowLeft size={24} />
            </button>
            <h1 className="text-2xl font-black text-white tracking-tighter">Earnings</h1>
            <button className="w-12 h-12 bg-white/5 rounded-2xl flex items-center justify-center text-white">
                <Download size={20} />
            </button>
         </div>

         {/* Wallet Card */}
         <div className="glass-dark rounded-[3rem] p-10 border-white/10 relative overflow-hidden">
            <div className="absolute top-0 right-0 w-64 h-64 bg-emerald-500/10 rounded-full blur-[80px] -mr-32 -mt-32"></div>
            <div className="relative z-10">
               <div className="flex items-center gap-2 mb-4 text-emerald-400">
                  <Wallet size={18} />
                  <span className="text-[10px] font-black uppercase tracking-[0.3em]">Available Balance</span>
               </div>
               <div className="text-6xl font-black text-white tracking-tighter italic mb-8">
                  ₦{earningsData.total.toLocaleString()}
               </div>
               <button className="w-full py-5 bg-emerald-500 hover:bg-emerald-400 text-white rounded-2xl font-black text-lg transition-all shadow-glow active:scale-95">
                  Request Payout
               </button>
            </div>
         </div>
      </div>

      {/* Stats Grid */}
      <div className="px-6 -mt-6 grid grid-cols-2 gap-4 mb-10">
         <div className="bg-charcoal-900 p-6 rounded-[2.5rem] border border-white/5">
            <div className="text-emerald-500 mb-2"><TrendingUp size={20} /></div>
            <div className="text-[9px] font-black text-charcoal-500 uppercase tracking-widest mb-1">Weekly Growth</div>
            <div className="text-xl font-black text-white">+12.5%</div>
         </div>
         <div className="bg-charcoal-900 p-6 rounded-[2.5rem] border border-white/5">
            <div className="text-blue-500 mb-2"><Calendar size={20} /></div>
            <div className="text-[9px] font-black text-charcoal-500 uppercase tracking-widest mb-1">Weekly Goal</div>
            <div className="text-xl font-black text-white">45%</div>
         </div>
      </div>

      {/* History */}
      <div className="px-6">
         <div className="flex items-center justify-between mb-6">
            <h2 className="text-xl font-black text-white tracking-tight">Recent Activity</h2>
            <button className="text-xs font-black text-emerald-500 uppercase tracking-widest">View All</button>
         </div>

         <div className="space-y-4">
            {transactions.map((tx, i) => (
               <div key={i} className="bg-charcoal-900 p-5 rounded-[2rem] border border-white/5 flex items-center justify-between group">
                  <div className="flex items-center gap-4">
                     <div className="w-12 h-12 bg-white/5 rounded-xl flex items-center justify-center text-emerald-500">
                        <DollarSign size={20} />
                     </div>
                     <div>
                        <div className="text-sm font-black text-white mb-0.5">Order #{tx.id.slice(0, 8)}</div>
                        <div className="text-[10px] font-bold text-charcoal-500 uppercase tracking-widest">{new Date(tx.created_at).toLocaleDateString()}</div>
                     </div>
                  </div>
                  <div className="text-right">
                     <div className="text-lg font-black text-white leading-none mb-1">+₦{tx.price}</div>
                     <div className="text-[9px] font-black text-emerald-500 uppercase tracking-widest">Success</div>
                  </div>
               </div>
            ))}
            
            {transactions.length === 0 && (
               <div className="py-20 text-center">
                  <div className="text-charcoal-600 font-bold mb-2">No earnings yet.</div>
                  <div className="text-xs text-charcoal-700 font-medium">Go online and start accepting orders!</div>
               </div>
            )}
         </div>
      </div>

      <DriverBottomNav />
    </main>
  );
}
