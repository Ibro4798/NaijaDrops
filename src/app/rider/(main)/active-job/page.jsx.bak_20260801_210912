"use client";

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/utils/supabase/client';
import { ArrowLeft, MapPin, Package, Navigation, Phone, MessageSquare, CheckCircle2, Loader2, ShieldAlert, MessageCircle, Play, Camera, X } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import dynamic from 'next/dynamic';

const MapCanvas = dynamic(() => import('@/components/MapCanvas'), { ssr: false });

import SlideToConfirm from '@/components/rider/SlideToConfirm';
import DriverHeartbeat from '@/components/rider/DriverHeartbeat';
import OrderChat from '@/components/OrderChat';

function NoteCard({ note, voiceUrl }) {
  if (!note && !voiceUrl) return null;
  return (
    <div className="mt-3 bg-charcoal-900/60 border border-white/10 rounded-2xl p-4">
      <div className="text-[9px] font-black uppercase tracking-widest text-charcoal-500 mb-2">Note from vendor</div>
      {note && <p className="text-ink text-sm leading-snug mb-2">{note}</p>}
      {voiceUrl && (
        <button onClick={() => { const a = new Audio(voiceUrl); a.play(); }} className="flex items-center gap-2 px-3 py-2 bg-emerald-500/10 text-emerald-400 rounded-xl text-xs font-black uppercase tracking-widest hover:bg-emerald-500/20 transition-colors">
          <Play size={12} fill="currentColor" /> Play voice note
        </button>
      )}
    </div>
  );
}

export default function ActiveJobPage() {
  const router = useRouter();
  const supabase = createClient();
  const [order, setOrder] = useState(null);
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState(false);
  const [riderId, setRiderId] = useState(null);
  const [currentUserId, setCurrentUserId] = useState(null);
  const [showChat, setShowChat] = useState(false);
  const [deliveryPhotoUrl, setDeliveryPhotoUrl] = useState(null);
  const [uploadingDeliveryPhoto, setUploadingDeliveryPhoto] = useState(false);
  const deliveryPhotoInputRef = useRef(null);

  useEffect(() => {
    async function fetchActiveJob() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      setCurrentUserId(user.id);

      const { data: profile } = await supabase.from('riders').select('id').eq('user_id', user.id).single();
      if (!profile) return;
      setRiderId(profile.id);

      const { data, error } = await supabase
        .from('orders')
        .select('*, riders(*)')
        .eq('rider_id', profile.id)
        .in('status', ['matched', 'picked_up', 'in_transit'])
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
      .update({ status: nextStatus, delivery_photo_url: deliveryPhotoUrl || undefined })
      .eq('id', order.id);
    
    if (!error) {
      if (nextStatus === 'delivered') {
        // FIX: router.push() left this active-job page in browser history,
        // so pressing back afterward returned here showing the order still
        // in its pre-delivery state (looked like the delivery "undid"
        // itself). router.replace() swaps this entry out instead, so back
        // skips straight past it.
        router.replace('/rider/earnings');
      } else {
        setOrder({ ...order, status: nextStatus });
      }
    }
    setUpdating(false);
  };

  // Optional but encouraged proof-of-delivery photo, taken right before the
  // final "Mark Delivered" slide. Cheap insurance for a "no one home" or
  // "wrong item" dispute later - same pattern as the package photo, so it
  // doesn't feel like a new mechanic to learn.
  async function handleDeliveryPhotoSelect(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingDeliveryPhoto(true);
    try {
      const fileName = `delivery_${order.id}_${Date.now()}.jpg`;
      const { data, error } = await supabase.storage.from('delivery-photos').upload(fileName, file, { contentType: file.type || 'image/jpeg' });
      if (!error && data) {
        const { data: publicUrlData } = supabase.storage.from('delivery-photos').getPublicUrl(fileName);
        setDeliveryPhotoUrl(publicUrlData.publicUrl);
      } else {
        alert("Couldn't upload the photo. You can still mark this delivered without one.");
      }
    } finally {
      setUploadingDeliveryPhoto(false);
    }
  }

  if (loading) return <div className="flex justify-center py-20"><Loader2 className="animate-spin text-emerald-500" /></div>;

  if (!order) {
    return (
      <div className="py-20 text-center px-8">
        <div className="w-20 h-20 bg-white/5 rounded-[2rem] flex items-center justify-center mx-auto mb-6 text-charcoal-600">
          <ShieldAlert size={40} />
        </div>
        <h2 className="text-xl font-black text-ink mb-2">No Active Delivery</h2>
        <p className="text-charcoal-500 text-sm mb-8">You don't have any assigned deliveries right now. Go back online to find jobs nearby.</p>
        <button onClick={() => router.push('/rider')} className="bg-emerald-500 text-charcoal-950 font-black py-4 px-8 rounded-2xl uppercase text-xs tracking-widest">
          Find Jobs
        </button>
      </div>
    );
  }

  const isHeadingToPickup = order.status === 'matched';
  const targetLat = isHeadingToPickup ? order.pickup_lat : order.dropoff_lat;
  const targetLng = isHeadingToPickup ? order.pickup_lng : order.dropoff_lng;
  const targetName = isHeadingToPickup ? order.pickup_name : order.dropoff_name;

  return (
    <div className="space-y-6 pb-24">
      {/* Headless: continuous location pinging (~35s) for the entire duration of this
          delivery, regardless of the rider's general online/offline toggle. This is
          what makes the vendor/customer tracking map actually move instead of showing
          a single frozen point from whenever the rider last went online. */}
      {riderId && <DriverHeartbeat riderId={riderId} isOnline={true} />}

      {/* Dynamic Map Header */}
      <div className="h-[35vh] -mx-4 sm:-mx-6 -mt-4 sm:-mt-6 relative overflow-hidden">
        <MapCanvas orders={[order]} zoom={15} center={[targetLng, targetLat]} />
        <div className="absolute top-6 left-6 right-6 flex justify-between items-start pointer-events-none">
          <button onClick={() => router.push('/rider')} className="w-12 h-12 bg-charcoal-950/80 backdrop-blur-md rounded-2xl flex items-center justify-center text-ink border border-white/10 pointer-events-auto shadow-2xl">
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
            className="w-full py-4 bg-blue-600 hover:bg-blue-500 text-ink font-black rounded-2xl flex items-center justify-center gap-3 shadow-2xl shadow-blue-600/30 transition-all active:scale-95"
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
            <h1 className="text-2xl font-black text-ink italic tracking-tighter font-outfit uppercase">Mission Protocol</h1>
            <p className="text-charcoal-500 text-[10px] font-black tracking-[0.2em] uppercase mt-1 italic">Payload: {order.item_category}</p>
          </div>
          <button
            onClick={() => setShowChat(true)}
            className="w-12 h-12 bg-emerald-500/10 border border-emerald-500/20 rounded-2xl flex items-center justify-center text-emerald-500 hover:bg-emerald-500/20 transition-all active:scale-95 shrink-0"
            title="Message vendor"
          >
            <MessageCircle size={20} />
          </button>
        </div>

        {/* Route Details */}
        <div className="space-y-6 relative">
          <div className="absolute left-3 top-3 bottom-3 w-0.5 bg-white/5"></div>
          <div className={`flex items-start gap-5 relative transition-opacity ${!isHeadingToPickup ? 'opacity-30' : 'opacity-100'}`}>
            <div className={`w-6 h-6 rounded-full border-4 border-charcoal-950 shrink-0 z-10 ${isHeadingToPickup ? 'bg-amber-500 shadow-glow' : 'bg-charcoal-800'}`}></div>
            <div>
               <div className="text-[10px] font-black uppercase text-charcoal-600 tracking-widest mb-1">Step 1: Pick up</div>
               <div className="text-lg font-black text-ink leading-tight">{order.pickup_name}</div>
               {isHeadingToPickup && <NoteCard note={order.pickup_details} voiceUrl={order.pickup_voice_note_url} />}
            </div>
          </div>
          <div className={`flex items-start gap-5 relative transition-opacity ${isHeadingToPickup ? 'opacity-30' : 'opacity-100'}`}>
            <div className={`w-6 h-6 rounded-lg border-4 border-charcoal-950 shrink-0 z-10 ${!isHeadingToPickup ? 'bg-emerald-500 shadow-glow' : 'bg-charcoal-800'}`}></div>
            <div>
               <div className="text-[10px] font-black uppercase text-charcoal-600 tracking-widest mb-1 italic">Step 2: Deliver to</div>
               <div className="text-lg font-black text-ink leading-tight mb-2">{order.dropoff_name}</div>
               <div className="text-sm font-bold text-emerald-500/70">{order.recipient_name} • {order.recipient_phone}</div>
               {!isHeadingToPickup && <NoteCard note={order.dropoff_details} voiceUrl={order.dropoff_voice_note_url} />}
            </div>
          </div>
        </div>

        {/* Package photo - shown once picked up so the rider can confirm
            they're carrying the right item */}
        {!isHeadingToPickup && order.package_photo_url && (
          <div className="rounded-2xl overflow-hidden border border-white/10">
            <img src={order.package_photo_url} alt="Package" className="w-full h-32 object-cover" />
          </div>
        )}

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

        {/* Delivery photo - encouraged, not required, right before the final
            confirm. Cheap insurance for a "no one home" or "wrong item"
            dispute later, without blocking a rider's income over an optional
            step they may not always be able to do (gate handoffs, etc). */}
        {order.status === 'in_transit' && (
          <div>
            <input ref={deliveryPhotoInputRef} type="file" accept="image/*" capture="environment" onChange={handleDeliveryPhotoSelect} className="hidden" id="delivery-photo-input" />
            {deliveryPhotoUrl ? (
              <div className="relative rounded-2xl overflow-hidden border border-emerald-500/30">
                <img src={deliveryPhotoUrl} alt="Delivery proof" className="w-full h-28 object-cover" />
                <div className="absolute top-2 right-2 flex items-center gap-1.5 bg-emerald-500 text-charcoal-950 text-[9px] font-black uppercase tracking-widest px-2.5 py-1 rounded-full">
                  <CheckCircle2 size={11} /> Saved
                </div>
                <button onClick={() => setDeliveryPhotoUrl(null)} className="absolute top-2 left-2 w-7 h-7 bg-charcoal-950/80 rounded-lg flex items-center justify-center text-ink">
                  <X size={13} />
                </button>
              </div>
            ) : (
              <label htmlFor="delivery-photo-input" className="flex items-center justify-center gap-2 py-4 bg-white/5 border border-dashed border-white/20 rounded-2xl cursor-pointer hover:border-emerald-500/40 transition-all">
                {uploadingDeliveryPhoto ? (
                  <><Loader2 size={16} className="animate-spin text-emerald-500" /> <span className="text-charcoal-400 text-xs font-bold">Uploading...</span></>
                ) : (
                  <><Camera size={16} className="text-charcoal-500" /> <span className="text-charcoal-400 text-xs font-bold">Add a delivery photo (recommended)</span></>
                )}
              </label>
            )}
          </div>
        )}

        {/* Progress Action - SLIDE TO CONFIRM */}
        <div className="pt-4">
           {/* FIX: previously a rider could slide straight to "picked up" the
               moment a job was matched, with no payment step in between at
               all. Now, once matched, the rider sees a locked "waiting for
               payment" state until order.payment_status flips to 'paid'
               (set server-side by /api/verify-payment once the vendor pays
               on /payment). The realtime subscription above already updates
               `order` in place, so this unlocks live without a refresh. */}
           {order.status === 'matched' && order.payment_status !== 'paid' && (
             <div className="rounded-[2rem] border border-amber-500/20 bg-amber-500/5 p-6 text-center space-y-3">
               <div className="w-12 h-12 mx-auto rounded-2xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-500">
                 <Loader2 size={22} className="animate-spin" />
               </div>
               <p className="text-amber-500 font-black text-sm uppercase tracking-widest">Waiting for vendor payment</p>
               <p className="text-charcoal-400 text-xs leading-relaxed">
                 The vendor needs to complete payment before you head to pickup. This will unlock automatically the moment it's confirmed.
               </p>
             </div>
           )}
           {order.status === 'matched' && order.payment_status === 'paid' && (
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
               <Loader2 size={14} className="animate-spin" /> Updating...
             </div>
           )}
        </div>
      </div>

      <div className="px-8 text-center flex items-center justify-center gap-2">
        <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse" />
        <p className="text-[10px] font-black uppercase tracking-[0.3em] text-charcoal-600">
          Sharing your live location
        </p>
      </div>

      <AnimatePresence>
        {showChat && currentUserId && (
          <OrderChat
            orderId={order.id}
            currentUserId={currentUserId}
            onClose={() => setShowChat(false)}
            isReadOnly={order.status === 'delivered' || order.status === 'cancelled'}
          />
        )}
      </AnimatePresence>
    </div>
  );
}