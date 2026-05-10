"use client";

import { useState, useEffect } from 'react';
import { createClient } from '@/utils/supabase/client';
import { Truck, Activity, MapPin, Package, ShieldCheck, Zap, Power, Loader2, AlertCircle, X, MessageCircle, FileText } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import dynamic from 'next/dynamic';

const MapCanvas = dynamic(() => import('@/components/MapCanvas'), { ssr: false });

import DriverHeartbeat from '@/components/driver/DriverHeartbeat';
import DriverNotifications from '@/components/driver/DriverNotifications';

// ─── Job Detail Modal ───────────────────────────────────────────────────────
function JobDetailModal({ order, onClose, onAccept, onBid, loading }) {
  const [bidAmount, setBidAmount] = useState(order.estimated_price || 0);
  const [isNegotiating, setIsNegotiating] = useState(false);

  return (
    <div className="fixed inset-0 z-[110] bg-black/90 backdrop-blur-xl flex items-end sm:items-center justify-center p-0 sm:p-4">
      <motion.div 
        initial={{ y: 100, opacity: 0 }} 
        animate={{ y: 0, opacity: 1 }}
        className="w-full max-w-lg bg-charcoal-950 border-t sm:border border-white/10 rounded-t-[3rem] sm:rounded-[3rem] overflow-hidden flex flex-col max-h-[90vh]"
      >
        {/* Header */}
        <div className="p-8 border-b border-white/5 flex items-center justify-between">
           <div>
              <h2 className="text-2xl font-black text-white italic tracking-tighter uppercase font-outfit">Manifest Details</h2>
              <p className="text-[10px] font-black text-charcoal-500 uppercase tracking-widest mt-1">Order ID: {order.id.slice(0, 8)}</p>
           </div>
           <button onClick={onClose} className="w-12 h-12 glass-dark rounded-2xl flex items-center justify-center text-charcoal-400">
              <X size={20} />
           </button>
        </div>

        <div className="flex-1 overflow-y-auto p-8 space-y-8">
           {/* Manifest Section */}
           <div className="space-y-6">
              <div className="flex items-start gap-4">
                <div className="w-10 h-10 bg-emerald-500/10 rounded-xl flex items-center justify-center text-emerald-500 shrink-0 border border-emerald-500/20">
                  <MapPin size={20} />
                </div>
                <div>
                   <div className="text-[9px] font-black text-charcoal-600 uppercase tracking-widest mb-1">Pickup From</div>
                   <div className="text-white font-bold leading-tight">{order.pickup_name}</div>
                </div>
              </div>

              <div className="flex items-start gap-4">
                <div className="w-10 h-10 bg-white/5 rounded-xl flex items-center justify-center text-white shrink-0 border border-white/10">
                  <Package size={20} />
                </div>
                <div>
                   <div className="text-[9px] font-black text-charcoal-600 uppercase tracking-widest mb-1 italic">Payload Manifest</div>
                   <div className="text-white font-bold mb-1 uppercase text-sm">{order.item_category} • {order.item_size}</div>
                   <p className="text-xs text-charcoal-400 leading-relaxed italic">"{order.item_description || 'No description provided.'}"</p>
                </div>
              </div>

              {order.voice_note_url && (
                <div className="bg-emerald-500/5 border border-emerald-500/10 rounded-2xl p-5">
                   <div className="flex items-center gap-2 text-emerald-500 font-black text-[10px] uppercase tracking-widest mb-2">
                      <FileText size={12} /> Special Handling Notes
                   </div>
                   <p className="text-xs text-emerald-400/80 font-bold leading-relaxed">{order.voice_note_url}</p>
                </div>
              )}
           </div>

           {/* Pricing Section */}
           {!isNegotiating ? (
             <div className="bg-charcoal-900 rounded-[2rem] p-6 border border-white/5 flex items-center justify-between">
                <div>
                  <div className="text-[10px] font-black text-charcoal-500 uppercase tracking-widest mb-1">Proposed Fare</div>
                  <div className="text-3xl font-black text-white italic tracking-tighter">₦{order.estimated_price?.toLocaleString()}</div>
                </div>
                <button 
                  onClick={() => setIsNegotiating(true)}
                  className="text-emerald-500 font-black text-[10px] uppercase tracking-widest border border-emerald-500/30 px-4 py-2 rounded-xl hover:bg-emerald-500/10 transition-all"
                >
                  Counter Offer
                </button>
             </div>
           ) : (
             <div className="bg-emerald-500/10 rounded-[2rem] p-6 border border-emerald-500/20 space-y-4">
                <div className="flex justify-between items-end">
                   <div>
                      <div className="text-[10px] font-black text-emerald-500 uppercase tracking-widest mb-2">Your Counter Offer</div>
                      <div className="relative">
                        <span className="absolute left-0 bottom-1.5 text-2xl font-black text-white">₦</span>
                        <input 
                          type="number"
                          value={bidAmount}
                          onChange={(e) => setBidAmount(parseInt(e.target.value) || 0)}
                          className="bg-transparent border-b-2 border-emerald-500/30 focus:border-emerald-500 text-3xl font-black text-white w-full pl-8 pb-1 focus:outline-none transition-all"
                        />
                      </div>
                   </div>
                   <button onClick={() => setIsNegotiating(false)} className="text-charcoal-600 text-[10px] font-black uppercase mb-2">Cancel</button>
                </div>
                <p className="text-[10px] text-emerald-500/60 font-bold uppercase tracking-widest italic">Note: High bids may decrease match probability.</p>
             </div>
           )}
        </div>

        {/* CTA */}
        <div className="p-8 bg-charcoal-900/50 border-t border-white/5">
           {!isNegotiating ? (
             <button 
               onClick={() => onAccept(order.id, order.estimated_price)}
               disabled={loading}
               className="w-full py-5 bg-emerald-500 hover:bg-emerald-400 text-charcoal-950 font-black rounded-2xl uppercase tracking-[0.2em] text-xs flex items-center justify-center gap-2 shadow-glow disabled:opacity-50"
             >
               {loading ? <Loader2 className="animate-spin" /> : <>Accept Proposed Fare <Zap size={16} fill="currentColor" /></>}
             </button>
           ) : (
             <button 
               onClick={() => onBid(order.id, bidAmount)}
               disabled={loading || bidAmount <= 0}
               className="w-full py-5 bg-white hover:bg-emerald-400 hover:text-charcoal-950 text-charcoal-950 font-black rounded-2xl uppercase tracking-[0.2em] text-xs flex items-center justify-center gap-2 shadow-premium disabled:opacity-50"
             >
               {loading ? <Loader2 className="animate-spin" /> : <>Submit Counter Offer <MessageCircle size={16} /></>}
             </button>
           )}
        </div>
      </motion.div>
    </div>
  );
}

// ─── Main Rider Dashboard ────────────────────────────────────────────────────
export default function RiderHome() {
  const supabase = createClient();
  const [isOnline, setIsOnline] = useState(false);
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState(null);
  const [selectedOrder, setSelectedOrder] = useState(null);
  const [actionLoading, setActionLoading] = useState(false);

  useEffect(() => {
    async function loadIdentity() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data: profile } = await supabase.from('riders').select('*').eq('user_id', user.id).single();
      setProfile(profile);
      setLoading(false);

      if (profile?.operational_status === 'online') setIsOnline(true);
    }
    loadIdentity();
    
    const profileChannel = supabase.channel(`profile-${profile?.user_id}`)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'riders', filter: `user_id=eq.${profile?.user_id}` },
        payload => {
          if (payload.new.status === 'paused' || payload.new.status === 'rejected') {
             setIsOnline(false);
             window.location.reload(); 
          }
        })
      .subscribe();

    return () => supabase.removeChannel(profileChannel);
  }, [supabase, profile?.user_id]);

  useEffect(() => {
    if (!isOnline) {
      setOrders([]);
      return;
    }

    const fetchOrders = async () => {
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

  const handleAcceptOrder = async (orderId, price) => {
    setActionLoading(true);
    // 1. Get Rider Profile ID
    const { data: { user } } = await supabase.auth.getUser();
    const { data: riderProfile } = await supabase.from('riders').select('id, status').eq('user_id', user.id).single();
    
    if (riderProfile.status !== 'approved') {
       alert("You are in View-Only mode. Please wait until your profile is verified to accept jobs.");
       setActionLoading(false);
       return;
    }

    // 2. Accept Order using correct Rider UUID
    const { error } = await supabase.from('orders').update({
      rider_id: riderProfile.id,
      agreed_price: price,
      status: 'assigned'
    }).eq('id', orderId);

    if (!error) {
       setSelectedOrder(null);
       window.location.href = '/rider/active-job'; // Direct navigation
    }
    setActionLoading(false);
  };

  const handleSendBid = async (orderId, amount) => {
    setActionLoading(true);
    const { data: { user } } = await supabase.auth.getUser();
    
    if (profile?.status !== 'approved') {
       alert("You are in View-Only mode. Please wait until your profile is verified to submit counter offers.");
       setActionLoading(false);
       return;
    }

    // Insert into bids table
    const { error } = await supabase.from('bids').insert({
      order_id: orderId,
      rider_id: user.id,
      amount: amount,
      status: 'pending'
    });

    if (!error) {
       setSelectedOrder(null);
       alert("Bid Submitted! Waiting for customer to review.");
    }
    setActionLoading(false);
  };

  if (loading) return <div className="flex justify-center py-20"><Loader2 className="animate-spin text-emerald-500" /></div>;

  return (
    <div className="space-y-6">
      {profile && <DriverHeartbeat riderId={profile.user_id} isOnline={isOnline} />}
      {profile && <DriverNotifications profile={profile} isOnline={isOnline} />}

      {/* Detail Modal */}
      <AnimatePresence>
        {selectedOrder && (
          <JobDetailModal 
            order={selectedOrder} 
            loading={actionLoading}
            onClose={() => setSelectedOrder(null)}
            onAccept={handleAcceptOrder}
            onBid={handleSendBid}
          />
        )}
      </AnimatePresence>

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

                  <div className="flex gap-3">
                    <button 
                      onClick={() => {
                        if (profile?.status !== 'approved') {
                          alert("Account Unverified: You can view jobs, but cannot interact until verified by Ops.");
                          return;
                        }
                        setSelectedOrder(order);
                      }}
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
