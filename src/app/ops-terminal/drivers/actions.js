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

    // 1. Invite User via Supabase Auth
    const { data: inviteData, error: inviteError } = await adminSupabase.auth.admin.inviteUserByEmail(email, {
      data: { full_name: fullName }
    });

    if (inviteError) throw inviteError;
    const userId = inviteData.user.id;

    // 2. Create entry in users table
    const { error: userError } = await adminSupabase
      .from("users")
      .upsert({
        id: userId,
        email: email,
        full_name: fullName,
        has_rider_profile: true,
        active_mode: 'rider'
      });

    if (userError) throw userError;

    // 3. Create entry in riders table
    const { error: riderError } = await adminSupabase
      .from("riders")
      .insert({
        user_id: userId,
        full_name: fullName,
        vehicle_type: vehicleType || 'bike',
        status: 'approved', // Pre-approved as requested
        operational_status: 'offline'
      });

    if (riderError) throw riderError;

    // 4. Audit Log
    await logAdminAction(admin.id, "RIDER_INVITE", "rider", userId, { email, fullName });

    revalidatePath("/ops-terminal/drivers");
    return { success: true };
  } catch (err) {
    console.error("Admin Invite Error:", err);
    return { success: false, error: err.message };
  }
}

