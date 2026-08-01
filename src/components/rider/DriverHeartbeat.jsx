"use client";

import { useEffect, useRef } from "react";
import { createClient } from "@/utils/supabase/client";
import { isPlausibleMove } from "@/utils/geolocation";

/**
 * Driver Heartbeat Component
 * - Behavior: Only syncs if the driver is ONLINE
 * - Resilience: Fails silently to prevent UI disruption
 *
 * Uses watchPosition() to keep the GPS radio warm continuously instead of
 * re-acquiring a fix from scratch every cycle, tracks the best
 * (lowest-accuracy) sample seen, and rejects any single reading that would
 * imply physically impossible movement since the last CONFIRMED position
 * (see isPlausibleMove in utils/geolocation.js).
 *
 * FIX (low-network resilience): a failed Supabase write used to just be
 * dropped - the sample was discarded either way, so a rider on a bad
 * connection could go visibly "frozen" on the vendor/customer map for
 * minutes at a time even though their phone had a perfectly good GPS fix
 * the whole time; it just couldn't get a packet out. Now:
 *   1. A sample that fails to push is kept and retried on the NEXT cycle
 *      instead of being thrown away, so a brief network hiccup doesn't
 *      cost a position update.
 *   2. navigator.onLine is checked before attempting a push at all, and an
 *      'online' event listener fires an immediate retry the moment
 *      connectivity returns, rather than waiting up to a full interval.
 *   3. On a detected slow connection (Network Information API, where
 *      supported) the push interval backs off so failed requests don't
 *      pile up faster than they can clear.
 *   4. The last confirmed position is cached in localStorage, so a rider
 *      who closes and reopens the app mid-shift on a spotty connection
 *      resumes from their real last-known position for the speed-sanity
 *      check instead of treating the next reading as the first ever seen
 *      (which would otherwise always accept it unconditionally).
 */
const PUSH_INTERVAL_MS = 20000;
const SLOW_PUSH_INTERVAL_MS = 35000;
const MAX_PLAUSIBLE_KPH = 100;
const STALE_QUEUED_SAMPLE_MS = 3 * 60 * 1000; // drop a retried sample this old - it's not "current" anymore
const CACHE_KEY_PREFIX = "nd_rider_last_loc_";

function isSlowConnection() {
  if (typeof navigator === "undefined") return false;
  const conn = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
  if (!conn) return false;
  return conn.effectiveType === "slow-2g" || conn.effectiveType === "2g" || conn.saveData === true;
}

export default function DriverHeartbeat({ riderId, isOnline }) {
  const supabase = createClient();
  const timerRef = useRef(null);
  const watchIdRef = useRef(null);
  const bestSampleRef = useRef(null); // best fresh reading since the last push attempt
  const pendingSampleRef = useRef(null); // a sample that failed to push and is queued for retry
  const lastConfirmedRef = useRef(null); // last position actually written to the DB

  useEffect(() => {
    if (!riderId || !isOnline || typeof navigator === "undefined" || !("geolocation" in navigator)) {
      if (timerRef.current) clearInterval(timerRef.current);
      if (watchIdRef.current !== null) navigator.geolocation.clearWatch(watchIdRef.current);
      return;
    }

    // Resume from the last confirmed position cached locally, so a restart
    // mid-shift doesn't reset the speed-sanity baseline to "anything goes".
    try {
      const cached = localStorage.getItem(CACHE_KEY_PREFIX + riderId);
      if (cached) lastConfirmedRef.current = JSON.parse(cached);
    } catch {
      // localStorage unavailable/corrupt - fine, just starts without a baseline
    }

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

    const pushSample = async () => {
      // Prefer a fresh sample; fall back to a previously-failed one queued
      // for retry so a network hiccup doesn't just eat a position update.
      let sample = bestSampleRef.current || pendingSampleRef.current;
      if (!sample) return;

      if (pendingSampleRef.current === sample && Date.now() - sample.timestamp > STALE_QUEUED_SAMPLE_MS) {
        // This retried sample is old enough that publishing it now would be
        // misleading (the rider has likely moved since) - drop it and wait
        // for the next fresh watchPosition callback instead.
        pendingSampleRef.current = null;
        return;
      }

      if (typeof navigator !== "undefined" && navigator.onLine === false) {
        // No point attempting a write we know will fail - queue it and let
        // the 'online' listener below trigger a retry the moment we're back.
        pendingSampleRef.current = sample;
        bestSampleRef.current = null;
        return;
      }

      if (!isPlausibleMove(lastConfirmedRef.current, sample, MAX_PLAUSIBLE_KPH)) {
        console.warn("[HEARTBEAT] Rejected implausible jump", sample);
        bestSampleRef.current = null;
        pendingSampleRef.current = null;
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
        pendingSampleRef.current = null;
        try {
          localStorage.setItem(CACHE_KEY_PREFIX + riderId, JSON.stringify(sample));
        } catch {
          // storage full/unavailable - not fatal, just skip caching this time
        }
        console.log("[HEARTBEAT] Location synced at", new Date().toLocaleTimeString(), `±${Math.round(sample.accuracy)}m`);
      } catch (err) {
        // Keep this sample queued for the next cycle instead of discarding
        // it - a transient network failure shouldn't cost a position update.
        pendingSampleRef.current = sample;
        console.warn("[HEARTBEAT] Push failed, will retry next cycle:", err?.message);
      } finally {
        bestSampleRef.current = null;
      }
    };

    const scheduleTimer = () => {
      if (timerRef.current) clearInterval(timerRef.current);
      const interval = isSlowConnection() ? SLOW_PUSH_INTERVAL_MS : PUSH_INTERVAL_MS;
      timerRef.current = setInterval(pushSample, interval);
    };
    scheduleTimer();

    // Re-check connection quality periodically in case it changes mid-shift
    // (e.g. rider walks from a weak-signal alley onto a main road).
    const qualityCheckId = setInterval(scheduleTimer, 60000);

    // Retry immediately on reconnect rather than waiting out the rest of
    // the current interval with a stale queued sample sitting idle.
    const handleOnline = () => pushSample();
    window.addEventListener("online", handleOnline);

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      clearInterval(qualityCheckId);
      window.removeEventListener("online", handleOnline);
      if (watchIdRef.current !== null) navigator.geolocation.clearWatch(watchIdRef.current);
    };
  }, [riderId, isOnline]);

  return null; // Headless component
}
