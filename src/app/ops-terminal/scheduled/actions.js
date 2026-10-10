"use server";

import { validateAdmin, logAdminAction } from "@/utils/admin";
import { createAdminClient } from "@/utils/supabase/admin";
import { revalidatePath } from "next/cache";

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
