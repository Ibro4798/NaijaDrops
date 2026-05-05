"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/utils/supabase/client";
import { motion, AnimatePresence } from "framer-motion";
import { 
  Package, 
  Clock, 
  ChevronRight, 
  AlertCircle, 
  Loader2, 
  Marker as MarkerIcon,
  Navigation,
  Star,
  ShieldCheck,
  CheckCircle2,
  Truck,
  MapPin,
  LogOut,
  User as UserIcon
} from "lucide-react";
import Map, { Marker } from "react-map-gl";
import "mapbox-gl/dist/mapbox-gl.css";

const KANO_CENTER = { lat: 12.0022, lng: 8.5920 };

const STATUS_CONFIG = {
  pending: { label: "Searching", color: "text-amber-500", bg: "bg-amber-500/10 border-amber-500/20", icon: <Clock size={16} /> },
  assigned: { label: "Rider Found", color: "text-blue-500", bg: "bg-blue-500/10 border-blue-500/20", icon: <Truck size={16} /> },
  picked_up: { label: "Picked Up", color: "text-emerald-500", bg: "bg-emerald-500/10 border-emerald-500/20", icon: <Package size={16} /> },
  in_transit: { label: "In Transit", color: "text-emerald-500", bg: "bg-emerald-500/10 border-emerald-500/20", icon: <Navigation size={16} /> },
};

// ─── Profile Completion Modal ────────────────────────────────────────────────
function ProfileModal({ isOpen, onClose, onSave, currentName }) {
  const [name, setName] = useState(currentName || "");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setName(currentName || "");
      setLoading(false);
    }
  }, [isOpen, currentName]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-6">
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="absolute inset-0 bg-charcoal-950/90 backdrop-blur-md" onClick={onClose} />
      <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} 
        className="relative w-full max-w-sm bg-charcoal-900 border border-white/10 rounded-[2.5rem] p-8 shadow-2xl space-y-6">
        <div className="text-center">
           <h2 className="text-2xl font-black text-white italic uppercase tracking-tighter font-outfit">Identity Profile</h2>
           <p className="text-charcoal-500 text-xs mt-2 uppercase font-bold tracking-widest">Help riders find you faster</p>
        </div>
        
        <div className="space-y-4">
           <div>
              <label className="text-[10px] font-black text-charcoal-600 uppercase tracking-widest block mb-2 px-1">Full Name</label>
              <input 
                type="text" 
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Enter your name"
                className="w-full bg-charcoal-950 border border-white/10 rounded-2xl px-5 py-4 text-white font-bold focus:border-emerald-500 transition-all outline-none"
              />
           </div>
           
           <button 
             onClick={async () => { 
               setLoading(true); 
               try {
                 await onSave(name); 
               } finally {
                 setLoading(false);
               }
             }}
             disabled={loading || !name}
             className="w-full bg-emerald-500 hover:bg-emerald-400 text-charcoal-950 font-black py-4 rounded-2xl uppercase text-xs tracking-widest shadow-glow disabled:opacity-50"
           >
             {loading ? <Loader2 className="animate-spin mx-auto" /> : "Save Profile"}
           </button>
        </div>
      </motion.div>
    </div>
  );
}

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
  const [isProfileModalOpen, setIsProfileModalOpen] = useState(false);
  const [isProfileIncomplete, setIsProfileIncomplete] = useState(false);

  useEffect(() => {
    const h = new Date().getHours();
    if (h < 12) setGreeting("Good morning");
    else if (h < 17) setGreeting("Good afternoon");
    else setGreeting("Good evening");
  }, []);

  async function loadData() {
    // 1. Get User
    const { data: { user: u } } = await supabase.auth.getUser();
    if (!u) return;
    setUser(u);

    // 2. Get Vendor Profile (to get the correct vendor_id)
    const { data: vendorProfile } = await supabase.from("vendors").select("id").eq("user_id", u.id).single();
    const vendorId = vendorProfile?.id;

    // 3. Get User Profile Name
    const { data: profile } = await supabase.from("users").select("name, full_name").eq("id", u.id).single();
    const rawName = profile?.full_name || profile?.name;
    if (rawName) {
      setDisplayName(rawName.split(" ")[0]);
      setIsProfileIncomplete(false);
    } else {
      setIsProfileIncomplete(true);
    }

    // 4. Get Orders using the correct Vendor ID
    if (vendorId) {
      const { data: orders } = await supabase
        .from("orders")
        .select("id, status, pickup_name, dropoff_name, agreed_price, created_at")
        .eq("vendor_id", vendorId)
        .order("created_at", { ascending: false })
        .limit(5);

      if (orders) {
        const active = orders.filter(o => ["pending", "assigned", "picked_up", "in_transit"].includes(o.status));
        setActiveOrderCount(active.length);
        setLatestOrder(orders[0] || null);
      }
    }

    if (orders) {
      const active = orders.filter(o => ["pending", "assigned", "picked_up", "in_transit"].includes(o.status));
      setActiveOrderCount(active.length);
      setLatestOrder(orders[0] || null);
    }
  }

  useEffect(() => {
    loadData();

    if (typeof navigator !== "undefined" && navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        pos => setUserLocation({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
        () => {}
      );
    }
  }, []);

  const handleUpdateProfile = async (name) => {
    const { error } = await supabase.from("users").update({ full_name: name }).eq("id", user.id);
    if (!error) {
       setIsProfileModalOpen(false);
       loadData();
    }
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    router.replace("/auth/login");
  };

  return (
    <div className="h-[100dvh] w-full relative overflow-hidden bg-charcoal-950">
      <ProfileModal 
        isOpen={isProfileModalOpen} 
        onClose={() => setIsProfileModalOpen(false)} 
        onSave={handleUpdateProfile} 
        currentName={displayName}
      />

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
          <div className="flex items-center gap-3">
            {activeOrderCount > 0 && (
              <div className="bg-emerald-500/20 border border-emerald-500/40 px-3 py-1.5 rounded-full flex items-center gap-1.5">
                <div className="w-2 h-2 bg-emerald-400 rounded-full animate-pulse" />
                <span className="text-emerald-400 text-xs font-black uppercase tracking-widest">{activeOrderCount} Active</span>
              </div>
            )}
            <button onClick={() => setIsProfileModalOpen(true)} className="p-2 bg-charcoal-900 border border-white/10 rounded-xl text-charcoal-400 hover:text-emerald-400 transition-colors">
              <UserIcon size={16} />
            </button>
            <button onClick={handleLogout} className="p-2 bg-charcoal-900 border border-white/10 rounded-xl text-charcoal-400 hover:text-red-400 transition-colors">
              <LogOut size={16} />
            </button>
          </div>
        </div>
      </div>

      {/* Bottom Sheet */}
      <div className="absolute bottom-0 inset-x-0 z-20">
        <div className="absolute inset-x-0 bottom-0 h-[400px] bg-gradient-to-t from-charcoal-950 via-charcoal-950/95 to-transparent pointer-events-none" />

        <div className="relative px-5 pb-8 pt-6 space-y-4">
          
          {/* Trust Nudge */}
          {isProfileIncomplete && (
            <motion.button 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              onClick={() => setIsProfileModalOpen(true)}
              className="w-full bg-blue-500/10 border border-blue-500/20 rounded-2xl p-4 flex items-center gap-4 text-left hover:bg-blue-500/15 transition-all"
            >
              <div className="w-10 h-10 rounded-full bg-blue-500/20 flex items-center justify-center text-blue-400 shrink-0">
                <AlertCircle size={20} />
              </div>
              <div className="flex-1">
                 <div className="text-[10px] font-black text-blue-400 uppercase tracking-widest mb-0.5">Trust Boost Available</div>
                 <p className="text-xs text-blue-200/70 font-medium leading-tight">Add your name to match with riders 2x faster.</p>
              </div>
              <ChevronRight size={14} className="text-blue-500/50" />
            </motion.button>
          )}

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

