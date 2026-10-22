"use server";

import { validateAdmin, logAdminAction } from "@/utils/admin";
import { createClient } from "@/utils/supabase/server";
import { revalidatePath } from "next/cache";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// ─── Force Cancel ────────────────────────────────────────────────────────────
export async function forceCancelOrder(orderId, reason = "Ops Override") {
  try {
    const { admin } = await validateAdmin();
    const supabase = await createClient();

    const { error } = await supabase
      .from("orders")
      .update({
        status: "cancelled",
        payment_status: "voided",
        negotiation_status: "terminated",
        rider_id: null,
      })
      .eq("id", orderId);

    if (error) throw error;

    await logAdminAction(admin.id, "FORCE_CANCEL_ORDER", "order", orderId, { reason });
    revalidatePath("/ops-terminal/orders");
    return { success: true };
  } catch (err) {
    console.error("forceCancelOrder:", err);
    return { success: false, error: err.message };
  }
}

// ─── Offer to Rider (broadcast — rider still taps Accept) ───────────────────
export async function assignRiderToOrder(orderId, riderId) {
  try {
    const { admin } = await validateAdmin();
    if (!UUID_RE.test(orderId || "") || !UUID_RE.test(riderId || ""))
      return { success: false, error: "Invalid order or rider." };

    const { createAdminClient } = await import("@/utils/supabase/admin");
    const db = createAdminClient();

    const { data: order } = await db
      .from("orders")
      .select("id, status, rider_id, pickup_name, dropoff_name")
      .eq("id", orderId)
      .maybeSingle();
    if (!order) return { success: false, error: "Order not found." };
    if (order.rider_id || !["pending", "looking_for_driver"].includes(order.status))
      return { success: false, error: "Order is not open." };

    const { data: rider } = await db
      .from("riders")
      .select("id, user_id, approved, users(name, full_name)")
      .eq("id", riderId)
      .maybeSingle();
    if (!rider || rider.approved !== true)
      return { success: false, error: "Rider not approved." };

    const { error } = await db
      .from("order_broadcasts")
      .upsert({ order_id: orderId, rider_id: riderId, source: "admin" }, { onConflict: "order_id,rider_id" });
    if (error) throw error;

    const name = rider.users?.full_name || rider.users?.name || "a rider";

    const { sendPushToUsers } = await import("@/utils/pushSend");
    await sendPushToUsers([rider.user_id], {
      title: "NaijaDrops assigned you a delivery",
      body: `${String(order.pickup_name || "").split(",")[0]} → ${String(order.dropoff_name || "").split(",")[0]}. Open the app to accept.`,
      url: "/rider/dashboard",
    });

    const { sendTelegram, escapeHtml } = await import("@/utils/telegram");
    await sendTelegram(
      `👤 <b>Offered</b> #${escapeHtml(orderId.slice(0, 6).toUpperCase())} to <b>${escapeHtml(name)}</b>. Waiting for them to accept.`
    );

    await logAdminAction(admin.id, "OFFER_RIDER", "order", orderId, { riderId });
    revalidatePath("/ops-terminal/orders");
    return { success: true, msg: `Offered to ${name}. They can accept now.` };
  } catch (err) {
    console.error("assignRiderToOrder:", err);
    return { success: false, error: err.message || "Could not offer." };
  }
}

// ─── Force Assign (direct match — triggers payment immediately) ──────────────
export async function forceAssignRiderToOrder(orderId, riderId) {
  try {
    const { admin } = await validateAdmin();
    if (!UUID_RE.test(orderId || "") || !UUID_RE.test(riderId || ""))
      return { success: false, error: "Invalid order or rider." };

    const { createAdminClient } = await import("@/utils/supabase/admin");
    const db = createAdminClient();

    const { data: rider } = await db
      .from("riders")
      .select("id, user_id, approved, users(name, full_name)")
      .eq("id", riderId)
      .maybeSingle();
    if (!rider || rider.approved !== true)
      return { success: false, error: "Rider not approved." };

    // Delegate concurrency + validation to the DB function
    const { error } = await db.rpc("force_assign_rider", {
      p_order_id: orderId,
      p_rider_id: riderId,
    });
    if (error) return { success: false, error: error.message };

    const { data: order } = await db
      .from("orders")
      .select("pickup_name, dropoff_name, vendor_id, vendors(user_id)")
      .eq("id", orderId)
      .maybeSingle();

    const riderName = rider.users?.full_name || rider.users?.name || "a rider";

    const { sendPushToUsers } = await import("@/utils/pushSend");
    // Notify rider
    await sendPushToUsers([rider.user_id], {
      title: "You have been assigned a delivery!",
      body: `${String(order?.pickup_name || "").split(",")[0]} → ${String(order?.dropoff_name || "").split(",")[0]}. Open the app to start.`,
      url: "/rider/active-job",
    });
    // Notify vendor to complete payment
    if (order?.vendors?.user_id) {
      await sendPushToUsers([order.vendors.user_id], {
        title: "Rider assigned — payment needed",
        body: "A rider has been locked in for your delivery. Tap to complete payment.",
        url: `/tracking/${orderId}`,
      });
    }

    const { sendTelegram, escapeHtml } = await import("@/utils/telegram");
    await sendTelegram(
      `⚡ <b>LOCKED IN</b> #${escapeHtml(orderId.slice(0, 6).toUpperCase())} → <b>${escapeHtml(riderName)}</b>. Vendor prompted to pay.`
    );

    await logAdminAction(admin.id, "FORCE_ASSIGN_RIDER", "order", orderId, { riderId });
    revalidatePath("/ops-terminal/orders");
    return { success: true, msg: `Locked to ${riderName}. Vendor prompted to pay.` };
  } catch (err) {
    console.error("forceAssignRiderToOrder:", err);
    return { success: false, error: err.message || "Could not lock in." };
  }
}

// ─── Reassign (swap rider on a matched order) ────────────────────────────────
export async function reassignOrder(orderId, newRiderId) {
  try {
    const { admin } = await validateAdmin();
    if (!UUID_RE.test(orderId || "") || !UUID_RE.test(newRiderId || ""))
      return { success: false, error: "Invalid IDs." };

    const { createAdminClient } = await import("@/utils/supabase/admin");
    const db = createAdminClient();

    const { data: newRider } = await db
      .from("riders")
      .select("id, user_id, approved, users(name, full_name)")
      .eq("id", newRiderId)
      .maybeSingle();
    if (!newRider || newRider.approved !== true)
      return { success: false, error: "New rider not approved." };

    // Get old rider user_id before reassign
    const { data: order } = await db
      .from("orders")
      .select("rider_id, pickup_name, dropoff_name, vendors(user_id), riders(user_id, users(name, full_name))")
      .eq("id", orderId)
      .maybeSingle();

    const { error } = await db.rpc("reassign_rider", {
      p_order_id: orderId,
      p_new_rider_id: newRiderId,
    });
    if (error) return { success: false, error: error.message };

    const oldRiderUserId = order?.riders?.user_id;
    const newRiderName = newRider.users?.full_name || newRider.users?.name || "a rider";

    const { sendPushToUsers } = await import("@/utils/pushSend");
    if (oldRiderUserId) {
      await sendPushToUsers([oldRiderUserId], {
        title: "Delivery reassigned",
        body: "This delivery has been handed to another rider. You're now free.",
        url: "/rider/dashboard",
      });
    }
    await sendPushToUsers([newRider.user_id], {
      title: "You've been assigned a delivery!",
      body: `${String(order?.pickup_name || "").split(",")[0]} → ${String(order?.dropoff_name || "").split(",")[0]}.`,
      url: "/rider/active-job",
    });
    if (order?.vendors?.user_id) {
      await sendPushToUsers([order.vendors.user_id], {
        title: "Your rider has changed",
        body: `${newRiderName} has been assigned to your delivery. It's on track.`,
        url: `/tracking/${orderId}`,
      });
    }

    const { sendTelegram, escapeHtml } = await import("@/utils/telegram");
    const oldName = order?.riders?.users?.full_name || order?.riders?.users?.name || "prev rider";
    await sendTelegram(
      `🔄 <b>REASSIGNED</b> #${escapeHtml(orderId.slice(0, 6).toUpperCase())}: ${escapeHtml(oldName)} → <b>${escapeHtml(newRiderName)}</b>`
    );

    await logAdminAction(admin.id, "REASSIGN_RIDER", "order", orderId, { newRiderId });
    revalidatePath("/ops-terminal/orders");
    return { success: true, msg: `Reassigned to ${newRiderName}.` };
  } catch (err) {
    console.error("reassignOrder:", err);
    return { success: false, error: err.message || "Could not reassign." };
  }
}
