"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Radar, Truck, Wallet, Menu, X, User, LogOut } from "lucide-react";
import SignOutButton from "@/components/ui/SignOutButton";

// Rider-only chrome. Three primary destinations live in a bottom tab bar (thumb reach, always visible),
// and everything secondary (Profile, Sign out) is behind ONE menu button, so there is a single sign-out
// and the header never has to fit a row of icons. Safe-area padding keeps it clear of gesture bars, and
// the menu sheet scrolls on short screens instead of clipping.

const TABS = [
  { href: "/rider", label: "Feed", Icon: Radar, exact: true },
  { href: "/rider/active-job", label: "Active", Icon: Truck },
  { href: "/rider/earnings", label: "Money", Icon: Wallet },
];

export function RiderTopBar({ showMenu }) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <header
        className="sticky top-0 z-50 flex items-center justify-between gap-3 border-b border-white/5 bg-charcoal-950/90 px-4 pb-3 backdrop-blur-xl"
        style={{ paddingTop: "calc(env(safe-area-inset-top, 0px) + 0.75rem)" }}
      >
        <div className="font-outfit font-black text-lg italic tracking-tighter shrink-0">
          NaijaDrops <span className="text-emerald-500">Rider</span>
        </div>
        {showMenu && (
          <button
            onClick={() => setOpen(true)}
            aria-label="Open menu"
            className="w-10 h-10 flex items-center justify-center rounded-xl text-charcoal-300 hover:bg-white/5 active:scale-95 transition"
          >
            <Menu size={20} />
          </button>
        )}
      </header>

      {open && (
        <div className="fixed inset-0 z-[120] flex items-end justify-center bg-black/70" onClick={() => setOpen(false)}>
          <div
            className="w-full max-w-lg max-h-[85dvh] overflow-y-auto rounded-t-[2rem] border border-white/10 bg-charcoal-900 p-5"
            style={{ paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 1.25rem)" }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-4 flex items-center justify-between">
              <span className="text-[10px] font-black uppercase tracking-[0.3em] text-charcoal-500">Menu</span>
              <button onClick={() => setOpen(false)} aria-label="Close menu" className="w-9 h-9 flex items-center justify-center rounded-xl text-charcoal-400 hover:bg-white/5">
                <X size={18} />
              </button>
            </div>
            <Link href="/profile" onClick={() => setOpen(false)} className="mb-2 flex items-center gap-3 rounded-2xl border border-white/10 bg-white/5 px-4 py-4 text-sm font-black text-ink">
              <User size={18} className="text-emerald-500" /> Profile
            </Link>
            <SignOutButton className="flex w-full items-center gap-3 rounded-2xl border border-red-500/20 bg-red-500/5 px-4 py-4 text-sm font-black text-red-400 cursor-pointer">
              <LogOut size={18} /> Sign out
            </SignOutButton>
          </div>
        </div>
      )}
    </>
  );
}

export function RiderTabBar() {
  const pathname = usePathname();
  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-50 border-t border-white/10 bg-charcoal-950/95 backdrop-blur-xl"
      style={{ paddingBottom: "env(safe-area-inset-bottom, 0px)" }}
    >
      <div className="mx-auto flex max-w-lg">
        {TABS.map(({ href, label, Icon, exact }) => {
          const active = exact ? pathname === href : pathname?.startsWith(href);
          return (
            <Link
              key={href}
              href={href}
              className={`flex flex-1 flex-col items-center gap-1 py-2.5 text-[10px] font-black uppercase tracking-widest transition-colors ${active ? "text-emerald-400" : "text-charcoal-500"}`}
            >
              <Icon size={20} />
              {label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
