"use client";

import React, { useEffect, useRef, useState } from 'react';
import Map, { Marker, Source, Layer } from 'react-map-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import mapboxgl from 'mapbox-gl';
import { MapPin } from 'lucide-react';
import { getMapboxRoute } from '@/utils/mapbox';

// workerClass override removed to fix blank map in Next.js 14+

export default function MiniRouteMap({ pickup, dropoff }) {
  const mapboxToken = process.env.NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN;
  const mapRef = useRef();
  const [routeData, setRouteData] = useState(null);

  // Auto-fit to bounds when markers change
  useEffect(() => {
    if (pickup?.lat && dropoff?.lat && mapRef.current) {
      const bounds = new mapboxgl.LngLatBounds()
        .extend([pickup.lng, pickup.lat])
        .extend([dropoff.lng, dropoff.lat]);
      
      mapRef.current.fitBounds(bounds, {
        padding: 40,
        duration: 1500
      });
    }
  }, [pickup, dropoff]);

  // Fetch route
  useEffect(() => {
    async function fetchRoute() {
      if (pickup && dropoff) {
        const route = await getMapboxRoute(pickup, dropoff);
        if (route && route.geometry) {
          setRouteData(route.geometry);
        }
      }
    }
    fetchRoute();
  }, [pickup, dropoff]);

  if (!mapboxToken || !pickup || !dropoff) return null;

  return (
    <div className="w-full h-40 rounded-[2rem] overflow-hidden border border-gray-100 shadow-inner relative group bg-gray-50">
      <Map
        ref={mapRef}
        mapboxAccessToken={mapboxToken}
        initialViewState={{
          longitude: (pickup.lng + dropoff.lng) / 2,
          latitude: (pickup.lat + dropoff.lat) / 2,
          zoom: 11
        }}
        style={{ width: '100%', height: '100%' }}
        mapStyle="mapbox://styles/mapbox/light-v11"
        interactive={false}
      >
        {routeData && (
          <Source id="routeSource" type="geojson" data={{ type: 'Feature', geometry: routeData }}>
            <Layer
              id="routeLayer"
              type="line"
              layout={{ 'line-join': 'round', 'line-cap': 'round' }}
              paint={{ 'line-color': '#10b981', 'line-width': 4, 'line-opacity': 0.8 }}
            />
          </Source>
        )}
        <Marker longitude={pickup.lng} latitude={pickup.lat} anchor="bottom">
          <div className="relative">
            <div className="w-6 h-6 bg-emerald-500 rounded-full flex items-center justify-center text-white shadow-lg border-2 border-white">
               <div className="w-1.5 h-1.5 bg-white rounded-full"></div>
            </div>
            <div className="absolute -top-6 left-1/2 -translate-x-1/2 bg-white px-2 py-0.5 rounded-lg text-[8px] font-black uppercase text-emerald-700 shadow-sm border border-emerald-100">Pick-up</div>
          </div>
        </Marker>

        <Marker longitude={dropoff.lng} latitude={dropoff.lat} anchor="bottom">
           <MapPin size={28} className="text-charcoal-900 fill-white drop-shadow-md" />
        </Marker>
      </Map>
      
      {/* Overlay gradient */}
      <div className="absolute inset-0 pointer-events-none bg-gradient-to-t from-black/10 to-transparent"></div>
    </div>
  );
}
