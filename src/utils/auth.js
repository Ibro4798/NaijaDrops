/**
 * NaijaDrops â€” Centralized Auth Utility (MVP Refined)
 * ================================================
 * ONE place for role detection using the UNIFIED users table.
 * 
 * Target Tables: users, vendors, riders
 */

export async function getUserRole(supabase) {
  if (!supabase) return { user: null, role: null, profile: null };

  const { data: { user }, error } = await supabase.auth.getUser();

  if (error || !user) {
    return { user: null, role: null, profile: null };
  }

  // 1. Fetch unified user profile
  const { data: userProfile } = await supabase
    .from('users')
    .select('*')
    .eq('id', user.id)
    .maybeSingle();

  if (!userProfile) {
    return { user, role: null, profile: null };
  }

  // 2. Fetch specific layout profile
  let subProfile = null;
  if (userProfile.role === 'vendor') {
    const { data: vent } = await supabase.from('vendors').select('*').eq('user_id', user.id).maybeSingle();
    subProfile = vent;
  } else if (userProfile.role === 'rider') {
    const { data: rid } = await supabase.from('riders').select('*').eq('user_id', user.id).maybeSingle();
    subProfile = rid;
  }

  return { user, role: userProfile.role, profile: { ...userProfile, ...subProfile } };
}

/**
 * Returns the redirect path for a given role.
 */
export function getRoleRedirectPath(role) {
  switch (role) {
    case 'admin':  return '/ops-terminal/dashboard';
    case 'vendor': return '/dashboard';
    case 'rider':  return '/rider';
    default:       return '/resolve';
  }
}

