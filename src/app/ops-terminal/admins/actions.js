"use server";

import { validateAdmin, logAdminAction } from "@/utils/admin";
import { createClient } from "@/utils/supabase/server";
import { revalidatePath } from "next/cache";

/**
 * Add a new Admin
 */
export async function addAdmin(formData) {
  try {
    // ONLY super_admin can add other admins
    const { admin: currentAdmin } = await validateAdmin('super_admin');
    const supabase = await createClient();

    const email = formData.get("email");

    if (!email) {
      throw new Error("Email is required");
    }

    // Check if already exists
    const { data: existing } = await supabase
      .from("admin_users")
      .select("id")
      .eq("email", email)
      .single();

    if (existing) {
      throw new Error("Admin already exists");
    }

    // 1. Invite User via Supabase Auth. Supabase handles the SMTP email sending.
    const { createAdminClient } = await import("@/utils/supabase/admin");
    const adminSupabase = createAdminClient();

    const { data: inviteData, error: inviteError } = await adminSupabase.auth.admin.inviteUserByEmail(email, {
      data: { role: 'admin' }
    });

    if (inviteError && !inviteError.message.includes('already registered')) {
        throw inviteError;
    }

    // Because of the 'on_auth_user_created' SQL Trigger, the user will AUTOMATICALLY 
    // be added to public.admin_users as IS_ACTIVE = TRUE.
    // We do not need to manually upsert into admin_users here anymore!

    // Manual inserts removed. Trigger handles it.

    await logAdminAction(currentAdmin.id, "ADMIN_ADDITION", "admin", null, { email });

    revalidatePath("/ops-terminal/admins");
    return { success: true };
  } catch (err) {
    console.error("Add Admin Error:", err);
    return { success: false, error: err.message };
  }
}
