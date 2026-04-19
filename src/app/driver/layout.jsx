import { redirect } from 'next/navigation';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import Link from 'next/link';
import DriverNotifications from '@/components/driver/DriverNotifications';

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

  // Fetch role
  const { data: driverData } = await supabase
    .from('drivers')
    .select('id')
    .eq('id', user.id)
    .maybeSingle();

  if (!driverData) {
    // If not a driver, kick them out of the driver portal
    redirect('/');
  }

  return (
    <div className="min-h-[100dvh] bg-charcoal-900 text-white font-sans selection:bg-emerald-500/30">
      {/* Driver Top Navigation Navbar */}
      <nav className="fixed top-0 w-full z-50 bg-charcoal-900/80 backdrop-blur-lg border-b border-charcoal-800 pt-[var(--safe-top)]">
        <div className="max-w-md mx-auto px-4 h-16 flex items-center justify-between">
            <div className="font-extrabold text-lg tracking-tight flex items-center gap-2">
              <span>ND <span className="text-emerald-500">Driver</span></span>
            </div>
            
            <div className="flex items-center gap-3">
              <DriverNotifications userId={user.id} />
              
              {/* Quick Earnings Stat */}
              <Link href="/driver/wallet" className="flex items-center gap-2 hover:opacity-80 transition-opacity cursor-pointer">
                <div className="w-8 h-8 rounded-full bg-charcoal-800 border border-emerald-500/30 shadow-[0_0_10px_rgba(16,185,129,0.2)] flex items-center justify-center">
                  <span className="text-sm font-bold text-emerald-500">₦</span>
                </div>
              </Link>

              {/* Sign Out Button */}
              <form action="/api/auth/signout" method="POST">
                <button
                  type="submit"
                  className="w-8 h-8 flex items-center justify-center text-charcoal-400 hover:text-red-500 bg-charcoal-800 hover:bg-red-500/10 rounded-full transition-all border border-transparent hover:border-red-500/30"
                  title="Sign Out"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"></path><polyline points="16 17 21 12 16 7"></polyline><line x1="21" y1="12" x2="9" y2="12"></line></svg>
                </button>
              </form>
            </div>
        </div>
      </nav>

      {/* Main Content Area */}
      <main className="pt-[calc(4rem+var(--safe-top))] max-w-md mx-auto h-[100dvh] flex flex-col relative">
        {children}
      </main>
    </div>
  );
}
