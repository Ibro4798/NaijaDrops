"use client";

import { useState, useRef, useEffect, useMemo } from "react";
import Map, { Marker, NavigationControl, Source, Layer } from "react-map-gl";
import 'mapbox-gl/dist/mapbox-gl.css';
import { MapPin, Navigation, Flag } from "lucide-react";

/**
 * Reusable MapCanvas Component 
 * Handles:
 * 1. Viewing live markers (Rider tracking)
 * 2. Picking locations (Create Delivery)
 *
 * @param {Array} markers - Array of {lat, lng, color, type, label} objects.
 *   type: 'rider' | 'pickup' | 'dropoff' | undefined - controls icon/label.
 * @param {boolean} interactive - Whether the user can click to drop a pin
 * @param {function} onLocationSelect - Callback when pin is dropped (returns {lat, lng})
 * @param {object} center - Default center {lat, lng}
 * @param {boolean} showRoute - Draw a connecting line between markers, in the order given
 */
export default function MapCanvas({
  markers = [],
  orders = [],
  interactive = false,
  onLocationSelect = () => {},
  center = null,
  zoom: initialZoom = 12,
  showRoute = false,
}) {
  // FIX: a marker with a missing/NaN lat or lng used to go straight to
  // react-map-gl's <Marker>, which hands it to Mapbox GL JS - Mapbox
  // throws synchronously on an invalid LngLat rather than failing quietly,
  // which crashes the whole page render (not something a try/catch
  // upstream can protect against, since it happens during React's own
  // render pass). Every caller upstream already guards against passing
  // bad coordinates, but this is the one place all of them funnel
  // through, so it's the right place to make it impossible regardless.
  const isValidCoord = (m) => Number.isFinite(m?.lat) && Number.isFinite(m?.lng);

  // Merge markers and orders (orders get converted to marker format)
  const allMarkers = [
    ...markers,
    ...orders.filter(o => o.pickup_lat && o.pickup_lng).map(o => ({
      lat: o.pickup_lat,
      lng: o.pickup_lng,
      color: 'emerald',
      type: 'pickup'
    }))
  ].filter(isValidCoord);
  const mapRef = useRef();

  // Default to Kano Center if not provided
  const [viewState, setViewState] = useState({
    longitude: center?.lng || 8.5200,
    latitude: center?.lat || 11.9964,
    zoom: initialZoom
  });

  const [activePin, setActivePin] = useState(null);

  // Auto center if new single marker is passed
  useEffect(() => {
     if (allMarkers.length === 1 && !interactive) {
        setViewState((prev) => ({
           ...prev,
           longitude: allMarkers[0].lng,
           latitude: allMarkers[0].lat,
           zoom: 14
        }));
     }
  }, [allMarkers.length === 1 ? `${allMarkers[0].lat},${allMarkers[0].lng}` : null, interactive]);

  // FIX: with multiple markers (pickup + dropoff + rider together, which is
  // the whole point of showing them all at once), the map used to just sit
  // on the Kano-center default and never actually frame what was on
  // screen - the caller had to already know where to look. Fit the camera
  // to whatever's actually being shown instead.
  useEffect(() => {
    if (allMarkers.length < 2 || interactive || !mapRef.current) return;
    const lats = allMarkers.map(m => m.lat);
    const lngs = allMarkers.map(m => m.lng);
    const bounds = [
      [Math.min(...lngs), Math.min(...lats)],
      [Math.max(...lngs), Math.max(...lats)],
    ];
    try {
      mapRef.current.fitBounds(bounds, { padding: 64, duration: 800, maxZoom: 15 });
    } catch {
      // map not fully ready yet - safe to skip, next update will retry
    }
  }, [JSON.stringify(allMarkers.map(m => [m.lat, m.lng])), interactive]);

  const routeGeoJson = useMemo(() => {
    if (!showRoute || allMarkers.length < 2) return null;
    return {
      type: 'Feature',
      geometry: {
        type: 'LineString',
        coordinates: allMarkers.map(m => [m.lng, m.lat]),
      },
    };
  }, [showRoute, JSON.stringify(allMarkers.map(m => [m.lat, m.lng]))]);

  const handleMapClick = (e) => {
    if (!interactive) return;

    const { lng, lat } = e.lngLat;
    setActivePin({ lng, lat });
    onLocationSelect({ lng, lat });
  };

  const markerVisual = (m) => {
    if (m.type === 'rider') {
      return (
        <div className="relative flex items-center justify-center">
          <div className="absolute w-11 h-11 rounded-full bg-emerald-500/30 animate-ping" />
          <div className="relative w-9 h-9 rounded-full bg-emerald-500 border-2 border-white shadow-lg flex items-center justify-center">
            <Navigation size={16} className="text-charcoal-950" />
          </div>
        </div>
      );
    }
    if (m.type === 'dropoff') {
      return (
        <div className="flex flex-col items-center">
          <div className="w-8 h-8 rounded-full bg-rose-500 border-2 border-white shadow-lg flex items-center justify-center -mb-1">
            <Flag size={14} className="text-white" />
          </div>
          <div className="w-2 h-2 bg-rose-500 rotate-45 -mt-1" />
        </div>
      );
    }
    // pickup / default
    return (
      <div className="flex flex-col items-center">
        <div className="w-8 h-8 rounded-full bg-emerald-500 border-2 border-white shadow-lg flex items-center justify-center -mb-1">
          <MapPin size={14} className="text-charcoal-950" />
        </div>
        <div className="w-2 h-2 bg-emerald-500 rotate-45 -mt-1" />
      </div>
    );
  };

  return (
    <div className="w-full h-full rounded-2xl overflow-hidden border border-white/10 relative">
      <Map
        ref={mapRef}
        {...viewState}
        onMove={evt => setViewState(evt.viewState)}
        mapStyle="mapbox://styles/mapbox/dark-v11"
        mapboxAccessToken={process.env.NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN}
        onClick={handleMapClick}
        cursor={interactive ? 'crosshair' : 'grab'}
      >
        <NavigationControl position="top-right" />

        {routeGeoJson && (
          <Source id="route" type="geojson" data={routeGeoJson}>
            <Layer
              id="route-line"
              type="line"
              layout={{ 'line-join': 'round', 'line-cap': 'round' }}
              paint={{ 'line-color': '#10b981', 'line-width': 3, 'line-dasharray': [0.2, 1.5], 'line-opacity': 0.8 }}
            />
          </Source>
        )}

        {/* Render fixed markers (e.g. Riders, Pickup, Dropoff) */}
        {allMarkers.map((m, idx) => (
          <Marker key={idx} longitude={m.lng} latitude={m.lat} anchor={m.type === 'rider' ? 'center' : 'bottom'}>
            <div className="relative group">
              {markerVisual(m)}
              {m.label && (
                <div className="absolute left-1/2 -translate-x-1/2 top-full mt-1 whitespace-nowrap bg-charcoal-950/90 border border-white/10 text-white text-[9px] font-black uppercase tracking-widest px-2 py-1 rounded-lg pointer-events-none">
                  {m.label}
                </div>
              )}
            </div>
          </Marker>
        ))}

        {/* Render temporary interactive pin */}
        {interactive && activePin && (
          <Marker longitude={activePin.lng} latitude={activePin.lat} anchor="bottom">
             <div className="relative group">
                <div className="absolute -inset-2 bg-emerald-500/20 rounded-full blur-sm"></div>
                <MapPin size={36} className="text-emerald-500 relative z-10 drop-shadow-xl -translate-y-2" />
             </div>
          </Marker>
        )}
      </Map>
    </div>
  );
}