"use client";

import React, { useState, useEffect, useRef } from 'react';
import Map, { Marker, Source, Layer } from 'react-map-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import mapboxgl from 'mapbox-gl';
import { MapPin, Globe } from 'lucide-react';
import { getMapboxRoute } from '@/utils/mapbox';

// workerClass override removed to fix blank map in Next.js 14+

export default function TrackingMap({ driverLocation, dropoffLocation, demandData }) {
  const mapboxToken = process.env.NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN;
  const mapRef = useRef();

  useEffect(() => {
    if (!mapboxToken) {
        console.warn("[MAPBOX] Missing NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN. Map rendering will be disabled.");
    } else if (mapboxToken.startsWith('pk.ey') === false) {
        console.error("[MAPBOX] Provided token does not appear to be a valid Mapbox public key.");
    }
  }, [mapboxToken]);
  
  const [routeData, setRouteData] = useState(null);
  const [routeDuration, setRouteDuration] = useState(null);
  
  // Interpolation state
  const [displayedDriverLocation, setDisplayedDriverLocation] = useState(driverLocation);
  const animationRef = useRef(null);

  if (!driverLocation) return null;

  // Fetch Route
  useEffect(() => {
    async function fetchRoute() {
      if (driverLocation && dropoffLocation) {
        const route = await getMapboxRoute(driverLocation, dropoffLocation);
        if (route && route.geometry) {
          setRouteData(route.geometry);
          setRouteDuration(route.duration);
        }
      }
    }
    fetchRoute();
  }, [driverLocation, dropoffLocation]);

  // Interpolate marker smoothly
  useEffect(() => {
    if (!driverLocation || !displayedDriverLocation) {
        if (driverLocation) setDisplayedDriverLocation(driverLocation);
        return;
    }

    const startLat = displayedDriverLocation.lat;
    const startLng = displayedDriverLocation.lng;
    const endLat = driverLocation.lat;
    const endLng = driverLocation.lng;

    // Fixed animation duration (e.g. 2000ms for smooth glide between polling intervals)
    const duration = 2000;
    
    // Avoid animation if locations are identical to save resources
    if (startLat === endLat && startLng === endLng) return;

    let startTime;

    const animateMarker = (timestamp) => {
      if (!startTime) startTime = timestamp;
      const progress = timestamp - startTime;
      const easeProgress = Math.min(progress / duration, 1);

      setDisplayedDriverLocation({
        lat: startLat + (endLat - startLat) * easeProgress,
        lng: startLng + (endLng - startLng) * easeProgress
      });

      if (progress < duration) {
        animationRef.current = requestAnimationFrame(animateMarker);
      }
    };

    if (animationRef.current) cancelAnimationFrame(animationRef.current);
    animationRef.current = requestAnimationFrame(animateMarker);

    return () => {
      if (animationRef.current) cancelAnimationFrame(animationRef.current);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [driverLocation]);

  return (
    <div className="h-full w-full bg-gray-100 relative">
      {mapboxToken ? (
        <Map
          mapboxAccessToken={mapboxToken}
          ref={mapRef}
          initialViewState={{
            longitude: driverLocation.lng,
            latitude: driverLocation.lat,
            zoom: 12.5
          }}
          style={{ width: '100%', height: '100%' }}
          mapStyle="mapbox://styles/mapbox/streets-v12"
        >
          {routeData && (
              <Source id="routeSource" type="geojson" data={{ type: 'Feature', geometry: routeData }}>
                  <Layer
                      id="routeLayer"
                      type="line"
                      layout={{ 'line-join': 'round', 'line-cap': 'round' }}
                      paint={{ 'line-color': '#3b82f6', 'line-width': 5, 'line-opacity': 0.7 }}
                  />
              </Source>
          )}
          
          {/* Surge Demand Heatmap Layer */}
          {demandData && demandData.length > 0 && (
              <Source 
                 id="demandSource" 
                 type="geojson" 
                 data={{
                     type: 'FeatureCollection',
                     features: demandData.map(order => ({
                         type: 'Feature',
                         properties: { weight: 1 },
                         geometry: {
                             type: 'Point',
                             coordinates: [order.pickup_lng, order.pickup_lat]
                         }
                     }))
                 }}
              >
                  <Layer
                      id="demandHeatmap"
                      type="heatmap"
                      paint={{
                          // Increase the heatmap weight based on frequency and property weight
                          'heatmap-weight': ['interpolate', ['linear'], ['get', 'weight'], 0, 0, 1, 1],
                          // Increase the heatmap color weight weight by zoom level
                          // heatmap-intensity is a multiplier on top of heatmap-weight
                          'heatmap-intensity': ['interpolate', ['linear'], ['zoom'], 0, 1, 15, 3],
                          // Color ramp for heatmap.  Domain is 0 (low) to 1 (high).
                          // Begin color ramp at 0-stop with a 0-transparancy color
                          // to create a blur-like effect.
                          'heatmap-color': [
                              'interpolate', ['linear'], ['heatmap-density'],
                              0, 'rgba(16,185,129,0)',
                              0.2, 'rgba(16,185,129,0.3)',
                              0.4, 'rgba(52,211,153,0.5)',
                              0.6, 'rgba(250,204,21,0.6)',
                              0.8, 'rgba(251,146,60,0.8)',
                              1, 'rgba(239,68,68,0.9)'
                          ],
                          // Adjust the heatmap radius by zoom level
                          'heatmap-radius': ['interpolate', ['linear'], ['zoom'], 0, 10, 15, 40],
                          // Transition from heatmap to circle layer by zoom level
                          'heatmap-opacity': ['interpolate', ['linear'], ['zoom'], 7, 1, 16, 0.5]
                      }}
                  />
              </Source>
          )}

          {/* Driver Position with Dynamic ETA overlay (Map Matching pseudo-snap) */}
          {displayedDriverLocation && (
              <Marker longitude={displayedDriverLocation.lng} latitude={displayedDriverLocation.lat} anchor="center" style={{zIndex: 50}}>
                <div className="relative">
                    <div style={{
                      backgroundColor: 'white', 
                      borderRadius: '50%', 
                      width: '32px', 
                      height: '32px', 
                      display: 'flex', 
                      alignItems: 'center', 
                      justifyContent: 'center', 
                      boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1)', 
                      border: '2px solid #10b981'
                    }}>
                      <div style={{ fontSize: '16px' }}>ðŸš™</div>
                    </div>
                    {routeDuration && (
                        <div className="absolute -top-7 left-1/2 -translate-x-1/2 bg-charcoal-900 border border-emerald-500 rounded-full px-2.5 py-0.5 whitespace-nowrap shadow-xl">
                            <span className="text-[10px] font-black text-emerald-400 uppercase tracking-widest">
                                ETA {Math.max(1, Math.round(routeDuration / 60))} MIN
                            </span>
                        </div>
                    )}
                </div>
          </Marker>
          )}

          {/* Dropoff Position */}
          {dropoffLocation && (
              <Marker longitude={dropoffLocation.lng} latitude={dropoffLocation.lat} anchor="bottom">
                <MapPin size={38} className="text-emerald-500 fill-white" />
              </Marker>
          )}
        </Map>
      ) : (
        <div className="w-full h-full flex flex-col items-center justify-center text-charcoal-400 p-8 text-center bg-gray-50 dark:bg-charcoal-900 border-2 border-dashed border-charcoal-200 dark:border-white/5 rounded-[3rem]">
           <Globe size={48} className="mb-6 text-emerald-500/40 animate-pulse" />
           <p className="font-black text-[10px] uppercase tracking-[0.4em] text-emerald-600 dark:text-emerald-400">Map Loading Lifecycle...</p>
           <p className="mt-4 text-[9px] text-charcoal-500 font-bold max-w-[240px] leading-relaxed uppercase tracking-widest">
             Token Status: {mapboxToken ? 'Connected' : 'Disconnected'}
           </p>
        </div>
      )}
    </div>
  );
}
