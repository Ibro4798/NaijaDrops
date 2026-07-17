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
      .update({ approved: true, status: "approved" })
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
      .update({ approved: false, status: "pending" })
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

/**
 * Invite a new Rider via email
 */
export async function inviteRider(formData) {
  try {
    const { admin } = await validateAdmin(); // Security Check
    const { createAdminClient } = await import("@/utils/supabase/admin");
    const adminSupabase = createAdminClient();

    const email = formData.get("email");
    const fullName = formData.get("full_name");
    const vehicleType = formData.get("vehicle_type");

    if (!email || !fullName) throw new Error("Email and Full Name are required");

    // 1. Invite User via Supabase Auth. Supabase handles the SMTP email sending here.
    const { data: inviteData, error: inviteError } = await adminSupabase.auth.admin.inviteUserByEmail(email, {
      data: { full_name: fullName, role: 'rider', vehicle_type: vehicleType || 'bike' }
    });

    if (inviteError) throw inviteError;
    const userId = inviteData.user.id;

    // Because of the 'on_auth_user_created' SQL Trigger, the user will AUTOMATICALLY 
    // be added to public.users and public.riders as APPROVED.
    // We do not need to manually upsert into riders/users here anymore!

    // Note: Manual inserts are removed because the SQL Trigger handles it instantly


    // 4. Audit Log
    await logAdminAction(admin.id, "RIDER_INVITE", "rider", userId, { email, fullName });

    revalidatePath("/ops-terminal/drivers");
    return { success: true };
  } catch (err) {
    console.error("Admin Invite Error:", err);
    return { success: false, error: err.message };
  }
}

