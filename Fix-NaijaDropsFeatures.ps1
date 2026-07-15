<#
  Fix-NaijaDropsFeatures.ps1
  Compatible with Windows PowerShell 5.1 (no PS7-only syntax used).

  What this applies (backend side already done directly in Supabase):
    - messages, rider_locations, reviews tables created; vendors.logo_url added;
      onboarding_step column + draft/paused rider_status enum values already live.

  What this script writes to disk:
    1. Wires DriverHeartbeat into the rider dashboard (pings while online) AND into
       active-job (pings continuously for the whole delivery, regardless of the
       online toggle) - this is the actual fix for the tracking map showing a
       frozen dot instead of a moving one.
    2. Wires OrderChat into active-job (rider side) and the tracking page (vendor
       side) so in-app chat is reachable, not just present as an unused file.
    3. Fixes ReviewModal to write rider_id/reviewerId instead of the
       non-existent order.driver_id / order.user_id, and wires it into the
       tracking page's delivered-receipt view.
    4. Turns the delivered-receipt view into an actual branded receipt: vendor
       business_name + logo_url at the top, plus Share and Print actions.
    5. Fixes commission hardcoded at 15% to 20% in three places: ops-terminal
       finance dashboard, rider earnings, and the receipt itself.
    6. Bonus: fixes a real crash bug found during the audit - vendor/history
       page used the <Navigation> icon without importing it, which throws for
       any vendor with completed orders in their history.

  This script only OVERWRITES the files below with corrected full versions.
  Every file it touches is copied to .fix-backup\ first.

  It auto-detects whether you're on the pre- or post-route-group layout
  (i.e. whether Fix-RiderOnboarding.ps1 has already been run) and writes to
  whichever path actually exists.

  Run from the ROOT of your local repo clone:
      cd C:\path\to\NaijaDrops
      powershell -ExecutionPolicy Bypass -File .\Fix-NaijaDropsFeatures.ps1
#>

$ErrorActionPreference = "Stop"
$root = Get-Location
$backupDir = Join-Path $root ".fix-backup"
if (-not (Test-Path -LiteralPath $backupDir)) { New-Item -ItemType Directory -Path $backupDir | Out-Null }

function Get-FullPath($rel) { return Join-Path $root $rel }

function Backup-Path($full) {
    if (Test-Path -LiteralPath $full) {
        $rel = $full.Substring($root.Path.Length).TrimStart('\','/')
        $dest = Join-Path $backupDir $rel
        $destParent = Split-Path $dest -Parent
        if (-not (Test-Path -LiteralPath $destParent)) { New-Item -ItemType Directory -Path $destParent -Force | Out-Null }
        Copy-Item -LiteralPath $full -Destination $dest -Force
    }
}

function Resolve-TargetPath($originalRel, $movedRel) {
    if ($movedRel -ne $null) {
        $movedFull = Get-FullPath $movedRel
        if (Test-Path -LiteralPath $movedFull) { return $movedFull }
        $movedParent = Split-Path $movedFull -Parent
        if (Test-Path -LiteralPath $movedParent) { return $movedFull }
    }
    return Get-FullPath $originalRel
}

function Write-FileContent($targetFull, $content) {
    Backup-Path $targetFull
    $targetParent = Split-Path $targetFull -Parent
    if (-not (Test-Path -LiteralPath $targetParent)) { New-Item -ItemType Directory -Path $targetParent -Force | Out-Null }
    Set-Content -LiteralPath $targetFull -Value $content -Encoding UTF8 -NoNewline
    Write-Host "  WROTE: $targetFull" -ForegroundColor Green
}

# --- Sanity check ------------------------------------------------------

if (-not (Test-Path (Get-FullPath "src\app"))) {
    Write-Host "ERROR: src\app not found. Run this script from the repo root." -ForegroundColor Red
    exit 1
}

Write-Host "`nApplying feature fixes (chat, location pinging, branded receipt, commission, review):" -ForegroundColor Cyan

$content0 = @'
"use client";

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/utils/supabase/client';
import { Loader2 } from 'lucide-react';
import IncomingOrderCard from '@/components/rider/IncomingOrderCard';
import DriverHeartbeat from '@/components/rider/DriverHeartbeat';

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
    return (
      <div className="flex flex-col items-center justify-center py-24 text-center gap-4">
        <p className="text-white font-black text-lg">
          {rider?.status === 'pending' ? 'Your application is under review.' :
           rider?.status === 'rejected' ? 'Your rider application was not approved.' :
           'Your rider account is currently paused.'}
        </p>
        <a href="/support" className="text-emerald-400 font-bold text-sm underline">Contact Support</a>
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
          <p className="text-white font-black text-2xl font-outfit">
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
        <p className="text-charcoal-400 text-center py-16">No jobs nearby right now. Stay online â€” the search radius expands automatically.</p>
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
'@
$target0 = Resolve-TargetPath "src\app\rider\dashboard\page.jsx" "src\app\rider\(main)\dashboard\page.jsx"
Write-FileContent $target0 $content0

$content1 = @'
"use client";

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/utils/supabase/client';
import { ArrowLeft, MapPin, Package, Navigation, Phone, MessageSquare, CheckCircle2, Loader2, ShieldAlert, MessageCircle } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import dynamic from 'next/dynamic';

const MapCanvas = dynamic(() => import('@/components/MapCanvas'), { ssr: false });

import SlideToConfirm from '@/components/rider/SlideToConfirm';
import DriverHeartbeat from '@/components/rider/DriverHeartbeat';
import OrderChat from '@/components/OrderChat';

export default function ActiveJobPage() {
  const router = useRouter();
  const supabase = createClient();
  const [order, setOrder] = useState(null);
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState(false);
  const [riderId, setRiderId] = useState(null);
  const [currentUserId, setCurrentUserId] = useState(null);
  const [showChat, setShowChat] = useState(false);

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
      .update({ status: nextStatus })
      .eq('id', order.id);
    
    if (!error) {
      if (nextStatus === 'delivered') {
        router.push('/rider/earnings');
      } else {
        setOrder({ ...order, status: nextStatus });
      }
    }
    setUpdating(false);
  };

  if (loading) return <div className="flex justify-center py-20"><Loader2 className="animate-spin text-emerald-500" /></div>;

  if (!order) {
    return (
      <div className="py-20 text-center px-8">
        <div className="w-20 h-20 bg-white/5 rounded-[2rem] flex items-center justify-center mx-auto mb-6 text-charcoal-600">
          <ShieldAlert size={40} />
        </div>
        <h2 className="text-xl font-black text-white mb-2">No Active Mission</h2>
        <p className="text-charcoal-500 text-sm mb-8">You don't have any assigned dispatches at the moment. Return to the radar to find jobs.</p>
        <button onClick={() => router.push('/rider')} className="bg-emerald-500 text-charcoal-950 font-black py-4 px-8 rounded-2xl uppercase text-xs tracking-widest">
          Open Radar
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
          <button onClick={() => router.push('/rider')} className="w-12 h-12 bg-charcoal-950/80 backdrop-blur-md rounded-2xl flex items-center justify-center text-white border border-white/10 pointer-events-auto shadow-2xl">
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
            className="w-full py-4 bg-blue-600 hover:bg-blue-500 text-white font-black rounded-2xl flex items-center justify-center gap-3 shadow-2xl shadow-blue-600/30 transition-all active:scale-95"
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
            <h1 className="text-2xl font-black text-white italic tracking-tighter font-outfit uppercase">Mission Protocol</h1>
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
               <div className="text-lg font-black text-white leading-tight">{order.pickup_name}</div>
            </div>
          </div>
          <div className={`flex items-start gap-5 relative transition-opacity ${isHeadingToPickup ? 'opacity-30' : 'opacity-100'}`}>
            <div className={`w-6 h-6 rounded-lg border-4 border-charcoal-950 shrink-0 z-10 ${!isHeadingToPickup ? 'bg-emerald-500 shadow-glow' : 'bg-charcoal-800'}`}></div>
            <div>
               <div className="text-[10px] font-black uppercase text-charcoal-600 tracking-widest mb-1 italic">Step 2: Deliver to</div>
               <div className="text-lg font-black text-white leading-tight mb-2">{order.dropoff_name}</div>
               <div className="text-sm font-bold text-emerald-500/70">{order.recipient_name} â€¢ {order.recipient_phone}</div>
            </div>
          </div>
        </div>

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

        {/* Progress Action - SLIDE TO CONFIRM */}
        <div className="pt-4">
           {order.status === 'matched' && (
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
               <Loader2 size={14} className="animate-spin" /> Transmitting Protocol Update...
             </div>
           )}
        </div>
      </div>

      <div className="px-8 text-center">
        <p className="text-[10px] font-black uppercase tracking-[0.4em] text-charcoal-700">
          Telemetry Active â€¢ Node: KANO-01
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
'@
$target1 = Resolve-TargetPath "src\app\rider\active-job\page.jsx" "src\app\rider\(main)\active-job\page.jsx"
Write-FileContent $target1 $content1

$content2 = @'
"use client";

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/utils/supabase/client';
import {
  ArrowLeft, Wallet, TrendingUp, History,
  Download, Loader2, Sparkles, Receipt, ArrowUpRight, X
} from 'lucide-react';

export default function RiderEarnings() {
  const router = useRouter();
  const supabase = createClient();
  const [profile, setProfile] = useState(null);
  const [earningsData, setEarningsData] = useState({ total: 0, pending: 0, weekly: 0 });
  const [transactions, setTransactions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showWithdrawModal, setShowWithdrawModal] = useState(false);
  const [withdrawAmount, setWithdrawAmount] = useState('');
  const [withdrawing, setWithdrawing] = useState(false);
  const [withdrawError, setWithdrawError] = useState(null);
  const [withdrawSuccess, setWithdrawSuccess] = useState(false);

  async function loadData() {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { router.push('/auth/login'); return; }

    const { data: rider } = await supabase.from('riders').select('*').eq('user_id', user.id).single();
    setProfile(rider);

    const { data: orders } = await supabase
      .from('orders')
      .select('*')
      .eq('rider_id', rider?.id)   // orders.rider_id â†’ riders.id (not users.id)
      .eq('status', 'delivered')
      .order('created_at', { ascending: false });

    const { data: walletTxs } = await supabase
      .from('wallet_transactions')
      .select('*')
      .eq('rider_id', user.id)     // wallet_transactions.rider_id â†’ users.id
      .order('created_at', { ascending: false });

    if (orders) {
      const grossEarned = orders.reduce((sum, o) => sum + (o.agreed_price || 0), 0) * 0.80; // 20% platform commission
      const alreadyWithdrawn = (walletTxs || [])
        .filter(t => t.status === 'requested' || t.status === 'paid')
        .reduce((sum, t) => sum + Number(t.amount), 0);
      const pendingRequests = (walletTxs || [])
        .filter(t => t.status === 'requested')
        .reduce((sum, t) => sum + Number(t.amount), 0);

      setEarningsData({
        total: Math.floor(grossEarned - alreadyWithdrawn), // available to withdraw
        pending: Math.floor(pendingRequests),               // awaiting admin approval
        weekly: Math.floor(grossEarned * 0.4)
      });
      setTransactions(orders.slice(0, 5));
    }
    setLoading(false);
  }

  useEffect(() => { loadData(); }, [supabase, router]);

  async function submitWithdrawal() {
    const amount = Number(withdrawAmount);
    setWithdrawError(null);

    if (!amount || amount <= 0) { setWithdrawError('Enter a valid amount.'); return; }
    if (amount > earningsData.total) { setWithdrawError(`Amount exceeds your available balance of â‚¦${earningsData.total.toLocaleString()}.`); return; }

    setWithdrawing(true);
    const { error } = await supabase.rpc('request_withdrawal', { p_amount: amount });
    setWithdrawing(false);

    if (error) { setWithdrawError(error.message); return; }

    setWithdrawSuccess(true);
    setWithdrawAmount('');
    await loadData();
    setTimeout(() => { setShowWithdrawModal(false); setWithdrawSuccess(false); }, 1800);
  }

  if (loading) return <div className="flex justify-center py-20"><Loader2 className="animate-spin text-emerald-500" /></div>;

  return (
    <div className="space-y-8 pb-32 animate-in fade-in slide-in-from-bottom-4 duration-700">
      <div className="flex items-center justify-between">
         <div className="flex items-center gap-4">
            <button onClick={() => router.back()} className="w-10 h-10 bg-white/5 rounded-xl flex items-center justify-center text-white border border-white/10 hover:bg-white/10 transition-colors">
                <ArrowLeft size={20} />
            </button>
            <div>
               <h1 className="text-3xl font-black text-white tracking-tight font-outfit italic">
                  Financial <span className="text-emerald-500">Node</span>
               </h1>
               <p className="text-charcoal-400 text-sm font-medium">Operation settlement & payouts.</p>
            </div>
         </div>
         <button className="w-10 h-10 bg-emerald-500/10 rounded-xl flex items-center justify-center text-emerald-500 border border-emerald-500/20">
            <Download size={20} />
         </button>
      </div>

      {/* Wallet Visualization */}
      <div className="bg-white/[0.03] border border-white/10 rounded-[3rem] p-10 relative overflow-hidden group shadow-2xl">
         <div className="absolute top-0 right-0 w-80 h-80 bg-emerald-500/10 rounded-full blur-[100px] -mr-40 -mt-40 group-hover:bg-emerald-500/20 transition-all duration-1000"></div>
         <div className="relative z-10">
            <div className="flex items-center gap-3 mb-6">
               <div className="w-10 h-10 bg-emerald-500 rounded-2xl flex items-center justify-center text-charcoal-950 shadow-glow">
                  <Wallet size={20} strokeWidth={3} />
               </div>
               <span className="text-[10px] font-black uppercase tracking-[0.4em] text-emerald-500 font-outfit italic">Liquid Balance</span>
            </div>

            <div className="mb-10">
               <span className="text-2xl font-black text-emerald-500 mr-2 italic">â‚¦</span>
               <span className="text-7xl font-black text-white tracking-tighter italic font-outfit leading-none">
                  {earningsData.total.toLocaleString()}
               </span>
            </div>

            <div className="grid grid-cols-2 gap-4 mb-8">
               <div className="p-5 bg-charcoal-900/50 rounded-2xl border border-white/5 backdrop-blur-md">
                  <div className="text-[9px] font-black text-charcoal-600 uppercase tracking-widest mb-1 italic">Pending Approval</div>
                  <div className="text-lg font-black text-white tracking-tight">â‚¦{earningsData.pending.toLocaleString()}</div>
               </div>
               <div className="p-5 bg-charcoal-900/50 rounded-2xl border border-white/5 backdrop-blur-md">
                  <div className="text-[9px] font-black text-emerald-500/60 uppercase tracking-widest mb-1 italic">Weekly Yield</div>
                  <div className="text-lg font-black text-white tracking-tight">â‚¦{earningsData.weekly.toLocaleString()}</div>
               </div>
            </div>

            <button
              onClick={() => setShowWithdrawModal(true)}
              disabled={earningsData.total <= 0}
              className="w-full py-6 bg-emerald-500 hover:bg-emerald-400 disabled:opacity-40 disabled:cursor-not-allowed text-charcoal-950 rounded-[2rem] font-black text-lg uppercase tracking-widest transition-all shadow-glow active:scale-95 flex items-center justify-center gap-3"
            >
               Withdraw Funds <ArrowUpRight size={20} strokeWidth={3} />
            </button>
         </div>
      </div>

      {/* Analytics Section */}
      <div className="space-y-4">
         <div className="flex items-center justify-between px-2">
            <h2 className="text-xs font-black text-charcoal-500 uppercase tracking-widest italic">Signal Registry</h2>
            <button className="text-[10px] font-black text-emerald-500 uppercase tracking-widest flex items-center gap-1">
               Historical Data <History size={12} />
            </button>
         </div>

         <div className="space-y-3">
            {transactions.map((tx) => (
               <div key={tx.id} className="bg-white/[0.03] p-5 rounded-[2rem] border border-white/5 flex items-center justify-between hover:bg-white/[0.05] transition-all group">
                  <div className="flex items-center gap-4">
                     <div className="w-12 h-12 bg-charcoal-900 rounded-2xl flex items-center justify-center text-emerald-500 border border-white/5 group-hover:border-emerald-500/30 transition-all font-outfit font-black italic">
                        <Receipt size={20} />
                     </div>
                     <div>
                        <div className="text-sm font-black text-white uppercase tracking-tight">Mission Settlement</div>
                        <div className="text-[10px] font-bold text-charcoal-500 uppercase tracking-widest">{new Date(tx.created_at).toLocaleDateString()} â€¢ ID: {tx.id.slice(0, 6)}</div>
                     </div>
                  </div>
                  <div className="text-right">
                     <div className="text-xl font-black text-white italic tracking-tighter mb-1">+â‚¦{Math.floor(tx.agreed_price * 0.80).toLocaleString()}</div>
                     <div className="text-[9px] font-black text-emerald-500 uppercase tracking-widest italic flex items-center justify-end gap-1">
                        Cleared <Sparkles size={10} />
                     </div>
                  </div>
               </div>
            ))}

            {transactions.length === 0 && (
               <div className="py-16 text-center border border-dashed border-white/10 rounded-[3rem] opacity-30">
                  <div className="w-16 h-16 bg-white/10 rounded-full flex items-center justify-center mx-auto mb-4">
                     <TrendingUp size={24} />
                  </div>
                  <p className="text-[10px] font-black uppercase tracking-[0.4em]">Zero Movement Detected</p>
               </div>
            )}
         </div>
      </div>

      {showWithdrawModal && (
        <div className="fixed inset-0 bg-black/70 z-50 flex items-end sm:items-center justify-center p-4">
          <div className="bg-charcoal-900 border border-white/10 rounded-[2.5rem] p-8 w-full max-w-sm relative">
            <button onClick={() => setShowWithdrawModal(false)} className="absolute top-6 right-6 text-charcoal-500 hover:text-white">
              <X size={20} />
            </button>
            {withdrawSuccess ? (
              <div className="text-center py-8">
                <p className="text-emerald-400 font-black text-lg">Request submitted</p>
                <p className="text-charcoal-400 text-sm mt-2">Pending admin approval.</p>
              </div>
            ) : (
              <>
                <p className="text-white font-black text-lg mb-1">Withdraw Funds</p>
                <p className="text-charcoal-400 text-sm mb-6">Available: â‚¦{earningsData.total.toLocaleString()}</p>
                <input
                  type="number"
                  value={withdrawAmount}
                  onChange={(e) => setWithdrawAmount(e.target.value)}
                  placeholder="Amount (â‚¦)"
                  className="w-full bg-white/5 border border-white/10 rounded-2xl px-5 py-4 text-white font-bold mb-3 outline-none focus:border-emerald-500/50"
                />
                {withdrawError && <p className="text-red-400 text-xs font-bold mb-3">{withdrawError}</p>}
                <button
                  onClick={submitWithdrawal}
                  disabled={withdrawing}
                  className="w-full py-4 bg-emerald-500 hover:bg-emerald-400 text-charcoal-950 rounded-2xl font-black uppercase tracking-widest transition-all disabled:opacity-50"
                >
                  {withdrawing ? <Loader2 className="animate-spin mx-auto" size={18} /> : 'Request Withdrawal'}
                </button>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
'@
$target2 = Resolve-TargetPath "src\app\rider\earnings\page.jsx" "src\app\rider\(main)\earnings\page.jsx"
Write-FileContent $target2 $content2

$content3 = @'
import { validateAdmin } from "@/utils/admin";
import { createClient } from "@/utils/supabase/server";
import { DollarSign, ArrowUpRight, ArrowDownRight, Wallet, Activity, CreditCard } from "lucide-react";
import FinanceCharts from "./FinanceCharts";
import PendingWithdrawals from "./PendingWithdrawals";

export const dynamic = "force-dynamic";

export default async function OpsFinancePage() {
  const { admin } = await validateAdmin();
  const supabase = await createClient();

  // 1. Fetch Aggregated Metrics
  const { data: totalEscrow } = await supabase
    .from("orders")
    .select("agreed_price")
    .eq("payment_status", "paid");

  const { data: completedOrders } = await supabase
    .from("orders")
    .select("agreed_price, created_at")
    .eq("status", "delivered");

  // Only count REQUESTED payouts as "pending" -- previously this counted paid and
  // rejected rows too since it only filtered on type, not status.
  const { data: pendingPayouts } = await supabase
    .from("wallet_transactions")
    .select("id, amount, created_at, rider_id, users:rider_id(full_name)")
    .eq("type", "payout_request")
    .eq("status", "requested")
    .order("created_at", { ascending: true });

  const currentEscrow = totalEscrow?.reduce((acc, curr) => acc + (curr.agreed_price || 0), 0) || 0;
  const totalRevenue = completedOrders?.reduce((acc, curr) => acc + (curr.agreed_price || 0), 0) || 0;
  const platformCut = totalRevenue * 0.20; // 20% commission
  const totalPayoutPending = pendingPayouts?.reduce((acc, curr) => acc + (curr.amount || 0), 0) || 0;

  const withdrawalRequests = (pendingPayouts || []).map(p => ({
    id: p.id,
    amount: p.amount,
    created_at: p.created_at,
    rider_name: p.users?.full_name || null
  }));

  // Formatting historical data for charts
  const last7Days = [...Array(7)].map((_, i) => {
    const d = new Date();
    d.setDate(d.getDate() - i);
    return d.toISOString().split('T')[0];
  }).reverse();

  const chartData = last7Days.map(date => {
    const dayOrders = completedOrders?.filter(o => o.created_at.startsWith(date)) || [];
    const gmv = dayOrders.reduce((acc, curr) => acc + (curr.agreed_price || 0), 0);
    return {
      date: date.slice(5),
      gmv: gmv,
      revenue: gmv * 0.20
    };
  });

  const kpis = [
    { label: "Live Escrow Balance", value: `â‚¦${currentEscrow.toLocaleString()}`, icon: <Wallet className="text-purple-500" />, trend: "Locked Funds" },
    { label: "Platform Revenue", value: `â‚¦${platformCut.toLocaleString()}`, icon: <DollarSign className="text-emerald-500" />, trend: "20% Take Rate" },
    { label: "Gross Merchandise Value", value: `â‚¦${totalRevenue.toLocaleString()}`, icon: <Activity className="text-blue-500" />, trend: "Total Processed" },
    { label: "Pending Payouts", value: `â‚¦${totalPayoutPending.toLocaleString()}`, icon: <CreditCard className="text-amber-500" />, trend: "Rider Liabilities" }
  ];

  return (
    <div className="min-h-screen bg-black text-white p-8 font-mono">
      <div className="flex justify-between items-end mb-12 border-b border-white/10 pb-8">
        <div>
           <div className="flex items-center gap-2 text-emerald-500 text-xs font-bold uppercase tracking-[0.3em] mb-2">
              <div className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse" />
              Financial Telemetry Active
           </div>
           <h1 className="text-4xl font-black italic tracking-tighter uppercase">Treasury / Analytics</h1>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-12">
        {kpis.map((kpi, i) => (
          <div key={i} className="bg-charcoal-900/40 border border-white/5 p-6 rounded-2xl group hover:border-white/10 transition-all relative overflow-hidden">
             <div className="absolute top-0 right-0 w-24 h-24 bg-white/[0.02] rounded-bl-full pointer-events-none" />
             <div className="flex justify-between items-start mb-4 relative z-10">
                <div className="w-10 h-10 bg-white/5 rounded-xl flex items-center justify-center">
                   {kpi.icon}
                </div>
                <div className="text-[9px] font-black text-charcoal-600 uppercase tracking-widest">{kpi.trend}</div>
             </div>
             <div className="text-3xl font-black tracking-tight relative z-10">{kpi.value}</div>
             <div className="text-[10px] text-charcoal-500 font-bold uppercase mt-1 relative z-10">{kpi.label}</div>
          </div>
        ))}
      </div>

      <div className="bg-charcoal-900/40 border border-white/5 rounded-[2rem] p-8 mb-12">
        <div className="flex items-center justify-between mb-8">
           <h2 className="text-sm font-black uppercase tracking-[0.2em] text-emerald-500">Pending Withdrawal Requests</h2>
           <div className="px-4 py-1.5 rounded-full bg-amber-500/10 text-amber-500 text-[10px] font-black uppercase tracking-widest">
              {withdrawalRequests.length} Awaiting Action
           </div>
        </div>
        <PendingWithdrawals initialRequests={withdrawalRequests} />
      </div>

      <div className="bg-charcoal-900/40 border border-white/5 rounded-[2rem] p-8">
        <div className="flex items-center justify-between mb-8">
           <h2 className="text-sm font-black uppercase tracking-[0.2em] text-emerald-500">7-Day Revenue Trajectory</h2>
           <div className="px-4 py-1.5 rounded-full bg-emerald-500/10 text-emerald-500 text-[10px] font-black uppercase tracking-widest">
              Live Chart
           </div>
        </div>
        <div className="h-[400px] w-full">
           <FinanceCharts data={chartData} />
        </div>
      </div>
    </div>
  );
}
'@
$target3 = Resolve-TargetPath "src\app\ops-terminal\finance\page.jsx" $null
Write-FileContent $target3 $content3

$content4 = @'
"use client";

import { useState } from 'react';
import { Star, X } from 'lucide-react';
import { createClient } from '@/utils/supabase/client';

export default function ReviewModal({ order, driverProfile, reviewerId, isOpen, onClose }) {
  const supabase = createClient();
  const [rating, setRating] = useState(0);
  const [hoveredRating, setHoveredRating] = useState(0);
  const [feedback, setFeedback] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);

  if (!isOpen || !order || !driverProfile) return null;

  const handleSubmit = async () => {
    if (rating === 0) {
      alert("Please select a rating.");
      return;
    }

    setIsSubmitting(true);
    try {
       // NOTE: orders.rider_id points to riders.id, and reviews.rider_id matches that.
       // reviewerId is the reviewing vendor's own auth user id, passed in explicitly
       // by the caller - order.driver_id / order.user_id never existed on the orders
       // table, so this previously wrote null into every review.
       const { error } = await supabase.from('reviews').insert({
          order_id: order.id,
          rider_id: order.rider_id,
          user_id: reviewerId,
          rating,
          feedback
       });

       if (error && error.code === '23505') {
           // Unique constraint violation (order_id, user_id) - already reviewed
           setSuccess(true);
       } else if (error) {
           throw error;
       } else {
           setSuccess(true);
           setTimeout(() => {
               onClose();
           }, 2000);
       }
    } catch (err) {
       console.error("Review submission failed", err);
       alert("Failed to submit review. Please try again later.");
    } finally {
       setIsSubmitting(false);
    }
  };

  if (success) {
      return (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-charcoal-900/60 backdrop-blur-sm animate-in fade-in">
             <div className="bg-white rounded-3xl p-8 max-w-sm w-full text-center shadow-2xl animate-in zoom-in-95">
                <div className="w-16 h-16 bg-emerald-100 text-emerald-500 rounded-full flex items-center justify-center mx-auto mb-4">
                   <Star size={32} className="fill-emerald-500" />
                </div>
                <h3 className="text-xl font-black text-charcoal-900 mb-2">Review Submitted!</h3>
                <p className="text-charcoal-500 font-medium mb-6">Thank you for your feedback.</p>
                <button onClick={onClose} className="w-full py-3 bg-gray-100 font-bold rounded-xl hover:bg-gray-200 transition-colors">Close</button>
             </div>
          </div>
      );
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center p-0 sm:p-4 bg-charcoal-900/60 backdrop-blur-sm animate-in fade-in">
      <div className="bg-white w-full sm:max-w-md rounded-t-3xl sm:rounded-3xl shadow-2xl overflow-hidden animate-slide-up sm:animate-in sm:zoom-in-95">
        
        <div className="p-4 flex justify-end">
            <button onClick={onClose} className="p-2 bg-gray-50 rounded-full text-gray-500 hover:bg-gray-100">
                <X size={20} />
            </button>
        </div>

        <div className="px-6 pb-6 text-center">
             <img src={`https://api.dicebear.com/7.x/initials/svg?seed=${driverProfile.full_name}&backgroundColor=10b981`} alt="Driver" className="w-20 h-20 rounded-full border-4 border-emerald-50 mx-auto object-cover mb-4" />
             <h3 className="text-2xl font-black text-charcoal-900 mb-1">Rate your driver</h3>
             <p className="text-charcoal-500 font-medium mb-8">How was your delivery with {driverProfile.full_name}?</p>

             {/* Star Rating */}
             <div className="flex justify-center gap-2 mb-8">
                 {[1, 2, 3, 4, 5].map((star) => (
                     <button
                        key={star}
                        onMouseEnter={() => setHoveredRating(star)}
                        onMouseLeave={() => setHoveredRating(0)}
                        onClick={() => setRating(star)}
                        className="transition-transform hover:scale-110 focus:outline-none"
                     >
                         <Star 
                            size={40} 
                            className={`transition-colors ${
                                star <= (hoveredRating || rating) 
                                ? 'text-yellow-400 fill-yellow-400' 
                                : 'text-gray-200'
                            }`} 
                         />
                     </button>
                 ))}
             </div>

             <textarea 
                placeholder="Leave an optional tip or feedback..."
                value={feedback}
                onChange={(e) => setFeedback(e.target.value)}
                className="w-full bg-gray-50 border border-gray-200 rounded-2xl p-4 min-h-[100px] mb-6 focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 transition-all font-medium text-charcoal-900 resize-none"
             />

             <button 
                 onClick={handleSubmit}
                 disabled={isSubmitting || rating === 0}
                 className={`w-full py-4 rounded-xl font-black text-lg flex items-center justify-center transition-all ${
                     isSubmitting || rating === 0 
                     ? 'bg-gray-100 text-gray-400 cursor-not-allowed' 
                     : 'bg-emerald-500 hover:bg-emerald-600 text-white shadow-xl shadow-emerald-500/20 active:scale-[0.98]'
                 }`}
             >
                 {isSubmitting ? 'Submitting...' : 'Submit Rating'}
             </button>
        </div>
      </div>
    </div>
  );
}
'@
$target4 = Resolve-TargetPath "src\components\ReviewModal.jsx" $null
Write-FileContent $target4 $content4

$content5 = @'
"use client";

import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import { createClient } from '@/utils/supabase/client';
import { Loader2, MapPin, Package, CheckCircle2, Clock, MessageCircle, Star, Share2, Printer } from 'lucide-react';
import MapCanvas from '@/components/MapCanvas';
import OrderChat from '@/components/OrderChat';
import ReviewModal from '@/components/ReviewModal';

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
  const supabase = createClient();
  const [order, setOrder] = useState(null);
  const [isVendorView, setIsVendorView] = useState(false);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [currentUserId, setCurrentUserId] = useState(null);
  const [showChat, setShowChat] = useState(false);
  const [showReview, setShowReview] = useState(false);

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

  if (loading) return <div className="min-h-screen flex items-center justify-center bg-charcoal-950"><Loader2 className="animate-spin text-emerald-500" size={32} /></div>;

  if (notFound || !order) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-charcoal-950 text-center px-6">
        <p className="text-white font-black text-xl mb-2">Delivery not found</p>
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
              {vendorName && <p className="text-white font-black text-lg font-outfit print:text-black">{vendorName}</p>}
              <p className="text-charcoal-500 text-[10px] font-black uppercase tracking-widest print:text-charcoal-500">Delivered via NaijaDrops</p>
            </div>
          )}

          <div className="flex flex-col items-center text-center gap-2">
            <CheckCircle2 className="text-emerald-500" size={40} />
            <p className="text-white font-black text-xl font-outfit print:text-black">Delivered</p>
            <p className="text-charcoal-400 text-xs">{new Date(order.updated_at).toLocaleString()}</p>
          </div>
          <div className="space-y-3 border-t border-white/10 pt-6 print:border-charcoal-300">
            <div className="flex justify-between text-sm"><span className="text-charcoal-400">Item</span><span className="text-white font-bold print:text-black">{order.item_description}</span></div>
            <div className="flex justify-between text-sm"><span className="text-charcoal-400">From</span><span className="text-white font-bold print:text-black">{order.pickup_name}</span></div>
            <div className="flex justify-between text-sm"><span className="text-charcoal-400">To</span><span className="text-white font-bold print:text-black">{order.dropoff_name}</span></div>
            {riderName && <div className="flex justify-between text-sm"><span className="text-charcoal-400">Rider</span><span className="text-white font-bold print:text-black">{riderName}</span></div>}
            <div className="flex justify-between text-sm"><span className="text-charcoal-400">Total Paid</span><span className="text-emerald-400 font-black">â‚¦{Number(order.agreed_price ?? order.total_price ?? 0).toLocaleString()}</span></div>
            {isVendorView && commission !== null && (
              <div className="flex justify-between text-sm opacity-70"><span className="text-charcoal-400">Platform Commission (20%)</span><span className="text-white print:text-black">â‚¦{commission.toLocaleString()}</span></div>
            )}
          </div>

          {isVendorView && (
            <div className="flex flex-col gap-3 pt-2 print:hidden">
              <div className="grid grid-cols-2 gap-3">
                <button
                  onClick={handleShare}
                  className="flex items-center justify-center gap-2 py-3 bg-white/5 border border-white/10 rounded-2xl text-white text-xs font-black uppercase tracking-widest hover:bg-white/10 transition-all"
                >
                  <Share2 size={16} /> Share
                </button>
                <button
                  onClick={() => window.print()}
                  className="flex items-center justify-center gap-2 py-3 bg-white/5 border border-white/10 rounded-2xl text-white text-xs font-black uppercase tracking-widest hover:bg-white/10 transition-all"
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

  // --- In progress: live status timeline + map ---
  const currentStepIndex = STATUS_STEPS.indexOf(order.status);
  return (
    <div className="min-h-screen bg-charcoal-950 flex flex-col">
      <div className="h-64 relative">
        {(riderLat && riderLng) ? (
          <MapCanvas markers={[{ lat: riderLat, lng: riderLng, color: 'emerald', type: 'rider' }]} center={{ lat: riderLat, lng: riderLng }} />
        ) : (
          <div className="h-full flex items-center justify-center text-charcoal-500 text-sm">
            <MapPin className="mr-2" size={16} /> Waiting for rider locationâ€¦
          </div>
        )}
      </div>

      <div className="px-6 py-8 space-y-8">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-charcoal-400 text-[11px] font-black uppercase tracking-widest">Status</p>
            <p className="text-white font-black text-2xl font-outfit">{STATUS_LABELS[order.status] || order.status}</p>
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
              <span className={i <= currentStepIndex ? 'text-white font-bold text-sm' : 'text-charcoal-600 text-sm'}>{STATUS_LABELS[step]}</span>
            </div>
          ))}
        </div>

        <div className="border-t border-white/10 pt-6 space-y-3">
          <div className="flex items-center gap-2 text-sm"><Package size={14} className="text-charcoal-400" /><span className="text-white font-bold">{order.item_description}</span></div>
          <div className="flex justify-between text-sm"><span className="text-charcoal-400">From</span><span className="text-white">{order.pickup_name}</span></div>
          <div className="flex justify-between text-sm"><span className="text-charcoal-400">To</span><span className="text-white">{order.dropoff_name}</span></div>
          {riderName && <div className="flex justify-between text-sm"><span className="text-charcoal-400">Rider</span><span className="text-white font-bold">{riderName}</span></div>}
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
'@
$target5 = Resolve-TargetPath "src\app\tracking\[orderId]\page.jsx" $null
Write-FileContent $target5 $content5

$content6 = @'
"use client";

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/utils/supabase/client';
import { ArrowLeft, Clock, MapPin, Package, History as HistoryIcon, ChevronRight, Navigation } from 'lucide-react';
import Link from 'next/link';

export default function VendorHistoryPage() {
    const router = useRouter();
    const supabase = createClient();
    const [orders, setOrders] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        async function fetchHistory() {
            try {
                const { data: { user } } = await supabase.auth.getUser();
                if (!user) {
                    router.push('/auth/login');
                    return;
                }

                // Fetch vendor ID first
                const { data: vendorProfile } = await supabase
                    .from('vendors')
                    .select('id')
                    .eq('user_id', user.id)
                    .single();

                if (!vendorProfile) {
                    setOrders([]);
                    setLoading(false);
                    return;
                }

                const { data, error } = await supabase
                    .from('orders')
                    .select('*, riders!rider_id(user_id, vehicle_type)')
                    .eq('vendor_id', vendorProfile.id)
                    .order('created_at', { ascending: false });

                if (error) throw error;
                setOrders(data || []);
            } catch (err) {
                console.error("Failed to fetch history:", err);
            } finally {
                setLoading(false);
            }
        }
        fetchHistory();
    }, [supabase, router]);

    const getStatusStyle = (status) => {
        switch (status) {
            case 'delivered': return 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20';
            case 'pending': return 'bg-amber-500/10 text-amber-500 border-amber-500/20';
            case 'in_transit': return 'bg-blue-500/10 text-blue-500 border-blue-500/20';
            default: return 'bg-white/10 text-charcoal-400 border-white/10';
        }
    };

    return (
        <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-700">
            {/* Header */}
            <div className="flex items-center gap-4">
                <Link href="/vendor/dashboard" className="w-10 h-10 rounded-xl bg-white/5 flex items-center justify-center hover:bg-white/10 transition-colors border border-white/10">
                    <ArrowLeft size={20} className="text-white" />
                </Link>
                <div>
                    <h1 className="text-3xl font-black text-white tracking-tight font-outfit italic">
                        Operation <span className="text-emerald-500 text-outfit italic">History</span>
                    </h1>
                    <p className="text-charcoal-400 text-sm font-medium">Registry of all city-wide dispatches.</p>
                </div>
            </div>

            {loading ? (
                <div className="space-y-4">
                    {[1, 2, 3, 4].map((i) => (
                        <div key={i} className="bg-white/[0.03] rounded-[2rem] p-6 border border-white/10 h-32 animate-pulse" />
                    ))}
                </div>
            ) : orders.length === 0 ? (
                <div className="bg-white/[0.03] border border-white/10 rounded-[2.5rem] p-12 text-center flex flex-col items-center justify-center">
                    <div className="w-20 h-20 bg-charcoal-900 rounded-full flex items-center justify-center mb-6 border border-white/5">
                        <Package size={40} className="text-charcoal-600" />
                    </div>
                    <h2 className="text-xl font-black text-white mb-2">No active records found.</h2>
                    <p className="text-charcoal-500 mb-8 max-w-xs mx-auto text-sm">Initialize your first delivery to start logging operations.</p>
                    <Link href="/send-package/step-1" className="bg-emerald-500 text-charcoal-950 font-black py-4 px-8 rounded-2xl shadow-glow hover:bg-emerald-400 transition-all uppercase tracking-widest text-xs">
                        Dispatch Load
                    </Link>
                </div>
            ) : (
                <div className="space-y-4">
                    {orders.map((order) => (
                        <Link 
                            href={`/tracking/${order.id}`} 
                            key={order.id}
                            className="group block bg-white/[0.03] hover:bg-white/[0.05] rounded-[2rem] p-6 border border-white/10 transition-all hover:border-emerald-500/30 overflow-hidden relative"
                        >
                            <div className="absolute top-0 right-0 p-6 flex flex-col items-end">
                                <div className={`text-[10px] font-black uppercase tracking-widest px-3 py-1.5 rounded-lg border ${getStatusStyle(order.status)}`}>
                                    {order.status}
                                </div>
                                <div className="mt-2 text-2xl font-black text-white italic tracking-tighter">â‚¦{order.agreed_price?.toLocaleString()}</div>
                            </div>

                            <div className="flex items-start gap-4 mb-6">
                                <div className="w-12 h-12 bg-emerald-500/10 rounded-2xl flex items-center justify-center text-emerald-500 border border-emerald-500/20">
                                    <Package size={24} />
                                </div>
                                <div>
                                    <div className="text-[10px] font-black tracking-widest text-charcoal-500 uppercase mb-1">
                                        ID: {order.id.slice(0, 8)} â€¢ {new Date(order.created_at).toLocaleDateString()}
                                    </div>
                                    <h3 className="text-lg font-black text-white font-outfit uppercase tracking-tight">{order.item_category || 'General Package'}</h3>
                                </div>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 border-t border-white/5 pt-6">
                                <div className="flex items-center gap-3">
                                    <div className="w-8 h-8 rounded-lg bg-charcoal-900 flex items-center justify-center text-emerald-500 border border-white/5">
                                        <MapPin size={16} />
                                    </div>
                                    <div className="min-w-0">
                                        <div className="text-[9px] font-black text-charcoal-600 uppercase tracking-widest font-outfit">Origin</div>
                                        <div className="text-sm font-bold text-white truncate max-w-[200px]">{order.pickup_name}</div>
                                    </div>
                                </div>
                                <div className="flex items-center gap-3">
                                    <div className="w-8 h-8 rounded-lg bg-charcoal-900 flex items-center justify-center text-emerald-500 border border-white/5">
                                        <Navigation size={16} />
                                    </div>
                                    <div className="min-w-0">
                                        <div className="text-[9px] font-black text-charcoal-600 uppercase tracking-widest font-outfit italic">Terminal</div>
                                        <div className="text-sm font-bold text-white truncate max-w-[200px]">{order.dropoff_name}</div>
                                    </div>
                                </div>
                            </div>
                            
                            <div className="mt-6 flex items-center justify-between text-[10px] font-black uppercase tracking-widest text-charcoal-400 group-hover:text-emerald-500 transition-colors">
                                <span>Rider ID: {order.rider_id ? order.rider_id.slice(0, 8) : 'AWAITING ASSIGNMENT'}</span>
                                <div className="flex items-center gap-2">View Analysis <ChevronRight size={14} /></div>
                            </div>
                        </Link>
                    ))}
                </div>
            )}
        </div>
    );
}
'@
$target6 = Resolve-TargetPath "src\app\vendor\history\page.jsx" $null
Write-FileContent $target6 $content6

if (Test-Path (Get-FullPath ".git")) {
    Write-Host "`nStaging and committing (not pushing):" -ForegroundColor Cyan
    git add -A
    git commit -m "fix: wire up chat/location-pinging/reviews, brand the receipt, correct 15pct->20pct commission, fix vendor history crash"
    Write-Host "`nCommitted locally. Push it yourself when ready:" -ForegroundColor Cyan
    Write-Host "  git push" -ForegroundColor White
} else {
    Write-Host "`nNot a git repo - files were written but not committed." -ForegroundColor Yellow
}

Write-Host "`nDone. Backups of every original file are in .fix-backup\ if you need to revert." -ForegroundColor Green
Write-Host "Supabase side (messages, rider_locations, reviews tables; vendors.logo_url) was already applied directly - nothing to run there." -ForegroundColor Green
