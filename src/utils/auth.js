/**
 * NaijaDrops — Centralized Auth Utility
 * ======================================
 * ONE place for role detection using the NEW table structure.
 * 
 * Target Tables: admins, drivers, customers
 */

export async function getUserRole(supabase) {
  if (!supabase) return { user: null, role: null, profile: null };

  const { data: { user }, error } = await supabase.auth.getUser();

  if (error || !user) {
    return { user: null, role: null, profile: null };
  }

  // 1. Check Admin
  const { data: adminProfile } = await supabase
    .from('admins')
    .select('*')
    .eq('id', user.id)
    .maybeSingle();

  if (adminProfile) {
    return { user, role: 'admin', profile: adminProfile };
  }

  // 2. Check Driver
  const { data: driverProfile } = await supabase
    .from('drivers')
    .select('*')
    .eq('id', user.id)
    .maybeSingle();

  if (driverProfile) {
    return { user, role: 'driver', profile: driverProfile };
  }

  // 3. Check Customer
  const { data: customerProfile } = await supabase
    .from('customers')
    .select('*')
    .eq('id', user.id)
    .maybeSingle();

  if (customerProfile) {
    return { user, role: 'user', profile: customerProfile };
  }

  // ── Self-heal: user exists in auth but no role row found ──────────────────
  const fullName = user.user_metadata?.full_name || user.email?.split('@')[0] || 'User';
  const metadataRole = user.user_metadata?.role || 'user';

  console.warn('[getUserRole] Missing role row. Creating as:', metadataRole);

  if (metadataRole === 'driver') {
    await supabase.from('drivers').upsert({ id: user.id, email: user.email, full_name: fullName }, { onConflict: 'id' });
    return { user, role: 'driver', profile: { id: user.id, email: user.email, full_name: fullName } };
  } else if (metadataRole === 'admin' && user.email?.endsWith('@naijadrops.tech')) {
    await supabase.from('admins').upsert({ id: user.id, email: user.email, full_name: fullName }, { onConflict: 'id' });
    return { user, role: 'admin', profile: { id: user.id, email: user.email, full_name: fullName } };
  } else {
    await supabase.from('customers').upsert({ id: user.id, email: user.email, full_name: fullName }, { onConflict: 'id' });
    return { user, role: 'user', profile: { id: user.id, email: user.email, full_name: fullName } };
  }
}

/**
 * Returns the redirect path for a given role.
 */
export function getRoleRedirectPath(role) {
  switch (role) {
    case 'admin':  return '/admin';
    case 'driver': return '/driver';
    case 'user':   return '/send';
    default:       return '/login';
  }
}
