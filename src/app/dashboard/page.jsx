"use client";

import { useState, useEffect, useRef } from "react";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { createClient } from "@/utils/supabase/client";
import { motion, AnimatePresence } from "framer-motion";
import { Package, MapPin, Clock, ChevronRight, Truck, CheckCircle2, AlertCircle, Loader2 } from "lucide-react";

const Map = dynamic(() => import("react-map-gl").then(m => m.default), { ssr: false });
const Marker = dynamic(() => import("react-map-gl").then(m => m.Marker), { ssr: false });

// Kano city center
const KANO_CENTER = { lat: 11.9964, lng: 8.5200 };

const STATUS_CONFIG = {
  pending: { label: "Finding Driver", color: "text-amber-400", bg: "bg-amber-400/10 border-amber-400/20", icon: <Loader2 size={14} className="animate-spin" /> },
  assigned: { label: "Driver Assigned", color: "text-blue-400", bg: "bg-blue-400/10 border-blue-400/20", icon: <Truck size={14} /> },
  picked_up: { label: "Picked Up", color: "text-emerald-400", bg: "bg-emerald-400/10 border-emerald-400/20", icon: <Package size={14} /> },
  in_transit: { label: "In Transit", color: "text-emerald-400", bg: "bg-emerald-400/10 border-emerald-400/20", icon: <MapPin size={14} /> },
  delivered: { label: "Delivered", color: "text-emerald-400", bg: "bg-emerald-400/10 border-emerald-400/20", icon: <CheckCircle2 size={14} /> },
  cancelled: { label: "Cancelled", color: "text-red-400", bg: "bg-red-400/10 border-red-400/20", icon: <AlertCircle size={14} /> },
};

export default function DashboardPage() {
  const router = useRouter();
  const supabase = createClient();
  const mapboxToken = process.env.NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN;

  const [user, setUser] = useState(null);
  const [activeOrderCount, setActiveOrderCount] = useState(0);
  const [latestOrder, setLatestOrder] = useState(null);
  const [userLocation, setUserLocation] = useState(KANO_CENTER);
  const [mapLoaded, setMapLoaded] = useState(false);
  const [greeting, setGreeting] = useState("Good day");
  const [displayName, setDisplayName] = useState("");

  useEffect(() => {
    const h = new Date().getHours();
    if (h < 12) setGreeting("Good morning");
    else if (h < 17) setGreeting("Good afternoon");
    else setGreeting("Good evening");
  }, []);

  useEffect(() => {
    async function load() {
      const { data: { user: u } } = await supabase.auth.getUser();
      if (!u) return;
      setUser(u);

      const { data: profile } = await supabase.from("users").select("full_name").eq("id", u.id).single();
      if (profile?.full_name) {
        setDisplayName(profile.full_name.split(" ")[0]);
      }

      const { data: orders } = await supabase
        .from("orders")
        .select("id, status, pickup_name, dropoff_name, agreed_price, created_at")
        .eq("vendor_id", u.id)
        .order("created_at", { ascending: false })
        .limit(5);

      if (orders) {
        const active = orders.filter(o => ["pending", "assigned", "picked_up", "in_transit"].includes(o.status));
        setActiveOrderCount(active.length);
        setLatestOrder(orders[0] || null);
      }
    }
    load();

    // Request user location
    if (typeof navigator !== "undefined" && navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        pos => setUserLocation({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
        () => {} // Fallback to Kano center silently
      );
    }
  }, []);

  return (
    <div className="h-[100dvh] w-full relative overflow-hidden bg-charcoal-950">
      {/* Full-screen Mapbox Map */}
      <div className="absolute inset-0 z-0">
        {mapboxToken ? (
          <Map
            mapboxAccessToken={mapboxToken}
            initialViewState={{ longitude: userLocation.lng, latitude: userLocation.lat, zoom: 13 }}
            style={{ width: "100%", height: "100%" }}
            mapStyle="mapbox://styles/mapbox/dark-v11"
            onLoad={() => setMapLoaded(true)}
          >
            {/* User location pin */}
            <Marker longitude={userLocation.lng} latitude={userLocation.lat} anchor="center">
              <div className="relative">
                <div className="w-5 h-5 bg-emerald-500 rounded-full border-4 border-white shadow-[0_0_16px_rgba(16,185,129,0.8)]" />
                <div className="absolute inset-0 w-5 h-5 bg-emerald-400 rounded-full animate-ping opacity-40" />
              </div>
            </Marker>
          </Map>
        ) : (
          <div className="w-full h-full bg-charcoal-900 flex items-center justify-center">
            <div className="text-charcoal-600 text-sm font-medium">Map loading…</div>
          </div>
        )}
      </div>

      {/* Top gradient overlay */}
      <div className="absolute inset-x-0 top-0 h-32 bg-gradient-to-b from-charcoal-950/80 to-transparent z-10 pointer-events-none" />

      {/* Top Bar */}
      <div className="absolute top-0 inset-x-0 z-20 px-6 pt-14 pb-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-charcoal-400 text-xs font-medium">{greeting}{displayName ? "," : ""}</p>
            <h1 className="text-white font-black text-2xl tracking-tight font-outfit">
              {displayName || "Dashboard"} <span className="text-emerald-500">👋</span>
            </h1>
          </div>
          {activeOrderCount > 0 && (
            <div className="bg-emerald-500/20 border border-emerald-500/40 px-3 py-1.5 rounded-full flex items-center gap-1.5">
              <div className="w-2 h-2 bg-emerald-400 rounded-full animate-pulse" />
              <span className="text-emerald-400 text-xs font-black uppercase tracking-widest">{activeOrderCount} Active</span>
            </div>
          )}
        </div>
      </div>

      {/* Bottom Sheet */}
      <div className="absolute bottom-0 inset-x-0 z-20">
        {/* Sheet blur/gradient */}
        <div className="absolute inset-x-0 bottom-0 h-[340px] bg-gradient-to-t from-charcoal-950 via-charcoal-950/95 to-transparent pointer-events-none" />

        <div className="relative px-5 pb-8 pt-6 space-y-4">
          {/* Latest order status chip */}
          <AnimatePresence>
            {latestOrder && (
              <motion.button
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                onClick={() => router.push(`/track/${latestOrder.id}`)}
                className={`w-full flex items-center justify-between px-5 py-4 rounded-2xl border backdrop-blur-sm ${STATUS_CONFIG[latestOrder.status]?.bg || "bg-white/5 border-white/10"} transition-all active:scale-[0.98]`}
              >
                <div className="flex items-center gap-3">
                  <span className={STATUS_CONFIG[latestOrder.status]?.color || "text-charcoal-400"}>
                    {STATUS_CONFIG[latestOrder.status]?.icon}
                  </span>
                  <div className="text-left">
                    <div className={`text-xs font-black uppercase tracking-widest ${STATUS_CONFIG[latestOrder.status]?.color || "text-charcoal-400"}`}>
                      {STATUS_CONFIG[latestOrder.status]?.label || latestOrder.status}
                    </div>
                    <div className="text-white text-sm font-bold truncate max-w-[220px]">
                      → {latestOrder.dropoff_name?.split(",")[0]}
                    </div>
                  </div>
                </div>
                <ChevronRight className="text-charcoal-500 shrink-0" size={18} />
              </motion.button>
            )}
          </AnimatePresence>

          {/* Quick stats row */}
          {activeOrderCount > 0 && (
            <div className="grid grid-cols-2 gap-3">
              <div className="bg-white/[0.04] border border-white/[0.07] rounded-2xl px-4 py-3">
                <div className="text-[10px] font-black text-charcoal-500 uppercase tracking-widest mb-0.5">Active</div>
                <div className="text-white font-black text-xl">{activeOrderCount}</div>
              </div>
              <div className="bg-white/[0.04] border border-white/[0.07] rounded-2xl px-4 py-3">
                <div className="text-[10px] font-black text-charcoal-500 uppercase tracking-widest mb-0.5">Est. ETA</div>
                <div className="text-emerald-400 font-black text-xl">~30m</div>
              </div>
            </div>
          )}

          {/* PRIMARY CTA */}
          <motion.button
            whileTap={{ scale: 0.97 }}
            onClick={() => router.push("/send-package/step-1")}
            className="w-full bg-emerald-500 hover:bg-emerald-400 text-charcoal-950 font-black py-5 rounded-2xl flex items-center justify-center gap-3 text-lg uppercase tracking-wide shadow-[0_0_32px_rgba(16,185,129,0.4)] transition-all"
          >
            <Package size={22} strokeWidth={2.5} />
            Send Package
          </motion.button>

          {/* Secondary action */}
          <button
            onClick={() => router.push("/vendor/history")}
            className="w-full py-3.5 text-charcoal-500 font-bold text-sm flex items-center justify-center gap-2 hover:text-charcoal-300 transition-colors"
          >
            <Clock size={14} />
            View delivery history
          </button>
        </div>
      </div>

      {/* Pilot zone label */}
      {mapLoaded && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 1.2 }}
          className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-10 pointer-events-none"
        >
          <div className="bg-charcoal-950/60 backdrop-blur-sm border border-emerald-500/20 rounded-full px-4 py-1.5">
            <span className="text-emerald-400 text-[10px] font-black uppercase tracking-widest">🟢 Kano Pilot Zone Active</span>
          </div>
        </motion.div>
      )}
    </div>
  );
}
