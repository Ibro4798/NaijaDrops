"use client";

import { useState, useEffect } from 'react';
import { createClient } from '@/utils/supabase/client';
import { useRouter, useSearchParams } from 'next/navigation';
import { Search, Check, User, ShieldCheck } from 'lucide-react';

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
      // Driver is NOT activated until customer pays
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


  if (!orderData) return <div className="min-h-screen bg-charcoal-900 text-white p-10 font-bold">Initializing...</div>;

  return (
    <main className="bg-charcoal-900 min-h-screen relative overflow-hidden flex flex-col items-center justify-center p-4">
      {/* Search Radar UI */}
      {matchState === 'searching' && (
        <div className="flex flex-col items-center z-10 text-center">
          <div className="relative mb-8">
            <div className="w-24 h-24 rounded-full bg-emerald-500 flex items-center justify-center absolute inset-0 m-auto z-10">
               <Search size={40} className="text-charcoal-900 animate-pulse" />
            </div>
            {/* Radar Ripples */}
            <div className="w-24 h-24 rounded-full border border-emerald-500/50 absolute inset-0 m-auto animate-ping duration-1000"></div>
            <div className="w-48 h-48 rounded-full border border-emerald-500/30 absolute -inset-12 m-auto animate-ping delay-300 duration-1000"></div>
            <div className="w-72 h-72 rounded-full border border-emerald-500/10 absolute -inset-24 m-auto animate-ping delay-700 duration-1000"></div>
          </div>
          <h2 className="text-3xl font-black text-white mb-2 tracking-tight animate-pulse">Contacting Drivers</h2>
          <p className="text-emerald-400 font-bold text-sm uppercase tracking-widest bg-emerald-500/10 px-4 py-2 rounded-full border border-emerald-500/20">
            Bid: ₦{orderData?.agreed_price}
          </p>
        </div>
      )}

      {/* Driver Found UI - Now shows a list of bids if multiple */}
      {matchState === 'driver_found' && bids.length > 0 && (
        <div className="w-full max-w-sm space-y-4 animate-slide-up z-20">
            <div className="text-center mb-6">
                <div className="w-16 h-16 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center mx-auto mb-3 border-4 border-white shadow-lg relative z-10">
                    <Check size={32} className="stroke-[3]" />
                </div>
                <h2 className="text-xl font-black text-white tracking-tight">Drivers responding!</h2>
                <p className="text-gray-400 text-sm font-medium">Select a driver below.</p>
            </div>

            {bids.map((bid) => (
              <div key={bid.id} className="bg-white rounded-[2rem] p-5 shadow-2xl">
                <div className="flex justify-between items-start mb-4">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-emerald-100 rounded-full flex items-center justify-center overflow-hidden">
                           <User size={24} className="text-emerald-600" />
                        </div>
                        <div>
                            <div className="font-bold text-charcoal-900 flex items-center gap-1">
                                {bid.drivers?.full_name || 'Driver'} 
                                <ShieldCheck size={14} className="text-blue-500" />
                            </div>
                            <div className="text-xs text-charcoal-500 font-medium">★ 4.9 • Verified</div>
                        </div>
                    </div>
                    <div className="text-right">
                        <div className="font-black text-xl text-emerald-600">₦{bid.amount}</div>
                    </div>
                </div>
                
                <div className="flex gap-2">
                   <button 
                    onClick={() => handleAcceptBid(bid)} 
                    className="w-full py-3 rounded-xl font-black text-white bg-charcoal-900 hover:bg-black transition-colors shadow-lg shadow-black/20 text-lg"
                   >
                     Accept ₦{bid.amount}
                   </button>
                </div>
              </div>
            ))}
        </div>
      )}


      {/* Accepted Feedback UI */}
      {matchState === 'accepted' && (
        <div className="flex flex-col items-center z-10 text-center animate-pulse">
           <div className="w-20 h-20 bg-emerald-500 text-charcoal-900 rounded-full flex items-center justify-center mb-4">
               <Check size={40} className="stroke-[3]" />
           </div>
           <h2 className="text-2xl font-black text-white tracking-tight">Driver Confirmed</h2>
           <p className="text-gray-400 font-medium">Preparing your invoice...</p>
        </div>
      )}

      {/* Global Cancel Button */}
      {matchState !== 'accepted' && (
        <div className="absolute bottom-10 left-0 right-0 px-8 z-30">
            <button 
                onClick={handleCancelOrder}
                className="w-full py-4 text-sm font-black uppercase tracking-widest text-red-400 hover:text-red-500 transition-colors border border-red-500/30 rounded-2xl bg-charcoal-900/50 backdrop-blur-md"
            >
                Cancel My Request
            </button>
        </div>
      )}

      <div className="absolute top-0 left-0 w-full h-full pointer-events-none opacity-20 bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-gray-700 via-charcoal-900 to-black z-0"></div>
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
