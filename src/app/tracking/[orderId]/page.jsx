"use client";

import { useState, useEffect, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { createClient } from '@/utils/supabase/client';
import { Loader2, MapPin, Package, CheckCircle2, MessageCircle, Share2, Radar, X, AlertTriangle, CreditCard, Check } from 'lucide-react';
import MapCanvas from '@/components/MapCanvas';
import OrderChat from '@/components/OrderChat';
import OrderStatusStepper from '@/components/ui/OrderStatusStepper';
import { cancelOrder } from '@/app/vendor/active-orders/actions';
import Skeleton from '@/components/ui/Skeleton';
import { AnimatePresence, motion } from 'framer-motion';

const STATUS_STEPS = ['pending', 'looking_for_driver', 'matched', 'picked_up', 'in_transit', 'delivered'];
const STATUS_LABELS = {
  pending: 'Finding a rider',
  looking_for_driver: 'Finding a rider',
  matched: 'Rider assigned',
  picked_up: 'Package picked up',
  in_transit: 'On the way',
  delivered: 'Delivered',
  cancelled: 'Cancelled'
};

export default function TrackingPage() {
  const { orderId } = useParams();
  const router = useRouter();
  const supabase = createClient();
  const [order, setOrder] = useState(null);
  const [isVendorView, setIsVendorView] = useState(false);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [currentUserId, setCurrentUserId] = useState(null);
  const [showChat, setShowChat] = useState(false);
  const [showCancelConfirm, setShowCancelConfirm] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [linkCopied, setLinkCopied] = useState(false);
  const [statusToast, setStatusToast] = useState(null);
  const expandPollRef = useRef(null);
  const anonPollRef = useRef(null);
  const prevStatusRef = useRef(null);

  useEffect(() => {
    let channel;
    async function load() {
      // Try the authenticated path first â€” covers vendors viewing their own order
      // history (vendor/history links here) via normal RLS.
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        setCurrentUserId(user.id);
        const { data: authedOrder } = await supabase
          .from('orders')
          .select('*, riders(current_lat, current_lng, users(full_name)), vendors(business_name, logo_url)')
          .eq('id', orderId)
          .single();
        if (authedOrder) {
          prevStatusRef.current = authedOrder.status;
          setOrder(authedOrder);
          setIsVendorView(true);
          setLoading(false);
          channel = supabase
            .channel(`track-${orderId}`)
            .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'orders', filter: `id=eq.${orderId}` },
              (payload) => {
                setOrder(prev => ({ ...prev, ...payload.new }));
                announceStatusChange(payload.new.status);
              })
            .subscribe();
          return;
        }
      }

      // Anonymous / no access via RLS: use the scoped public tracking API instead.
      try {
        const res = await fetch(`/api/track/${orderId}`);
        const json = await res.json();
        if (!res.ok || !json.success) { setNotFound(true); setLoading(false); return; }
        prevStatusRef.current = json.order.status;
        setOrder(json.order);
        setIsVendorView(false);
      } catch {
        setNotFound(true);
      }
      setLoading(false);
    }
    load();
    return () => { if (channel) supabase.removeChannel(channel); };
  }, [orderId, supabase]);

  function announceStatusChange(newStatus) {
    if (prevStatusRef.current === newStatus) return;
    prevStatusRef.current = newStatus;
    setStatusToast(STATUS_LABELS[newStatus] || newStatus);
    setTimeout(() => setStatusToast(null), 4500);
  }

  // FIX: anonymous customers (no account, viewing via the public link) had
  // no realtime subscription at all - the authenticated path above gets
  // live postgres_changes updates, but this path only ever saw whatever
  // status the order was in at the moment the page first loaded. A
  // customer sitting on this page during pickup/in-transit/delivery would
  // never see it change without manually refreshing. Light polling closes
  // that gap without needing a realtime connection for someone who isn't
  // logged in.
  useEffect(() => {
    if (isVendorView || !order || notFound) return;
    if (order.status === 'delivered' || order.status === 'cancelled') return;

    anonPollRef.current = setInterval(async () => {
      try {
        const res = await fetch(`/api/track/${orderId}`);
        const json = await res.json();
        if (!res.ok || !json.success) return;
        announceStatusChange(json.order.status);
        setOrder(json.order);
      } catch {
        // transient network issue - just try again next tick
      }
    }, 12000);

    return () => { if (anonPollRef.current) clearInterval(anonPollRef.current); };
  }, [isVendorView, order?.status, orderId, notFound]);

  // --- Once delivered, this page hands off to the dedicated receipt page.
  useEffect(() => {
    if (order?.status === 'delivered') {
      const t = setTimeout(() => router.replace(`/receipt/${orderId}`), 600);
      return () => clearTimeout(t);
    }
  }, [order?.status, orderId, router]);

  // FIX: the "expanding search radius" shown below only ever actually
  // expanded if the sender happened to still have the send-package
  // confirmation screen open in the same tab - vendor-created orders (and
  // anyone who navigated away and came back to this tracking page instead)
  // had no path that ever grew the radius or re-triggered dispatch, so
  // riders outside the initial radius were never found even though the UI
  // implied a live, growing search. This runs the same expand + re-dispatch
  // cycle here instead, so it works from whichever screen is actually being
  // watched. It only runs while genuinely waiting (pending/looking_for_driver)
  // and stops itself as soon as the order leaves that state.
  useEffect(() => {
    if (!order || !orderId) return;
    const waiting = order.status === 'pending' || order.status === 'looking_for_driver';
    if (!waiting) {
      if (expandPollRef.current) { clearInterval(expandPollRef.current); expandPollRef.current = null; }
      return;
    }
    if (expandPollRef.current) return; // already polling

    const triggerDispatch = async () => {
      try {
        await fetch('/api/dispatch', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ orderId })
        });
      } catch (e) {
        console.error('Dispatch retry failed:', e);
      }
    };

    expandPollRef.current = setInterval(async () => {
      const { data: fresh, error: freshErr } = await supabase
        .from('orders')
        .select('status, broadcast_radius_km, max_broadcast_radius_km')
        .eq('id', orderId)
        .single();
      if (freshErr || !fresh) return;
      if (fresh.status !== 'pending' && fresh.status !== 'looking_for_driver') {
        clearInterval(expandPollRef.current);
        expandPollRef.current = null;
        return;
      }

      const currentRadius = Number(fresh.broadcast_radius_km) || 1.5;
      const maxRadius = Number(fresh.max_broadcast_radius_km) || 8;
      if (currentRadius >= maxRadius) {
        // Already at max - just keep re-broadcasting in case a rider has
        // come online/back in range since the last attempt.
        await triggerDispatch();
        return;
      }

      await supabase.rpc('expand_order_radius', { p_order_id: orderId });
      await triggerDispatch();
    }, 15000);

    return () => {
      if (expandPollRef.current) { clearInterval(expandPollRef.current); expandPollRef.current = null; }
    };
  }, [order?.status, orderId, supabase]);

  // Shares the tracking link itself (this page's URL) - distinct from the
  // receipt page's own share button, which shares the finished receipt.
  const handleShareTrackingLink = async () => {
    const url = typeof window !== 'undefined' ? window.location.href : '';
    const text = `Track your delivery live: ${order.item_description || 'your package'} is on its way.`;
    if (typeof navigator !== 'undefined' && navigator.share) {
      try {
        await navigator.share({ title: 'Track your NaijaDrops delivery', text, url });
        return;
      } catch (err) {
        if (err?.name === 'AbortError') return;
      }
    }
    if (typeof navigator !== 'undefined' && navigator.clipboard) {
      await navigator.clipboard.writeText(url);
      setLinkCopied(true);
      setTimeout(() => setLinkCopied(false), 2000);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-charcoal-950">
        <Skeleton className="h-64 w-full rounded-none" />
        <div className="px-6 py-8 space-y-8">
          <div className="space-y-2">
            <Skeleton className="h-2.5 w-14" />
            <Skeleton className="h-7 w-48" />
            <Skeleton className="h-3 w-64" />
            <Skeleton className="h-1.5 w-full rounded-full mt-3" />
          </div>
          <div className="border-t border-white/10 pt-6 space-y-4">
            <Skeleton className="h-4 w-40" />
            <div className="flex justify-between"><Skeleton className="h-3 w-10" /><Skeleton className="h-3 w-32" /></div>
            <div className="flex justify-between"><Skeleton className="h-3 w-10" /><Skeleton className="h-3 w-32" /></div>
          </div>
        </div>
      </div>
    );
  }

  if (notFound || !order) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-charcoal-950 text-center px-6">
        <p className="text-ink font-black text-xl mb-2">Delivery not found</p>
        <p className="text-charcoal-400 text-sm">Check the link and try again, or contact the sender.</p>
      </div>
    );
  }

  const riderName = order.riders?.users?.full_name || order.rider?.first_name || null;
  const riderLat = order.riders?.current_lat ?? order.rider?.current_lat;
  const riderLng = order.riders?.current_lng ?? order.rider?.current_lng;

  // --- Delivered: brief handoff to the dedicated receipt page ---
  if (order.status === 'delivered') {
    return (
      <div className="min-h-screen bg-charcoal-950 flex flex-col items-center justify-center gap-4">
        <CheckCircle2 className="text-emerald-500" size={48} />
        <p className="text-ink font-black text-lg">Delivered! Loading your receipt...</p>
        <Loader2 className="animate-spin text-emerald-500" size={20} />
      </div>
    );
  }

  // --- In progress ---
  const isWaitingForRider = order.status === 'pending' || order.status === 'looking_for_driver';

  async function handleCancelOrder() {
    setCancelling(true);
    const res = await cancelOrder(order.id, 'Cancelled from tracking page');
    setCancelling(false);
    if (res.success) {
      router.push('/vendor/active-orders');
    } else {
      setShowCancelConfirm(false);
      alert(res.error || 'Could not cancel this order.');
    }
  }

  const StatusToastBanner = () => (
    <AnimatePresence>
      {statusToast && (
        <motion.div
          initial={{ y: -60, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: -60, opacity: 0 }}
          className="fixed top-4 left-4 right-4 z-[200] max-w-md mx-auto"
        >
          <div className="bg-emerald-500 text-charcoal-950 rounded-2xl px-5 py-3 shadow-glow flex items-center gap-3 font-black text-sm">
            <CheckCircle2 size={18} /> Status update: {statusToast}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );

  // --- Waiting for a rider: dedicated, simpler view - nothing has happened
  // yet, so a full 6-step timeline and an empty map box (the old behavior)
  // just added noise and made it look stuck. This shows what's actually
  // happening: a live, expanding search radius, matching the real dispatch
  // system underneath.
  if (isWaitingForRider) {
    const radius = Number(order.broadcast_radius_km) || 1.5;
    const maxRadius = Number(order.max_broadcast_radius_km) || 8;
    const searchPct = Math.min(100, Math.round((radius / maxRadius) * 100));

    return (
      <div className="min-h-screen bg-charcoal-950 flex flex-col">
        <StatusToastBanner />
        <div className="h-64 relative bg-charcoal-900 flex items-center justify-center overflow-hidden">
          <div className="absolute w-40 h-40 rounded-full border-2 border-emerald-500/20 animate-ping" style={{ animationDuration: '2.5s' }} />
          <div className="absolute w-28 h-28 rounded-full border-2 border-emerald-500/30 animate-ping" style={{ animationDuration: '2.5s', animationDelay: '0.4s' }} />
          <div className="relative w-16 h-16 bg-emerald-500 rounded-full flex items-center justify-center shadow-glow">
            <Radar className="text-charcoal-950 animate-spin" size={28} style={{ animationDuration: '3s' }} />
          </div>
        </div>

        <div className="px-6 py-8 space-y-8">
          <div>
            <p className="text-charcoal-400 text-[11px] font-black uppercase tracking-widest">Status</p>
            <p className="text-ink font-black text-2xl font-outfit">Finding a rider</p>
            <p className="text-charcoal-500 text-sm mt-2">
              Searching within <span className="text-emerald-500 font-bold">{radius.toFixed(1)}km</span> of your pickup point{radius < maxRadius ? ' â€” expanding automatically' : ''}.
            </p>
            <div className="w-full h-1.5 bg-white/5 rounded-full mt-3 overflow-hidden">
              <div className="h-full bg-emerald-500 rounded-full transition-all duration-1000" style={{ width: `${searchPct}%` }} />
            </div>
          </div>

          <div className="border-t border-white/10 pt-6 space-y-3">
            <div className="flex items-center gap-2 text-sm"><Package size={14} className="text-charcoal-400" /><span className="text-ink font-bold">{order.item_description}</span></div>
            <div className="flex justify-between text-sm"><span className="text-charcoal-400">From</span><span className="text-ink">{order.pickup_name}</span></div>
            <div className="flex justify-between text-sm"><span className="text-charcoal-400">To</span><span className="text-ink">{order.dropoff_name}</span></div>
          </div>

          {isVendorView && (
            <div className="grid grid-cols-2 gap-3">
              <button
                onClick={handleShareTrackingLink}
                className="flex items-center justify-center gap-2 py-4 rounded-2xl bg-white/5 border border-white/10 text-ink text-xs font-black uppercase tracking-widest hover:bg-white/10 transition-all"
              >
                {linkCopied ? <><Check size={14} className="text-emerald-500" /> Copied</> : <><Share2 size={14} /> Share Link</>}
              </button>
              <button
                onClick={() => setShowCancelConfirm(true)}
                className="flex items-center justify-center gap-2 py-4 rounded-2xl bg-white/5 border border-white/10 text-red-400 text-xs font-black uppercase tracking-widest hover:bg-red-500/10 hover:border-red-500/20 transition-all"
              >
                Cancel Order
              </button>
            </div>
          )}
        </div>

        {showCancelConfirm && (
          <div className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm p-4">
            <div className="bg-charcoal-900 border border-white/10 rounded-t-3xl sm:rounded-3xl w-full max-w-sm p-6 space-y-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-red-500/10 border border-red-500/20 rounded-xl flex items-center justify-center shrink-0">
                  <AlertTriangle className="text-red-400" size={18} />
                </div>
                <div>
                  <h3 className="text-ink font-black text-base">Cancel this delivery?</h3>
                  <p className="text-charcoal-500 text-xs">No rider has accepted it yet - this is free to cancel.</p>
                </div>
              </div>
              <div className="flex gap-3">
                <button
                  onClick={() => setShowCancelConfirm(false)}
                  disabled={cancelling}
                  className="flex-1 py-3 rounded-xl bg-white/5 border border-white/10 text-ink text-xs font-black uppercase tracking-widest hover:bg-white/10 transition-all"
                >
                  Keep Order
                </button>
                <button
                  onClick={handleCancelOrder}
                  disabled={cancelling}
                  className="flex-1 py-3 rounded-xl bg-red-500 text-white text-xs font-black uppercase tracking-widest hover:bg-red-400 transition-all flex items-center justify-center gap-2 disabled:opacity-50"
                >
                  {cancelling ? <Loader2 size={14} className="animate-spin" /> : <X size={14} />}
                  Cancel It
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  // --- Rider matched or later: full timeline + live map ---
  const mapMarkers = [];
  if (order.pickup_lat && order.pickup_lng) mapMarkers.push({ lat: order.pickup_lat, lng: order.pickup_lng, type: 'pickup', label: 'Pickup' });
  if (riderLat && riderLng) mapMarkers.push({ lat: riderLat, lng: riderLng, type: 'rider', label: riderName || 'Rider' });
  if (order.dropoff_lat && order.dropoff_lng) mapMarkers.push({ lat: order.dropoff_lat, lng: order.dropoff_lng, type: 'dropoff', label: 'Drop-off' });

  return (
    <div className="min-h-screen bg-charcoal-950 flex flex-col">
      <StatusToastBanner />
      <div className="h-80 relative">
        {mapMarkers.length > 0 ? (
          <>
            <MapCanvas markers={mapMarkers} showRoute />
            {riderLat && riderLng && (
              <div className="absolute top-4 left-4 bg-charcoal-950/80 backdrop-blur border border-emerald-500/30 rounded-full px-3 py-1.5 flex items-center gap-2 pointer-events-none">
                <span className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse" />
                <span className="text-emerald-400 text-[10px] font-black uppercase tracking-widest">Live</span>
              </div>
            )}
          </>
        ) : (
          <div className="h-full flex items-center justify-center text-charcoal-500 text-sm bg-charcoal-900">
            <MapPin className="mr-2" size={16} /> Waiting for rider locationâ€¦
          </div>
        )}
      </div>

      <div className="px-6 py-8 space-y-8">
        <div className="flex items-start justify-between gap-4">
          {/* FIX: text block had no min-w-0, so a longer status label had
              nowhere to go but push against/under the 48px chat button on
              narrow screens instead of truncating cleanly. */}
          <div className="min-w-0">
            <p className="text-charcoal-400 text-[11px] font-black uppercase tracking-widest">Status</p>
            <p className="text-ink font-black text-2xl font-outfit truncate">{STATUS_LABELS[order.status] || order.status}</p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {isVendorView && (
              <button
                onClick={handleShareTrackingLink}
                className="w-12 h-12 bg-white/5 border border-white/10 rounded-2xl flex items-center justify-center text-ink hover:bg-white/10 transition-all active:scale-95"
                title="Share tracking link"
              >
                {linkCopied ? <Check size={18} className="text-emerald-500" /> : <Share2 size={18} />}
              </button>
            )}
            {isVendorView && (
              <button
                onClick={() => setShowChat(true)}
                className="w-12 h-12 bg-emerald-500/10 border border-emerald-500/20 rounded-2xl flex items-center justify-center text-emerald-500 hover:bg-emerald-500/20 transition-all active:scale-95"
                title="Message rider"
              >
                <MessageCircle size={20} />
              </button>
            )}
          </div>
        </div>

        <OrderStatusStepper steps={STATUS_STEPS} currentStatus={order.status} />

        {/* Payment gate: a rider is assigned but the vendor hasn't paid yet.
            The rider's app is deliberately locked from heading to pickup
            until payment_status flips to 'paid' (see /api/verify-payment),
            so this needs to be impossible to miss here. */}
        {isVendorView && order.status === 'matched' && order.payment_status !== 'paid' && (
          <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/5 p-5 space-y-3">
            <div className="flex items-center gap-2 text-emerald-400 text-xs font-black uppercase tracking-widest">
              <CreditCard size={16} /> Payment required
            </div>
            <p className="text-charcoal-300 text-sm leading-relaxed">
              A rider has been assigned. Complete payment now so they can head to pickup - this order stays paused until then.
            </p>
            <button
              onClick={() => router.push(`/payment?orderId=${order.id}`)}
              className="w-full py-4 bg-emerald-500 hover:bg-emerald-400 text-charcoal-950 rounded-2xl font-black text-sm uppercase tracking-widest transition-all active:scale-95"
            >
              Pay â‚¦{order.agreed_price?.toLocaleString()} Now
            </button>
          </div>
        )}

        <div className="border-t border-white/10 pt-6 space-y-3">
          <div className="flex items-center gap-2 text-sm"><Package size={14} className="text-charcoal-400" /><span className="text-ink font-bold">{order.item_description}</span></div>
          <div className="flex justify-between text-sm"><span className="text-charcoal-400">From</span><span className="text-ink">{order.pickup_name}</span></div>
          <div className="flex justify-between text-sm"><span className="text-charcoal-400">To</span><span className="text-ink">{order.dropoff_name}</span></div>
          {riderName && <div className="flex justify-between text-sm"><span className="text-charcoal-400">Rider</span><span className="text-ink font-bold">{riderName}</span></div>}
        </div>
      </div>

      {isVendorView && showChat && currentUserId && (
        <OrderChat
          orderId={order.id}
          currentUserId={currentUserId}
          onClose={() => setShowChat(false)}
        />
      )}
    </div>
  );
}