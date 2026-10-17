"use server";

import { validateAdmin, logAdminAction } from "@/utils/admin";
import { createAdminClient } from "@/utils/supabase/admin";
import { revalidatePath } from "next/cache";
import { lagosToUtcIso } from "@/utils/windows";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Release paid, scheduled orders to ONE rider.
 * This writes the same (order_id, rider_id) rows that /api/dispatch writes,
 * so the rider sees the order in their normal feed (photos, stops, details)
 * and accepts it through the normal flow. Nobody else is notified.
 */
export async function releaseToRider(orderIds, riderId) {
  try {
    const { admin } = await validateAdmin();

    if (!Array.isArray(orderIds) || orderIds.length === 0 || orderIds.length > 10) {
      return { success: false, error: "Pick between 1 and 10 orders." };
    }
    if (!orderIds.every((id) => UUID_RE.test(id)) || !UUID_RE.test(riderId || "")) {
      return { success: false, error: "Invalid order or rider." };
    }

    const db = createAdminClient();

    const { data: rider } = await db
      .from("riders")
      .select("id, status")
      .eq("id", riderId)
      .maybeSingle();
    if (!rider || rider.status !== "approved") {
      return { success: false, error: "That rider is not approved." };
    }

    // Re-check eligibility on the server: paid, scheduled, and still waiting.
    const { data: eligible, error: eligibleErr } = await db
      .from("orders")
      .select("id")
      .in("id", orderIds)
      .eq("payment_status", "paid")
      .not("scheduled_at", "is", null)
      .in("status", ["pending", "looking_for_driver"]);
    if (eligibleErr) throw eligibleErr;

    if (!eligible || eligible.length === 0) {
      return { success: false, error: "None of those orders can be released (not paid, not scheduled, or already taken)." };
    }

    const rows = eligible.map((o) => ({ order_id: o.id, rider_id: riderId }));
    const { error: upsertErr } = await db
      .from("order_broadcasts")
      .upsert(rows, { onConflict: "order_id,rider_id", ignoreDuplicates: true });
    if (upsertErr) throw upsertErr;

    await logAdminAction(admin.id, "RELEASE_SCHEDULED_ORDERS", "rider", riderId, {
      order_ids: eligible.map((o) => o.id),
      skipped: orderIds.length - eligible.length,
    });

    revalidatePath("/ops-terminal/scheduled");
    return { success: true, released: eligible.length, skipped: orderIds.length - eligible.length };
  } catch (err) {
    console.error("releaseToRider error:", err);
    return { success: false, error: err.message || "Release failed." };
  }
}

function fail(err) {
  console.error("scheduling action error:", err);
  return { success: false, error: err?.message || "Something went wrong." };
}

/**
 * Create a delivery window. Times are entered in Lagos time.
 * cutoffMinutes = how long before the start vendors can still book into it.
 * maxOrders is optional (blank = no limit).
 */
export async function createWindow(input) {
  try {
    const { admin } = await validateAdmin();

    const startsAt = lagosToUtcIso(input?.date, input?.time);
    if (!startsAt) return { success: false, error: "Pick a valid date and start time." };
    const startMs = new Date(startsAt).getTime();
    if (startMs <= Date.now()) return { success: false, error: "The start time must be in the future." };

    const duration = Math.floor(Number(input?.durationMinutes));
    if (!Number.isFinite(duration) || duration < 15 || duration > 480) {
      return { success: false, error: "Duration must be between 15 and 480 minutes." };
    }

    const cutoffMinutes = Math.floor(Number(input?.cutoffMinutes));
    if (!Number.isFinite(cutoffMinutes) || cutoffMinutes < 0 || cutoffMinutes > 1440) {
      return { success: false, error: "Cut-off must be between 0 and 1440 minutes before the start." };
    }
    const cutoffMs = startMs - cutoffMinutes * 60 * 1000;
    if (cutoffMs <= Date.now()) {
      return { success: false, error: "That cut-off has already passed. Use a shorter cut-off or a later start." };
    }

    let maxOrders = null;
    if (input?.maxOrders !== "" && input?.maxOrders != null) {
      maxOrders = Math.floor(Number(input.maxOrders));
      if (!Number.isFinite(maxOrders) || maxOrders < 1 || maxOrders > 500) {
        return { success: false, error: "Order limit must be between 1 and 500, or left blank." };
      }
    }

    const label = String(input?.label || "").trim().slice(0, 60) || null;

    const db = createAdminClient();
    const { data, error } = await db.from("schedule_windows").insert({
      label,
      starts_at: startsAt,
      duration_minutes: duration,
      cutoff_at: new Date(cutoffMs).toISOString(),
      max_orders: maxOrders,
      created_by: admin.id,
    }).select("id").single();
    if (error) throw error;

    await logAdminAction(admin.id, "CREATE_SCHEDULE_WINDOW", "schedule_window", data.id, {
      starts_at: startsAt, duration, cutoffMinutes, maxOrders,
    });
    revalidatePath("/ops-terminal/scheduled");
    return { success: true };
  } catch (err) { return fail(err); }
}

// Close (or reopen) a window to new bookings. Orders already booked are not touched.
export async function setWindowOpen(windowId, open) {
  try {
    const { admin } = await validateAdmin();
    if (!UUID_RE.test(windowId || "")) return { success: false, error: "Invalid window." };
    const db = createAdminClient();
    const { error } = await db.from("schedule_windows").update({ is_open: open === true }).eq("id", windowId);
    if (error) throw error;
    await logAdminAction(admin.id, "SET_SCHEDULE_WINDOW_OPEN", "schedule_window", windowId, { open: open === true });
    revalidatePath("/ops-terminal/scheduled");
    return { success: true };
  } catch (err) { return fail(err); }
}

// Delete a window nobody has booked.
export async function deleteWindow(windowId) {
  try {
    const { admin } = await validateAdmin();
    if (!UUID_RE.test(windowId || "")) return { success: false, error: "Invalid window." };
    const db = createAdminClient();
    const { error } = await db.from("schedule_windows").delete().eq("id", windowId);
    if (error) {
      if (error.code === "23503") return { success: false, error: "This window has orders. Close it instead of deleting it." };
      throw error;
    }
    await logAdminAction(admin.id, "DELETE_SCHEDULE_WINDOW", "schedule_window", windowId, {});
    revalidatePath("/ops-terminal/scheduled");
    return { success: true };
  } catch (err) { return fail(err); }
}

// Switch scheduled delivery on/off for one vendor.
export async function setVendorScheduled(vendorId, enabled) {
  try {
    const { admin } = await validateAdmin();
    if (!UUID_RE.test(vendorId || "")) return { success: false, error: "Invalid vendor." };
    const db = createAdminClient();
    const { error } = await db.from("vendors").update({ scheduled_enabled: enabled === true }).eq("id", vendorId);
    if (error) throw error;
    await logAdminAction(admin.id, "SET_VENDOR_SCHEDULED", "vendor", vendorId, { enabled: enabled === true });
    revalidatePath("/ops-terminal/scheduled");
    return { success: true };
  } catch (err) { return fail(err); }
}
