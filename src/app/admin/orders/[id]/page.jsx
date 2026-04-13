"use client";

import { useState, useEffect } from 'react';
import { useRouter, useParams } from 'next/navigation';
import dynamic from 'next/dynamic';
import { createClient } from '@/utils/supabase/client';
import { ArrowLeft, User, Truck, ShieldAlert, Phone, ShieldCheck, MapPin, Package, Clock, Zap, ChevronRight, Navigation } from 'lucide-react';
import Link from 'next/link';
import { motion, AnimatePresence } from 'framer-motion';

const TrackingMap = dynamic(() => import('@/components/TrackingMap'), { 
  ssr: false,
  loading: () => (
    <div className="h-full w-full bg-charcoal-950 flex flex-col items-center justify-center text-white scale-100 animate-pulse">
        <div className="w-12 h-12 border-4 border-emerald-500/10 border-t-emerald-500 rounded-full animate-spin mb-4"></div>
        <p className="text-[10px] font-black uppercase tracking-[0.4em] font-outfit">Calibrating Satellite Feed...</p>
    </div>
  )
});

export default function AdminOrderDetails() {
  const params = useParams();
  const orderId = params?.id;
  const supabase = createClient();
  const router = useRouter();

  const [order, setOrder] = useState(null);
  const [driverLoc, setDriverLoc] = useState(null);
  const [customer, setCustomer] = useState(null);
  const [driver, setDriver] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!orderId) return;

    let orderSub, locSub;

    async function fetchOrder() {
        const { data: o } = await supabase.from('orders').select('*').eq('id', orderId).single();
        if (o) {
            setOrder(o);
            if (o.pickup_lat && o.pickup_lng && !driverLoc) {
                setDriverLoc({ lat: o.pickup_lat, lng: o.pickup_lng });
            }

            if (o.user_id) {
                const { data: c } = await supabase.from('customers').select('*').eq('id', o.user_id).maybeSingle();
                setCustomer(c);
            }

            if (o.driver_id) {
                const { data: d } = await supabase.from('drivers').select('*').eq('id', o.driver_id).maybeSingle();
                setDriver(d);
                
                const { data: loc } = await supabase.from('driver_locations').select('*').eq('driver_id', o.driver_id).single();
                if (loc) setDriverLoc({ lat: loc.lat, lng: loc.lng });

                locSub = supabase.channel(`admin-loc-${o.driver_id}`)
                    .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'driver_locations', filter: `driver_id=eq.${o.driver_id}` }, (payload) => {
                        setDriverLoc({ lat: payload.new.lat, lng: payload.new.lng });
                    }).subscribe();
            }
        }
        setLoading(false);
    }
    fetchOrder();

    orderSub = supabase.channel(`admin-order-${orderId}`)
        .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'orders', filter: `id=eq.${orderId}` }, (payload) => {
            setOrder(payload.new);
        }).subscribe();

    return () => {
        if (orderSub) supabase.removeChannel(orderSub);
        if (locSub) supabase.removeChannel(locSub);
    };
  }, [orderId, supabase]);

  if (loading) return (
    <div className="min-h-[60vh] flex flex-col items-center justify-center">
        <div className="w-16 h-16 border-4 border-emerald-500/10 border-t-emerald-500 rounded-full animate-spin mb-6"></div>
        <p className="text-white font-black text-xs uppercase tracking-[0.4em] font-outfit animate-pulse italic text-center leading-relaxed">
            Initializing Intelligence Feed / <span className="text-emerald-500">Aura God View</span>
        </p>
    </div>
  );

  if (!order) return <div className="p-20 text-center text-red-500 font-black uppercase tracking-widest italic">Payload ID Not Found In Grid</div>;

  return (
    <div className="max-w-[1600px] mx-auto pb-32 px-4">
      {/* Navigation & Breadcrumbs */}
      <div className="mb-12 flex flex-col sm:flex-row items-center justify-between gap-6">
          <div className="flex items-center gap-6">
             <button 
                onClick={() => router.back()} 
                className="w-12 h-12 glass-dark rounded-2xl flex items-center justify-center text-charcoal-400 hover:text-white transition-all border border-white/5 group shadow-premium"
              >
                <ArrowLeft size={20} className="group-hover:-translate-x-1 transition-transform" />
             </button>
             <div>
                <motion.h1 
                    initial={{ x: -20, opacity: 0 }}
                    animate={{ x: 0, opacity: 1 }}
                    className="text-3xl font-black flex items-center gap-4 text-white font-outfit uppercase tracking-tighter italic"
                >
                    Investigation <span className="text-emerald-500">Protocol</span>
                    <span className="bg-red-500 text-white px-4 py-1.5 rounded-full text-[9px] font-black uppercase tracking-[0.2em] flex items-center gap-2 shadow-glow animate-pulse">
                        <ShieldAlert size={14} fill="currentColor" /> God View Active
                    </span>
                </motion.h1>
                <p className="font-mono text-emerald-500/40 text-[11px] mt-1 font-black uppercase tracking-widest">Hash ID: {order.id}</p>
             </div>
          </div>
          <div className="glass-dark px-6 py-3 rounded-full border border-white/5 flex items-center gap-3">
              <div className="w-2 h-2 bg-emerald-500 rounded-full animate-ping"></div>
              <span className="text-[10px] font-black text-white uppercase tracking-[0.3em] font-outfit">Live Synchronization Enabled</span>
          </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
         {/* Live Map Investigation - 3 Columns wide on large screens */}
         <motion.div 
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            className="lg:col-span-3 h-[650px] glass-dark rounded-[4rem] border border-white/5 overflow-hidden relative shadow-premium"
         >
            {/* Live Data Overlays on Map */}
            <div className="absolute top-8 left-8 z-10 space-y-4 max-w-sm pointer-events-none">
                <div className="glass-dark border border-white/10 p-6 rounded-[2.5rem] shadow-premium pointer-events-auto">
                    <div className="text-[9px] font-black text-emerald-500/60 uppercase tracking-[0.4em] mb-4 flex items-center gap-2">
                        <Zap size={12} fill="currentColor" className="animate-pulse" /> Live Status Feed
                    </div>
                    <div className="text-3xl font-black text-white capitalize font-outfit italic tracking-tight">{order.status.replace(/_/g, ' ')}</div>
                    
                    <div className="mt-6 flex items-center gap-3">
                        <div className="px-4 py-2 bg-emerald-500 text-charcoal-950 rounded-xl text-[10px] font-black uppercase tracking-widest">
                           { (order.status === 'delivered') ? 'COMPLETED' : 'IN PROGRESS' }
                        </div>
                        <div className="px-4 py-2 glass border border-white/20 text-white rounded-xl text-[10px] font-black uppercase tracking-widest">
                           { order.distance_km || '---' } KM REMAINING
                        </div>
                    </div>

                    {order.status === 'delivered' && order.delivery_photo_url && (
                        <div className="mt-6 group relative">
                            <div className="absolute inset-0 bg-emerald-500/20 rounded-2xl animate-pulse blur-lg"></div>
                            <img src={order.delivery_photo_url} className="relative z-10 w-full h-40 object-cover rounded-2xl border border-white/20 shadow-premium group-hover:scale-105 transition-transform duration-700" alt="Delivery Proof" />
                            <div className="absolute top-3 right-3 z-20 bg-emerald-500/90 text-charcoal-950 p-2 rounded-xl">
                                <ShieldCheck size={18} />
                            </div>
                        </div>
                    )}
                </div>

                <div className="glass-dark border border-white/10 p-4 rounded-2xl shadow-premium inline-flex items-center gap-3 pointer-events-auto">
                    <Navigation size={14} className="text-emerald-500" />
                    <span className="text-[10px] font-black text-white/60 uppercase tracking-[0.2em] font-mono">
                        {driverLoc ? `${driverLoc.lat.toFixed(5)} , ${driverLoc.lng.toFixed(5)}` : 'SCANNING FOR POSITION...'}
                    </span>
                </div>
            </div>
            
            {(driverLoc && order.dropoff_lat) ? (
                <TrackingMap 
                    driverLocation={driverLoc} 
                    dropoffLocation={{lat: order.dropoff_lat, lng: order.dropoff_lng}} 
                />
            ) : (
                <div className="flex flex-col items-center justify-center h-full text-emerald-500/10 font-black border-4 border-dashed border-white/5 m-12 rounded-[3.5rem] uppercase tracking-[0.5em] italic">
                   <Package size={80} className="mb-6 opacity-5" />
                   Satellite Lock Missing
                </div>
            )}

            {/* Map Interaction Hint */}
            <div className="absolute bottom-8 right-8 z-10 glass-dark border border-white/10 px-6 py-2 rounded-full text-[9px] font-black text-white/40 uppercase tracking-[0.3em]">
                Drag To Inspect Terrain
            </div>
         </motion.div>

         {/* Admin Side Investigation Panel */}
         <div className="space-y-8 flex flex-col">
            {/* Delivery Secure PIN - The Terminal Element */}
            <motion.div 
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              className="glass-dark border border-white/5 p-8 rounded-[3.5rem] relative overflow-hidden shadow-premium group"
            >
                <div className="absolute top-0 right-0 w-32 h-32 bg-red-500/10 rounded-full blur-[60px] -mr-16 -mt-16 group-hover:bg-red-500/20 transition-all duration-1000 pointer-events-none"></div>
                
                <div className="text-[10px] font-black text-red-500 uppercase tracking-[0.4em] mb-8 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                         <ShieldCheck size={16} fill="currentColor" /> Secure Vault Key
                    </div>
                </div>
                
                <div className="font-outfit text-7xl font-black tracking-[0.1em] text-white italic drop-shadow-[0_0_15px_rgba(255,255,255,0.2)]">
                    {order.delivery_pin || '----'}
                </div>
                
                <p className="text-[10px] font-bold text-gray-500 mt-10 leading-relaxed uppercase tracking-widest border-t border-white/5 pt-8">
                    Confidential decryption token. <span className="text-red-500">Unauthorized disclosure</span> will compromise operative safety and payload integrity.
                </p>
            </motion.div>

            {/* Financial Metadata */}
            <motion.div 
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.1 }}
              className="glass-dark border border-white/5 p-8 rounded-[3rem] shadow-premium relative overflow-hidden"
            >
                <div className="absolute bottom-0 left-0 w-24 h-24 bg-emerald-500/5 rounded-full blur-2xl -ml-12 -mb-12"></div>
                <div className="text-[9px] font-black text-gray-600 uppercase tracking-[0.4em] mb-2">Agreed Market Value</div>
                <div className="text-5xl font-black text-emerald-500 font-outfit italic tracking-tighter">₦{order.agreed_price?.toLocaleString() || '0'}</div>
                <div className="flex items-center gap-3 mt-8 pt-8 border-t border-white/5">
                   <div className="flex flex-col">
                      <span className="text-[9px] font-black text-charcoal-600 uppercase tracking-widest">Weight / Size</span>
                      <span className="text-xs font-black text-white uppercase tracking-widest mt-1">{order.item_size || 'MEDIUM'}</span>
                   </div>
                   <div className="h-8 border-r border-white/5 mx-2"></div>
                   <div className="flex flex-col">
                      <span className="text-[9px] font-black text-charcoal-600 uppercase tracking-widest">Class</span>
                      <span className="text-xs font-black text-white uppercase tracking-widest mt-1">{order.item_category || 'PARCEL'}</span>
                   </div>
                </div>
            </motion.div>

            {/* Customer Information (Party A) */}
            <motion.div 
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.2 }}
              className="glass-dark border border-white/5 p-8 rounded-[3rem] shadow-premium group"
            >
                <div className="flex items-center justify-between mb-8">
                   <div className="flex items-center gap-3 text-emerald-500">
                      <User size={20} className="group-hover:scale-110 transition-transform" /> 
                      <span className="font-black text-[10px] uppercase tracking-[0.3em] font-outfit">Source Party</span>
                   </div>
                   <div className="h-px bg-white/5 flex-1 mx-4"></div>
                   <Zap size={14} className="text-emerald-500/20" />
                </div>
                {customer ? (
                    <div>
                        <div className="font-black text-2xl text-white font-outfit uppercase tracking-tighter italic">{customer.full_name}</div>
                        <div className="font-mono text-emerald-500 text-xs font-black mt-2 tracking-widest uppercase">{customer.phone}</div>
                        <div className="mt-8 p-6 bg-charcoal-950/80 border border-white/5 rounded-[2rem] text-white/50 text-[11px] font-bold leading-relaxed shadow-inner">
                            <span className="font-black text-emerald-500 block mb-2 text-[10px] uppercase tracking-widest">Extraction Point:</span>
                            {order.pickup_name}
                        </div>
                    </div>
                ) : (
                    <div className="py-4 text-emerald-500/20 animate-pulse font-black text-[10px] uppercase tracking-widest">Decrypting Personal Data...</div>
                )}
            </motion.div>

            {/* Driver Information (Party B) */}
            <motion.div 
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.3 }}
              className="glass-dark border border-white/5 p-8 rounded-[3rem] shadow-premium group"
            >
                <div className="flex items-center justify-between mb-8">
                   <div className="flex items-center gap-3 text-blue-500">
                      <Truck size={20} className="group-hover:scale-110 transition-transform" /> 
                      <span className="font-black text-[10px] uppercase tracking-[0.3em] font-outfit">Logistics Operative</span>
                   </div>
                   <div className="h-px bg-white/5 flex-1 mx-4"></div>
                </div>
                {driver ? (
                    <div>
                        <Link href={`/admin/drivers/${driver.id}`} className="flex items-center justify-between group/link">
                           <div className="font-black text-2xl text-white font-outfit uppercase tracking-tighter italic group-hover/link:text-emerald-500 transition-colors">{driver.full_name}</div>
                           <ChevronRight size={20} className="text-white/20 group-hover/link:translate-x-1 group-hover/link:text-emerald-500 transition-all" />
                        </Link>
                        <div className="font-mono text-blue-400 text-xs font-black mt-2 tracking-widest uppercase">{driver.phone}</div>
                        
                        {driverLoc && (
                            <div className="flex items-center gap-3 text-[10px] bg-charcoal-950/80 px-6 py-3 rounded-2xl text-white/30 font-mono mt-6 border border-white/5">
                                <MapPin size={12} className="text-blue-500" /> {driverLoc.lat.toFixed(5)}, {driverLoc.lng.toFixed(5)}
                            </div>
                        )}
                    </div>
                ) : (
                    <div className="py-8 text-center glass-dark rounded-[2rem] border-dashed border-2 border-white/5">
                        <p className="text-white/20 font-black text-[10px] uppercase tracking-[0.3em] italic">
                            {order.status === 'looking_for_driver' ? 'Scanning for available unit...' : 'No operative assigned.'}
                        </p>
                    </div>
                )}
            </motion.div>
         </div>
      </div>
    </div>
  );
}
