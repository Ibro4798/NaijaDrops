"use client";

import { useEffect, useRef } from "react";
import { createClient } from "@/utils/supabase/client";
import { isPlausibleMove } from "@/utils/geolocation";

/**
 * Driver Heartbeat Component
 * - Behavior: Only syncs if the driver is ONLINE
 * - Resilience: Fails silently to prevent UI disruption
 *
 * FIX (location accuracy): this used to call a fresh, cold
 * navigator.geolocation.getCurrentPosition() every ~35 seconds with no
 * accuracy filtering at all - whatever came back within 10s got written
 * straight to the database and shown on the map. On Nigerian mobile
 * networks, a phone that hasn't locked GPS within that window commonly
 * falls back to network-based positioning, which can be badly wrong - so
 * the rider's dot would periodically jump to an inaccurate spot, then jump
 * back on the next good reading. That's the "inaccurate live location" bug.
 *
 * Now uses watchPosition() to keep the GPS radio warm continuously instead
 * of re-acquiring a fix from scratch every cycle (yields meaningfully
 * better accuracy over time), tracks the best (lowest-accuracy) sample
 * seen, and - critically - rejects any single reading that would imply
 * physically impossible movement since the last CONFIRMED position (see
 * isPlausibleMove in utils/geolocation.js) rather than blindly overwriting
 * a good position with a noisy one.
 */
const PUSH_INTERVAL_MS = 20000;
const MAX_PLAUSIBLE_KPH = 100;

export default function DriverHeartbeat({ riderId, isOnline }) {
  const supabase = createClient();
  const timerRef = useRef(null);
  const watchIdRef = useRef(null);
  const bestSampleRef = useRef(null); // best reading since the last push
  const lastConfirmedRef = useRef(null); // last position actually written to the DB

  useEffect(() => {
    if (!riderId || !isOnline || typeof navigator === "undefined" || !("geolocation" in navigator)) {
      if (timerRef.current) clearInterval(timerRef.current);
      if (watchIdRef.current !== null) navigator.geolocation.clearWatch(watchIdRef.current);
      return;
    }

    // Keep GPS warm continuously - each callback is a fresh sample, and we
    // just remember whichever one had the best (lowest) accuracy since the
    // last time we pushed to the DB.
    watchIdRef.current = navigator.geolocation.watchPosition(
      (pos) => {
        const sample = {
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          accuracy: pos.coords.accuracy,
          timestamp: pos.timestamp || Date.now(),
        };
        if (!bestSampleRef.current || sample.accuracy < bestSampleRef.current.accuracy) {
          bestSampleRef.current = sample;
        }
      },
      (err) => {
        console.warn("[HEARTBEAT] watchPosition error:", err.message);
      },
      { enableHighAccuracy: true, maximumAge: 5000, timeout: 15000 }
    );

    const pushBestSample = async () => {
      const sample = bestSampleRef.current;
      if (!sample) return;

      // Deterministic jump-rejection: if this best sample implies an
      // impossible speed versus the last position we actually confirmed
      // and wrote to the DB, it's noise - skip this cycle rather than
      // publish a bad jump. The next cycle gets a fresh chance.
      if (!isPlausibleMove(lastConfirmedRef.current, sample, MAX_PLAUSIBLE_KPH)) {
        console.warn("[HEARTBEAT] Rejected implausible jump", sample);
        bestSampleRef.current = null;
        return;
      }

      try {
        await supabase
          .from("riders")
          .update({
            current_lat: sample.lat,
            current_lng: sample.lng,
            last_seen_at: new Date().toISOString()
          })
          .eq("id", riderId);

        await supabase
          .from("rider_locations")
          .insert({
            rider_id: riderId,
            lat: sample.lat,
            lng: sample.lng,
          });

        lastConfirmedRef.current = sample;
        console.log("[HEARTBEAT] Location synced at", new Date().toLocaleTimeString(), `±${Math.round(sample.accuracy)}m`);
      } catch (err) {
        // Silent fail to preserve driver experience
      } finally {
        // Reset so next interval only pushes a genuinely new sample.
        bestSampleRef.current = null;
      }
    };

    timerRef.current = setInterval(pushBestSample, PUSH_INTERVAL_MS);

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      if (watchIdRef.current !== null) navigator.geolocation.clearWatch(watchIdRef.current);
    };
  }, [riderId, isOnline]);

  return null; // Headless component
}