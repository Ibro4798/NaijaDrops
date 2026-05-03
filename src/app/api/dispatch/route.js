import { getBestRider } from "@/utils/dispatch";
import { createClient } from "@/utils/supabase/server";
import { NextResponse } from "next/server";

// Section 7: Kano Pilot Geofence (Metropolitan Bounds)
const KANO_BOUNDS = {
  minLat: 11.9000, maxLat: 12.1000,
  minLng: 8.4000, maxLng: 8.6500
};

function isWithinPilotZone(lat, lng) {
  return lat >= KANO_BOUNDS.minLat && lat <= KANO_BOUNDS.maxLat &&
         lng >= KANO_BOUNDS.minLng && lng <= KANO_BOUNDS.maxLng;
}

export async function POST(req) {
  try {
    const { orderId } = await req.json();
    const supabase = await createClient();

    // 1. Fetch Order
    const { data: order } = await supabase
      .from("orders")
      .select("*")
      .eq("id", orderId)
      .single();

    if (!order) return NextResponse.json({ error: "Order not found" }, { status: 404 });

    // 2. Section 7: Geofence Validation
    if (!isWithinPilotZone(order.pickup_lat, order.pickup_lng)) {
      return NextResponse.json({ 
        success: false, 
        message: "NaijaDrops is currently in Kano pilot zone only." 
      });
    }

    // 3. Section 4: Trigger Dispatch Engine
    const { bestRider, error } = await getBestRider(orderId);

    if (error || !bestRider) {
      return NextResponse.json({ 
        success: false, 
        message: error || "Search complete: No active riders found nearby." 
      });
    }

    // 4. Section 3.4: Order Locking Rule
    // Lock the rider to the order and move to 'matched' state
    const { error: lockError } = await supabase
      .from("orders")
      .update({ 
        rider_id: bestRider.id,
        status: "matched",
        locked: true // Preventing race conditions
      })
      .eq("id", orderId);

    if (lockError) throw lockError;

    return NextResponse.json({ 
      success: true, 
      riderId: bestRider.id,
      message: "Rider Matched" 
    });

  } catch (err) {
    console.error("Dispatch API Error:", err);
    return NextResponse.json({ error: "System Fault: Dispatch Logic Failed" }, { status: 500 });
  }
}
