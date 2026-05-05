import { redirect } from 'next/navigation';
import { createClient } from '@/utils/supabase/server';

export default async function HistoryHeadless() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    redirect('/auth/login');
  }

  const { data: profile } = await supabase
    .from('users')
    .select('role')
    .eq('id', user.id)
    .single();

  if (profile?.role === 'vendor') {
    redirect('/vendor/history');
  } else if (profile?.role === 'rider') {
    redirect('/rider/earnings'); // Riders check history via earnings/transactions
  } else {
    redirect('/resolve');
  }
}
