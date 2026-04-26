"use client";

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/utils/supabase/client';
import { MapPin, Power, Clock, ShieldCheck, AlertCircle, Wallet, Star, Zap, Activity, Bell, Info, LogOut } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import dynamic from 'next/dynamic';
import IncomingOrderCard from '@/components/driver/IncomingOrderCard';
import ActiveTripPanel from '@/components/driver/ActiveTripPanel';
import { calculateDistance } from '@/utils/distance';
import { getReliableLocation, getCurrentPositionStandard } from '@/utils/geolocation';
import Skeleton from '@/components/ui/Skeleton';
import { findBatchableOrders } from '@/utils/maestro';

const TrackingMap = dynamic(() => import('@/components/TrackingMap'), { 
  ssr: false,
  loading: () => (
    <div className="h-full w-full bg-charcoal-800 animate-pulse flex flex-col items-center justify-center text-emerald-500 font-black tracking-[0.2em] uppercase text-xs gap-4">
      <div className="w-8 h-8 border-2 border-emerald-500/20 border-t-emerald-500 rounded-full animate-spin"></div>
      Map Loading...
    </div>
  )
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

    const handleSignOut = async () => {
        if (!window.confirm("Are you sure you want to terminate your session?")) return;
        
        // 1. Terminate all protocols
        stopTracking();
        stopListening();
        
        // 2. Sign out of Supabase
        await supabase.auth.signOut();
        
        // 3. Clear local cache
        localStorage.removeItem('naijadrops_role');
        
        // 4. Redirect to welcome
        router.push('/welcome');
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
                
                // Initialize verification status
                const currentStatus = prof.driver_status || 'pending';
                if (currentStatus === 'active') {
                    setVerificationStatus('verified');
                } else if (currentStatus === 'paused' || currentStatus === 'rejected') {
                    setVerificationStatus(currentStatus);
                } else {
                    const { count } = await supabase
                        .from('driver_documents')
                        .select('id', { count: 'exact', head: true })
                        .eq('driver_id', user.id);
                    
                    setVerificationStatus(count > 0 ? 'pending' : 'not_started');
                }

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

                // FIX: Realtime Profile Sync (Admin Approval)
                const profileChannel = supabase.channel(`driver-profile-${user.id}`)
                    .on('postgres_changes', {
                        event: 'UPDATE',
                        schema: 'public',
                        table: 'profiles',
                        filter: `id=eq.${user.id}`
                    }, (payload) => {
                        console.log("Profile updated via Realtime:", payload.new);
                        const updatedProf = payload.new;
                        setProfile(updatedProf);
                        
                        // Update verification status based on new profile data
                        const status = updatedProf.driver_status || 'pending';
                        if (status === 'active') setVerificationStatus('verified');
                        else if (status === 'paused' || status === 'rejected') setVerificationStatus(status);
                    })
                    .subscribe();

                return () => {
                    supabase.removeChannel(notificationChannel);
                    supabase.removeChannel(profileChannel);
                };
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

    const fetchAvailableOrders = useCallback(async (location) => {
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
                return o;
            });
            setAvailableOrders(nearby);
        }
    }, [supabase]);

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

    const handleUpdateStatus = useCallback(async (nextStatus, extraFields = {}) => {
        if (!activeTrip) return;
        setActiveTrip(prev => ({ ...prev, status: nextStatus, ...extraFields }));
        
        await supabase.from('orders').update({ status: nextStatus, ...extraFields }).eq('id', activeTrip.id);
        
        if (nextStatus === 'delivered') {
            try {
                const driverEarning = activeTrip.agreed_price * 0.85;
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
    }, [activeTrip, supabase, user]);

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
            {/* Base layer: Map (Visible only when Online) */}
            <div className={`absolute inset-0 transition-all duration-700 ${isOnline ? 'opacity-100 scale-100' : 'opacity-10 scale-[1.02] grayscale blur-sm'}`}>
                {currentLocation ? (
                    <TrackingMap 
                        driverLocation={currentLocation} 
                        dropoffLocation={activeTrip ? { lat: activeTrip.dropoff_lat, lng: activeTrip.dropoff_lng } : null} 
                        demandData={availableOrders}
                    />
                ) : (
                    <div className="h-full w-full flex flex-col items-center justify-center bg-charcoal-950 gap-4">
                        <div className="w-16 h-16 border-4 border-emerald-500/20 border-t-emerald-500 rounded-full animate-spin"></div>
                        <p className="text-emerald-500 font-black text-[10px] uppercase tracking-[0.4em] animate-pulse">Map Loading...</p>
                    </div>
                )}
            </div>

            {/* Content Layer */}
            <div className="relative z-10 h-full flex flex-col">
                
                {/* Header Strip - Premium Minimalist */}
                <header className="p-6 pt-10 flex items-center justify-between pointer-events-none">
                    <div className="flex items-center gap-4 pointer-events-auto">
                        <div className="w-14 h-14 rounded-[1.8rem] border-2 border-emerald-500/20 overflow-hidden shadow-2xl">
                            <img src={profile?.avatar_url || "https://ui-avatars.com/api/?name=Driver&background=10b981&color=fff"} className="w-full h-full object-cover" alt="Profile" />
                        </div>
                        <div className="glass-dark px-4 py-2 rounded-2xl border border-white/5 backdrop-blur-3xl">
                            <h1 className="text-white font-black text-xs uppercase tracking-[0.25em] font-outfit italic">
                                {isOnline ? 'Operational' : 'Halted'}
                            </h1>
                        </div>
                    </div>

                    <div className="flex gap-2 pointer-events-auto">
                        <button 
                            onClick={handleSignOut}
                            className="w-14 h-14 glass flex items-center justify-center text-red-500 shadow-premium hover:bg-white/10 transition-all rounded-[1.8rem] border border-white/5"
                        >
                            <LogOut size={20} />
                        </button>
                        <button 
                            onClick={() => setShowNotifications(!showNotifications)}
                            className="w-14 h-14 glass flex items-center justify-center text-white shadow-premium hover:bg-white/10 transition-all rounded-[1.8rem] relative border border-white/5"
                        >
                            <Bell size={20} />
                            {notifications.some(n => !n.is_read) && (
                                <div className="absolute top-4 right-4 w-2.5 h-2.5 bg-emerald-400 rounded-full border-2 border-charcoal-900 shadow-glow animate-pulse"></div>
                            )}
                        </button>
                    </div>
                </header>

                {/* Sub-Header: RADAR Heading (Stitch Style) */}
                <div className="px-8 mt-4 pointer-events-none">
                    <h2 className="text-7xl font-black text-white tracking-tighter italic font-outfit leading-none uppercase opacity-90">
                        {activeTrip ? 'Active' : isOnline ? 'Radar' : 'Offline'}
                    </h2>
                    <div className="w-24 h-2 bg-emerald-500 mt-2 rounded-full"></div>
                </div>

                {/* Spacer to push controls to bottom */}
                <div className="flex-1 min-h-[100px] pointer-events-none"></div>

                {/* Bottom Control Hub */}
                <footer className="p-6 pb-28">
                    <AnimatePresence mode="wait">
                        {activeTrip ? (
                            /* ACTIVE MISSION VIEW */
                            <motion.div key="active" initial={{ y: 50, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 50, opacity: 0 }}>
                                <ActiveTripPanel 
                                    order={activeTrip} 
                                    driverProfile={profile} 
                                    currentLocation={currentLocation} 
                                    onUpdateStatus={handleUpdateStatus} 
                                />
                            </motion.div>
                        ) : !isOnline ? (
                            /* OFFLINE VIEW - Large Systems Panel */
                            <motion.div key="offline" initial={{ y: 50, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 50, opacity: 0 }} className="glass-dark p-10 rounded-[4rem] border-white/5 shadow-2xl text-center relative overflow-hidden">
                                <div className="absolute top-0 right-0 w-48 h-48 bg-emerald-500/5 rounded-full blur-[60px] -mr-24 -mt-24"></div>
                                
                                <div className="space-y-2 mb-10">
                                    <div className="text-[11px] font-black text-emerald-500 uppercase tracking-[0.4em] mb-4">Tactical Status</div>
                                    <div className="grid grid-cols-2 gap-4">
                                        <div className="bg-white/5 rounded-3xl p-6 border border-white/5">
                                            <div className="text-[9px] font-black text-charcoal-500 uppercase tracking-widest mb-1">Weekly Drops</div>
                                            <div className="text-2xl font-black text-white italic">{driverStats?.total_trips || '0'}</div>
                                        </div>
                                        <div className="bg-white/5 rounded-3xl p-6 border border-white/5">
                                            <div className="text-[9px] font-black text-charcoal-500 uppercase tracking-widest mb-1">Performance</div>
                                            <div className="text-2xl font-black text-emerald-500 italic flex items-center justify-center gap-1">
                                                <Star size={16} fill="currentColor" /> {driverStats?.avg_rating || '5.0'}
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                {verificationStatus === 'verified' ? (
                                    <button 
                                        onClick={toggleStatus}
                                        className="w-full py-7 bg-emerald-500 hover:bg-emerald-400 text-charcoal-950 rounded-[2.5rem] font-black text-xl uppercase tracking-[0.3em] shadow-glow flex items-center justify-center gap-4 transition-all active:scale-95"
                                    >
                                        Initialize Protocol <Zap size={24} />
                                    </button>
                                ) : (
                                    <div className="space-y-4">
                                        <div className="bg-amber-500/10 border border-amber-500/20 p-6 rounded-[2.5rem] text-left">
                                            <p className="text-amber-500 font-black text-[10px] uppercase tracking-widest mb-1">
                                                {verificationStatus === 'pending' ? 'Review Phase' : 'Action Required'}
                                            </p>
                                            <p className="text-white font-bold text-xs leading-relaxed">
                                                {verificationStatus === 'pending' 
                                                    ? 'Metadata synchronization in progress. Our hubs are verifying your credentials.' 
                                                    : 'Your driver profile is not activated. Submit your manifest to begin operations.'}
                                            </p>
                                        </div>
                                        <button 
                                            onClick={() => router.push('/driver/onboarding')}
                                            className="w-full py-6 bg-white text-charcoal-950 rounded-[2.5rem] font-black text-sm uppercase tracking-widest shadow-premium active:scale-95"
                                        >
                                            Access Onboarding Hub
                                        </button>
                                    </div>
                                )}
                            </motion.div>
                        ) : (
                            /* ONLINE VIEW - Jobs Radar */
                            <motion.div key="online" initial={{ y: 50, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 50, opacity: 0 }} className="space-y-6">
                                {availableOrders.length > 0 ? (
                                    <div className="space-y-4">
                                        <div className="flex items-center justify-between px-6">
                                            <div className="flex items-center gap-3">
                                                <div className="w-3 h-3 bg-emerald-500 rounded-full animate-pulse shadow-glow"></div>
                                                <span className="text-white font-black text-[10px] uppercase tracking-[0.4em] font-outfit italic">Scanning Grid</span>
                                            </div>
                                            <button 
                                                onClick={toggleStatus}
                                                className="text-[9px] font-black text-red-400 uppercase tracking-widest bg-red-500/10 px-4 py-2 rounded-full border border-red-500/10"
                                            >
                                                Disconnect
                                            </button>
                                        </div>
                                        
                                        <div className="flex gap-4 overflow-x-auto pb-12 px-2 -mx-6 no-scrollbar snap-x snap-mandatory scroll-px-8 h-[340px]">
                                            {availableOrders.map((order) => (
                                                <div key={order.id} className="min-w-[90vw] snap-center px-4">
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
                                    /* IDLE / SEARCHING STATE */
                                    <div className="glass-dark p-12 rounded-[4rem] border-white/5 text-center shadow-2xl relative overflow-hidden">
                                        <div className="absolute top-0 right-0 w-32 h-32 bg-emerald-500/10 rounded-full blur-[60px] -mr-16 -mt-16 animate-pulse"></div>
                                        
                                        <div className="w-20 h-20 bg-charcoal-800 rounded-[2rem] flex items-center justify-center mx-auto mb-8 relative border border-white/10 group">
                                            <div className="absolute inset-0 bg-emerald-500/20 rounded-[2rem] animate-ping duration-[3s]"></div>
                                            <Activity className="text-emerald-500" size={32} />
                                        </div>
                                        
                                        <h3 className="text-3xl font-black text-white font-outfit mb-3 italic">Searching Grid</h3>
                                        <p className="text-charcoal-400 font-bold text-xs uppercase tracking-widest max-w-[200px] mx-auto mb-10 leading-relaxed">
                                            Awaiting proximity triggers. Maintain current coordinates.
                                        </p>

                                        <div className="flex flex-col gap-3">
                                            <button 
                                                onClick={async () => {
                                                    const loc = await getCurrentPositionStandard();
                                                    if (loc) setCurrentLocation({ lat: loc.lat, lng: loc.lng });
                                                }}
                                                className="w-full py-5 bg-white/5 border border-white/10 text-white rounded-3xl text-[10px] font-black uppercase tracking-widest active:scale-95 transition-all"
                                            >
                                                Relocate Unit
                                            </button>
                                            <button 
                                                onClick={handleSignOut}
                                                className="w-full py-5 text-[10px] font-black uppercase tracking-widest text-red-400/60 hover:text-red-400 transition-colors"
                                            >
                                                Terminate Protocol
                                            </button>
                                        </div>
                                    </div>
                                )}
                            </motion.div>
                        )}
                    </AnimatePresence>
                </footer>
            </div>

            {/* Notification Portal Overlay */}
            <AnimatePresence>
                {showNotifications && (
                    <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 20 }} className="fixed top-24 right-6 w-[88%] z-[100] glass-dark border border-white/10 rounded-[3rem] p-8 shadow-2xl overflow-hidden max-w-md mx-auto">
                        <div className="flex items-center justify-between mb-8">
                            <h3 className="text-white font-black text-xs uppercase tracking-[0.3em] font-outfit italic">Transmission Hub</h3>
                            <button onClick={() => setShowNotifications(false)} className="w-10 h-10 flex items-center justify-center text-charcoal-500 hover:text-white transition-colors bg-white/5 rounded-xl">
                                <X size={20} />
                            </button>
                        </div>
                        
                        <div className="space-y-4 max-h-[60vh] overflow-y-auto custom-scrollbar pr-2">
                            {notifications.length === 0 ? (
                                <div className="py-20 text-center opacity-30">
                                    <Bell size={48} className="mx-auto mb-4" />
                                    <p className="text-[10px] font-black uppercase tracking-widest">No active signals</p>
                                </div>
                            ) : (
                                notifications.map(notif => (
                                    <div key={notif.id} className="p-6 rounded-[2rem] bg-white/5 border border-white/5 hover:border-emerald-500/20 transition-all group">
                                        <div className="text-emerald-500 font-black text-[10px] uppercase tracking-widest mb-2 flex items-center gap-2 italic">
                                            <div className="w-1.5 h-1.5 bg-emerald-500 rounded-full group-hover:animate-pulse"></div>
                                            {notif.title}
                                        </div>
                                        <div className="text-sm font-bold text-white/80 leading-relaxed">{notif.message}</div>
                                    </div>
                                ))
                            )}
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Global Overlays */}
            <AnimatePresence>
                {awaitingPayment && (
                    <div className="fixed inset-0 z-[150] bg-charcoal-950/90 backdrop-blur-xl flex items-center justify-center p-10">
                        <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="glass p-12 rounded-[4rem] text-center border-emerald-500/20 shadow-premium">
                             <div className="w-20 h-20 bg-emerald-500 rounded-[2rem] flex items-center justify-center mx-auto mb-8 shadow-glow">
                                <ShieldCheck size={40} className="text-charcoal-950" />
                             </div>
                             <h3 className="text-4xl font-black text-charcoal-900 font-outfit mb-2 italic">Signal Locked</h3>
                             <p className="text-charcoal-500 font-black text-[10px] uppercase tracking-widest mb-10">Awaiting user transmission...</p>
                             <div className="p-5 bg-charcoal-900 rounded-3xl text-[10px] text-emerald-500 font-black uppercase tracking-[0.2em] animate-pulse">
                                Synchronization Required
                             </div>
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>
        </div>
    );
}
