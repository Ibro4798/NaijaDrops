"use client";

import { useState, useEffect, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { createClient } from '@/utils/supabase/client';
import { Loader2, MapPin, Package, CheckCircle2, Clock, MessageCircle, Star, Share2, Printer, Radar, X, AlertTriangle, CreditCard } from 'lucide-react';
import MapCanvas from '@/components/MapCanvas';
import OrderChat from '@/components/OrderChat';
import ReviewModal from '@/components/ReviewModal';
import { cancelOrder } from '@/app/vendor/active-orders/actions';
import Skeleton from '@/components/ui/Skeleton';

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
  const [showReview, setShowReview] = useState(false);
  const expandPollRef = useRef(null);

  useEffect(() => {
    let channel;
    async function load() {
      // Try the authenticated path first — covers vendors viewing their own order
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
          setOrder(authedOrder);
          setIsVendorView(true);
          setLoading(false);
          channel = supabase
            .channel(`track-${orderId}`)
            .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'orders', filter: `id=eq.${orderId}` },
              (payload) => setOrder(prev => ({ ...prev, ...payload.new })))
            .subscribe();
          return;
        }
      }

      // Anonymous / no access via RLS: use the scoped public tracking API instead.
      try {
        const res = await fetch(`/api/track/${orderId}`);
        const json = await res.json();
        if (!res.ok || !json.success) { setNotFound(true); setLoading(false); return; }
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

  const handleShare = async () => {
    const url = typeof window !== 'undefined' ? window.location.href : '';
    if (typeof navigator !== 'undefined' && navigator.share) {
      try {
        await navigator.share({ title: 'NaijaDrops delivery receipt', url });
        return;
      } catch {
        // user cancelled the share sheet - fall through to clipboard
      }
    }
    if (typeof navigator !== 'undefined' && navigator.clipboard) {
      await navigator.clipboard.writeText(url);
      alert('Receipt link copied to clipboard.');
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
  const vendorName = order.vendors?.business_name || null;
  const vendorLogo = order.vendors?.logo_url || null;

  // --- Delivered: show a branded receipt instead of a live tracker ---
  if (order.status === 'delivered') {
    const commission = isVendorView && order.agreed_price ? Math.round(order.agreed_price * 0.20) : null;
    return (
      <div className="min-h-screen bg-charcoal-950 px-6 py-12 flex justify-center print:bg-white print:py-4">
        <div className="w-full max-w-md bg-charcoal-900 border border-white/10 rounded-[2rem] p-8 space-y-6 print:bg-white print:border-none print:shadow-none print:text-black">

          {/* Vendor branding header */}
          {(vendorName || vendorLogo) && (
            <div className="flex flex-col items-center text-center gap-3 pb-4 border-b border-white/10 print:border-charcoal-300">
              {vendorLogo ? (
                <img src={vendorLogo} alt={vendorName || 'Vendor'} className="w-16 h-16 rounded-2xl object-cover border border-white/10" />
              ) : (
                <div className="w-16 h-16 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-500 font-black text-xl">
                  {(vendorName || 'ND').slice(0, 2).toUpperCase()}
                </div>
              )}
              {vendorName && <p className="text-ink font-black text-lg font-outfit print:text-black">{vendorName}</p>}
              <p className="text-charcoal-500 text-[10px] font-black uppercase tracking-widest print:text-charcoal-500">Delivered via NaijaDrops</p>
            </div>
          )}

          <div className="flex flex-col items-center text-center gap-2">
            <CheckCircle2 className="text-emerald-500" size={40} />
            <p className="text-ink font-black text-xl font-outfit print:text-black">Delivered</p>
            <p className="text-charcoal-400 text-xs">{new Date(order.updated_at).toLocaleString()}</p>
          </div>
          <div className="space-y-3 border-t border-white/10 pt-6 print:border-charcoal-300">
            <div className="flex justify-between text-sm"><span className="text-charcoal-400">Item</span><span className="text-ink font-bold print:text-black">{order.item_description}</span></div>
            <div className="flex justify-between text-sm"><span className="text-charcoal-400">From</span><span className="text-ink font-bold print:text-black">{order.pickup_name}</span></div>
            <div className="flex justify-between text-sm"><span className="text-charcoal-400">To</span><span className="text-ink font-bold print:text-black">{order.dropoff_name}</span></div>
            {riderName && <div className="flex justify-between text-sm"><span className="text-charcoal-400">Rider</span><span className="text-ink font-bold print:text-black">{riderName}</span></div>}
            <div className="flex justify-between text-sm"><span className="text-charcoal-400">Total Paid</span><span className="text-emerald-400 font-black">₦{Number(order.agreed_price ?? order.total_price ?? 0).toLocaleString()}</span></div>
            {isVendorView && commission !== null && (
              <div className="flex justify-between text-sm opacity-70"><span className="text-charcoal-400">Platform Commission (20%)</span><span className="text-ink print:text-black">₦{commission.toLocaleString()}</span></div>
            )}
          </div>

          {isVendorView && (
            <div className="flex flex-col gap-3 pt-2 print:hidden">
              <div className="grid grid-cols-2 gap-3">
                <button
                  onClick={handleShare}
                  className="flex items-center justify-center gap-2 py-3 bg-white/5 border border-white/10 rounded-2xl text-ink text-xs font-black uppercase tracking-widest hover:bg-white/10 transition-all"
                >
                  <Share2 size={16} /> Share
                </button>
                <button
                  onClick={() => window.print()}
                  className="flex items-center justify-center gap-2 py-3 bg-white/5 border border-white/10 rounded-2xl text-ink text-xs font-black uppercase tracking-widest hover:bg-white/10 transition-all"
                >
                  <Printer size={16} /> Print
                </button>
              </div>
              {riderName && (
                <button
                  onClick={() => setShowReview(true)}
                  className="flex items-center justify-center gap-2 py-3 bg-emerald-500/10 border border-emerald-500/20 rounded-2xl text-emerald-400 text-xs font-black uppercase tracking-widest hover:bg-emerald-500/20 transition-all"
                >
                  <Star size={16} /> Rate this delivery
                </button>
              )}
            </div>
          )}
        </div>

        {isVendorView && riderName && (
          <ReviewModal
            order={order}
            driverProfile={{ full_name: riderName }}
            reviewerId={currentUserId}
            isOpen={showReview}
            onClose={() => setShowReview(false)}
          />
        )}
      </div>
    );
  }

  // --- In progress ---
  const currentStepIndex = STATUS_STEPS.indexOf(order.status);
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
              Searching within <span className="text-emerald-500 font-bold">{radius.toFixed(1)}km</span> of your pickup point{radius < maxRadius ? ' — expanding automatically' : ''}.
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
            <button
              onClick={() => setShowCancelConfirm(true)}
              className="w-full py-4 rounded-2xl bg-white/5 border border-white/10 text-red-400 text-xs font-black uppercase tracking-widest hover:bg-red-500/10 hover:border-red-500/20 transition-all"
            >
              Cancel This Order
            </button>
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
  return (
    <div className="min-h-screen bg-charcoal-950 flex flex-col">
      <div className="h-64 relative">
        {(riderLat && riderLng) ? (
          <MapCanvas markers={[{ lat: riderLat, lng: riderLng, color: 'emerald', type: 'rider' }]} center={{ lat: riderLat, lng: riderLng }} />
        ) : (
          <div className="h-full flex items-center justify-center text-charcoal-500 text-sm">
            <MapPin className="mr-2" size={16} /> Waiting for rider location…
          </div>
        )}
      </div>

      <div className="px-6 py-8 space-y-8">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-charcoal-400 text-[11px] font-black uppercase tracking-widest">Status</p>
            <p className="text-ink font-black text-2xl font-outfit">{STATUS_LABELS[order.status] || order.status}</p>
          </div>
          {isVendorView && (
            <button
              onClick={() => setShowChat(true)}
              className="w-12 h-12 bg-emerald-500/10 border border-emerald-500/20 rounded-2xl flex items-center justify-center text-emerald-500 hover:bg-emerald-500/20 transition-all active:scale-95 shrink-0"
              title="Message rider"
            >
              <MessageCircle size={20} />
            </button>
          )}
        </div>

        <div className="space-y-4">
          {STATUS_STEPS.map((step, i) => (
            <div key={step} className="flex items-center gap-3">
              {i <= currentStepIndex ? <CheckCircle2 className="text-emerald-500" size={18} /> : <Clock className="text-charcoal-600" size={18} />}
              <span className={i <= currentStepIndex ? 'text-ink font-bold text-sm' : 'text-charcoal-600 text-sm'}>{STATUS_LABELS[step]}</span>
            </div>
          ))}
        </div>

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
              Pay ₦{order.agreed_price?.toLocaleString()} Now
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