import { redirect } from 'next/navigation';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

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
  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single();

  // For Prototype/Demo: Allow any logged-in user to access the driver dashboard
  // if (!profile || profile.role !== 'driver') {
  //   // If not a driver, kick them out of the driver portal
  //   redirect('/');
  // }

  return (
    <div className="min-h-screen bg-charcoal-900 text-white font-sans selection:bg-emerald-500/30">
      {/* Driver Top Navigation Navbar */}
      <nav className="fixed top-0 w-full z-50 bg-charcoal-900/80 backdrop-blur-lg border-b border-charcoal-800">
        <div className="max-w-md mx-auto px-4 h-16 flex items-center justify-between">
            <div className="font-extrabold text-lg tracking-tight">
              ND <span className="text-emerald-500">Driver</span>
            </div>
            
            {/* Quick Earnings Stat (Mock for MVP) */}
            <div className="flex items-center gap-3">
              <div className="flex flex-col items-end">
                <span className="text-[10px] uppercase font-bold text-gray-400 tracking-wider">Today</span>
                <span className="text-sm font-black text-white">₦0</span>
              </div>
              <div className="w-8 h-8 rounded-full bg-charcoal-800 border border-charcoal-700 flex items-center justify-center">
                <span className="text-xs font-bold text-emerald-500">₦</span>
              </div>
            </div>
        </div>
      </nav>

      {/* Main Content Area */}
      <main className="pt-16 max-w-md mx-auto h-screen flex flex-col relative">
        {children}
      </main>
    </div>
  );
}
