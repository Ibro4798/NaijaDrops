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
