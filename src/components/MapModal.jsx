"use client";

import React, { useState, useEffect, useRef, useCallback } from 'react';
import Map from 'react-map-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import mapboxgl from 'mapbox-gl';
import { X, MapPin, Search, Navigation, CheckCircle2, Loader2, Globe } from 'lucide-react';
import { getReliableLocation } from '@/utils/geolocation';
import { getMapboxSuggestions, reverseGeocodeMapbox } from '@/utils/mapbox';
import { extractFirstUrl, isAllowedHost } from '@/utils/MapResolver';

// workerClass override removed to fix blank map in Next.js 14+

const center = {
  lat: 12.0022,
  lng: 8.5920 // Kano, Nigeria
};

export default function MapModal({ isOpen, onClose, onConfirm, initialLocation, title = "Select Location" }) {
  const mapboxToken = process.env.NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN;

  const [viewState, setViewState] = useState({
    longitude: initialLocation?.coords?.lng || center.lng,
    latitude: initialLocation?.coords?.lat || center.lat,
    zoom: 12.5
  });
  
  const [address, setAddress] = useState(initialLocation?.name || '');
  const [isResolving, setIsResolving] = useState(false);
  const [locationError, setLocationError] = useState(null);
  const [locationStatus, setLocationStatus] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [suggestions, setSuggestions] = useState([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const gpsAbortControllerRef = useRef(null);
  
  // Track center coordinates for returning
  const [markerPosition, setMarkerPosition] = useState({ lat: viewState.latitude, lng: viewState.longitude });
  const [mapLoaded, setMapLoaded] = useState(false);
  const searchTimeoutRef = useRef(null);
  
  // Ref for the Map component to handle panTo
  const mapRef = useRef();

  // Fix Mapbox gray screen from Modal animation resize bug
  useEffect(() => {
    if (isOpen) {
      const timer = setTimeout(() => {
        if (mapRef.current) {
          mapRef.current.resize();
        }
      }, 350); // wait for 300ms modal animation
      return () => clearTimeout(timer);
    }
  }, [isOpen]);

  const reverseGeocode = async (lat, lng) => {
    setIsResolving(true);
    try {
      if (mapboxToken) {
        const addr = await reverseGeocodeMapbox(lat, lng, mapboxToken);
        setAddress(addr);
      } else {
        const res = await fetch(
          `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&zoom=18&addressdetails=1`,
          { headers: { 'Accept-Language': 'en' } }
        );
        const data = await res.json();
        setAddress(data?.display_name || `${lat.toFixed(4)}, ${lng.toFixed(4)}`);
      }
    } catch (error) {
       console.error("Geocoding failed", error);
       setAddress(`${lat.toFixed(4)}, ${lng.toFixed(4)}`);
    } finally {
      setIsResolving(false);
    }
  };

  // FIX: getMapboxSuggestions() now merges Mapbox + OpenStreetMap results
  // internally (see src/utils/mapbox.js) and handles a missing token on its
  // own, so the separate raw-Nominatim fallback branch that used to live
  // here is no longer needed - one code path for both cases.
  const handleSearch = async (query) => {
    setSearchQuery(query);
    // FIX: clear a stale "couldn't find your location" error as soon as the
    // user starts typing - trying another method should never leave the old
    // error sitting on screen.
    setLocationError(null);

    if (!query || query.length < 2) {
      setSuggestions([]);
      return;
    }

    // FIX: pasting a map link here used to be sent straight to Mapbox as a
    // plain text query, which can't match a URL to a place - it silently
    // returned nothing. This resolves it the same way the dedicated
    // link-paste flow elsewhere in the app does (follows short-link
    // redirects server-side, falls back to geocoding the place name for
    // business-listing links with no raw coordinates), landing the pin
    // directly instead of leaving an empty suggestions dropdown.
    const maybeUrl = extractFirstUrl(query);
    if (maybeUrl && isAllowedHost(maybeUrl)) {
      if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);
      setShowSuggestions(false);
      setSuggestions([]);
      setIsResolving(true);
      try {
        const res = await fetch('/api/resolve-link', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ url: maybeUrl }),
        });
        const data = await res.json().catch(() => null);
        if (res.ok && data?.lat && data?.lng) {
          setMarkerPosition({ lat: data.lat, lng: data.lng });
          setViewState(v => ({ ...v, longitude: data.lng, latitude: data.lat, zoom: 15 }));
          setSearchQuery('');
          if (mapRef.current) mapRef.current.flyTo?.({ center: [data.lng, data.lat], zoom: 15 });
          await reverseGeocode(data.lat, data.lng);
        } else {
          setLocationError(data?.message || "Couldn't resolve that link. Try \"Share location\" from Maps instead, or search by name.");
        }
      } catch {
        setLocationError('Connection failed while resolving that link. Check your network and try again.');
      } finally {
        setIsResolving(false);
      }
      return;
    }

    if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);

    searchTimeoutRef.current = setTimeout(async () => {
      try {
        // getMapboxSuggestions (src/utils/mapbox.js) already merges Mapbox +
        // Nominatim + Photon internally - there used to be a fallback call
        // to /api/smart-location-search here for the empty-result case, but
        // that endpoint queries the same Nominatim + Photon APIs with the
        // same query string, so it could never surface anything the call
        // above didn't already try. Removed as dead weight (same as
        // send-package/step-1). If a name like "Brigade" still doesn't
        // resolve, that's a gap in OpenStreetMap's coverage for that name,
        // not a wiring bug here.
        const sugs = await getMapboxSuggestions(query, mapboxToken);
        setSuggestions(sugs);
        setShowSuggestions(true);
      } catch (err) {
        console.error("Search failed", err);
        // FIX: this used to fail completely silently - the dropdown just
        // never appeared, with no way to tell a real failure apart from
        // "no matches found."
        setLocationError('Search failed - check your connection and try again.');
      }
    }, 400);
  };

  const selectSuggestion = async (sug) => {
    setLocationError(null); // FIX: clear stale error when a location is picked via search
    setMarkerPosition({ lat: sug.lat, lng: sug.lng });
    setViewState({ ...viewState, longitude: sug.lng, latitude: sug.lat, zoom: 14.5 });
    setAddress(sug.name || sug.description);
    
    setSearchQuery('');
    setSuggestions([]);
    setShowSuggestions(false);
  };

  const useMyLocation = async () => {
    setIsResolving(true);
    setLocationError(null);
    setLocationStatus(null);
    // FIX: mirrors the working pattern in send-package/step-1 - unblock
    // (stop the spinner, reverse-geocode, enable Confirm) as soon as a
    // reading clears the `usable` floor from geolocation.js (<=150m, or
    // 8s elapsed with nothing better), instead of committing to whatever
    // arrives first regardless of accuracy and then, separately, waiting
    // for the entire promise to settle before ever clearing the spinner.
    // That mismatch was the actual bug: the pin/address could update
    // early but isResolving stayed true until the full 15-32s timeout,
    // with no way to cancel out of it.
    gpsAbortControllerRef.current = new AbortController();
    let handled = false;
    try {
      const loc = await getReliableLocation((msg, reading) => {
        if (!handled) setLocationStatus(msg);
        if (!reading) return;
        setMarkerPosition({ lat: reading.lat, lng: reading.lng });
        setViewState((v) => ({ ...v, longitude: reading.lng, latitude: reading.lat, zoom: 14.5 }));
        if (!reading.usable || handled) return;
        handled = true;
        reverseGeocode(reading.lat, reading.lng);
        setIsResolving(false);
        setLocationStatus(null);
      }, { signal: gpsAbortControllerRef.current.signal });
      if (!handled) {
        if (loc) {
          setMarkerPosition({ lat: loc.lat, lng: loc.lng });
          setViewState((v) => ({ ...v, longitude: loc.lng, latitude: loc.lat, zoom: 14.5 }));
          reverseGeocode(loc.lat, loc.lng);
        } else {
          setLocationError("Couldn't find your location. Search for your street or landmark instead, or try again.");
        }
      }
    } catch (error) {
       console.error("Geolocation error:", error);
       if (!handled) setLocationError("Couldn't find your location. Search for your street or landmark instead, or try again.");
    } finally {
      if (!handled) {
        setIsResolving(false);
        setLocationStatus(null);
      }
      gpsAbortControllerRef.current = null;
    }
  };

  // Stops an in-flight GPS acquisition on demand (Cancel button next to
  // the locate-me control below). If nothing usable had landed yet this
  // just clears the spinner with no pin change - same as the button never
  // having been pressed. Not shown once a usable fix has already
  // unblocked Confirm, since there is nothing left worth cancelling.
  function handleCancelGps() {
    gpsAbortControllerRef.current?.abort();
    setIsResolving(false);
    setLocationStatus(null);
  }

  const handleMove = useCallback((evt) => {
      setViewState(evt.viewState);
  }, []);

  const handleMoveEnd = useCallback(async (evt) => {
      setLocationError(null); // FIX: clear stale error once the user drags the pin themselves
      const lat = evt.viewState.latitude;
      const lng = evt.viewState.longitude;
      setMarkerPosition({ lat, lng });
      reverseGeocode(lat, lng);
  }, []);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[2000] flex items-center justify-center sm:p-4 bg-[#18181b]/60 backdrop-blur-sm animate-in fade-in duration-300">
      <div className="bg-white w-full h-full sm:h-auto sm:max-w-2xl sm:rounded-[2.5rem] shadow-2xl overflow-hidden animate-in zoom-in-95 duration-300 flex flex-col sm:max-h-[90vh]">
        
        {/* Header */}
        <div className="p-6 flex items-center justify-between border-b border-gray-100 shrink-0">
          <div className="flex items-center gap-3">
            <div className={`p-2 rounded-xl bg-emerald-50 text-emerald-600`}>
               <Navigation size={20} />
            </div>
            <div>
              <h3 className="text-xl font-black text-[#18181b] tracking-tight">{title}</h3>
              <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest leading-none mt-1">
                {mapboxToken ? 'Powered by Mapbox' : 'Powered by OpenStreetMap (Demo)'}
              </p>
            </div>
          </div>
          <button onClick={() => { if (isResolving) handleCancelGps(); onClose(); }} className="p-2 hover:bg-gray-100 rounded-full transition-colors"><X size={20} /></button>
        </div>

        {/* Search Bar */}
        <div className="p-4 bg-gray-50 border-b border-gray-100 relative z-[110] shrink-0">
          <div className="relative group">
            <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none text-charcoal-400">
              <Search size={18} className="group-focus-within:text-emerald-600 transition-colors" />
            </div>
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => handleSearch(e.target.value)}
              placeholder="Search, or paste a Google Maps link..."
              className="w-full pl-11 pr-4 py-3.5 bg-white border border-gray-200 rounded-2xl focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 font-medium text-[#18181b] shadow-sm transition-all"
            />
            {showSuggestions && suggestions.length > 0 && (
              <div className="absolute left-0 right-0 top-full mt-2 bg-white rounded-2xl shadow-2xl border border-gray-100 overflow-hidden max-h-60 overflow-y-auto z-[250]">
                {suggestions.map((sug, idx) => (
                  <button key={idx} onClick={() => selectSuggestion(sug)} className="w-full px-4 py-3 text-left hover:bg-gray-50 flex items-start gap-3 border-b border-gray-50 last:border-0 transition-colors">
                    <MapPin size={16} className="text-emerald-500 mt-1 shrink-0" />
                    <div>
                      <div className="font-bold text-[#18181b] text-sm line-clamp-1 truncate flex items-center gap-1.5">
                        <span>{sug.name || sug.description}</span>
                        {sug.isOSM && (
                          <span className="text-[8px] font-black uppercase tracking-widest text-emerald-500 bg-emerald-500/10 border border-emerald-500/20 rounded-md px-1.5 py-0.5 leading-none">Web Match</span>
                        )}
                      </div>
                      {sug.name && sug.name !== sug.description && (
                         <p className="text-xs text-charcoal-400 line-clamp-1 mt-0.5">{sug.description}</p>
                      )}
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Map Area */}
        <div className="relative flex-1 bg-gray-200 min-h-[500px]">
          {mapboxToken ? (
            <div className="w-full h-full relative">
              {!mapLoaded && (
                <div className="absolute inset-0 bg-gray-50 z-[150] flex flex-col items-center justify-center">
                    <div className="w-16 h-16 bg-white rounded-3xl shadow-xl flex items-center justify-center mb-4 border border-gray-100">
                        <Loader2 size={32} className="text-emerald-500 animate-spin" />
                    </div>
                    <div className="text-[10px] font-black uppercase tracking-[0.2em] text-emerald-800 animate-pulse">Synchronizing Satellite...</div>
                </div>
              )}
              <Map
                ref={mapRef}
                mapboxAccessToken={mapboxToken}
                {...viewState}
                onMove={handleMove}
                onMoveEnd={handleMoveEnd}
                onLoad={() => setMapLoaded(true)}
                style={{width: '100%', height: '100%'}}
                // Lighter style than streets-v12 - fewer layers to fetch and
                // render, meaningfully faster first paint on patchy mobile
                // connections while still showing roads/labels clearly
                // enough to drop a delivery pin accurately.
                mapStyle="mapbox://styles/mapbox/light-v11"
              />
            </div>
          ) : (
            <div className="w-full h-full flex flex-col items-center justify-center text-charcoal-400 p-8 text-center bg-gray-50">
               <Globe size={48} className="mb-4 text-gray-300" />
               <p className="font-bold text-lg text-charcoal-600">Map rendering is disabled</p>
               <p className="text-sm">Please provide a valid `NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN` in `.env.local`.</p>
            </div>
          )}

          {/* Fixed Center Pin Overlay */}
          {mapboxToken && (
              <div className="absolute top-1/2 left-1/2 -translate-x-1/2 flex flex-col items-center z-10 pointer-events-none" style={{ marginTop: '-42px' }}>
                  <div className="bg-[#18181b] text-white text-[10px] font-black uppercase tracking-widest px-3 py-1.5 rounded-full shadow-lg mb-2 flex items-center gap-2 max-w-[240px]">
                       {isResolving
                         ? <><Loader2 size={12} className="animate-spin shrink-0" /> <span className="truncate normal-case tracking-normal">{locationStatus || 'Locating...'}</span></>
                         : 'Set Pin'}
                  </div>
                  <div className="relative">
                      <MapPin size={42} className="text-emerald-600 fill-white drop-shadow-xl" />
                      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-[60%] w-2.5 h-2.5 bg-emerald-600 rounded-full animate-pulse"></div>
                  </div>
                  {/* Pin shadow */}
                  <div className="w-4 h-1 bg-black/20 rounded-full mt-0 blur-[1px]"></div>
              </div>
          )}

          <button onClick={useMyLocation} disabled={isResolving} className="absolute top-1/2 right-4 -translate-y-1/2 w-12 h-12 bg-white rounded-2xl shadow-xl flex items-center justify-center text-emerald-600 hover:scale-105 active:scale-95 transition-all group z-10 border border-gray-100 disabled:opacity-60">
            <Navigation size={22} className="group-hover:rotate-12 transition-transform" />
          </button>

          {isResolving && (
            <button onClick={handleCancelGps} type="button" className="absolute top-[calc(50%+56px)] right-4 z-10 px-4 py-2 bg-white rounded-full shadow-xl text-[10px] font-black uppercase tracking-widest text-charcoal-500 hover:text-charcoal-700 transition-all border border-gray-100">
              Cancel
            </button>
          )}

          {locationError && (
            <div className="absolute top-[calc(50%+50px)] right-4 z-10 max-w-[220px] bg-red-600 text-white text-xs font-bold px-4 py-3 rounded-2xl shadow-xl">
              {locationError}
            </div>
          )}

          {/* Overlaid Confirm Footer */}
          <div className="absolute bottom-0 left-0 right-0 z-20 pointer-events-none">
              <div className="bg-gradient-to-t from-black/20 to-transparent h-12 w-full absolute bottom-full"></div>
              <div className="bg-white p-6 rounded-t-[2.5rem] shadow-[0_-10px_40px_rgba(0,0,0,0.1)] pointer-events-auto">
                  
                  <div className="mb-6 flex items-start gap-4 p-4 bg-emerald-50 rounded-2xl border border-emerald-100">
                    <div className="w-10 h-10 bg-emerald-700 text-white rounded-xl flex items-center justify-center shrink-0"><MapPin size={20} /></div>
                    <div className="flex-1 min-w-0">
                      <div className="text-[10px] font-black text-emerald-700 uppercase tracking-widest mb-1">Selected Location</div>
                      <div className="text-[#18181b] font-bold text-base leading-tight truncate">{isResolving ? 'Resolving...' : address || 'Select a point'}</div>
                    </div>
                  </div>

                   <button 
                       disabled={!address || isResolving} 
                       onClick={() => onConfirm({ name: address, coords: markerPosition })} 
                       className={`w-full py-5 rounded-[2rem] font-black flex items-center justify-center gap-3 transition-all shadow-[0_20px_50px_rgba(0,0,0,0.2)] text-xl active:scale-95 ${!address || isResolving ? 'bg-gray-100 text-gray-400 cursor-not-allowed shadow-none' : 'bg-[#18181b] border-2 border-emerald-500/30 hover:bg-black text-white hover:shadow-emerald-500/10'}`}
                   >
                         {!address || isResolving ? <Loader2 size={28} className="animate-spin" /> : <><CheckCircle2 size={28} className="text-emerald-500" /> Confirm Point</>}
                   </button>
              </div>
          </div>
        </div>
      </div>
    </div>
  );
}