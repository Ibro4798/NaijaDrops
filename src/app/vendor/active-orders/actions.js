"use server";

import { createClient } from "@/utils/supabase/server";
import { revalidatePath } from "next/cache";

const CANCELLABLE_STATUSES = ["pending", "looking_for_driver"];

/**
 * Cancel a vendor's own order, but ONLY before a rider has accepted it.
 * Ownership and cancellable-status are both checked here server-side (not
 * left to a client-side supabase call) because orders/vendors currently have
 * RLS disabled at the database level - this action is the actual security
 * boundary until that's turned on.
 */
export async function cancelOrder(orderId, reason) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { success: false, error: "Not signed in." };

    const { data: vendor } = await supabase
      .from("vendors")
      .select("id")
      .eq("user_id", user.id)
      .single();
    if (!vendor) return { success: false, error: "No vendor profile found for this account." };

    const { data: order } = await supabase
      .from("orders")
      .select("id, vendor_id, status")
      .eq("id", orderId)
      .single();

    if (!order) return { success: false, error: "Order not found." };
    if (order.vendor_id !== vendor.id) return { success: false, error: "This isn't your order." };
    if (!CANCELLABLE_STATUSES.includes(order.status)) {
      return { success: false, error: "A rider has already accepted this order - it can no longer be cancelled here. Contact support." };
    }

    const { error } = await supabase
      .from("orders")
      .update({
        status: "cancelled",
        cancellation_reason: reason || "Cancelled by vendor before rider assignment",
      })
      .eq("id", orderId);

    if (error) throw error;

    revalidatePath("/vendor/active-orders");
    revalidatePath("/dashboard");
    return { success: true };
  } catch (err) {
    console.error("Cancel order error:", err);
    return { success: false, error: err.message };
  }
}