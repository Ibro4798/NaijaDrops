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

  // 2. Cross-reference with Admin Table
  const { data: admin, error: dbError } = await supabase
    .from("admin_users")
    .select("*")
    .eq("id", user.id)
    .single();

  if (dbError || !admin || !admin.is_active) {
    throw new Error("Unauthorized Access - High Security Clearance Required");
  }

  // 3. Check specific role requirements
  if (requiredRole === 'super_admin' && admin.role !== 'super_admin') {
    throw new Error("Forbidden - Super Admin Access Only");
  }

  return { user, admin };
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
