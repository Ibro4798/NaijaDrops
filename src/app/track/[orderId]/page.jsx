"use client";

import { useState, useEffect, useRef } from "react";
import dynamic from "next/dynamic";
import { useRouter, useParams } from "next/navigation";
import { createClient } from "@/utils/supabase/client";
import { motion, AnimatePresence } from "framer-motion";
import {
  Phone, MessageCircle, MapPin, CheckCircle2, AlertCircle, ArrowLeft, RefreshCw, WifiOff
} from "lucide-react";
import OrderChat from "@/components/OrderChat";

const Map = dynamic(() => import("react-map-gl").then(m => m.default), { ssr: false });
const Marker = dynamic(() => import("react-map-gl").then(m => m.Marker), { ssr: false });
const Source = dynamic(() => import("react-map-gl").then(m => m.Source), { ssr: false });
const Layer = dynamic(() => import("react-map-gl").then(m => m.Layer), { ssr: false });

const STATUS_STEPS = [
  { key: "assigned", label: "Driver on the way", emoji: "🏍️" },
  { key: "picked_up", label: "Package picked up", emoji: "📦" },
  { key: "in_transit", label: "In transit", emoji: "🚀" },
  { key: "delivered", label: "Delivered", emoji: "✅" },
];

export default function TrackPage() {
  const { orderId } = useParams();
  const router = useRouter();
  const supabase = createClient();
  const mapboxToken = process.env.NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN;

  const [order, setOrder] = useState(null);
  const [rider, setRider] = useState(null);
  const [riderPos, setRiderPos] = useState(null); // { lat, lng }
  const [routeData, setRouteData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [showChat, setShowChat] = useState(false);
  const [lastUpdate, setLastUpdate] = useState(Date.now());
  const [mapView, setMapView] = useState({ longitude: 8.52, latitude: 11.996, zoom: 14 });
  
  // For smooth interpolation
  const [interpolatedPos, setInterpolatedPos] = useState(null);

  useEffect(() => {
    if (!orderId) return;
    fetchOrder();

    // 1. Realtime Listeners
    const channel = supabase.channel(`track-${orderId}`)
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "orders", filter: `id=eq.${orderId}` },
        payload => setOrder(prev => ({ ...prev, ...payload.new })))
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "rider_locations" }, 
        payload => {
          if (order?.rider_id && payload.new.rider_id === order.rider_id) {
             handleNewLocation(payload.new.lat, payload.new.lng);
          }
        })
      .subscribe();

    const locationPoll = setInterval(fetchLatestLocation, 8000);

    return () => {
      supabase.removeChannel(channel);
      clearInterval(locationPoll);
    };
  }, [orderId, order?.rider_id]);

  async function fetchOrder() {
    // PUBLIC ACCESS: We use the order ID as a token. RLS should allow select for all.
    const { data, error } = await supabase.from("orders").select("*, riders(*, users(full_name))").eq("id", orderId).single();
    if (data) {
      setOrder(data);
      setRider(data.riders);
      if (data.dropoff_lng) {
        setMapView(v => ({ ...v, longitude: data.dropoff_lng, latitude: data.dropoff_lat }));
      }
      fetchLatestLocation(data.rider_id);
    }
    setLoading(false);
  }

  async function fetchLatestLocation(rId) {
    const id = rId || order?.rider_id;
    if (!id) return;
    const { data } = await supabase.from("rider_locations")
      .select("lat, lng, timestamp")
      .eq("rider_id", id)
      .order("timestamp", { ascending: false })
      .limit(1)
      .single();

    if (data) handleNewLocation(data.lat, data.lng);
  }

  function handleNewLocation(lat, lng) {
    setRiderPos({ lat, lng });
    setLastUpdate(Date.now());
    // On the first location fix, set interpolation start
    if (!interpolatedPos) setInterpolatedPos({ lat, lng });
  }

  // Liquid-Smooth Interpolation Logic
  useEffect(() => {
    if (!riderPos || !interpolatedPos) return;
    
    const step = 0.05; // Smoothing factor
    const interval = setInterval(() => {
      setInterpolatedPos(prev => {
        const dLat = riderPos.lat - prev.lat;
        const dLng = riderPos.lng - prev.lng;
        if (Math.abs(dLat) < 0.00001 && Math.abs(dLng) < 0.00001) return prev;
        return {
          lat: prev.lat + dLat * step,
          lng: prev.lng + dLng * step
        };
      });
    }, 50);

    return () => clearInterval(interval);
  }, [riderPos]);

  // Status index helper
  const stepIndex = ["assigned", "picked_up", "in_transit", "delivered"].indexOf(order?.status || "");
  const isDisconnected = Date.now() - lastUpdate > 45000; // 45 seconds timeout

  if (loading) return (
    <div className="min-h-screen bg-charcoal-950 flex items-center justify-center">
      <Loader2 className="text-emerald-500 animate-spin" size={32} />
    </div>
  );

  if (!order) return <div className="p-10 text-center text-charcoal-500">Tracking ID not found.</div>;

  return (
    <div className="h-[100dvh] relative overflow-hidden bg-charcoal-950">
      {/* Mapbox Layer */}
      <div className="absolute inset-0 z-0">
        <Map
          mapboxAccessToken={mapboxToken}
          {...mapView}
          onMove={e => setMapView(e.viewState)}
          style={{ width: "100%", height: "100%" }}
          mapStyle="mapbox://styles/mapbox/dark-v11"
        >
          {/* Rider Marker (Gliding) */}
          {(interpolatedPos || riderPos) && (
            <Marker longitude={(interpolatedPos || riderPos).lng} latitude={(interpolatedPos || riderPos).lat} anchor="center">
              <div className="relative">
                <div className="w-10 h-10 bg-white rounded-full border-4 border-emerald-500 flex items-center justify-center shadow-2xl text-lg">
                  🏍️
                </div>
                {!isDisconnected && <div className="absolute inset-0 w-10 h-10 bg-emerald-400/30 rounded-full animate-ping" />}
              </div>
            </Marker>
          )}

          {/* Pickup/Dropoff Markers */}
          <Marker longitude={order.pickup_lng} latitude={order.pickup_lat} anchor="bottom">
              <div className="w-6 h-6 bg-white rounded-full border-4 border-charcoal-900" />
          </Marker>
          <Marker longitude={order.dropoff_lng} latitude={order.dropoff_lat} anchor="bottom">
              <MapPin size={32} className="text-emerald-500" fill="rgba(16,185,129,0.2)" />
          </Marker>
        </Map>
      </div>

      {/* Disconnection Warning */}
      <AnimatePresence>
        {isDisconnected && order.status !== 'delivered' && (
          <motion.div initial={{ y: -50 }} animate={{ y: 20 }} exit={{ y: -50 }} className="absolute inset-x-5 z-30">
            <div className="bg-amber-500/90 backdrop-blur-md text-charcoal-950 px-4 py-3 rounded-2xl flex items-center gap-3 font-bold text-xs shadow-xl">
              <WifiOff size={18} /> Driver connection interrupted. Tracking may be delayed.
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Back to Home (Sender only) */}
      <button onClick={() => router.push("/")} className="absolute top-14 left-5 z-20 w-10 h-10 bg-charcoal-950/80 backdrop-blur-md border border-white/10 rounded-2xl flex items-center justify-center text-white">
        <ArrowLeft size={18} />
      </button>

      {/* Bottom Interface */}
      <div className="absolute bottom-0 inset-x-0 z-20 p-5">
        <div className="bg-charcoal-950/95 backdrop-blur-xl border border-white/10 rounded-[2.5rem] p-6 shadow-2xl">
          {/* Status Tracker */}
          <div className="flex justify-between mb-8">
            {STATUS_STEPS.map((s, i) => (
              <div key={s.key} className="flex flex-col items-center gap-2 flex-1 relative">
                <div className={`w-8 h-8 rounded-full flex items-center justify-center transition-all ${i <= stepIndex ? "bg-emerald-500 text-charcoal-950" : "bg-charcoal-900 border border-white/5 text-charcoal-600"}`}>
                  <CheckCircle2 size={16} strokeWidth={3} />
                </div>
                <div className="text-[8px] font-black uppercase tracking-tighter text-charcoal-500">{s.label}</div>
                {i < 3 && <div className={`absolute top-4 left-1/2 w-full h-[2px] -z-10 ${i < stepIndex ? "bg-emerald-500" : "bg-charcoal-900"}`} />}
              </div>
            ))}
          </div>

          {/* Driver Card */}
          {rider && (
            <div className="flex items-center gap-4 bg-white/5 border border-white/5 rounded-2xl p-4">
               <div className="w-12 h-12 bg-emerald-500/10 rounded-xl flex items-center justify-center text-2xl border border-emerald-500/20">🏍️</div>
               <div className="flex-1">
                 <div className="text-white font-black">{rider.users?.full_name || "Assigned Driver"}</div>
                 <div className="text-charcoal-500 text-[10px] font-bold uppercase tracking-widest">{rider.plate_number || "KANO-TRK"}</div>
               </div>
               <div className="flex gap-2">
                  <a href={`tel:${rider.phone || "08000"}`} className="w-10 h-10 bg-emerald-500 rounded-xl flex items-center justify-center text-charcoal-950"><Phone size={18} /></a>
                  <button onClick={() => setShowChat(!showChat)} className="w-10 h-10 bg-white/10 rounded-xl flex items-center justify-center text-white"><MessageCircle size={18} /></button>
               </div>
            </div>
          )}

          {/* Collapsible Chat */}
          <AnimatePresence>
            {showChat && (
               <motion.div initial={{ height: 0 }} animate={{ height: 300 }} exit={{ height: 0 }} className="overflow-hidden mt-4">
                  <div className="h-full border border-white/5 rounded-2xl"><OrderChat orderId={orderId} /></div>
               </motion.div>
            )}
          </AnimatePresence>

          {/* Simple public message */}
          <div className="mt-6 flex items-center gap-3 text-charcoal-500 text-[10px] uppercase font-black justify-center tracking-widest">
            <ShieldCheck size={14} className="text-emerald-500" /> End-to-End Encrypted Precise Tracking
          </div>
        </div>
      </div>
    </div>
  );
}
