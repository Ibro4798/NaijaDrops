"use client";

import { useState, useEffect, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/utils/supabase/client';
import { ArrowLeft, MapPin, Package, Navigation, Phone, MessageSquare, CheckCircle2, Loader2, ShieldAlert, MessageCircle, Play, Camera, X, FileText } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import dynamic from 'next/dynamic';

const MapCanvas = dynamic(() => import('@/components/MapCanvas'), { ssr: false });

import SlideToConfirm from '@/components/rider/SlideToConfirm';
import DriverHeartbeat from '@/components/rider/DriverHeartbeat';
import OrderChat from '@/components/OrderChat';
import { distanceMeters } from '@/utils/geolocation';

// "General location of the pickup spot", not an exact building - Kano's
// informal addressing means a pin drop can legitimately be off by a
// noticeable margin from where a rider can actually stand, and GPS itself
// drifts more than that in dense market areas. Widened from an earlier,
// too-tight 400m after real-world testing showed it firing false
// negatives. Only the pickup step is gated like this; transit/delivered
// are not, since a rider is already carrying the package by then and
// there's no "wrong place" to catch.
const PICKUP_PROXIMITY_METERS = 1000;

// How much net movement (in meters) counts as "actually heading out", not
// GPS jitter. Consumer GPS accuracy in a dense market area can wander
// 20-30m on its own even standing still, so this needs real headroom
// above that before it's trusted as a genuine trend rather than noise.
const AUTO_PICKUP_MOVEMENT_METERS = 80;

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

// FIX: pickup/dropoff notes only ever showed for whichever leg was
// currently active - once a rider picked up, the pickup note (gate code,
// "call when near", etc) was gone for good even if they needed to glance
// back at it. This sheet shows both notes together regardless of step, so
// they're always one tap away via the header button.
function NotesSheet({ order, onClose }) {
  const hasPickupNote = order.pickup_details || order.pickup_voice_note_url;
  const hasDropoffNote = order.dropoff_details || order.dropoff_voice_note_url;
  return (
    <div className="fixed inset-0 z-[80] flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="bg-charcoal-900 border border-white/10 rounded-t-3xl sm:rounded-3xl w-full max-w-sm p-6 space-y-4 max-h-[80vh] overflow-y-auto">
        <div className="flex items-center justify-between">
          <h3 className="text-ink font-black text-base">Order notes</h3>
          <button onClick={onClose} className="w-8 h-8 rounded-full bg-white/5 flex items-center justify-center text-charcoal-400 hover:text-ink">
            <X size={14} />
          </button>
        </div>
        <div>
          <div className="text-[10px] font-black uppercase tracking-widest text-emerald-500 mb-1">Pickup — {order.pickup_name}</div>
          {hasPickupNote ? <NoteCard note={order.pickup_details} voiceUrl={order.pickup_voice_note_url} /> : (
            <p className="text-charcoal-600 text-xs italic">No note left for pickup.</p>
          )}
        </div>
        <div>
          <div className="text-[10px] font-black uppercase tracking-widest text-emerald-500 mb-1">Drop-off — {order.dropoff_name}</div>
          {hasDropoffNote ? <NoteCard note={order.dropoff_details} voiceUrl={order.dropoff_voice_note_url} /> : (
            <p className="text-charcoal-600 text-xs italic">No note left for drop-off.</p>
          )}
          <p className="text-charcoal-500 text-sm mt-2">{order.recipient_name} • {order.recipient_phone}</p>
        </div>
      </div>
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
  const [chatChannel, setChatChannel] = useState(null);
  const [showNotes, setShowNotes] = useState(false);
  const [deliveryPhotoUrl, setDeliveryPhotoUrl] = useState(null);
  const [uploadingDeliveryPhoto, setUploadingDeliveryPhoto] = useState(false);
  const [pickupDistanceMeters, setPickupDistanceMeters] = useState(null);
  const [pickupLocationError, setPickupLocationError] = useState(false);
  const [autoPickupDetected, setAutoPickupDetected] = useState(false);
  const deliveryPhotoInputRef = useRef(null);
  // Auto-pickup detection state, kept in refs (not React state) since they
  // need to persist across GPS pings without re-triggering renders/effects
  // on every single update.
  const hasEnteredPickupRegionRef = useRef(false);
  const lastPickupDistanceRef = useRef(null);
  const lastDropoffDistanceRef = useRef(null);
  const autoPickupFiredRef = useRef(false);
  const updateStatusRef = useRef(null);

  // FIX: previously this ran once on mount, re-fetched from scratch AND
  // tore down/recreated the realtime channel every time order.id changed,
  // and the channel itself had no filter at all (listening to every
  // UPDATE on the whole orders table system-wide). None of that was what
  // actually caused "need to refresh to see it" though - the real cause
  // is that a phone's browser tab drops its WebSocket when the screen
  // locks or the app backgrounds, and Supabase realtime does NOT replay
  // whatever happened while disconnected. So beyond fixing the channel
  // filter/churn, this now explicitly re-syncs the moment the tab/phone
  // comes back (visibilitychange/focus/online), which is what actually
  // closes the "stale until I refresh" gap.
  const orderIdRef = useRef(null);

  const fetchActiveJob = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    setCurrentUserId(user.id);

    const { data: profile } = await supabase.from('riders').select('id').eq('user_id', user.id).single();
    if (!profile) return;
    setRiderId(profile.id);

    // Once we know which order this is, always re-fetch it by id directly
    // (no status filter) so a status change to something outside the
    // "active" set - e.g. the vendor cancelling while the rider is en
    // route - is reflected honestly instead of the fetch just finding
    // nothing and silently leaving the screen on its last known state.
    if (orderIdRef.current) {
      const { data } = await supabase
        .from('orders')
        .select('*, riders(*)')
        .eq('id', orderIdRef.current)
        .maybeSingle();
      if (data) setOrder(data);
      setLoading(false);
      return;
    }

    const { data } = await supabase
      .from('orders')
      .select('*, riders(*)')
      .eq('rider_id', profile.id)
      .in('status', ['matched', 'picked_up', 'in_transit'])
      .order('updated_at', { ascending: false })
      .limit(1)
      .single();

    if (data) { orderIdRef.current = data.id; setOrder(data); }
    setLoading(false);
  }, [supabase]);

  useEffect(() => {
    fetchActiveJob();
  }, [fetchActiveJob]);

  // Realtime channel: filtered server-side by rider_id (not every order in
  // the system), subscribed once riderId is known, and left alone after
  // that - it no longer tears itself down on every order update.
  useEffect(() => {
    if (!riderId) return;
    const channel = supabase
      .channel(`active-job-updates-${riderId}`)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'orders', filter: `rider_id=eq.${riderId}` },
        () => { fetchActiveJob(); })
      .subscribe();

    return () => supabase.removeChannel(channel);
  }, [supabase, riderId, fetchActiveJob]);

  // Re-sync the moment this tab/phone comes back from the background,
  // regains focus, or regains a network connection - a locked screen or
  // backgrounded app during a ride is the normal case here, not an edge
  // case, so this can't be optional.
  useEffect(() => {
    const handleVisible = () => {
      if (document.visibilityState === 'visible') fetchActiveJob();
    };
    document.addEventListener('visibilitychange', handleVisible);
    window.addEventListener('focus', fetchActiveJob);
    window.addEventListener('online', fetchActiveJob);
    return () => {
      document.removeEventListener('visibilitychange', handleVisible);
      window.removeEventListener('focus', fetchActiveJob);
      window.removeEventListener('online', fetchActiveJob);
    };
  }, [fetchActiveJob]);


  // Gate the pickup slider on actually being near the pickup point - not
  // "anywhere". Also runs the smart auto-pickup detection: once the rider
  // has genuinely been inside the pickup region at least once, and their
  // GPS trend afterward shows real net movement away from pickup AND
  // toward drop-off (not just noise), this fires the same 'picked_up'
  // transition automatically - no slide needed. The manual slide stays
  // available the entire time regardless, as a fallback for a rider who
  // isn't showing a clean movement signal (loading up, standing still
  // negotiating, weak GPS, etc) so this is purely additive convenience,
  // never something that can leave a rider stuck waiting on it.
  //
  // "Start Transit" and "Mark Delivered" are untouched by any of this -
  // delivered in particular stays a manual slide always, by design.
  useEffect(() => {
    if (!order || order.status !== 'matched' || order.payment_status !== 'paid') {
      setPickupDistanceMeters(null);
      setPickupLocationError(false);
      setAutoPickupDetected(false);
      return;
    }
    if (typeof navigator === 'undefined' || !('geolocation' in navigator)) {
      setPickupLocationError(true);
      return;
    }

    // Fresh order/matched cycle - reset the trend-detection memory so a
    // previous job's readings can never leak into this one.
    hasEnteredPickupRegionRef.current = false;
    lastPickupDistanceRef.current = null;
    lastDropoffDistanceRef.current = null;
    autoPickupFiredRef.current = false;

    const hasDropoffCoords = order.dropoff_lat != null && order.dropoff_lng != null;

    const watchId = navigator.geolocation.watchPosition(
      (pos) => {
        setPickupLocationError(false);
        const distToPickup = distanceMeters(pos.coords.latitude, pos.coords.longitude, order.pickup_lat, order.pickup_lng);
        const distToDropoff = hasDropoffCoords
          ? distanceMeters(pos.coords.latitude, pos.coords.longitude, order.dropoff_lat, order.dropoff_lng)
          : null;
        setPickupDistanceMeters(distToPickup);

        if (distToPickup <= PICKUP_PROXIMITY_METERS) {
          hasEnteredPickupRegionRef.current = true;
        }

        if (
          hasEnteredPickupRegionRef.current &&
          !autoPickupFiredRef.current &&
          distToDropoff !== null &&
          lastPickupDistanceRef.current !== null &&
          lastDropoffDistanceRef.current !== null
        ) {
          const movingAwayFromPickup = (distToPickup - lastPickupDistanceRef.current) > AUTO_PICKUP_MOVEMENT_METERS;
          const movingTowardDropoff = (lastDropoffDistanceRef.current - distToDropoff) > AUTO_PICKUP_MOVEMENT_METERS;

          if (movingAwayFromPickup && movingTowardDropoff) {
            autoPickupFiredRef.current = true;
            setAutoPickupDetected(true);
            updateStatusRef.current?.('picked_up');
          }
        }

        lastPickupDistanceRef.current = distToPickup;
        lastDropoffDistanceRef.current = distToDropoff;
      },
      (err) => {
        console.warn('[ACTIVE-JOB] Pickup proximity watch failed:', err.message);
        setPickupLocationError(true);
      },
      { enableHighAccuracy: true, maximumAge: 5000, timeout: 20000 }
    );

    return () => navigator.geolocation.clearWatch(watchId);
  }, [order?.id, order?.status, order?.payment_status, order?.pickup_lat, order?.pickup_lng, order?.dropoff_lat, order?.dropoff_lng]);

  const isWithinPickupRange = pickupDistanceMeters !== null && pickupDistanceMeters <= PICKUP_PROXIMITY_METERS;


  const updateStatus = async (nextStatus) => {
    setUpdating(true);
    const { error } = await supabase
      .from('orders')
      .update({ status: nextStatus, delivery_photo_url: deliveryPhotoUrl || undefined })
      .eq('id', order.id);
    
    if (!error) {
      if (nextStatus === 'delivered') {
        // FIX: nothing ever reversed the 'busy' status the accept RPCs set
        // when this job started - a rider who completed a delivery stayed
        // invisible to the dispatch engine (getBestRider only looks at
        // operational_status = 'online') and stuck showing "offline" on
        // their own dashboard heartbeat, permanently, after their very
        // first job. Going back online here is what "stay online through
        // the job, then you're free again" actually requires.
        if (riderId) {
          await supabase.from('riders').update({ operational_status: 'online' }).eq('id', riderId);
        }
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

  useEffect(() => {
    updateStatusRef.current = updateStatus;
  });

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
          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={() => setShowNotes(true)}
              className="w-12 h-12 bg-white/5 border border-white/10 rounded-2xl flex items-center justify-center text-charcoal-300 hover:bg-white/10 transition-all active:scale-95"
              title="Order notes"
            >
              <FileText size={20} />
            </button>
            <button
              onClick={() => { setChatChannel(null); setShowChat(true); }}
              className="w-12 h-12 bg-emerald-500/10 border border-emerald-500/20 rounded-2xl flex items-center justify-center text-emerald-500 hover:bg-emerald-500/20 transition-all active:scale-95"
              title="Message"
            >
              <MessageCircle size={20} />
            </button>
          </div>
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
             isWithinPickupRange || pickupLocationError ? (
               <>
                 {pickupLocationError && (
                   <p className="text-amber-500/80 text-[10px] font-black uppercase tracking-widest text-center mb-3">
                     Couldn't verify your location — go ahead if you're at the pickup point.
                   </p>
                 )}
                 {!pickupLocationError && !autoPickupDetected && (
                   <p className="text-amber-500/70 text-[10px] font-black uppercase tracking-widest text-center mb-3">
                     Also watching automatically — this'll confirm itself once you start heading out.
                   </p>
                 )}
                 <SlideToConfirm
                   text="Slide to confirm Pickup"
                   color="bg-amber-500"
                   onConfirm={() => updateStatus('picked_up')}
                 />
               </>
             ) : (
               // FIX: previously a rider could slide to "picked up" from
               // anywhere at all - across town, before ever reaching the
               // pickup point. Now this step specifically (not transit,
               // not delivered) stays locked until they're actually in the
               // general vicinity of the pickup spot - and once they are,
               // it also auto-confirms itself the moment their GPS shows
               // them genuinely heading out toward drop-off, no slide
               // needed at all.
               <div className="rounded-[2rem] border border-amber-500/20 bg-amber-500/5 p-6 text-center space-y-2">
                 <div className="w-12 h-12 mx-auto rounded-2xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-500">
                   <MapPin size={22} />
                 </div>
                 <p className="text-amber-500 font-black text-sm uppercase tracking-widest">
                   {pickupDistanceMeters === null
                     ? 'Locating you...'
                     : `${Math.round(pickupDistanceMeters)}m from pickup`}
                 </p>
                 <p className="text-charcoal-400 text-xs leading-relaxed">
                   Get closer to {order.pickup_name} — this unlocks automatically once you're there, and confirms itself once you start heading to drop-off.
                 </p>
               </div>
             )
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
            viewerRole="rider"
            riderAssigned={true}
            initialChannel={chatChannel}
            onClose={() => setShowChat(false)}
            isReadOnly={order.status === 'delivered' || order.status === 'cancelled'}
          />
        )}
      </AnimatePresence>

      {showNotes && <NotesSheet order={order} onClose={() => setShowNotes(false)} />}
    </div>
  );
}