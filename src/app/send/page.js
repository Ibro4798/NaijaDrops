"use client";

import { useState, useEffect, useRef, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import dynamic from 'next/dynamic';
import { createClient } from '@/utils/supabase/client';
import { getReliableLocation } from '@/utils/geolocation';
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
            const locData = {
                name: data.resolvedUrl.includes('google.com') ? 'Google Maps Location' : 
                      data.resolvedUrl.includes('apple.com') ? 'Apple Maps Location' : 'Link Location',
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
    const location = await getReliableLocation();
    if (location) {
      setMapTarget({ coords: { lat: location.lat, lng: location.lng }, name: 'Current Location' });
      setActiveModal(slot);
    }
    setGpsStatus({ slot: null, loading: false });
  };

  // ─── Record Logic ──────────────────────────────────────────────────────────
  const toggleRecording = async () => {
    if (isRecording) {
      mediaRecorderRef.current?.stop();
      clearInterval(timerRef.current);
      setIsRecording(false);
      return;
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

  const deleteRecording = () => {
    setVoiceNoteBlob(null);
    setVoiceNoteUrl(null);
    setShowVoiceRecorder(false);
  };

  // ─── Execution ─────────────────────────────────────────────────────────────
  const handleSubmitOrder = async () => {
    setIsSubmitting(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { router.push('/login'); return; }

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
        vehicle_type: vehicleType,
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
    <main className="bg-charcoal-50 min-h-[100dvh] pt-[calc(4.5rem+var(--safe-top))] sm:pt-[calc(6rem+var(--safe-top))] pb-[calc(5rem+var(--safe-bottom))] px-4">
      <div className="max-w-2xl mx-auto">
        
        {/* Breadcrumb / Step Indicator */}
        <div className="flex items-center justify-between mb-8 px-2">
            <button onClick={() => step > 1 ? setStep(step - 1) : router.push('/')} className="w-10 h-10 bg-white shadow-sm border border-gray-100 rounded-2xl flex items-center justify-center text-charcoal-700 hover:bg-emerald-50 hover:text-emerald-700 transition-all">
                <ArrowLeft size={18} />
            </button>
            <div className="flex gap-1.5">
                {[1, 2, 3].map(s => (
                    <div key={s} className={`h-1.5 rounded-full transition-all duration-500 ${step === s ? 'w-8 bg-emerald-600' : 'w-4 bg-gray-200'}`} />
                ))}
            </div>
            <div className="text-[10px] font-black uppercase tracking-widest text-charcoal-400">Step {step} of 3</div>
        </div>

        {/* Premium Header Design */}
        <div className="mb-8 text-center relative px-2">
            <h1 className="text-5xl font-black text-charcoal-900 tracking-tight leading-tight">
                {step === 1 ? "Where to?" : step === 2 ? "What are we moving?" : "Final Details"}
            </h1>
            {step === 1 && (
                <p className="text-sm font-bold text-emerald-600 mt-3 uppercase tracking-widest flex items-center justify-center gap-2">
                    <Sparkles size={14} className="animate-pulse" />
                    Drop a pin, search, or paste a link
                </p>
            )}
        </div>

        {/* ─── STEP 1: ROUTE ─────────────────────────────────────────────────── */}
        {step === 1 && (
            <div className="animate-in fade-in slide-in-from-bottom-8 duration-700">
                <div className="bg-white rounded-[2.5rem] p-8 shadow-2xl shadow-charcoal-900/5 border border-gray-100 relative">
                    <div className="absolute top-0 right-0 w-32 h-32 bg-emerald-50 rounded-bl-[4rem] -mr-12 -mt-12 opacity-50"></div>
                    
                    {/* Pickup Field */}
                    <div className="mb-8 relative z-10">
                        <label className="text-[10px] font-black uppercase tracking-widest text-emerald-600 mb-3 block">From (Pickup)</label>
                        {pickup ? (
                            <div className="bg-emerald-50/50 p-4 rounded-2xl border border-emerald-100 flex items-center justify-between group">
                                <div className="flex items-center gap-3">
                                    <div className="w-10 h-10 bg-white rounded-xl flex items-center justify-center text-emerald-600 shadow-sm border border-emerald-100/50 group-hover:scale-105 transition-transform"><MapPin size={20} /></div>
                                    <div className="font-bold text-emerald-900 truncate max-w-[180px] text-sm">{pickup.name}</div>
                                </div>
                                <button onMouseDown={() => setPickup(null)} className="text-emerald-600 font-black text-[10px] uppercase tracking-widest bg-emerald-500/10 px-3 py-1.5 rounded-lg hover:bg-emerald-500 hover:text-white transition-all active:scale-95">Change</button>
                            </div>
                        ) : (
                            <div className="relative group">
                                <input 
                                    className="w-full bg-charcoal-50 border-2 border-transparent focus:border-emerald-500 rounded-2xl px-5 py-4 font-bold text-charcoal-900 outline-none transition-all placeholder:text-gray-400 pr-12 shadow-inner"
                                    placeholder="Search location or paste link..."
                                    value={searchInputs.pickup}
                                    onChange={(e) => handleSearchChange(e.target.value, 'pickup')}
                                    inputMode="search"
                                    autoComplete="off"
                                />
                                <div className="absolute right-4 top-1/2 -translate-y-1/2 flex items-center gap-2">
                                    {isResolvingLink.pickup ? (
                                        <Loader2 size={18} className="animate-spin text-emerald-600" />
                                    ) : (
                                        <button onMouseDown={() => useCurrentLocation('pickup')} className="text-charcoal-300 hover:text-emerald-600 transition-colors p-1 active:scale-90" title="Use current location">
                                            {gpsStatus.loading && gpsStatus.slot === 'pickup' ? <Loader2 size={18} className="animate-spin" /> : <Navigation size={20} />}
                                        </button>
                                    )}
                                </div>
                                
                                {linkError.pickup && (
                                    <div className="absolute top-full left-0 right-0 mt-1 px-1 text-[10px] font-bold text-red-500 animate-in fade-in slide-in-from-top-1">
                                        ❌ {linkError.pickup}
                                    </div>
                                )}
                                
                                {suggestions.pickup.length > 0 && (
                                    <div className="absolute top-[105%] left-0 right-0 bg-white rounded-[2rem] shadow-[0_25px_60px_rgba(0,0,0,0.2)] border border-emerald-100 overflow-hidden z-[100] animate-in slide-in-from-top-2 ring-4 ring-emerald-500/5">
                                        <div className="p-3 bg-emerald-50/50 border-b border-emerald-100 text-[10px] font-black text-emerald-600 uppercase tracking-widest pl-5">Search Results</div>
                                        <div className="max-h-64 overflow-y-auto custom-scrollbar">
                                            {suggestions.pickup.map((loc, i) => (
                                                <button key={i} onMouseDown={() => handleSelectSuggestion(loc, 'pickup')} className="w-full px-5 py-4 text-left hover:bg-emerald-50 border-b border-gray-50 last:border-0 flex items-center gap-3 transition-colors active:bg-emerald-100 group">
                                                    <div className="w-10 h-10 bg-white border border-emerald-100/50 rounded-xl flex items-center justify-center text-emerald-600 shadow-sm group-hover:scale-110 transition-transform"><Search size={16} /></div>
                                                    <div className="min-w-0 flex-1">
                                                        <div className="truncate font-black text-charcoal-900 text-base">{loc.name}</div>
                                                        <div className="text-[10px] font-bold text-emerald-600 uppercase tracking-tight truncate opacity-70">{loc.area || 'Kano Area'}</div>
                                                    </div>
                                                    {loc.isWeb && <div className="text-[9px] font-black bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-lg tracking-widest border border-emerald-200">MAPS</div>}
                                                </button>
                                            ))}
                                        </div>
                                    </div>
                                )}
                            </div>
                        )}


                    </div>

                    {/* Dropoff Field */}
                    <div className="relative z-10">
                        <label className="text-[10px] font-black uppercase tracking-widest text-charcoal-400 mb-3 block">To (Destination)</label>
                        {dropoff ? (
                            <div className="bg-charcoal-50 p-4 rounded-2xl border border-charcoal-100 flex items-center justify-between group">
                                <div className="flex items-center gap-3">
                                    <div className="w-10 h-10 bg-white rounded-xl flex items-center justify-center text-charcoal-800 shadow-sm border border-gray-100 group-hover:rotate-6 transition-transform"><MapPin size={20} /></div>
                                    <div className="font-bold text-charcoal-900 truncate max-w-[180px] text-sm">{dropoff.name}</div>
                                </div>
                                <button onMouseDown={() => setDropoff(null)} className="text-charcoal-500 font-black text-[10px] uppercase tracking-widest bg-gray-200 px-3 py-1.5 rounded-lg hover:bg-charcoal-900 hover:text-white transition-all active:scale-95">Change</button>
                            </div>
                        ) : (
                            <div className="relative group">
                                <input 
                                    className={`w-full bg-charcoal-50 border-2 border-transparent focus:border-emerald-500 rounded-2xl px-5 py-4 font-bold text-charcoal-900 outline-none transition-all placeholder:text-gray-400 pr-12 shadow-inner ${!pickup ? 'opacity-50 pointer-events-none' : ''}`}
                                    placeholder="Search landmark or street..."
                                    value={searchInputs.dropoff}
                                    onChange={(e) => handleSearchChange(e.target.value, 'dropoff')}
                                    inputMode="search"
                                    autoComplete="off"
                                />
                                <div className="absolute right-4 top-1/2 -translate-y-1/2 flex items-center gap-2">
                                    {isResolvingLink.dropoff ? (
                                        <Loader2 size={18} className="animate-spin text-emerald-600" />
                                    ) : (
                                        <button onMouseDown={() => useCurrentLocation('dropoff')} className="text-charcoal-300 hover:text-emerald-600 transition-colors p-1 active:scale-90" title="Use current location">
                                            <MapIcon size={18} />
                                        </button>
                                    )}
                                </div>
                                {linkError.dropoff && (
                                    <div className="absolute top-full left-0 right-0 mt-1 px-1 text-[10px] font-bold text-red-500 animate-in fade-in slide-in-from-top-1">
                                        ❌ {linkError.dropoff}
                                    </div>
                                )}
                                {suggestions.dropoff.length > 0 && (
                                    <div className="absolute top-[105%] left-0 right-0 bg-white rounded-[2rem] shadow-[0_25px_60px_rgba(0,0,0,0.2)] border border-emerald-100 overflow-hidden z-[100] animate-in slide-in-from-top-2 ring-4 ring-emerald-500/5">
                                        <div className="p-3 bg-emerald-50/50 border-b border-emerald-100 text-[10px] font-black text-emerald-600 uppercase tracking-widest pl-5">Nearby Locations</div>
                                        <div className="max-h-64 overflow-y-auto custom-scrollbar">
                                            {suggestions.dropoff.map((loc, i) => (
                                                <button key={i} onMouseDown={() => handleSelectSuggestion(loc, 'dropoff')} className="w-full px-5 py-4 text-left hover:bg-emerald-50 border-b border-gray-50 last:border-0 flex items-center gap-3 transition-colors active:bg-emerald-100 group">
                                                    <div className="w-10 h-10 bg-white border border-emerald-100/50 rounded-xl flex items-center justify-center text-emerald-600 shadow-sm group-hover:scale-110 transition-transform"><Search size={16} /></div>
                                                    <div className="min-w-0 flex-1">
                                                        <div className="truncate font-black text-charcoal-900 text-base">{loc.name}</div>
                                                        <div className="text-[10px] font-bold text-emerald-600 uppercase tracking-tight truncate opacity-70">{loc.area || 'Kano Area'}</div>
                                                    </div>
                                                </button>
                                            ))}
                                        </div>
                                    </div>
                                )}
                            </div>
                        )}


                    </div>
                    
                    {/* Mini Route Map Preview */}
                    {isStep1Valid && (
                        <div className="mt-8 animate-in zoom-in-95 duration-500">
                             <MiniRouteMap 
                                pickup={pickup.coords} 
                                dropoff={dropoff.coords} 
                             />
                             <div className="mt-4 flex items-center justify-between px-2">
                                <div className="flex items-center gap-2">
                                    <div className="w-8 h-8 bg-charcoal-900 text-white rounded-lg flex items-center justify-center font-black text-xs">{distanceKm}k</div>
                                    <div className="text-[10px] font-black uppercase tracking-widest text-charcoal-400">Total Distance</div>
                                </div>
                                <div className="flex items-center gap-2">
                                    <div className="text-[10px] font-black uppercase tracking-widest text-emerald-600">Est. Base Fare</div>
                                    <div className="text-lg font-black text-emerald-700">₦{estimatedPrice.toLocaleString()}</div>
                                </div>
                             </div>
                        </div>
                    )}
                </div>

                <button 
                    disabled={!isStep1Valid}
                    onClick={() => setStep(2)}
                    className="w-full mt-8 py-6 bg-emerald-700 hover:bg-emerald-800 text-white font-black rounded-[2rem] shadow-xl shadow-emerald-700/20 flex items-center justify-center gap-3 transition-all transform hover:scale-[1.02] active:scale-95 disabled:opacity-50 disabled:scale-100 disabled:shadow-none h-20"
                >
                    Continue to Shipment <ChevronRight size={24} />
                </button>
            </div>
        )}

        {/* ─── STEP 2: SHIPMENT ──────────────────────────────────────────────── */}
        {step === 2 && (
            <div className="animate-in fade-in slide-in-from-right-8 duration-500">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    
                    {/* Vehicle Choice */}
                    <div className="bg-white rounded-[2.5rem] p-8 shadow-xl border border-gray-50 flex flex-col">
                        <label className="text-[10px] font-black uppercase tracking-widest text-charcoal-400 mb-6 block text-center">Select Carrier Type</label>
                        <div className="space-y-4 flex-1">
                            {[
                                { id: 'bike', icon: '🏍️', label: 'Bike', price: 'Standard' },
                            ].map(v => (
                                <button
                                    key={v.id}
                                    onClick={() => setVehicleType(v.id)}
                                    className={`w-full p-4 rounded-2xl border-2 transition-all flex items-center justify-between ${vehicleType === v.id ? 'border-emerald-500 bg-emerald-50' : 'border-charcoal-50 bg-charcoal-50/30 font-medium'}`}
                                >
                                    <div className="flex items-center gap-4">
                                        <div className="text-3xl">{v.icon}</div>
                                        <div className="text-left">
                                            <div className="font-black text-charcoal-900">{v.label}</div>
                                            <div className="text-[10px] font-bold text-emerald-600 uppercase tracking-widest">{v.price}</div>
                                        </div>
                                    </div>
                                    {vehicleType === v.id && <div className="w-6 h-6 bg-emerald-500 text-white rounded-full flex items-center justify-center shadow-sm"><Check size={14} /></div>}
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Size & Type */}
                    <div className="bg-white rounded-[2.5rem] p-8 shadow-xl border border-gray-50">
                        <label className="text-[10px] font-black uppercase tracking-widest text-charcoal-400 mb-6 block text-center">Package Size</label>
                        <div className="grid grid-cols-2 gap-3 mb-6">
                            {['Pouch', 'Small', 'Medium', 'Large'].map(sz => (
                                <button
                                    key={sz}
                                    onClick={() => setSize(sz)}
                                    className={`py-4 rounded-2xl border-2 font-black text-sm transition-all ${size === sz ? 'border-emerald-500 bg-emerald-50 text-emerald-700' : 'bg-charcoal-50/30 border-charcoal-50 text-charcoal-500'}`}
                                >
                                    {sz}
                                </button>
                            ))}
                        </div>

                        <label className="text-[10px] font-black uppercase tracking-widest text-charcoal-400 mb-4 block text-center">Category</label>
                        <select 
                            value={category}
                            onChange={(e) => setCategory(e.target.value)}
                            className="w-full bg-charcoal-50 border-2 border-charcoal-50 rounded-2xl px-5 py-4 font-bold text-charcoal-900 outline-none focus:border-emerald-500 transition-all appearance-none text-center"
                        >
                            <option value="">Choose category...</option>
                            <option value="Electronics">Electronics</option>
                            <option value="Fabric">Fabric / Clothes</option>
                            <option value="Food">Food / Snacks</option>
                            <option value="Documents">Documents</option>
                            <option value="Fragile">Fragile Items</option>
                            <option value="Other">Other</option>
                        </select>
                    </div>
                </div>

                <div className="mt-8 bg-charcoal-900 rounded-3xl p-6 text-white flex items-center justify-between shadow-2xl relative overflow-hidden h-24">
                    <div className="absolute top-0 right-0 w-24 h-24 bg-white/5 rounded-full -mr-8 -mt-8"></div>
                    <div>
                        <div className="text-[10px] font-black uppercase tracking-widest opacity-50 mb-1">Live Estimate</div>
                        <div className="text-3xl font-black">₦{estimatedPrice.toLocaleString()}</div>
                    </div>
                    <button 
                        disabled={!isStep2Valid}
                        onClick={() => setStep(3)}
                        className="bg-emerald-500 hover:bg-emerald-600 text-white h-14 px-8 rounded-2xl font-black transition-all shadow-lg active:scale-95 disabled:opacity-30 disabled:scale-100 flex items-center gap-2"
                    >
                        Next Step <ChevronRight size={18} />
                    </button>
                </div>
            </div>
        )}

        {/* ─── STEP 3: DETAILS ───────────────────────────────────────────────── */}
        {step === 3 && (
            <div className="animate-in fade-in slide-in-from-right-8 duration-500">
                <div className="bg-white rounded-[2.5rem] p-8 shadow-xl border border-gray-50 flex flex-col gap-6">
                    
                    {/* Receiver */}
                    <div>
                        <label className="text-[10px] font-black uppercase tracking-widest text-charcoal-400 mb-4 block text-center">Recipient Information</label>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            <input 
                                className="w-full bg-charcoal-50 border-2 border-transparent focus:border-emerald-500 rounded-2xl px-5 py-4 font-bold text-charcoal-900 outline-none transition-all shadow-inner"
                                placeholder="Receiver Name"
                                value={receiver.name}
                                onChange={e => setReceiver({...receiver, name: e.target.value})}
                            />
                            <input 
                                className="w-full bg-charcoal-50 border-2 border-transparent focus:border-emerald-500 rounded-2xl px-5 py-4 font-bold text-charcoal-900 outline-none transition-all shadow-inner"
                                placeholder="Phone Number"
                                type="tel"
                                value={receiver.phone}
                                onChange={e => setReceiver({...receiver, phone: e.target.value})}
                                inputMode="tel"
                                autoComplete="tel"
                            />
                        </div>
                    </div>

                    {/* Price Tiers */}
                    <div className="mt-4 border-t border-gray-100 pt-6">
                        <label className="text-[10px] font-black uppercase tracking-widest text-charcoal-400 mb-4 block text-center">Select Fare Type</label>
                        <div className="space-y-3">
                            {/* Standard */}
                            <button onClick={() => setFareType('standard')} className={`w-full p-4 rounded-2xl border-2 text-left transition-all flex items-center justify-between ${fareType === 'standard' ? 'border-emerald-500 bg-emerald-50' : 'border-charcoal-50 bg-charcoal-50/50'}`}>
                                <div>
                                    <div className="font-bold text-charcoal-900">Standard Delivery</div>
                                    <div className="text-[10px] font-bold text-charcoal-400 uppercase tracking-widest">Reliable • 15-30 mins</div>
                                </div>
                                <div className="font-black text-emerald-700 text-lg">₦{estimatedPrice.toLocaleString()}</div>
                            </button>

                            {/* Express */}
                            <button onClick={() => setFareType('express')} className={`w-full p-4 rounded-2xl border-2 text-left transition-all flex items-center justify-between ${fareType === 'express' ? 'border-emerald-500 bg-emerald-50' : 'border-charcoal-50 bg-charcoal-50/50'}`}>
                                <div>
                                    <div className="font-bold text-charcoal-900">Priority Express</div>
                                    <div className="text-[10px] font-bold text-emerald-600 uppercase tracking-widest">Fastest • Instant Match</div>
                                </div>
                                <div className="font-black text-emerald-700 text-lg">₦{(Math.ceil(estimatedPrice * 1.3 / 50) * 50).toLocaleString()}</div>
                            </button>

                            {/* Negotiate */}
                            <div className={`p-4 rounded-2xl border-2 transition-all ${fareType === 'offer' ? 'border-charcoal-900 bg-charcoal-900 text-white' : 'border-charcoal-50 bg-charcoal-50/50'}`}>
                                <button onClick={() => setFareType('offer')} className="w-full flex items-center justify-between text-left mb-2">
                                    <div className="font-bold">Negotiate My Price</div>
                                    <div className="text-[10px] font-black uppercase opacity-60">Custom</div>
                                </button>
                                {fareType === 'offer' && (
                                    <div className="relative flex items-center mt-2 pb-1">
                                        <span className="absolute left-3 font-black text-emerald-400">₦</span>
                                        <input 
                                            type="number" 
                                            value={customOffer}
                                            onChange={e => setCustomOffer(e.target.value)}
                                            placeholder="Enter your offer"
                                            className="w-full bg-white/10 border border-white/20 rounded-xl py-2 pl-8 pr-3 font-bold text-white outline-none focus:border-emerald-400 transition-all text-sm"
                                            inputMode="numeric"
                                        />
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>

                    {/* Voice Note Section */}
                    <div className="mt-4 border-t border-gray-100 pt-6">
                        <div className="flex items-center justify-between mb-4">
                            <label className="text-[10px] font-black uppercase tracking-widest text-charcoal-400">Voice Instructions (Optional)</label>
                            {voiceNoteUrl && <button onClick={deleteRecording} className="text-red-500 text-[10px] font-black uppercase hover:underline">Discard</button>}
                        </div>
                        
                        {!voiceNoteUrl ? (
                            <button 
                                onClick={toggleRecording}
                                className={`w-full py-6 rounded-[2rem] border-2 border-dashed flex flex-col items-center justify-center gap-2 transition-all ${isRecording ? 'border-red-500 bg-red-50 text-red-500 animate-pulse' : 'border-gray-200 hover:border-emerald-500 text-charcoal-400 hover:text-emerald-700'}`}
                            >
                                <div className={`w-12 h-12 rounded-full flex items-center justify-center shadow-lg ${isRecording ? 'bg-red-500 text-white' : 'bg-white text-charcoal-400'}`}>
                                    {isRecording ? <Square size={20} className="fill-current" /> : <Mic size={24} />}
                                </div>
                                <span className="font-black text-sm uppercase tracking-widest">{isRecording ? `Recording... ${recordingTime}s` : 'Tap to Add Voice Memo'}</span>
                            </button>
                        ) : (
                            <div className="bg-emerald-50 rounded-[2rem] p-4 flex items-center gap-4">
                                <div className="w-10 h-10 bg-white rounded-full flex items-center justify-center text-emerald-600 shadow-sm"><Play size={18} fill="currentColor" /></div>
                                <div className="flex-1 text-emerald-900 font-bold text-xs uppercase tracking-widest">Instruction Saved</div>
                                <div className="px-3 py-1 bg-white rounded-full text-[10px] font-black text-emerald-600">PREVIEW</div>
                            </div>
                        )}
                    </div>


                </div>

                <div className="mt-8 flex flex-col gap-4">
                    <div className="bg-charcoal-900 rounded-[2.5rem] p-8 text-white relative overflow-hidden shadow-2xl">
                         <div className="absolute bottom-0 right-0 w-32 h-32 bg-emerald-500/10 rounded-full translate-x-12 translate-y-12"></div>
                         <div className="flex justify-between items-end relative z-10">
                            <div>
                                <div className="text-[10px] font-black uppercase tracking-widest opacity-40 mb-2">Total Logistics Cost</div>
                                <div className="text-4xl font-black">₦{estimatedPrice.toLocaleString()}</div>
                                <div className="flex items-center gap-2 mt-2 opacity-60">
                                    <Clock size={12} /> <span className="text-[10px] font-bold uppercase tracking-widest">{distanceKm}km Route • {vehicleType}</span>
                                </div>
                            </div>
                            <button 
                                disabled={!isStep3Valid || isSubmitting}
                                onClick={handleSubmitOrder}
                                className="w-20 h-20 bg-emerald-500 hover:bg-emerald-600 rounded-3xl flex flex-col items-center justify-center gap-1 shadow-lg active:scale-95 transition-all text-white disabled:opacity-20 disabled:scale-100"
                            >
                                {isSubmitting ? (
                                    <div className="w-6 h-6 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                                ) : (
                                    <>
                                        <Truck size={24} />
                                        <span className="text-[8px] font-black uppercase tracking-tighter">GO</span>
                                    </>
                                )}
                            </button>
                         </div>
                    </div>
                    <div className="flex items-center justify-center gap-3 text-center px-6">
                        <ShieldCheck size={16} className="text-emerald-600" />
                        <span className="text-[9px] font-black uppercase tracking-widest text-charcoal-400">Payment will be required once a driver bids.</span>
                    </div>
                </div>
            </div>
        )}

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
