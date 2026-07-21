import { getBestRider } from "@/utils/dispatch";
import { createAdminClient } from "@/utils/supabase/admin";
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
    // FIX: this was the actual root cause of jobs never reaching riders.
    // order_broadcasts has RLS enabled with only a SELECT policy (riders can
    // see their own broadcasts) - there was no INSERT policy at all, so the
    // .upsert() below was being silently rejected by RLS every single time
    // it ran under the calling vendor's own session. Dispatch is inherently
    // a privileged, system-level operation - it shouldn't depend on the
    // requesting vendor's own row permissions - so this now runs with the
    // service-role client, matching how admin actions already work
    // elsewhere in this codebase, rather than trying to write a permissive-
    // enough RLS policy for an operation that was never really "the vendor's
    // own" action to begin with.
    const supabase = createAdminClient();

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

    // 3. Section 4: Trigger Dispatch Engine (expanding Uber-style broadcast)
    const { data: riders, error: rpcError } = await supabase
      .rpc('get_nearby_online_riders', { p_order_id: orderId });

    if (rpcError) {
      return NextResponse.json({ 
        success: false, 
        message: rpcError.message || "Dispatch logic failed." 
      });
    }

    if (!riders || riders.length === 0) {
      return NextResponse.json({ 
        success: false, 
        message: "No active riders found nearby." 
      });
    }

    // Broadcast the order to all returned riders
    const inserts = riders.map(r => ({
      order_id: orderId,
      rider_id: r.id
    }));

    const { error: insertError } = await supabase
      .from("order_broadcasts")
      .upsert(inserts, { onConflict: "order_id,rider_id" });

    if (insertError) {
      console.error("Broadcast insert error:", insertError);
      return NextResponse.json({ 
        success: false, 
        message: "Failed to broadcast order to riders." 
      });
    }

    return NextResponse.json({ 
      success: true, 
      broadcastCount: riders.length,
      message: `Order broadcasted to ${riders.length} riders.` 
    });

  } catch (err) {
    console.error("Dispatch API Error:", err);
    return NextResponse.json({ error: "System Fault: Dispatch Logic Failed" }, { status: 500 });
  }
}
