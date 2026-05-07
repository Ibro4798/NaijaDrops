"use client";

import { useState, useRef, useEffect } from "react";
import Map, { Marker, NavigationControl } from "react-map-gl";
import 'mapbox-gl/dist/mapbox-gl.css';
import { MapPin, Navigation } from "lucide-react";

/**
 * Reusable MapCanvas Component 
 * Handles:
 * 1. Viewing live markers (Rider tracking)
 * 2. Picking locations (Create Delivery)
 *
 * @param {Array} markers - Array of {lat, lng, color, type} objects
 * @param {boolean} interactive - Whether the user can click to drop a pin
 * @param {function} onLocationSelect - Callback when pin is dropped (returns {lat, lng})
 * @param {object} center - Default center {lat, lng} 
 */
export default function MapCanvas({ 
  markers = [], 
  orders = [],
  interactive = false, 
  onLocationSelect = () => {},
  center = null,
  zoom: initialZoom = 12
}) {
  // Merge markers and orders (orders get converted to marker format)
  const allMarkers = [
    ...markers,
    ...orders.filter(o => o.pickup_lat && o.pickup_lng).map(o => ({
      lat: o.pickup_lat,
      lng: o.pickup_lng,
      color: 'emerald',
      type: 'pickup'
    }))
  ];
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
  }, [allMarkers, interactive]);

  const handleMapClick = (e) => {
    if (!interactive) return;
    
    const { lng, lat } = e.lngLat;
    setActivePin({ lng, lat });
    onLocationSelect({ lng, lat });
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

        {/* Render fixed markers (e.g. Riders, Dropoffs) */}
        {allMarkers.map((m, idx) => (
          <Marker key={idx} longitude={m.lng} latitude={m.lat} anchor="bottom">
            <div className={`p-2 rounded-full ${m.color === 'emerald' ? 'bg-emerald-500/20 text-emerald-500' : 'bg-rose-500/20 text-rose-500'}`}>
               {m.type === 'rider' ? <Navigation size={24} className="animate-pulse" /> : <MapPin size={24} />}
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
