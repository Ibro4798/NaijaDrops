"use client";

import { useState, useRef, useEffect } from 'react';
import { MapContainer, TileLayer, Marker, useMap, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { X, Search, MapPin } from 'lucide-react';

// Fix Leaflet icon issue in Next.js
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
});

function LocationMarker({ position, setPosition, setAddress }) {
  const map = useMapEvents({
    dragend() {
      const center = map.getCenter();
      setPosition(center);
      reverseGeocode(center.lat, center.lng);
    },
    zoomend() {
      const center = map.getCenter();
      setPosition(center);
      reverseGeocode(center.lat, center.lng);
    }
  });

  const reverseGeocode = async (lat, lng) => {
    try {
      const res = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&zoom=18&addressdetails=1`);
      const data = await res.json();
      if (data && data.display_name) {
        setAddress(data.display_name.split(',')[0]); // simplified
      }
    } catch (error) {
      console.error("Geocoding failed", error);
    }
  };

  return position === null ? null : (
    <Marker position={position}></Marker>
  );
}

export default function MapModal({ isOpen, onClose, onConfirm, initialLocation, title }) {
  const [position, setPosition] = useState(initialLocation || { lat: 11.9746, lng: 8.5361 }); // Kano default
  const [address, setAddress] = useState("Loading address...");

  const [gpsLoading, setGpsLoading] = useState(false);

  const useMyLocation = () => {
    if (!navigator.geolocation) return;
    setGpsLoading(true);
    navigator.geolocation.getCurrentPosition((pos) => {
      const newPos = { lat: pos.coords.latitude, lng: pos.coords.longitude };
      setPosition(newPos);
      setGpsLoading(false);
    }, () => {
      setGpsLoading(false);
    }, { enableHighAccuracy: true, timeout: 5000 });
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] bg-charcoal-900/60 backdrop-blur-sm flex flex-col transition-opacity duration-300">
      <div className="bg-white flex-shrink-0 pt-12 pb-4 px-4 shadow-sm z-10 flex items-center gap-3">
        <button onClick={onClose} className="w-10 h-10 bg-gray-100 rounded-full flex items-center justify-center text-charcoal-700 hover:bg-gray-200 transition-colors">
          <X size={20} />
        </button>
        <div className="flex-1">
          <h2 className="text-lg font-bold text-charcoal-900 leading-tight">Confirm {title}</h2>
          <p className="text-xs text-charcoal-500 font-medium">Drag map to adjust</p>
        </div>
      </div>
      
      <div className="flex-1 relative bg-gray-100">
        <MapContainer center={position} zoom={15} scrollWheelZoom={true} className="h-full w-full">
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
          <LocationMarker position={position} setPosition={setPosition} setAddress={setAddress} />
        </MapContainer>

        {/* My Location FAB Overlay */}
        <div className="absolute top-4 right-4 z-[400]">
          <button 
            onClick={useMyLocation}
            disabled={gpsLoading}
            className={`w-12 h-12 bg-white rounded-full shadow-xl border border-gray-100 flex items-center justify-center text-charcoal-900 hover:bg-gray-50 transition-all ${gpsLoading ? 'animate-spin border-emerald-500' : 'hover:scale-105 active:scale-95'}`}
            title="Recenter to my location"
          >
            <MapPin size={22} className={gpsLoading ? 'text-emerald-500' : 'text-charcoal-700'} />
          </button>
        </div>
        
        {/* Center Pin Overlay (for visual accuracy during drag) */}
        <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 z-[400] pointer-events-none">
            <div className="w-6 h-6 bg-charcoal-900 rounded-full flex items-center justify-center shadow-lg border-2 border-white">
                <div className="w-2 h-2 bg-emerald-400 rounded-full animate-pulse"></div>
            </div>
            <div className="w-1 h-8 bg-charcoal-900 mx-auto -mt-1 rounded-full"></div>
            <div className="w-4 h-1 bg-black/20 mx-auto rounded-full blur-[2px] mt-1"></div>
        </div>
      </div>

      <div className="bg-white p-6 shadow-[0_-10px_40px_rgba(0,0,0,0.1)] rounded-t-3xl relative z-10">
        <div className="flex items-start gap-3 mb-6">
          <div className="w-10 h-10 bg-emerald-50 rounded-full flex items-center justify-center flex-shrink-0 mt-1">
            <MapPin className="text-emerald-600" size={20} />
          </div>
          <div>
            <div className="text-xs font-bold text-emerald-600 uppercase tracking-widest mb-1">Pinned Location</div>
            <div className="text-lg font-bold text-charcoal-900 leading-tight line-clamp-2">{address}</div>
          </div>
        </div>
        <button 
          onClick={() => onConfirm({ coords: position, name: address })}
          className="w-full py-4 bg-charcoal-900 hover:bg-black text-white font-bold rounded-2xl shadow-lg transition-transform focus:outline-none flex items-center justify-center gap-2"
        >
          Confirm Location
        </button>
      </div>
    </div>
  );
}

