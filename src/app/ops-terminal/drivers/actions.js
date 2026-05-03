"use server";

import { validateAdmin, logAdminAction } from "@/utils/admin";
import { createClient } from "@/utils/supabase/server";
import { revalidatePath } from "next/cache";

/**
 * Approve a Rider (Workforce Unit)
 */
export async function approveRider(riderId) {
  try {
    const { admin } = await validateAdmin(); // Layer 2 Security Re-validation
    const supabase = await createClient();

    // Update rider status
    const { error } = await supabase
      .from("riders")
      .update({ 
        operational_status: 'offline', // Move from pending to offline (ready)
        status: 'approved'
      })
      .eq("user_id", riderId);

    if (error) throw error;

    // Layer 4: Audit Logging
    await logAdminAction(admin.id, "RIDER_APPROVAL", "rider", riderId, { status: "approved" });

    revalidatePath("/ops-terminal/drivers");
    return { success: true };
  } catch (err) {
    console.error("Admin Action Error:", err);
    return { success: false, error: err.message };
  }
}

/**
 * Deactivate/Pause a Rider
 */
export async function deactivateRider(riderId) {
  try {
    const { admin } = await validateAdmin(); // Layer 2 Security Re-validation
    const supabase = await createClient();

    // Update rider status
    const { error } = await supabase
      .from("riders")
      .update({ 
        operational_status: 'offline',
        status: 'paused'
      })
      .eq("user_id", riderId);

    if (error) throw error;

    // Layer 4: Audit Logging
    await logAdminAction(admin.id, "RIDER_DEACTIVATION", "rider", riderId, { status: "paused" });

    revalidatePath("/ops-terminal/drivers");
    return { success: true };
  } catch (err) {
    console.error("Admin Action Error:", err);
    return { success: false, error: err.message };
  }
}
