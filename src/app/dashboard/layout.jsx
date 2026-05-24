import { redirect } from 'next/navigation';
import { createClient } from '@/utils/supabase/server';

export default async function DashboardLayout({ children }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    redirect('/auth/login');
  }

  // Riders and admins should not access the vendor dashboard
  const { data: profile } = await supabase
    .from('users')
    .select('role')
    .eq('id', user.id)
    .single();

  if (profile?.role === 'rider') redirect('/rider');
  if (profile?.role === 'admin') redirect('/ops-terminal/dashboard');

  return <>{children}</>;
}
