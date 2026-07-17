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

    const { error } = await supabase
      .from("riders")
      .update({ approved: true, status: "approved", rejection_reason: null })
      .eq("user_id", riderId);

    if (error) throw error;

    await logAdminAction(admin.id, "RIDER_APPROVAL", "rider", riderId, { status: "approved" });

    revalidatePath("/ops-terminal/drivers");
    revalidatePath(`/ops-terminal/drivers/${riderId}`);
    return { success: true };
  } catch (err) {
    console.error("Admin Action Error:", err);
    return { success: false, error: err.message };
  }
}

/**
 * Reject a Rider outright, with a reason the rider will see on their onboarding
 * screen. Distinct from pauseRider: rejection is a hard no on this application;
 * the rider can edit their submission and resubmit from scratch.
 */
export async function rejectRider(riderId, reason) {
  try {
    const { admin } = await validateAdmin();
    const supabase = await createClient();

    if (!reason || !reason.trim()) {
      return { success: false, error: "A reason is required so the rider knows what to fix." };
    }

    const { error } = await supabase
      .from("riders")
      .update({ approved: false, status: "rejected", rejection_reason: reason.trim() })
      .eq("user_id", riderId);

    if (error) throw error;

    await logAdminAction(admin.id, "RIDER_REJECTION", "rider", riderId, { status: "rejected", reason });

    revalidatePath("/ops-terminal/drivers");
    revalidatePath(`/ops-terminal/drivers/${riderId}`);
    return { success: true };
  } catch (err) {
    console.error("Admin Action Error:", err);
    return { success: false, error: err.message };
  }
}

/**
 * Pause a Rider that was already approved (or is under review) - takes them off
 * the road without a full rejection. Distinct from rejectRider: the rider is not
 * told to resubmit their application, they're told to contact support to resolve
 * whatever the issue is. They cannot toggle online again until an admin either
 * re-approves or rejects them.
 */
export async function pauseRider(riderId, reason) {
  try {
    const { admin } = await validateAdmin();
    const supabase = await createClient();

    if (!reason || !reason.trim()) {
      return { success: false, error: "A reason is required so support can explain the pause to the rider." };
    }

    const { error } = await supabase
      .from("riders")
      .update({ approved: false, status: "paused", rejection_reason: reason.trim(), operational_status: "offline" })
      .eq("user_id", riderId);

    if (error) throw error;

    await logAdminAction(admin.id, "RIDER_PAUSE", "rider", riderId, { status: "paused", reason });

    revalidatePath("/ops-terminal/drivers");
    revalidatePath(`/ops-terminal/drivers/${riderId}`);
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

    // The on_auth_user_created trigger now reads this metadata and creates a
    // draft riders row (status='draft') pre-filled with full_name/vehicle_type,
    // so the rider lands on a partially-filled onboarding form instead of a
    // blank one. It does NOT auto-approve - they still go through the normal
    // review flow below once they submit.
    const { data: inviteData, error: inviteError } = await adminSupabase.auth.admin.inviteUserByEmail(email, {
      data: { full_name: fullName, role: 'rider', vehicle_type: vehicleType || 'bike' }
    });

    if (inviteError) throw inviteError;
    const userId = inviteData.user.id;

    await logAdminAction(admin.id, "RIDER_INVITE", "rider", userId, { email, fullName });

    revalidatePath("/ops-terminal/drivers");
    return { success: true };
  } catch (err) {
    console.error("Admin Invite Error:", err);
    return { success: false, error: err.message };
  }
}