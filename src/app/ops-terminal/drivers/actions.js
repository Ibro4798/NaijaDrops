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

    const email = String(formData.get("email") || "").trim().toLowerCase();
    if (!email) throw new Error("Email is required");
    const typedName = String(formData.get("full_name") || "").trim();
    const fullName = typedName || email.split("@")[0];

    // The link in the email opens /auth/update-password, where the rider picks a password and goes to their dashboard.
    // (The site address must also be listed under Supabase > Authentication > URL Configuration > Redirect URLs.)
    const origin = (process.env.NEXT_PUBLIC_SITE_URL || "https://www.naijadrops.tech").replace(/\/+$/, "");
    const { data: inviteData, error: inviteError } = await adminSupabase.auth.admin.inviteUserByEmail(email, {
      data: { full_name: fullName, role: "rider", vehicle_type: "bike" },
      redirectTo: `${origin}/auth/update-password`,
    });
    if (inviteError) throw inviteError;
    const userId = inviteData.user.id;

    // The sign-up trigger creates a DRAFT rider. Ops is inviting this person on purpose, so approve them now:
    // no documents step, no waiting.
    const { data: approved } = await adminSupabase
      .from("riders")
      .update({ status: "approved", approved: true })
      .eq("user_id", userId)
      .select("id");
    if (!approved || approved.length === 0) {
      throw new Error("Invitation sent, but the rider profile was not created. Approve them from the drivers list.");
    }

    await logAdminAction(admin.id, "RIDER_INVITE", "rider", userId, { email, fullName, preApproved: true });

    revalidatePath("/ops-terminal/drivers");
    return { success: true };
  } catch (err) {
    console.error("Admin Invite Error:", err);
    return { success: false, error: err.message };
  }
}
