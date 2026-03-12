"use client";

import { useState, useEffect } from 'react';
import { createClient } from '@/utils/supabase/client';
import { ArrowLeft, Wallet, TrendingUp, Clock, CheckCircle2 } from 'lucide-react';
import Link from 'next/link';

export default function DriverWallet() {
  const supabase = createClient();
  const [user, setUser] = useState(null);
  const [completedTrips, setCompletedTrips] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchWalletData = async () => {
      // 1. Get current user
      const { data: authData } = await supabase.auth.getUser();
      if (!authData?.user) return;
      setUser(authData.user);

      // 2. Fetch all delivered orders for this driver
      const { data: trips, error } = await supabase
        .from('orders')
        .select('*')
        .eq('driver_id', authData.user.id)
        .eq('status', 'delivered')
        .order('created_at', { ascending: false });

      if (!error && trips) {
        setCompletedTrips(trips);
      }
      setLoading(false);
    };

    fetchWalletData();
  }, [supabase]);

  // Calculate Today's Earnings
  const today = new Date().setHours(0, 0, 0, 0);
  const todayEarnings = completedTrips
    .filter(trip => new Date(trip.created_at).setHours(0, 0, 0, 0) === today)
    .reduce((sum, trip) => sum + parseFloat(trip.agreed_price), 0);

  // Total Lifetime Earnings (for display)
  const totalEarnings = completedTrips.reduce((sum, trip) => sum + parseFloat(trip.agreed_price), 0);

  return (
    <div className="flex-1 flex flex-col bg-charcoal-900 border-x border-charcoal-800 relative z-10 overflow-y-auto pb-24">
      {/* Header */}
      <div className="px-6 pt-6 pb-4">
        <div className="flex items-center gap-3 mb-8">
          <Link href="/driver" className="w-10 h-10 rounded-full bg-charcoal-800 flex items-center justify-center text-gray-400 hover:text-white transition-colors">
            <ArrowLeft size={20} />
          </Link>
          <h1 className="text-2xl font-extrabold text-white">Earnings</h1>
        </div>

        {/* Balance Card */}
        <div className="bg-gradient-to-br from-emerald-500 to-emerald-600 rounded-[2rem] p-6 shadow-2xl shadow-emerald-500/20 relative overflow-hidden">
          <div className="absolute top-0 right-0 -mr-8 -mt-8 w-32 h-32 bg-white/10 rounded-full blur-2xl"></div>
          
          <div className="flex items-center gap-2 text-emerald-100 font-bold tracking-widest text-xs uppercase mb-2 relative z-10">
            <Wallet size={14} /> Available Balance
          </div>
          <div className="text-5xl font-black text-white tracking-tight mb-6 relative z-10">
            ₦{totalEarnings.toLocaleString()}
          </div>

          <div className="flex gap-3 relative z-10">
            <button className="flex-1 bg-charcoal-900/40 hover:bg-charcoal-900/60 backdrop-blur-md py-3 rounded-2xl text-white font-bold text-sm transition-colors border border-white/10 shadow-inner">
              Request Payout
            </button>
            <div className="flex-1 bg-white/10 backdrop-blur-md py-3 rounded-2xl text-emerald-50 font-medium text-sm border border-white/20 flex items-center justify-center gap-2">
              <TrendingUp size={16} /> 
              <span>Today: <span className="font-extrabold">₦{todayEarnings.toLocaleString()}</span></span>
            </div>
          </div>
        </div>
      </div>

      {/* Transactions List */}
      <div className="px-6 mt-4">
        <h3 className="text-sm font-extrabold text-gray-400 uppercase tracking-widest mb-4">Past Deliveries</h3>
        
        {loading ? (
            <div className="space-y-4 animate-pulse">
                <div className="h-16 bg-charcoal-800 rounded-2xl w-full"></div>
                <div className="h-16 bg-charcoal-800 rounded-2xl w-full"></div>
                <div className="h-16 bg-charcoal-800 rounded-2xl w-full"></div>
            </div>
        ) : completedTrips.length === 0 ? (
            <div className="text-center py-12 px-4 bg-charcoal-800/50 rounded-3xl border border-charcoal-800 border-dashed">
                <div className="w-16 h-16 bg-charcoal-800 rounded-full flex items-center justify-center mx-auto mb-4">
                    <Clock size={24} className="text-gray-500" />
                </div>
                <p className="text-white font-extrabold text-lg">No trips yet</p>
                <p className="text-gray-400 text-sm mt-1">When you complete a delivery, your earnings will appear here.</p>
            </div>
        ) : (
            <div className="space-y-3">
                {completedTrips.map((trip) => (
                    <div key={trip.id} className="bg-charcoal-800 p-4 rounded-2xl flex items-center justify-between border border-charcoal-800/50 hover:bg-charcoal-800 hover:border-charcoal-700 transition-colors">
                        <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-full bg-emerald-500/10 text-emerald-500 flex items-center justify-center">
                                <CheckCircle2 size={18} />
                            </div>
                            <div>
                                <h4 className="text-white font-bold text-sm">{trip.pickup_name.split(',')[0]}</h4>
                                <p className="text-gray-400 text-xs mt-0.5">
                                    {new Date(trip.created_at).toLocaleDateString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                                </p>
                            </div>
                        </div>
                        <div className="text-right">
                            <p className="text-white font-black text-lg">+₦{trip.agreed_price}</p>
                            <p className="text-emerald-500 text-[10px] font-bold uppercase tracking-widest">Completed</p>
                        </div>
                    </div>
                ))}
            </div>
        )}
      </div>
    </div>
  );
}
