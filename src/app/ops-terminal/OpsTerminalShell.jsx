"use client";

import { useState } from "react";
import { Activity, ShieldCheck, DollarSign, Users, AlertOctagon, Package, LayoutDashboard, Menu, X, LogOut } from "lucide-react";

const NAV_SECTIONS = [
  {
    label: "Visibility",
    items: [
      { href: "/ops-terminal/dashboard", label: "Overview", icon: LayoutDashboard },
      { href: "/ops-terminal/orders", label: "Live Radar", icon: Package },
    ],
  },
  {
    label: "Operations",
    items: [
      { href: "/ops-terminal/drivers", label: "Tactical Fleet", icon: Users },
      { href: "/ops-terminal/admins", label: "Access Logs", icon: ShieldCheck },
    ],
  },
  {
    label: "Intelligence",
    items: [
      { href: "/ops-terminal/finance", label: "Treasury", icon: DollarSign },
      { href: "/ops-terminal/fraud", label: "Risk Control", icon: AlertOctagon, danger: true },
    ],
  },
];

function SidebarContent({ userEmail, onNavigate }) {
  return (
    <>
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
        {NAV_SECTIONS.map((section) => (
          <div key={section.label}>
            <div className="text-[10px] font-black text-charcoal-600 uppercase tracking-[0.3em] mb-4 px-4">{section.label}</div>
            <nav className="space-y-1">
              {section.items.map(({ href, label, icon: Icon, danger }) => (
                <a
                  key={href}
                  href={href}
                  onClick={onNavigate}
                  className={`flex items-center gap-3 p-4 rounded-2xl hover:bg-white/5 hover:text-white font-bold transition-all text-sm group ${
                    danger ? "text-red-500/70 hover:bg-red-500/10" : "text-charcoal-400"
                  }`}
                >
                  <Icon size={18} className={danger ? "group-hover:text-red-500 transition-colors" : "group-hover:text-emerald-500 transition-colors"} />
                  <span className={danger ? "group-hover:text-red-500 transition-colors" : ""}>{label}</span>
                </a>
              ))}
            </nav>
          </div>
        ))}
      </div>

      <div className="p-6 border-t border-white/5 bg-black/40">
        <div className="text-[10px] text-charcoal-500 font-mono tracking-widest uppercase mb-1">God Mode</div>
        <div className="text-white text-xs font-bold truncate mb-4">{userEmail}</div>
        <form action="/api/auth/signout" method="POST">
          <button type="submit" className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-[10px] font-black uppercase tracking-widest hover:bg-red-500/20 transition-all">
            <LogOut size={14} /> Sign Out
          </button>
        </form>
      </div>
    </>
  );
}

export default function OpsTerminalShell({ children, userEmail }) {
  const [drawerOpen, setDrawerOpen] = useState(false);

  return (
    <div className="ops-terminal-scope flex flex-col lg:flex-row h-[100dvh] bg-charcoal-950 text-white overflow-hidden selection:bg-emerald-500">
      {/* Mobile-only top bar: this is what was missing entirely on small screens
          before - previously the sidebar was a fixed 288px-wide column with no
          responsive handling at all, which on a ~375px phone left almost no
          room for content and pushed sign-out off screen below three full nav
          sections. */}
      <div className="lg:hidden flex items-center justify-between px-4 py-3 border-b border-white/5 bg-charcoal-900/80 backdrop-blur-md shrink-0">
        <button onClick={() => setDrawerOpen(true)} className="w-10 h-10 flex items-center justify-center text-white -ml-2">
          <Menu size={22} />
        </button>
        <div className="font-outfit font-black text-lg italic tracking-tighter uppercase">
          Ops<span className="text-emerald-500">Terminal</span>
        </div>
        <form action="/api/auth/signout" method="POST">
          <button type="submit" className="w-10 h-10 flex items-center justify-center text-red-400">
            <LogOut size={18} />
          </button>
        </form>
      </div>

      {/* Desktop sidebar: unchanged from before, always visible at lg+ */}
      <aside className="hidden lg:flex w-72 border-r border-white/5 bg-charcoal-900/50 flex-col backdrop-blur-md relative z-20 shrink-0">
        <SidebarContent userEmail={userEmail} />
      </aside>

      {/* Mobile drawer: same content as the desktop sidebar, slides in over content */}
      {drawerOpen && (
        <div className="lg:hidden fixed inset-0 z-50 flex">
          <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={() => setDrawerOpen(false)} />
          <aside className="relative w-[80vw] max-w-80 bg-charcoal-950 border-r border-white/10 flex flex-col h-full overflow-y-auto">
            <button onClick={() => setDrawerOpen(false)} className="absolute top-6 right-4 w-9 h-9 flex items-center justify-center text-charcoal-400 hover:text-white z-10">
              <X size={20} />
            </button>
            <SidebarContent userEmail={userEmail} onNavigate={() => setDrawerOpen(false)} />
          </aside>
        </div>
      )}

      {/* Main Content Area */}
      <main className="flex-1 overflow-y-auto relative z-10 bg-black">
        <div className="absolute inset-0 bg-[url('/noise.png')] opacity-20 pointer-events-none mix-blend-overlay" />
        {children}
      </main>
    </div>
  );
}