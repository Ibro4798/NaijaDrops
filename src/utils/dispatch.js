"use server";

import { createClient } from "@/utils/supabase/server";

// Haversine distance in km
function getDistanceInKm(lat1, lon1, lat2, lon2) {
  const R = 6371; 
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = 
    Math.sin(dLat/2) * Math.sin(dLat/2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * 
    Math.sin(dLon/2) * Math.sin(dLon/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a)); 
  return R * c; 
}

/**
 * Core MVP Dispatch Logic
 * Finds the nearest online rider and assigns them to the newly created order.
 */
export async function assignNearestRider(orderId, pickupLat, pickupLng) {
  const supabase = await createClient();

  try {
    // 1. Fetch all currently online, approved riders
    const { data: riders, error: riderError } = await supabase
      .from('riders')
      .select('id, user_id, status, approved')
      .eq('status', 'online')
      .eq('approved', true);

    if (riderError) throw riderError;

    if (!riders || riders.length === 0) {
      console.log(`[DISPATCH] No riders online for order ${orderId}`);
      return { success: false, message: "No riders available right now." };
    }

    // 2. We need the latest location of these online riders 
    // In a real system with 10k riders this should purely happen in DB with PostGIS
    // For MVP, we fetch the latest location per rider
    const onlineRiderIds = riders.map(r => r.id);
    const { data: locations, error: locError } = await supabase
      .from('rider_locations')
      .select('rider_id, lat, lng, timestamp')
      .in('rider_id', onlineRiderIds)
      .order('timestamp', { ascending: false });

    if (locError) throw locError;

    // Isolate latest location per rider
    const latestLocations = {};
    for (const loc of locations || []) {
       if (!latestLocations[loc.rider_id]) {
           latestLocations[loc.rider_id] = loc;
       }
    }

    // 3. Find closest rider
    let closestRiderId = null;
    let minDistance = Infinity;

    for (const rider of riders) {
       const loc = latestLocations[rider.id];
       if (loc) {
          const dist = getDistanceInKm(pickupLat, pickupLng, loc.lat, loc.lng);
          if (dist < minDistance) {
              minDistance = dist;
              closestRiderId = rider.id;
          }
       }
    }

    if (!closestRiderId) {
        console.log(`[DISPATCH] Online riders detected but no GPS pings found.`);
        return { success: false, message: "Riders online but locations unavailable." };
    }

    // 4. Assign the Order
    const { error: updateError } = await supabase
      .from('orders')
      .update({ 
         rider_id: closestRiderId, 
         status: 'assigned',
         updated_at: new Date().toISOString()
      })
      .eq('id', orderId);

    if (updateError) throw updateError;

    // 5. Update Rider Status to busy so they aren't assigned simultaneously
    await supabase.from('riders').update({ status: 'busy' }).eq('id', closestRiderId);

    console.log(`[DISPATCH SUCCESS] Assigned order ${orderId} to Rider ${closestRiderId} at distance ${minDistance.toFixed(2)}km.`);
    return { success: true, riderId: closestRiderId, distance: minDistance };

  } catch (err) {
    console.error("[DISPATCH ERROR]", err);
    return { success: false, error: err.message };
  }
}
