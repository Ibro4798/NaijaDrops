"use client";

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/utils/supabase/client';
import { ArrowLeft, MapPin, Package, Navigation, Phone, MessageSquare, CheckCircle2, Loader2, ShieldAlert } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import dynamic from 'next/dynamic';

const MapCanvas = dynamic(() => import('@/components/MapCanvas'), { ssr: false });

export default function ActiveJobPage() {
  const router = useRouter();
  const supabase = createClient();
  const [order, setOrder] = useState(null);
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState(false);

  useEffect(() => {
    async function fetchActiveJob() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data, error } = await supabase
        .from('orders')
        .select('*')
        .eq('rider_id', user.id)
        .in('status', ['assigned', 'picked_up', 'in_transit'])
        .order('updated_at', { ascending: false })
        .limit(1)
        .single();

      if (data) setOrder(data);
      setLoading(false);
    }
    fetchActiveJob();

    // Real-time listener for this specific order
    const channel = supabase.channel('active-job-updates')
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'orders' }, (payload) => {
        if (order && payload.new.id === order.id) {
          setOrder(payload.new);
        }
      })
      .subscribe();

    return () => supabase.removeChannel(channel);
  }, [supabase, order?.id]);

  const updateStatus = async (nextStatus) => {
    setUpdating(true);
    const { error } = await supabase
      .from('orders')
      .update({ status: nextStatus })
      .eq('id', order.id);
    
    if (!error) {
      if (nextStatus === 'delivered') {
        router.push('/rider/earnings');
      } else {
        setOrder({ ...order, status: nextStatus });
      }
    }
    setUpdating(false);
  };

  if (loading) return <div className="flex justify-center py-20"><Loader2 className="animate-spin text-emerald-500" /></div>;

  if (!order) {
    return (
      <div className="py-20 text-center px-8">
        <div className="w-20 h-20 bg-white/5 rounded-[2rem] flex items-center justify-center mx-auto mb-6 text-charcoal-600">
          <ShieldAlert size={40} />
        </div>
        <h2 className="text-xl font-black text-white mb-2">No Active Mission</h2>
        <p className="text-charcoal-500 text-sm mb-8">You don't have any assigned dispatches at the moment. Return to the radar to find jobs.</p>
        <button onClick={() => router.push('/rider')} className="bg-emerald-500 text-charcoal-950 font-black py-4 px-8 rounded-2xl uppercase text-xs tracking-widest">
          Open Radar
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6 pb-24">
      {/* Dynamic Map Header */}
      <div className="h-[40vh] -mx-4 sm:-mx-6 -mt-4 sm:-mt-6 relative overflow-hidden">
        <MapCanvas orders={[order]} zoom={14} center={[order.pickup_lng, order.pickup_lat]} />
        <div className="absolute top-6 left-6 right-6 flex justify-between items-start pointer-events-none">
          <button onClick={() => router.push('/rider')} className="w-12 h-12 bg-charcoal-950/80 backdrop-blur-md rounded-2xl flex items-center justify-center text-white border border-white/10 pointer-events-auto shadow-2xl">
            <ArrowLeft size={22} />
          </button>
          <div className={`px-4 py-2 rounded-full bg-charcoal-950/80 backdrop-blur-md border border-white/10 text-[10px] font-black uppercase tracking-widest shadow-2xl pointer-events-auto ${order.status === 'in_transit' ? 'text-emerald-500' : 'text-amber-500'}`}>
            {order.status === 'in_transit' ? 'In Transit to Destination' : 'Moving to Pickup'}
          </div>
        </div>
      </div>

      {/* Mission Control Panel */}
      <div className="bg-white/[0.03] border border-white/10 rounded-[2.5rem] p-8 -mt-12 relative z-10 shadow-2xl space-y-8">
        <div className="flex justify-between items-start">
          <div>
            <h1 className="text-2xl font-black text-white italic tracking-tighter font-outfit uppercase">Mission Protocol</h1>
            <p className="text-charcoal-500 text-[10px] font-black tracking-[0.2em] uppercase mt-1">ID: {order.id.slice(0, 8)}</p>
          </div>
          <div className="flex gap-2">
            <a href={`tel:${order.recipient_phone}`} className="w-12 h-12 bg-white/5 rounded-xl flex items-center justify-center text-emerald-500 border border-white/5 hover:bg-white/10 transition-colors">
              <Phone size={20} />
            </a>
            <button className="w-12 h-12 bg-white/5 rounded-xl flex items-center justify-center text-emerald-500 border border-white/5 hover:bg-white/10 transition-colors">
              <MessageSquare size={20} />
            </button>
          </div>
        </div>

        {/* Route Details */}
        <div className="space-y-6 relative">
          <div className="absolute left-3 top-3 bottom-3 w-0.5 bg-white/5"></div>
          <div className="flex items-start gap-5 relative">
            <div className="w-6 h-6 rounded-full bg-emerald-500 border-4 border-charcoal-950 shadow-glow shrink-0 z-10"></div>
            <div>
               <div className="text-[10px] font-black uppercase text-charcoal-600 tracking-widest mb-1">Pick up from</div>
               <div className="text-lg font-black text-white leading-tight">{order.pickup_name}</div>
            </div>
          </div>
          <div className="flex items-start gap-5 relative">
            <div className="w-6 h-6 rounded-lg bg-white border-4 border-charcoal-950 shrink-0 z-10"></div>
            <div>
               <div className="text-[10px] font-black uppercase text-charcoal-600 tracking-widest mb-1 italic">Deliver to</div>
               <div className="text-lg font-black text-white leading-tight mb-2">{order.dropoff_name}</div>
               <div className="text-sm font-bold text-emerald-500/70">{order.recipient_name} • {order.recipient_phone}</div>
            </div>
          </div>
        </div>

        {/* Progress Action */}
        <div className="pt-4">
           {order.status === 'assigned' && (
             <button 
                onClick={() => updateStatus('picked_up')}
                disabled={updating}
                className="w-full py-6 bg-emerald-500 hover:bg-emerald-400 text-charcoal-950 font-black rounded-3xl text-xl italic tracking-tighter flex items-center justify-center gap-3 transition-all active:scale-95 shadow-glow"
             >
                {updating ? <Loader2 className="animate-spin" /> : <>Arrived at Pickup <Package size={24} /></>}
             </button>
           )}
           {order.status === 'picked_up' && (
             <button 
                onClick={() => updateStatus('in_transit')}
                disabled={updating}
                className="w-full py-6 bg-emerald-500 hover:bg-emerald-400 text-charcoal-950 font-black rounded-3xl text-xl italic tracking-tighter flex items-center justify-center gap-3 transition-all active:scale-95 shadow-glow"
             >
                {updating ? <Loader2 className="animate-spin" /> : <>Start Transit <Navigation size={24} /></>}
             </button>
           )}
           {order.status === 'in_transit' && (
             <button 
                onClick={() => updateStatus('delivered')}
                disabled={updating}
                className="w-full py-6 bg-emerald-500 hover:bg-emerald-400 text-charcoal-950 font-black rounded-3xl text-xl italic tracking-tighter flex items-center justify-center gap-3 transition-all active:scale-95 shadow-glow"
             >
                {updating ? <Loader2 className="animate-spin" /> : <>Mark Delivered <CheckCircle2 size={24} /></>}
             </button>
           )}
        </div>
      </div>

      <div className="px-8 text-center">
        <p className="text-[10px] font-black uppercase tracking-[0.4em] text-charcoal-700">
          Telemetry Active • Responding Area: Kano Node
        </p>
      </div>
    </div>
  );
}
