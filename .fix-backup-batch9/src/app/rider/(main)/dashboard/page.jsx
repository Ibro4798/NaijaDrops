"use client";

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/utils/supabase/client';
import { Loader2 } from 'lucide-react';
import IncomingOrderCard from '@/components/rider/IncomingOrderCard';
import DriverHeartbeat from '@/components/rider/DriverHeartbeat';
import { getReliableLocation } from '@/utils/geolocation';

export default function RiderDashboard() {
  const router = useRouter();
  const supabase = createClient();
  const [rider, setRider] = useState(null);
  const [jobs, setJobs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [toggling, setToggling] = useState(false);
  const [error, setError] = useState(null);

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
  }, [supabase]);

  useEffect(() => {
    let channel;
    async function init() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { router.push('/auth/login'); return; }

      const { data: riderRow } = await supabase.from('riders').select('*').eq('user_id', user.id).single();
      if (!riderRow) { router.push('/rider/onboarding'); return; }
      setRider(riderRow);

      if (riderRow.status === 'approved') {
        await fetchBroadcastJobs(riderRow.id);

        // Live updates: new broadcasts targeting this rider, and removal when an order
        // is matched/cancelled elsewhere.
        channel = supabase
          .channel(`rider-feed-${riderRow.id}`)
          .on('postgres_changes', { event: '*', schema: 'public', table: 'order_broadcasts', filter: `rider_id=eq.${riderRow.id}` },
            () => fetchBroadcastJobs(riderRow.id))
          .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'orders' },
            () => fetchBroadcastJobs(riderRow.id))
          .subscribe();
      }
      setLoading(false);
    }
    init();
    return () => { if (channel) supabase.removeChannel(channel); };
  }, [supabase, router, fetchBroadcastJobs]);

  async function toggleOnlineStatus() {
    if (!rider) return;
    setToggling(true);
    setError(null);

    if (rider.operational_status === 'online') {
      const { error: updErr } = await supabase.from('riders')
        .update({ operational_status: 'offline' }).eq('id', rider.id);
      if (!updErr) setRider({ ...rider, operational_status: 'offline' });
      setToggling(false);
      return;
    }

    // Going online requires a real location fix - get_nearby_online_riders() filters
    // on current_lat/current_lng being non-null, so skipping this breaks matching entirely.
    if (!navigator.geolocation) {
      setError('Location services are required to go online.');
      setToggling(false);
      return;
    }
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const { latitude, longitude } = pos.coords;
        const { error: updErr } = await supabase.from('riders').update({
          operational_status: 'online',
          current_lat: latitude,
          current_lng: longitude
        }).eq('id', rider.id);
        if (!updErr) {
          setRider({ ...rider, operational_status: 'online', current_lat: latitude, current_lng: longitude });
          await fetchBroadcastJobs(rider.id);
        }
        setToggling(false);
      },
      () => { setError('Could not get your location. Enable location access and try again.'); setToggling(false); },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  }

  async function acceptAtBasePrice(order) {
    setError(null);
    const { error: rpcErr } = await supabase.rpc('accept_order_direct', { p_order_id: order.id });
    if (rpcErr) { setError(rpcErr.message); return; }
    router.push('/rider/active-job');
  }

  async function counterOffer(order, amount) {
    setError(null);
    const { data: { user } } = await supabase.auth.getUser();
    const { error: bidErr } = await supabase.from('bids').insert({
      order_id: order.id, rider_id: user.id, amount, status: 'pending'
    });
    if (bidErr) { setError(bidErr.message); return; }
    setJobs(jobs.filter(j => j.id !== order.id));
  }

  async function rejectJob(order) {
    if (!rider) return;
    await supabase.from('order_broadcasts').delete().eq('order_id', order.id).eq('rider_id', rider.id);
    setJobs(jobs.filter(j => j.id !== order.id));
  }

  if (loading) return <div className="flex justify-center py-20"><Loader2 className="animate-spin text-emerald-500" /></div>;

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
      {/* Headless: pings riders.current_lat/lng + rider_locations every ~35s while online.
          This is the fix for tracking showing a frozen dot - previously location was only
          captured once, at the moment "Go Online" was pressed. */}
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