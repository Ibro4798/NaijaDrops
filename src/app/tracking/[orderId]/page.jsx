"use client";

import { useState, useEffect, useRef } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { createClient } from '@/utils/supabase/client';
import { Loader2, MapPin, Package, CheckCircle2, MessageCircle, Share2, Radar, X, AlertTriangle, CreditCard, Check, WifiOff, HandCoins } from 'lucide-react';
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

// A rider's location is only shown as "Live" if we've heard from their
// phone within this window - otherwise it's a real position, just not a
// current one, and the UI says so instead of implying it's still moving.
const STALE_LOCATION_MS = 90 * 1000;

export default function TrackingPage() {
  const { orderId } = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const supabase = createClient();
  const [order, setOrder] = useState(null);
  // FIX (real security/attribution bug): isVendorView used to be set to
  // true for ANY authenticated user whose RLS-permitted read of this order
  // succeeded - but the "Vendor, assigned rider, broadcast rider, or admin
  // can view order" RLS policy on orders legitimately lets a RIDER read it
  // too (they need that to see their own bid/job). This component never
  // checked WHICH of those it actually was - so a rider who was simply
  // offered the job (even one who lost the bid) opening the shared
  // tracking link got the full vendor management view: other riders' bid
  // amounts, and - worse - a "Cancel Order" button for a delivery that
  // isn't theirs to cancel. Chat was similarly broken the other way: a
  // genuinely authenticated rider had currentUserId forced to null
  // whenever isVendorView was false, so their own messages couldn't be
  // attributed to them - the chat system only ever really supported two
  // identities (vendor vs "everyone else, anonymous"), not the three roles
  // that actually exist here (vendor / rider / customer).
  // viewerRole is now computed by an actual ownership comparison (see the
  // load() effect below) and can be 'vendor' | 'rider' | 'customer'.
  // isVendorView is kept as a derived boolean for the many existing
  // isVendorView-gated UI checks below, but it's now backed by real
  // identity instead of "a row came back."
  const [viewerRole, setViewerRole] = useState('customer');
  const isVendorView = viewerRole === 'vendor';
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [expired, setExpired] = useState(false);
  const [currentUserId, setCurrentUserId] = useState(null);
  const [showChat, setShowChat] = useState(false);
  const [chatChannel, setChatChannel] = useState(null);
  const [showCancelConfirm, setShowCancelConfirm] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [linkCopied, setLinkCopied] = useState(false);
  const [showLinkModal, setShowLinkModal] = useState(false);
  const [statusToast, setStatusToast] = useState(null);
  const [bids, setBids] = useState([]);
  const [bidActionId, setBidActionId] = useState(null);
  const [bidsError, setBidsError] = useState(null);
  const [broadcastCount, setBroadcastCount] = useState(0);
  const expandPollRef = useRef(null);
  const anonPollRef = useRef(null);
  const prevStatusRef = useRef(null);

  // FIX: a chat notification (or any other link) pointing here with
  // ?openChat=1&channel=vendor_customer used to do nothing - this query
  // param was never actually read. Now it opens the chat sheet straight to
  // the right thread on load, once we know which role is viewing.
  useEffect(() => {
    if (searchParams.get('openChat') === '1') {
      setChatChannel(searchParams.get('channel') || null);
      setShowChat(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    let channel;
    async function load() {
      // Try the authenticated path first - covers vendors AND riders viewing
      // an order they legitimately have RLS access to (vendor/history links
      // here for vendors; a rider's own job for riders).
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        setCurrentUserId(user.id);
        const { data: authedOrder } = await supabase
          .from('orders')
          .select('*, riders(id, current_lat, current_lng, last_seen_at, users(full_name)), vendors(id, business_name, logo_url, user_id)')
          .eq('id', orderId)
          .single();
        if (authedOrder) {
          // FIX: this used to just be "an authenticated read succeeded" -
          // see the note above the viewerRole state declaration for why
          // that's wrong. Determine which of the two real identities this
          // actually is by comparing the order's own vendor_id/rider_id
          // against a row for THIS user, not by trusting that RLS letting
          // the read through means "this is the vendor."
          const [{ data: myVendorRow }, { data: myRiderRow }] = await Promise.all([
            supabase.from('vendors').select('id').eq('user_id', user.id).maybeSingle(),
            supabase.from('riders').select('id').eq('user_id', user.id).maybeSingle(),
          ]);
          const role =
            myVendorRow && authedOrder.vendor_id === myVendorRow.id ? 'vendor' :
            myRiderRow && authedOrder.rider_id === myRiderRow.id ? 'rider' :
            'customer'; // authenticated (e.g. a broadcast rider who wasn't assigned) but not a party to this order in a privileged sense
          prevStatusRef.current = authedOrder.status;
          setOrder(authedOrder);
          setViewerRole(role);
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
        if (res.status === 410 || json?.expired) { setExpired(true); setLoading(false); return; }
        if (!res.ok || !json.success) { setNotFound(true); setLoading(false); return; }
        prevStatusRef.current = json.order.status;
        setOrder(json.order);
        setViewerRole('customer');
      } catch {
        setNotFound(true);
      }
      setLoading(false);
    }
    load();
    return () => { if (channel) supabase.removeChannel(channel); };
  }, [orderId, supabase]);

  // Live rider location for the vendor's own (authenticated) view. The
  // 'orders' realtime subscription above only ever delivers order columns
  // - it never includes the nested riders(...) join - so this subscribes
  // directly to the assigned rider's own row once it's known, and merges
  // fresh coordinates (and last_seen_at, for the staleness badge) in as
  // they arrive. This depends on the "Vendor can view rider assigned to
  // their order" RLS policy on riders existing - without it, RLS silently
  // returns nothing for both the initial join above and this subscription,
  // which was the actual root cause of rider location never appearing on
  // the vendor's map (it worked fine on the anonymous customer page only
  // because that path reads via a service-role API route that bypasses
  // RLS entirely).
  useEffect(() => {
    const riderId = order?.riders?.id;
    if (!isVendorView || !riderId) return;

    const riderChannel = supabase
      .channel(`rider-location-${riderId}`)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'riders', filter: `id=eq.${riderId}` },
        (payload) => {
          setOrder(prev => prev ? ({
            ...prev,
            riders: { ...prev.riders, current_lat: payload.new.current_lat, current_lng: payload.new.current_lng, last_seen_at: payload.new.last_seen_at }
          }) : prev);
        })
      .subscribe();

    return () => supabase.removeChannel(riderChannel);
  }, [isVendorView, order?.riders?.id, supabase]);

  // FIX (negotiation): a rider could submit a bid via the dashboard, but
  // there was nowhere for the vendor to ever see it - the only place bids
  // were ever displayed was the separate, legacy send-package/step-3
  // quickmatch page, which orders created through vendor/create-delivery
  // (the flow this tracking page is actually for) never go through. This
  // fetches and live-subscribes to bids on THIS order while it's still
  // waiting for a rider, so an incoming offer shows up here instead of
  // nowhere.
  useEffect(() => {
    if (!isVendorView || !order?.id) return;
    const waiting = order.status === 'pending' || order.status === 'looking_for_driver';
    if (!waiting) { setBids([]); return; }

    let cancelled = false;
    const loadBids = async () => {
      // Nested riders(...) rides along the same one-to-one users -> riders
      // relationship rider_visible_to_vendor() already grants the vendor
      // read access through (a rider only ever bids after being broadcast
      // the order, which is exactly what that RLS check allows) - so the
      // photo/rating come along for free with no extra policy needed.
      const { data, error } = await supabase
        .from('bids')
        .select('*, users:rider_id(full_name, receipt_display_name, riders(profile_photo_url, rating))')
        .eq('order_id', order.id)
        .eq('status', 'pending')
        .order('created_at', { ascending: false });
      if (!cancelled && !error) setBids(data || []);
    };
    loadBids();

    const bidChannel = supabase
      .channel(`vendor-bids-${order.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'bids', filter: `order_id=eq.${order.id}` },
        () => loadBids())
      .subscribe();

    return () => {
      cancelled = true;
      supabase.removeChannel(bidChannel);
    };
  }, [isVendorView, order?.id, order?.status, supabase]);

  // "X drivers viewed your request" - counts rows in order_broadcasts for
  // this order (one row per rider the dispatch job fanned out to) while
  // the vendor is on the waiting screen, and ticks up live as the search
  // radius expands and more riders get broadcast the job.
  useEffect(() => {
    if (!isVendorView || !order?.id) return;
    const waiting = order.status === 'pending' || order.status === 'looking_for_driver';
    if (!waiting) { setBroadcastCount(0); return; }

    let cancelled = false;
    const loadCount = async () => {
      const { count, error } = await supabase
        .from('order_broadcasts')
        .select('id', { count: 'exact', head: true })
        .eq('order_id', order.id);
      if (!cancelled && !error) setBroadcastCount(count || 0);
    };
    loadCount();

    const broadcastCountChannel = supabase
      .channel(`vendor-broadcast-count-${order.id}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'order_broadcasts', filter: `order_id=eq.${order.id}` },
        () => loadCount())
      .subscribe();

    return () => {
      cancelled = true;
      supabase.removeChannel(broadcastCountChannel);
    };
  }, [isVendorView, order?.id, order?.status, supabase]);

  const handleAcceptBid = async (bidId) => {
    setBidActionId(bidId);
    setBidsError(null);
    try {
      const { error } = await supabase.rpc('accept_bid', { p_order_id: order.id, p_bid_id: bidId });
      if (error) throw error;
      // The order's own realtime UPDATE subscription (above) picks up the
      // resulting status/rider_id/agreed_price change and moves this page
      // out of the waiting view automatically.
    } catch (err) {
      setBidsError(err.message || 'Could not accept this offer - it may no longer be available.');
    } finally {
      setBidActionId(null);
    }
  };

  const handleDeclineBid = async (bidId) => {
    setBidActionId(bidId);
    setBidsError(null);
    try {
      const { error } = await supabase.rpc('decline_bid', { p_bid_id: bidId });
      if (error) throw error;
      setBids(prev => prev.filter(b => b.id !== bidId));
    } catch (err) {
      setBidsError(err.message || 'Could not decline this offer.');
    } finally {
      setBidActionId(null);
    }
  };

  function announceStatusChange(newStatus) {
    if (prevStatusRef.current === newStatus) return;
    prevStatusRef.current = newStatus;
    setStatusToast(STATUS_LABELS[newStatus] || newStatus);
    setTimeout(() => setStatusToast(null), 4500);
  }

  // Anonymous customers (no account, viewing via the public link) have no
  // realtime subscription available to them at all - light polling closes
  // that gap without needing a realtime connection for someone who isn't
  // logged in.
  useEffect(() => {
    if (isVendorView || !order || notFound) return;
    if (order.status === 'delivered' || order.status === 'cancelled') return;

    anonPollRef.current = setInterval(async () => {
      try {
        const res = await fetch(`/api/track/${orderId}`);
        const json = await res.json();
        if (res.status === 410 || json?.expired) { setExpired(true); return; }
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

  // The "expanding search radius" shown below only actually expands if
  // this effect is running somewhere - it works from whichever screen is
  // actually being watched (vendor's tracking page or the customer's), and
  // stops itself as soon as the order leaves the waiting state.
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
  const trackingUrl = typeof window !== 'undefined' ? `${window.location.origin}/tracking/${orderId}` : '';

  const handleShareTrackingLink = async () => {
    const text = `Track your delivery live: ${order.item_description || 'your package'} is on its way.`;
    if (typeof navigator !== 'undefined' && navigator.share) {
      try {
        await navigator.share({ title: 'Track your NaijaDrops delivery', text, url: trackingUrl });
        return;
      } catch (err) {
        if (err?.name === 'AbortError') return;
        // fall through to clipboard/modal below
      }
    }
    if (typeof navigator !== 'undefined' && navigator.clipboard) {
      try {
        await navigator.clipboard.writeText(trackingUrl);
        setLinkCopied(true);
        setTimeout(() => setLinkCopied(false), 2000);
        return;
      } catch {
        // fall through to the modal below
      }
    }
    setShowLinkModal(true);
  };

  const openChat = (channelKey) => {
    setChatChannel(channelKey || null);
    setShowChat(true);
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

  if (expired) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-charcoal-950 text-center px-6">
        <CheckCircle2 className="text-emerald-500 mb-4" size={40} />
        <p className="text-ink font-black text-xl mb-2">This delivery is complete</p>
        <p className="text-charcoal-400 text-sm max-w-xs">
          This tracking link has expired now that the delivery is done. Contact the sender if you need anything else.
        </p>
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
  const riderLastSeenAt = order.riders?.last_seen_at ?? order.rider?.last_seen_at ?? null;
  const riderIsStale = !!(riderLastSeenAt && (Date.now() - new Date(riderLastSeenAt).getTime() > STALE_LOCATION_MS));
  const riderAssigned = !!(order.rider_id || order.riders?.id || order.rider);
  const isPaid = order.payment_status === 'paid';
  // viewerRole is now real state (see the load() effect) - vendor, rider,
  // or customer, based on actual ownership, not just "logged in".

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
  // yet, so a full 6-step timeline and an empty map box just added noise.
  // Sharing is deliberately not offered here: no rider is matched and no
  // payment has happened yet, so there's nothing worth sending a customer
  // to watch. A chat entry point to the vendor is still useful for the
  // customer while they wait, and for the vendor to cancel if needed.
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
              Searching within <span className="text-emerald-500 font-bold">{radius.toFixed(1)}km</span> of your pickup point{radius < maxRadius ? ' — expanding automatically' : ''}.
            </p>
            <div className="w-full h-1.5 bg-white/5 rounded-full mt-3 overflow-hidden">
              <div className="h-full bg-emerald-500 rounded-full transition-all duration-1000" style={{ width: `${searchPct}%` }} />
            </div>
          </div>

          {isVendorView && (
            <div className="bg-white/[0.03] border border-white/10 rounded-2xl px-5 py-4 flex items-center justify-between">
              <div>
                <p className="text-ink font-black text-sm">
                  {broadcastCount > 0
                    ? `${broadcastCount} rider${broadcastCount > 1 ? 's' : ''} viewed your request`
                    : 'Reaching out to nearby riders…'}
                </p>
                <p className="text-charcoal-500 text-xs mt-0.5">
                  {bids.length > 0 ? 'Waiting for you to review offers' : 'Waiting for offers from riders'}
                </p>
              </div>
              <div className="flex -space-x-2 shrink-0">
                {bids.slice(0, 4).map(bid => {
                  const photo = bid.users?.riders?.profile_photo_url;
                  return photo ? (
                    <img key={bid.id} src={photo} alt="" className="w-8 h-8 rounded-full object-cover border-2 border-charcoal-950" />
                  ) : (
                    <div key={bid.id} className="w-8 h-8 rounded-full bg-charcoal-800 border-2 border-charcoal-950 flex items-center justify-center text-[10px] font-black text-charcoal-400">
                      {(bid.users?.receipt_display_name || bid.users?.full_name || 'R').charAt(0).toUpperCase()}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          <div className="border-t border-white/10 pt-6 space-y-3">
            <div className="flex items-center gap-2 text-sm"><Package size={14} className="text-charcoal-400" /><span className="text-ink font-bold">{order.item_description}</span></div>
            <div className="flex justify-between text-sm"><span className="text-charcoal-400">From</span><span className="text-ink">{order.pickup_name}</span></div>
            <div className="flex justify-between text-sm"><span className="text-charcoal-400">To</span><span className="text-ink">{order.dropoff_name}</span></div>
          </div>

          {/* Incoming bids - riders can propose a different price while a
              job is still unmatched; nothing changes on the order until
              the vendor explicitly accepts one here. */}
          {isVendorView && bids.length > 0 && (
            <div className="border-t border-white/10 pt-6 space-y-3">
              <p className="text-[10px] font-black text-charcoal-400 uppercase tracking-widest flex items-center gap-2">
                <HandCoins size={14} className="text-emerald-500" /> {bids.length} rider{bids.length > 1 ? 's' : ''} proposed a price
              </p>
              {bidsError && (
                <p className="text-red-400 text-xs font-bold bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-2.5">{bidsError}</p>
              )}
              <div className="space-y-3">
                {bids.map(bid => {
                  const riderName = bid.users?.receipt_display_name || bid.users?.full_name || 'Rider';
                  const riderPhoto = bid.users?.riders?.profile_photo_url;
                  const riderRating = bid.users?.riders?.rating;
                  return (
                  <div key={bid.id} className="bg-white/[0.03] border border-white/10 rounded-2xl p-4 flex items-center justify-between gap-3">
                    <div className="flex items-center gap-3 min-w-0">
                      {riderPhoto ? (
                        <img src={riderPhoto} alt={riderName} className="w-11 h-11 rounded-xl object-cover shrink-0" />
                      ) : (
                        <div className="w-11 h-11 rounded-xl bg-charcoal-800 flex items-center justify-center text-sm font-black text-charcoal-400 shrink-0">
                          {riderName.charAt(0).toUpperCase()}
                        </div>
                      )}
                      <div className="min-w-0">
                        <p className="text-ink font-black text-lg font-outfit">₦{Number(bid.amount).toLocaleString()}</p>
                        <p className="text-charcoal-400 text-xs truncate">
                          {riderName}{riderRating ? ` · ★ ${Number(riderRating).toFixed(1)}` : ''} · was ₦{order.agreed_price?.toLocaleString()}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        onClick={() => handleDeclineBid(bid.id)}
                        disabled={bidActionId === bid.id}
                        className="w-10 h-10 bg-white/5 hover:bg-white/10 rounded-xl flex items-center justify-center text-charcoal-400 hover:text-white transition-all disabled:opacity-40"
                      >
                        <X size={16} />
                      </button>
                      <button
                        onClick={() => handleAcceptBid(bid.id)}
                        disabled={bidActionId === bid.id}
                        className="px-4 py-2.5 bg-emerald-500 hover:bg-emerald-400 text-charcoal-950 rounded-xl font-black text-xs uppercase tracking-widest transition-all disabled:opacity-50 flex items-center gap-1.5"
                      >
                        {bidActionId === bid.id ? <Loader2 size={14} className="animate-spin" /> : <><Check size={14} /> Accept</>}
                      </button>
                    </div>
                  </div>
                  );
                })}
              </div>
            </div>
          )}

          {isVendorView ? (
            <button
              onClick={() => setShowCancelConfirm(true)}
              className="w-full flex items-center justify-center gap-2 py-4 rounded-2xl bg-white/5 border border-white/10 text-red-400 text-xs font-black uppercase tracking-widest hover:bg-red-500/10 hover:border-red-500/20 transition-all"
            >
              Cancel Order
            </button>
          ) : (
            <button
              onClick={() => openChat(viewerRole === 'rider' ? 'vendor_rider' : 'vendor_customer')}
              className="w-full flex items-center justify-center gap-2 py-4 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs font-black uppercase tracking-widest hover:bg-emerald-500/20 transition-all"
            >
              {/* FIX: this button used to always open the vendor<->customer
                  channel regardless of who was viewing - harmless before,
                  since a rider never legitimately reached this branch (the
                  viewerRole bug above sent them into the vendor view
                  instead). Now that a rider correctly lands here, they need
                  the vendor<->rider channel and the label to match who
                  they're actually messaging. */}
              <MessageCircle size={14} /> {viewerRole === 'rider' ? 'Message the vendor' : 'Message the sender'}
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

        {showChat && (viewerRole !== 'customer' ? currentUserId : true) && (
          <OrderChat
            orderId={order.id}
            currentUserId={viewerRole !== 'customer' ? currentUserId : null}
            viewerRole={viewerRole}
            riderAssigned={false}
            initialChannel={chatChannel}
            onClose={() => setShowChat(false)}
          />
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
              riderIsStale ? (
                <div className="absolute top-4 left-4 bg-charcoal-950/80 backdrop-blur border border-amber-500/30 rounded-full px-3 py-1.5 flex items-center gap-2 pointer-events-none">
                  <WifiOff size={11} className="text-amber-400" />
                  <span className="text-amber-400 text-[10px] font-black uppercase tracking-widest">Signal delayed</span>
                </div>
              ) : (
                <div className="absolute top-4 left-4 bg-charcoal-950/80 backdrop-blur border border-emerald-500/30 rounded-full px-3 py-1.5 flex items-center gap-2 pointer-events-none">
                  <span className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse" />
                  <span className="text-emerald-400 text-[10px] font-black uppercase tracking-widest">Live</span>
                </div>
              )
            )}
          </>
        ) : (
          <div className="h-full flex items-center justify-center text-charcoal-500 text-sm bg-charcoal-900">
            <MapPin className="mr-2" size={16} /> Waiting for rider location…
          </div>
        )}
      </div>

      <div className="px-6 py-8 space-y-8">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="text-charcoal-400 text-[11px] font-black uppercase tracking-widest">Status</p>
            <p className="text-ink font-black text-2xl font-outfit truncate">{STATUS_LABELS[order.status] || order.status}</p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {/* FIX: the share button used to always be visible and active
                regardless of payment - a vendor could hand a tracking link
                to a customer before a rider had even been paid, which
                could dead-end the customer on a stalled order. It's now
                only rendered once payment_status is 'paid' (see the
                prominent share banner below for the payment-required
                state, which is the actual "next step" nudge). */}
            {isVendorView && isPaid && (
              <button
                onClick={handleShareTrackingLink}
                className="w-12 h-12 bg-white/5 border border-white/10 rounded-2xl flex items-center justify-center text-ink hover:bg-white/10 transition-all active:scale-95"
                title="Share tracking link"
              >
                {linkCopied ? <Check size={18} className="text-emerald-500" /> : <Share2 size={18} />}
              </button>
            )}
            <button
              onClick={() => openChat(null)}
              className="w-12 h-12 bg-emerald-500/10 border border-emerald-500/20 rounded-2xl flex items-center justify-center text-emerald-500 hover:bg-emerald-500/20 transition-all active:scale-95"
              title="Message"
            >
              <MessageCircle size={20} />
            </button>
          </div>
        </div>

        {/* FIX: this section used to sit BELOW the status stepper. Moved to
            the top of the content, directly under the header, so it's the
            first thing a vendor sees: while unpaid it's the clear "do this
            next" prompt, and the moment payment clears it flips straight
            into the share prompt - both are the single most important
            action available at that stage, so both get top placement. */}
        {isVendorView && order.status === 'matched' && !isPaid && (
          <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/5 p-5 space-y-3">
            <div className="flex items-center gap-2 text-emerald-400 text-xs font-black uppercase tracking-widest">
              <CreditCard size={16} /> Payment required
            </div>
            <p className="text-charcoal-300 text-sm leading-relaxed">
              A rider has been assigned. Complete payment now so they can head to pickup - this order stays paused until then. The tracking link unlocks for your customer right after.
            </p>
            <button
              onClick={() => router.push(`/payment?orderId=${order.id}`)}
              className="w-full py-4 bg-emerald-500 hover:bg-emerald-400 text-charcoal-950 rounded-2xl font-black text-sm uppercase tracking-widest transition-all active:scale-95"
            >
              Pay ₦{order.agreed_price?.toLocaleString()} Now
            </button>
            {/* FIX: this button used to always show regardless of whether a
                price had already been agreed - including right after the
                vendor had just accepted the rider's own suggested price,
                which is itself an agreement. It only renders now while
                order.price_locked is still false (see accept_bid /
                respond_to_price_offer - both set it true the instant a
                real agreement happens), matching the same rule OrderChat
                itself enforces. */}
            {!order.price_locked && (
              <button
                onClick={() => openChat('vendor_rider')}
                className="w-full py-3 bg-white/5 border border-white/10 rounded-2xl text-charcoal-300 font-bold text-xs uppercase tracking-widest transition-all hover:bg-white/10 flex items-center justify-center gap-2"
              >
                <MessageCircle size={13} /> Negotiate price with rider first
              </button>
            )}
          </div>
        )}

        {isVendorView && isPaid && order.status !== 'delivered' && order.status !== 'cancelled' && (
          <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/5 p-5 space-y-3">
            <div className="flex items-center gap-2 text-emerald-400 text-xs font-black uppercase tracking-widest">
              <Check size={16} /> Payment confirmed
            </div>
            <p className="text-charcoal-300 text-sm leading-relaxed">
              Share this tracking link with your customer now, so they can watch the delivery live.
            </p>
            <button
              onClick={handleShareTrackingLink}
              className="w-full py-4 bg-emerald-500 hover:bg-emerald-400 text-charcoal-950 rounded-2xl font-black text-sm uppercase tracking-widest transition-all active:scale-95 flex items-center justify-center gap-2"
            >
              {linkCopied ? <><Check size={16} /> Copied</> : <><Share2 size={16} /> Share Tracking Link</>}
            </button>
          </div>
        )}

        <OrderStatusStepper steps={STATUS_STEPS} currentStatus={order.status} />

        <div className="border-t border-white/10 pt-6 space-y-3">
          <div className="flex items-center gap-2 text-sm"><Package size={14} className="text-charcoal-400" /><span className="text-ink font-bold">{order.item_description}</span></div>
          <div className="flex justify-between text-sm"><span className="text-charcoal-400">From</span><span className="text-ink">{order.pickup_name}</span></div>
          <div className="flex justify-between text-sm"><span className="text-charcoal-400">To</span><span className="text-ink">{order.dropoff_name}</span></div>
          {riderName && (
            <div className="flex justify-between text-sm">
              <span className="text-charcoal-400">Rider</span>
              <span className="text-ink font-bold flex items-center gap-1.5">
                {riderName}
                {riderIsStale && <span className="text-amber-400 text-[10px] font-black uppercase tracking-widest">(signal delayed)</span>}
              </span>
            </div>
          )}
        </div>
      </div>

      {showChat && (viewerRole !== 'customer' ? currentUserId : true) && (
        <OrderChat
          orderId={order.id}
          currentUserId={viewerRole !== 'customer' ? currentUserId : null}
          viewerRole={viewerRole}
          riderAssigned={riderAssigned}
          initialChannel={chatChannel}
          onClose={() => setShowChat(false)}
        />
      )}

      {/* Final fallback if native share AND clipboard both failed/were
          unavailable - guarantees the link is always actually obtainable,
          never a silent dead end. */}
      {showLinkModal && (
        <div className="fixed inset-0 z-[150] flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="bg-charcoal-900 border border-white/10 rounded-t-3xl sm:rounded-3xl w-full max-w-sm p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-ink font-black text-base">Tracking link</h3>
              <button onClick={() => setShowLinkModal(false)} className="w-8 h-8 rounded-full bg-white/5 flex items-center justify-center text-charcoal-400 hover:text-ink">
                <X size={14} />
              </button>
            </div>
            <p className="text-charcoal-500 text-xs">Couldn't share or copy automatically - select the link below and copy it manually.</p>
            <input
              readOnly
              value={trackingUrl}
              onFocus={(e) => e.target.select()}
              className="w-full bg-black/30 border border-white/10 rounded-xl px-4 py-3 text-ink text-xs font-mono"
            />
          </div>
        </div>
      )}
    </div>
  );
}
