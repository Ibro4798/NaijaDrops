"use client";

import { useState, useEffect } from 'react';
import { createClient } from '@/utils/supabase/client';
import { ArrowLeft, Wallet, TrendingUp, Clock, CheckCircle2, ChevronRight, Zap, Bell, Truck, ShoppingCart } from 'lucide-react';
import Link from 'next/link';
import { motion, AnimatePresence } from 'framer-motion';

export default function DriverWallet() {
  const supabase = createClient();
  const [user, setUser] = useState(null);
  const [completedTrips, setCompletedTrips] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('daily'); // 'daily' | 'weekly'
  const [payoutStatus, setPayoutStatus] = useState(null); // null | 'requesting' | 'success'
  const [hasPendingRequest, setHasPendingRequest] = useState(false);

  const PLATFORM_FEE_PERCENT = 0.20; // 20% Commission

  useEffect(() => {
    const fetchWalletData = async () => {
      const { data: authData } = await supabase.auth.getUser();
      if (!authData?.user) return;
      setUser(authData.user);

      const { data: trips, error } = await supabase
        .from('orders')
        .select('*')
        .eq('driver_id', authData.user.id)
        .eq('status', 'delivered')
        .order('created_at', { ascending: false });

      if (!error && trips) {
        setCompletedTrips(trips);
      }

      const { data: pending } = await supabase
        .from('wallet_transactions')
        .select('id')
        .eq('driver_id', authData.user.id)
        .eq('type', 'payout_request')
        .limit(1);
      
      if (pending && pending.length > 0) {
        setHasPendingRequest(true);
      }

      setLoading(false);
    };

    fetchWalletData();
  }, [supabase]);

   const today = new Date();
   today.setHours(0, 0, 0, 0);
   const dailyTrips = completedTrips.filter(trip => new Date(trip.created_at) >= today);
   const todayGross = dailyTrips.reduce((sum, trip) => sum + parseFloat(trip.agreed_price), 0);
   const todayNet = todayGross * (1 - PLATFORM_FEE_PERCENT);
 
   const oneWeekAgo = new Date();
   oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);
   const weeklyTrips = completedTrips.filter(trip => new Date(trip.created_at) >= oneWeekAgo);
   const weeklyGross = weeklyTrips.reduce((sum, trip) => sum + parseFloat(trip.agreed_price), 0);
   const weeklyNet = weeklyGross * (1 - PLATFORM_FEE_PERCENT);
 
   const totalNet = completedTrips.reduce((sum, trip) => sum + (parseFloat(trip.agreed_price) * (1 - PLATFORM_FEE_PERCENT)), 0);
   
   const currentBalance = filter === 'daily' ? todayNet : weeklyNet;
 
   const handleRequestPayout = async () => {
     if (!user) return;
     if (currentBalance < 100) return;
     
     setPayoutStatus('requesting');
     try {
       const finalAmount = Math.floor(currentBalance);
       const { error } = await supabase.from('wallet_transactions').insert({
           driver_id: user.id,
           amount: finalAmount,
           type: 'payout_request',
           description: `Driver payout: ${new Date().toLocaleDateString()}`
       });
        if (error) throw error;
        setPayoutStatus('success');
        setHasPendingRequest(true);
      } catch (err) {
        console.error("Payout error", err);
        setPayoutStatus(null);
      }
    };

  return (
    <div className="flex-1 flex flex-col bg-charcoal-950 min-h-screen relative overflow-hidden font-inter">
      {/* Background Aura */}
      <div className="absolute inset-0 pointer-events-none opacity-40">
        <div className="absolute top-0 left-0 w-[500px] h-[500px] bg-emerald-500/10 rounded-full blur-[120px] -ml-64 -mt-64 text-emerald-500"></div>
        <div className="absolute bottom-0 right-0 w-[400px] h-[400px] bg-emerald-500/5 rounded-full blur-[100px] -mr-64 -mb-64"></div>
      </div>

      <div className="relative z-10 flex flex-col flex-1 pb-24 h-full overflow-y-auto hide-scrollbar">
        {/* Header */}
        <div className="px-6 pt-12 pb-6">
          <div className="flex items-center justify-between mb-8">
            <div className="flex items-center gap-3">
               <div className="w-10 h-10 rounded-full border-2 border-emerald-500/20 overflow-hidden">
                  <img src={user?.user_metadata?.avatar_url || "https://ui-avatars.com/api/?name=Driver&background=10b981&color=fff"} className="w-full h-full object-cover" alt="Profile" />
               </div>
               <h1 className="text-white font-black text-xl font-outfit tracking-tighter">Earnings</h1>
            </div>
            <button className="w-10 h-10 glass flex items-center justify-center text-white rounded-xl border border-white/5 shadow-premium group">
               <Bell size={18} className="group-hover:rotate-12 transition-transform" />
            </button>
          </div>

          {/* Balance Card: Vibrant Green per Section Suggestion */}
          <motion.div 
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-emerald-600 rounded-[3rem] p-10 shadow-[0_20px_50px_rgba(16,185,129,0.3)] relative overflow-hidden mb-10"
          >
            <div className="relative z-10">
               <div className="flex items-center justify-between mb-2">
                  <div className="text-[10px] font-black text-charcoal-950/60 uppercase tracking-[0.2em]">Available Balance</div>
                  <div className="flex items-center gap-1.5 px-3 py-1 bg-charcoal-950/10 rounded-full border border-charcoal-950/10">
                     <div className="w-3 h-3 bg-emerald-400 rounded-full flex items-center justify-center border border-charcoal-950/20">
                        <CheckCircle2 size={8} className="text-charcoal-950" />
                     </div>
                     <span className="text-[8px] font-black text-charcoal-950 uppercase tracking-widest">Verified Payouts</span>
                  </div>
               </div>
               
               <div className="flex items-baseline gap-1 mb-8">
                 <span className="text-3xl font-black text-charcoal-950/40 font-outfit">₦</span>
                 <span className="text-6xl font-black text-charcoal-950 tracking-tighter font-outfit leading-none">
                   {totalNet.toLocaleString()}
                 </span>
               </div>

               <button 
                 onClick={handleRequestPayout}
                 disabled={payoutStatus === 'requesting' || payoutStatus === 'success' || hasPendingRequest || totalNet < 100}
                 className="w-full bg-[#facc15] hover:bg-[#eab308] text-charcoal-950 py-5 rounded-[2rem] font-black text-sm uppercase tracking-[0.2em] transition-all active:scale-95 disabled:opacity-40 shadow-xl flex items-center justify-center gap-3"
               >
                 {payoutStatus === 'requesting' ? (
                   <div className="w-5 h-5 border-2 border-charcoal-900 border-t-transparent rounded-full animate-spin"></div>
                 ) : (payoutStatus === 'success' || hasPendingRequest) ? (
                   <>Processing Payout</>
                 ) : (
                   <>Cash Out</>
                 )}
               </button>
            </div>
          </motion.div>

          {/* Stats Grid: Driver Performance Display */}
          <div className="grid grid-cols-3 gap-4 mb-12">
             {[
               { label: "Trips", val: completedTrips.length, icon: <Truck size={16} /> },
               { label: "Hours", val: (completedTrips.length * 0.6).toFixed(1), icon: <Clock size={16} /> },
               { label: "Net", val: `₦${Math.floor(totalNet/1000)}k`, icon: <TrendingUp size={16} /> }
             ].map((stat, i) => (
                <div key={i} className="bg-charcoal-900/60 border border-white/5 p-4 rounded-[1.5rem] text-center">
                   <div className="w-8 h-8 bg-charcoal-950 text-white rounded-xl flex items-center justify-center mx-auto mb-3 opacity-60">
                      {stat.icon}
                   </div>
                   <p className="text-[9px] font-black text-charcoal-500 uppercase tracking-widest mb-1">{stat.label}</p>
                   <p className="text-xl font-black text-white font-outfit">{stat.val}</p>
                </div>
             ))}
          </div>

          <div className="flex items-center justify-between mb-8">
            <h3 className="text-lg font-black text-white font-outfit tracking-tighter italic">Weekly Summary</h3>
            <span className="text-[10px] font-bold text-charcoal-500 uppercase tracking-widest">Last 7 Days</span>
          </div>

          {/* Simple Chart Visualization Placeholder per Design */}
          <div className="flex items-end justify-between h-40 px-4 bg-charcoal-900/40 rounded-[2rem] border border-white/5 p-8 mb-12">
             {[
               { day: 'Mon', h: '40%' },
               { day: 'Tue', h: '60%' },
               { day: 'Wed', h: '30%' },
               { day: 'Thu', h: '90%', active: true },
               { day: 'Fri', h: '50%' },
               { day: 'Sat', h: '25%' },
               { day: 'Sun', h: '15%' }
             ].map((d, i) => (
                <div key={i} className="flex flex-col items-center gap-3">
                   <div className="w-10 rounded-xl transition-all duration-700" style={{ height: d.h, backgroundColor: d.active ? '#10b981' : '#27272a' }}></div>
                   <span className="text-[8px] font-black text-charcoal-600 uppercase tracking-widest">{d.day}</span>
                </div>
             ))}
          </div>
        </div>

        {/* Transactions List */}
        <div className="px-6 flex-1 bg-charcoal-950/80 backdrop-blur-xl pt-8 rounded-t-[3rem] border-t border-white/5 shadow-2xl">
          <div className="flex items-center justify-between mb-8 px-2">
            <h3 className="text-lg font-black text-white font-outfit tracking-tighter italic">Recent Transactions</h3>
            <Link href="#" className="text-emerald-500 text-[10px] font-black uppercase tracking-widest">View All</Link>
          </div>
          
          <AnimatePresence mode="wait">
            {loading ? (
                <div className="space-y-4 px-2" key="loading">
                    {[1, 2, 3].map(i => (
                        <div key={i} className="h-20 bg-charcoal-900 rounded-[2rem] w-full animate-pulse"></div>
                    ))}
                </div>
            ) : completedTrips.length === 0 ? (
                <div className="text-center py-16 px-8 rounded-[3rem] opacity-30">
                    <p className="text-white font-black text-xl font-outfit uppercase tracking-tight mb-2">Zero Activity</p>
                </div>
            ) : (
                <div className="space-y-4 px-2" key="list">
                    {completedTrips.map((trip, index) => (
                        <motion.div 
                          initial={{ opacity: 0, x: 20 }}
                          animate={{ opacity: 1, x: 0 }}
                          transition={{ delay: index * 0.05 }}
                          key={trip.id} 
                          className="bg-charcoal-900/60 p-5 rounded-[2.5rem] flex items-center justify-between border border-white/5 hover:bg-black transition-all group"
                        >
                            <div className="flex items-center gap-4">
                                <div className="w-12 h-12 rounded-2xl bg-emerald-500/10 text-emerald-500 flex items-center justify-center group-hover:scale-110 transition-transform">
                                    <ShoppingCart size={20} />
                                </div>
                                <div className="max-w-[150px]">
                                    <h4 className="text-white font-black text-sm uppercase truncate font-outfit tracking-tight">JOB-{trip.id.slice(-5).toUpperCase()}</h4>
                                    <p className="text-charcoal-500 text-[10px] font-bold uppercase tracking-widest mt-1">
                                        {new Date(trip.created_at).toLocaleDateString([], { month: 'short', day: 'numeric' })} • {new Date(trip.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                    </p>
                                </div>
                            </div>
                             <div className="text-right">
                                 <p className="text-lg font-black text-emerald-500 tracking-tighter font-outfit italic">+₦{(parseFloat(trip.agreed_price) * (1 - PLATFORM_FEE_PERCENT)).toLocaleString()}</p>
                                 <p className="text-charcoal-600 text-[9px] font-black uppercase tracking-[0.2em]">COMPLETE</p>
                             </div>
                        </motion.div>
                    ))}
                </div>
            )}
          </AnimatePresence>
        </div>
      </div>

      {/* Nav Overlay blur for bottom safe area */}
      <div className="absolute bottom-0 left-0 right-0 h-12 bg-gradient-to-t from-charcoal-950 to-transparent pointer-events-none"></div>
    </div>
  );
}
