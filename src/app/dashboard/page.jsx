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
  User as UserIcon,
  Menu,
  X,
  Phone,
  FileText,
  History as HistoryIcon
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

import { Camera, Image as ImageIcon } from "lucide-react";

// â”€â”€â”€ Profile Completion Modal â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
function ProfileModal({ isOpen, onClose, onSave, currentName, currentAvatar }) {
  const [name, setName] = useState(currentName || "");
  const [avatar, setAvatar] = useState(currentAvatar || "");
  const [uploading, setUploading] = useState(false);
  const [loading, setLoading] = useState(false);
  const supabase = createClient();

  useEffect(() => {
    if (isOpen) {
      setName(currentName || "");
      setAvatar(currentAvatar || "");
      setLoading(false);
    }
  }, [isOpen, currentName, currentAvatar]);

  const handleImageUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    setUploading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      const fileExt = file.name.split('.').pop();
      const fileName = `${user.id}/${Math.random()}.${fileExt}`;
      const filePath = `${fileName}`;

      const { error: uploadError } = await supabase.storage
        .from('avatars')
        .upload(filePath, file);

      if (uploadError) throw uploadError;

      const { data: { publicUrl } } = supabase.storage
        .from('avatars')
        .getPublicUrl(filePath);

      setAvatar(publicUrl);
    } catch (error) {
      alert("Error uploading image: " + error.message);
    } finally {
      setUploading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center p-6">
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="absolute inset-0 bg-charcoal-950/90 backdrop-blur-md" onClick={onClose} />
      <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} 
        className="relative w-full max-w-sm bg-charcoal-900 border border-white/10 rounded-[2.5rem] p-8 shadow-2xl space-y-6">
        
        <div className="text-center">
            <h2 className="text-2xl font-black text-white italic uppercase tracking-tighter font-outfit">Identity Profile</h2>
            <p className="text-charcoal-500 text-xs mt-2 uppercase font-bold tracking-widest">Help riders find you faster</p>
        </div>

        {/* Avatar Upload */}
        <div className="flex flex-col items-center gap-4">
          <div className="relative group">
            <div className="w-24 h-24 rounded-full bg-charcoal-950 border-2 border-white/10 overflow-hidden flex items-center justify-center shadow-2xl">
              {avatar ? (
                <img src={avatar} alt="Profile" className="w-full h-full object-cover" />
              ) : (
                <UserIcon size={40} className="text-charcoal-800" />
              )}
              {uploading && (
                <div className="absolute inset-0 bg-charcoal-950/60 flex items-center justify-center">
                  <Loader2 className="animate-spin text-emerald-500" />
                </div>
              )}
            </div>
            <label className="absolute bottom-0 right-0 w-8 h-8 bg-emerald-500 rounded-full flex items-center justify-center cursor-pointer hover:bg-emerald-400 transition-all shadow-lg shadow-emerald-500/20">
              <Camera size={16} className="text-charcoal-950" />
              <input type="file" accept="image/*" className="hidden" onChange={handleImageUpload} disabled={uploading} />
            </label>
          </div>
          <span className="text-[10px] font-black text-emerald-500/60 uppercase tracking-widest">Click to upload photo</span>
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
                 await onSave(name, avatar); 
               } finally {
                 setLoading(false);
               }
             }}
             disabled={loading || uploading || !name}
             className="w-full bg-emerald-500 hover:bg-emerald-400 text-charcoal-950 font-black py-4 rounded-2xl uppercase text-xs tracking-widest shadow-glow disabled:opacity-50"
           >
             {loading ? <Loader2 className="animate-spin mx-auto" /> : "Save Profile"}
           </button>
        </div>
      </motion.div>
    </div>
  );
}

// â”€â”€â”€ Menu Modal â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
function MenuModal({ isOpen, onClose, onLogout, onProfile, userAvatar }) {
  const router = useRouter();
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[110] flex items-start justify-end p-6">
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} 
        className="absolute inset-0 bg-charcoal-950/60 backdrop-blur-sm" onClick={onClose} />
      
      <motion.div 
        initial={{ x: 100, opacity: 0 }} animate={{ x: 0, opacity: 1 }} exit={{ x: 100, opacity: 0 }}
        className="relative w-full max-w-[280px] bg-charcoal-900 border border-white/10 rounded-[2rem] shadow-2xl overflow-hidden flex flex-col"
      >
        <div className="p-6 border-b border-white/5 flex items-center justify-between">
           <span className="text-[10px] font-black text-charcoal-500 uppercase tracking-widest">Menu</span>
           <button onClick={onClose} className="p-2 text-charcoal-500 hover:text-white transition-colors"><X size={20} /></button>
        </div>

        <div className="p-4 space-y-2 overflow-y-auto flex-1">
           <button onClick={() => { onProfile(); onClose(); }} className="w-full flex items-center gap-4 p-4 rounded-2xl hover:bg-white/5 text-white transition-all group">
              <div className="w-10 h-10 rounded-xl bg-white/5 flex items-center justify-center group-hover:bg-emerald-500 group-hover:text-charcoal-950 transition-all overflow-hidden">
                {userAvatar ? <img src={userAvatar} className="w-full h-full object-cover" /> : <UserIcon size={20} />}
              </div>
              <span className="font-bold text-sm">Identity Profile</span>
           </button>

           <button onClick={() => { router.push("/vendor/history"); onClose(); }} className="w-full flex items-center gap-4 p-4 rounded-2xl hover:bg-white/5 text-white transition-all group">
              <div className="w-10 h-10 rounded-xl bg-white/5 flex items-center justify-center group-hover:bg-emerald-500 group-hover:text-charcoal-950 transition-all">
                <HistoryIcon size={20} />
              </div>
              <span className="font-bold text-sm">Order History</span>
           </button>

           <button onClick={() => { router.push("/driver/onboarding"); onClose(); }} className="w-full flex items-center gap-4 p-4 rounded-2xl bg-emerald-500/5 border border-emerald-500/10 hover:bg-emerald-500/10 text-emerald-500 transition-all group text-left">
              <div className="w-10 h-10 rounded-xl bg-emerald-500/10 flex items-center justify-center group-hover:bg-emerald-500 group-hover:text-charcoal-950 transition-all">
                <ShieldCheck size={20} />
              </div>
              <div>
                <div className="font-black text-sm uppercase tracking-tight">Become a Driver</div>
                <div className="text-[9px] font-bold opacity-60 uppercase tracking-widest">Verify & Earn</div>
              </div>
           </button>

           <div className="h-px bg-white/5 my-2" />

           <div className="px-4 py-2">
              <span className="text-[9px] font-black text-charcoal-600 uppercase tracking-widest">Support</span>
           </div>

           <a href="mailto:yahaya.usama@naijadrops.tech" className="w-full flex items-center gap-4 p-4 rounded-2xl hover:bg-white/5 text-charcoal-300 transition-all">
              <div className="w-10 h-10 rounded-xl bg-white/5 flex items-center justify-center">
                <FileText size={20} />
              </div>
              <div className="text-left">
                <div className="font-bold text-sm">Contact Support</div>
                <div className="text-[10px] opacity-60">yahaya.usama@naijadrops.tech</div>
              </div>
           </a>

           <a href="https://wa.me/2349118267433" target="_blank" className="w-full flex items-center gap-4 p-4 rounded-2xl hover:bg-emerald-500/10 text-emerald-400 transition-all">
              <div className="w-10 h-10 rounded-xl bg-emerald-500/10 flex items-center justify-center">
                <Phone size={20} />
              </div>
              <div className="text-left">
                <div className="font-bold text-sm">WhatsApp Help</div>
                <div className="text-[10px] opacity-60">09118267433</div>
              </div>
           </a>

           <button onClick={() => { router.push("/terms"); onClose(); }} className="w-full flex items-center gap-4 p-4 rounded-2xl hover:bg-white/5 text-charcoal-400 transition-all">
              <div className="w-10 h-10 rounded-xl bg-white/5 flex items-center justify-center">
                <FileText size={20} />
              </div>
              <span className="font-bold text-sm text-charcoal-400">Terms & Conditions</span>
           </button>

           <div className="h-px bg-white/5 my-2" />

           <button onClick={onLogout} className="w-full flex items-center gap-4 p-4 rounded-2xl hover:bg-red-500/10 text-charcoal-400 hover:text-red-400 transition-all group">
              <div className="w-10 h-10 rounded-xl bg-white/5 flex items-center justify-center group-hover:bg-red-500 group-hover:text-charcoal-950 transition-all">
                <LogOut size={20} />
              </div>
              <span className="font-bold text-sm">Sign Out</span>
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
  const [avatarUrl, setAvatarUrl] = useState("");
  const [isProfileModalOpen, setIsProfileModalOpen] = useState(false);
  const [isMenuOpen, setIsMenuOpen] = useState(false);

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

    // 2. Get User Profile Name & Avatar
    const { data: profile } = await supabase.from("users").select("name, avatar_url").eq("id", u.id).single();
    if (profile?.name) {
      setDisplayName(profile.name.split(" ")[0]);
      setAvatarUrl(profile.avatar_url || "");
    } else {
      // Auto-open modal if profile is empty
      setIsProfileModalOpen(true);
    }

    // 3. Get Vendor Profile (to get the correct vendor_id)
    const { data: vendorProfile } = await supabase.from("vendors").select("id").eq("user_id", u.id).single();
    const vendorId = vendorProfile?.id;

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

  const handleUpdateProfile = async (name, avatar) => {
    const { error } = await supabase.from("users").update({ 
      name: name,
      avatar_url: avatar 
    }).eq("id", user.id);
    
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
        currentAvatar={avatarUrl}
      />

      <AnimatePresence>
        {isMenuOpen && (
          <MenuModal 
            isOpen={isMenuOpen} 
            onClose={() => setIsMenuOpen(false)} 
            onLogout={handleLogout}
            onProfile={() => setIsProfileModalOpen(true)}
            userAvatar={avatarUrl}
          />
        )}
      </AnimatePresence>

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
            <div className="text-charcoal-600 text-sm font-medium">Map loadingâ€¦</div>
          </div>
        )}
      </div>

      {/* Top gradient overlay */}
      <div className="absolute inset-x-0 top-0 h-32 bg-gradient-to-b from-charcoal-950/80 to-transparent z-10 pointer-events-none" />

      {/* Top Bar */}
      <div className="absolute top-0 inset-x-0 z-20 px-6 pt-14 pb-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
             <div className="w-12 h-12 rounded-2xl bg-charcoal-900 border border-white/10 overflow-hidden flex items-center justify-center shadow-xl">
               {avatarUrl ? <img src={avatarUrl} className="w-full h-full object-cover" /> : <UserIcon className="text-charcoal-600" size={20} />}
             </div>
             <div>
               <p className="text-charcoal-400 text-[10px] font-bold uppercase tracking-widest leading-none mb-1">{greeting}</p>
               <h1 className="text-white font-black text-xl tracking-tight font-outfit leading-none">
                 {displayName || "Dashboard"}
               </h1>
             </div>
          </div>
          <div className="flex items-center gap-3">
            {activeOrderCount > 0 && (
              <div className="bg-emerald-500/20 border border-emerald-500/40 px-3 py-1.5 rounded-full flex items-center gap-1.5">
                <div className="w-2 h-2 bg-emerald-400 rounded-full animate-pulse" />
                <span className="text-emerald-400 text-[10px] font-black uppercase tracking-widest">{activeOrderCount} Active</span>
              </div>
            )}
            <button onClick={() => setIsMenuOpen(true)} className="w-12 h-12 bg-charcoal-900 border border-white/10 rounded-2xl text-white flex items-center justify-center hover:bg-white/5 transition-all shadow-xl">
              <Menu size={20} />
            </button>
          </div>
        </div>
      </div>

      {/* Bottom Sheet */}
      <div className="absolute bottom-0 inset-x-0 z-20">
        <div className="absolute inset-x-0 bottom-0 h-[400px] bg-gradient-to-t from-charcoal-950 via-charcoal-950/95 to-transparent pointer-events-none" />

        <div className="relative px-5 pb-8 pt-6 space-y-4">
          {/* PRIMARY CTA */}
          <motion.button
            whileTap={{ scale: 0.97 }}
            onClick={() => router.push("/send-package/step-1")}
            className="w-full bg-emerald-500 hover:bg-emerald-400 text-charcoal-950 font-black py-6 rounded-3xl flex items-center justify-center gap-3 text-xl uppercase tracking-wider shadow-[0_0_32px_rgba(16,185,129,0.4)] transition-all mb-4"
          >
            <Package size={24} strokeWidth={2.5} />
            Send Package
          </motion.button>
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
            <span className="text-emerald-400 text-[10px] font-black uppercase tracking-widest">ðŸŸ¢ Kano Pilot Zone Active</span>
          </div>
        </motion.div>
      )}
    </div>
  );
}


