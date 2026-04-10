"use client";

import { useState, useEffect } from 'react';
import { useRouter, useParams } from 'next/navigation';
import dynamic from 'next/dynamic';
import { createClient } from '@/utils/supabase/client';
import { ArrowLeft, User, Truck, ShieldAlert, Phone, ShieldCheck, MapPin } from 'lucide-react';
import Link from 'next/link';

const TrackingMap = dynamic(() => import('@/components/TrackingMap'), { 
  ssr: false,
  loading: () => <div className="h-full w-full bg-charcoal-800 animate-pulse flex items-center justify-center text-white">Loading God-View Map...</div>
});

export default function AdminOrderDetails() {
  const params = useParams();
  const orderId = params?.id;
  const supabase = createClient();
  const router = useRouter();

  const [order, setOrder] = useState(null);
  const [driverLoc, setDriverLoc] = useState(null);
  const [customer, setCustomer] = useState(null);
  const [driver, setDriver] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!orderId) return;

    let orderSub, locSub;

    async function fetchOrder() {
        const { data: o } = await supabase.from('orders').select('*').eq('id', orderId).single();
        if (o) {
            setOrder(o);
            if (o.pickup_lat && o.pickup_lng && !driverLoc) {
                setDriverLoc({ lat: o.pickup_lat, lng: o.pickup_lng });
            }

            if (o.user_id) {
                const { data: c } = await supabase.from('customers').select('*').eq('id', o.user_id).maybeSingle();
                setCustomer(c);
            }

            if (o.driver_id) {
                const { data: d } = await supabase.from('drivers').select('*').eq('id', o.driver_id).maybeSingle();
                setDriver(d);
                
                const { data: loc } = await supabase.from('driver_locations').select('*').eq('driver_id', o.driver_id).single();
                if (loc) setDriverLoc({ lat: loc.lat, lng: loc.lng });

                locSub = supabase.channel(`admin-loc-${o.driver_id}`)
                    .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'driver_locations', filter: `driver_id=eq.${o.driver_id}` }, (payload) => {
                        setDriverLoc({ lat: payload.new.lat, lng: payload.new.lng });
                    }).subscribe();
            }
        }
        setLoading(false);
    }
    fetchOrder();

    orderSub = supabase.channel(`admin-order-${orderId}`)
        .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'orders', filter: `id=eq.${orderId}` }, (payload) => {
            setOrder(payload.new);
        }).subscribe();

    return () => {
        if (orderSub) supabase.removeChannel(orderSub);
        if (locSub) supabase.removeChannel(locSub);
    };
  }, [orderId, supabase]);

  if (loading) return <div className="text-white animate-pulse text-lg font-bold">Initializing God View...</div>;
  if (!order) return <div className="text-red-500 font-bold">Order not found </div>;

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div className="flex items-center gap-4 mb-8">
         <button onClick={() => router.back()} className="w-10 h-10 bg-charcoal-800 hover:bg-charcoal-700 rounded-xl flex items-center justify-center transition-colors">
            <ArrowLeft size={18} />
         </button>
         <div>
            <h1 className="text-3xl font-black flex items-center gap-3">
                Order Investigation
                <span className="bg-red-500/20 text-red-500 px-3 py-1 rounded-full text-xs font-black uppercase tracking-widest flex items-center gap-2">
                    <ShieldAlert size={14} /> God View Active
                </span>
            </h1>
            <p className="font-mono text-gray-400 text-sm mt-1">ID: {order.id}</p>
         </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
         {/* Live Map */}
         <div className="lg:col-span-2 h-[500px] bg-charcoal-800/50 rounded-3xl border border-charcoal-700 overflow-hidden relative">
            <div className="absolute top-4 left-4 z-10 bg-charcoal-900/90 backdrop-blur border border-charcoal-700 px-4 py-3 rounded-2xl shadow-xl max-w-sm">
                <div className="text-[10px] font-black text-gray-500 uppercase tracking-widest mb-2">Live Status</div>
                <div className="text-lg font-bold text-white capitalize">{order.status.replace(/_/g, ' ')}</div>
                {order.status === 'delivered' && order.delivery_photo_url && (
                    <img src={order.delivery_photo_url} className="mt-3 w-full h-32 object-cover rounded-xl border border-charcoal-700" alt="Delivery Proof" />
                )}
            </div>
            
            {(driverLoc && order.dropoff_lat) ? (
                <TrackingMap 
                    driverLocation={driverLoc} 
                    dropoffLocation={{lat: order.dropoff_lat, lng: order.dropoff_lng}} 
                />
            ) : (
                <div className="flex items-center justify-center h-full text-gray-500 font-bold border-2 border-dashed border-charcoal-700 m-8 rounded-2xl">
                   Map Data Missing
                </div>
            )}
         </div>

         {/* Admin Side Panel */}
         <div className="space-y-6">
            {/* Delivery Secure PIN */}
            <div className="bg-charcoal-800 border border-charcoal-700 p-6 rounded-3xl relative overflow-hidden">
                <div className="absolute top-0 right-0 w-24 h-24 bg-red-500/10 rounded-bl-[4rem] group-hover:bg-red-500/20 transition-colors pointer-events-none"></div>
                <div className="text-[10px] font-black text-red-500 uppercase tracking-widest mb-4 flex items-center gap-2">
                    <ShieldCheck size={14} /> Secret Delivery Pin
                </div>
                <div className="font-mono text-5xl font-black tracking-[0.2em] text-white">
                    {order.delivery_pin || '----'}
                </div>
                <p className="text-xs text-gray-400 mt-4 leading-relaxed">
                    This is the confidential PIN required by the driver to complete the order. <span className="text-red-400 font-bold">Do not share outside of support requests.</span>
                </p>
            </div>

            {/* Order Value */}
            <div className="bg-charcoal-800/40 border border-charcoal-800 p-6 rounded-3xl">
                <div className="text-[10px] font-black text-gray-500 uppercase tracking-widest mb-1">Agreed Value</div>
                <div className="text-3xl font-black text-emerald-400">₦{order.agreed_price?.toLocaleString() || '0'}</div>
                <div className="text-xs text-gray-400 mt-2 font-mono">Distance: ~{order.distance_km || '?'} km</div>
            </div>

            {/* Customer Information */}
            <div className="bg-charcoal-800/40 border border-charcoal-800 p-6 rounded-3xl">
                <div className="flex items-center gap-3 mb-4 text-emerald-500">
                    <User size={20} /> <span className="font-black">Customer Details</span>
                </div>
                {customer ? (
                    <div>
                        <div className="font-bold text-lg">{customer.full_name}</div>
                        <div className="font-mono text-gray-400 text-sm mb-4">{customer.phone}</div>
                        <div className="text-xs bg-charcoal-900 px-3 py-2 rounded-xl text-gray-300">
                            <span className="font-bold block mb-1">Delivery Address:</span>
                            {order.dropoff_name}
                        </div>
                    </div>
                ) : <span className="text-sm text-gray-500">Loading...</span>}
            </div>

            {/* Driver Information */}
            <div className="bg-charcoal-800/40 border border-charcoal-800 p-6 rounded-3xl">
                <div className="flex items-center gap-3 mb-4 text-blue-500">
                    <Truck size={20} /> <span className="font-black">Driver Details</span>
                </div>
                {driver ? (
                    <div>
                        <Link href={`/admin/drivers/${driver.id}`} className="font-bold text-lg hover:underline decoration-blue-500 underline-offset-4">{driver.full_name}</Link>
                        <div className="font-mono text-gray-400 text-sm mb-4">{driver.phone}</div>
                        
                        {driverLoc && (
                            <div className="flex items-center gap-2 text-xs bg-charcoal-900 px-3 py-2 rounded-xl text-gray-300 font-mono">
                                <MapPin size={12} className="text-blue-500" /> {driverLoc.lat.toFixed(5)}, {driverLoc.lng.toFixed(5)}
                            </div>
                        )}
                    </div>
                ) : (
                    <span className="text-sm text-gray-500">{order.status === 'looking_for_driver' ? 'No driver assigned yet.' : 'Loading...'}</span>
                )}
            </div>
         </div>
      </div>
    </div>
  );
}
