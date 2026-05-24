"use client";

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/utils/supabase/client';
import { ArrowLeft, MapPin, Package, Navigation, Phone, MessageSquare, CheckCircle2, Loader2, ShieldAlert } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import dynamic from 'next/dynamic';

const MapCanvas = dynamic(() => import('@/components/MapCanvas'), { ssr: false });

import SlideToConfirm from '@/components/driver/SlideToConfirm';

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

      const { data: profile } = await supabase.from('riders').select('id').eq('user_id', user.id).single();
      if (!profile) return;

      const { data, error } = await supabase
        .from('orders')
        .select('*, riders(*)')
        .eq('rider_id', profile.id)
        .in('status', ['assigned', 'picked_up', 'in_transit'])
        .order('updated_at', { ascending: false })
        .limit(1)
        .single();

      if (data) setOrder(data);
      setLoading(false);
    }
    fetchActiveJob();

    const channel = supabase.channel('active-job-updates')
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'orders' }, (payload) => {
        if (order && payload.new.id === order.id) {
          setOrder(prev => ({ ...prev, ...payload.new }));
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

  const isHeadingToPickup = order.status === 'assigned';
  const targetLat = isHeadingToPickup ? order.pickup_lat : order.dropoff_lat;
  const targetLng = isHeadingToPickup ? order.pickup_lng : order.dropoff_lng;
  const targetName = isHeadingToPickup ? order.pickup_name : order.dropoff_name;

  return (
    <div className="space-y-6 pb-24">
      {/* Dynamic Map Header */}
      <div className="h-[35vh] -mx-4 sm:-mx-6 -mt-4 sm:-mt-6 relative overflow-hidden">
        <MapCanvas orders={[order]} zoom={15} center={[targetLng, targetLat]} />
        <div className="absolute top-6 left-6 right-6 flex justify-between items-start pointer-events-none">
          <button onClick={() => router.push('/rider')} className="w-12 h-12 bg-charcoal-950/80 backdrop-blur-md rounded-2xl flex items-center justify-center text-white border border-white/10 pointer-events-auto shadow-2xl">
            <ArrowLeft size={22} />
          </button>
          <div className={`px-4 py-2 rounded-full bg-charcoal-950/80 backdrop-blur-md border border-white/10 text-[10px] font-black uppercase tracking-widest shadow-2xl pointer-events-auto flex items-center gap-2 ${isHeadingToPickup ? 'text-amber-500' : 'text-emerald-500'}`}>
            <div className={`w-1.5 h-1.5 rounded-full animate-pulse ${isHeadingToPickup ? 'bg-amber-500' : 'bg-emerald-500'}`} />
            {order.status === 'in_transit' ? 'Delivering Package' : isHeadingToPickup ? 'Heading to Pickup' : 'Package Picked Up'}
          </div>
        </div>

        {/* Google Maps Intent Button */}
        <div className="absolute bottom-6 left-6 right-6 z-20 pointer-events-auto">
          <a 
            href={`google.navigation:q=${targetLat},${targetLng}&mode=l`}
            className="w-full py-4 bg-blue-600 hover:bg-blue-500 text-white font-black rounded-2xl flex items-center justify-center gap-3 shadow-2xl shadow-blue-600/30 transition-all active:scale-95"
          >
            <Navigation size={20} fill="currentColor" />
            Launch GPS Navigation
          </a>
        </div>
      </div>

      {/* Mission Control Panel */}
      <div className="bg-white/[0.03] border border-white/10 rounded-[2.5rem] p-8 -mt-6 relative z-10 shadow-2xl space-y-8">
        <div className="flex justify-between items-start">
          <div>
            <h1 className="text-2xl font-black text-white italic tracking-tighter font-outfit uppercase">Mission Protocol</h1>
            <p className="text-charcoal-500 text-[10px] font-black tracking-[0.2em] uppercase mt-1 italic">Payload: {order.item_category}</p>
          </div>
        </div>

        {/* Route Details */}
        <div className="space-y-6 relative">
          <div className="absolute left-3 top-3 bottom-3 w-0.5 bg-white/5"></div>
          <div className={`flex items-start gap-5 relative transition-opacity ${!isHeadingToPickup ? 'opacity-30' : 'opacity-100'}`}>
            <div className={`w-6 h-6 rounded-full border-4 border-charcoal-950 shrink-0 z-10 ${isHeadingToPickup ? 'bg-amber-500 shadow-glow' : 'bg-charcoal-800'}`}></div>
            <div>
               <div className="text-[10px] font-black uppercase text-charcoal-600 tracking-widest mb-1">Step 1: Pick up</div>
               <div className="text-lg font-black text-white leading-tight">{order.pickup_name}</div>
            </div>
          </div>
          <div className={`flex items-start gap-5 relative transition-opacity ${isHeadingToPickup ? 'opacity-30' : 'opacity-100'}`}>
            <div className={`w-6 h-6 rounded-lg border-4 border-charcoal-950 shrink-0 z-10 ${!isHeadingToPickup ? 'bg-emerald-500 shadow-glow' : 'bg-charcoal-800'}`}></div>
            <div>
               <div className="text-[10px] font-black uppercase text-charcoal-600 tracking-widest mb-1 italic">Step 2: Deliver to</div>
               <div className="text-lg font-black text-white leading-tight mb-2">{order.dropoff_name}</div>
               <div className="text-sm font-bold text-emerald-500/70">{order.recipient_name} â€¢ {order.recipient_phone}</div>
            </div>
          </div>
        </div>

        {/* Contact Actions */}
        <div className="grid grid-cols-2 gap-4">
           <a href={`tel:${order.vendor_phone || '08000'}`} className="flex flex-col items-center justify-center gap-3 py-6 bg-white/5 border border-white/10 rounded-[2rem] hover:bg-white/10 transition-all active:scale-95">
              <div className="w-12 h-12 bg-charcoal-900 rounded-2xl flex items-center justify-center text-emerald-500 border border-white/5">
                <Phone size={24} />
              </div>
              <span className="text-[10px] font-black uppercase tracking-widest text-charcoal-400">Call Vendor</span>
           </a>
           <a href={`tel:${order.recipient_phone}`} className="flex flex-col items-center justify-center gap-3 py-6 bg-white/5 border border-white/10 rounded-[2rem] hover:bg-white/10 transition-all active:scale-95">
              <div className="w-12 h-12 bg-charcoal-900 rounded-2xl flex items-center justify-center text-blue-500 border border-white/5">
                <MessageSquare size={24} />
              </div>
              <span className="text-[10px] font-black uppercase tracking-widest text-charcoal-400">Call Receiver</span>
           </a>
        </div>

        {/* Progress Action - SLIDE TO CONFIRM */}
        <div className="pt-4">
           {order.status === 'assigned' && (
             <SlideToConfirm 
               text="Slide to confirm Pickup" 
               color="bg-amber-500" 
               onConfirm={() => updateStatus('picked_up')} 
             />
           )}
           {order.status === 'picked_up' && (
             <SlideToConfirm 
               text="Slide to start Transit" 
               color="bg-blue-500" 
               onConfirm={() => updateStatus('in_transit')} 
             />
           )}
           {order.status === 'in_transit' && (
             <SlideToConfirm 
               text="Slide to Mark Delivered" 
               color="bg-emerald-500" 
               onConfirm={() => updateStatus('delivered')} 
             />
           )}
           
           {updating && (
             <div className="mt-4 flex items-center justify-center gap-2 text-emerald-500 text-[10px] font-black uppercase tracking-widest">
               <Loader2 size={14} className="animate-spin" /> Transmitting Protocol Update...
             </div>
           )}
        </div>
      </div>

      <div className="px-8 text-center">
        <p className="text-[10px] font-black uppercase tracking-[0.4em] text-charcoal-700">
          Telemetry Active â€¢ Node: KANO-01
        </p>
      </div>
    </div>
  );
}

