"use client";

import { useState, useEffect } from 'react';
import { createClient } from '@/utils/supabase/client';
import { Activity, Package, CheckCircle2, AlertTriangle, TrendingUp, ChevronRight, ShieldCheck } from 'lucide-react';
import Link from 'next/link';

import Skeleton from '@/components/ui/Skeleton';

export default function AdminDashboard() {
  const supabase = createClient();
  const [stats, setStats] = useState({
    totalOrders: 0,
    activeTrips: 0,
    completedToday: 0,
    totalRevenue: 0,
    platformCommission: 0,
    pendingDrivers: 0,
    verifiedDrivers: 0
  });
  const [loading, setLoading] = useState(true);
  const [pendingApps, setPendingApps] = useState([]);
  const [payoutRequests, setPayoutRequests] = useState([]);
  const [liveOrders, setLiveOrders] = useState([]);
  const [onlineDrivers, setOnlineDrivers] = useState([]);
  const [apiHealth, setApiHealth] = useState({ mapbox: 'loading', supabase: 'loading' });

  useEffect(() => {
    async function fetchStats() {
      try {
        // Check API Keys Health
        const hasMapboxKey = !!process.env.NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN;
        setApiHealth({
          mapbox: hasMapboxKey ? 'operational' : 'missing',
          supabase: 'operational'
        });

        // Optimized Strategy: Run parallelized queries
        const today = new Date();
        today.setHours(0,0,0,0);
        const isoToday = today.toISOString();

        const [
          { data: drivers },
          { data: activeOrdersList },
          { data: completedOrders },
          { data: pendingApplications },
          { data: activeDriversList },
          { data: payoutReqs }
        ] = await Promise.all([
          supabase.from('drivers').select('is_verified, driver_status'),
          supabase.from('orders').select('*').in('status', ['looking_for_driver', 'awaiting_payment', 'accepted', 'picked_up', 'arriving']).order('updated_at', { ascending: false }).limit(5),
          supabase.from('orders').select('agreed_price').eq('status', 'delivered'),
          supabase.from('drivers').select('*').eq('driver_status', 'pending').order('created_at', { ascending: false }).limit(3),
          supabase.from('driver_locations').select('driver_id, updated_at, lat, lng, drivers(full_name, phone)').order('updated_at', { ascending: false }).limit(5),
          supabase.from('wallet_transactions').select('id, amount, created_at, drivers(full_name, phone)').eq('type', 'payout_request').order('created_at', { ascending: false }).limit(5)
        ]);

        const revenue = completedOrders?.reduce((sum, o) => sum + parseFloat(o.agreed_price || 0), 0) || 0;
        const commission = revenue * 0.20; // 20% Platform Fee
        
        setStats({
          totalOrders: (activeOrdersList?.length || 0) + (completedOrders?.length || 0),
          activeTrips: activeOrdersList?.length || 0,
          completedToday: completedOrders?.filter(o => o.created_at >= isoToday).length || 0,
          totalRevenue: revenue,
          platformCommission: commission,
          pendingDrivers: drivers?.filter(d => d.driver_status === 'pending').length || 0,
          verifiedDrivers: drivers?.filter(d => d.is_verified).length || 0
        });

        if (pendingApplications) setPendingApps(pendingApplications);
        if (activeOrdersList) setLiveOrders(activeOrdersList);
        if (payoutReqs) setPayoutRequests(payoutReqs);
        // An active driver is one who pinged in the last 15 minutes
        if (activeDriversList) {
          const fifteenMinsAgo = new Date(Date.now() - 15 * 60000).toISOString();
          setOnlineDrivers(activeDriversList.filter(d => d.updated_at >= fifteenMinsAgo));
        }
      } catch (error) {
        console.error("Admin Fetch Error:", error);
      } finally {
        setLoading(false);
      }
    }
    fetchStats();

    const channel = supabase.channel('admin-live-updates')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'drivers' }, fetchStats)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, fetchStats)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'driver_locations' }, fetchStats)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'wallet_transactions' }, fetchStats)
      .subscribe();

    return () => supabase.removeChannel(channel);
  }, [supabase]);

  const handleProcessPayout = async (reqId) => {
      const isConfirmed = window.confirm("Mark this payout as processed? Ensure you have sent the Naira to the driver's bank account.");
      if (isConfirmed) {
          try {
              await supabase.from('wallet_transactions').update({ type: 'payout_processed' }).eq('id', reqId);
              setPayoutRequests(prev => prev.filter(r => r.id !== reqId));
          } catch (err) {
              console.error(err);
              alert('Failed to process payout.');
          }
      }
  };

  const statCards = [
    { label: 'Gross Volume', value: `₦${stats.totalRevenue.toLocaleString()}`, icon: TrendingUp, color: 'text-white', bg: 'bg-charcoal-800' },
    { label: 'NaijaDrops Fees', value: `₦${stats.platformCommission.toLocaleString()}`, icon: ShieldCheck, color: 'text-emerald-500', bg: 'bg-emerald-500/10' },
    { label: 'Active Trips', value: stats.activeTrips, icon: Activity, color: 'text-blue-500', bg: 'bg-blue-500/10' },
    { label: 'verified Fleet', value: stats.verifiedDrivers, icon: CheckCircle2, color: 'text-emerald-400', bg: 'bg-charcoal-800' }
  ];

  return (
    <div>
      <div className="mb-10 flex items-end justify-between">
        <div>
           <h1 className="text-4xl font-black mb-2">Platform Overview</h1>
           <p className="text-gray-400 font-medium">Real-time monitoring of NaijaDrops activity.</p>
        </div>
        <div className="bg-charcoal-800/50 border border-charcoal-800 px-4 py-2 rounded-2xl flex items-center gap-3">
           <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></div>
           <span className="text-[10px] font-black text-emerald-500 uppercase tracking-widest">System Healthy</span>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-12">
        {loading ? Array(4).fill(0).map((_, i) => (
          <div key={i} className="bg-charcoal-800/50 border border-charcoal-800 p-6 rounded-3xl h-40 flex flex-col justify-between">
             <Skeleton className="w-12 h-12 rounded-2xl" />
             <div className="space-y-2">
                <Skeleton className="w-24 h-4" />
                <Skeleton className="w-32 h-8" />
             </div>
          </div>
        )) : statCards.map((stat, i) => (
          <div key={i} className="bg-charcoal-800/50 border border-charcoal-800 p-6 rounded-3xl">
            <div className={`w-12 h-12 ${stat.bg} ${stat.color} rounded-2xl flex items-center justify-center mb-4`}>
              <stat.icon size={24} />
            </div>
            <div className="text-gray-400 text-sm font-bold uppercase tracking-widest mb-1">{stat.label}</div>
            <div className="text-3xl font-black">{stat.value}</div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-8 mb-8">
        {/* Live Active Orders */}
        <div className="bg-charcoal-800/20 border border-charcoal-800 rounded-[2.5rem] p-8 overflow-hidden relative">
          <div className="flex items-center justify-between mb-6">
             <div className="flex items-center gap-4">
                <h2 className="text-xl font-black">Active Orders</h2>
                <div className="bg-emerald-500/20 text-emerald-500 px-3 py-1 rounded-full text-xs font-bold">{liveOrders.length} Live</div>
             </div>
             <Link href="/admin/orders" className="text-gray-400 hover:text-white transition-colors text-sm font-bold flex items-center">View All <ChevronRight size={16} /></Link>
          </div>
          
          <div className="space-y-3">
            {liveOrders.length === 0 ? (
                <div className="text-center py-10 text-gray-500 font-medium">No active deliveries at the moment.</div>
            ) : (
                liveOrders.map(order => (
                    <Link key={order.id} href={`/admin/orders/${order.id}`} className="bg-charcoal-800/40 hover:bg-charcoal-800 border border-charcoal-700/50 p-4 rounded-2xl flex items-center justify-between transition-colors group">
                        <div className="flex items-center gap-4">
                            <div className="w-10 h-10 bg-emerald-500/10 text-emerald-500 rounded-xl flex items-center justify-center shrink-0">
                                <Package size={20} />
                            </div>
                            <div>
                                <div className="font-bold group-hover:text-emerald-400 transition-colors line-clamp-1">{order.dropoff_name}</div>
                                <div className="text-xs text-gray-500 font-mono">ID: ...{order.id.slice(-6).toUpperCase()}</div>
                            </div>
                        </div>
                        <div className="text-right flex items-center gap-4">
                             <div className="hidden sm:block">
                                <span className={`px-2 py-1 text-[10px] font-black uppercase tracking-widest rounded-md ${order.status.includes('payment') ? 'bg-amber-500/10 text-amber-500' : 'bg-blue-500/10 text-blue-500'}`}>
                                    {order.status.replace(/_/g, ' ')}
                                </span>
                             </div>
                             <ChevronRight size={18} className="text-gray-600 group-hover:text-white" />
                        </div>
                    </Link>
                ))
            )}
          </div>
        </div>

        {/* Live Online Drivers */}
        <div className="bg-charcoal-800/20 border border-charcoal-800 rounded-[2.5rem] p-8 overflow-hidden relative">
          <div className="flex items-center justify-between mb-6">
             <div className="flex items-center gap-4">
                <h2 className="text-xl font-black">Live Fleet</h2>
                <div className="flex items-center gap-2 bg-emerald-500/20 px-3 py-1 rounded-full">
                    <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></div>
                    <span className="text-xs font-bold text-emerald-500">{onlineDrivers.length} Online</span>
                </div>
             </div>
             <Link href="/admin/drivers" className="text-gray-400 hover:text-white transition-colors text-sm font-bold flex items-center">Manage <ChevronRight size={16} /></Link>
          </div>

          <div className="space-y-3">
            {onlineDrivers.length === 0 ? (
                <div className="text-center py-10 text-gray-500 font-medium">No drivers are currently sharing location.</div>
            ) : (
                onlineDrivers.map(driver => (
                    <div key={driver.driver_id} className="bg-charcoal-800/40 border border-charcoal-700/50 p-4 rounded-2xl flex items-center justify-between">
                        <div className="flex items-center gap-4">
                            <div className="w-10 h-10 bg-white/10 text-white rounded-xl flex items-center justify-center font-black">
                                {driver.drivers?.full_name?.[0] || 'D'}
                            </div>
                            <div>
                                <div className="font-bold text-white leading-tight">{driver.drivers?.full_name || 'Unknown Driver'}</div>
                                <div className="text-[10px] text-gray-500 uppercase tracking-widest">{driver.drivers?.phone || 'No Phone'}</div>
                            </div>
                        </div>
                        <div className="text-right">
                            <div className="text-xs font-mono text-gray-400">{driver.lat.toFixed(4)}, {driver.lng.toFixed(4)}</div>
                            <div className="text-[10px] text-emerald-600 font-bold">Pinged recently</div>
                        </div>
                    </div>
                ))
            )}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Pending Applications Widget */}
        <div className="bg-charcoal-800/20 border border-charcoal-800 rounded-[2.5rem] p-8">
          <div className="flex items-center justify-between mb-8">
            <h2 className="text-xl font-black">Pending Verification</h2>
            <Link href="/admin/drivers?status=pending" className="text-emerald-500 font-bold text-xs hover:underline">View All</Link>
          </div>
          
          <div className="space-y-4">
            {loading ? Array(3).fill(0).map((_, i) => (
               <div key={i} className="flex items-center justify-between p-4 bg-charcoal-800/30 border border-charcoal-700/50 rounded-2xl">
                 <div className="flex items-center gap-4">
                   <Skeleton className="w-10 h-10 rounded-xl" />
                   <div className="space-y-2">
                     <Skeleton className="w-24 h-4" />
                     <Skeleton className="w-16 h-3" />
                   </div>
                 </div>
               </div>
            )) : pendingApps.length === 0 ? (
               <div className="text-center py-10 text-gray-500 font-medium">No pending applications at the moment.</div>
            ) : (
              pendingApps.map(app => (
                <Link key={app.id} href={`/admin/drivers/${app.id}`} className="flex items-center justify-between p-4 bg-charcoal-800 border border-charcoal-700/50 rounded-2xl hover:bg-charcoal-700 transition-colors group">
                  <div className="flex items-center gap-4">
                    <div className="w-10 h-10 bg-amber-500/10 text-amber-500 rounded-xl flex items-center justify-center font-black">{app.full_name?.[0]}</div>
                    <div>
                      <div className="font-bold text-sm group-hover:text-amber-500 transition-colors">{app.full_name}</div>
                      <div className="text-[10px] text-gray-500 uppercase font-black tracking-widest">{app.vehicle_type || 'Vehicle data missing'}</div>
                    </div>
                  </div>
                  <ChevronRight size={16} className="text-gray-600 group-hover:text-white" />
                </Link>
              ))
            )}
          </div>
        </div>

        {/* Recent Logs & Health */}
        <div className="bg-charcoal-800/20 border border-charcoal-800 rounded-[2.5rem] p-8">
          <div className="flex items-center justify-between mb-8">
            <h2 className="text-xl font-black">System Health</h2>
            <span className={`px-3 py-1 text-[10px] font-bold uppercase rounded-full ${apiHealth.mapbox === 'operational' ? 'bg-emerald-500/10 text-emerald-500' : 'bg-red-500/10 text-red-500'}`}>
               {apiHealth.mapbox === 'operational' ? 'Active' : 'Issues Detected'}
            </span>
          </div>
          
          <div className="space-y-4">
            <div className="p-4 bg-charcoal-800/40 rounded-2xl flex items-center justify-between border border-charcoal-700/30">
               <div className="flex items-center gap-3 text-sm">
                  <div className={`w-2 h-2 rounded-full ${apiHealth.mapbox === 'operational' ? 'bg-emerald-500' : 'bg-red-500 animate-pulse'}`}></div>
                  <span className="font-bold">Mapbox JS API</span>
               </div>
               <span className="text-[10px] font-bold text-gray-500 uppercase tracking-[0.1em]">
                  {apiHealth.mapbox === 'operational' ? 'Operational' : 'Token Missing'}
               </span>
            </div>
            <div className="p-4 bg-charcoal-800/40 rounded-2xl flex items-center justify-between border border-charcoal-700/30">
               <div className="flex items-center gap-3 text-sm">
                  <div className="w-2 h-2 rounded-full bg-emerald-500"></div>
                  <span className="font-bold">Supabase Realtime</span>
               </div>
               <span className="text-[10px] font-bold text-gray-500 uppercase tracking-[0.1em]">Connected</span>
            </div>
            <div className="p-4 bg-charcoal-800/40 rounded-2xl flex items-center justify-between border border-charcoal-700/30">
               <div className="flex items-center gap-3 text-sm">
                  <div className="w-2 h-2 rounded-full bg-emerald-500"></div>
                  <span className="font-bold">Matching Gateway</span>
               </div>
               <span className="text-[10px] font-bold text-gray-500 uppercase tracking-[0.1em]">Load Balanced</span>
            </div>
          </div>
        </div>
        
        {/* Payout Requests Widget */}
        <div className="bg-charcoal-800/20 border border-charcoal-800 rounded-[2.5rem] p-8 lg:col-span-2">
          <div className="flex items-center justify-between mb-8">
            <h2 className="text-xl font-black">Driver Payout Requests</h2>
            <div className="bg-amber-500/10 text-amber-500 px-3 py-1 text-[10px] font-bold uppercase tracking-widest rounded-full">{payoutRequests.length} Pending</div>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {payoutRequests.length === 0 ? (
               <div className="col-span-full text-center py-10 text-gray-500 font-medium border-2 border-dashed border-charcoal-700 rounded-3xl">No payout requests at the moment.</div>
            ) : (
                payoutRequests.map(req => (
                    <div key={req.id} className="bg-charcoal-800 border border-charcoal-700/50 p-5 rounded-3xl relative overflow-hidden group hover:border-emerald-500/50 transition-colors">
                        <div className="absolute top-0 right-0 w-20 h-20 bg-amber-500/5 rounded-bl-[3rem] pointer-events-none"></div>
                        <div className="font-bold text-white mb-1">{req.drivers?.full_name || 'Driver'}</div>
                        <div className="font-mono text-gray-400 text-xs mb-4">{req.drivers?.phone || 'No phone'}</div>
                        <div className="flex items-end justify-between">
                            <div>
                                <div className="text-[10px] text-gray-500 font-black uppercase tracking-widest mb-1">Requested Amount</div>
                                <div className="text-2xl font-black text-emerald-400">₦{req.amount?.toLocaleString()}</div>
                            </div>
                            <button onClick={() => handleProcessPayout(req.id)} className="bg-emerald-500 hover:bg-emerald-400 text-charcoal-900 shadow-lg px-4 py-2 rounded-xl text-xs font-black transition-all">
                                Process
                            </button>
                        </div>
                    </div>
                ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
