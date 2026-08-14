"use client";

import Map, { Marker } from "react-map-gl";
import "mapbox-gl/dist/mapbox-gl.css";

export default function VendorDashboardMap({ mapboxToken, userLocation, onLoad }) {
  return (
    <Map
      mapboxAccessToken={mapboxToken}
      initialViewState={{ longitude: userLocation.lng, latitude: userLocation.lat, zoom: 13 }}
      style={{ width: "100%", height: "100%" }}
      mapStyle="mapbox://styles/mapbox/dark-v11"
      onLoad={onLoad}
    >
      {/* User location pin */}
      <Marker longitude={userLocation.lng} latitude={userLocation.lat} anchor="center">
        <div className="relative">
          <div className="w-5 h-5 bg-emerald-500 rounded-full border-4 border-white shadow-[0_0_16px_rgba(16,185,129,0.8)]" />
          <div className="absolute inset-0 w-5 h-5 bg-emerald-400 rounded-full animate-ping opacity-40" />
        </div>
      </Marker>
    </Map>
  );
}
