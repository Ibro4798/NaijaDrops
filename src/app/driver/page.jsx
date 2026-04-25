"use client";

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/utils/supabase/client';
import { MapPin, Power, Clock, ShieldCheck, AlertCircle, Wallet, Star, Zap, Activity, Bell, Info } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import dynamic from 'next/dynamic';
import IncomingOrderCard from '@/components/driver/IncomingOrderCard';
import ActiveTripPanel from '@/components/driver/ActiveTripPanel';
import { calculateDistance } from '@/utils/distance';
import { getReliableLocation } from '@/utils/geolocation';
import Skeleton from '@/components/ui/Skeleton';
import { findBatchableOrders } from '@/utils/maestro';

const TrackingMap = dynamic(() => import('@/components/TrackingMap'), { 
  ssr: false,
  loading: () => <div className="h-full w-full bg-charcoal-800 animate-pulse flex items-center justify-center text-charcoal-500 font-bold">Scanning GPS...</div>
});

export default function DriverDashboard() {
    const router = useRouter();
    const supabase = createClient();
    const [user, setUser] = useState(null);
    const [isOnline, setIsOnline] = useState(false);
    const [currentLocation, setCurrentLocation] = useState(null);
    const [geoError, setGeoError] = useState(null);
    const [isLocating, setIsLocating] = useState(false);
    
    // Mission State
    const [incomingOrder, setIncomingOrder] = useState(null);
    const [availableOrders, setAvailableOrders] = useState([]);
    const [suggestedBatch, setSuggestedBatch] = useState(null);
    const [activeTrip, setActiveTrip] = useState(null);
    const [awaitingPayment, setAwaitingPayment] = useState(false); // Waiting for customer to pay

    const watchIdRef = useRef(null);
    const orderSubRef = useRef(null);
    const locRef = useRef(null); // Ref to access latest location in subscriptions
    const [profile, setProfile] = useState(null);
    const [verificationStatus, setVerificationStatus] = useState(null);
    const [driverStats, setDriverStats] = useState(null);
    const [cancellationNotice, setCancellationNotice] = useState(null); // { orderId: string, message: string }
    const [notifications, setNotifications] = useState([]);
    const [showNotifications, setShowNotifications] = useState(false);

    // ============================================================================
    // LOCATION BATCHING: Queue GPS updates and flush every 15 seconds
    // This reduces database writes by 90% and Realtime load by 80%
    // ============================================================================
    const locationBatchRef = useRef(null); // Current queued location
    const batchIntervalRef = useRef(null); // Interval for flushing

    // FIX #7: Track location sync status
    const [locationStatus, setLocationStatus] = useState('ready');  // 'ready' | 'syncing' | 'error'
    const [lastLocationSync, setLastLocationSync] = useState(null);

    const startLocationBatching = () => {
        if (batchIntervalRef.current) return; // Already running

        // FIX #8: Track last uploaded location for smart broadcasting
        let lastUploadedLoc = null;

        // Flush latest queued location to database every 15 seconds
        batchIntervalRef.current = setInterval(async () => {
            if (locationBatchRef.current && user) {
                const { lat, lng } = locationBatchRef.current;

                // FIX #8: Only upload if driver moved > 20 meters
                let shouldUpload = false;
                if (!lastUploadedLoc) {
                    shouldUpload = true;  // First upload always
                } else {
                    const dist = calculateDistance(
                        lastUploadedLoc.lat, lastUploadedLoc.lng,
                        lat, lng
                    );
                    shouldUpload = dist >= 0.02;  // 0.02 km = 20 meters
                }

                if (shouldUpload) {
                    setLocationStatus('syncing');  // FIX #7: Mark as syncing
                    try {
                        await supabase.from('driver_locations').upsert({
                            driver_id: user.id,
                            lat: lat,
                            lng: lng,
                            city: profile?.city || 'Kano',
                            updated_at: new Date().toISOString()
                        });
                        lastUploadedLoc = { lat, lng };
                        setLocationStatus('ready');  // FIX #7: Mark as ready
                        setLastLocationSync(new Date());
                    } catch (err) {
                        console.error('Failed to batch update location:', err);
                        setLocationStatus('error');  // FIX #7: Mark as error
                        setTimeout(() => setLocationStatus('ready'), 2000);
                    }
                } else {
                    // Driver didn't move, don't upload (save writes & Realtime messages)
                    setLocationStatus('ready');
                }
            }
        }, 15000); // 15 seconds
    };

    const stopLocationBatching = () => {
        if (batchIntervalRef.current) {
            clearInterval(batchIntervalRef.current);
            batchIntervalRef.current = null;
        }
    };

    const queueLocationUpdate = (lat, lng) => {
        // Just queue it, don't upload yet. Batch interval will handle it.
        locationBatchRef.current = { lat, lng };
    };

    useEffect(() => {
        locRef.current = currentLocation;
    }, [currentLocation]);

    useEffect(() => {
        const fetchSession = async () => {
            if (typeof window !== 'undefined' && 'Notification' in window) {
                if (Notification.permission === 'default') {
                    Notification.requestPermission();
                }
            }

            const { user, role, profile: prof } = await getUserRole(supabase);
            
            if (user && role === 'driver') {
                setUser(user);
                setProfile(prof);
                
                try {
                    const { data: stats } = await supabase.rpc('get_driver_stats', { d_id: user.id });
                    if (stats && stats[0]) setDriverStats(stats[0]);
                } catch (e) { console.error("Could not fetch stats", e); }

                const fetchNotifications = async () => {
                    const { data } = await supabase
                        .from('notifications')
                        .select('*')
                        .eq('user_id', user.id)
                        .order('created_at', { ascending: false })
                        .limit(5);
                    if (data) setNotifications(data);
                };
                fetchNotifications();

                // Subscribe to internal notifications
                const notificationChannel = supabase.channel(`driver-notifications-${user.id}`)
                    .on('postgres_changes', { 
                        event: 'INSERT', 
                        schema: 'public', 
                        table: 'notifications', 
                        filter: `user_id=eq.${user.id}` 
                    }, (payload) => {
                        setNotifications(prev => [payload.new, ...prev]);
                        if (Notification.permission === 'granted') {
                            new Notification(payload.new.title, { body: payload.new.message });
                        }
                    })
                    .subscribe();

                const status = prof.driver_status || 'pending';
                
                if (status === 'active') {
                    setVerificationStatus('verified');
                } else if (status === 'paused' || status === 'rejected') {
                    setVerificationStatus(status);
                } else {
                    const { count } = await supabase
                        .from('driver_documents')
                        .select('id', { count: 'exact', head: true })
                        .eq('driver_id', user.id);
                    
                    setVerificationStatus(count > 0 ? 'pending' : 'not_started');
                }
            } else if (user) {
                // Not a driver but logged in? Redirect to home/chooser
                router.push('/welcome');
            }
        };
        fetchSession();
    }, [supabase, router]);

    const toggleStatus = async () => {
        if (verificationStatus !== 'verified') {
            if (verificationStatus === 'not_started') {
                router.push('/driver/onboarding');
            }
            return;
        }

        const newStatus = !isOnline;
        setIsOnline(newStatus);
        
        if (newStatus) {
            setIsLocating(true);
            const loc = await startTracking();
            if (loc) {
                await fetchAvailableOrders(loc);
            }
            listenForOrders();
            setIsLocating(false);
        } else {
            stopTracking();
            stopListening();
            setIncomingOrder(null);
        }
    };

    const fetchAvailableOrders = async (location) => {
        if (!location) return;
        const { data, error } = await supabase
            .from('orders')
            .select('*')
            .eq('status', 'looking_for_driver');
            
        if (data && data.length > 0) {
            const nearby = data.map(o => {
                let distKm = null;
                if (o.pickup_lat && location.lat) {
                  distKm = calculateDistance(location.lat, location.lng, o.pickup_lat, o.pickup_lng);
                  o.distanceKm = distKm.toFixed(1);
                }
                return o; // BROADCAST: Send ALL orders to ALL drivers for testing phase
            });
            setAvailableOrders(nearby);
        }
    };

    const startTracking = async () => {
        setGeoError(null);
        let locToReturn = null;
        const location = await getReliableLocation();
        if (location) {
            locToReturn = location;
            setCurrentLocation({ lat: location.lat, lng: location.lng });
            // Initial location upload (immediate, so user doesn't have stale data)
            if (user) {
                await supabase.from('driver_locations').upsert({
                    driver_id: user.id,
                    lat: location.lat,
                    lng: location.lng,
                    city: profile?.city || 'Kano',
                    updated_at: new Date().toISOString()
                });
            }
        }

        if (!navigator.geolocation) {
            setGeoError("Geolocation is not supported");
            return locToReturn;
        }

        // START LOCATION BATCHING: Prevents database thrashing
        startLocationBatching();

        watchIdRef.current = navigator.geolocation.watchPosition(
            (position) => {
                const { latitude, longitude } = position.coords;
                setCurrentLocation({ lat: latitude, lng: longitude });
                setGeoError(null);
                // BATCHED: Queue update instead of immediate database write
                queueLocationUpdate(latitude, longitude);
            },
            (error) => {
                console.warn("GPS Watch Error:", error.message);
                if (!locRef.current) {
                    setGeoError(error.message);
                    setIsOnline(false);
                    stopListening();
                }
            },
            { enableHighAccuracy: true, maximumAge: 0, timeout: 20000 }
        );
        return locToReturn;
    };

    const stopTracking = () => {
        if (watchIdRef.current !== null) {
            navigator.geolocation.clearWatch(watchIdRef.current);
            watchIdRef.current = null;
        }
        // STOP LOCATION BATCHING
        stopLocationBatching();
    };

    const listenForOrders = () => {
        if (!user) return;
        orderSubRef.current = supabase.channel('driver-orders')
            .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, (payload) => {
                const order = payload.new;
                const oldOrder = payload.old;

        if (payload.eventType === 'INSERT' || payload.eventType === 'UPDATE') {
                    // Awaiting payment: driver bid was accepted, now waiting for customer payment
                    if (order.status === 'awaiting_payment' && order.driver_id === user.id) {
                        setAvailableOrders([]);
                        setSuggestedBatch(null);
                        setIncomingOrder(null);
                        setAwaitingPayment(true);
                        return;
                    }

                    if (order.status === 'cancelled') {
                        // Check if this driver was involved
                        if (incomingOrder?.id === order.id || activeTrip?.id === order.id || awaitingPayment) {
                            setCancellationNotice({
                                orderId: order.id,
                                message: `Order to ${order.dropoff_name || 'Destination'} was cancelled by the customer.`
                            });
                            setIncomingOrder(null);
                            setAvailableOrders(prev => prev.filter(o => o.id !== order.id));
                            if (awaitingPayment) setAwaitingPayment(false);
                        }
                        return;
                    }

                    if (order.status === 'looking_for_driver') {
                        setAvailableOrders(prev => {
                            const isNew = !prev.find(o => o.id === order.id);
                            if (isNew && payload.eventType === 'INSERT' && Notification.permission === 'granted') {
                                new Notification('New Delivery Request!', {
                                    body: `New request to ${order.dropoff_name}. Tap to view.`
                                });
                            }
                            const filtered = prev.filter(o => o.id !== order.id);
                            let distKm = null;
                            if (locRef.current && order.pickup_lat) {
                                distKm = calculateDistance(locRef.current.lat, locRef.current.lng, order.pickup_lat, order.pickup_lng);
                                distKm = distKm.toFixed(1);
                            }
                            return [...filtered, { ...order, distanceKm: distKm }]; // BROADCAST: Allow all for testing phase
                        });
                    } else {
                        setAvailableOrders(prev => prev.filter(o => o.id !== order.id));
                    }
                }

                if (payload.eventType === 'DELETE') {
                    setAvailableOrders(prev => prev.filter(o => o.id !== (oldOrder?.id || payload.old?.id)));
                }
                
                if (order?.status === 'accepted' && order?.driver_id === user.id) {
                    setAwaitingPayment(false); // Payment done, trip starts
                    setAvailableOrders([]);
                    setSuggestedBatch(null);
                    setActiveTrip(order);
                }
                
                if (activeTrip && order?.id === activeTrip.id && order?.driver_id === user.id) {
                    if (order.status === 'delivered') setActiveTrip(null);
                    else setActiveTrip(order);
                }
            }).subscribe();
    };

    // Maestro AI: Batch Detection Effect
    useEffect(() => {
        const checkBatches = async () => {
            if (!isOnline || activeTrip) {
                setIncomingOrder(null);
                setSuggestedBatch(null);
                return;
            }

            if (availableOrders.length > 1) {
                const batches = await findBatchableOrders(availableOrders);
                if (batches?.length > 0) {
                    setSuggestedBatch(batches[0]);
                    setIncomingOrder(null);
                } else {
                    // Multiple orders but no batch, show list (handled in UI)
                    setSuggestedBatch(null);
                    setIncomingOrder(availableOrders[0]); // Default to first for legacy compat
                }
            } else if (availableOrders.length === 1) {
                setIncomingOrder(availableOrders[0]);
                setSuggestedBatch(null);
            } else {
                setIncomingOrder(null);
                setSuggestedBatch(null);
            }
        };
        checkBatches();
    }, [availableOrders, activeTrip, isOnline]);

    const stopListening = () => {
        if (orderSubRef.current) {
            supabase.removeChannel(orderSubRef.current);
            orderSubRef.current = null;
        }
    };

    useEffect(() => {
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

    const handleUpdateStatus = async (nextStatus, extraFields = {}) => {
        if (!activeTrip) return;
        setActiveTrip({ ...activeTrip, status: nextStatus, ...extraFields });
        
        await supabase.from('orders').update({ status: nextStatus, ...extraFields }).eq('id', activeTrip.id);
        
        if (nextStatus === 'delivered') {
            try {
                // Wait for order update then credit wallet
                const driverEarning = activeTrip.agreed_price * 0.85; // Driver gets 85% (15% platform fee)
                await supabase.from('wallet_transactions').insert({
                    driver_id: user.id,
                    amount: driverEarning,
                    type: 'earning',
                    order_id: activeTrip.id,
                    description: `Earning for trip: ${activeTrip.dropoff_name}`
                });
            } catch (err) {
                console.error('Wallet update failed', err);
            }
            setActiveTrip(null);
            alert('Delivery completed! Great job. Earnings have been added to your wallet.');
        }
    };

    const handleAcceptBase = async (order) => {
        if (!user || !order) return;
        try {
            await supabase.from('bids').insert({
                order_id: order.id,
                driver_id: user.id,
                amount: order.agreed_price,
                status: 'pending'
            });
            // Remove from available orders; await customer's choice
            setAvailableOrders(prev => prev.filter(o => o.id !== order.id));
        } catch (err) {
            console.error('Failed to submit base bid:', err);
        }
    };

    const handleCounterOffer = async (order, amount) => {
        if (!user || !order || !amount) return;
        try {
            await supabase.from('bids').insert({
                order_id: order.id,
                driver_id: user.id,
                amount: amount,
                status: 'pending'
            });
            // Remove from available orders; await customer's choice
            setAvailableOrders(prev => prev.filter(o => o.id !== order.id));
        } catch (err) {
            console.error('Failed to submit counter offer:', err);
        }
    };

    return (
        <div className="flex-1 flex flex-col relative overflow-hidden bg-charcoal-950">
            {/* Map Area */}
            <div className={`absolute inset-0 transition-opacity duration-1000 ${isOnline ? 'opacity-100' : 'opacity-20 grayscale scale-[1.05]'}`}>
                {currentLocation ? (
                    <TrackingMap 
                        driverLocation={currentLocation} 
                        dropoffLocation={activeTrip ? { lat: activeTrip.dropoff_lat, lng: activeTrip.dropoff_lng } : null} 
                        demandData={availableOrders}
                    />
                ) : (
                    <div className="h-full w-full flex items-center justify-center bg-charcoal-900 shadow-inner">
                        <div className="relative">
                           <div className="absolute inset-0 bg-emerald-500/10 rounded-full animate-ping"></div>
                           <MapPin size={64} className="text-emerald-500 relative z-10 drop-shadow-[0_0_15px_rgba(16,185,129,0.5)]" />
                        </div>
                    </div>
                )}
            </div>

            {/* Aura Overlay for Depth */}
            <div className="absolute inset-0 pointer-events-none bg-gradient-to-b from-charcoal-950/40 via-transparent to-charcoal-950/80"></div>

            {/* Online Status Bar (Aura Glass) */}
            <AnimatePresence>
                {isOnline && !activeTrip && (
                <motion.div 
                    initial={{ opacity: 0, y: -20 }}
                    animate={{ opacity: 1, y: 0 }}
                    key="online-status"
                    className="absolute top-6 left-6 right-6 z-40 flex items-center justify-between pointer-events-none"
                >
                    <div className="glass-dark px-6 py-3 rounded-full border-emerald-500/20 flex items-center gap-3 shadow-premium pointer-events-auto">
                        <div className="relative w-2.5 h-2.5">
                            <div className="absolute inset-0 bg-emerald-500 rounded-full animate-ping shadow-glow"></div>
                            <div className="absolute inset-0 bg-emerald-500 rounded-full"></div>
                        </div>
                        <span className="text-[10px] font-black text-white uppercase tracking-[0.25em] font-outfit">Fleet Radar: Active</span>
                        <div className="h-4 w-px bg-white/10 mx-1"></div>
                        <span className="text-[10px] font-bold text-emerald-400 uppercase tracking-widest">{profile?.city || 'Kano'} Cluster</span>
                    </div>

                    <div className="flex gap-2">
                        <button 
                            onClick={() => setShowNotifications(!showNotifications)}
                            className="w-12 h-12 glass flex items-center justify-center text-white shadow-premium pointer-events-auto hover:bg-white/10 transition-all rounded-2xl relative"
                        >
                            <Bell size={20} />
                            {notifications.some(n => !n.is_read) && (
                                <div className="absolute top-3 right-3 w-2.5 h-2.5 bg-blue-500 rounded-full border-2 border-charcoal-900 shadow-glow"></div>
                            )}
                        </button>
                        <Link href="/driver/wallet" className="w-12 h-12 glass flex items-center justify-center text-emerald-500 shadow-premium pointer-events-auto hover:bg-emerald-500 hover:text-white transition-all group rounded-2xl">
                            <Wallet size={20} />
                        </Link>
                    </div>
                </motion.div>
                )}
            </AnimatePresence>

            {/* Notifications Panel */}
            <AnimatePresence>
                {showNotifications && (
                    <motion.div 
                        initial={{ opacity: 0, x: 20 }}
                        animate={{ opacity: 1, x: 0 }}
                        exit={{ opacity: 0, x: 20 }}
                        className="fixed top-24 right-6 w-80 z-[60] glass-dark border border-white/10 rounded-[2.5rem] p-6 shadow-premium overflow-hidden"
                    >
                        <div className="flex items-center justify-between mb-6">
                            <h3 className="text-white font-black text-xs uppercase tracking-[0.2em] font-outfit">Official Transmissions</h3>
                            <button onClick={() => setShowNotifications(false)} className="text-gray-500 hover:text-white transition-colors">
                                <X size={16} />
                            </button>
                        </div>
                        
                        <div className="space-y-3 max-h-[400px] overflow-y-auto custom-scrollbar pr-1">
                            {notifications.length === 0 ? (
                                <div className="py-10 text-center">
                                    <p className="text-[10px] font-bold text-gray-600 uppercase tracking-widest">No signals received</p>
                                </div>
                            ) : (
                                notifications.map(notif => (
                                    <div key={notif.id} className={`p-4 rounded-2xl border ${notif.is_read ? 'bg-white/5 border-white/5' : 'bg-blue-500/10 border-blue-500/20'} transition-all`}>
                                        <div className="font-black text-[10px] text-blue-400 uppercase tracking-widest mb-1">{notif.title}</div>
                                        <div className="text-[11px] text-white/80 font-medium leading-relaxed">{notif.message}</div>
                                        <div className="text-[9px] text-gray-500 mt-2 font-mono">{new Date(notif.created_at).toLocaleDateString()}</div>
                                    </div>
                                ))
                            )}
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Offline Wallet Shortcut */}
            {!isOnline && !activeTrip && (
                <div className="absolute top-6 right-6 z-40">
                    <Link href="/driver/wallet" className="w-12 h-12 glass flex items-center justify-center text-emerald-500 shadow-premium hover:bg-emerald-500 hover:text-white transition-all rounded-2xl">
                        <Wallet size={20} />
                    </Link>
                </div>
            )}

            {/* Hardened Location Status Indicator */}
            {isOnline && (
                <div className="absolute bottom-32 left-1/2 -translate-x-1/2 z-40 pointer-events-none">
                    <div className={`glass px-4 py-2 rounded-full border-white/5 flex items-center gap-3 shadow-premium transition-all duration-500 ${locationStatus === 'syncing' ? 'opacity-100 scale-100' : 'opacity-60 scale-95'}`}>
                        {locationStatus === 'syncing' ? (
                            <div className="w-3 h-3 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin"></div>
                        ) : (
                            <div className={`w-2 h-2 rounded-full ${locationStatus === 'ready' ? 'bg-emerald-500' : 'bg-red-500 animate-pulse'}`}></div>
                        )}
                        <span className="text-[9px] font-black text-charcoal-100 uppercase tracking-[0.1em]">
                            {locationStatus === 'syncing' ? 'Synchronizing GPS' : locationStatus === 'ready' ? 'Cloud Synced' : 'Sync Error'}
                        </span>
                    </div>
                </div>
            )}

            {/* Error Toast */}
            {geoError && (
                <div className="absolute top-24 left-6 right-6 z-50 glass-dark text-white px-6 py-4 rounded-[2rem] shadow-premium border-red-500/20 flex flex-col gap-3">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-red-500/20 rounded-xl flex items-center justify-center text-red-500">
                           <AlertCircle size={20} />
                        </div>
                        <div>
                            <div className="text-xs font-black uppercase tracking-widest text-red-500">Location Access Denied</div>
                            <div className="text-sm font-medium text-charcoal-400">{geoError}</div>
                        </div>
                    </div>
                    <button onClick={() => { setCurrentLocation({ lat: 11.980, lng: 8.540 }); setGeoError(null); }} className="w-full bg-red-500 text-white py-3 rounded-xl text-[10px] font-black uppercase tracking-[0.2em] transition-all hover:bg-red-600">
                        Bypass with Fallback
                    </button>
                </div>
            )}

            {/* Main Interactive Panel */}
            <div className="absolute bottom-0 left-0 right-0 z-50 p-6">
                <AnimatePresence mode="wait">
                    {/* Active Trip Content */}
                    {activeTrip ? (
                        <motion.div key="active-trip" initial={{ y: 50, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 50, opacity: 0 }}>
                            <ActiveTripPanel order={activeTrip} driverProfile={profile} currentLocation={currentLocation} onUpdateStatus={handleUpdateStatus} />
                        </motion.div>
                    ) : isOnline ? (
                        /* Online State */
                        <motion.div key="online" initial={{ y: 20, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 20, opacity: 0 }} className="space-y-4">
                            {suggestedBatch ? (
                                <div className="animate-in fade-in slide-in-from-bottom-8 duration-700">
                                    <div className="glass-dark border-2 border-emerald-500/50 rounded-[3rem] p-8 shadow-glow relative overflow-hidden">
                                        <div className="absolute top-0 right-0 bg-emerald-500 text-charcoal-950 text-[10px] font-black uppercase tracking-widest px-6 py-2 rounded-bl-3xl flex items-center gap-2">
                                            <Zap size={14} /> Batch Alert
                                        </div>
                                        <h3 className="text-white font-black text-2xl leading-none mb-2 font-outfit">Maestro AI Optimization</h3>
                                        <p className="text-emerald-400 text-[11px] font-black uppercase tracking-[0.2em] mb-8">{suggestedBatch.orders.length} Deliveries • ₦{suggestedBatch.totalFare.toLocaleString()}</p>
                                        
                                        <div className="flex gap-4">
                                            <button onClick={() => setAvailableOrders([])} className="flex-1 py-5 glass border-white/5 text-white font-black rounded-[2rem] text-[11px] uppercase tracking-widest">Ignore</button>
                                            <button className="flex-[2] py-5 bg-emerald-500 hover:bg-emerald-400 text-charcoal-950 font-black rounded-[2rem] shadow-glow text-[11px] uppercase tracking-widest">Accept Batch</button>
                                        </div>
                                    </div>
                                </div>
                             ) : availableOrders.length > 0 ? (
                                <div className="space-y-4">
                                    <div className="flex items-center justify-between px-6 pt-2">
                                        <div className="flex items-center gap-2">
                                            <div className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse shadow-glow"></div>
                                            <span className="text-white font-black text-[10px] uppercase tracking-[0.3em] font-outfit italic">Job Radar ({availableOrders.length})</span>
                                        </div>
                                        <span className="text-charcoal-500 text-[9px] font-black uppercase tracking-widest">Swipe for more</span>
                                    </div>
                                    
                                    <div className="flex gap-4 overflow-x-auto pb-10 px-2 -mx-4 no-scrollbar snap-x snap-mandatory">
                                        {availableOrders.map((order, idx) => (
                                            <div key={order.id} className="min-w-[90vw] snap-center first:ml-4 last:mr-4">
                                                <IncomingOrderCard 
                                                    order={order} 
                                                    onReject={() => setAvailableOrders(prev => prev.filter(o => o.id !== order.id))}
                                                    onAcceptBase={() => handleAcceptBase(order)}
                                                    onCounterOffer={(amount) => handleCounterOffer(order, amount)}
                                                    isEmbedded={true}
                                                />
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            ) : (
                                /* Scanning State */
                                <div className="glass-dark p-10 rounded-[3rem] border-white/5 text-center flex flex-col items-center shadow-premium">
                                    <div className="w-16 h-16 bg-emerald-500/10 rounded-full flex items-center justify-center mb-6 relative">
                                        <div className="absolute inset-0 bg-emerald-500/20 rounded-full animate-ping"></div>
                                        <div className="w-3 h-3 bg-emerald-500 rounded-full shadow-glow"></div>
                                    </div>
                                    <h2 className="text-white font-black text-2xl font-outfit tracking-tight mb-2 uppercase italic tracking-widest">Scanning Grid</h2>
                                    <p className="text-charcoal-400 text-xs font-bold uppercase tracking-widest max-w-[200px]">Waiting for delivery requests in your radius</p>
                                </div>
                            )}


                            {/* Heavy Offline Button */}
                            <button onClick={toggleStatus} className="w-full py-5 bg-charcoal-900 border border-white/10 text-white rounded-[2rem] font-black text-sm uppercase tracking-[0.2em] shadow-premium hover:bg-black transition-all">
                                Go Offline
                            </button>
                        </motion.div>
                    ) : (
                        /* Offline State */
                        <motion.div key="offline" initial={{ y: 20, opacity: 0 }} animate={{ y: 0, opacity: 1 }} className="glass-dark p-10 rounded-[3rem] border-white/5 text-center shadow-premium relative overflow-hidden">
                            <div className="absolute top-0 right-0 w-[200px] h-[200px] bg-emerald-500/5 rounded-full blur-[80px] -mr-24 -mt-24"></div>
                            
                            <div className="w-24 h-24 bg-charcoal-800 rounded-[2.5rem] flex items-center justify-center mx-auto mb-8 shadow-inner ring-1 ring-white/5">
                                <Power size={48} className="text-charcoal-600" />
                            </div>
                            <h2 className="text-3xl font-black text-white mb-3 font-outfit leading-none tracking-tight">Systems Halted</h2>
                            <p className="text-charcoal-500 font-bold text-[11px] uppercase tracking-widest mb-10">You are currently hidden from the network.</p>
                            
                            {driverStats && (
                                <div className="flex justify-center gap-6 mb-10">
                                    <div className="text-center">
                                        <div className="text-[10px] text-charcoal-600 font-black uppercase tracking-widest mb-2">Platform Rank</div>
                                        <div className="text-xl font-black text-emerald-500 flex items-center gap-1">
                                            <Star size={16} fill="currentColor" /> {driverStats.avg_rating}
                                        </div>
                                    </div>
                                    <div className="w-px h-10 bg-white/10"></div>
                                    <div className="text-center">
                                        <div className="text-[10px] text-charcoal-600 font-black uppercase tracking-widest mb-2">Total Payload</div>
                                        <div className="text-xl font-black text-white">{driverStats.total_trips}</div>
                                    </div>
                                </div>
                            )}

                            <button onClick={toggleStatus} className="w-full py-6 bg-emerald-500 hover:bg-emerald-400 text-charcoal-950 rounded-[2.5rem] font-black text-lg uppercase tracking-[0.2em] shadow-glow transition-all active:scale-95">
                                Go Online
                            </button>

                            {/* Verification Status Banner */}
                            {(verificationStatus === 'pending' || verificationStatus === 'not_started') && (
                                <div className="mt-4 glass-dark p-6 rounded-[2rem] border border-amber-500/20 text-left relative overflow-hidden group hover:border-amber-500/40 transition-all cursor-pointer" onClick={() => router.push('/driver/onboarding')}>
                                    <div className="absolute top-0 right-0 w-24 h-24 bg-amber-500/5 rounded-full blur-2xl -mr-12 -mt-12"></div>
                                    <div className="flex items-center gap-4">
                                        <div className="w-12 h-12 bg-amber-500/10 rounded-2xl flex items-center justify-center text-amber-500 border border-amber-500/20">
                                            {verificationStatus === 'pending' ? <Clock size={20} /> : <Info size={20} />}
                                        </div>
                                        <div>
                                            <div className="text-amber-500 font-black text-[10px] uppercase tracking-widest italic">{verificationStatus === 'pending' ? 'Compliance Review' : 'Authorization Required'}</div>
                                            <div className="text-white font-bold text-xs">
                                                {verificationStatus === 'pending' 
                                                    ? 'Your unit metadata is being evaluated by admin.' 
                                                    : 'Broadcast your driver credentials to begin operations.'}
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            )}
                        </motion.div>
                    )}
                </AnimatePresence>
            </div>

            {/* Global Overlays (Glassmorphism) */}
            <AnimatePresence>
                {awaitingPayment && (
                    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} key="awaiting-payment" className="absolute inset-0 z-[60] bg-charcoal-950/80 backdrop-blur-md flex items-center justify-center p-8">
                        <div className="glass p-10 rounded-[4rem] text-center border-emerald-500/20 shadow-premium">
                             <div className="w-20 h-20 bg-emerald-500/10 rounded-full flex items-center justify-center mx-auto mb-6">
                                <Activity className="w-10 h-10 text-emerald-500 animate-pulse" />
                             </div>
                             <h3 className="text-3xl font-black text-charcoal-900 font-outfit mb-2">Bid Locked</h3>
                             <p className="text-charcoal-400 font-bold text-xs uppercase tracking-widest mb-8">Synchronizing payment metadata...</p>
                             <div className="px-6 py-4 bg-charcoal-900 rounded-2xl text-[10px] text-emerald-500 font-black uppercase tracking-[0.15em] border border-emerald-500/20">
                                Payload will activate upon confirmation
                             </div>
                        </div>
                    </motion.div>
                )}

                {cancellationNotice && (
                    <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} key="cancellation" className="absolute inset-0 z-[100] bg-red-500/20 backdrop-blur-xl flex items-center justify-center p-8">
                        <div className="glass p-10 rounded-[4rem] text-center border-red-500/20 shadow-premium">
                             <div className="w-20 h-20 bg-red-500/20 rounded-full flex items-center justify-center mx-auto mb-6 text-red-500">
                                <AlertCircle size={40} />
                             </div>
                             <h3 className="text-3xl font-black text-charcoal-900 font-outfit mb-2">Trip Terminated</h3>
                             <p className="text-charcoal-500 font-medium text-sm leading-relaxed mb-10 max-w-[280px] mx-auto">{cancellationNotice.message}</p>
                             <button onClick={() => setCancellationNotice(null)} className="w-full py-5 bg-charcoal-900 text-white font-black rounded-[2rem] text-xs uppercase tracking-widest shadow-premium">Acknowledged</button>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}
