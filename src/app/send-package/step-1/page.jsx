"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import { motion, AnimatePresence } from "framer-motion";
import {
  MapPin, Navigation, Search, ArrowRight, X, Link as LinkIcon,
  Loader2, ArrowLeft, ChevronRight
} from "lucide-react";
import { getMapboxSuggestions, reverseGeocodeMapbox, getMapboxRoute } from "@/utils/mapbox";
import { extractFirstUrl } from "@/utils/MapResolver";

const Map = dynamic(() => import("react-map-gl").then(m => m.default), { ssr: false });
const Marker = dynamic(() => import("react-map-gl").then(m => m.Marker), { ssr: false });
const Source = dynamic(() => import("react-map-gl").then(m => m.Source), { ssr: false });
const Layer = dynamic(() => import("react-map-gl").then(m => m.Layer), { ssr: false });

const DRAFT_KEY = "nd_order_draft";
const LAST_PICKUP_KEY = "nd_last_pickup";
const KANO_CENTER = { lat: 11.9964, lng: 8.5200 };

// parseMapLink is now handled by src/lib/mapResolver.js and the API route

function formatDistance(meters) {
  if (!meters) return null;
  if (meters < 1000) return `${Math.round(meters)}m`;
  return `${(meters / 1000).toFixed(1)}km`;
}

function formatDuration(seconds) {
  if (!seconds) return null;
  const mins = Math.round(seconds / 60);
  if (mins < 60) return `~${mins} min`;
  return `~${Math.floor(mins / 60)}h ${mins % 60}m`;
}

export default function Step1Page() {
  const router = useRouter();
  const mapboxToken = process.env.NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN;

  const [pickup, setPickup] = useState(null);   // { name, lat, lng }
  const [dropoff, setDropoff] = useState(null);  // { name, lat, lng }
  const [pickupInput, setPickupInput] = useState("");
  const [dropoffInput, setDropoffInput] = useState("");
  const [pickupSuggestions, setPickupSuggestions] = useState([]);
  const [dropoffSuggestions, setDropoffSuggestions] = useState([]);
  const [activeInput, setActiveInput] = useState(null); // 'pickup' | 'dropoff'
  const [gpsLoading, setGpsLoading] = useState(false);
  const [routeData, setRouteData] = useState(null);
  const [routeInfo, setRouteInfo] = useState(null); // { distance, duration }
  const [mapViewState, setMapViewState] = useState({ longitude: KANO_CENTER.lng, latitude: KANO_CENTER.lat, zoom: 12 });
  const [linkInput, setLinkInput] = useState("");
  const [linkTarget, setLinkTarget] = useState(null); // 'pickup' | 'dropoff'
  const [showLinkModal, setShowLinkModal] = useState(false);
  const [linkError, setLinkError] = useState(null);
  const searchTimeout = useRef(null);

  // Preload last pickup on mount
  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const lastPickup = JSON.parse(localStorage.getItem(LAST_PICKUP_KEY));
      if (lastPickup?.lat && lastPickup?.lng) {
        setPickup(lastPickup);
        setPickupInput(lastPickup.name || "Last pickup location");
      }
    } catch {}
    // Also restore any existing draft
    try {
      const draft = JSON.parse(sessionStorage.getItem(DRAFT_KEY));
      if (draft?.pickup) { setPickup(draft.pickup); setPickupInput(draft.pickup.name); }
      if (draft?.dropoff) { setDropoff(draft.dropoff); setDropoffInput(draft.dropoff.name); }
    } catch {}
  }, []);

  // Auto-fetch route when both pins set
  useEffect(() => {
    if (!pickup || !dropoff) { setRouteData(null); setRouteInfo(null); return; }
    async function fetchRoute() {
      const route = await getMapboxRoute(pickup, dropoff, mapboxToken);
      if (route?.geometry) {
        setRouteData(route.geometry);
        setRouteInfo({ distance: route.distance, duration: route.duration });
      }
    }
    fetchRoute();

    // Auto-zoom map to fit both pins
    const minLng = Math.min(pickup.lng, dropoff.lng);
    const maxLng = Math.max(pickup.lng, dropoff.lng);
    const minLat = Math.min(pickup.lat, dropoff.lat);
    const maxLat = Math.max(pickup.lat, dropoff.lat);
    const centerLng = (minLng + maxLng) / 2;
    const centerLat = (minLat + maxLat) / 2;
    const spread = Math.max(maxLng - minLng, maxLat - minLat);
    const zoom = Math.max(10, Math.min(14, 14 - Math.log2(spread * 100)));
    setMapViewState({ longitude: centerLng, latitude: centerLat, zoom });
  }, [pickup, dropoff]);

  // Search handler
  async function handleSearch(val, type) {
    if (type === "pickup") { setPickupInput(val); setPickup(null); }
    else { setDropoffInput(val); setDropoff(null); }
    clearTimeout(searchTimeout.current);
    if (val.length < 2) { type === "pickup" ? setPickupSuggestions([]) : setDropoffSuggestions([]); return; }
    searchTimeout.current = setTimeout(async () => {
      const results = await getMapboxSuggestions(val, mapboxToken);
      if (type === "pickup") setPickupSuggestions(results);
      else setDropoffSuggestions(results);
    }, 280);
  }

  function selectLocation(loc, type) {
    const point = { name: loc.description || loc.name, lat: loc.lat, lng: loc.lng };
    if (type === "pickup") {
      setPickup(point); setPickupInput(point.name); setPickupSuggestions([]);
    } else {
      setDropoff(point); setDropoffInput(point.name); setDropoffSuggestions([]);
    }
    setActiveInput(null);
  }

  async function handleUseMyLocation() {
    setGpsLoading(true);
    navigator.geolocation.getCurrentPosition(async pos => {
      const { latitude: lat, longitude: lng } = pos.coords;
      const name = await reverseGeocodeMapbox(lat, lng, mapboxToken);
      const point = { name, lat, lng };
      setPickup(point);
      setPickupInput(name);
      setMapViewState(v => ({ ...v, longitude: lng, latitude: lat, zoom: 14 }));
      setGpsLoading(false);
    }, () => setGpsLoading(false));
  }

  async function handleLinkPaste() {
    if (!linkInput) return;
    
    // 1. Extract the first valid URL from potentially messy input
    const extractedUrl = extractFirstUrl(linkInput);
    
    if (!extractedUrl) {
      alert("No valid map link found in the text.");
      return;
    }

    setGpsLoading(true); 
    setLinkError(null);
    try {
      const resp = await fetch("/api/resolve-link", {
        method: "POST",
        body: JSON.stringify({ url: extractedUrl }),
        headers: { "Content-Type": "application/json" }
      });
      const data = await resp.json();
      
      if (data.lat && data.lng) {
        const name = await reverseGeocodeMapbox(data.lat, data.lng, mapboxToken);
        const point = { name, lat: data.lat, lng: data.lng };
        selectLocation(point, linkTarget);
        setShowLinkModal(false);
        setLinkInput("");
      } else {
        setLinkError(data.error || "Unable to resolve this map link. Please try a different link or search manually.");
      }
    } catch (err) {
      setLinkError("Connection failed. Please check your network and try again.");
    } finally {
      setGpsLoading(false);
    }
  }

  function handleContinue() {
    if (!pickup || !dropoff) return;
    const draft = { pickup, dropoff, distance_m: routeInfo?.distance, duration_s: routeInfo?.duration };
    sessionStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
    localStorage.setItem(LAST_PICKUP_KEY, JSON.stringify(pickup));
    router.push("/send-package/step-2");
  }

  const bothSet = pickup && dropoff;

  return (
    <div className="min-h-[100dvh] bg-charcoal-950 flex flex-col">
      {/* Header */}
      <div className="flex items-center gap-4 px-5 pt-14 pb-5">
        <button onClick={() => router.push("/dashboard")} className="w-10 h-10 rounded-2xl bg-white/[0.05] border border-white/10 flex items-center justify-center text-white hover:bg-white/10 transition-colors">
          <ArrowLeft size={18} />
        </button>
        <div>
          <div className="text-[10px] font-black text-charcoal-500 uppercase tracking-widest">Step 1 of 3</div>
          <h1 className="text-xl font-black text-white tracking-tight">Set Locations</h1>
        </div>
        {/* Step pills */}
        <div className="ml-auto flex gap-1.5">
          {[1, 2, 3].map(s => (
            <div key={s} className={`h-1.5 rounded-full transition-all ${s === 1 ? "w-6 bg-emerald-500" : "w-3 bg-white/20"}`} />
          ))}
        </div>
      </div>

      {/* Map Preview */}
      <div className={`mx-5 rounded-3xl overflow-hidden border border-white/10 transition-all duration-500 ${bothSet ? "h-52" : "h-36"}`}>
        {mapboxToken ? (
          <Map
            mapboxAccessToken={mapboxToken}
            {...mapViewState}
            onMove={e => setMapViewState(e.viewState)}
            style={{ width: "100%", height: "100%" }}
            mapStyle="mapbox://styles/mapbox/dark-v11"
          >
            {routeData && (
              <Source id="route" type="geojson" data={{ type: "Feature", geometry: routeData }}>
                <Layer id="routeLine" type="line" layout={{ "line-join": "round", "line-cap": "round" }}
                  paint={{ "line-color": "#10b981", "line-width": 4, "line-opacity": 0.85 }} />
              </Source>
            )}
            {pickup && (
              <Marker longitude={pickup.lng} latitude={pickup.lat} anchor="bottom">
                <div className="w-8 h-8 bg-white rounded-full border-4 border-charcoal-900 flex items-center justify-center shadow-xl">
                  <div className="w-3 h-3 bg-charcoal-900 rounded-full" />
                </div>
              </Marker>
            )}
            {dropoff && (
              <Marker longitude={dropoff.lng} latitude={dropoff.lat} anchor="bottom">
                <MapPin size={32} className="text-emerald-400 drop-shadow-lg" fill="#10b981" fillOpacity={0.2} />
              </Marker>
            )}
          </Map>
        ) : (
          <div className="w-full h-full bg-charcoal-900 flex items-center justify-center">
            <span className="text-charcoal-600 text-sm font-medium">Map preview</span>
          </div>
        )}
      </div>

      {/* Route info bar */}
      <AnimatePresence>
        {routeInfo && (
          <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} className="mx-5 mt-3 px-5 py-3 bg-emerald-500/10 border border-emerald-500/20 rounded-2xl flex items-center justify-between">
            <div className="flex items-center gap-2 text-emerald-400">
              <MapPin size={14} />
              <span className="font-black text-sm">{formatDistance(routeInfo.distance)}</span>
            </div>
            <div className="h-px flex-1 mx-3 bg-emerald-500/20" />
            <div className="text-emerald-400 font-black text-sm">{formatDuration(routeInfo.duration)}</div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Location Inputs */}
      <div className="flex-1 px-5 pt-4 pb-6 space-y-3 overflow-y-auto">
        {/* Pickup field */}
        <div>
          <label className="text-[10px] font-black text-charcoal-500 uppercase tracking-widest ml-1 mb-2 block">Pickup Location</label>
          <div className="relative">
            <div className="absolute left-4 top-1/2 -translate-y-1/2 w-3 h-3 bg-white rounded-full border-2 border-charcoal-600" />
            <input
              type="text"
              placeholder="Where to pick up from?"
              value={pickupInput}
              onFocus={() => setActiveInput("pickup")}
              onChange={e => handleSearch(e.target.value, "pickup")}
              className="w-full bg-charcoal-900 border border-white/10 rounded-2xl py-4 pl-10 pr-4 text-white placeholder:text-charcoal-600 focus:outline-none focus:ring-2 focus:ring-emerald-500/40 focus:border-emerald-500/60 transition-all text-sm font-medium"
            />
            {pickupInput && (
              <button onClick={() => { setPickupInput(""); setPickup(null); setPickupSuggestions([]); }} className="absolute right-4 top-1/2 -translate-y-1/2 text-charcoal-600 hover:text-white transition-colors">
                <X size={14} />
              </button>
            )}
          </div>
          {/* GPS + Paste link buttons */}
          <div className="flex gap-2 mt-2">
            <button onClick={handleUseMyLocation} disabled={gpsLoading}
              className="flex-1 flex items-center justify-center gap-1.5 py-2.5 bg-charcoal-800 hover:bg-charcoal-700 border border-white/10 rounded-xl text-charcoal-300 text-xs font-bold transition-all">
              {gpsLoading ? <Loader2 size={12} className="animate-spin" /> : <Navigation size={12} />}
              Use my location
            </button>
            <button onClick={() => { setLinkTarget("pickup"); setShowLinkModal(true); }}
              className="flex-1 flex items-center justify-center gap-1.5 py-2.5 bg-charcoal-800 hover:bg-charcoal-700 border border-white/10 rounded-xl text-charcoal-300 text-xs font-bold transition-all">
              <LinkIcon size={12} />
              Paste map link
            </button>
          </div>

          {/* Pickup suggestions */}
          <AnimatePresence>
            {activeInput === "pickup" && pickupSuggestions.length > 0 && (
              <motion.div initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
                className="mt-2 bg-charcoal-900 border border-white/10 rounded-2xl overflow-hidden shadow-xl">
                {pickupSuggestions.map((s, i) => (
                  <button key={i} onClick={() => selectLocation(s, "pickup")}
                    className="w-full flex items-start gap-3 px-4 py-3.5 text-left hover:bg-white/5 border-b border-white/5 last:border-0 transition-colors">
                    <MapPin className="text-charcoal-500 shrink-0 mt-0.5" size={14} />
                    <div>
                      <div className="text-white text-sm font-semibold leading-tight">{s.name}</div>
                      <div className="text-charcoal-500 text-xs mt-0.5 leading-tight">{s.description}</div>
                    </div>
                  </button>
                ))}
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Dropoff field */}
        <div>
          <label className="text-[10px] font-black text-charcoal-500 uppercase tracking-widest ml-1 mb-2 block">Dropoff Location</label>
          <div className="relative">
            <MapPin className="absolute left-3.5 top-1/2 -translate-y-1/2 text-emerald-500" size={15} />
            <input
              type="text"
              placeholder="Where to deliver to?"
              value={dropoffInput}
              onFocus={() => setActiveInput("dropoff")}
              onChange={e => handleSearch(e.target.value, "dropoff")}
              className="w-full bg-charcoal-900 border border-white/10 rounded-2xl py-4 pl-10 pr-4 text-white placeholder:text-charcoal-600 focus:outline-none focus:ring-2 focus:ring-emerald-500/40 focus:border-emerald-500/60 transition-all text-sm font-medium"
            />
            {dropoffInput && (
              <button onClick={() => { setDropoffInput(""); setDropoff(null); setDropoffSuggestions([]); }} className="absolute right-4 top-1/2 -translate-y-1/2 text-charcoal-600 hover:text-white transition-colors">
                <X size={14} />
              </button>
            )}
          </div>
          <div className="flex gap-2 mt-2">
            <button onClick={() => { setLinkTarget("dropoff"); setShowLinkModal(true); }}
              className="flex-1 flex items-center justify-center gap-1.5 py-2.5 bg-charcoal-800 hover:bg-charcoal-700 border border-white/10 rounded-xl text-charcoal-300 text-xs font-bold transition-all">
              <LinkIcon size={12} />
              Paste map link
            </button>
          </div>

          <AnimatePresence>
            {activeInput === "dropoff" && dropoffSuggestions.length > 0 && (
              <motion.div initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
                className="mt-2 bg-charcoal-900 border border-white/10 rounded-2xl overflow-hidden shadow-xl">
                {dropoffSuggestions.map((s, i) => (
                  <button key={i} onClick={() => selectLocation(s, "dropoff")}
                    className="w-full flex items-start gap-3 px-4 py-3.5 text-left hover:bg-white/5 border-b border-white/5 last:border-0 transition-colors">
                    <MapPin className="text-emerald-500 shrink-0 mt-0.5" size={14} />
                    <div>
                      <div className="text-white text-sm font-semibold leading-tight">{s.name}</div>
                      <div className="text-charcoal-500 text-xs mt-0.5 leading-tight">{s.description}</div>
                    </div>
                  </button>
                ))}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      {/* CTA */}
      <div className="px-5 pb-8 pt-4 border-t border-white/[0.06]">
        <motion.button
          whileTap={{ scale: 0.97 }}
          onClick={handleContinue}
          disabled={!bothSet}
          className={`w-full py-4 rounded-2xl font-black text-base flex items-center justify-center gap-2 transition-all ${bothSet
            ? "bg-emerald-500 hover:bg-emerald-400 text-charcoal-950 shadow-[0_0_24px_rgba(16,185,129,0.35)]"
            : "bg-white/[0.05] text-charcoal-600 border border-white/10 cursor-not-allowed"}`}
        >
          Continue <ArrowRight size={18} />
        </motion.button>
        {!bothSet && (
          <p className="text-center text-charcoal-600 text-xs mt-3 font-medium">Both locations required to continue</p>
        )}
      </div>

      {/* Paste link modal */}
      <AnimatePresence>
        {showLinkModal && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-charcoal-950/90 backdrop-blur-sm flex items-end">
            <motion.div initial={{ y: 100 }} animate={{ y: 0 }} exit={{ y: 100 }}
              className="w-full bg-charcoal-900 border-t border-white/10 rounded-t-[2rem] p-6">
              <h3 className="text-white font-black text-lg mb-1">Paste a Map Link</h3>
              <p className="text-charcoal-500 text-sm mb-4">Works with Google Maps, Apple Maps URLs</p>
              
              <div className="relative mb-4">
                <textarea value={linkInput} onChange={e => { setLinkInput(e.target.value); setLinkError(null); }} rows={3}
                  disabled={gpsLoading}
                  placeholder="Paste your maps link here..."
                  className={`w-full bg-charcoal-800 border ${linkError ? 'border-red-500/50' : 'border-white/10'} rounded-2xl p-4 text-white placeholder:text-charcoal-600 focus:outline-none focus:ring-2 focus:ring-emerald-500/40 text-sm font-medium resize-none transition-all`} />
                
                {gpsLoading && (
                  <div className="absolute inset-0 bg-charcoal-900/60 backdrop-blur-[2px] rounded-2xl flex flex-col items-center justify-center gap-2">
                    <Loader2 className="text-emerald-500 animate-spin" size={24} />
                    <span className="text-emerald-500 text-[10px] font-black uppercase tracking-widest">Resolving coordinates...</span>
                  </div>
                )}
              </div>

              {linkError && (
                <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}
                  className="mb-4 p-4 bg-red-500/10 border border-red-500/20 rounded-2xl flex items-center gap-3">
                  <AlertCircle className="text-red-500 shrink-0" size={18} />
                  <p className="text-red-400 text-xs font-bold leading-tight">{linkError}</p>
                </motion.div>
              )}

              <div className="flex gap-3">
                <button onClick={() => { setShowLinkModal(false); setLinkInput(""); setLinkError(null); }} 
                  disabled={gpsLoading}
                  className="flex-1 py-3.5 bg-white/5 border border-white/10 rounded-2xl text-charcoal-300 font-bold text-sm disabled:opacity-50">Cancel</button>
                <button onClick={handleLinkPaste} 
                  disabled={gpsLoading || !linkInput.trim()}
                  className="flex-1 py-3.5 bg-emerald-500 hover:bg-emerald-400 rounded-2xl text-charcoal-950 font-black text-sm disabled:opacity-50 shadow-glow">
                  {gpsLoading ? "Extracting..." : "Extract Location"}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
