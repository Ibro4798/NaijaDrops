import { redirect } from "next/navigation";
import { createClient } from "@/utils/supabase/server";
import { validateAdmin } from "@/utils/admin";
import { Activity, ShieldCheck, DollarSign, Users, AlertOctagon, Package, LayoutDashboard } from "lucide-react";

export default async function OpsTerminalLayout({ children }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    redirect("/auth/login");
  }

  // Enforce Admin Role using the new central utility
  try {
    await validateAdmin();
  } catch (err) {
    redirect("/"); // Kick unauthorized users out
  }

  return (
    <div className="flex h-screen bg-charcoal-950 text-white overflow-hidden selection:bg-emerald-500">
      {/* Sidebar: Navigation & Status */}
      <aside className="w-72 border-r border-white/5 bg-charcoal-900/50 flex flex-col backdrop-blur-md relative z-20">
        <div className="p-8 border-b border-white/5 relative">
          <div className="absolute top-0 right-0 w-32 h-32 bg-emerald-500/5 rounded-bl-full pointer-events-none" />
          <div className="font-outfit font-black text-3xl italic tracking-tighter uppercase mb-1">
            Ops<span className="text-emerald-500">Terminal</span>
          </div>
          <div className="flex items-center gap-2 mt-4 text-emerald-500 text-[9px] font-black uppercase tracking-widest bg-emerald-500/10 inline-block px-3 py-1 rounded-full border border-emerald-500/20">
            <span className="inline-block w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse mr-2" />
            System Online
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-4 py-8 space-y-8">
          {/* Section 1: Visibility */}
          <div>
            <div className="text-[10px] font-black text-charcoal-600 uppercase tracking-[0.3em] mb-4 px-4">Visibility</div>
            <nav className="space-y-1">
              <a href="/ops-terminal/dashboard" className="flex items-center gap-3 p-4 rounded-2xl hover:bg-white/5 hover:text-white text-charcoal-400 font-bold transition-all text-sm group">
                <LayoutDashboard size={18} className="group-hover:text-emerald-500 transition-colors" />
                <span>Overview</span>
              </a>
              <a href="/ops-terminal/orders" className="flex items-center gap-3 p-4 rounded-2xl hover:bg-white/5 hover:text-white text-charcoal-400 font-bold transition-all text-sm group">
                <Package size={18} className="group-hover:text-emerald-500 transition-colors" />
                <span>Live Radar</span>
              </a>
            </nav>
          </div>

          {/* Section 2: Fleet Management */}
          <div>
             <div className="text-[10px] font-black text-charcoal-600 uppercase tracking-[0.3em] mb-4 px-4">Operations</div>
             <nav className="space-y-1">
               <a href="/ops-terminal/drivers" className="flex items-center gap-3 p-4 rounded-2xl hover:bg-white/5 hover:text-white text-charcoal-400 font-bold transition-all text-sm group">
                 <Users size={18} className="group-hover:text-emerald-500 transition-colors" />
                 <span>Tactical Fleet</span>
               </a>
               <a href="/ops-terminal/admins" className="flex items-center gap-3 p-4 rounded-2xl hover:bg-white/5 hover:text-white text-charcoal-400 font-bold transition-all text-sm group">
                 <ShieldCheck size={18} className="group-hover:text-emerald-500 transition-colors" />
                 <span>Access Logs</span>
               </a>
             </nav>
          </div>

          {/* Section 3: Intelligence */}
          <div>
            <div className="text-[10px] font-black text-charcoal-600 uppercase tracking-[0.3em] mb-4 px-4">Intelligence</div>
            <nav className="space-y-1">
              <a href="/ops-terminal/finance" className="flex items-center gap-3 p-4 rounded-2xl hover:bg-white/5 hover:text-white text-charcoal-400 font-bold transition-all text-sm group">
                <DollarSign size={18} className="group-hover:text-emerald-500 transition-colors" />
                <span>Treasury</span>
              </a>
              <a href="/ops-terminal/fraud" className="flex items-center gap-3 p-4 rounded-2xl hover:bg-white/5 hover:text-white text-charcoal-400 font-bold transition-all text-sm group text-red-500/70 hover:bg-red-500/10">
                <AlertOctagon size={18} className="group-hover:text-red-500 transition-colors" />
                <span className="group-hover:text-red-500 transition-colors">Risk Control</span>
              </a>
            </nav>
          </div>
        </div>

        <div className="p-6 border-t border-white/5 bg-black/40">
           <div className="text-[10px] text-charcoal-500 font-mono tracking-widest uppercase mb-1">God Mode</div>
           <div className="text-white text-xs font-bold truncate">{user?.email}</div>
           <a href="/api/auth/signout" className="text-red-500 text-[10px] font-black uppercase tracking-widest mt-4 inline-block hover:underline">Sever Connection</a>
        </div>
      </aside>
      
      {/* Main Content Area */}
      <main className="flex-1 overflow-y-auto relative z-10 bg-black">
        <div className="absolute inset-0 bg-[url('/noise.png')] opacity-20 pointer-events-none mix-blend-overlay" />
        {children}
      </main>
    </div>
  );
}

