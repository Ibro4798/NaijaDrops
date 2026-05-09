import { redirect } from 'next/navigation';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import Link from 'next/link';
import DriverNotifications from '@/components/driver/DriverNotifications';
import DriverBottomNav from '@/components/driver/DriverBottomNav';

export const metadata = {
  title: 'Driver Console | NaijaDrops',
  description: 'Logistics Command Center for Drivers',
};

export default async function DriverLayout({ children }) {
  const cookieStore = await cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      cookies: {
        get(name) {
          return cookieStore.get(name)?.value;
        },
        set(name, value, options) {
          try {
            cookieStore.set({ name, value, ...options });
          } catch (error) {
            // Ignored if called during a Server Component render
          }
        },
        remove(name, options) {
          try {
            cookieStore.set({ name, value: '', ...options });
          } catch (error) {
            // Ignored if called during a Server Component render
          }
        },
      },
    }
  );

  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    redirect('/login');
  }

  // Pages within the driver portal will handle their own specific routing 
  // (e.g., redirecting to /driver/onboarding if the profile doesn't exist yet).

  return (
    <div className="min-h-[100dvh] bg-charcoal-950 text-white font-sans selection:bg-emerald-500/30 overflow-x-hidden">
      {/* Main Content Area */}
      <main className="max-w-md mx-auto min-h-[100dvh] flex flex-col relative pb-24 overflow-y-auto overflow-x-hidden no-scrollbar">
        {children}
      </main>

      {/* Shared Bottom Navigation per Stitch Design */}
      <DriverBottomNav />
    </div>
  );
}
