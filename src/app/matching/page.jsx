"use client";

import { useState, useEffect } from 'react';
import { createClient } from '@/utils/supabase/client';
import { useRouter, useSearchParams } from 'next/navigation';
import { Search, Check, User, ShieldCheck, ChevronRight, Loader2 } from 'lucide-react';

import { Suspense } from 'react';

function MatchingContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const orderId = searchParams.get('orderId');
  const supabase = createClient();

  const [orderData, setOrderData] = useState(null);
  const [bids, setBids] = useState([]);
  const [matchState, setMatchState] = useState('searching'); // 'searching' | 'driver_found' | 'accepted'
  const [selectedBid, setSelectedBid] = useState(null);

  useEffect(() => {
    if (!orderId) return;

    async function fetchOrder() {
      const { data, error } = await supabase
        .from('orders')
        .select('*')
        .eq('id', orderId)
        .single();
      
      if (data) setOrderData(data);
    }

    async function fetchBids() {
      const { data } = await supabase
        .from('bids')
        .select(`
          *,
          drivers:driver_id (full_name)
        `)
        .eq('order_id', orderId)
        .eq('status', 'pending');
      
      if (data && data.length > 0) {
        setBids(data);
        setMatchState('driver_found');
      }
    }

    fetchOrder();
    fetchBids();

    // Subscribe to new bids
    const bidsChannel = supabase.channel(`order-bids-${orderId}`)
      .on('postgres_changes', { 
        event: 'INSERT', 
        schema: 'public', 
        table: 'bids', 
        filter: `order_id=eq.${orderId}` 
      }, async (payload) => {
        // Fetch full bid with profile info
        const { data } = await supabase
          .from('bids')
          .select(`
            *,
            drivers:driver_id (full_name)
          `)
          .eq('id', payload.new.id)
          .single();
          
        if (data) {
          setBids(prev => [...prev, data]);
          setMatchState('driver_found');
        }
      })
      .on('postgres_changes', {
        event: 'UPDATE',
        schema: 'public',
        table: 'bids',
        filter: `order_id=eq.${orderId}`
      }, (payload) => {
        if (payload.new.status === 'accepted') {
          setMatchState('accepted');
        }
      })
      .subscribe();

    return () => {
      supabase.removeChannel(bidsChannel);
    };
  }, [orderId, supabase]);

  const handleAcceptBid = async (bid) => {
    setSelectedBid(bid);
    try {
      // 1. Accept this bid
      const { error: bidErr } = await supabase
        .from('bids')
        .update({ status: 'accepted' })
        .eq('id', bid.id);
      
      if (bidErr) throw bidErr;

      // 2. Reject other bids
      await supabase
        .from('bids')
        .update({ status: 'rejected' })
        .eq('order_id', orderId)
        .neq('id', bid.id);

      // 3. Link driver and set to AWAITING PAYMENT (not accepted yet)
      const { error: orderErr } = await supabase
        .from('orders')
        .update({
          driver_id: bid.driver_id,
          agreed_price: bid.amount,
          status: 'awaiting_payment'
        })
        .eq('id', orderId);

      if (orderErr) throw orderErr;

      setMatchState('accepted');
      // Redirect to payment with the agreed price
      setTimeout(() => {
        router.push(`/payment?orderId=${orderId}`);
      }, 1500);
    } catch (err) {
      console.error("Acceptance failed", err);
      alert("Failed to accept bid. Please try again.");
    }
  };

  const handleCancelOrder = async () => {
    if (!window.confirm("Are you sure you want to cancel this delivery request?")) return;
    
    try {
      await supabase
        .from('orders')
        .update({ status: 'cancelled' })
        .eq('id', orderId);
      
      router.push('/');
    } catch (err) {
      console.error("Cancellation failed", err);
    }
  };


  if (!orderData) return (
    <div className="min-h-screen aura-gradient flex items-center justify-center p-10 font-black tracking-tight text-white italic">
      <div className="flex flex-col items-center gap-4">
        <Loader2 className="animate-spin text-emerald-500" size={40} />
        <p>Initializing Signal...</p>
      </div>
    </div>
  );

  return (
    <main className="aura-gradient min-h-[100dvh] relative overflow-hidden flex flex-col items-center justify-start py-20 px-4">
      {/* Search Radar UI */}
      {matchState === 'searching' && (
        <div className="flex flex-col items-center z-10 text-center mt-20 animate-in fade-in duration-1000">
          <div className="relative mb-20 scale-125">
            {/* Core Radar Pulsing */}
            <div className="w-48 h-48 rounded-full bg-emerald-500/20 border border-emerald-500/40 relative flex items-center justify-center shadow-[0_0_100px_rgba(16,185,129,0.1)]">
               <div className="w-24 h-24 bg-emerald-600 rounded-full flex items-center justify-center shadow-[0_0_60px_rgba(16,185,129,0.5)] z-20">
                  <Search size={36} className="text-white animate-pulse" />
               </div>
               
               {/* Rotating Beam */}
               <div className="absolute inset-0 rounded-full border-t-2 border-emerald-500/60 animate-[spin_3s_linear_infinite]"></div>
               <div className="absolute inset-8 rounded-full border-t border-emerald-400 animate-[spin_5s_linear_infinite_reverse] opacity-30"></div>
               
               {/* Rings */}
               <div className="w-72 h-72 rounded-full border border-emerald-500/10 absolute -inset-12 animate-pulse"></div>
               <div className="w-96 h-96 rounded-full border border-emerald-500/5 absolute -inset-24 animate-ping duration-[4s]"></div>
            </div>
          </div>

          <div className="space-y-6 max-w-sm px-6">
             <h2 className="text-5xl font-black text-white tracking-tighter leading-tight italic">Broadcasting Signal</h2>
             <div className="inline-flex flex-col items-center">
                <p className="text-emerald-400 font-black text-[10px] uppercase tracking-[0.4em] bg-white/5 border border-white/10 px-8 py-3 rounded-full mb-4">
                   Base Estimate: ₦{orderData?.agreed_price?.toLocaleString()}
                </p>
                <p className="text-charcoal-400 font-bold text-xs leading-relaxed max-w-[280px]">
                   Awaiting carrier response. Local units are evaluating your logistics manifest.
                </p>
             </div>
          </div>
        </div>
      )}

      {/* Driver Found UI */}
      {matchState === 'driver_found' && bids.length > 0 && (
        <div className="w-full max-w-lg space-y-6 animate-in slide-in-from-bottom-5 duration-700 z-20 mt-10 px-4">
            <div className="text-center mb-12">
                <div className="w-24 h-24 bg-white shadow-premium rounded-[3rem] flex items-center justify-center mx-auto mb-8 relative overflow-hidden group border border-emerald-100">
                    <div className="absolute inset-0 bg-emerald-500 animate-pulse opacity-10"></div>
                    <Check size={48} className="text-emerald-600 stroke-[3] group-hover:scale-110 transition-transform" />
                </div>
                <h2 className="text-4xl font-black text-white tracking-tighter mb-2 italic">Units Response</h2>
                <div className="h-1.5 w-16 bg-emerald-500 mx-auto rounded-full mb-3"></div>
                <p className="text-charcoal-400 text-[10px] font-black uppercase tracking-[0.25em]">Transmission Locked</p>
            </div>

            <div className="space-y-4 max-h-[55dvh] overflow-y-auto px-1 custom-scrollbar pb-10">
              {bids.map((bid) => (
                <div key={bid.id} className="glass rounded-[2.8rem] p-7 border-emerald-500/10 shadow-premium group transition-all hover:bg-white active:scale-[0.98] border border-white/20">
                  <div className="flex justify-between items-start mb-8">
                      <div className="flex items-center gap-5">
                          <div className="w-16 h-16 bg-emerald-50 rounded-[1.4rem] flex items-center justify-center overflow-hidden border border-emerald-100/50">
                             <User size={36} className="text-emerald-600" />
                          </div>
                          <div>
                              <div className="font-black text-2xl text-charcoal-900 tracking-tighter flex items-center gap-2 italic">
                                  {bid.drivers?.full_name || 'Terminal Unit'} 
                                  <ShieldCheck size={18} className="text-blue-600" />
                              </div>
                              <div className="flex items-center gap-2 mt-1">
                                 <span className="text-[10px] font-black text-emerald-600 uppercase tracking-widest bg-emerald-50 px-3 py-1 rounded-full border border-emerald-100 flex items-center gap-1.5">
                                    <div className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse"></div>
                                    Protocol Verified
                                 </span>
                              </div>
                          </div>
                      </div>
                      <div className="text-right">
                          <div className="text-[9px] font-black text-charcoal-400 uppercase tracking-[0.2em] mb-1">Official Bid</div>
                          <div className="font-black text-3xl text-charcoal-900 tracking-tighter italic">₦{bid.amount?.toLocaleString()}</div>
                      </div>
                  </div>
                  
                  <button 
                    onClick={() => handleAcceptBid(bid)} 
                    className="w-full py-5 rounded-[1.8rem] font-black text-white bg-charcoal-900 hover:bg-black transition-all shadow-premium text-lg active:scale-95 flex items-center justify-center gap-3 overflow-hidden relative group/btn"
                  >
                    <span className="relative z-10 flex items-center gap-3">Accept Unit <ChevronRight size={22} className="group-hover/btn:translate-x-1 transition-transform" /></span>
                    <div className="absolute inset-0 bg-gradient-to-r from-emerald-500/20 to-transparent opacity-0 group-hover/btn:opacity-100 transition-opacity"></div>
                  </button>
                </div>
              ))}
            </div>
        </div>
      )}

      {/* Accepted Feedback UI */}
      {matchState === 'accepted' && (
        <div className="flex flex-col items-center z-10 text-center animate-in zoom-in-95 duration-500 mt-20">
           <div className="w-28 h-28 bg-white shadow-premium text-emerald-600 rounded-[3.5rem] flex items-center justify-center mb-10 rotate-3 border-2 border-emerald-500/20">
               <Check size={56} className="stroke-[4]" />
           </div>
           <h2 className="text-6xl font-black text-white tracking-tighter mb-6 italic">Synchronized</h2>
           <div className="bg-charcoal-900 border border-white/10 rounded-[2.5rem] px-10 py-5 shadow-2xl relative overflow-hidden">
              <div className="absolute inset-0 bg-emerald-500/5 animate-pulse"></div>
              <p className="text-emerald-400 font-black text-[10px] uppercase tracking-[0.5em] relative z-10 animate-pulse">Preparing Protocol Transfer...</p>
           </div>
        </div>
      )}

      {/* Global Cancel Button */}
      {matchState !== 'accepted' && (
        <div className="fixed bottom-12 left-0 right-0 px-10 z-30">
            <button 
                onClick={handleCancelOrder}
                className="w-full py-6 text-[10px] font-black uppercase tracking-[0.6em] text-white/30 hover:text-red-400 transition-all border border-white/5 rounded-[2.5rem] bg-white/5 backdrop-blur-3xl hover:bg-white/10 active:scale-95"
            >
                Terminate Mission
            </button>
        </div>
      )}

      {/* Background Decor */}
      <div className="absolute top-0 right-0 w-[600px] h-[600px] bg-emerald-500/10 rounded-full blur-[140px] -translate-y-1/2 translate-x-1/2 pointer-events-none"></div>
      <div className="absolute bottom-0 left-0 w-[600px] h-[600px] bg-blue-500/10 rounded-full blur-[140px] translate-y-1/2 -translate-x-1/2 pointer-events-none"></div>
    </main>
  );
}

export default function Matching() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-charcoal-900 text-white p-10 font-bold tracking-tight">Loading order details...</div>}>
      <MatchingContent />
    </Suspense>
  );
}
