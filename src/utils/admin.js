import { createClient } from "@/utils/supabase/server";

/**
 * Layer 2: Server-Side Admin Validation
 * Verifies that the authenticated user is an active administrator.
 */
export async function validateAdmin(requiredRole = 'admin') {
  const supabase = await createClient();
  
  // 1. Get Auth User
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) throw new Error("Unauthorized Access - Authentication Required");

  // 2a. Domain Check (Hard Constraint)
  if (!user.email?.toLowerCase().endsWith('@naijadrops.tech')) {
    throw new Error("Unauthorized Access - Corporate Domain Required");
  }

  // 2b. Identify Super Admin
  const isSuperAdmin = user.email?.toLowerCase() === 'ibrahim@naijadrops.tech';

  // 2c. Cross-reference with Admin Table (skip for super admin)
  let adminData = null;
  if (!isSuperAdmin) {
    const { data: admin, error: dbError } = await supabase
      .from("admin_users")
      .select("*")
      .eq("id", user.id)
      .single();

    if (dbError || !admin || !admin.is_active) {
      throw new Error("Unauthorized Access - High Security Clearance Required");
    }
    adminData = admin;
  } else {
    // Mock admin data for the super admin if they don't exist in the DB yet
    adminData = { id: user.id, email: user.email, role: 'super_admin', is_active: true };
  }

  if (requiredRole === 'super_admin' && !isSuperAdmin) {
    throw new Error("Forbidden - Super Admin Access Only");
  }

  return { user, admin: adminData };
}

/**
 * Layer 4: Immutable Audit Logging
 */
export async function logAdminAction(adminId, action, targetType, targetId, details = {}) {
  const supabase = await createClient();
  await supabase.from("admin_action_logs").insert({
    admin_id: adminId,
    action,
    target_type: targetType,
    target_id: targetId,
    details
  });
}
