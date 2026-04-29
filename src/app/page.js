import { redirect } from 'next/navigation';
import { createClient } from '@/utils/supabase/server';
import { getRoleRedirectPath } from '@/utils/auth';

export default async function HomePage() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    redirect('/auth/login');
  }

  // Fetch role and profile
  const { data: profile } = await supabase
    .from('users')
    .select('role')
    .eq('id', user.id)
    .single();

  if (!profile || !profile.role) {
    redirect('/auth/role-select');
  }

  // Use the central auth utility for redirection
  redirect(getRoleRedirectPath(profile.role));
}
