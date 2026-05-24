"use client";

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import dynamic from 'next/dynamic';
import { createClient } from '@/utils/supabase/client';
import { getReliableLocation, getCurrentPositionStandard } from '@/utils/geolocation';
import { calculateDistance } from '@/utils/distance';
import { PRICING_RATES } from '@/utils/constants';
import { 
  ArrowLeft, MapPin, Mic, Camera, Package, ShieldCheck, 
  ChevronRight, Search, Navigation, 
  Trash2, Square, Play, Check, Info, Coins, Truck, Clock, 
  Sparkles, Loader2, Map as MapIcon, RotateCcw
} from 'lucide-react';

const MapModal = dynamic(() => import('@/components/MapModal'), { 
  ssr: false,
  loading: () => <div className="fixed inset-0 bg-charcoal-900/80 backdrop-blur-md z-[100] flex items-center justify-center font-black text-emerald-500 uppercase tracking-widest italic animate-pulse">Initializing Map Engine...</div>
});

const MiniRouteMap = dynamic(() => import('@/components/MiniRouteMap'), { ssr: false });

const KANO_LOCATIONS = [
  { name: "Kantin Kwari (Main)", area: "Fagge, Kano", lat: 11.9961, lng: 8.5182 },
  { name: "Sabon Gari Market", area: "Fagge, Kano", lat: 11.9655, lng: 8.5280 },
  { name: "BUK New Campus", area: "Gwarzo Road, Kano", lat: 11.9753, lng: 8.4166 },
  { name: "Nassarawa GRA", area: "Nassarawa, Kano", lat: 12.0022, lng: 8.5167 },
  { name: "Hotoro GRA", area: "Nassarawa, Kano", lat: 12.0375, lng: 8.4762 },
];

export default function CreateDelivery() {
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
  const [submitError, setSubmitError] = useState(null);
  
  const searchTimeoutRef = useRef(null);

  // Pricing Logic
  useEffect(() => {
    if (pickup?.coords && dropoff?.coords) {
      const dist = calculateDistance(
        pickup.coords.lat, pickup.coords.lng,
        dropoff.coords.lat, dropoff.coords.lng
      );
      setDistanceKm(dist.toFixed(1));

      const rate = PRICING_RATES[vehicleType.toUpperCase()] || { base: 500, perKm: 150 };
      const multiplier = (PRICING_RATES.SIZE_MULTIPLIERS && PRICING_RATES.SIZE_MULTIPLIERS[size]) || 1;
      
      let price = (rate.base + (dist * rate.perKm)) * multiplier;
      setEstimatedPrice(Math.ceil(price / 50) * 50);
    } else {
        setEstimatedPrice(0);
        setDistanceKm(0);
    }
  }, [pickup, dropoff, vehicleType, size]);

  const handleSearchChange = (val, slot) => {
    setSearchInputs(prev => ({ ...prev, [slot]: val }));
    if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);
    
    if (val.length < 2) {
      setSuggestions(prev => ({ ...prev, [slot]: [] }));
      return;
    }

    const localResults = KANO_LOCATIONS.filter(loc => 
      loc.name.toLowerCase().includes(val.toLowerCase())
    );
    setSuggestions(prev => ({ ...prev, [slot]: localResults }));

    searchTimeoutRef.current = setTimeout(async () => {
      setIsSearching(prev => ({ ...prev, [slot]: true }));
      try {
        const { getMapboxSuggestions } = await import('@/utils/mapbox');
        const mapboxSugs = await getMapboxSuggestions(val, process.env.NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN);
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
        const location = await getReliableLocation();
        if (location) {
            setMapTarget({ coords: { lat: location.lat, lng: location.lng }, name: 'Current Location' });
            setActiveModal(slot);
        }
    } finally {
        setGpsStatus({ slot: null, loading: false });
    }
  };

  const handleSubmitOrder = async () => {
    setIsSubmitting(true);
    setSubmitError(null);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { router.push('/auth/login'); return; }

      // âœ… FIX: Fetch the vendors.id (FK target) not auth user.id
      const { data: vendorProfile, error: vendorErr } = await supabase
        .from('vendors')
        .select('id')
        .eq('user_id', user.id)
        .single();

      if (vendorErr || !vendorProfile) {
        throw new Error('Vendor profile not found. Please complete your profile setup first.');
      }

      const finalAgreedPrice = fareType === 'offer' 
        ? Number(customOffer) 
        : (fareType === 'express' 
            ? Math.ceil(estimatedPrice * 1.3 / 50) * 50 
            : estimatedPrice);

      const orderData = {
        // âœ… FIX: Use vendorProfile.id (vendors.id) not user.id
        vendor_id: vendorProfile.id,
        pickup_name: pickup.name,
        pickup_lat: pickup.coords.lat,
        pickup_lng: pickup.coords.lng,
        dropoff_name: dropoff.name,
        dropoff_lat: dropoff.coords.lat,
        dropoff_lng: dropoff.coords.lng,
        item_category: category,
        item_size: size,
        // âœ… FIX: Correct column names matching DB schema
        recipient_name: receiver.name,
        recipient_phone: receiver.phone,
        agreed_price: finalAgreedPrice,
        status: 'pending'
      };

      const { data, error } = await supabase.from('orders').insert(orderData).select().single();
      if (error) throw error;
      
      router.push(`/vendor/history`);
    } catch (err) {
      console.error(err);
      setSubmitError(err.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const isStep1Valid = pickup?.coords && dropoff?.coords;
  const isStep2Valid = category && size && vehicleType;
  const isStep3Valid = receiver.name && receiver.phone.length >= 10;

  return (
    <div className="max-w-3xl mx-auto space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-700">
      {/* Visual Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-black text-white tracking-tight font-outfit italic">
            Dispatch <span className="text-emerald-500">Terminal</span>
          </h1>
          <p className="text-charcoal-400 text-sm font-medium">New logistics request for Kano city node.</p>
        </div>
        <div className="flex gap-1">
          {[1, 2, 3].map(s => (
            <div key={s} className={`h-1.5 w-8 rounded-full transition-all duration-500 ${step >= s ? 'bg-emerald-500 shadow-[0_0_10px_rgba(16,185,129,0.5)]' : 'bg-white/10'}`} />
          ))}
        </div>
      </div>

      <section className="space-y-6">
        {step === 1 && (
          <div className="space-y-6 animate-in fade-in slide-in-from-right-8 duration-500">
            {/* Pickup */}
            <div className="bg-white/[0.03] border border-white/10 p-8 rounded-[2.5rem] relative group">
              <div className="absolute top-0 left-0 w-1 h-full bg-emerald-500/50 rounded-l-full"></div>
              <label className="text-[10px] font-black uppercase tracking-[0.3em] text-emerald-500 mb-6 block">Origin Lat/Lng Points</label>
              
              {pickup ? (
                <div className="flex items-center justify-between bg-emerald-500/5 p-5 rounded-2xl border border-emerald-500/20 shadow-inner">
                  <div className="flex items-center gap-4">
                    <div className="w-10 h-10 bg-emerald-500/20 rounded-full flex items-center justify-center text-emerald-500"><MapPin size={20} /></div>
                    <div className="font-black text-white text-lg tracking-tight truncate max-w-[200px]">{pickup.name}</div>
                  </div>
                  <button onClick={() => setPickup(null)} className="text-[10px] font-black text-emerald-500 hover:text-emerald-400 uppercase tracking-widest"><RotateCcw size={16} /></button>
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="relative group/input">
                    <Search className="absolute left-5 top-1/2 -translate-y-1/2 text-charcoal-500 group-focus-within/input:text-emerald-500 transition-colors" size={18} />
                    <input 
                      className="w-full bg-charcoal-900 border border-white/10 rounded-2xl py-4 pl-14 pr-5 text-white font-bold placeholder:text-charcoal-600 focus:outline-none focus:ring-2 focus:ring-emerald-500/50 transition-all"
                      placeholder="Search Kano landmarks..."
                      value={searchInputs.pickup}
                      onChange={(e) => handleSearchChange(e.target.value, 'pickup')}
                    />
                    {suggestions.pickup.length > 0 && (
                      <div className="absolute top-full left-0 right-0 mt-2 bg-charcoal-900 border border-white/10 rounded-2xl overflow-hidden z-[100] shadow-2xl">
                        {suggestions.pickup.map((loc, i) => (
                          <button key={i} onClick={() => handleSelectSuggestion(loc, 'pickup')} className="w-full p-4 text-left hover:bg-white/5 border-b border-white/5 last:border-0 flex items-center gap-3 transition-colors">
                            <MapPin size={14} className="text-emerald-500" />
                            <div className="text-sm font-bold text-white">{loc.name}</div>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                  <button onClick={() => useCurrentLocation('pickup')} className="w-full py-4 bg-white/5 border border-white/5 hover:bg-white/10 rounded-2xl flex items-center justify-center gap-2 text-white font-black text-xs uppercase tracking-widest transition-all active:scale-95">
                    {gpsStatus.slot === 'pickup' ? <Loader2 className="animate-spin" size={16} /> : <Navigation size={16} className="text-emerald-500" />} Pin Current Location
                  </button>
                </div>
              )}
            </div>

            {/* Dropoff */}
            <div className="bg-white/[0.03] border border-white/10 p-8 rounded-[2.5rem] relative group">
              <div className="absolute top-0 left-0 w-1 h-full bg-emerald-500/50 rounded-l-full"></div>
              <label className="text-[10px] font-black uppercase tracking-[0.3em] text-emerald-500 mb-6 block">Destination Vector</label>
              
              {dropoff ? (
                <div className="flex items-center justify-between bg-emerald-500/5 p-5 rounded-2xl border border-emerald-500/20 shadow-inner">
                  <div className="flex items-center gap-4">
                    <div className="w-10 h-10 bg-emerald-500/20 rounded-full flex items-center justify-center text-emerald-500"><MapIcon size={20} /></div>
                    <div className="font-black text-white text-lg tracking-tight truncate max-w-[200px]">{dropoff.name}</div>
                  </div>
                  <button onClick={() => setDropoff(null)} className="text-[10px] font-black text-emerald-500 hover:text-emerald-400 uppercase tracking-widest"><RotateCcw size={16} /></button>
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="relative group/input">
                    <Search className="absolute left-5 top-1/2 -translate-y-1/2 text-charcoal-500 group-focus-within/input:text-emerald-500 transition-colors" size={18} />
                    <input 
                      disabled={!pickup}
                      className="w-full bg-charcoal-900 border border-white/10 rounded-2xl py-4 pl-14 pr-5 text-white font-bold placeholder:text-charcoal-600 focus:outline-none focus:ring-2 focus:ring-emerald-500/50 transition-all disabled:opacity-30"
                      placeholder="Search destination..."
                      value={searchInputs.dropoff}
                      onChange={(e) => handleSearchChange(e.target.value, 'dropoff')}
                    />
                    {suggestions.dropoff.length > 0 && (
                      <div className="absolute top-full left-0 right-0 mt-2 bg-charcoal-900 border border-white/10 rounded-2xl overflow-hidden z-[100] shadow-2xl">
                        {suggestions.dropoff.map((loc, i) => (
                          <button key={i} onClick={() => handleSelectSuggestion(loc, 'dropoff')} className="w-full p-4 text-left hover:bg-white/5 border-b border-white/5 last:border-0 flex items-center gap-3 transition-colors">
                            <MapPin size={14} className="text-emerald-500" />
                            <div className="text-sm font-bold text-white">{loc.name}</div>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                  <button disabled={!pickup} onClick={() => useCurrentLocation('dropoff')} className="w-full py-4 bg-white/5 border border-white/5 hover:bg-white/10 rounded-2xl flex items-center justify-center gap-2 text-white font-black text-xs uppercase tracking-widest transition-all active:scale-95 disabled:opacity-30">
                    {gpsStatus.slot === 'dropoff' ? <Loader2 className="animate-spin" size={16} /> : <Navigation size={16} className="text-emerald-500" />} Pin Destination
                  </button>
                </div>
              )}
            </div>

            {isStep1Valid && (
              <div className="mt-8 bg-charcoal-900/50 p-8 rounded-[3rem] border border-white/5 shadow-2xl space-y-6">
                <div className="h-64 rounded-3xl overflow-hidden border border-white/10">
                   <MiniRouteMap pickup={pickup.coords} dropoff={dropoff.coords} />
                </div>
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-[10px] font-black text-emerald-500 uppercase tracking-widest mb-1">Payload Distance</div>
                    <div className="text-4xl font-black text-white italic tracking-tighter font-outfit">{distanceKm} <span className="text-xl">KM</span></div>
                  </div>
                  <div className="text-right">
                    <div className="text-[10px] font-black text-emerald-500 uppercase tracking-widest mb-1">Estimated Fare</div>
                    <div className="text-4xl font-black text-emerald-400 italic tracking-tighter">â‚¦{estimatedPrice.toLocaleString()}</div>
                  </div>
                </div>
                <button onClick={() => setStep(2)} className="w-full bg-emerald-500 hover:bg-emerald-400 text-charcoal-950 font-black py-5 rounded-2xl flex items-center justify-center gap-2 text-xl italic transition-all active:scale-95 shadow-glow">
                  Initialize Manifest <ChevronRight size={24} strokeWidth={3} />
                </button>
              </div>
            )}
          </div>
        )}

        {step === 2 && (
          <div className="space-y-8 animate-in fade-in slide-in-from-right-8 duration-500">
             <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Cargo Type */}
                <div className="bg-white/[0.03] border border-white/10 p-8 rounded-[2.5rem]">
                   <label className="text-[10px] font-black uppercase tracking-[0.3em] text-emerald-500 mb-6 block">Payload Scale</label>
                   <div className="grid grid-cols-2 gap-2 mb-6">
                      {['Pouch', 'Small', 'Medium', 'Large'].map(sz => (
                        <button key={sz} onClick={() => setSize(sz)} className={`py-3 rounded-xl font-black text-xs uppercase tracking-widest transition-all ${size === sz ? 'bg-emerald-500 text-charcoal-950 shadow-glow' : 'bg-white/5 text-charcoal-500 hover:bg-white/10'}`}>
                          {sz}
                        </button>
                      ))}
                   </div>
                   <div className="relative">
                      <select value={category} onChange={e => setCategory(e.target.value)} className="w-full bg-charcoal-900 border border-white/10 rounded-xl py-4 px-4 text-white font-bold outline-none focus:ring-2 focus:ring-emerald-500 appearance-none">
                        <option value="">Select Category...</option>
                        <option value="Electronics">Electronics</option>
                        <option value="Fashion">Fashion / Clothes</option>
                        <option value="Food">Food / Perishables</option>
                        <option value="Other">General Load</option>
                      </select>
                      <Sparkles className="absolute right-4 top-1/2 -translate-y-1/2 text-charcoal-600 pointer-events-none" size={18} />
                   </div>
                </div>

                {/* Logistics Class */}
                <div className="bg-white/[0.03] border border-white/10 p-8 rounded-[2.5rem]">
                   <label className="text-[10px] font-black uppercase tracking-[0.3em] text-emerald-500 mb-6 block">Vehicle Priority</label>
                   <button onClick={() => setVehicleType('bike')} className={`w-full p-5 rounded-2xl border-2 flex items-center justify-between transition-all ${vehicleType === 'bike' ? 'border-emerald-500 bg-emerald-500/5' : 'border-white/5 bg-white/5 opacity-50'}`}>
                      <div className="text-left">
                        <div className="text-3xl mb-1">ðŸï¸</div>
                        <div className="text-sm font-black text-white uppercase tracking-widest">Motorbike</div>
                      </div>
                      {vehicleType === 'bike' && <Check className="text-emerald-500" strokeWidth={4} />}
                   </button>
                </div>
             </div>

             <div className="bg-charcoal-900/50 p-8 rounded-[3rem] border border-white/5 flex items-center justify-between">
                <div>
                  <div className="text-[10px] font-black text-charcoal-500 uppercase tracking-widest mb-1 italic">Mission Fare</div>
                  <div className="text-5xl font-black text-white italic tracking-tighter">â‚¦{estimatedPrice.toLocaleString()}</div>
                </div>
                <button disabled={!isStep2Valid} onClick={() => setStep(3)} className="bg-emerald-500 hover:bg-emerald-400 disabled:opacity-20 text-charcoal-950 px-10 py-5 rounded-2xl font-black text-xl italic transition-all active:scale-95 h-fit">
                   Finalize <ChevronRight className="inline ml-1" />
                </button>
             </div>
          </div>
        )}

        {step === 3 && (
          <div className="space-y-8 animate-in fade-in slide-in-from-right-8 duration-500">
             <div className="bg-white/[0.03] border border-white/10 p-10 rounded-[3rem] space-y-8">
                <label className="text-[10px] font-black uppercase tracking-[0.3em] text-emerald-500 block">Recipient Protocol</label>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <input className="w-full bg-charcoal-900 border border-white/10 rounded-2xl py-5 px-6 text-white font-bold placeholder:text-charcoal-600 focus:outline-none focus:ring-2 focus:ring-emerald-500" placeholder="Receiver Name" value={receiver.name} onChange={e => setReceiver({...receiver, name: e.target.value})} />
                  <input className="w-full bg-charcoal-900 border border-white/10 rounded-2xl py-5 px-6 text-white font-bold placeholder:text-charcoal-600 focus:outline-none focus:ring-2 focus:ring-emerald-500" placeholder="Contact Phone" value={receiver.phone} onChange={e => setReceiver({...receiver, phone: e.target.value})} />
                </div>

                <div className="space-y-4 pt-4">
                  <label className="text-[10px] font-black uppercase tracking-[0.3em] text-emerald-500 opacity-50 block">Pricing Architecture</label>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <button onClick={() => setFareType('standard')} className={`p-6 rounded-2xl border transition-all text-left ${fareType === 'standard' ? 'border-emerald-500 bg-emerald-500/5' : 'border-white/5 opacity-50'}`}>
                      <div className="font-black text-white uppercase text-xs tracking-widest mb-1 italic">Standard</div>
                      <div className="text-2xl font-black text-white tracking-tighter">â‚¦{estimatedPrice.toLocaleString()}</div>
                    </button>
                    <button onClick={() => setFareType('express')} className={`p-6 rounded-2xl border transition-all text-left ${fareType === 'express' ? 'border-emerald-500 bg-emerald-500/5' : 'border-white/5 opacity-50'}`}>
                      <div className="font-black text-emerald-500 uppercase text-xs tracking-widest mb-1 italic">Express (+30%)</div>
                      <div className="text-2xl font-black text-white tracking-tighter">â‚¦{(Math.ceil(estimatedPrice*1.3/50)*50).toLocaleString()}</div>
                    </button>
                  </div>
                </div>
             </div>

             {/* Error display */}
             {submitError && (
               <div className="p-4 bg-red-500/10 border border-red-500/20 rounded-2xl text-red-400 text-sm font-bold">
                 {submitError}
               </div>
             )}

             <button disabled={!isStep3Valid || isSubmitting} onClick={handleSubmitOrder} className="w-full bg-emerald-500 hover:bg-emerald-400 disabled:opacity-20 text-charcoal-950 font-black py-6 rounded-[2.5rem] text-3xl italic tracking-tighter flex items-center justify-center gap-4 transition-all active:scale-95 shadow-glow mb-12">
                {isSubmitting ? <Loader2 className="animate-spin" size={32} /> : <>DISPATCH LOAD <Truck size={32} /></>}
             </button>
          </div>
        )}
      </section>

      {activeModal && (
          <MapModal 
              isOpen={true}
              onClose={() => { setActiveModal(null); setMapTarget(null); }}
              onConfirm={handleConfirmLocation}
              initialLocation={mapTarget}
              title={activeModal === 'pickup' ? "Origin Point" : "Destination Point"}
          />
      )}
    </div>
  );
}
