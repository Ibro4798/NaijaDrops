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
  const [vendorUser, setVendorUser] = useState(null);
  const [riderUser, setRiderUser] = useState(null);
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

            // Fetch Vendor (Sender) Profile from unified users table
            const { data: v } = await supabase.from('users').select('*').eq('id', o.vendor_id).maybeSingle();
            setVendorUser(v);

            if (o.rider_id) {
                // Fetch Rider Profile from unified users table
                const { data: r } = await supabase.from('users').select('*').eq('id', o.rider_id).maybeSingle();
                setRiderUser(r);
                
                const { data: loc } = await supabase.from('rider_locations').select('*').eq('rider_id', o.rider_id).order('timestamp', { ascending: false }).limit(1).maybeSingle();
                if (loc) setDriverLoc({ lat: loc.lat, lng: loc.lng });

                locSub = supabase.channel(`admin-loc-new-${o.rider_id}`)
                    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'rider_locations', filter: `rider_id=eq.${o.rider_id}` }, (payload) => {
                        setDriverLoc({ lat: payload.new.lat, lng: payload.new.lng });
                    }).subscribe();
            }
        }
        setLoading(false);
    }
    fetchOrder();

    orderSub = supabase.channel(`admin-order-new-${orderId}`)
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
            Initializing Intelligence Feed / <span className="text-emerald-500">Node God View</span>
        </p>
    </div>
  );

  if (!order) return <div className="p-20 text-center text-red-500 font-black uppercase tracking-widest italic">Payload ID Not Found In Grid</div>;

  return (
    <div className="max-w-[1600px] mx-auto pb-32 px-4 text-white">
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
                        <ShieldAlert size={14} fill="currentColor" /> Live Node Analysis
                    </span>
                </motion.h1>
                <p className="font-mono text-emerald-500/40 text-[11px] mt-1 font-black uppercase tracking-widest">Hash ID: {order.id}</p>
             </div>
          </div>
          <div className="glass-dark px-6 py-3 rounded-full border border-white/5 flex items-center gap-3">
              <div className="w-2 h-2 bg-emerald-500 rounded-full animate-ping"></div>
              <span className="text-[10px] font-black text-white uppercase tracking-[0.3em] font-outfit">Telemetry Synchronization Active</span>
          </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
         <motion.div 
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            className="lg:col-span-3 h-[650px] glass-dark rounded-[4rem] border border-white/5 overflow-hidden relative shadow-premium"
         >
            <div className="absolute top-8 left-8 z-10 space-y-4 max-w-sm pointer-events-none">
                <div className="glass-dark border border-white/10 p-6 rounded-[2.5rem] shadow-premium pointer-events-auto bg-charcoal-900/90 backdrop-blur-xl">
                    <div className="text-[9px] font-black text-emerald-500/60 uppercase tracking-[0.4em] mb-4 flex items-center gap-2">
                        <Zap size={12} fill="currentColor" className="animate-pulse" /> Signal Status
                    </div>
                    <div className="text-3xl font-black text-white capitalize font-outfit italic tracking-tight">{order.status.replace(/_/g, ' ')}</div>
                    
                    <div className="mt-6 flex items-center gap-3">
                        <div className="px-4 py-2 bg-emerald-500 text-charcoal-950 rounded-xl text-[10px] font-black uppercase tracking-widest">
                           { (order.status === 'delivered') ? 'SETTLED' : 'ACTIVE MISSION' }
                        </div>
                    </div>
                </div>

                <div className="glass-dark border border-white/10 p-4 rounded-2xl shadow-premium inline-flex items-center gap-3 pointer-events-auto bg-charcoal-900/90">
                    <Navigation size={14} className="text-emerald-500" />
                    <span className="text-[10px] font-black text-white/60 uppercase tracking-[0.2em] font-mono">
                        {driverLoc ? `${driverLoc.lat.toFixed(5)} , ${driverLoc.lng.toFixed(5)}` : 'SCANNING FREQUENCIES...'}
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
                   Location Sync Missing
                </div>
            )}
         </motion.div>

         <div className="space-y-8 flex flex-col">
            <motion.div 
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="glass-dark border border-white/5 p-8 rounded-[3.5rem] relative overflow-hidden shadow-premium group bg-charcoal-900/40"
            >
                <div className="text-[10px] font-black text-emerald-500 uppercase tracking-[0.4em] mb-8 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                         <ShieldCheck size={16} fill="currentColor" /> Authentication Token
                    </div>
                </div>
                <div className="font-outfit text-7xl font-black tracking-[0.1em] text-white italic">
                    {order.delivery_pin || '----'}
                </div>
                <p className="text-[10px] font-bold text-gray-500 mt-10 leading-relaxed uppercase tracking-widest border-t border-white/5 pt-8 italic">
                    Final hand-off verification code.
                </p>
            </motion.div>

            <motion.div 
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="glass-dark border border-white/5 p-8 rounded-[3rem] shadow-premium bg-charcoal-900/40"
            >
                <div className="text-[9px] font-black text-gray-600 uppercase tracking-[0.4em] mb-2">Settlement Value</div>
                <div className="text-5xl font-black text-emerald-500 font-outfit italic tracking-tighter">₦{order.agreed_price?.toLocaleString() || '0'}</div>
                <div className="flex items-center gap-3 mt-8 pt-8 border-t border-white/5">
                   <div className="flex flex-col text-white">
                      <span className="text-[9px] font-black text-charcoal-600 uppercase tracking-widest">Type</span>
                      <span className="text-xs font-black uppercase tracking-widest mt-1">{order.item_category || 'GENERAL'}</span>
                   </div>
                </div>
            </motion.div>

            <motion.div 
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="glass-dark border border-white/5 p-8 rounded-[3rem] shadow-premium group bg-charcoal-900/40"
            >
                <div className="flex items-center justify-between mb-8">
                   <div className="flex items-center gap-3 text-emerald-500">
                      <User size={20} /> 
                      <span className="font-black text-[10px] uppercase tracking-[0.3em] font-outfit">Sender Node</span>
                   </div>
                </div>
                {vendorUser ? (
                    <div>
                        <div className="font-black text-2xl text-white font-outfit uppercase tracking-tighter italic">{vendorUser.name}</div>
                        <div className="font-mono text-emerald-500 text-xs font-black mt-2 tracking-widest uppercase">{vendorUser.phone || 'NO PHONE'}</div>
                    </div>
                ) : (
                    <div className="py-4 text-emerald-500/20 animate-pulse font-black text-[10px] uppercase tracking-widest">Decrypting Identity...</div>
                )}
            </motion.div>

            <motion.div 
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="glass-dark border border-white/5 p-8 rounded-[3rem] shadow-premium group bg-charcoal-900/40"
            >
                <div className="flex items-center justify-between mb-8">
                   <div className="flex items-center gap-3 text-blue-500">
                      <Truck size={20} /> 
                      <span className="font-black text-[10px] uppercase tracking-[0.3em] font-outfit">Carrier Signal</span>
                   </div>
                </div>
                {riderUser ? (
                    <div>
                        <Link href={`/admin/drivers/${riderUser.id}`} className="font-black text-2xl text-white font-outfit uppercase tracking-tighter italic hover:text-emerald-500 transition-colors block">
                           {riderUser.name}
                        </Link>
                        <div className="font-mono text-blue-400 text-xs font-black mt-2 tracking-widest uppercase">{riderUser.phone || 'NO PHONE'}</div>
                    </div>
                ) : (
                    <div className="py-8 text-center glass-dark rounded-[2rem] border-dashed border-2 border-white/5">
                        <p className="text-white/20 font-black text-[10px] uppercase tracking-[0.3em] italic">
                            {order.status === 'pending' ? 'Awaiting Carrier Lock' : 'Carrier Offline'}
                        </p>
                    </div>
                )}
            </motion.div>
         </div>
      </div>
    </div>
  );
}
