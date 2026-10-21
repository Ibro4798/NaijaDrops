"use server";

import { validateAdmin, logAdminAction } from "@/utils/admin";
import { createClient } from "@/utils/supabase/server";
import { revalidatePath } from "next/cache";

/**
 * Force Cancel a Dispatch (Ops Override)
 * This will void the escrow hold and release the driver.
 */
export async function forceCancelOrder(orderId, reason = "Ops Override") {
  try {
    const { admin } = await validateAdmin(); // Layer 2 Check
    const supabase = await createClient();

    // 1. Update Order State Machine (Force Cancel)
    const { error: orderError } = await supabase
      .from("orders")
      .update({ 
        status: "cancelled", 
        payment_status: "voided",
        negotiation_status: "terminated",
        rider_id: null // Release the rider
      })
      .eq("id", orderId);

    if (orderError) throw orderError;

    // 2. Layer 4 Audit Logging
    await logAdminAction(admin.id, "FORCE_CANCEL_ORDER", "order", orderId, { reason });

    revalidatePath("/ops-terminal/orders");
    return { success: true };
  } catch (err) {
    console.error("Ops Override Error:", err);
    return { success: false, error: err.message };
  }
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Offer an open order to one specific rider, even if they are offline. This ADDS to the automatic broadcast:
 * nobody else is removed or locked out, and whoever accepts first gets the job.
 */
export async function assignRiderToOrder(orderId, riderId) {
  try {
    const { admin } = await validateAdmin();
    if (!UUID_RE.test(orderId || "") || !UUID_RE.test(riderId || "")) return { success: false, error: "Invalid order or rider." };
    const { createAdminClient } = await import("@/utils/supabase/admin");
    const db = createAdminClient();

    const { data: order } = await db.from("orders")
      .select("id, status, rider_id, payment_required, payment_status, pickup_name, dropoff_name, agreed_price").eq("id", orderId).maybeSingle();
    if (!order) return { success: false, error: "Order not found." };
    if (order.rider_id || !["pending", "looking_for_driver"].includes(order.status)) {
      return { success: false, error: "This order already has a rider or is no longer open." };
    }
    if (order.payment_required && order.payment_status !== "paid") {
      return { success: false, error: "This order must be paid before a rider can take it." };
    }

    const { data: rider } = await db.from("riders").select("id, user_id, status, approved, users(name)").eq("id", riderId).maybeSingle();
    if (!rider || String(rider.status) !== "approved" || rider.approved !== true) {
      return { success: false, error: "That rider is not approved." };
    }

    const { error } = await db.from("order_broadcasts").upsert(
      { order_id: orderId, rider_id: riderId, source: "admin" },
      { onConflict: "order_id,rider_id" }
    );
    if (error) throw error;

    const name = rider.users?.name || "a rider";
    const { sendPushToUsers } = await import("@/utils/pushSend");
    await sendPushToUsers([rider.user_id], {
      title: "NaijaDrops assigned you a delivery",
      body: `${String(order.pickup_name || "").split(",")[0]} to ${String(order.dropoff_name || "").split(",")[0]}. Open the app to accept.`,
      url: "/rider/dashboard",
    });

    const { sendTelegram, escapeHtml } = await import("@/utils/telegram");
    await sendTelegram(`\uD83D\uDC64 <b>Assigned</b> #${escapeHtml(orderId.slice(0, 6).toUpperCase())} to <b>${escapeHtml(name)}</b>. They can accept it now.`);

    await logAdminAction(admin.id, "ASSIGN_RIDER", "order", orderId, { riderId });
    revalidatePath("/ops-terminal/orders");
    return { success: true, name };
  } catch (err) {
    console.error("assignRiderToOrder:", err);
    return { success: false, error: err.message || "Could not assign." };
  }
}
