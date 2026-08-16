"use client";

import { useState, useEffect, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/utils/supabase/client';
import { Loader2 } from 'lucide-react';
import { AnimatePresence, motion } from 'framer-motion';
import Skeleton from '@/components/ui/Skeleton';
import IncomingOrderCard from '@/components/rider/IncomingOrderCard';
import DriverHeartbeat from '@/components/rider/DriverHeartbeat';
import { getReliableLocation } from '@/utils/geolocation';
import { roundUpTo50 } from '@/utils/pricing';

export default function RiderDashboard() {
  const router = useRouter();
  const supabase = createClient();
  const [rider, setRider] = useState(null);
  const [jobs, setJobs] = useState([]);
  const [myBids, setMyBids] = useState({}); // order_id -> bid row
  const [rejectedNotice, setRejectedNotice] = useState(null);
  const [acceptedNotice, setAcceptedNotice] = useState(null);
  const [submittingBidFor, setSubmittingBidFor] = useState(null);
  const [loading, setLoading] = useState(true);
  const [toggling, setToggling] = useState(false);
  const [error, setError] = useState(null);
  const [hasActiveJob, setHasActiveJob] = useState(false);
  const userIdRef = useRef(null);

  // A rider with a job already in progress (matched/picked_up/in_transit)
  // has to stay online and finish it - they shouldn't be sitting on the
  // feed at all, let alone able to toggle themselves offline mid-job. This
  // checks for one and, if found, sends them straight to it.
  const checkActiveJob = useCallback(async (riderRowId) => {
    const { data } = await supabase
      .from('orders')
      .select('id')
      .eq('rider_id', riderRowId)
      .in('status', ['matched', 'picked_up', 'in_transit'])
      .limit(1)
      .maybeSingle();
    const active = !!data;
    setHasActiveJob(active);
    return active;
  }, [supabase]);

  const fetchBroadcastJobs = useCallback(async (riderId) => {
    // order_broadcasts rows are created by the dispatch API for riders within the
    // current (possibly expanded) radius. Join to orders for the actual job data.
    const { data, error: fetchErr } = await supabase
      .from('order_broadcasts')
      .select('order_id, orders(*)')
      .eq('rider_id', riderId);

    if (fetchErr) { console.error('Job feed fetch error:', fetchErr); return; }

    const openJobs = (data || [])
      .map(row => row.orders)
      .filter(o => o && (o.status === 'pending' || o.status === 'looking_for_driver'));
    setJobs(openJobs);
    return openJobs;
  }, [supabase]);

  // FIX: onCounterOffer was wired end-to-end (bids insert, accept_bid RPC,
  // even a realtime-friendly refetch) but IncomingOrderCard had no UI that
  // ever called it - a rider's bid never had anywhere to go in. Now that
  // the card can actually submit one, this also needs to know which jobs
  // already have a pending bid from this rider, so the card can show
  // "waiting for vendor" instead of letting a duplicate bid go in.
  const fetchMyBids = useCallback(async (userId, orderIds) => {
    if (!orderIds || orderIds.length === 0) { setMyBids({}); return; }
    const { data } = await supabase
      .from('bids')
      .select('*')
      .eq('rider_id', userId)
      .in('order_id', orderIds);
    const map = {};
    (data || []).forEach(b => { map[b.order_id] = b; });
    setMyBids(map);
  }, [supabase]);

  useEffect(() => {
    let broadcastChannel, bidChannel;
    async function init() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { router.push('/auth/login'); return; }
      userIdRef.current = user.id;

      const { data: riderRow } = await supabase.from('riders').select('*').eq('user_id', user.id).single();
      if (!riderRow) { router.push('/rider/onboarding'); return; }
      setRider(riderRow);

      if (riderRow.status === 'approved') {
        // A job already in progress takes them straight there instead of
        // showing the feed - see checkActiveJob above.
        const alreadyOnAJob = await checkActiveJob(riderRow.id);
        if (alreadyOnAJob) {
          router.replace('/rider/active-job');
          return;
        }

        const openJobs = await fetchBroadcastJobs(riderRow.id);
        await fetchMyBids(user.id, (openJobs || []).map(j => j.id));

        broadcastChannel = supabase
          .channel(`rider-feed-${riderRow.id}`)
          .on('postgres_changes', { event: '*', schema: 'public', table: 'order_broadcasts', filter: `rider_id=eq.${riderRow.id}` },
            async () => {
              const jobs = await fetchBroadcastJobs(riderRow.id);
              fetchMyBids(user.id, (jobs || []).map(j => j.id));
            })
          .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'orders' },
            () => fetchBroadcastJobs(riderRow.id))
          .subscribe();

        // Live bid status - so "waiting for vendor" flips to a clear
        // notice the moment the vendor responds, without the rider needing
        // to refresh. FIX: a declined bid used to just vanish from myBids
        // silently - the card reverted straight back to the normal
        // accept/bid state with zero indication anything had happened, so
        // a rider had no way to know their offer was actually seen and
        // turned down versus just... still sitting there.
        bidChannel = supabase
          .channel(`rider-bids-${user.id}`)
          .on('postgres_changes', { event: '*', schema: 'public', table: 'bids', filter: `rider_id=eq.${user.id}` },
            (payload) => {
              const row = payload.new || payload.old;
              if (!row) return;

              if (payload.new?.status === 'rejected' && payload.old?.status === 'pending') {
                setRejectedNotice({ orderId: row.order_id, amount: row.amount });
                setTimeout(() => setRejectedNotice(prev => (prev?.orderId === row.order_id ? null : prev)), 8000);
              }

              // FIX: accept_bid() assigns the order to this rider server-side
              // the instant the vendor accepts, but the rider's UI used to
              // just let the bid quietly drop out of myBids with no
              // indication anything had happened - the job was already
              // theirs and they had no idea. Now it's an immediate,
              // impossible-to-miss handoff straight into the job.
              if (payload.new?.status === 'accepted' && payload.old?.status === 'pending') {
                setAcceptedNotice({ orderId: row.order_id, amount: row.amount });
                router.push('/rider/active-job');
              }

              setMyBids(prev => {
                if (payload.eventType === 'DELETE' || (payload.new && payload.new.status !== 'pending')) {
                  const next = { ...prev };
                  delete next[row.order_id];
                  return next;
                }
                return { ...prev, [row.order_id]: payload.new };
              });
            })
          .subscribe();
      }
      setLoading(false);
    }
    init();
    return () => {
      if (broadcastChannel) supabase.removeChannel(broadcastChannel);
      if (bidChannel) supabase.removeChannel(bidChannel);
    };
  }, [supabase, router, fetchBroadcastJobs, fetchMyBids, checkActiveJob]);

  // Same root cause as the active-job page: a phone's browser tab drops
  // its realtime WebSocket when the screen locks or the app backgrounds,
  // and Supabase does not replay whatever happened while disconnected -
  // so a bid that got accepted, or a new job that came in, while the
  // rider's screen was off just sat there invisible until a manual
  // refresh. This re-syncs the instant the tab/phone comes back.
  useEffect(() => {
    if (!rider || rider.status !== 'approved') return;

    let cancelled = false;
    const resync = async () => {
      if (cancelled) return;
      const alreadyOnAJob = await checkActiveJob(rider.id);
      if (alreadyOnAJob) {
        router.replace('/rider/active-job');
        return;
      }
      const openJobs = await fetchBroadcastJobs(rider.id);
      await fetchMyBids(userIdRef.current, (openJobs || []).map(j => j.id));
    };

    const handleVisible = () => {
      if (document.visibilityState === 'visible') resync();
    };
    document.addEventListener('visibilitychange', handleVisible);
    window.addEventListener('focus', resync);
    window.addEventListener('online', resync);
    return () => {
      cancelled = true;
      document.removeEventListener('visibilitychange', handleVisible);
      window.removeEventListener('focus', resync);
      window.removeEventListener('online', resync);
    };
  }, [rider, checkActiveJob, fetchBroadcastJobs, fetchMyBids, router]);

  async function toggleOnlineStatus() {
    if (!rider) return;
    setToggling(true);
    setError(null);

    if (rider.operational_status === 'online') {
      // A rider mid-delivery has to stay online until it's done - the
      // dashboard redirect above should already keep them off this screen
      // entirely while a job is active, but this is the last line of
      // defense in case of a race (e.g. a bid gets accepted in the
      // background right as they tap the button).
      if (hasActiveJob) {
        setError("You have a delivery in progress - finish it before going offline.");
        setToggling(false);
        return;
      }
      const { error: updErr } = await supabase.from('riders')
        .update({ operational_status: 'offline' }).eq('id', rider.id);
      if (!updErr) setRider({ ...rider, operational_status: 'offline' });
      setToggling(false);
      return;
    }

    if (!navigator.geolocation) {
      setError('Location services are required to go online.');
      setToggling(false);
      return;
    }

    const loc = await getReliableLocation();
    if (!loc) {
      setError('Could not get your location. Check that location access is enabled for this site, and that you have a network connection, then try again.');
      setToggling(false);
      return;
    }

    const { error: updErr } = await supabase.from('riders').update({
      operational_status: 'online',
      current_lat: loc.lat,
      current_lng: loc.lng
    }).eq('id', rider.id);
    if (!updErr) {
      setRider({ ...rider, operational_status: 'online', current_lat: loc.lat, current_lng: loc.lng });
      const openJobs = await fetchBroadcastJobs(rider.id);
      fetchMyBids(userIdRef.current, (openJobs || []).map(j => j.id));
    } else {
      setError('Could not update your status. Try again.');
    }
    setToggling(false);
  }

  async function acceptAtBasePrice(order) {
    setError(null);
    const { error: rpcErr } = await supabase.rpc('accept_order_direct', { p_order_id: order.id });
    if (rpcErr) { setError(rpcErr.message); return; }
    router.push('/rider/active-job');
  }

  async function counterOffer(order, amount) {
    // Defense in depth: IncomingOrderCard already rounds before calling
    // this, but this is the actual point the amount becomes a real bid in
    // the database, so it rounds again rather than trusting every future
    // caller to remember to.
    const roundedAmount = roundUpTo50(amount);
    setError(null);
    setSubmittingBidFor(order.id);
    const { data: { user } } = await supabase.auth.getUser();
    const { data, error: bidErr } = await supabase
      .from('bids')
      .insert({ order_id: order.id, rider_id: user.id, amount: roundedAmount, status: 'pending' })
      .select()
      .single();
    setSubmittingBidFor(null);
    if (bidErr) { setError(bidErr.message); return; }
    // Bid stays visible in the "waiting for vendor" state now - it used to
    // be removed from the feed entirely on submission, which meant a rider
    // could never see their own pending offer or fall back to accepting
    // the base price without it reappearing first.
    setMyBids(prev => ({ ...prev, [order.id]: data }));
  }

  async function rejectJob(order) {
    if (!rider) return;
    await supabase.from('order_broadcasts').delete().eq('order_id', order.id).eq('rider_id', rider.id);
    setJobs(jobs.filter(j => j.id !== order.id));
  }

  if (loading) {
    return (
      <div className="space-y-8 pb-32">
        <div className="flex items-center justify-between">
          <div className="space-y-2">
            <Skeleton className="h-2.5 w-14" />
            <Skeleton className="h-7 w-24" />
          </div>
          <Skeleton className="h-12 w-32 rounded-2xl" />
        </div>
        <div className="space-y-6">
          {[1, 2].map((i) => (
            <div key={i} className="bg-white/[0.03] border border-white/10 rounded-2xl p-5 space-y-4">
              <div className="flex items-center gap-3">
                <Skeleton className="w-12 h-12 rounded-2xl shrink-0" />
                <div className="flex-1 space-y-2">
                  <Skeleton className="h-2.5 w-1/3" />
                  <Skeleton className="h-4 w-2/3" />
                </div>
              </div>
              <Skeleton className="h-3 w-full" />
              <Skeleton className="h-3 w-4/5" />
              <div className="flex gap-3 pt-2">
                <Skeleton className="h-10 flex-1 rounded-xl" />
                <Skeleton className="h-10 flex-1 rounded-xl" />
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (rider?.status !== 'approved') {
    const status = rider?.status;
    return (
      <div className="flex flex-col items-center justify-center py-24 text-center gap-4 px-6">
        <p className="text-ink font-black text-lg">
          {status === 'pending' ? 'Your application is under review.' :
           status === 'rejected' ? 'Your rider application was not approved.' :
           status === 'paused' ? "You've been paused by an admin." :
           'Finish onboarding to start receiving jobs.'}
        </p>
        {status === 'paused' && (
          <p className="text-charcoal-400 text-sm max-w-xs">
            You can't go online right now. This isn't a rejection - message support below and we'll sort it out.
          </p>
        )}
        {(status === 'rejected' || status === 'paused') && rider?.rejection_reason && (
          <div className="w-full max-w-sm bg-white/[0.03] border border-white/10 rounded-2xl p-4 text-left">
            <div className="text-[10px] font-black text-charcoal-500 uppercase tracking-widest mb-1">Reason</div>
            <p className="text-charcoal-300 text-xs">{rider.rejection_reason}</p>
          </div>
        )}
        {status !== 'pending' && status !== 'rejected' && status !== 'paused' && (
          <a href="/rider/onboarding" className="bg-emerald-500 text-charcoal-950 font-black py-3 px-8 rounded-2xl uppercase text-xs tracking-widest">
            Continue Onboarding
          </a>
        )}
        {(status === 'paused') ? (
          <a href="/support" className="bg-emerald-500 text-charcoal-950 font-black py-3 px-8 rounded-2xl uppercase text-xs tracking-widest">
            Message Support
          </a>
        ) : (
          <a href="/support" className="text-emerald-400 font-bold text-sm underline">Contact Support</a>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-8 pb-32">
      <DriverHeartbeat riderId={rider.id} isOnline={rider.operational_status === 'online'} />

      <div className="flex items-center justify-between">
        <div>
          <p className="text-charcoal-400 text-[11px] font-black uppercase tracking-widest">Status</p>
          <p className="text-ink font-black text-2xl font-outfit">
            {rider.operational_status === 'online' ? 'Online' : 'Offline'}
          </p>
        </div>
        <button
          onClick={toggleOnlineStatus}
          disabled={toggling}
          className={`px-6 py-3 rounded-2xl font-black text-sm uppercase tracking-widest transition-all ${
            rider.operational_status === 'online'
              ? 'bg-red-500/10 text-red-400 border border-red-500/20'
              : 'bg-emerald-500 text-charcoal-950'
          }`}
        >
          {toggling ? <Loader2 className="animate-spin" size={16} /> : rider.operational_status === 'online' ? 'Go Offline' : 'Go Online'}
        </button>
      </div>

      {error && <p className="text-red-400 text-sm font-bold">{error}</p>}

      <AnimatePresence>
        {acceptedNotice && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="bg-emerald-500/10 border border-emerald-500/20 rounded-2xl px-5 py-4"
          >
            <p className="text-emerald-400 text-sm font-bold">
              Your offer of ₦{Number(acceptedNotice.amount).toLocaleString()} was accepted — this job is yours. Taking you there now...
            </p>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {rejectedNotice && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="bg-amber-500/10 border border-amber-500/20 rounded-2xl px-5 py-4 flex items-center justify-between gap-3"
          >
            <p className="text-amber-400 text-sm font-bold">
              Your offer of ₦{Number(rejectedNotice.amount).toLocaleString()} was declined by the vendor.
            </p>
            <button onClick={() => setRejectedNotice(null)} className="text-amber-400/60 hover:text-amber-400 shrink-0 text-xs font-black uppercase tracking-widest">
              Dismiss
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {rider.operational_status !== 'online' ? (
        <p className="text-charcoal-400 text-center py-16">Go online to start receiving jobs.</p>
      ) : jobs.length === 0 ? (
        <p className="text-charcoal-400 text-center py-16">No jobs nearby right now. Stay online — the search radius expands automatically.</p>
      ) : (
        <div className="space-y-6">
          {jobs.map(job => (
            <IncomingOrderCard
              key={job.id}
              order={job}
              myBid={myBids[job.id]}
              bidSubmitting={submittingBidFor === job.id}
              isEmbedded
              onAcceptBase={() => acceptAtBasePrice(job)}
              onCounterOffer={(amount) => counterOffer(job, amount)}
              onReject={() => rejectJob(job)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
