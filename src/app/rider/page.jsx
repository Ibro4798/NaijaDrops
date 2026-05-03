"use client";

import { useState, useEffect } from 'react';
import { createClient } from '@/utils/supabase/client';
import { Truck, Activity, MapPin, Package, ShieldCheck, Zap, Power, Loader2, AlertCircle } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import dynamic from 'next/dynamic';

const MapCanvas = dynamic(() => import('@/components/MapCanvas'), { ssr: false });

import DriverHeartbeat from '@/components/driver/DriverHeartbeat';
import DriverNotifications from '@/components/driver/DriverNotifications';

export default function RiderHome() {
  const supabase = createClient();
  const [isOnline, setIsOnline] = useState(false);
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState(null);

  useEffect(() => {
    async function loadIdentity() {
      const { data: { user } } = await supabase.auth.getUser();
      const { data: profile } = await supabase.from('riders').select('*').eq('user_id', user.id).single();
      setProfile(profile);
      setLoading(false);

      // Operational Status Handling
      if (profile?.operational_status === 'online') setIsOnline(true);
    }
    loadIdentity();
    
    // Listen for PROFILE status changes (e.g., Admin pauses driver)
    const profileChannel = supabase.channel(`profile-${profile?.user_id}`)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'riders', filter: `user_id=eq.${profile?.user_id}` },
        payload => {
          if (payload.new.status === 'paused' || payload.new.status === 'rejected') {
             setIsOnline(false);
             window.location.reload(); // Force trigger layout guards
          }
        })
      .subscribe();

    return () => supabase.removeChannel(profileChannel);
  }, [supabase, profile?.user_id]);

  // Real-time Order Stream
  useEffect(() => {
    if (!isOnline) {
      setOrders([]);
      return;
    }

    const fetchOrders = async () => {
      // Only show pending orders that match driver's vehicle
      const { data } = await supabase.from('orders')
        .select('*')
        .eq('status', 'pending')
        .eq('vehicle_type', profile?.vehicle_type || 'bike');
      setOrders(data || []);
    };
    fetchOrders();

    const channel = supabase.channel('rider-feed')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, (payload) => {
        if (payload.eventType === 'INSERT' && payload.new.status === 'pending') {
          if (payload.new.vehicle_type === profile?.vehicle_type) {
            setOrders(prev => [payload.new, ...prev]);
          }
        } else if (payload.eventType === 'UPDATE') {
          if (payload.new.status !== 'pending') {
            setOrders(prev => prev.filter(o => o.id !== payload.new.id));
          } else {
            setOrders(prev => prev.map(o => o.id === payload.new.id ? payload.new : o));
          }
        }
      })
      .subscribe();

    return () => supabase.removeChannel(channel);
  }, [isOnline, supabase, profile?.vehicle_type]);

  const toggleStatus = async () => {
    const next = !isOnline;
    const { data: { user } } = await supabase.auth.getUser();
    
    await supabase.from('riders').update({ 
      operational_status: next ? 'online' : 'offline',
      last_seen_at: new Date().toISOString()
    }).eq('user_id', user.id);
    
    setIsOnline(next);
  };

  const handleAcceptOrder = async (orderId) => {
    const { data: { user } } = await supabase.auth.getUser();
    await supabase.from('orders').update({
      rider_id: user.id,
      status: 'assigned'
    }).eq('id', orderId);
  };

  if (loading) return <div className="flex justify-center py-20"><Loader2 className="animate-spin text-emerald-500" /></div>;

  return (
    <div className="space-y-6">
      {profile && <DriverHeartbeat riderId={profile.user_id} isOnline={isOnline} />}
      {profile && <DriverNotifications profile={profile} isOnline={isOnline} />}
      {/* Visual Status Header */}
      <div className="bg-white/[0.03] border border-white/10 rounded-[2.5rem] p-8 relative overflow-hidden">
        <div className="flex items-center justify-between relative z-10">
          <div className="flex items-center gap-4">
            <div className="text-right">
              <h2 className="text-3xl font-black text-white tracking-tighter italic font-outfit uppercase">
                {isOnline ? 'Active Radar' : 'Stationed'}
              </h2>
              <div className="flex items-center justify-end gap-1.5 mt-1">
                <div className="flex items-center gap-0.5 text-emerald-500">
                  <Zap size={10} fill="currentColor" />
                  <span className="text-[10px] font-black uppercase tracking-widest">{profile?.rating || '5.0'} Rating</span>
                </div>
                <span className="text-charcoal-700 text-[10px]">•</span>
                <p className="text-charcoal-500 text-[10px] font-black uppercase tracking-widest">
                  {isOnline ? 'Grid Scanning' : 'Disconnected'}
                </p>
              </div>
            </div>
            <button 
              onClick={toggleStatus}
              className={`w-16 h-16 rounded-2xl flex items-center justify-center transition-all active:scale-90 shadow-2xl ${isOnline ? 'bg-emerald-500 text-charcoal-950 shadow-emerald-500/20' : 'bg-charcoal-900 text-charcoal-500 border border-white/5'}`}
            >
              <Power size={32} strokeWidth={3} />
            </button>
          </div>
        </div>
        {isOnline && <div className="absolute bottom-0 left-0 right-0 h-1 bg-emerald-500 animate-pulse"></div>}
      </div>

      <AnimatePresence mode="wait">
        {isOnline ? (
          <motion.div 
            key="radar-active" 
            initial={{ opacity: 0, scale: 0.95 }} 
            animate={{ opacity: 1, scale: 1 }}
            className="space-y-6"
          >
            {/* Live Feed Map Snippet */}
            <div className="h-64 rounded-[2.5rem] border border-white/10 bg-white/[0.02] overflow-hidden relative">
              <MapCanvas orders={orders} />
              <div className="absolute top-4 left-4 z-10 px-3 py-1.5 rounded-full bg-charcoal-950/80 backdrop-blur-md border border-white/10 flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-emerald-500">
                <div className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-ping"></div>
                Grid Scanning Live
              </div>
            </div>

            {/* Jobs list */}
            <div className="space-y-4">
              <h3 className="text-xs font-black text-charcoal-400 uppercase tracking-widest px-2">Proximity Alerts ({orders.length})</h3>
              {orders.length > 0 ? orders.map((order) => (
                <div key={order.id} className="bg-white/[0.03] border border-white/10 p-7 rounded-[2.5rem] hover:bg-emerald-500/[0.02] hover:border-emerald-500/30 transition-all group relative overflow-hidden">
                  <div className="absolute top-0 right-0 p-4 opacity-5">
                    <Truck size={80} />
                  </div>
                  
                  <div className="flex justify-between items-start mb-6">
                    <div className="flex items-center gap-4">
                      <div className="w-14 h-14 bg-charcoal-900 rounded-[1.25rem] flex items-center justify-center text-emerald-500 border border-white/5 shadow-inner">
                        <Package size={28} />
                      </div>
                      <div>
                        <div className="text-[10px] font-black text-charcoal-500 uppercase tracking-widest mb-0.5">Order Payload</div>
                        <div className="text-lg font-black text-white uppercase tracking-tight italic">{order.item_category || 'General'}</div>
                      </div>
                    </div>
                    <div className="text-right">
                       <div className="text-[10px] font-black text-emerald-500 uppercase tracking-widest mb-1">Proposed Fare</div>
                       <div className="text-3xl font-black text-white italic tracking-tighter">₦{order.estimated_price?.toLocaleString()}</div>
                    </div>
                  </div>
                  
                  <div className="grid grid-cols-2 gap-4 mb-6">
                    <div className="bg-charcoal-950/40 p-4 rounded-2xl border border-white/5">
                       <div className="text-[9px] font-black text-charcoal-600 uppercase tracking-[0.2em] mb-2 flex items-center gap-1.5">
                         <MapPin size={10} /> Pickup
                       </div>
                       <div className="text-xs font-bold text-white leading-tight truncate">{order.pickup_name || 'View on Radar'}</div>
                    </div>
                    <div className="bg-charcoal-950/40 p-4 rounded-2xl border border-white/5">
                       <div className="text-[9px] font-black text-charcoal-600 uppercase tracking-[0.2em] mb-2 flex items-center gap-1.5">
                         <Zap size={10} /> Size/Vehicle
                       </div>
                       <div className="text-xs font-bold text-emerald-500 leading-tight uppercase">{order.item_size} • {order.vehicle_type}</div>
                    </div>
                  </div>

                  {/* Enhanced Details Section */}
                  <div className="bg-black/20 rounded-2xl p-5 border border-white/5 mb-6 space-y-4">
                    <div>
                       <div className="text-[9px] font-black text-charcoal-600 uppercase tracking-widest mb-1.5">Manifest Description</div>
                       <p className="text-xs text-charcoal-300 font-medium leading-relaxed italic">"{order.item_description || 'No specific description provided.'}"</p>
                    </div>
                    
                    {order.voice_note_url && (
                      <div className="pt-3 border-t border-white/5">
                        <div className="text-[9px] font-black text-emerald-500/60 uppercase tracking-widest mb-1.5 flex items-center gap-2">
                          <FileText size={10} /> Special Instructions
                        </div>
                        <p className="text-[11px] text-emerald-400/80 font-bold leading-relaxed">{order.voice_note_url}</p>
                      </div>
                    )}
                  </div>

                  <div className="flex gap-3">
                    <button 
                      onClick={() => handleAcceptOrder(order.id)}
                      className="flex-1 py-4.5 bg-emerald-500 hover:bg-emerald-400 text-charcoal-950 font-black rounded-2xl uppercase text-xs tracking-[0.2em] flex items-center justify-center gap-2 transition-all active:scale-95 shadow-glow"
                    >
                      Review & Negotiate
                    </button>
                  </div>
                </div>
              )) : (
                <div className="py-20 text-center opacity-30 flex flex-col items-center">
                  <Activity size={48} className="mb-4 animate-pulse" />
                  <p className="text-[10px] font-black uppercase tracking-[0.4em]">Zero Active Pings</p>
                </div>
              )}
            </div>
          </motion.div>
        ) : (
          <motion.div 
            key="radar-inactive" 
            initial={{ opacity: 0, y: 20 }} 
            animate={{ opacity: 1, y: 0 }}
            className="py-12 bg-white/[0.02] border border-dashed border-white/10 rounded-[3rem] text-center px-8"
          >
            <ShieldCheck className="mx-auto mb-4 text-charcoal-600" size={48} />
            <h3 className="text-xl font-black text-white mb-2 font-outfit">Halt Protocol Active</h3>
            <p className="text-charcoal-500 text-sm font-medium leading-relaxed max-w-xs mx-auto">
              Your location and telemetry are currently hidden from the network. Power up to start receiving dispatch alerts.
            </p>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
