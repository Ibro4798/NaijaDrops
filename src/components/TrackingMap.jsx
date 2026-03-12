"use client";

import { useEffect } from 'react';
import { MapContainer, TileLayer, Marker, Popup } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
});

// Custom Car Icon
const carIcon = L.divIcon({
  html: `<div style="background-color: white; border-radius: 50%; width: 32px; height: 32px; display: flex; align-items: center; justify-content: center; box-shadow: 0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1); border: 2px solid #10b981;"><div style="font-size: 16px;">🚙</div></div>`,
  className: '',
  iconSize: [32, 32],
  iconAnchor: [16, 16]
});

export default function TrackingMap({ driverLocation, dropoffLocation }) {
  if (!driverLocation || !dropoffLocation) return null;

  return (
    <div className="h-full w-full bg-gray-100 relative">
      <MapContainer 
        center={[driverLocation.lat, driverLocation.lng]} 
        zoom={14} 
        zoomControl={false}
        className="h-full w-full z-0"
      >
        <TileLayer
          attribution='&copy; OSM'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        
        {/* Driver Position */}
        <Marker position={[driverLocation.lat, driverLocation.lng]} icon={carIcon} zIndexOffset={100}>
            <Popup>Salisu (Driver)</Popup>
        </Marker>

        {/* Dropoff Position */}
        <Marker position={[dropoffLocation.lat, dropoffLocation.lng]}>
          <Popup>Destination</Popup>
        </Marker>
      </MapContainer>
    </div>
  );
}
