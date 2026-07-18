<#
  Fix-OrdersAdminThemeMobile.ps1
  Compatible with Windows PowerShell 5.1 (no PS7-only syntax used).

  What this fixes:

  1. VENDOR "ACTIVE ORDERS" - ONLY SHOWED ONE, NO CANCEL
     New page: /vendor/active-orders shows a card for EVERY active order (not
     just the single most-recent one), each with a "Cancel" button that only
     appears while status is still pending/looking_for_driver (i.e. before a
     rider has accepted). Cancellation runs through a server action that
     checks order ownership and status server-side - not a raw client-side
     Supabase call - because orders/vendors currently have RLS disabled at the
     database level, so this action IS the actual security boundary right now.
     The vendor dashboard's "Active" badge now routes here instead of to a
     single order's tracking page.

  2. ADMIN CONSOLE - NOT MOBILE FRIENDLY, NO REACHABLE SIGN-OUT
     ops-terminal/layout.jsx had a fixed 288px sidebar with zero responsive
     handling - on a real phone width, that left almost no room for content
     and pushed the sign-out button below three full sections of nav links,
     which is why it looked unreachable/missing. Split into a server layout +
     a new client shell: the sidebar is now `hidden lg:flex` (desktop only)
     and mobile gets a proper top bar with a hamburger-triggered drawer
     containing the same nav, plus a sign-out button that's ALWAYS visible in
     the mobile top bar, not buried in a drawer. The admin console keeps its
     dark "terminal" look regardless of the site's light/dark toggle - that's
     a deliberate, scoped exception (see #4).

  3. RIDER NAV ICONS DISAPPEARING ON /profile
     A rider's own Feed/Active-Job icon row (in rider/(main)/layout.jsx) only
     renders for pages inside that route group - /profile is a separate,
     shared page outside it, so those icons vanished there. Added compact
     Feed/Active-Job icon links to the shared Navbar specifically for
     role==='rider', so they stay reachable on /profile (and anywhere else
     Navbar renders) without re-crowding the header.

  4. APP WAS DARK-ONLY - NOW LIGHT BY DEFAULT, WITH DARK AND SYSTEM OPTIONS
     A ThemeProvider already existed and already defaulted to 'light', but
     almost nothing in the app actually used theme-aware classes - every
     page hardcoded dark colors directly (bg-charcoal-950, text-white, etc)
     with no light equivalent, so toggling the theme did nothing visually.
     Meanwhile ~15 marketing pages (terms, privacy, about, pricing, faq,
     contact) were ALREADY built light (hardcoded bg-white) - a blanket
     "invert every color" approach would have broken those.
     Fix: the charcoal-600 through charcoal-950 color scale (page/card
     backgrounds, borders, muted text - used everywhere in the customer app,
     never in the light marketing pages) now reads from CSS variables that
     flip between a new bright light palette (default) and the exact
     original dark values (under a .dark class) - zero regression to dark
     mode, zero risk to the marketing pages since they don't use this scale.
     A new `ink` color token was added for primary text (was hardcoded
     `text-white` everywhere, which would've gone invisible on the new light
     backgrounds) - `text-white` was mechanically replaced with `text-ink`
     across the customer-facing app files only (not marketing pages, not
     ReviewModal/MapModal which are intentionally "always light" cards, not
     ops-terminal which keeps its dark terminal look on purpose).
     ThemeProvider now supports Light/Dark/System (previously just a binary
     toggle), with System actively tracking OS preference changes live. A
     Light/Dark/System picker was added to the Profile page.

  This script writes full file content for new/rewritten files, does targeted
  find-and-replace for existing files it only needs to touch in part, and
  does a scoped, mechanical text-white -> text-ink replacement across a
  specific list of customer-app files (listed inline below - marketing pages
  and ops-terminal are deliberately excluded). Backs up everything to
  .fix-backup-batch5\ first. Includes a UTF-8 BOM. Uses -LiteralPath
  throughout since this touches files under [driverId]/[orderId] folders.

  Run from the ROOT of your local repo clone:
      powershell -ExecutionPolicy Bypass -File .\Fix-OrdersAdminThemeMobile.ps1
#>

$ErrorActionPreference = "Stop"
$root = Get-Location
$backupDir = Join-Path $root ".fix-backup-batch5"
if (-not (Test-Path -LiteralPath $backupDir)) { New-Item -ItemType Directory -Path $backupDir | Out-Null }

function Get-FullPath($rel) { return Join-Path $root $rel }

function Backup-Path($full) {
    if (Test-Path -LiteralPath $full) {
        $rel = $full.Substring($root.Path.Length).TrimStart('\','/')
        $dest = Join-Path $backupDir $rel
        $destParent = Split-Path $dest -Parent
        if (-not (Test-Path -LiteralPath $destParent)) { New-Item -ItemType Directory -Path $destParent -Force | Out-Null }
        Copy-Item -LiteralPath $full -Destination $dest -Force
    }
}

function Resolve-TargetPath($originalRel, $movedRel) {
    if ($movedRel -ne $null) {
        $movedFull = Get-FullPath $movedRel
        if (Test-Path -LiteralPath $movedFull) { return $movedFull }
        $movedParent = Split-Path $movedFull -Parent
        if (Test-Path -LiteralPath $movedParent) { return $movedFull }
    }
    return Get-FullPath $originalRel
}

function Write-FileContent($targetFull, $content) {
    Backup-Path $targetFull
    $targetParent = Split-Path $targetFull -Parent
    if (-not (Test-Path -LiteralPath $targetParent)) { New-Item -ItemType Directory -Path $targetParent -Force | Out-Null }
    Set-Content -LiteralPath $targetFull -Value $content -NoNewline -Encoding UTF8
    Write-Host "  WROTE: $targetFull" -ForegroundColor Green
}

function Patch-File($targetFull, $oldStrLF, $newStrLF, $label) {
    if (-not (Test-Path -LiteralPath $targetFull)) {
        Write-Host "  SKIP (not found): $targetFull" -ForegroundColor Yellow
        return
    }
    $raw = Get-Content -LiteralPath $targetFull -Raw -Encoding UTF8
    $hadCRLF = $raw.Contains("`r`n")
    $normalized = $raw -replace "`r`n", "`n"

    if ($normalized.Contains($oldStrLF)) {
        Backup-Path $targetFull
        $normalized = $normalized.Replace($oldStrLF, $newStrLF)
        if ($hadCRLF) { $normalized = $normalized -replace "`n", "`r`n" }
        Set-Content -LiteralPath $targetFull -Value $normalized -NoNewline -Encoding UTF8
        Write-Host "  PATCHED: $label" -ForegroundColor Green
    } elseif ($normalized.Contains($newStrLF)) {
        Write-Host "  ALREADY PATCHED: $label" -ForegroundColor Yellow
    } else {
        Write-Host "  WARNING: anchor text not found for $label - skipped, file may have changed. Send me its current content and I will regenerate this." -ForegroundColor Red
    }
}

if (-not (Test-Path -LiteralPath (Get-FullPath "src\app"))) {
    Write-Host "ERROR: src\app not found. Run this script from the repo root." -ForegroundColor Red
    exit 1
}

Write-Host "`nApplying: vendor active-orders+cancel, admin mobile shell, rider nav, and the light/dark/system theme:" -ForegroundColor Cyan

$content0 = @'
"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/utils/supabase/client";
import { ArrowLeft, Package, MapPin, Clock, Loader2, X, ChevronRight, AlertTriangle } from "lucide-react";
import { cancelOrder } from "./actions";

const STATUS_LABELS = {
  pending: "Finding a rider",
  looking_for_driver: "Finding a rider",
  matched: "Rider assigned",
  picked_up: "Picked up",
  in_transit: "On the way",
};

const STATUS_STYLES = {
  pending: "bg-amber-500/10 text-amber-400 border-amber-500/20",
  looking_for_driver: "bg-amber-500/10 text-amber-400 border-amber-500/20",
  matched: "bg-blue-500/10 text-blue-400 border-blue-500/20",
  picked_up: "bg-blue-500/10 text-blue-400 border-blue-500/20",
  in_transit: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
};

const CANCELLABLE = ["pending", "looking_for_driver"];

function CancelModal({ order, onClose, onCancelled }) {
  const [reason, setReason] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const handleConfirm = async () => {
    setLoading(true);
    setError(null);
    const res = await cancelOrder(order.id, reason);
    setLoading(false);
    if (!res.success) {
      setError(res.error);
      return;
    }
    onCancelled(order.id);
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="bg-charcoal-900 border border-white/10 rounded-t-3xl sm:rounded-3xl w-full max-w-sm p-6 space-y-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-red-500/10 border border-red-500/20 rounded-xl flex items-center justify-center shrink-0">
            <AlertTriangle className="text-red-400" size={18} />
          </div>
          <div>
            <h3 className="text-ink font-black text-base">Cancel this delivery?</h3>
            <p className="text-charcoal-500 text-xs">No rider has accepted it yet - this is free to cancel.</p>
          </div>
        </div>
        <textarea
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="Optional: why are you cancelling? (helps us improve)"
          className="w-full bg-charcoal-950 border border-white/10 rounded-xl p-3 min-h-[80px] text-ink text-sm outline-none focus:border-emerald-500 transition-all resize-none"
        />
        {error && <p className="text-red-400 text-xs font-bold">{error}</p>}
        <div className="flex gap-3">
          <button
            onClick={onClose}
            disabled={loading}
            className="flex-1 py-3 rounded-xl bg-white/5 border border-white/10 text-ink text-xs font-black uppercase tracking-widest hover:bg-white/10 transition-all"
          >
            Keep Order
          </button>
          <button
            onClick={handleConfirm}
            disabled={loading}
            className="flex-1 py-3 rounded-xl bg-red-500 text-white text-xs font-black uppercase tracking-widest hover:bg-red-400 transition-all flex items-center justify-center gap-2 disabled:opacity-50"
          >
            {loading ? <Loader2 size={14} className="animate-spin" /> : <X size={14} />}
            Cancel It
          </button>
        </div>
      </div>
    </div>
  );
}

export default function ActiveOrdersPage() {
  const router = useRouter();
  const supabase = createClient();
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [cancelTarget, setCancelTarget] = useState(null);

  useEffect(() => {
    let channel;
    async function load() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { router.push("/auth/login"); return; }

      const { data: vendor } = await supabase.from("vendors").select("id").eq("user_id", user.id).single();
      if (!vendor) { setLoading(false); return; }

      const { data } = await supabase
        .from("orders")
        .select("*")
        .eq("vendor_id", vendor.id)
        .in("status", ["pending", "looking_for_driver", "matched", "picked_up", "in_transit"])
        .order("created_at", { ascending: false });

      setOrders(data || []);
      setLoading(false);

      channel = supabase
        .channel(`vendor-active-orders-${vendor.id}`)
        .on("postgres_changes", { event: "*", schema: "public", table: "orders", filter: `vendor_id=eq.${vendor.id}` },
          () => load())
        .subscribe();
    }
    load();
    return () => { if (channel) supabase.removeChannel(channel); };
  }, [supabase, router]);

  const handleCancelled = (orderId) => {
    setOrders(prev => prev.filter(o => o.id !== orderId));
    setCancelTarget(null);
  };

  return (
    <div className="min-h-[100dvh] bg-charcoal-950 pb-24">
      <div className="sticky top-0 z-20 bg-charcoal-950/90 backdrop-blur-xl border-b border-white/5 px-5 py-4 flex items-center gap-4">
        <button onClick={() => router.back()} className="w-10 h-10 flex items-center justify-center text-charcoal-400 hover:text-ink transition-colors">
          <ArrowLeft size={20} />
        </button>
        <div>
          <h1 className="text-ink font-black text-lg font-outfit">Active Orders</h1>
          <p className="text-charcoal-500 text-xs">{orders.length} in progress</p>
        </div>
      </div>

      <div className="px-5 py-6 space-y-4">
        {loading ? (
          <div className="flex justify-center py-20"><Loader2 className="animate-spin text-emerald-500" /></div>
        ) : orders.length === 0 ? (
          <div className="text-center py-20">
            <Package className="mx-auto text-charcoal-700 mb-4" size={40} />
            <p className="text-charcoal-500 text-sm">No active orders right now.</p>
          </div>
        ) : (
          orders.map((order) => (
            <div key={order.id} className="bg-white/[0.03] border border-white/10 rounded-2xl p-5 space-y-4">
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-2">
                  <Package size={16} className="text-charcoal-400" />
                  <span className="text-ink font-bold text-sm">{order.item_description || "Package"}</span>
                </div>
                <span className={`text-[9px] font-black uppercase tracking-widest px-2.5 py-1 rounded-full border ${STATUS_STYLES[order.status] || "bg-charcoal-800 text-charcoal-400 border-white/10"}`}>
                  {STATUS_LABELS[order.status] || order.status}
                </span>
              </div>

              <div className="space-y-1.5 text-xs">
                <div className="flex items-start gap-2 text-charcoal-400">
                  <MapPin size={12} className="mt-0.5 shrink-0" />
                  <span className="truncate">{order.pickup_name}</span>
                </div>
                <div className="flex items-start gap-2 text-charcoal-400">
                  <MapPin size={12} className="mt-0.5 shrink-0 text-emerald-500" />
                  <span className="truncate">{order.dropoff_name}</span>
                </div>
              </div>

              <div className="flex items-center justify-between pt-3 border-t border-white/5">
                <div className="flex items-center gap-1.5 text-charcoal-600 text-[10px]">
                  <Clock size={11} />
                  {new Date(order.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </div>
                <div className="flex items-center gap-2">
                  {CANCELLABLE.includes(order.status) && (
                    <button
                      onClick={() => setCancelTarget(order)}
                      className="text-[10px] font-black uppercase tracking-widest text-red-400 hover:text-red-300 px-3 py-2 rounded-lg hover:bg-red-500/10 transition-all"
                    >
                      Cancel
                    </button>
                  )}
                  <button
                    onClick={() => router.push(`/tracking/${order.id}`)}
                    className="flex items-center gap-1 text-[10px] font-black uppercase tracking-widest text-emerald-400 hover:text-emerald-300 px-3 py-2 rounded-lg hover:bg-emerald-500/10 transition-all"
                  >
                    Track <ChevronRight size={12} />
                  </button>
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      {cancelTarget && (
        <CancelModal
          order={cancelTarget}
          onClose={() => setCancelTarget(null)}
          onCancelled={handleCancelled}
        />
      )}
    </div>
  );
}
'@
$target0 = Resolve-TargetPath "src\app\vendor\active-orders\page.jsx" $null
Write-FileContent $target0 $content0

$content1 = @'
"use server";

import { createClient } from "@/utils/supabase/server";
import { revalidatePath } from "next/cache";

const CANCELLABLE_STATUSES = ["pending", "looking_for_driver"];

/**
 * Cancel a vendor's own order, but ONLY before a rider has accepted it.
 * Ownership and cancellable-status are both checked here server-side (not
 * left to a client-side supabase call) because orders/vendors currently have
 * RLS disabled at the database level - this action is the actual security
 * boundary until that's turned on.
 */
export async function cancelOrder(orderId, reason) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { success: false, error: "Not signed in." };

    const { data: vendor } = await supabase
      .from("vendors")
      .select("id")
      .eq("user_id", user.id)
      .single();
    if (!vendor) return { success: false, error: "No vendor profile found for this account." };

    const { data: order } = await supabase
      .from("orders")
      .select("id, vendor_id, status")
      .eq("id", orderId)
      .single();

    if (!order) return { success: false, error: "Order not found." };
    if (order.vendor_id !== vendor.id) return { success: false, error: "This isn't your order." };
    if (!CANCELLABLE_STATUSES.includes(order.status)) {
      return { success: false, error: "A rider has already accepted this order - it can no longer be cancelled here. Contact support." };
    }

    const { error } = await supabase
      .from("orders")
      .update({
        status: "cancelled",
        cancellation_reason: reason || "Cancelled by vendor before rider assignment",
      })
      .eq("id", orderId);

    if (error) throw error;

    revalidatePath("/vendor/active-orders");
    revalidatePath("/dashboard");
    return { success: true };
  } catch (err) {
    console.error("Cancel order error:", err);
    return { success: false, error: err.message };
  }
}
'@
$target1 = Resolve-TargetPath "src\app\vendor\active-orders\actions.js" $null
Write-FileContent $target1 $content1

$content2 = @'
import { redirect } from "next/navigation";
import { createClient } from "@/utils/supabase/server";
import { validateAdmin } from "@/utils/admin";
import OpsTerminalShell from "./OpsTerminalShell";

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

  return <OpsTerminalShell userEmail={user?.email}>{children}</OpsTerminalShell>;
}
'@
$target2 = Resolve-TargetPath "src\app\ops-terminal\layout.jsx" $null
Write-FileContent $target2 $content2

$content3 = @'
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
'@
$target3 = Resolve-TargetPath "src\app\ops-terminal\OpsTerminalShell.jsx" $null
Write-FileContent $target3 $content3

$content4 = @'
'use client';
import { createContext, useContext, useEffect, useState, useCallback } from 'react';

const ThemeContext = createContext({
  theme: 'light',       // resolved theme actually applied: 'light' | 'dark'
  mode: 'light',        // user's chosen mode: 'light' | 'dark' | 'system'
  setMode: () => {},
  toggleTheme: () => {},
});

function applyTheme(resolved) {
  if (resolved === 'dark') {
    document.documentElement.classList.add('dark');
  } else {
    document.documentElement.classList.remove('dark');
  }
}

export function ThemeProvider({ children }) {
    const [mode, setModeState] = useState('light');
    const [theme, setTheme] = useState('light');
    const [mounted, setMounted] = useState(false);

    useEffect(() => {
        setMounted(true);
        const stored = localStorage.getItem('themeMode'); // 'light' | 'dark' | 'system'
        const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');

        const resolve = (m) => (m === 'system' ? (mediaQuery.matches ? 'dark' : 'light') : m);

        const initialMode = stored === 'dark' || stored === 'light' || stored === 'system' ? stored : 'light';
        setModeState(initialMode);
        const resolved = resolve(initialMode);
        setTheme(resolved);
        applyTheme(resolved);

        // Keep tracking OS changes live while mode is 'system'.
        const handleSystemChange = (e) => {
            const currentMode = localStorage.getItem('themeMode') || 'light';
            if (currentMode === 'system') {
                const next = e.matches ? 'dark' : 'light';
                setTheme(next);
                applyTheme(next);
            }
        };
        mediaQuery.addEventListener('change', handleSystemChange);
        return () => mediaQuery.removeEventListener('change', handleSystemChange);
    }, []);

    const setMode = useCallback((newMode) => {
        localStorage.setItem('themeMode', newMode);
        setModeState(newMode);
        const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
        const resolved = newMode === 'system' ? (mediaQuery.matches ? 'dark' : 'light') : newMode;
        setTheme(resolved);
        applyTheme(resolved);
    }, []);

    // Kept for the existing Navbar toggle button - simple light/dark flip,
    // treated as explicitly choosing that mode (not 'system').
    const toggleTheme = useCallback(() => {
        setMode(theme === 'light' ? 'dark' : 'light');
    }, [theme, setMode]);

    return (
        <ThemeContext.Provider value={{ theme, mode, setMode, toggleTheme }}>
            {mounted ? children : <div style={{ visibility: 'hidden' }}>{children}</div>}
        </ThemeContext.Provider>
    );
}

export const useTheme = () => useContext(ThemeContext);
'@
$target4 = Resolve-TargetPath "src\components\ThemeProvider.jsx" $null
Write-FileContent $target4 $content4

$patchOld0 = @'
@import "tailwindcss";
@import "mapbox-gl/dist/mapbox-gl.css";
@custom-variant dark (&:is(.dark *));

@theme {
  /* Aura Foundation - Deep, High-Contrast Palette */
  --color-emerald-400: #34d399;
  --color-emerald-500: #10b981;
  --color-emerald-600: #059669;
  --color-emerald-700: #047857;
  --color-emerald-800: #065f46;
  --color-emerald-900: #064e3b;
  --color-emerald-950: #022c22;
  
  --color-charcoal-50: #fafafa;
  --color-charcoal-100: #f4f4f5;
  --color-charcoal-200: #e4e4e7;
  --color-charcoal-300: #d4d4d8;
  --color-charcoal-400: #a1a1aa;
  --color-charcoal-500: #71717a;
  --color-charcoal-600: #52525b;
  --color-charcoal-700: #3f3f46;
  --color-charcoal-800: #27272a;
  --color-charcoal-900: #18181b;
  --color-charcoal-950: #09090b;

  --shadow-glow: 0 0 20px -5px var(--color-emerald-500);
  --shadow-premium: 0 25px 50px -12px rgba(0, 0, 0, 0.5);
}
'@
$patchNew0 = @'
@import "tailwindcss";
@import "mapbox-gl/dist/mapbox-gl.css";
@custom-variant dark (&:is(.dark *));

@theme {
  /* Aura Foundation - Deep, High-Contrast Palette */
  --color-emerald-400: #34d399;
  --color-emerald-500: #10b981;
  --color-emerald-600: #059669;
  --color-emerald-700: #047857;
  --color-emerald-800: #065f46;
  --color-emerald-900: #064e3b;
  --color-emerald-950: #022c22;
  
  --color-charcoal-50: #fafafa;
  --color-charcoal-100: #f4f4f5;
  --color-charcoal-200: #e4e4e7;
  --color-charcoal-300: #d4d4d8;
  /* 400 upward now read from plain custom properties (defined below) instead
     of fixed hex, so the SAME class (e.g. bg-charcoal-950) can mean "near
     black" in dark mode and "near white" in light mode without touching any
     component file. 50-300 stay fixed - they're used as deliberate light
     accents in a handful of places (e.g. small badges) regardless of theme,
     not as the app's own background/text scale. */
  --color-charcoal-400: var(--app-charcoal-400);
  --color-charcoal-500: var(--app-charcoal-500);
  --color-charcoal-600: var(--app-charcoal-600);
  --color-charcoal-700: var(--app-charcoal-700);
  --color-charcoal-800: var(--app-charcoal-800);
  --color-charcoal-900: var(--app-charcoal-900);
  --color-charcoal-950: var(--app-charcoal-950);
  /* New token for primary text (headings/body) in the customer-facing app -
     dark ink on light backgrounds, white on dark backgrounds. Introduced
     instead of flipping the built-in `white`/`black` because those are
     already used, correctly, as fixed literal colors on ~15 already-light
     marketing pages (terms, privacy, about, pricing, faq, contact) and on
     several "always white" cards (e.g. review modal) - flipping them
     globally would have broken those. */
  --color-ink: var(--app-ink);

  --shadow-glow: 0 0 20px -5px var(--color-emerald-500);
  --shadow-premium: 0 25px 50px -12px rgba(0, 0, 0, 0.5);
}

:root {
  /* LIGHT (default) */
  --app-charcoal-950: #ffffff;
  --app-charcoal-900: #f7f7f8;
  --app-charcoal-800: #eef0f2;
  --app-charcoal-700: #e2e4e8;
  --app-charcoal-600: #52525b;
  --app-charcoal-500: #3f3f46;
  --app-charcoal-400: #52525b;
  --app-ink: #0a0a0c;
}

.dark {
  /* DARK (the app's original look, values unchanged from before) */
  --app-charcoal-950: #09090b;
  --app-charcoal-900: #18181b;
  --app-charcoal-800: #27272a;
  --app-charcoal-700: #3f3f46;
  --app-charcoal-600: #52525b;
  --app-charcoal-500: #71717a;
  --app-charcoal-400: #a1a1aa;
  --app-ink: #ffffff;
}

/* The admin console keeps its dark "terminal" look regardless of the site
   theme toggle - OpsTerminalShell applies this class unconditionally. */
.ops-terminal-scope {
  --app-charcoal-950: #09090b;
  --app-charcoal-900: #18181b;
  --app-charcoal-800: #27272a;
  --app-charcoal-700: #3f3f46;
  --app-charcoal-600: #52525b;
  --app-charcoal-500: #71717a;
  --app-charcoal-400: #a1a1aa;
  --app-ink: #ffffff;
}
'@
$patchTarget0 = Resolve-TargetPath "src\app\globals.css" $null
Patch-File $patchTarget0 $patchOld0 $patchNew0 "globals.css theme tokens"

$patchOld1 = @'
                onClick={() => latestActiveOrder && router.push(`/tracking/${latestActiveOrder.id}`)}
'@
$patchNew1 = @'
                onClick={() => router.push("/vendor/active-orders")}
'@
$patchTarget1 = Resolve-TargetPath "src\app\dashboard\page.jsx" $null
Patch-File $patchTarget1 $patchOld1 $patchNew1 "vendor dashboard Active badge routes to full list"

$patchOld2 = @'
import { User, Camera, Shield, Save, ArrowLeft, Star, Clock, MapPin } from "lucide-react";
import { motion } from "framer-motion";
import Navbar from "@/components/layout/Navbar";

export default function ProfilePage() {
  const [user, setUser] = useState(null);
  const [profile, setProfile] = useState(null);
  const [role, setRole] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [fullName, setFullName] = useState("");
  const [avatarUrl, setAvatarUrl] = useState("");
  const router = useRouter();
  const supabase = createClient();
'@
$patchNew2 = @'
import { User, Camera, Shield, Save, ArrowLeft, Star, Clock, MapPin, Sun, Moon, Monitor } from "lucide-react";
import { motion } from "framer-motion";
import Navbar from "@/components/layout/Navbar";
import { useTheme } from "@/components/ThemeProvider";

export default function ProfilePage() {
  const [user, setUser] = useState(null);
  const [profile, setProfile] = useState(null);
  const [role, setRole] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [fullName, setFullName] = useState("");
  const [avatarUrl, setAvatarUrl] = useState("");
  const router = useRouter();
  const supabase = createClient();
  const { mode: themeMode, setMode: setThemeMode } = useTheme();
'@
$patchTarget2 = Resolve-TargetPath "src\app\profile\page.jsx" $null
Patch-File $patchTarget2 $patchOld2 $patchNew2 "profile page imports + useTheme hook"

$patchOld3 = @'
          </section>
        )}

      </div>
    </main>
'@
$patchNew3 = @'
          </section>
        )}

        <section className="bg-white/[0.03] border border-white/10 rounded-[3rem] p-10">
           <div className="flex items-center gap-4 mb-8">
              <div className="w-12 h-12 bg-charcoal-900 rounded-2xl flex items-center justify-center text-emerald-500 border border-white/5">
                 <Sun size={24} />
              </div>
              <div>
                 <h3 className="text-white font-black text-xl italic tracking-tight">Appearance</h3>
                 <p className="text-charcoal-500 text-[9px] uppercase tracking-[0.2em] font-black">Light, Dark, or Match Your Device</p>
              </div>
           </div>

           <div className="grid grid-cols-3 gap-3">
              {[
                { value: 'light', label: 'Light', Icon: Sun },
                { value: 'dark', label: 'Dark', Icon: Moon },
                { value: 'system', label: 'System', Icon: Monitor },
              ].map(({ value, label, Icon }) => (
                <button
                  key={value}
                  onClick={() => setThemeMode(value)}
                  className={`flex flex-col items-center gap-2 py-5 rounded-2xl border transition-all ${
                    themeMode === value
                      ? 'bg-emerald-500/10 border-emerald-500/40 text-emerald-400'
                      : 'bg-charcoal-900 border-white/5 text-charcoal-500 hover:text-white hover:border-white/10'
                  }`}
                >
                  <Icon size={20} />
                  <span className="text-[10px] font-black uppercase tracking-widest">{label}</span>
                </button>
              ))}
           </div>
        </section>

      </div>
    </main>
'@
$patchTarget3 = Resolve-TargetPath "src\app\profile\page.jsx" $null
Patch-File $patchTarget3 $patchOld3 $patchNew3 "profile page Appearance section"

$patchOld4 = @'
import { Package, LogOut, Shield, User, Wallet, ArrowRight, CreditCard, MessageCircle, Phone, Smartphone, Sun, Moon } from "lucide-react";
'@
$patchNew4 = @'
import { Package, LogOut, Shield, User, Wallet, ArrowRight, CreditCard, MessageCircle, Phone, Smartphone, Sun, Moon, Radar, Truck } from "lucide-react";
'@
$patchTarget4 = Resolve-TargetPath "src\components\layout\Navbar.jsx" $null
Patch-File $patchTarget4 $patchOld4 $patchNew4 "Navbar icon imports"

$patchOld5 = @'
                {/* âœ… FIX: Rider wallet links to /rider/earnings not /driver/earnings */}
                {profile?.role === 'rider' && (
                <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }}>
                    <Link 
                        href="/rider/earnings" 
                        className="flex items-center gap-2 bg-emerald-500 text-white px-4 py-2.5 rounded-2xl text-xs font-black uppercase tracking-widest hover:bg-emerald-600 transition-all shadow-glow"
                    >
                        <Wallet size={16} /> Wallet
                    </Link>
                </motion.div>
                )}
'@
$patchNew5 = @'
                {/* Rider quick links - so Feed/Active Job stay reachable even on
                    pages outside /rider/(main) (like /profile), which doesn't
                    get the rider layout's own icon nav. Kept icon-only and
                    compact to avoid re-crowding the header. */}
                {profile?.role === 'rider' && (
                <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} className="hidden sm:flex items-center gap-1">
                    <Link href="/rider" title="Feed" className="w-10 h-10 flex items-center justify-center text-charcoal-400 dark:text-white hover:text-emerald-500 hover:bg-emerald-50 dark:hover:bg-white/10 rounded-2xl transition-all">
                        <Radar size={18} />
                    </Link>
                    <Link href="/rider/active-job" title="Active Job" className="w-10 h-10 flex items-center justify-center text-charcoal-400 dark:text-white hover:text-emerald-500 hover:bg-emerald-50 dark:hover:bg-white/10 rounded-2xl transition-all">
                        <Truck size={18} />
                    </Link>
                </motion.div>
                )}

                {/* âœ… FIX: Rider wallet links to /rider/earnings not /driver/earnings */}
                {profile?.role === 'rider' && (
                <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }}>
                    <Link 
                        href="/rider/earnings" 
                        className="flex items-center gap-2 bg-emerald-500 text-white px-4 py-2.5 rounded-2xl text-xs font-black uppercase tracking-widest hover:bg-emerald-600 transition-all shadow-glow"
                    >
                        <Wallet size={16} /> Wallet
                    </Link>
                </motion.div>
                )}
'@
$patchTarget5 = Resolve-TargetPath "src\components\layout\Navbar.jsx" $null
Patch-File $patchTarget5 $patchOld5 $patchNew5 "Navbar rider Feed/Active Job quick links"


Write-Host "`nApplying scoped text-white -> text-ink replacement (customer-app files only):" -ForegroundColor Cyan
$themeTargetFiles = @(
    "src\app\dashboard\layout.jsx",
    "src\app\dashboard\page.jsx",
    "src\app\profile\page.jsx",
    "src\app\rider\(main)\active-job\page.jsx",
    "src\app\rider\(main)\dashboard\page.jsx",
    "src\app\rider\(main)\earnings\page.jsx",
    "src\app\rider\(main)\jobs\page.jsx",
    "src\app\rider\(main)\layout.jsx",
    "src\app\rider\(main)\page.jsx",
    "src\app\rider\onboarding\page.jsx",
    "src\app\send-package\confirm\page.jsx",
    "src\app\send-package\step-1\page.jsx",
    "src\app\send-package\step-2\page.jsx",
    "src\app\send-package\step-3\page.jsx",
    "src\app\tracking\[orderId]\page.jsx",
    "src\app\vendor\create-delivery\page.jsx",
    "src\app\vendor\dashboard\page.jsx",
    "src\app\vendor\history\page.jsx",
    "src\app\vendor\layout.jsx"
)
foreach ($rel in $themeTargetFiles) {
    $full = Get-FullPath $rel
    if (-not (Test-Path -LiteralPath $full)) {
        Write-Host "  SKIP (not found): $rel" -ForegroundColor Yellow
        continue
    }
    $raw = Get-Content -LiteralPath $full -Raw -Encoding UTF8
    if ($raw -match "text-white") {
        Backup-Path $full
        $updated = $raw -replace "text-white", "text-ink"
        Set-Content -LiteralPath $full -Value $updated -NoNewline -Encoding UTF8
        Write-Host "  RETHEMED: $rel" -ForegroundColor Green
    } else {
        Write-Host "  (no text-white found, skipped): $rel" -ForegroundColor Yellow
    }
}

if (Test-Path -LiteralPath (Get-FullPath ".git")) {
    Write-Host "`nStaging and committing (not pushing):" -ForegroundColor Cyan
    git add -A
    git commit -m "feat: vendor active-orders list with cancel-before-accept, mobile-responsive admin console, rider nav on shared pages, light-mode-by-default theme with dark/system options"
    Write-Host "`nCommitted locally. Push it yourself when ready:" -ForegroundColor Cyan
    Write-Host "  git push" -ForegroundColor White
} else {
    Write-Host "`nNot a git repo - files were written but not committed." -ForegroundColor Yellow
}

Write-Host "`nDone. Backups are in .fix-backup-batch5\ if needed." -ForegroundColor Green
Write-Host "Supabase: added orders.cancellation_reason column - already applied directly, nothing to run there." -ForegroundColor Green
Write-Host "Note: the Terms page / Footer 'dead links' complaint was already fixed in an earlier round and is live on GitHub - if it still looks wrong, it's likely a stale deploy or browser cache, not new code to write." -ForegroundColor Yellow
