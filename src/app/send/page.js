"use client";

import { useState, useEffect, useRef, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import dynamic from 'next/dynamic';
import { createClient } from '@/utils/supabase/client';
import { getReliableLocation, getCurrentPositionStandard } from '@/utils/geolocation';
import { calculateDistance } from '@/utils/distance';
import { PRICING_RATES } from '@/utils/constants';
import { 
  ArrowLeft, MapPin, Mic, Camera, Package, ShieldCheck, 
  ChevronRight, Search, Link as LinkIcon, Navigation, 
  Trash2, Square, Play, Check, Info, Coins, Truck, Clock, 
  Sparkles, Loader2, Map as MapIcon
} from 'lucide-react';

const MapModal = dynamic(() => import('@/components/MapModal'), { 
  ssr: false,
  loading: () => <div className="fixed inset-0 bg-white/80 backdrop-blur-sm z-[100] flex items-center justify-center font-bold text-emerald-800 animate-pulse">Initializing Map Engine...</div>
});

const MiniRouteMap = dynamic(() => import('@/components/MiniRouteMap'), { ssr: false });

const KANO_LOCATIONS = [
  { name: "Kantin Kwari (Main)", area: "Fagge, Kano", lat: 11.9961, lng: 8.5182 },
  { name: "Sabon Gari Market", area: "Fagge, Kano", lat: 11.9655, lng: 8.5280 },
  { name: "BUK New Campus", area: "Gwarzo Road, Kano", lat: 11.9753, lng: 8.4166 },
  { name: "Nassarawa GRA", area: "Nassarawa, Kano", lat: 12.0022, lng: 8.5167 },
  { name: "Hotoro GRA", area: "Nassarawa, Kano", lat: 12.0375, lng: 8.4762 },
];

export default function SendPackage() {
  const router = useRouter();
  const supabase = createClient();
  
  // Wizard State
  const [step, setStep] = useState(1); // 1: Route, 2: Shipment, 3: Details

  useEffect(() => {
    async function checkRole() {
        const { user, role } = await getUserRole(supabase);
        if (user) {
            // Drivers should NEVER be on the customer dashboard
            if (role === 'driver') {
                router.push('/driver');
                return;
            }
            
            // Note: Admins are allowed to view the customer dashboard for testing/support
        } else {
            router.push('/login?role=user');
        }
    }
    checkRole();
  }, [supabase, router]);

  // Form State
  const [pickup, setPickup] = useState(null); 
  const [dropoff, setDropoff] = useState(null);
  const [category, setCategory] = useState('');
  const [size, setSize] = useState('Small');
  const [vehicleType, setVehicleType] = useState('bike');
  const [receiver, setReceiver] = useState({ name: '', phone: '' });
  const [scheduledAt, setScheduledAt] = useState(null);
  const [estimatedPrice, setEstimatedPrice] = useState(0);
  const [distanceKm, setDistanceKm] = useState(0);
  const [fareType, setFareType] = useState('standard'); // 'standard' | 'express' | 'offer'
  const [customOffer, setCustomOffer] = useState('');

  // UI State
  const [activeModal, setActiveModal] = useState(null);
  const [mapTarget, setMapTarget] = useState(null);
  const [searchInputs, setSearchInputs] = useState({ pickup: '', dropoff: '' });
  const [suggestions, setSuggestions] = useState({ pickup: [], dropoff: [] });
  const [isSearching, setIsSearching] = useState({ pickup: false, dropoff: false });
  const [gpsStatus, setGpsStatus] = useState({ slot: null, loading: false });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isResolvingLink, setIsResolvingLink] = useState({ pickup: false, dropoff: false });
  const [linkError, setLinkError] = useState({ pickup: null, dropoff: null });
  
  // Voice State
  const [showVoiceRecorder, setShowVoiceRecorder] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [voiceNoteBlob, setVoiceNoteBlob] = useState(null);
  const [voiceNoteUrl, setVoiceNoteUrl] = useState(null);
  const [recordingTime, setRecordingTime] = useState(0);
  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);
  const timerRef = useRef(null);
  const audioPlaybackRef = useRef(null);
  const [isPlayingVoice, setIsPlayingVoice] = useState(false);

  const searchTimeoutRef = useRef(null);

  // ─── Pricing Logic ─────────────────────────────────────────────────────────
  useEffect(() => {
    if (pickup?.coords && dropoff?.coords) {
      const dist = calculateDistance(
        pickup.coords.lat, pickup.coords.lng,
        dropoff.coords.lat, dropoff.coords.lng
      );
      setDistanceKm(dist.toFixed(1));

      const rate = PRICING_RATES[vehicleType.toUpperCase()];
      const multiplier = PRICING_RATES.SIZE_MULTIPLIERS[size] || 1;
      
      let price = (rate.base + (dist * rate.perKm)) * multiplier;
      setEstimatedPrice(Math.ceil(price / 50) * 50);
    } else {
        setEstimatedPrice(0);
        setDistanceKm(0);
    }
  }, [pickup, dropoff, vehicleType, size]);

  // ─── Smart Link Resolution ──────────────────────────────────────────────
  const resolveSmartLink = async (url, slot) => {
    setIsResolvingLink(prev => ({ ...prev, [slot]: true }));
    try {
        const res = await fetch(`/api/resolve-link?url=${encodeURIComponent(url)}`);
        const data = await res.json();
        
        if (data.coords) {
            // --- NEW: Use Mapbox Reverse Geocoding for readable name ---
            let readableName = data.resolvedUrl.includes('google.com') ? 'Google Maps Location' : 'Map Location';
            try {
                const mapboxToken = process.env.NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN;
                const geoRes = await fetch(`https://api.mapbox.com/geocoding/v5/mapbox.places/${data.coords.lng},${data.coords.lat}.json?access_token=${mapboxToken}&limit=1`);
                const geoData = await geoRes.json();
                if (geoData.features && geoData.features.length > 0) {
                    readableName = geoData.features[0].place_name.split(',')[0]; // Get the first part of the address
                }
            } catch (e) { console.error("Geocoding failed", e); }
            // ------------------------------------------------------------

            const locData = {
                name: readableName,
                coords: data.coords
            };
            if (slot === 'pickup') setPickup(locData);
            else setDropoff(locData);
            setSearchInputs(prev => ({ ...prev, [slot]: '' }));
            setLinkError(prev => ({ ...prev, [slot]: null }));
        } else if (data.error) {
            setLinkError(prev => ({ ...prev, [slot]: data.error }));
        }
    } catch (e) {
        setLinkError(prev => ({ ...prev, [slot]: "Connection failed. Please use the search instead." }));
    } finally {
        setIsResolvingLink(prev => ({ ...prev, [slot]: false }));
    }
  };

  // ─── Location Logic ────────────────────────────────────────────────────────
  const handleSearchChange = (val, slot) => {
    setSearchInputs(prev => ({ ...prev, [slot]: val }));
    if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);
    
    // Check if it's a URL
    if (val.startsWith('http') || val.includes('maps.app.goo.gl') || val.includes('apple.com/maps')) {
        resolveSmartLink(val, slot);
        return;
    }

    if (val.length < 2) {
      setSuggestions(prev => ({ ...prev, [slot]: [] }));
      return;
    }

    const localResults = KANO_LOCATIONS.filter(loc => 
      loc.name.toLowerCase().includes(val.toLowerCase())
    );
    setSuggestions(prev => ({ ...prev, [slot]: localResults }));

    const mapboxToken = process.env.NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN;

    searchTimeoutRef.current = setTimeout(async () => {
      setIsSearching(prev => ({ ...prev, [slot]: true }));
      try {
        const { getMapboxSuggestions } = await import('@/utils/mapbox');
        const mapboxSugs = await getMapboxSuggestions(val, mapboxToken);
        const webResults = mapboxSugs.map(s => ({
          name: s.name,
          area: s.description,
          lat: s.lat,
          lng: s.lng,
          isWeb: true
        }));
        setSuggestions(prev => ({ ...prev, [slot]: [...localResults, ...webResults].slice(0, 5) }));
      } catch (e) {
        console.error("Search failed", e);
      } finally {
        setIsSearching(prev => ({ ...prev, [slot]: false }));
      }
    }, 400);
  };

  const handleSelectSuggestion = (loc, slot) => {
    setMapTarget({ coords: { lat: loc.lat, lng: loc.lng }, name: loc.name });
    setActiveModal(slot);
    setSuggestions(prev => ({ ...prev, [slot]: [] }));
    setSearchInputs(prev => ({ ...prev, [slot]: '' }));
  };

  const handleConfirmLocation = (locData) => {
    if (activeModal === 'pickup') {
      setPickup({ name: locData.name, coords: locData.coords });
    } else {
      setDropoff({ name: locData.name, coords: locData.coords });
    }
    setActiveModal(null);
    setMapTarget(null);
  };

  const useCurrentLocation = async (slot) => {
    setGpsStatus({ slot, loading: true });
    try {
        const location = await getCurrentPositionStandard();
        if (location) {
            setMapTarget({ coords: { lat: location.lat, lng: location.lng }, name: 'Current Location' });
            setActiveModal(slot);
        }
    } catch (err) {
        console.error("Standard GPS failed, falling back:", err);
        const location = await getReliableLocation();
        if (location) {
            setMapTarget({ coords: { lat: location.lat, lng: location.lng }, name: 'Current Location' });
            setActiveModal(slot);
        }
    } finally {
        setGpsStatus({ slot: null, loading: false });
    }
  };

  // ─── Record Logic ──────────────────────────────────────────────────────────
  const toggleRecording = async () => {
    if (isRecording) {
      mediaRecorderRef.current?.stop();
      if (timerRef.current) clearInterval(timerRef.current);
      setIsRecording(false);
      return;
    }
    // STOP PLAYBACK IF RECORDING
    if (audioPlaybackRef.current) {
        audioPlaybackRef.current.pause();
        setIsPlayingVoice(false);
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaRecorderRef.current = new MediaRecorder(stream);
      audioChunksRef.current = [];
      mediaRecorderRef.current.ondataavailable = (e) => audioChunksRef.current.push(e.data);
      mediaRecorderRef.current.onstop = () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        setVoiceNoteBlob(audioBlob);
        setVoiceNoteUrl(URL.createObjectURL(audioBlob));
      };
      mediaRecorderRef.current.start();
      setIsRecording(true);
      setRecordingTime(0);
      timerRef.current = setInterval(() => setRecordingTime(prev => prev + 1), 1000);
    } catch (e) { alert("Access denied"); }
  };

  const handleTogglePlayback = () => {
    if (isPlayingVoice) {
        audioPlaybackRef.current.pause();
        setIsPlayingVoice(false);
    } else {
        if (!audioPlaybackRef.current) {
            audioPlaybackRef.current = new Audio(voiceNoteUrl);
            audioPlaybackRef.current.onended = () => setIsPlayingVoice(false);
        }
        audioPlaybackRef.current.play();
        setIsPlayingVoice(true);
    }
  };

  const deleteRecording = () => {
    if (audioPlaybackRef.current) {
        audioPlaybackRef.current.pause();
        audioPlaybackRef.current = null;
    }
    setVoiceNoteBlob(null);
    setVoiceNoteUrl(null);
    setShowVoiceRecorder(false);
    setIsPlayingVoice(false);
  };

  // ─── Execution ─────────────────────────────────────────────────────────────
  const handleSubmitOrder = async () => {
    setIsSubmitting(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { router.push('/login'); return; }

      // Ensure customer profile exists — prevents orders_user_id_fkey FK violation
      const { role, user: verifiedUser } = await getUserRole(supabase);

      if (!verifiedUser) { router.push('/login'); return; }
      
      // If they somehow got here but don't have a customer row, getUserRole handles the creation.
      if (role !== 'user' && role !== 'admin') {
         throw new Error("Only customers can place orders.");
      }

      let finalVoiceUrl = null;
      if (voiceNoteBlob) {
        const fileName = `${user.id}/${Date.now()}.webm`;
        await supabase.storage.from('documents').upload(`driver-docs/${fileName}`, voiceNoteBlob);
        const { data: urlData } = supabase.storage.from('documents').getPublicUrl(`driver-docs/${fileName}`);
        finalVoiceUrl = urlData.publicUrl;
      }

      const finalAgreedPrice = fareType === 'offer' ? Number(customOffer) : (fareType === 'express' ? Math.ceil(estimatedPrice * 1.3 / 50) * 50 : estimatedPrice);

      const orderData = {
        user_id: user.id,
        pickup_name: pickup.name,
        pickup_lat: pickup.coords.lat,
        pickup_lng: pickup.coords.lng,
        dropoff_name: dropoff.name,
        dropoff_lat: dropoff.coords.lat,
        dropoff_lng: dropoff.coords.lng,
        item_category: category,
        item_size: size,
        receiver_name: receiver.name,
        receiver_phone: receiver.phone,
        agreed_price: finalAgreedPrice,
        fare_type: fareType,
        status: 'looking_for_driver',
        voice_note_url: finalVoiceUrl
      };

      const { data, error } = await supabase.from('orders').insert(orderData).select().single();
      if (error) throw error;
      
      router.push(`/matching?orderId=${data.id}`);
    } catch (err) {
      console.error(err);
      alert(err.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  // ─── Render Helpers ────────────────────────────────────────────────────────
  const isStep1Valid = pickup?.coords && dropoff?.coords;
  const isStep2Valid = category && size && vehicleType;
  const isStep3Valid = receiver.name && receiver.phone.length >= 10;

  return (
    <main className="min-h-[100dvh] aura-gradient relative overflow-x-hidden">
      {/* Background Decor */}
      <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-emerald-500/5 rounded-full blur-[120px] -translate-y-1/2 translate-x-1/2 pointer-events-none"></div>

      <div className="relative z-10 max-w-2xl mx-auto px-4 pt-[calc(6rem+var(--safe-top))] pb-[calc(8rem+var(--safe-bottom))]">
        
        {/* Header Stitched Area */}
        <div className="mb-10 animate-in fade-in slide-in-from-top-4 duration-700">
           <div className="flex items-center justify-between mb-6">
              <button onClick={() => step > 1 ? setStep(step - 1) : router.push('/')} className="w-12 h-12 bg-white/10 hover:bg-white/20 backdrop-blur-md rounded-2xl flex items-center justify-center text-white transition-all active:scale-90">
                  <ArrowLeft size={22} />
              </button>
              <h1 className="text-3xl font-black text-white tracking-tighter">Dispatch</h1>
              <div className="w-12"></div> {/* Spacer */}
           </div>

           <div className="flex items-center gap-2">
              {[1, 2, 3].map((s) => (
                <div key={s} className="flex-1 h-1.5 rounded-full bg-white/10 overflow-hidden">
                  <div className={`h-full bg-emerald-500 transition-all duration-700 ${step >= s ? 'w-full' : 'w-0'}`}></div>
                </div>
              ))}
           </div>
           <div className="flex justify-between mt-3 px-1 text-[10px] font-black uppercase tracking-widest text-charcoal-400">
              <span className={step >= 1 ? 'text-emerald-400' : ''}>Route</span>
              <span className={step >= 2 ? 'text-emerald-400' : ''}>Shipment</span>
              <span className={step >= 3 ? 'text-emerald-400' : ''}>Finalize</span>
           </div>
        </div>

        <section className="space-y-6">
          {step === 1 && (
            <div className="space-y-4 animate-in fade-in slide-in-from-bottom-8 duration-700">
              {/* Pickup Stage */}
              <div className="glass rounded-[2.5rem] p-8 border-white/20 shadow-premium relative overflow-hidden group">
                 <div className="absolute top-0 left-0 w-1.5 h-full bg-emerald-500"></div>
                 <div className="flex items-start gap-5">
                    <div className="w-12 h-12 rounded-2xl bg-emerald-600 text-white flex items-center justify-center shrink-0 shadow-lg group-hover:rotate-6 transition-transform">
                       <MapPin size={24} />
                    </div>
                    <div className="flex-1">
                       <label className="text-[10px] font-black uppercase tracking-widest text-emerald-600 mb-2 block tracking-[0.2em]">Pickup Point</label>
                       {pickup ? (
                          <div className="flex items-center justify-between">
                             <div className="font-black text-2xl text-charcoal-900 tracking-tighter leading-tight truncate max-w-[200px]">{pickup.name}</div>
                             <button onMouseDown={() => setPickup(null)} className="text-[10px] font-black uppercase tracking-widest bg-emerald-500/10 text-emerald-700 px-3 py-1.5 rounded-xl hover:bg-emerald-600 hover:text-white transition-all">Change</button>
                          </div>
                       ) : (
                          <div className="relative">
                             <input 
                                className="w-full bg-transparent border-none p-0 font-black text-2xl text-charcoal-900 placeholder:text-charcoal-200 outline-none tracking-tighter leading-tight"
                                placeholder="Where to pick up?"
                                value={searchInputs.pickup}
                                onChange={(e) => handleSearchChange(e.target.value, 'pickup')}
                                autoComplete="off"
                             />
                             <div className="absolute right-0 top-1/2 -translate-y-1/2 flex items-center gap-2">
                                {isResolvingLink.pickup ? <Loader2 size={18} className="animate-spin text-emerald-600" /> : <button onMouseDown={() => useCurrentLocation('pickup')} className="text-emerald-300 hover:text-emerald-600 transition-colors"><Navigation size={22} /></button>}
                             </div>
                             {suggestions.pickup.length > 0 && (
                                <div className="absolute top-full left-0 right-0 mt-4 bg-white rounded-[2rem] shadow-premium border border-gray-100 overflow-hidden z-[200] animate-in slide-in-from-top-4">
                                   {suggestions.pickup.map((loc, i) => (
                                      <button key={i} onMouseDown={() => handleSelectSuggestion(loc, 'pickup')} className="w-full px-6 py-4 text-left hover:bg-emerald-50 border-b border-gray-50 last:border-0 flex items-center gap-3 active:bg-emerald-100 group transition-colors">
                                         <div className="w-10 h-10 bg-emerald-50 rounded-xl flex items-center justify-center text-emerald-600 group-hover:scale-110 transition-transform"><Search size={18} /></div>
                                         <div className="flex-1 truncate font-black text-charcoal-900">{loc.name}</div>
                                      </button>
                                   ))}
                                </div>
                             )}
                          </div>
                       )}
                    </div>
                 </div>
              </div>

              {/* Connecting Stitch */}
              <div className="flex justify-center -my-2 relative z-20">
                 <div className="w-1.5 h-10 bg-gradient-to-b from-emerald-500 to-blue-500 rounded-full shadow-lg"></div>
              </div>

              {/* Dropoff Stage */}
              <div className="glass rounded-[2.5rem] p-8 border-white/20 shadow-premium relative overflow-hidden group">
                 <div className="absolute top-0 left-0 w-1.5 h-full bg-blue-500"></div>
                 <div className="flex items-start gap-5">
                    <div className="w-12 h-12 rounded-2xl bg-blue-600 text-white flex items-center justify-center shrink-0 shadow-lg group-hover:-rotate-6 transition-transform">
                       <Navigation size={24} />
                    </div>
                    <div className="flex-1">
                       <label className="text-[10px] font-black uppercase tracking-widest text-blue-600 mb-2 block tracking-[0.2em]">Destination</label>
                       {dropoff ? (
                          <div className="flex items-center justify-between">
                             <div className="font-black text-2xl text-charcoal-900 tracking-tighter leading-tight truncate max-w-[200px]">{dropoff.name}</div>
                             <button onMouseDown={() => setDropoff(null)} className="text-[10px] font-black uppercase tracking-widest bg-blue-500/10 text-blue-700 px-3 py-1.5 rounded-xl hover:bg-blue-600 hover:text-white transition-all">Change</button>
                          </div>
                       ) : (
                          <div className="relative">
                             <input 
                                className={`w-full bg-transparent border-none p-0 font-black text-2xl text-charcoal-900 placeholder:text-charcoal-200 outline-none tracking-tighter leading-tight ${!pickup ? 'opacity-30 pointer-events-none' : ''}`}
                                placeholder="Deliver to..."
                                value={searchInputs.dropoff}
                                onChange={(e) => handleSearchChange(e.target.value, 'dropoff')}
                                autoComplete="off"
                             />
                             <div className="absolute right-0 top-1/2 -translate-y-1/2">
                                {isResolvingLink.dropoff ? <Loader2 size={18} className="animate-spin text-blue-600" /> : <button onMouseDown={() => useCurrentLocation('dropoff')} className="text-blue-300 hover:text-blue-600 transition-colors"><MapIcon size={22} /></button>}
                             </div>
                             {suggestions.dropoff.length > 0 && (
                                <div className="absolute top-full left-0 right-0 mt-4 bg-white rounded-[2rem] shadow-premium border border-gray-100 overflow-hidden z-[200] animate-in slide-in-from-top-4">
                                   {suggestions.dropoff.map((loc, i) => (
                                      <button key={i} onMouseDown={() => handleSelectSuggestion(loc, 'dropoff')} className="w-full px-6 py-4 text-left hover:bg-blue-50 border-b border-gray-50 last:border-0 flex items-center gap-3 active:bg-blue-100 group transition-colors">
                                         <div className="w-10 h-10 bg-blue-50 rounded-xl flex items-center justify-center text-blue-600 group-hover:scale-110 transition-transform"><Search size={18} /></div>
                                         <div className="flex-1 truncate font-black text-charcoal-900">{loc.name}</div>
                                      </button>
                                   ))}
                                </div>
                             )}
                          </div>
                       )}
                    </div>
                 </div>
              </div>

              {isStep1Valid && (
                   <div className="mt-8">
                     <MiniRouteMap pickup={pickup.coords} dropoff={dropoff.coords} />
                     <div className="mt-6 flex items-center justify-between px-4">
                        <div className="flex items-center gap-3">
                           <div className="px-3 py-1 bg-charcoal-900 text-white rounded-lg font-black text-xs tracking-widest">{distanceKm} KM</div>
                           <div className="text-[10px] font-black uppercase text-charcoal-400 tracking-widest">Route Accuracy 99%</div>
                        </div>
                        <div className="text-right">
                           <div className="text-[10px] font-black uppercase text-emerald-600 tracking-widest mb-1">Est. Fare</div>
                           <div className="text-2xl font-black text-emerald-800 tracking-tighter italic">₦{estimatedPrice.toLocaleString()}</div>
                        </div>
                     </div>
                   </div>
              )}

              <div className="pt-8">
                <button 
                  disabled={!isStep1Valid}
                  onClick={() => setStep(2)}
                  className="w-full py-6 rounded-[2.5rem] bg-charcoal-900 text-white font-black text-2xl flex items-center justify-center gap-4 transition-all hover:bg-black hover:shadow-glow/20 active:scale-95 disabled:bg-white/10 disabled:text-charcoal-600 disabled:shadow-none shadow-premium h-20"
                >
                  Confirm Route <ChevronRight size={32} />
                </button>
              </div>
            </div>
          )}

        {/* ─── STEP 2: SHIPMENT ──────────────────────────────────────────────── */}
        {step === 2 && (
          <div className="space-y-6 animate-in fade-in slide-in-from-right-8 duration-700">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  
                  {/* Vehicle Choice Stage */}
                  <div className="glass rounded-[2.5rem] p-8 border-white/20 shadow-premium flex flex-col group relative overflow-hidden">
                      <div className="absolute top-0 left-0 w-1.5 h-full bg-emerald-500"></div>
                      <label className="text-[10px] font-black uppercase tracking-[0.25em] text-emerald-600 mb-8 block">Vehicle Class</label>
                      <div className="space-y-4 flex-1">
                          {[
                              { id: 'bike', icon: '🏍️', label: 'Bike Terminal', desc: 'Standard city delivery' },
                          ].map(v => (
                              <button
                                  key={v.id}
                                  onClick={() => setVehicleType(v.id)}
                                  className={`w-full p-6 rounded-3xl border-2 transition-all flex items-center justify-between group/btn ${vehicleType === v.id ? 'border-emerald-500 bg-emerald-500/10' : 'border-white/50 bg-white/50 text-charcoal-400'}`}
                              >
                                  <div className="flex items-center gap-5">
                                      <div className={`text-4xl transition-transform group-hover/btn:scale-110 ${vehicleType === v.id ? 'grayscale-0' : 'grayscale'}`}>{v.icon}</div>
                                      <div className="text-left">
                                          <div className={`font-black text-xl tracking-tight leading-none mb-1 ${vehicleType === v.id ? 'text-charcoal-900' : 'text-charcoal-400'}`}>{v.label}</div>
                                          <div className="text-[10px] font-bold text-emerald-500 uppercase tracking-widest">{v.desc}</div>
                                      </div>
                                  </div>
                                  {vehicleType === v.id && (
                                     <div className="w-8 h-8 bg-emerald-600 text-white rounded-full flex items-center justify-center shadow-lg border-2 border-white">
                                        <Check size={16} className="stroke-[3]" />
                                     </div>
                                  )}
                              </button>
                          ))}
                      </div>
                  </div>

                  {/* Cargo Size Stage */}
                  <div className="glass rounded-[2.5rem] p-8 border-white/20 shadow-premium relative overflow-hidden">
                      <div className="absolute top-0 left-0 w-1.5 h-full bg-blue-500"></div>
                      <label className="text-[10px] font-black uppercase tracking-[0.25em] text-blue-600 mb-8 block">Cargo Scale</label>
                      
                      <div className="grid grid-cols-2 gap-3 mb-8">
                          {['Pouch', 'Small', 'Medium', 'Large'].map(sz => (
                              <button
                                  key={sz}
                                  onClick={() => setSize(sz)}
                                  className={`py-5 rounded-2xl border-2 font-black text-sm tracking-widest uppercase transition-all ${size === sz ? 'border-blue-500 bg-blue-500/10 text-blue-700 shadow-inner' : 'bg-white/50 border-white/20 text-charcoal-400 hover:bg-white'}`}
                              >
                                  {sz}
                              </button>
                          ))}
                      </div>

                      <div className="relative">
                         <label className="text-[10px] font-black uppercase tracking-[0.2em] text-charcoal-400 mb-3 block">Category</label>
                         <div className="relative">
                            <select 
                                value={category}
                                onChange={(e) => setCategory(e.target.value)}
                                className="w-full bg-white/50 backdrop-blur-md border-2 border-white/50 rounded-2xl px-6 py-4 font-black text-charcoal-900 outline-none focus:border-blue-500 transition-all appearance-none tracking-tight text-lg"
                            >
                                <option value="">Select Item Category...</option>
                                <option value="Electronics">Electronics</option>
                                <option value="Fabric">Fabric / Clothes</option>
                                <option value="Food">Food / Snacks</option>
                                <option value="Documents">Documents</option>
                                <option value="Fragile">Fragile Items</option>
                                <option value="Other">Other</option>
                            </select>
                            <div className="absolute right-6 top-1/2 -translate-y-1/2 pointer-events-none text-blue-500">
                               <Sparkles size={20} />
                            </div>
                         </div>
                      </div>
                  </div>
              </div>

              {/* Stitched Price Preview */}
              <div className="bg-charcoal-900 rounded-[3rem] p-8 text-white flex items-center justify-between shadow-premium relative overflow-hidden group">
                  <div className="absolute top-0 right-0 w-64 h-64 bg-emerald-500/20 rounded-full blur-[80px] -mr-32 -mt-32 transition-all"></div>
                  <div className="relative z-10">
                      <div className="flex items-center gap-2 mb-2">
                         <Coins size={16} className="text-emerald-400" />
                         <span className="text-[10px] font-black uppercase tracking-[0.3em] text-emerald-400/70">Calculated Estimate</span>
                      </div>
                      <div className="text-5xl font-black tracking-tighter italic">₦{estimatedPrice.toLocaleString()}</div>
                  </div>
                  <button 
                      disabled={!isStep2Valid}
                      onClick={() => setStep(3)}
                      className="bg-emerald-500 hover:bg-emerald-400 text-white h-20 px-10 rounded-[2rem] font-black text-xl transition-all shadow-glow active:scale-95 disabled:opacity-20 disabled:scale-100 flex items-center gap-3"
                  >
                      Configure Final <ChevronRight size={28} />
                  </button>
              </div>
          </div>
        )}

        {/* ─── STEP 3: DETAILS ───────────────────────────────────────────────── */}
        {step === 3 && (
          <div className="space-y-6 animate-in fade-in slide-in-from-right-8 duration-700 pb-12">
              <div className="glass rounded-[2.5rem] p-8 border-white/20 shadow-premium flex flex-col gap-8 relative overflow-hidden">
                  <div className="absolute top-0 left-0 w-1.5 h-full bg-charcoal-900"></div>
                  
                  {/* Receiver Stage */}
                  <div>
                      <label className="text-[10px] font-black uppercase tracking-[0.25em] text-charcoal-500 mb-6 block">Recipient Identity</label>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                          <input 
                              className="w-full bg-white/50 border-2 border-white/50 focus:border-charcoal-900 rounded-2xl px-6 py-4 font-black text-charcoal-900 outline-none transition-all placeholder:text-charcoal-300 shadow-inner"
                              placeholder="Full Name"
                              value={receiver.name}
                              onChange={e => setReceiver({...receiver, name: e.target.value})}
                          />
                          <input 
                              className="w-full bg-white/50 border-2 border-white/50 focus:border-charcoal-900 rounded-2xl px-6 py-4 font-black text-charcoal-900 outline-none transition-all placeholder:text-charcoal-300 shadow-inner"
                              placeholder="Phone Line"
                              type="tel"
                              value={receiver.phone}
                              onChange={e => setReceiver({...receiver, phone: e.target.value})}
                          />
                      </div>
                  </div>

                  {/* Fare Architecture */}
                  <div className="border-t border-charcoal-100 pt-8">
                      <label className="text-[10px] font-black uppercase tracking-[0.25em] text-charcoal-500 mb-6 block">Mission Intensity</label>
                      <div className="space-y-3">
                          {/* Standard */}
                          <button onClick={() => setFareType('standard')} className={`w-full p-6 rounded-[2rem] border-2 text-left transition-all flex items-center justify-between group ${fareType === 'standard' ? 'border-emerald-500 bg-emerald-500/10' : 'border-white/50 bg-white/50'}`}>
                              <div>
                                  <div className={`font-black text-xl tracking-tight ${fareType === 'standard' ? 'text-charcoal-900' : 'text-charcoal-400'}`}>Standard Protocol</div>
                                  <div className="text-[10px] font-bold text-charcoal-400 uppercase tracking-widest mt-1">Balanced • Reliable</div>
                              </div>
                              <div className={`font-black text-2xl italic tracking-tighter ${fareType === 'standard' ? 'text-emerald-700' : 'text-charcoal-300'}`}>₦{estimatedPrice.toLocaleString()}</div>
                          </button>

                          {/* Express */}
                          <button onClick={() => setFareType('express')} className={`w-full p-6 rounded-[2rem] border-2 text-left transition-all flex items-center justify-between group ${fareType === 'express' ? 'border-emerald-500 bg-emerald-500/10' : 'border-white/50 bg-white/50'}`}>
                              <div>
                                  <div className={`font-black text-xl tracking-tight ${fareType === 'express' ? 'text-charcoal-900' : 'text-charcoal-400'}`}>Priority Express</div>
                                  <div className="text-[10px] font-bold text-emerald-600 uppercase tracking-widest mt-1">Instant Match • Direct</div>
                              </div>
                              <div className={`font-black text-2xl italic tracking-tighter ${fareType === 'express' ? 'text-emerald-700' : 'text-charcoal-300'}`}>₦{(Math.ceil(estimatedPrice * 1.3 / 50) * 50).toLocaleString()}</div>
                          </button>

                          {/* Negotiate */}
                          <div className={`p-6 rounded-[2rem] border-2 transition-all ${fareType === 'offer' ? 'border-charcoal-900 bg-charcoal-900 text-white shadow-premium' : 'border-white/50 bg-white/50'}`}>
                              <button onClick={() => setFareType('offer')} className="w-full flex items-center justify-between text-left mb-4">
                                  <div className="font-black text-xl tracking-tight">Strike a Deal</div>
                                  <div className="text-[10px] font-black uppercase tracking-widest opacity-60">Custom Bid</div>
                              </button>
                              {fareType === 'offer' && (
                                  <div className="relative animate-in slide-in-from-top-2">
                                      <span className="absolute left-6 top-1/2 -translate-y-1/2 font-black text-emerald-400 text-xl">₦</span>
                                      <input 
                                          type="number" 
                                          value={customOffer}
                                          onChange={e => setCustomOffer(e.target.value)}
                                          placeholder="Offer amount..."
                                          className="w-full bg-white/10 border border-white/20 rounded-2xl py-4 pl-12 pr-6 font-black text-white outline-none focus:border-emerald-400 transition-all text-xl"
                                      />
                                  </div>
                              )}
                          </div>
                      </div>
                  </div>

                  {/* Voice Stitch */}
                  <div className="border-t border-charcoal-100 pt-8">
                      <div className="flex items-center justify-between mb-6">
                          <label className="text-[10px] font-black uppercase tracking-[0.25em] text-charcoal-500">Audio Directive</label>
                          {voiceNoteUrl && <button onClick={deleteRecording} className="text-red-500 text-[10px] font-black uppercase tracking-widest hover:underline">Revoke Memo</button>}
                      </div>
                      
                      {!voiceNoteUrl ? (
                          <button 
                              onClick={toggleRecording}
                              className={`w-full py-8 rounded-[2.5rem] border-2 border-dashed flex items-center justify-center gap-5 transition-all ${isRecording ? 'border-red-500 bg-red-50 text-red-600 animate-pulse' : 'border-white/50 bg-white/20 hover:border-charcoal-400 text-charcoal-400'}`}
                          >
                              <div className={`w-14 h-14 rounded-2xl flex items-center justify-center shadow-lg ${isRecording ? 'bg-red-500 text-white' : 'bg-white text-charcoal-400'}`}>
                                  {isRecording ? <Square size={24} className="fill-current" /> : <Mic size={28} />}
                              </div>
                              <div className="text-left">
                                 <div className="font-black text-lg tracking-tight leading-none mb-1">{isRecording ? `Recording...` : 'Add Voice Memo'}</div>
                                 <div className="text-[10px] font-bold uppercase tracking-widest">{isRecording ? `${recordingTime}s Elapsed` : 'Optional instructions'}</div>
                              </div>
                          </button>
                      ) : (
                          <div className="bg-emerald-600 rounded-[2.5rem] p-6 flex items-center gap-5 shadow-premium border border-white/20">
                              <button 
                                  onClick={handleTogglePlayback}
                                  className={`w-14 h-14 rounded-2xl flex items-center justify-center shadow-lg transition-all active:scale-90 ${isPlayingVoice ? 'bg-white text-emerald-600' : 'bg-emerald-700 text-white'}`}
                              >
                                  {isPlayingVoice ? <Square size={20} className="fill-current" /> : <Play size={24} className="ml-1" fill="currentColor" />}
                              </button>
                              <div className="flex-1">
                                  <div className="text-white font-black text-lg tracking-tight leading-none mb-2">{isPlayingVoice ? 'Playing Memo...' : 'Memo Stitched'}</div>
                                  <div className="flex gap-1.5">
                                      {[1,2,3,4,5,6,7,8,9,10,11,12].map(i => (
                                          <div key={i} className={`h-1.5 flex-1 rounded-full ${isPlayingVoice ? 'bg-white animate-pulse' : 'bg-emerald-800'}`} style={{ animationDelay: `${i * 0.05}s` }} />
                                      ))}
                                  </div>
                              </div>
                              <div className="px-4 py-2 bg-emerald-700/50 rounded-xl text-[10px] font-black text-white uppercase tracking-widest">
                                  {isPlayingVoice ? 'PAUSE' : 'READY'}
                              </div>
                          </div>
                      )}
                  </div>
              </div>

              {/* Final Stitch Action */}
              <div className="space-y-4">
                  <div className="bg-charcoal-900 rounded-[3rem] p-10 text-white relative overflow-hidden shadow-[0_40px_70px_-15px_rgba(0,0,0,0.6)]">
                       <div className="absolute bottom-0 right-0 w-48 h-48 bg-emerald-500/10 rounded-full translate-x-12 translate-y-12"></div>
                       <div className="flex justify-between items-end relative z-10">
                          <div>
                              <div className="flex items-center gap-2 mb-2 opacity-50">
                                 <Truck size={14} />
                                 <span className="text-[10px] font-black uppercase tracking-[0.25em]">Manifest Summary</span>
                              </div>
                              <div className="text-6xl font-black tracking-tighter italic mb-2">₦{estimatedPrice.toLocaleString()}</div>
                              <div className="text-[10px] font-bold uppercase tracking-widest opacity-40">{distanceKm} KM Mission • {vehicleType} Carrier</div>
                          </div>
                          <button 
                              disabled={!isStep3Valid || isSubmitting}
                              onClick={handleSubmitOrder}
                              className="w-24 h-24 bg-emerald-500 hover:bg-emerald-400 rounded-[2rem] flex flex-col items-center justify-center gap-1 shadow-glow active:scale-95 transition-all text-white disabled:opacity-10"
                          >
                              {isSubmitting ? (
                                  <Loader2 size={32} className="animate-spin" />
                              ) : (
                                  <>
                                      <div className="font-black text-3xl italic tracking-tighter">GO</div>
                                      <span className="text-[9px] font-black uppercase tracking-widest">Dispatch</span>
                                  </>
                              )}
                          </button>
                       </div>
                  </div>
                  <div className="flex items-center justify-center gap-3 text-center px-10">
                      <ShieldCheck size={18} className="text-emerald-500" />
                      <span className="text-[10px] font-black uppercase tracking-[0.2em] text-charcoal-400">Logistics protocol secured. Awaiting driver bid.</span>
                  </div>
              </div>
          </div>
        )}
        </section>

        {/* Modal Engines */}
        {activeModal && (
            <MapModal 
                isOpen={true}
                onClose={() => { setActiveModal(null); setMapTarget(null); }}
                onConfirm={handleConfirmLocation}
                initialLocation={mapTarget}
                title={activeModal === 'pickup' ? "Confirm Pick-up Point" : "Confirm Drop-off Point"}
            />
        )}

      </div>
    </main>
  );
}
