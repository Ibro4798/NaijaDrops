"use client";

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/utils/supabase/client';
import {
  ArrowLeft, Wallet, TrendingUp, History,
  Download, Loader2, Sparkles, Receipt, ArrowUpRight, X
} from 'lucide-react';

export default function RiderEarnings() {
  const router = useRouter();
  const supabase = createClient();
  const [profile, setProfile] = useState(null);
  const [earningsData, setEarningsData] = useState({ total: 0, pending: 0, weekly: 0 });
  const [transactions, setTransactions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showWithdrawModal, setShowWithdrawModal] = useState(false);
  const [withdrawAmount, setWithdrawAmount] = useState('');
  const [withdrawing, setWithdrawing] = useState(false);
  const [withdrawError, setWithdrawError] = useState(null);
  const [withdrawSuccess, setWithdrawSuccess] = useState(false);

  async function loadData() {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { router.push('/auth/login'); return; }

    const { data: rider } = await supabase.from('riders').select('*').eq('user_id', user.id).single();
    setProfile(rider);

    const { data: orders } = await supabase
      .from('orders')
      .select('*')
      .eq('rider_id', rider?.id)   // orders.rider_id â†’ riders.id (not users.id)
      .eq('status', 'delivered')
      .order('created_at', { ascending: false });

    const { data: walletTxs } = await supabase
      .from('wallet_transactions')
      .select('*')
      .eq('rider_id', user.id)     // wallet_transactions.rider_id â†’ users.id
      .order('created_at', { ascending: false });

    if (orders) {
      const grossEarned = orders.reduce((sum, o) => sum + (o.agreed_price || 0), 0) * 0.80; // 20% platform commission
      const alreadyWithdrawn = (walletTxs || [])
        .filter(t => t.status === 'requested' || t.status === 'paid')
        .reduce((sum, t) => sum + Number(t.amount), 0);
      const pendingRequests = (walletTxs || [])
        .filter(t => t.status === 'requested')
        .reduce((sum, t) => sum + Number(t.amount), 0);

      setEarningsData({
        total: Math.floor(grossEarned - alreadyWithdrawn), // available to withdraw
        pending: Math.floor(pendingRequests),               // awaiting admin approval
        weekly: Math.floor(grossEarned * 0.4)
      });
      setTransactions(orders.slice(0, 5));
    }
    setLoading(false);
  }

  useEffect(() => { loadData(); }, [supabase, router]);

  async function submitWithdrawal() {
    const amount = Number(withdrawAmount);
    setWithdrawError(null);

    if (!amount || amount <= 0) { setWithdrawError('Enter a valid amount.'); return; }
    if (amount > earningsData.total) { setWithdrawError(`Amount exceeds your available balance of â‚¦${earningsData.total.toLocaleString()}.`); return; }

    setWithdrawing(true);
    const { error } = await supabase.rpc('request_withdrawal', { p_amount: amount });
    setWithdrawing(false);

    if (error) { setWithdrawError(error.message); return; }

    setWithdrawSuccess(true);
    setWithdrawAmount('');
    await loadData();
    setTimeout(() => { setShowWithdrawModal(false); setWithdrawSuccess(false); }, 1800);
  }

  if (loading) return <div className="flex justify-center py-20"><Loader2 className="animate-spin text-emerald-500" /></div>;

  return (
    <div className="space-y-8 pb-32 animate-in fade-in slide-in-from-bottom-4 duration-700">
      <div className="flex items-center justify-between">
         <div className="flex items-center gap-4">
            <button onClick={() => router.back()} className="w-10 h-10 bg-white/5 rounded-xl flex items-center justify-center text-white border border-white/10 hover:bg-white/10 transition-colors">
                <ArrowLeft size={20} />
            </button>
            <div>
               <h1 className="text-3xl font-black text-white tracking-tight font-outfit italic">
                  Financial <span className="text-emerald-500">Node</span>
               </h1>
               <p className="text-charcoal-400 text-sm font-medium">Operation settlement & payouts.</p>
            </div>
         </div>
         <button className="w-10 h-10 bg-emerald-500/10 rounded-xl flex items-center justify-center text-emerald-500 border border-emerald-500/20">
            <Download size={20} />
         </button>
      </div>

      {/* Wallet Visualization */}
      <div className="bg-white/[0.03] border border-white/10 rounded-[3rem] p-10 relative overflow-hidden group shadow-2xl">
         <div className="absolute top-0 right-0 w-80 h-80 bg-emerald-500/10 rounded-full blur-[100px] -mr-40 -mt-40 group-hover:bg-emerald-500/20 transition-all duration-1000"></div>
         <div className="relative z-10">
            <div className="flex items-center gap-3 mb-6">
               <div className="w-10 h-10 bg-emerald-500 rounded-2xl flex items-center justify-center text-charcoal-950 shadow-glow">
                  <Wallet size={20} strokeWidth={3} />
               </div>
               <span className="text-[10px] font-black uppercase tracking-[0.4em] text-emerald-500 font-outfit italic">Liquid Balance</span>
            </div>

            <div className="mb-10">
               <span className="text-2xl font-black text-emerald-500 mr-2 italic">â‚¦</span>
               <span className="text-7xl font-black text-white tracking-tighter italic font-outfit leading-none">
                  {earningsData.total.toLocaleString()}
               </span>
            </div>

            <div className="grid grid-cols-2 gap-4 mb-8">
               <div className="p-5 bg-charcoal-900/50 rounded-2xl border border-white/5 backdrop-blur-md">
                  <div className="text-[9px] font-black text-charcoal-600 uppercase tracking-widest mb-1 italic">Pending Approval</div>
                  <div className="text-lg font-black text-white tracking-tight">â‚¦{earningsData.pending.toLocaleString()}</div>
               </div>
               <div className="p-5 bg-charcoal-900/50 rounded-2xl border border-white/5 backdrop-blur-md">
                  <div className="text-[9px] font-black text-emerald-500/60 uppercase tracking-widest mb-1 italic">Weekly Yield</div>
                  <div className="text-lg font-black text-white tracking-tight">â‚¦{earningsData.weekly.toLocaleString()}</div>
               </div>
            </div>

            <button
              onClick={() => setShowWithdrawModal(true)}
              disabled={earningsData.total <= 0}
              className="w-full py-6 bg-emerald-500 hover:bg-emerald-400 disabled:opacity-40 disabled:cursor-not-allowed text-charcoal-950 rounded-[2rem] font-black text-lg uppercase tracking-widest transition-all shadow-glow active:scale-95 flex items-center justify-center gap-3"
            >
               Withdraw Funds <ArrowUpRight size={20} strokeWidth={3} />
            </button>
         </div>
      </div>

      {/* Analytics Section */}
      <div className="space-y-4">
         <div className="flex items-center justify-between px-2">
            <h2 className="text-xs font-black text-charcoal-500 uppercase tracking-widest italic">Signal Registry</h2>
            <button className="text-[10px] font-black text-emerald-500 uppercase tracking-widest flex items-center gap-1">
               Historical Data <History size={12} />
            </button>
         </div>

         <div className="space-y-3">
            {transactions.map((tx) => (
               <div key={tx.id} className="bg-white/[0.03] p-5 rounded-[2rem] border border-white/5 flex items-center justify-between hover:bg-white/[0.05] transition-all group">
                  <div className="flex items-center gap-4">
                     <div className="w-12 h-12 bg-charcoal-900 rounded-2xl flex items-center justify-center text-emerald-500 border border-white/5 group-hover:border-emerald-500/30 transition-all font-outfit font-black italic">
                        <Receipt size={20} />
                     </div>
                     <div>
                        <div className="text-sm font-black text-white uppercase tracking-tight">Mission Settlement</div>
                        <div className="text-[10px] font-bold text-charcoal-500 uppercase tracking-widest">{new Date(tx.created_at).toLocaleDateString()} â€¢ ID: {tx.id.slice(0, 6)}</div>
                     </div>
                  </div>
                  <div className="text-right">
                     <div className="text-xl font-black text-white italic tracking-tighter mb-1">+â‚¦{Math.floor(tx.agreed_price * 0.80).toLocaleString()}</div>
                     <div className="text-[9px] font-black text-emerald-500 uppercase tracking-widest italic flex items-center justify-end gap-1">
                        Cleared <Sparkles size={10} />
                     </div>
                  </div>
               </div>
            ))}

            {transactions.length === 0 && (
               <div className="py-16 text-center border border-dashed border-white/10 rounded-[3rem] opacity-30">
                  <div className="w-16 h-16 bg-white/10 rounded-full flex items-center justify-center mx-auto mb-4">
                     <TrendingUp size={24} />
                  </div>
                  <p className="text-[10px] font-black uppercase tracking-[0.4em]">Zero Movement Detected</p>
               </div>
            )}
         </div>
      </div>

      {showWithdrawModal && (
        <div className="fixed inset-0 bg-black/70 z-50 flex items-end sm:items-center justify-center p-4">
          <div className="bg-charcoal-900 border border-white/10 rounded-[2.5rem] p-8 w-full max-w-sm relative">
            <button onClick={() => setShowWithdrawModal(false)} className="absolute top-6 right-6 text-charcoal-500 hover:text-white">
              <X size={20} />
            </button>
            {withdrawSuccess ? (
              <div className="text-center py-8">
                <p className="text-emerald-400 font-black text-lg">Request submitted</p>
                <p className="text-charcoal-400 text-sm mt-2">Pending admin approval.</p>
              </div>
            ) : (
              <>
                <p className="text-white font-black text-lg mb-1">Withdraw Funds</p>
                <p className="text-charcoal-400 text-sm mb-6">Available: â‚¦{earningsData.total.toLocaleString()}</p>
                <input
                  type="number"
                  value={withdrawAmount}
                  onChange={(e) => setWithdrawAmount(e.target.value)}
                  placeholder="Amount (â‚¦)"
                  className="w-full bg-white/5 border border-white/10 rounded-2xl px-5 py-4 text-white font-bold mb-3 outline-none focus:border-emerald-500/50"
                />
                {withdrawError && <p className="text-red-400 text-xs font-bold mb-3">{withdrawError}</p>}
                <button
                  onClick={submitWithdrawal}
                  disabled={withdrawing}
                  className="w-full py-4 bg-emerald-500 hover:bg-emerald-400 text-charcoal-950 rounded-2xl font-black uppercase tracking-widest transition-all disabled:opacity-50"
                >
                  {withdrawing ? <Loader2 className="animate-spin mx-auto" size={18} /> : 'Request Withdrawal'}
                </button>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}