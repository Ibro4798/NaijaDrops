"use client";

import { useState, useEffect, useRef } from 'react';
import { createClient } from '@/utils/supabase/client';
import { MapPin, Power } from 'lucide-react';
import dynamic from 'next/dynamic';
import IncomingOrderCard from '@/components/driver/IncomingOrderCard';
import ActiveTripPanel from '@/components/driver/ActiveTripPanel';
import { calculateDistance } from '@/utils/distance';

const TrackingMap = dynamic(() => import('@/components/TrackingMap'), { 
  ssr: false,
  loading: () => <div className="h-full w-full bg-charcoal-800 animate-pulse flex items-center justify-center text-charcoal-500 font-bold">Scanning GPS...</div>
});

export default function DriverDashboard() {
    const supabase = createClient();
    const [user, setUser] = useState(null);
    const [isOnline, setIsOnline] = useState(false);
    const [currentLocation, setCurrentLocation] = useState(null);
    const [geoError, setGeoError] = useState(null);
    
    // Mission State
    const [incomingOrder, setIncomingOrder] = useState(null);
    const [activeTrip, setActiveTrip] = useState(null);

    const watchIdRef = useRef(null);
    const orderSubRef = useRef(null);
    const locRef = useRef(null); // Ref to access latest location in subscriptions

    useEffect(() => {
        locRef.current = currentLocation;
    }, [currentLocation]);

    useEffect(() => {
        const fetchSession = async () => {
            const { data } = await supabase.auth.getUser();
            if (data?.user) setUser(data.user);
        };
        fetchSession();
    }, [supabase.auth]);
    
    // Toggle Online/Offline state
    const toggleStatus = async () => {
        const newStatus = !isOnline;
        setIsOnline(newStatus);
        
        if (newStatus) {
            startTracking();
            listenForOrders();
        } else {
            stopTracking();
            stopListening();
            setIncomingOrder(null);
        }
    };

    const startTracking = () => {
        if (!navigator.geolocation) {
            setGeoError("Geolocation is not supported by your browser");
            return;
        }

        watchIdRef.current = navigator.geolocation.watchPosition(
            async (position) => {
                const { latitude, longitude } = position.coords;
                setCurrentLocation({ lat: latitude, lng: longitude });
                setGeoError(null);

                if (user) {
                    await supabase.from('driver_locations').upsert({
                        driver_id: user.id,
                        lat: latitude,
                        lng: longitude,
                        updated_at: new Date().toISOString()
                    });
                }
            },
            (error) => {
                setGeoError(error.message);
                setIsOnline(false); 
                stopListening();
            },
            { enableHighAccuracy: true, maximumAge: 10000, timeout: 5000 }
        );
    };

    const stopTracking = () => {
        if (watchIdRef.current !== null) {
            navigator.geolocation.clearWatch(watchIdRef.current);
            watchIdRef.current = null;
        }
    };

    const listenForOrders = () => {
        if (!user) return;

        orderSubRef.current = supabase.channel('driver-orders')
            .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, (payload) => {
                const order = payload.new;
                
                // 1. New available orders
                if (order.status === 'looking_for_driver' && !activeTrip) {
                    if (locRef.current && order.pickup_lat && order.pickup_lng) {
                        const distKm = calculateDistance(
                            locRef.current.lat, 
                            locRef.current.lng, 
                            order.pickup_lat, 
                            order.pickup_lng
                        );
                        // Only show orders within a 15km radius (adjustable)
                        if (distKm <= 15) {
                            setIncomingOrder({ ...order, distanceKm: distKm.toFixed(1) });
                        } else {
                            console.log(`Order ${order.id} too far (${distKm.toFixed(1)}km), ignoring.`);
                        }
                    } else {
                        // Fallback if location missing (e.g. testing)
                        setIncomingOrder(order);
                    }
                }
                
                // 2. An order was secured by me (User accepted my bid)
                if (order.status !== 'looking_for_driver' && order.driver_id === user.id) {
                    setIncomingOrder(null);
                    if (order.status === 'delivered') {
                        setActiveTrip(null);
                    } else {
                        setActiveTrip(order);
                    }
                }
                
                // 3. Order taken by someone else or cancelled
                if ((payload.eventType === 'DELETE' || order.status !== 'looking_for_driver') && incomingOrder?.id === order.id && order.driver_id !== user.id) {
                    setIncomingOrder(null);
                }
            }).subscribe();
    };

    const stopListening = () => {
        if (orderSubRef.current) {
            supabase.removeChannel(orderSubRef.current);
            orderSubRef.current = null;
        }
    };

    useEffect(() => {
        // Resume active trips on load
        const checkActiveTrip = async () => {
            if (!user) return;
            const { data } = await supabase.from('orders')
                .select('*')
                .eq('driver_id', user.id)
                .in('status', ['accepted', 'arriving_pickup', 'picked_up', 'arriving'])
                .single();
            if (data) {
                setActiveTrip(data);
                setIsOnline(true);
                startTracking();
                listenForOrders();
            }
        };
        checkActiveTrip();

        return () => {
            stopTracking();
            stopListening();
        };
    }, [user]);

    // Action Handlers
    const handleAcceptBase = async () => {
        if (!incomingOrder || !user) return;
        setIncomingOrder(null); // Optimistic clear
        await supabase.from('bids').insert({
            order_id: incomingOrder.id,
            driver_id: user.id,
            amount: incomingOrder.agreed_price,
            status: 'pending' 
        });
        alert('Offer sent! Waiting for customer to accept.');
    };

    const handleCounterOffer = async (amount) => {
        if (!incomingOrder || !user) return;
        setIncomingOrder(null); 
        await supabase.from('bids').insert({
            order_id: incomingOrder.id,
            driver_id: user.id,
            amount: amount,
            status: 'pending'
        });
        alert(`Counter Offer of ₦${amount} sent! Wait for approval.`);
    };

    const handleUpdateStatus = async (nextStatus) => {
        if (!activeTrip) return;
        
        // Optimistic UI update
        setActiveTrip({ ...activeTrip, status: nextStatus });
        
        await supabase.from('orders')
            .update({ status: nextStatus })
            .eq('id', activeTrip.id);
            
        if (nextStatus === 'delivered') {
            setActiveTrip(null);
            alert('Delivery completed! Great job.');
        }
    };

    return (
        <div className="flex-1 flex flex-col relative overflow-hidden bg-charcoal-900 border-x border-charcoal-800">
            {/* Map Area */}
            <div className={`absolute inset-0 transition-opacity duration-1000 ${isOnline ? 'opacity-100' : 'opacity-20 grayscale'}`}>
                {currentLocation ? (
                    <TrackingMap driverLocation={currentLocation} />
                ) : (
                    <div className="h-full w-full flex items-center justify-center">
                        <MapPin size={48} className="text-charcoal-800 animate-bounce" />
                    </div>
                )}
            </div>

            {/* Error Toast */}
            {geoError && (
                <div className="absolute top-4 left-4 right-4 z-50 bg-red-500/90 text-white px-4 py-3 rounded-2xl text-sm font-bold shadow-lg backdrop-blur-md">
                    ⚠️ GPS Error: {geoError}
                </div>
            )}

            {/* Sub-Components */}
            {incomingOrder && !activeTrip && (
                <IncomingOrderCard 
                  order={incomingOrder} 
                  onAcceptBase={handleAcceptBase} 
                  onCounterOffer={handleCounterOffer} 
                  onReject={() => setIncomingOrder(null)} 
                />
            )}

            {activeTrip && (
                <ActiveTripPanel 
                  order={activeTrip} 
                  onUpdateStatus={handleUpdateStatus} 
                />
            )}

            {/* Offline Shield */}
            {!isOnline && !activeTrip && !incomingOrder && (
                <div className="absolute inset-0 z-10 bg-charcoal-900/60 backdrop-blur-sm flex flex-col items-center justify-center p-6 text-center">
                    <div className="w-24 h-24 bg-charcoal-800 rounded-full flex items-center justify-center mb-6 shadow-2xl ring-4 ring-charcoal-700/50">
                        <Power size={40} className="text-gray-500" />
                    </div>
                    <h2 className="text-2xl font-black text-white mb-2">You are Offline</h2>
                    <p className="text-gray-400 font-medium text-sm max-w-[250px]">
                        Go online to start receiving delivery requests in your area.
                    </p>
                    
                    {/* Developer Demo Button */}
                    <button 
                      onClick={() => setActiveTrip({
                        id: 'demo-1234-abcd',
                        status: 'accepted',
                        pickup_name: 'Shoprite Kano',
                        pickup_lat: 11.980, pickup_lng: 8.540,
                        dropoff_name: 'Sabon Gari Market',
                        dropoff_lat: 12.000, dropoff_lng: 8.550,
                        delivery_pin: '1234',
                        driver_id: user?.id
                      })}
                      className="mt-8 py-2 px-6 rounded-full bg-emerald-500/20 text-emerald-400 font-bold text-sm border border-emerald-500/30 hover:bg-emerald-500/30 transition-colors"
                    >
                      🧪 Force Demo Live Trip
                    </button>
                </div>
            )}

            {/* Go Online/Offline Toggle Bar (Only show if not mid-trip) */}
            {!activeTrip && (
                <div className="absolute bottom-0 left-0 right-0 z-40 p-4 pb-6 bg-gradient-to-t from-charcoal-900 via-charcoal-900/95 to-transparent">
                    <button
                        onClick={toggleStatus}
                        className={`w-full py-3.5 rounded-2xl font-black text-base shadow-xl transition-all flex items-center justify-center gap-2 ${
                            isOnline 
                            ? 'bg-red-500 hover:bg-red-600 text-white shadow-red-500/20 ring-2 ring-red-500/20' 
                            : 'bg-emerald-500 hover:bg-emerald-600 text-charcoal-900 shadow-emerald-500/20 ring-2 ring-emerald-500/20'
                        }`}
                    >
                        <Power size={20} />
                        {isOnline ? 'GO OFFLINE' : 'GO ONLINE'}
                    </button>
                </div>
            )}
        </div>
    );
}
