"use client";

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/utils/supabase/client';
import { getUserRole } from '@/utils/auth';
import { Zap, MapPin, Navigation, Crosshair, Map as MapIcon, Info, Search } from 'lucide-react';
import dynamic from 'next/dynamic';
import { motion, AnimatePresence } from 'framer-motion';

const TrackingMap = dynamic(() => import('@/components/TrackingMap'), { 
  ssr: false,
  loading: () => <div className="h-full w-full bg-charcoal-900 animate-pulse flex items-center justify-center text-charcoal-500 font-bold uppercase tracking-widest">Scanning Grid...</div>
});

export default function DriverMapPage() {
    const router = useRouter();
    const supabase = createClient();
    const [user, setUser] = useState(null);
    const [currentLocation, setCurrentLocation] = useState(null);
    const [isChecking, setIsChecking] = useState(true);
    const [demandData, setDemandData] = useState([]);

    useEffect(() => {
        async function init() {
            const { user: u, role } = await getUserRole(supabase);
            if (u && role === 'driver') {
                setUser(u);
                
                // Fetch demand data (active orders looking for drivers)
                const { data } = await supabase
                    .from('orders')
                    .select('pickup_lat, pickup_lng, id')
                    .eq('status', 'looking_for_driver');
                if (data) setDemandData(data.map(o => ({ lat: o.pickup_lat, lng: o.pickup_lng, id: o.id })));

                // Get current location
                if (navigator.geolocation) {
                    navigator.geolocation.getCurrentPosition(
                        (pos) => setCurrentLocation({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
                        (err) => console.warn(err)
                    );
                }
            } else {
                router.push('/login');
            }
            setIsChecking(false);
        }
        init();
    }, [supabase, router]);

    if (isChecking) return null;

    return (
        <div className="flex-1 relative bg-charcoal-950 overflow-hidden">
            {/* Full Screen Map */}
            <div className="absolute inset-0 z-0">
                <TrackingMap 
                    driverLocation={currentLocation} 
                    demandData={demandData}
                />
            </div>

            {/* Overlays */}
            <div className="absolute inset-0 pointer-events-none bg-gradient-to-b from-charcoal-950/40 via-transparent to-charcoal-950/20"></div>

            {/* Header Strip */}
            <div className="absolute top-6 left-6 right-6 z-10 flex items-center justify-between pointer-events-auto">
                <div className="glass px-6 py-4 rounded-[2rem] border-white/10 shadow-premium flex items-center gap-4">
                    <div className="w-10 h-10 bg-emerald-500 rounded-2xl flex items-center justify-center text-charcoal-950 shadow-glow">
                        <MapIcon size={20} />
                    </div>
                    <div>
                        <h1 className="text-white font-black text-xs uppercase tracking-widest font-outfit">Local Metadata</h1>
                        <p className="text-emerald-500 text-[10px] font-black uppercase tracking-[0.2em]">{demandData.length} active demand signals</p>
                    </div>
                </div>

                <button className="w-14 h-14 glass flex items-center justify-center text-white rounded-[1.8rem] shadow-premium border border-white/5 active:scale-95 transition-all">
                    <Search size={22} />
                </button>
            </div>

            {/* Floating Controls */}
            <div className="absolute top-1/2 right-6 -translate-y-1/2 z-10 flex flex-col gap-3 pointer-events-auto">
                <button className="w-14 h-14 glass-dark text-white rounded-[1.8rem] flex items-center justify-center shadow-premium border border-white/5 bg-charcoal-900/90 active:scale-90 transition-all">
                    <Navigation size={22} />
                </button>
                <button 
                    onClick={() => {
                        if (navigator.geolocation) {
                            navigator.geolocation.getCurrentPosition(
                                (pos) => setCurrentLocation({ lat: pos.coords.latitude, lng: pos.coords.longitude })
                            );
                        }
                    }}
                    className="w-14 h-14 glass-dark text-emerald-500 rounded-[1.8rem] flex items-center justify-center shadow-premium border border-white/5 bg-charcoal-900/90 active:scale-90 transition-all"
                >
                    <Crosshair size={22} />
                </button>
            </div>

            {/* Interaction Legend */}
            <div className="absolute bottom-28 left-6 right-6 z-10 pointer-events-auto flex justify-center">
                <div className="glass-dark bg-charcoal-900/40 backdrop-blur-3xl px-8 py-5 rounded-[2.5rem] border border-white/10 shadow-premium flex items-center gap-8">
                    <div className="flex items-center gap-3">
                        <div className="w-3 h-3 bg-emerald-500 rounded-full shadow-glow"></div>
                        <span className="text-[10px] font-black text-white uppercase tracking-widest italic">Live Demand</span>
                    </div>
                    <div className="w-px h-4 bg-white/10"></div>
                    <div className="flex items-center gap-3">
                        <div className="w-3 h-3 bg-white/20 rounded-full border border-white/40"></div>
                        <span className="text-[10px] font-black text-charcoal-400 uppercase tracking-widest italic">Hub Nodes</span>
                    </div>
                </div>
            </div>
        </div>
    );
}
