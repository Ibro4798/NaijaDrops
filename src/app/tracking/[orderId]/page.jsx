"use client";

import { useState, useEffect } from 'react';
import { useRouter, useParams } from 'next/navigation';
import dynamic from 'next/dynamic';
import { createClient } from '@/utils/supabase/client';
import { Phone, MessageSquare, ShieldCheck, Star, X } from 'lucide-react';
import OrderChat from '@/components/OrderChat';
import ReviewModal from '@/components/ReviewModal';
import { calculateDistance } from '@/utils/distance';


const TrackingMap = dynamic(() => import('@/components/TrackingMap'), { 
  ssr: false,
  loading: () => <div className="h-full w-full bg-charcoal-100 animate-pulse flex items-center justify-center">Loading Live Map...</div>
});

export default function Tracking() {
  const router = useRouter();
  const params = useParams();
  const orderId = params?.orderId;
  const supabase = createClient();

  const [orderData, setOrderData] = useState(null);
  const [driverLoc, setDriverLoc] = useState(null);  // FIX #1: Start with null instead of BUK default
  const [driverLocUpdatedAt, setDriverLocUpdatedAt] = useState(null);  // FIX #5: Track location timestamp
  const [isLoadingLocation, setIsLoadingLocation] = useState(true);  // FIX #1: Track loading state
  const [driverProfile, setDriverProfile] = useState(null);
  const [showChat, setShowChat] = useState(false);
  const [showReviewModal, setShowReviewModal] = useState(false);


  useEffect(() => {
    if (!orderId) return;
    let orderSub;
    let locationSub;

    async function fetchOrder() {
       const { data } = await supabase.from('orders').select('*').eq('id', orderId).single();
       if (data) {
           setOrderData(data);
           // FIX #1: Initialize driver location with pickup location (not BUK)
           if (data.pickup_lat && data.pickup_lng) {
               setDriverLoc({ lat: data.pickup_lat, lng: data.pickup_lng });
           }
           if (data.driver_id) {
               fetchDriverProfile(data.driver_id);
               fetchDriverLocation(data.driver_id);
               subscribeToLocation(data.driver_id);
           }
       }
       setIsLoadingLocation(false);  // FIX #1: Done loading
    }

    async function fetchDriverProfile(driverId) {
       const { data } = await supabase.from('drivers').select('*').eq('id', driverId).single();
       if (data) setDriverProfile(data);
    }

    async function fetchDriverLocation(driverId) {
       // FIX #5: Store the timestamp when location is fetched
       const { data } = await supabase.from('driver_locations').select('*').eq('driver_id', driverId).single();
       if (data) {
           setDriverLoc({ lat: data.lat, lng: data.lng });
           setDriverLocUpdatedAt(data.updated_at);
       }
    }

    // Secure Realtime Listener for the specific order
    orderSub = supabase.channel(`order-${orderId}`)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'orders', filter: `id=eq.${orderId}` }, (payload) => {
          
          if (payload.new.status === 'delivered' && orderData?.status !== 'delivered') {
              setTimeout(() => setShowReviewModal(true), 2000);
          }

          setOrderData(payload.new);
          if (payload.new.driver_id && !driverProfile) {
              fetchDriverProfile(payload.new.driver_id);
              fetchDriverLocation(payload.new.driver_id);
              subscribeToLocation(payload.new.driver_id);
          }
      }).subscribe();

    // Secure Realtime Listener for driver's GPS coordinates
    function subscribeToLocation(driverId) {
        if (locationSub) return;
        locationSub = supabase.channel(`driver-loc-${driverId}`)
            .on('postgres_changes', { event: '*', schema: 'public', table: 'driver_locations', filter: `driver_id=eq.${driverId}` }, (payload) => {
                if (payload.new) {
                    setDriverLoc({ lat: payload.new.lat, lng: payload.new.lng });
                    // FIX #5: Store timestamp when location updates
                    setDriverLocUpdatedAt(payload.new.updated_at);
                }
            }).subscribe();
    }

    fetchOrder();

    return () => {
        if (orderSub) supabase.removeChannel(orderSub);
        if (locationSub) supabase.removeChannel(locationSub);
    };
  }, [orderId, supabase]);

  if (!orderData) return <div className="p-10 text-center text-white min-h-screen bg-charcoal-900 flex flex-col items-center justify-center">Loading Live Order...</div>;

  // FIX #1: Show loading state if location hasn't loaded yet
  if (isLoadingLocation && !driverLoc) {
    return (
      <main className="h-screen w-full flex flex-col items-center justify-center bg-charcoal-900">
        <div className="text-center">
          <div className="text-4xl mb-4 animate-bounce">📍</div>
          <p className="text-white text-lg font-bold">Locating Driver...</p>
          <p className="text-gray-400 text-sm mt-2">Location updates every 15 seconds once driver comes online</p>
        </div>
      </main>
    );
  }

  let step = 0;
  if (orderData.status === 'picked_up') step = 1;
  else if (orderData.status === 'arriving') step = 2;
  else if (orderData.status === 'delivered') step = 3;

  const headerStatusText = 
     orderData.status === 'looking_for_driver' ? 'Finding a driver...' :
     orderData.status === 'accepted' ? 'Driver on the way' :
     orderData.status === 'picked_up' ? 'Picked up & En Route' : 
     orderData.status === 'arriving' ? 'Arriving soon' : 'Delivered!';

  return (
    <main className="h-screen w-full flex flex-col relative overflow-hidden bg-charcoal-900">
      
      {/* Map Area */}
      <div className="flex-1 relative z-0">
        {/* FIX #5: Pass location timestamp to TrackingMap */}
        {driverLoc && (
          <TrackingMap
            driverLocation={driverLoc}
            dropoffLocation={{lat: orderData.dropoff_lat, lng: orderData.dropoff_lng}}
            locationUpdatedAt={driverLocUpdatedAt}
          />
        )}
        
        {/* Floating Top Nav (Over Map) */}
        <div className="absolute top-6 left-0 right-0 px-4 z-10">
            <div className="bg-white/90 backdrop-blur-md rounded-2xl shadow-lg p-3 flex justify-between items-center border border-gray-100">
                <div className="flex items-center gap-2">
                    <div className="w-8 h-8 bg-emerald-100 text-emerald-700 rounded-full flex items-center justify-center font-bold text-xs">
                        {step === 3 ? '✓' : '12'}
                    </div>
                    <div>
                        <div className="text-sm font-extrabold text-charcoal-900 leading-none">
                            {headerStatusText}
                        </div>
                        <div className="text-[10px] font-bold text-emerald-600 uppercase tracking-widest mt-0.5">
                            {orderData.status === 'delivered' ? 'Arrived' : `EST. ARRIVAL ${(() => {
                                if (!driverLoc || !orderData.dropoff_lat) return '--:--';
                                const dist = calculateDistance(driverLoc.lat, driverLoc.lng, orderData.dropoff_lat, orderData.dropoff_lng);
                                // Assume 20km/h average in Kano
                                const minutes = Math.round((dist / 20) * 60) + 2; 
                                const arrivalTime = new Date(Date.now() + minutes * 60000);
                                return arrivalTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
                            })()}`}
                        </div>
                    </div>
                </div>
                <div className="bg-emerald-50 text-emerald-700 text-xs font-bold px-3 py-1.5 rounded-full ring-1 ring-emerald-200 shadow-sm animate-pulse">
                    Live
                </div>
            </div>
        </div>

        {/* Floating Chat Button on Map */}
        {orderData.status !== 'delivered' && driverProfile && (
            <button 
                onClick={() => setShowChat(true)}
                className="absolute bottom-6 right-4 z-40 w-14 h-14 bg-charcoal-900 hover:bg-black text-white rounded-full shadow-[0_8px_30px_rgba(0,0,0,0.3)] flex items-center justify-center transition-transform active:scale-95 border-2 border-charcoal-800"
            >
                <div className="relative">
                    <MessageSquare size={24} />
                    {/* Optional indicator dot could go here */}
                </div>
            </button>
        )}
      </div>

      {/* Driver Info Sheet */}
      <div className="bg-white rounded-t-3xl shadow-[0_-10px_40px_rgba(0,0,0,0.15)] relative z-20 pb-8">
        
        {/* Drag Handle */}
        <div className="w-12 h-1.5 bg-gray-200 rounded-full mx-auto mt-3 mb-4"></div>

        <div className="px-6">
            {/* Driver Profile */}
            <div className="flex items-center justify-between mb-5">
                <div className="flex items-center gap-3">
                    <div className="relative">
                        {driverProfile ? (
                            <img src={`https://api.dicebear.com/7.x/initials/svg?seed=${driverProfile.full_name}&backgroundColor=10b981`} alt="Driver" className="w-14 h-14 rounded-full border-2 border-emerald-500 object-cover" />
                        ) : (
                            <div className="w-14 h-14 rounded-full border-2 border-gray-200 bg-gray-100 flex items-center justify-center">
                                <div className="w-5 h-5 border-2 border-gray-300 border-t-gray-500 rounded-full animate-spin"></div>
                            </div>
                        )}
                        <div className="absolute -bottom-1 -right-1 bg-white rounded-full p-0.5 shadow-sm">
                            <ShieldCheck size={14} className="text-emerald-500" />
                        </div>
                    </div>
                    <div>
                        <h2 className="text-lg font-extrabold text-charcoal-900 leading-tight">
                            {driverProfile ? driverProfile.full_name : 'Waiting for Driver...'}
                        </h2>
                        {driverProfile && (
                            <div className="flex flex-col gap-0.5 mt-0.5">
                                <div className="flex items-center gap-1 text-charcoal-500 text-[11px] font-bold uppercase tracking-wider">
                                    <Star size={12} className="text-yellow-400 fill-yellow-400" /> 4.9 <span className="text-gray-300">•</span> Verified
                                </div>
                                <div className="text-[10px] text-gray-400 font-bold bg-gray-100 px-2 py-0.5 rounded-full w-fit">
                                    {driverProfile.vehicle_type?.toUpperCase() || 'VEHICLE'} • {driverProfile.plate_number || '---'}
                                </div>
                            </div>
                        )}
                        {orderData.status === 'delivered' && orderData.delivery_photo_url && (
                            <div className="mt-3 mb-2 animate-slide-up">
                                <div className="text-[10px] font-bold text-charcoal-500 uppercase tracking-widest mb-1.5">Delivery Proof</div>
                                <div className="w-full h-32 rounded-xl overflow-hidden border border-gray-100 shadow-inner">
                                    <img src={orderData.delivery_photo_url} alt="Proof" className="w-full h-full object-cover" />
                                </div>
                            </div>
                        )}
                    </div>
                </div>
                
                {/* Contact Actions */}
                <div className={`flex gap-2 h-14 transition-opacity ${driverProfile ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}>
                    <a href={`tel:${driverProfile?.phone}`} className="w-10 h-10 bg-gray-100 hover:bg-emerald-50 text-charcoal-700 hover:text-emerald-600 rounded-full flex items-center justify-center transition-colors">
                        <Phone size={18} />
                    </a>
                    {orderData.status !== 'delivered' && (
                        <button 
                            onClick={() => setShowChat(true)}
                            className="flex-1 bg-white border-2 border-charcoal-800 rounded-2xl flex items-center justify-center gap-2 font-black text-charcoal-800 hover:bg-gray-50 transition-colors"
                        >
                            <MessageSquare size={18} /> Chat
                        </button>
                    )}
                </div>
            </div>

            {/* Verification Code */}
            <div className="bg-charcoal-50 border border-gray-100 rounded-2xl p-4 flex items-center justify-between mb-6">
                <div>
                    <div className="text-xs font-bold text-charcoal-500 uppercase tracking-widest mb-1">Verify Delivery</div>
                    <div className="text-sm font-medium text-charcoal-900">Show this PIN to the driver</div>
                </div>
                <div className="text-xl font-black text-emerald-600 tracking-widest bg-white px-3 py-1.5 rounded-lg border border-emerald-100 shadow-sm">
                    {orderData.delivery_pin || '----'}
                </div>
            </div>


            {/* Delivery Progress Timeline */}
            <div className="relative pl-4 h-32 ml-2">
                {/* Progress Bar Background */}
                <div className="absolute left-4 top-2 bottom-0 w-0.5 bg-gray-100 rounded-full"></div>
                {/* Active Progress Bar */}
                <div className="absolute left-4 top-2 w-0.5 bg-emerald-500 rounded-full transition-all duration-1000" style={{ height: step === 0 ? '0%' : (step === 1 ? '30%' : (step === 2 ? '70%' : '100%')) }}></div>

                {/* Steps */}
                <div className={`relative z-10 flex items-start gap-4 mb-5 transition-opacity duration-500 ${step >= 1 ? 'opacity-100' : 'opacity-40'}`}>
                    <div className="w-4 h-4 rounded-full bg-emerald-50 ring-2 ring-emerald-500 shadow-[0_0_0_4px_white] -ml-1.5 flex flex-shrink-0 items-center justify-center mt-0.5">
                        {step === 1 && <div className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse"></div>}
                        {step > 1 && <div className="w-4 h-4 bg-emerald-500 rounded-full border-2 border-white"></div>}
                    </div>
                    <div>
                        <h4 className={`text-sm font-bold ${step >= 1 ? 'text-charcoal-900' : 'text-charcoal-500'}`}>Picked Up</h4>
                        <p className="text-xs text-charcoal-400 font-medium">{orderData.pickup_name}</p>
                    </div>
                </div>

                <div className={`relative z-10 flex items-start gap-4 mb-5 transition-opacity duration-500 ${step >= 2 ? 'opacity-100' : 'opacity-40'}`}>
                    <div className={`w-4 h-4 rounded-full flex flex-shrink-0 items-center justify-center mt-0.5 -ml-1.5 shadow-[0_0_0_4px_white] ${step >= 2 ? 'bg-emerald-50 ring-2 ring-emerald-500' : 'bg-gray-100 ring-2 ring-gray-200'}`}>
                        {step === 2 && <div className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse"></div>}
                        {step > 2 && <div className="w-4 h-4 bg-emerald-500 rounded-full border-2 border-white"></div>}
                    </div>
                    <div>
                        <h4 className={`text-sm font-bold ${step >= 2 ? 'text-charcoal-900' : 'text-charcoal-500'}`}>Arriving</h4>
                        <p className="text-xs text-charcoal-400 font-medium">Driver entering your location...</p>
                    </div>
                </div>

                <div className={`relative z-10 flex items-start gap-4 transition-opacity duration-500 ${step === 3 ? 'opacity-100' : 'opacity-40'}`}>
                    <div className={`w-4 h-4 rounded-full flex flex-shrink-0 items-center justify-center mt-0.5 -ml-1.5 shadow-[0_0_0_4px_white] ${step === 3 ? 'bg-emerald-500 ring-2 ring-emerald-500 text-white' : 'bg-gray-100 ring-2 ring-gray-200'}`}>
                        {step === 3 && <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>}
                    </div>
                    <div>
                        <h4 className={`text-sm font-bold ${step === 3 ? 'text-charcoal-900' : 'text-charcoal-500'}`}>Delivered</h4>
                        <p className="text-xs text-charcoal-400 font-medium">{orderData.dropoff_name}</p>
                    </div>
                </div>
            </div>

            {/* End of Trip Dialog Button (Shows when step=3) */}
            {step === 3 && (
                <div className="flex gap-3 mt-6 animate-fade-in">
                    <button 
                      onClick={() => setShowReviewModal(true)}
                      className="flex-[2] py-4 bg-emerald-50 text-emerald-600 font-bold rounded-2xl shadow-sm border border-emerald-100 hover:bg-emerald-100 transition-colors flex items-center justify-center gap-2"
                    >
                      <Star size={18} className="fill-emerald-600" /> Rate Driver
                    </button>
                    <button 
                      onClick={() => router.push('/')}
                      className="flex-[3] py-4 bg-charcoal-900 hover:bg-black text-white font-bold rounded-2xl shadow-lg transition-transform focus:outline-none flex items-center justify-center"
                    >
                      Return Home
                    </button>
                </div>
            )}

            {showChat && (
                <OrderChat 
                    orderId={orderId} 
                    currentUserId={orderData.user_id} 
                    onClose={() => setShowChat(false)} 
                    isReadOnly={orderData.status === 'delivered'}
                />
            )}
        </div>
      </div>

      <ReviewModal 
          order={orderData}
          driverProfile={driverProfile}
          isOpen={showReviewModal}
          onClose={() => setShowReviewModal(false)}
      />
    </main>
  );
}
