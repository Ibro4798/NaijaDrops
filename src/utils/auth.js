/**
 * NaijaDrops — Centralized Auth Utility
 * ======================================
 * ONE place for role detection. All pages import from here.
 * Never copy-paste the waterfall check again.
 *
 * Usage (client components):
 *   import { getUserRole } from '@/utils/auth';
 *   const { user, role, profile } = await getUserRole(supabase);
 *
 * Returns:
 *   { user, role: 'admin' | 'driver' | 'user' | null, profile: {} | null }
 */

/**
 * Determines the role of the currently logged-in user.
 * Priority: admin > driver > customer
 * Fallback: if user exists but has no row anywhere, treats as 'user'
 *           and attempts to upsert a customers row to self-heal.
 */
export async function getUserRole(supabase) {
  if (!supabase) return { user: null, role: null, profile: null };

  const { data: { user }, error } = await supabase.auth.getUser();

  if (error || !user) {
    return { user: null, role: null, profile: null };
  }

  // ── 1st Priority: Admin ─────────────────────────────────────────────────
  // Fast path: @naijadrops.tech email — no DB hit needed
  if (user.email?.endsWith('@naijadrops.tech')) {
    const { data: adminProfile } = await supabase
      .from('admins')
      .select('*')
      .eq('id', user.id)
      .maybeSingle();
    return {
      user,
      role: 'admin',
      profile: adminProfile || { id: user.id, email: user.email, full_name: user.user_metadata?.full_name || 'Admin' },
    };
  }

  // DB check for admin (for manually-added admins without @naijadrops.tech)
  const { data: adminProfile } = await supabase
    .from('admins')
    .select('*')
    .eq('id', user.id)
    .maybeSingle();

  if (adminProfile) {
    return { user, role: 'admin', profile: adminProfile };
  }

  // ── 2nd Priority: Driver ─────────────────────────────────────────────────
  const { data: driverProfile } = await supabase
    .from('drivers')
    .select('*')
    .eq('id', user.id)
    .maybeSingle();

  if (driverProfile) {
    return { user, role: 'driver', profile: driverProfile };
  }

  // ── 3rd Priority: Customer ───────────────────────────────────────────────
  const { data: customerProfile } = await supabase
    .from('customers')
    .select('*')
    .eq('id', user.id)
    .maybeSingle();

  if (customerProfile) {
    return { user, role: 'user', profile: customerProfile };
  }

  // ── Self-heal: user exists in auth but has no role row ───────────────────
  // This happens when the DB trigger missed their signup (e.g., imported users,
  // trigger was down, or anon users who authenticated later).
  // We auto-create a customer row so redirects don't loop forever.
  console.warn('[getUserRole] No role row found for user:', user.id, '— creating customer row as fallback');
  const fullName = user.user_metadata?.full_name || user.email?.split('@')[0] || 'User';
  await supabase.from('customers').upsert({
    id: user.id,
    email: user.email,
    full_name: fullName,
  }, { onConflict: 'id' });

  return {
    user,
    role: 'user',
    profile: { id: user.id, email: user.email, full_name: fullName },
  };
}

/**
 * Returns the redirect path for a given role.
 * Centralises all role-based routing decisions.
 */
export function getRoleRedirectPath(role) {
  switch (role) {
    case 'admin':  return '/admin';
    case 'driver': return '/driver';
    case 'user':   return '/send';
    default:       return '/login';
  }
}
