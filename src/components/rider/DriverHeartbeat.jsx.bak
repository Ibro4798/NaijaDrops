"use client";

import { useEffect, useRef } from "react";
import { createClient } from "@/utils/supabase/client";

/**
 * Driver Heartbeat Component (Hardened MVP Logic)
 * - Frequency: ~35 seconds (Data saving optimization)
 * - Behavior: Only syncs if the driver is ONLINE
 * - Resilience: Fails silently to prevent UI disruption
 */
export default function DriverHeartbeat({ riderId, isOnline }) {
  const supabase = createClient();
  const timerRef = useRef(null);

  useEffect(() => {
    if (!riderId || !isOnline) {
      if (timerRef.current) clearInterval(timerRef.current);
      return;
    }

    const sendHeartbeat = async () => {
      if (typeof navigator === "undefined") return;

      navigator.geolocation.getCurrentPosition(async (pos) => {
        const { latitude: lat, longitude: lng } = pos.coords;

        try {
          // 1. Update primary rider record for the map engine
          await supabase
            .from("riders")
            .update({ 
               current_lat: lat, 
               current_lng: lng, 
               last_seen_at: new Date().toISOString() 
            })
            .eq("id", riderId);

          // 2. Insert into spatial history table (for the GiST indexed searches)
          await supabase
            .from("rider_locations")
            .insert({
              rider_id: riderId,
              lat: lat,
              lng: lng,
            });

          console.log("[HEARTBEAT] Location synced at", new Date().toLocaleTimeString());
        } catch (err) {
          // Silent fail to preserve driver experience
        }
      }, (err) => {
        console.warn("[HEARTBEAT] Location access denied or timeout");
      }, {
        enableHighAccuracy: true,
        timeout: 10000
      });
    };

    // Initial beat
    sendHeartbeat();

    // Set interval to ~35 seconds as per User instruction (Data saving)
    timerRef.current = setInterval(sendHeartbeat, 35000);

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [riderId, isOnline]);

  return null; // Headless component
}
