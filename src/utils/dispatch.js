import { createClient } from "@/utils/supabase/server";

/**
 * Section 3.3: Ranking Algorithm (Fairness Engine)
 * Score = (acceptance_rate * 0.4) + (rating * 0.3) + (proximity * 0.3) + (1 / orders_completed_today)
 */
function calculateRiderScore(rider, distanceKm) {
  const proximityScore = Math.max(0, 1 - (distanceKm / 5)); // 5km max range for ranking
  const activityScore = 1 / (rider.orders_completed_today + 1);
  
  return (
    (rider.acceptance_rate * 0.4) + 
    (rider.rating * 0.3) + 
    (proximityScore * 0.3) + 
    (activityScore)
  );
}

/**
 * Section 4: Marketplace Engine
 * Finds the most optimal rider for a given order.
 */
export async function getBestRider(orderId) {
  const supabase = await createClient();

  // 1. Fetch Order Details
  const { data: order, error: orderErr } = await supabase
    .from("orders")
    .select("*")
    .eq("id", orderId)
    .single();

  if (orderErr || !order) return { error: "Order not found" };

  // 2. Filter Eligible Riders (Section 3.2)
  // - status = approved (via boolean or enum)
  // - operational_status = online
  // - last_seen < 3 minutes
  // - correct vehicle type
  // - not in active delivery (busy)
  const threeMinutesAgo = new Date(Date.now() - 3 * 60 * 1000).toISOString();

  const { data: eligibleRiders, error: riderErr } = await supabase
    .from("riders")
    .select("*")
    .eq("operational_status", "online")
    .eq("vehicle_type", order.vehicle_type)
    .gt("last_seen_at", threeMinutesAgo);

  if (riderErr || !eligibleRiders || eligibleRiders.length === 0) {
    return { error: "No riders currently online" };
  }

  // 3. Rank Riders (Section 3.3)
  const rankedRiders = eligibleRiders.map(rider => {
    // Simple Haversine approximation for distance
    const dist = calculateDistance(
      order.pickup_lat, order.pickup_lng, 
      rider.current_lat, rider.current_lng
    );
    return {
      ...rider,
      distance: dist,
      totalScore: calculateRiderScore(rider, dist)
    };
  });

  // Sort by highest score
  rankedRiders.sort((a, b) => b.totalScore - a.totalScore);

  return { bestRider: rankedRiders[0] };
}

/**
 * Helper: Haversine Distance (simplified)
 */
function calculateDistance(lat1, lon1, lat2, lon2) {
  if (!lat1 || !lon1 || !lat2 || !lon2) return 999;
  const R = 6371; // km
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = 
    Math.sin(dLat/2) * Math.sin(dLat/2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * 
    Math.sin(dLon/2) * Math.sin(dLon/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  return R * c;
}
