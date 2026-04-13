"use client";

import { useState, useEffect } from 'react';
import { createClient } from '@/utils/supabase/client';
import { ArrowLeft, Wallet, TrendingUp, Clock, CheckCircle2, ChevronRight, Zap } from 'lucide-react';
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
        <div className="absolute bottom-0 right-0 w-[500px] h-[500px] bg-emerald-500/5 rounded-full blur-[120px] -mr-64 -mb-64"></div>
      </div>

      <div className="relative z-10 flex flex-col flex-1 pb-24 h-full overflow-y-auto hide-scrollbar">
        {/* Header */}
        <div className="px-6 pt-12 pb-6">
          <div className="flex items-center justify-between mb-10">
            <Link href="/driver" className="w-12 h-12 glass-dark rounded-2xl flex items-center justify-center text-charcoal-400 hover:text-white transition-all transform hover:scale-105 active:scale-95">
              <ArrowLeft size={20} />
            </Link>
            <div className="glass-dark px-4 py-2 rounded-full border-emerald-500/20 flex items-center gap-2">
                <div className="w-1.5 h-1.5 bg-emerald-500 rounded-full shadow-glow"></div>
                <span className="text-[10px] font-black text-white uppercase tracking-[0.2em] font-outfit">Financial Ledger</span>
            </div>
            <div className="w-12 h-12"></div> {/* Spacer */}
          </div>

          <motion.h1 
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            className="text-4xl font-black text-white font-outfit uppercase tracking-tighter italic mb-8"
          >
            Payload <span className="text-emerald-500 italic block mt-1">Earnings</span>
          </motion.h1>

          {/* Balance Card (Aura Style) */}
          <motion.div 
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            className="glass-dark border- white/5 rounded-[3rem] p-10 shadow-premium relative overflow-hidden mb-12"
          >
            <div className="absolute top-0 right-0 w-[200px] h-[200px] bg-emerald-500/5 rounded-full blur-[60px] -mr-24 -mt-24"></div>
            
            <div className="flex items-center gap-2 text-emerald-400 font-black tracking-[0.2em] text-[10px] uppercase mb-4 relative z-10 opacity-80">
              <Zap size={12} fill="currentColor" /> {filter === 'daily' ? "Today" : "Weekly"} Yield
            </div>
            
            <div className="flex items-baseline gap-1 mb-2 relative z-10">
              <span className="text-2xl font-black text-white/40 font-outfit">₦</span>
              <span className="text-6xl font-black text-white tracking-tighter font-outfit leading-none">
                {currentBalance.toLocaleString()}
              </span>
            </div>
            <div className="text-charcoal-500 text-[10px] font-bold uppercase tracking-[0.2em] mb-10 relative z-10">
              Net Profit / {PLATFORM_FEE_PERCENT * 100}% Fleet Commission
            </div>

            <div className="grid grid-cols-2 gap-4 relative z-10 mb-8 p-1.5 bg-charcoal-950/40 rounded-[2rem] border border-white/5 shadow-inner">
              <button 
                onClick={() => setFilter('daily')}
                className={`py-3 rounded-[1.5rem] font-black text-[10px] uppercase tracking-widest transition-all ${filter === 'daily' ? 'bg-emerald-500 text-charcoal-950 shadow-glow' : 'text-charcoal-500 hover:text-white'}`}
              >
                Daily
              </button>
              <button 
                onClick={() => setFilter('weekly')}
                className={`py-3 rounded-[1.5rem] font-black text-[10px] uppercase tracking-widest transition-all ${filter === 'weekly' ? 'bg-emerald-500 text-charcoal-950 shadow-glow' : 'text-charcoal-500 hover:text-white'}`}
              >
                Weekly
              </button>
            </div>

            <div className="flex flex-col gap-4 relative z-10">
              <button 
                onClick={handleRequestPayout}
                disabled={payoutStatus === 'requesting' || payoutStatus === 'success' || hasPendingRequest || currentBalance < 100}
                className="w-full bg-white text-charcoal-950 py-5 rounded-[2rem] font-black text-xs uppercase tracking-[0.25em] transition-all hover:bg-emerald-400 active:scale-95 disabled:opacity-40 shadow-premium flex items-center justify-center gap-3"
              >
                {payoutStatus === 'requesting' ? (
                  <div className="w-5 h-5 border-2 border-charcoal-900 border-t-transparent rounded-full animate-spin"></div>
                ) : (payoutStatus === 'success' || hasPendingRequest) ? (
                  <>
                    <CheckCircle2 size={18} /> Syncing Payout
                  </>
                ) : (
                  <>
                    Initiate Transfer <ChevronRight size={18} />
                  </>
                )}
              </button>
              
              <div className="flex items-center justify-between px-4">
                 <div className="flex items-center gap-2 opacity-60">
                    <TrendingUp size={14} className="text-emerald-500" />
                    <span className="text-[10px] font-black text-white uppercase tracking-widest">Lifetime Portfolio</span>
                 </div>
                 <span className="text-lg font-black text-emerald-500 font-outfit">₦{totalNet.toLocaleString()}</span>
              </div>
            </div>
          </motion.div>
        </div>

        {/* Transactions List */}
        <div className="px-6 flex-1">
          <div className="flex items-center justify-between mb-8 px-2">
            <h3 className="text-[10px] font-black text-white uppercase tracking-[0.3em] opacity-40 italic">Activity Logs</h3>
            <div className="h-px bg-white/5 flex-1 mx-4"></div>
          </div>
          
          <AnimatePresence mode="wait">
            {loading ? (
                <div className="space-y-4 px-2" key="loading">
                    {[1, 2, 3].map(i => (
                        <div key={i} className="h-20 glass-dark rounded-[2rem] w-full animate-pulse border-white/5"></div>
                    ))}
                </div>
            ) : completedTrips.length === 0 ? (
                <motion.div 
                    initial={{ opacity: 0 }} 
                    animate={{ opacity: 1 }}
                    key="empty" 
                    className="text-center py-16 px-8 glass-dark rounded-[3rem] border-white/5 border-dashed border-2"
                >
                    <div className="w-20 h-20 bg-charcoal-900 rounded-[2rem] flex items-center justify-center mx-auto mb-6 shadow-inner ring-1 ring-white/5">
                        <Clock size={32} className="text-charcoal-600" />
                    </div>
                    <p className="text-white font-black text-xl font-outfit uppercase tracking-tight mb-2">Zero Payload Logged</p>
                    <p className="text-charcoal-500 text-[10px] font-bold uppercase tracking-widest leading-relaxed">Completed deliveries will manifest in the encrypted ledger.</p>
                </motion.div>
            ) : (
                <div className="space-y-4 px-2" key="list">
                    {completedTrips.map((trip, index) => (
                        <motion.div 
                          initial={{ opacity: 0, x: 20 }}
                          animate={{ opacity: 1, x: 0 }}
                          transition={{ delay: index * 0.05 }}
                          key={trip.id} 
                          className="glass-dark p-6 rounded-[2.5rem] flex items-center justify-between border-white/5 hover:bg-charcoal-900 transition-all group"
                        >
                            <div className="flex items-center gap-4">
                                <div className="w-12 h-12 rounded-2xl bg-emerald-500/10 text-emerald-500 flex items-center justify-center shadow-inner group-hover:scale-110 transition-transform">
                                    <CheckCircle2 size={24} />
                                </div>
                                <div className="max-w-[150px]">
                                    <h4 className="text-white font-black text-sm uppercase truncate font-outfit">{trip.pickup_name.split(',')[0]}</h4>
                                    <p className="text-charcoal-500 text-[10px] font-bold uppercase tracking-widest mt-1">
                                        {new Date(trip.created_at).toLocaleDateString([], { month: 'short', day: 'numeric' })} • {new Date(trip.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                    </p>
                                </div>
                            </div>
                             <div className="text-right">
                                 <p className="text-2xl font-black text-white tracking-tighter font-outfit italic">+₦{(parseFloat(trip.agreed_price) * (1 - PLATFORM_FEE_PERCENT)).toLocaleString()}</p>
                                 <p className="text-emerald-500 text-[9px] font-black uppercase tracking-[0.2em] opacity-80">
                                   Encrypted Yield
                                 </p>
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
