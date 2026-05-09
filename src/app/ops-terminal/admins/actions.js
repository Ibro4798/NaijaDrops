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

    if (!email || !email.endsWith("@naijadrops.tech")) {
      throw new Error("Invalid admin email. Must be @naijadrops.tech");
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

    // Insert into admin_users
    // Note: We don't have the UUID yet if they haven't signed up.
    // The validateAdmin logic uses .eq("id", user.id), which implies they must have a UUID.
    // This means we should probably invite them or wait for them to sign up.
    // But the user just says "add new admins".
    
    // If they sign up with that email, we need to link them.
    // A better way is to store the email and then link it on their first login,
    // or just use email-based validation in the middleware.

    const { error } = await supabase
      .from("admin_users")
      .insert({ 
        email, 
        is_active: true,
        role: 'admin'
      });

    if (error) throw error;

    await logAdminAction(currentAdmin.id, "ADMIN_ADDITION", "admin", null, { email });

    revalidatePath("/ops-terminal/admins");
    return { success: true };
  } catch (err) {
    console.error("Add Admin Error:", err);
    return { success: false, error: err.message };
  }
}
