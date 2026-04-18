import { redirect } from 'next/navigation';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import Link from 'next/link';
import { ShieldAlert, BarChart3, Users, Package, Power, Zap } from 'lucide-react';

export const metadata = {
  title: 'Command Hub | NaijaDrops Admin',
  description: 'NaijaDrops Operations Management',
};

export default async function AdminLayout({ children }) {
  const cookieStore = await cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      cookies: {
        get(name) { return cookieStore.get(name)?.value; },
        set() {},   // no-op in server layout
        remove() {},
      },
    }
  );

  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    redirect('/login');
  }

  // Fast path: email domain check (no extra DB query)
  const isAdminEmail = user.email?.endsWith('@naijadrops.tech');

  if (!isAdminEmail) {
    // Fallback: check admins table for manually-added admins
    const { data: adminRow } = await supabase
      .from('admins')
      .select('id')
      .eq('id', user.id)
      .maybeSingle();

    if (!adminRow) {
      // Not an admin — redirect cleanly to login, never to '/'
      redirect('/login?error=access_denied');
    }
  }

  const navItems = [
    { name: 'Dashboard', icon: BarChart3, path: '/admin' },
    { name: 'Driver Fleet', icon: Users, path: '/admin/drivers' },
    { name: 'All Orders', icon: Package, path: '/admin/orders' },
  ];

  return (
    <div className="min-h-screen bg-charcoal-950 text-white flex overflow-hidden font-inter">
      {/* ── Sidebar ─────────────────────────────────────────────── */}
      <aside className="w-72 bg-charcoal-900/80 border-r border-white/5 flex-col p-8 relative z-20 hidden md:flex">
        {/* Logo */}
        <div className="flex items-center gap-3 mb-16">
          <div className="w-10 h-10 bg-emerald-500 rounded-xl flex items-center justify-center shadow-glow shrink-0">
            <ShieldAlert size={20} className="text-charcoal-950" />
          </div>
          <div>
            <span className="font-black tracking-tighter text-lg font-outfit block leading-none text-white">
              NAIJA<span className="text-emerald-500">DROPS</span>
            </span>
            <span className="text-[9px] font-bold text-charcoal-500 uppercase tracking-[0.3em] mt-0.5 block">
              Command Hub
            </span>
          </div>
        </div>

        {/* Nav */}
        <nav className="flex-1 space-y-1">
          {navItems.map((item) => (
            <Link
              key={item.name}
              href={item.path}
              className="flex items-center gap-3 p-3.5 rounded-xl transition-all text-charcoal-400 hover:text-white hover:bg-white/5 group"
            >
              <item.icon size={18} className="shrink-0 group-hover:text-emerald-400 transition-colors" />
              <span className="font-bold text-xs uppercase tracking-widest">{item.name}</span>
            </Link>
          ))}
        </nav>

        {/* Footer */}
        <div className="mt-auto pt-8 border-t border-white/5 space-y-3">
          <div className="flex items-center gap-3 px-3 py-2">
            <div className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse shadow-glow" />
            <span className="text-[10px] font-bold text-charcoal-500 uppercase tracking-widest">
              {user.email}
            </span>
          </div>

          {/* Sign out is a form POST to avoid client-side state issues */}
          <form action="/api/auth/signout" method="POST">
            <button
              type="submit"
              className="w-full flex items-center gap-3 p-3.5 rounded-xl text-charcoal-500 hover:text-red-400 hover:bg-red-500/5 transition-all font-bold text-xs uppercase tracking-widest border border-transparent hover:border-red-500/10"
            >
              <Power size={16} />
              Sign Out
            </button>
          </form>
        </div>
      </aside>

      {/* ── Mobile Header ────────────────────────────────────────── */}
      <div className="flex-1 flex flex-col overflow-hidden">
        <header className="h-16 bg-charcoal-900/80 border-b border-white/5 flex items-center justify-between px-6 md:hidden shrink-0">
          <div className="flex items-center gap-2">
            <ShieldAlert size={18} className="text-emerald-500" />
            <span className="font-black text-sm uppercase tracking-widest text-white">Admin Hub</span>
          </div>
          <div className="flex items-center gap-2">
            {navItems.map((item) => (
              <Link
                key={item.name}
                href={item.path}
                className="w-9 h-9 rounded-xl bg-charcoal-800 flex items-center justify-center text-charcoal-400 hover:text-emerald-400 transition-colors"
              >
                <item.icon size={16} />
              </Link>
            ))}
          </div>
        </header>

        {/* ── Page Content ─────────────────────────────────────── */}
        <main className="flex-1 overflow-y-auto p-6 md:p-10 bg-charcoal-950 hide-scrollbar">
          {children}
        </main>
      </div>

      <style>{`
        .hide-scrollbar::-webkit-scrollbar { display: none; }
        .hide-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }
      `}</style>
    </div>
  );
}
