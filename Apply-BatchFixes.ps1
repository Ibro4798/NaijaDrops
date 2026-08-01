<#
Apply-BatchFixes.ps1

Applies the full batch of product/UX fixes discussed:

  1. Rider cashout requests now show bank account details (bank name, account
     number, account name) next to each request in ops-terminal/finance.
     NOTE: this assumes the Supabase migration adding riders.bank_name,
     riders.account_number, riders.account_name has ALREADY been applied
     (it was, directly, via MCP - not part of this script).
  2. Vendor cancellation reasons are now visible: new "Recently Cancelled"
     panel in ops-terminal/orders showing the reason each vendor gave.
  3. Receipt/share card redesigned to social-media dimensions (1080x1350,
     Strava-style social proof for vendors), Printer button removed.
  4. Anonymous customer tracking/receipt links now expire 2 hours after
     delivery, and customers get a minimal "Delivered!" screen instead of
     the vendor's full branded receipt.
  5. Vendor profile now has editable Business Name and Phone Number fields.
  6. Vendor phone number is now required (via a gate modal) before an order
     can be dispatched - not at signup.
  7. Back button after order match now goes to tracking, not browser history.
  8. Launch date updated from August 10 to August 15, 2026 everywhere
     (in-app banner, share text, page metadata/OG tags).

THIS SCRIPT DOES FULL-FILE REWRITES, not surgical patches - deliberately.
Several of these touch large files (tracking page, step-3) in multiple
non-contiguous places, and every file below has already been syntax-verified
(esbuild, JSX-aware) against your actual repo before being embedded here.
A full overwrite from verified-good content is more reliable than trying to
re-derive fragile find/replace patches for a change this size.

USAGE:
  Run from the root of a FRESH clone of Ibro4798/NaijaDrops (main branch).
  .\Apply-BatchFixes.ps1
#>

$ErrorActionPreference = "Stop"
$timestamp = Get-Date -Format "yyyyMMdd_HHmmss"

function Write-Utf8Bom([string]$Path, [string]$Content) {
    $crlfContent = $Content -replace "`r`n", "`n" -replace "`n", "`r`n"
    $utf8Bom = New-Object System.Text.UTF8Encoding($true)
    [System.IO.File]::WriteAllText($Path, $crlfContent, $utf8Bom)
}

Write-Host "=== Verifying expected files exist ===" -ForegroundColor Cyan

if (-not (Test-Path -LiteralPath "src\app\api\track\[orderId]\route.js")) { Write-Host "ERROR: src\app\api\track\[orderId]\route.js not found. Run from repo root." -ForegroundColor Red; exit 1 }
if (-not (Test-Path "src\app\layout.js")) { Write-Host "ERROR: src\app\layout.js not found. Run from repo root." -ForegroundColor Red; exit 1 }
if (-not (Test-Path "src\app\ops-terminal\finance\PendingWithdrawals.jsx")) { Write-Host "ERROR: src\app\ops-terminal\finance\PendingWithdrawals.jsx not found. Run from repo root." -ForegroundColor Red; exit 1 }
if (-not (Test-Path "src\app\ops-terminal\finance\page.jsx")) { Write-Host "ERROR: src\app\ops-terminal\finance\page.jsx not found. Run from repo root." -ForegroundColor Red; exit 1 }
if (-not (Test-Path "src\app\ops-terminal\orders\page.jsx")) { Write-Host "ERROR: src\app\ops-terminal\orders\page.jsx not found. Run from repo root." -ForegroundColor Red; exit 1 }
if (-not (Test-Path "src\app\profile\page.jsx")) { Write-Host "ERROR: src\app\profile\page.jsx not found. Run from repo root." -ForegroundColor Red; exit 1 }
if (-not (Test-Path -LiteralPath "src\app\receipt\[orderId]\page.jsx")) { Write-Host "ERROR: src\app\receipt\[orderId]\page.jsx not found. Run from repo root." -ForegroundColor Red; exit 1 }
if (-not (Test-Path "src\app\send-package\confirm\page.jsx")) { Write-Host "ERROR: src\app\send-package\confirm\page.jsx not found. Run from repo root." -ForegroundColor Red; exit 1 }
if (-not (Test-Path "src\app\send-package\step-3\page.jsx")) { Write-Host "ERROR: src\app\send-package\step-3\page.jsx not found. Run from repo root." -ForegroundColor Red; exit 1 }
if (-not (Test-Path -LiteralPath "src\app\tracking\[orderId]\page.jsx")) { Write-Host "ERROR: src\app\tracking\[orderId]\page.jsx not found. Run from repo root." -ForegroundColor Red; exit 1 }
if (-not (Test-Path "src\components\ui\ShareButton.jsx")) { Write-Host "ERROR: src\components\ui\ShareButton.jsx not found. Run from repo root." -ForegroundColor Red; exit 1 }
if (-not (Test-Path "src\utils\receiptImage.js")) { Write-Host "ERROR: src\utils\receiptImage.js not found. Run from repo root." -ForegroundColor Red; exit 1 }

Write-Host "All expected files found." -ForegroundColor Green

Write-Host "`n=== Backing up originals ===" -ForegroundColor Cyan
Copy-Item -LiteralPath "src\app\api\track\[orderId]\route.js" -Destination "src\app\api\track\[orderId]\route.js.bak_$timestamp" -Force
Write-Host "  src\app\api\track\[orderId]\route.js.bak_$timestamp"
Copy-Item -Path "src\app\layout.js" -Destination "src\app\layout.js.bak_$timestamp" -Force
Write-Host "  src\app\layout.js.bak_$timestamp"
Copy-Item -Path "src\app\ops-terminal\finance\PendingWithdrawals.jsx" -Destination "src\app\ops-terminal\finance\PendingWithdrawals.jsx.bak_$timestamp" -Force
Write-Host "  src\app\ops-terminal\finance\PendingWithdrawals.jsx.bak_$timestamp"
Copy-Item -Path "src\app\ops-terminal\finance\page.jsx" -Destination "src\app\ops-terminal\finance\page.jsx.bak_$timestamp" -Force
Write-Host "  src\app\ops-terminal\finance\page.jsx.bak_$timestamp"
Copy-Item -Path "src\app\ops-terminal\orders\page.jsx" -Destination "src\app\ops-terminal\orders\page.jsx.bak_$timestamp" -Force
Write-Host "  src\app\ops-terminal\orders\page.jsx.bak_$timestamp"
Copy-Item -Path "src\app\profile\page.jsx" -Destination "src\app\profile\page.jsx.bak_$timestamp" -Force
Write-Host "  src\app\profile\page.jsx.bak_$timestamp"
Copy-Item -LiteralPath "src\app\receipt\[orderId]\page.jsx" -Destination "src\app\receipt\[orderId]\page.jsx.bak_$timestamp" -Force
Write-Host "  src\app\receipt\[orderId]\page.jsx.bak_$timestamp"
Copy-Item -Path "src\app\send-package\confirm\page.jsx" -Destination "src\app\send-package\confirm\page.jsx.bak_$timestamp" -Force
Write-Host "  src\app\send-package\confirm\page.jsx.bak_$timestamp"
Copy-Item -Path "src\app\send-package\step-3\page.jsx" -Destination "src\app\send-package\step-3\page.jsx.bak_$timestamp" -Force
Write-Host "  src\app\send-package\step-3\page.jsx.bak_$timestamp"
Copy-Item -LiteralPath "src\app\tracking\[orderId]\page.jsx" -Destination "src\app\tracking\[orderId]\page.jsx.bak_$timestamp" -Force
Write-Host "  src\app\tracking\[orderId]\page.jsx.bak_$timestamp"
Copy-Item -Path "src\components\ui\ShareButton.jsx" -Destination "src\components\ui\ShareButton.jsx.bak_$timestamp" -Force
Write-Host "  src\components\ui\ShareButton.jsx.bak_$timestamp"
Copy-Item -Path "src\utils\receiptImage.js" -Destination "src\utils\receiptImage.js.bak_$timestamp" -Force
Write-Host "  src\utils\receiptImage.js.bak_$timestamp"

Write-Host "`n=== Writing patched files ===" -ForegroundColor Cyan
$content_0 = @'
import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

// Service-role client: bypasses RLS intentionally, because this route is the ONLY
// path an anonymous customer (no account) can use to check their delivery. It must
// never return anything beyond the fields explicitly selected below.
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// How long an anonymous customer's tracking/receipt link stays usable after
// the order is marked delivered. After this, the link is dead - it's a
// unique link scoped to the lifetime of that one delivery, not a permanent
// public URL for the order.
const POST_DELIVERY_GRACE_MS = 2 * 60 * 60 * 1000; // 2 hours

export async function GET(req, { params }) {
  const { orderId } = params;

  if (!orderId) {
    return NextResponse.json({ error: 'Missing order id' }, { status: 400 });
  }

  const { data: order, error } = await supabaseAdmin
    .from('orders')
    .select(`
      id, status, pickup_name, pickup_lat, pickup_lng, dropoff_name, dropoff_lat, dropoff_lng, item_description,
      created_at, updated_at, agreed_price, rider_id,
      riders ( id, current_lat, current_lng, users ( full_name, receipt_display_name ) ),
      vendors ( users ( receipt_display_name ) )
    `)
    .eq('id', orderId)
    .single();

  if (error || !order) {
    return NextResponse.json({ error: 'Order not found' }, { status: 404 });
  }

  if (order.status === 'delivered') {
    const deliveredAt = new Date(order.updated_at).getTime();
    if (Date.now() - deliveredAt > POST_DELIVERY_GRACE_MS) {
      return NextResponse.json({ error: 'Link expired', expired: true }, { status: 410 });
    }
  }

  // Deliberately narrow response: never leak recipient_phone, notes, voice_note_url,
  // or the vendor's real business_name/account identity to an anonymous requester.
  // The one exception is receipt_display_name - that's a name the vendor
  // explicitly chose to show on receipts (set in their profile), so surfacing
  // it here is the whole point of that field rather than a leak.
  const safePayload = {
    id: order.id,
    status: order.status,
    pickup_name: order.pickup_name,
    pickup_lat: order.pickup_lat,
    pickup_lng: order.pickup_lng,
    dropoff_name: order.dropoff_name,
    dropoff_lat: order.dropoff_lat,
    dropoff_lng: order.dropoff_lng,
    item_description: order.item_description,
    created_at: order.created_at,
    updated_at: order.updated_at,
    total_price: order.status === 'delivered' ? order.agreed_price : null,
    sender_display_name: order.vendors?.users?.receipt_display_name || null,
    rider: order.riders ? {
      first_name: (order.riders.users?.receipt_display_name || order.riders.users?.full_name || 'Rider').split(' ')[0],
      current_lat: order.riders.current_lat,
      current_lng: order.riders.current_lng
    } : null
  };

  return NextResponse.json({ success: true, order: safePayload });
}

'@
Write-Utf8Bom -Path "src\app\api\track\[orderId]\route.js" -Content $content_0
Write-Host "  [PATCHED] src\app\api\track\[orderId]\route.js"

$content_1 = @'

import "./globals.css";
import 'mapbox-gl/dist/mapbox-gl.css';
import { Outfit, Inter } from "next/font/google";
import { ThemeProvider } from "@/components/ThemeProvider";
import ChatNotificationListener from "@/components/ChatNotificationListener";
import OrderStatusNotificationListener from "@/components/OrderStatusNotificationListener";

const outfit = Outfit({ 
  subsets: ["latin"],
  variable: "--font-outfit",
});

const inter = Inter({ 
  subsets: ["latin"],
  variable: "--font-inter",
});

export const viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
  themeColor: "#10b981",
};

export const metadata = {
  title: "NaijaDrops | Reliable Delivery in Kano — Launching Aug 15",
  description: "No more chasing riders on the phone. NaijaDrops brings trackable, reliable delivery to Kano vendors and customers. Launching August 15.",
  metadataBase: new URL('https://naijadrops.tech'),
  manifest: "/manifest.json",
  icons: {
    icon: "/favicon.png",
    apple: "/favicon.png",
  },
  openGraph: {
    title: "NaijaDrops | Reliable Delivery in Kano — Launching Aug 15",
    description: "No more chasing riders on the phone. Track every delivery live, right here in Kano.",
    url: 'https://naijadrops.tech',
    siteName: 'NaijaDrops',
    locale: 'en_NG',
    type: 'website',
    images: [
      {
        url: '/og-image.png',
        width: 1200,
        height: 630,
        alt: 'NaijaDrops — Reliable delivery, finally trackable. Launching August 15 in Kano.',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: "NaijaDrops | Reliable Delivery in Kano — Launching Aug 15",
    description: "No more chasing riders on the phone. Track every delivery live, right here in Kano.",
    images: ['/og-image.png'],
  },
};

export default function RootLayout({ children }) {
  return (
    <html lang="en" suppressHydrationWarning className={`${outfit.variable} ${inter.variable}`}>
      <head>
        {/* Warms the DNS/TLS connection to Mapbox ahead of time, site-wide,
            so whichever page first opens a map isn't also paying for that
            handshake on top of downloading the map bundle itself. This is a
            near-zero-cost hint - browsers only actually use it if something
            on the page ends up requesting these domains. */}
        <link rel="preconnect" href="https://api.mapbox.com" crossOrigin="anonymous" />
        <link rel="preconnect" href="https://events.mapbox.com" crossOrigin="anonymous" />
        <link rel="dns-prefetch" href="https://api.mapbox.com" />
        <link rel="dns-prefetch" href="https://events.mapbox.com" />
      </head>
      <body className="font-sans bg-charcoal-50 text-charcoal-900 antialiased overflow-x-hidden selection:bg-emerald-500 selection:text-white flex flex-col min-h-screen">
        <ThemeProvider>
          {children}
          <ChatNotificationListener />
          <OrderStatusNotificationListener />
        </ThemeProvider>
      </body>
    </html>
  );
}
'@
Write-Utf8Bom -Path "src\app\layout.js" -Content $content_1
Write-Host "  [PATCHED] src\app\layout.js"

$content_2 = @'
"use client";

import { useState } from 'react';
import { createClient } from '@/utils/supabase/client';
import { Check, X, Loader2, AlertTriangle } from 'lucide-react';

export default function PendingWithdrawals({ initialRequests }) {
  const supabase = createClient();
  const [requests, setRequests] = useState(initialRequests);
  const [processingId, setProcessingId] = useState(null);

  async function resolve(id, approve) {
    setProcessingId(id);
    const { error } = await supabase.rpc('resolve_withdrawal', {
      p_transaction_id: id,
      p_approve: approve,
      p_note: null
    });
    setProcessingId(null);
    if (error) { alert(error.message); return; }
    setRequests(requests.filter(r => r.id !== id));
  }

  if (requests.length === 0) {
    return <p className="text-charcoal-500 text-sm italic py-6 text-center">No pending withdrawal requests.</p>;
  }

  return (
    <div className="space-y-3">
      {requests.map((r) => {
        const hasBankDetails = r.bank_name && r.account_number && r.account_name;
        return (
          <div key={r.id} className="bg-charcoal-900/40 border border-white/5 rounded-2xl p-5 flex items-center justify-between gap-4">
            <div className="min-w-0">
              <p className="text-white font-black">{r.rider_name || 'Rider'}</p>
              <p className="text-charcoal-500 text-xs">{new Date(r.created_at).toLocaleString()}</p>
              {hasBankDetails ? (
                <div className="mt-2 flex items-center gap-2 text-xs">
                  <span className="text-emerald-400 font-bold">{r.bank_name}</span>
                  <span className="text-charcoal-600">•</span>
                  <span className="text-charcoal-300 font-mono">{r.account_number}</span>
                  <span className="text-charcoal-600">•</span>
                  <span className="text-charcoal-400">{r.account_name}</span>
                </div>
              ) : (
                <div className="mt-2 flex items-center gap-1.5 text-[10px] font-black uppercase tracking-widest text-amber-500">
                  <AlertTriangle size={12} />
                  No payout account on file - contact rider directly
                </div>
              )}
            </div>
            <div className="flex items-center gap-4 shrink-0">
              <span className="text-emerald-400 font-black text-lg">₦{Number(r.amount).toLocaleString()}</span>
              <button
                onClick={() => resolve(r.id, true)}
                disabled={processingId === r.id}
                className="w-9 h-9 bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/20 rounded-xl flex items-center justify-center text-emerald-500 disabled:opacity-50"
              >
                {processingId === r.id ? <Loader2 className="animate-spin" size={16} /> : <Check size={16} />}
              </button>
              <button
                onClick={() => resolve(r.id, false)}
                disabled={processingId === r.id}
                className="w-9 h-9 bg-red-500/10 hover:bg-red-500/20 border border-red-500/20 rounded-xl flex items-center justify-center text-red-500 disabled:opacity-50"
              >
                <X size={16} />
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}

'@
Write-Utf8Bom -Path "src\app\ops-terminal\finance\PendingWithdrawals.jsx" -Content $content_2
Write-Host "  [PATCHED] src\app\ops-terminal\finance\PendingWithdrawals.jsx"

$content_3 = @'
﻿import { validateAdmin } from "@/utils/admin";
import { createClient } from "@/utils/supabase/server";
import { DollarSign, ArrowUpRight, ArrowDownRight, Wallet, Activity, CreditCard } from "lucide-react";
import FinanceCharts from "./FinanceCharts";
import PendingWithdrawals from "./PendingWithdrawals";

export const dynamic = "force-dynamic";

export default async function OpsFinancePage() {
  const { admin } = await validateAdmin();
  const supabase = await createClient();

  // 1. Fetch Aggregated Metrics
  const { data: totalEscrow } = await supabase
    .from("orders")
    .select("agreed_price")
    .eq("payment_status", "paid");

  const { data: completedOrders } = await supabase
    .from("orders")
    .select("agreed_price, created_at")
    .eq("status", "delivered");

  // Only count REQUESTED payouts as "pending" -- previously this counted paid and
  // rejected rows too since it only filtered on type, not status.
  const { data: pendingPayouts } = await supabase
    .from("wallet_transactions")
    .select("id, amount, created_at, rider_id, users:rider_id(full_name)")
    .eq("type", "payout_request")
    .eq("status", "requested")
    .order("created_at", { ascending: true });

  const currentEscrow = totalEscrow?.reduce((acc, curr) => acc + (curr.agreed_price || 0), 0) || 0;
  const totalRevenue = completedOrders?.reduce((acc, curr) => acc + (curr.agreed_price || 0), 0) || 0;
  const platformCut = totalRevenue * 0.20; // 20% commission
  const totalPayoutPending = pendingPayouts?.reduce((acc, curr) => acc + (curr.amount || 0), 0) || 0;

  // wallet_transactions.rider_id -> users.id, but bank details live on riders.user_id,
  // so this needs a second lookup rather than a nested embed off users.
  const riderUserIds = [...new Set((pendingPayouts || []).map(p => p.rider_id).filter(Boolean))];
  let bankByUserId = {};
  if (riderUserIds.length > 0) {
    const { data: riderBankRows } = await supabase
      .from("riders")
      .select("user_id, bank_name, account_number, account_name")
      .in("user_id", riderUserIds);
    bankByUserId = Object.fromEntries((riderBankRows || []).map(r => [r.user_id, r]));
  }

  const withdrawalRequests = (pendingPayouts || []).map(p => ({
    id: p.id,
    amount: p.amount,
    created_at: p.created_at,
    rider_name: p.users?.full_name || null,
    bank_name: bankByUserId[p.rider_id]?.bank_name || null,
    account_number: bankByUserId[p.rider_id]?.account_number || null,
    account_name: bankByUserId[p.rider_id]?.account_name || null,
  }));

  // Formatting historical data for charts
  const last7Days = [...Array(7)].map((_, i) => {
    const d = new Date();
    d.setDate(d.getDate() - i);
    return d.toISOString().split('T')[0];
  }).reverse();

  const chartData = last7Days.map(date => {
    const dayOrders = completedOrders?.filter(o => o.created_at.startsWith(date)) || [];
    const gmv = dayOrders.reduce((acc, curr) => acc + (curr.agreed_price || 0), 0);
    return {
      date: date.slice(5),
      gmv: gmv,
      revenue: gmv * 0.20
    };
  });

  const kpis = [
    { label: "Live Escrow Balance", value: `₦${currentEscrow.toLocaleString()}`, icon: <Wallet className="text-purple-500" />, trend: "Locked Funds" },
    { label: "Platform Revenue", value: `₦${platformCut.toLocaleString()}`, icon: <DollarSign className="text-emerald-500" />, trend: "20% Take Rate" },
    { label: "Gross Merchandise Value", value: `₦${totalRevenue.toLocaleString()}`, icon: <Activity className="text-blue-500" />, trend: "Total Processed" },
    { label: "Pending Payouts", value: `₦${totalPayoutPending.toLocaleString()}`, icon: <CreditCard className="text-amber-500" />, trend: "Rider Liabilities" }
  ];

  return (
    <div className="min-h-screen bg-black text-white p-8 font-mono">
      <div className="flex justify-between items-end mb-12 border-b border-white/10 pb-8">
        <div>
           <div className="flex items-center gap-2 text-emerald-500 text-xs font-bold uppercase tracking-[0.3em] mb-2">
              <div className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse" />
              Financial Telemetry Active
           </div>
           <h1 className="text-4xl font-black italic tracking-tighter uppercase">Treasury / Analytics</h1>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-12">
        {kpis.map((kpi, i) => (
          <div key={i} className="bg-charcoal-900/40 border border-white/5 p-6 rounded-2xl group hover:border-white/10 transition-all relative overflow-hidden">
             <div className="absolute top-0 right-0 w-24 h-24 bg-white/[0.02] rounded-bl-full pointer-events-none" />
             <div className="flex justify-between items-start mb-4 relative z-10">
                <div className="w-10 h-10 bg-white/5 rounded-xl flex items-center justify-center">
                   {kpi.icon}
                </div>
                <div className="text-[9px] font-black text-charcoal-600 uppercase tracking-widest">{kpi.trend}</div>
             </div>
             <div className="text-3xl font-black tracking-tight relative z-10">{kpi.value}</div>
             <div className="text-[10px] text-charcoal-500 font-bold uppercase mt-1 relative z-10">{kpi.label}</div>
          </div>
        ))}
      </div>

      <div className="bg-charcoal-900/40 border border-white/5 rounded-[2rem] p-8 mb-12">
        <div className="flex items-center justify-between mb-8">
           <h2 className="text-sm font-black uppercase tracking-[0.2em] text-emerald-500">Pending Withdrawal Requests</h2>
           <div className="px-4 py-1.5 rounded-full bg-amber-500/10 text-amber-500 text-[10px] font-black uppercase tracking-widest">
              {withdrawalRequests.length} Awaiting Action
           </div>
        </div>
        <PendingWithdrawals initialRequests={withdrawalRequests} />
      </div>

      <div className="bg-charcoal-900/40 border border-white/5 rounded-[2rem] p-8">
        <div className="flex items-center justify-between mb-8">
           <h2 className="text-sm font-black uppercase tracking-[0.2em] text-emerald-500">7-Day Revenue Trajectory</h2>
           <div className="px-4 py-1.5 rounded-full bg-emerald-500/10 text-emerald-500 text-[10px] font-black uppercase tracking-widest">
              Live Chart
           </div>
        </div>
        <div className="h-[400px] w-full">
           <FinanceCharts data={chartData} />
        </div>
      </div>
    </div>
  );
}
'@
Write-Utf8Bom -Path "src\app\ops-terminal\finance\page.jsx" -Content $content_3
Write-Host "  [PATCHED] src\app\ops-terminal\finance\page.jsx"

$content_4 = @'
import { validateAdmin } from "@/utils/admin";
import { createClient } from "@/utils/supabase/server";
import LiveOrdersFeed from "./LiveOrdersFeed";
import CancelledOrdersPanel from "./CancelledOrdersPanel";

export const dynamic = "force-dynamic";

export default async function OpsOrdersPage() {
  // LAYER 2: Server-Side RBAC Enforcement
  const { admin } = await validateAdmin();
  const supabase = await createClient();

  // Initial Data Fetch (Snapshot before real-time takes over)
  const { data: initialOrders } = await supabase
    .from("orders")
    .select(`
      *,
      riders (
         user_id,
         users (name),
         current_lat,
         current_lng,
         vehicle_type,
         plate_number
      )
    `)
    .in("status", ["pending", "looking_for_driver", "matched", "picked_up", "in_transit"])
    .order("created_at", { ascending: false });

  // Cancelled orders drop out of the live feed entirely (by design - it's a
  // live dispatch board), so cancellation_reason had nowhere to surface.
  // This pulls the last 15 cancellations specifically to show it.
  const { data: cancelledOrders } = await supabase
    .from("orders")
    .select("id, pickup_name, dropoff_name, cancellation_reason, updated_at")
    .eq("status", "cancelled")
    .order("updated_at", { ascending: false })
    .limit(15);

  return (
    <div className="min-h-screen bg-black text-white p-8 font-mono">
      {/* Header */}
      <div className="flex justify-between items-end mb-8 border-b border-white/10 pb-8">
        <div>
           <div className="flex items-center gap-2 text-emerald-500 text-xs font-bold uppercase tracking-[0.3em] mb-2">
              <div className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse" />
              Live Telemetry Feed Active
           </div>
           <h1 className="text-3xl font-black italic tracking-tighter uppercase">Traffic Control / Orders</h1>
        </div>
      </div>

      {/* Real-time Client Component */}
      <LiveOrdersFeed initialOrders={initialOrders || []} adminId={admin.id} />

      <div className="mt-12 bg-charcoal-900/40 border border-white/5 rounded-[2rem] p-8">
        <div className="flex items-center justify-between mb-8">
           <h2 className="text-sm font-black uppercase tracking-[0.2em] text-red-500">Recently Cancelled</h2>
           <div className="px-4 py-1.5 rounded-full bg-red-500/10 text-red-400 text-[10px] font-black uppercase tracking-widest">
              Last {cancelledOrders?.length || 0}
           </div>
        </div>
        <CancelledOrdersPanel orders={cancelledOrders || []} />
      </div>
    </div>
  );
}

'@
Write-Utf8Bom -Path "src\app\ops-terminal\orders\page.jsx" -Content $content_4
Write-Host "  [PATCHED] src\app\ops-terminal\orders\page.jsx"

$content_5 = @'
"use client";

import { XCircle } from "lucide-react";

/**
 * Surfaces cancellation_reason, which was already being captured on every
 * vendor-cancelled order but was never displayed anywhere in the app - it
 * was written to the orders table and then effectively discarded.
 */
export default function CancelledOrdersPanel({ orders }) {
  if (!orders || orders.length === 0) {
    return <p className="text-charcoal-500 text-sm italic py-6 text-center">No recent cancellations.</p>;
  }

  return (
    <div className="space-y-3">
      {orders.map((order) => (
        <div key={order.id} className="bg-charcoal-900/40 border border-white/5 rounded-2xl p-5">
          <div className="flex justify-between items-start gap-4 mb-3">
            <div className="flex items-center gap-2">
              <XCircle size={16} className="text-red-500 shrink-0" />
              <span className="text-white font-black text-sm">ID: {order.id.slice(0, 8)}</span>
            </div>
            <span className="text-charcoal-500 text-xs shrink-0">{new Date(order.updated_at).toLocaleString()}</span>
          </div>
          <div className="text-xs text-charcoal-400 mb-2">
            <span className="text-charcoal-600">{order.pickup_name?.split(',')[0]}</span>
            {" → "}
            <span className="text-charcoal-600">{order.dropoff_name?.split(',')[0]}</span>
          </div>
          <div className="bg-red-500/5 border border-red-500/10 rounded-xl px-4 py-3">
            <div className="text-[9px] font-black text-red-500/70 uppercase tracking-widest mb-1">Reason Given</div>
            <p className="text-red-200/90 text-sm">{order.cancellation_reason || "No reason given"}</p>
          </div>
        </div>
      ))}
    </div>
  );
}

'@
New-Item -ItemType Directory -Force -Path (Split-Path "src\app\ops-terminal\orders\CancelledOrdersPanel.jsx") | Out-Null
Write-Utf8Bom -Path "src\app\ops-terminal\orders\CancelledOrdersPanel.jsx" -Content $content_5
Write-Host "  [NEW] src\app\ops-terminal\orders\CancelledOrdersPanel.jsx"

$content_6 = @'
"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/utils/supabase/client";
import { getUserRole } from "@/utils/auth";
import { User, Camera, Shield, Save, ArrowLeft, Star, Clock, MapPin, Sun, Moon, Monitor, Phone, Briefcase } from "lucide-react";
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
  const [receiptDisplayName, setReceiptDisplayName] = useState("");
  const [phone, setPhone] = useState("");
  const [businessName, setBusinessName] = useState("");
  const router = useRouter();
  const supabase = createClient();
  const { mode: themeMode, setMode: setThemeMode } = useTheme();

  useEffect(() => {
    async function loadProfile() {
      const { user: u, role: r, profile: p } = await getUserRole(supabase);
      if (!u) {
        router.push("/login");
        return;
      }
      setUser(u);
      setRole(r);
      setProfile(p);
      setFullName(p?.name || "");
      setAvatarUrl(p?.avatar_url || "");
      setReceiptDisplayName(p?.receipt_display_name || "");
      setPhone(p?.phone || "");
      setBusinessName(p?.business_name || "");
      setIsLoading(false);
    }
    loadProfile();
  }, [supabase, router]);

  const handleSave = async () => {
    setIsSaving(true);
    try {
      const { error } = await supabase
        .from("users")
        .update({
          name: fullName,
          avatar_url: avatarUrl,
          receipt_display_name: receiptDisplayName || null,
          phone: phone || null,
        })
        .eq("id", user.id);

      if (error) throw error;

      if (role === 'vendor') {
        const { error: vendorError } = await supabase
          .from("vendors")
          .update({ business_name: businessName || null })
          .eq("user_id", user.id);
        if (vendorError) throw vendorError;
      }

      alert("Settings updated successfully!");
      router.refresh();
    } catch (err) {
      console.error(err);
      alert("Failed to update profile.");
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-charcoal-950 flex items-center justify-center">
        <div className="w-12 h-12 border-4 border-emerald-500/20 border-t-emerald-500 rounded-full animate-spin"></div>
      </div>
    );
  }

  return (
    <main className="min-h-screen bg-charcoal-950 pt-32 pb-20 px-6">
      <div className="max-w-2xl mx-auto">
        
        <header className="mb-12 flex items-center justify-between">
           <div>
              <h1 className="text-4xl font-black text-ink tracking-tighter italic font-outfit">Account Settings</h1>
              <p className="text-charcoal-500 font-bold text-[10px] uppercase tracking-widest mt-1">Your Profile & Details</p>
           </div>
           {role === 'rider' && (
             <div className="bg-emerald-500/10 border border-emerald-500/20 px-4 py-2 rounded-2xl flex items-center gap-2">
                <Star size={16} className="text-emerald-500" fill="currentColor" />
                <span className="text-ink font-black text-sm italic">{profile?.rating || "5.0"}</span>
             </div>
           )}
        </header>

        <section className="glass rounded-[3rem] p-10 border-white/5 relative overflow-hidden mb-8">
           <div className="absolute top-0 right-0 w-64 h-64 bg-emerald-500/5 rounded-full blur-[80px] pointer-events-none"></div>
           
           <div className="flex flex-col md:flex-row items-center gap-10 mb-12">
              <div className="relative group">
                 <div className="w-32 h-32 rounded-[2.5rem] bg-charcoal-800 flex items-center justify-center overflow-hidden border-2 border-white/10 group-hover:border-emerald-500 transition-all">
                    {avatarUrl ? (
                      <img src={avatarUrl} alt="Avatar" className="w-full h-full object-cover" />
                    ) : (
                      <User size={48} className="text-charcoal-600" />
                    )}
                 </div>
                 <button className="absolute -bottom-2 -right-2 w-10 h-10 bg-emerald-500 text-ink rounded-xl flex items-center justify-center shadow-glow hover:bg-emerald-400 transition-all">
                    <Camera size={18} />
                 </button>
              </div>

              <div className="flex-1 space-y-2 text-center md:text-left">
                 <div className="text-ink font-black text-2xl tracking-tight">{profile?.name || "New Dispatcher"}</div>
                 <div className="text-charcoal-500 font-bold text-sm tracking-tight">{user?.email}</div>
                 <div className="inline-flex items-center gap-2 px-3 py-1 bg-white/5 rounded-full border border-white/5">
                    <div className="w-2 h-2 bg-emerald-500 rounded-full"></div>
                    <span className="text-[9px] font-black uppercase tracking-widest text-emerald-500">{role} account active</span>
                 </div>
              </div>
           </div>

           <div className="space-y-8">
              <div className="grid grid-cols-1 gap-6">
                 <div>
                    <label className="text-[10px] font-black uppercase tracking-widest text-emerald-500 mb-3 block">Full Legal Name</label>
                    <input 
                      type="text" 
                      value={fullName}
                      onChange={(e) => setFullName(e.target.value)}
                      placeholder="Aliyu Ibrahim"
                      className="w-full bg-white/5 border-2 border-white/10 rounded-2xl px-6 py-4 text-ink font-bold tracking-tight focus:border-emerald-500 outline-none transition-all"
                    />
                 </div>

                 {role === 'vendor' && (
                   <div>
                      <label className="text-[10px] font-black uppercase tracking-widest text-emerald-500 mb-3 block flex items-center gap-2">
                        <Briefcase size={12} /> Business Name
                      </label>
                      <input
                        type="text"
                        value={businessName}
                        onChange={(e) => setBusinessName(e.target.value)}
                        placeholder="e.g. Marsad Beauty Store"
                        className="w-full bg-white/5 border-2 border-white/10 rounded-2xl px-6 py-4 text-ink font-bold tracking-tight focus:border-emerald-500 outline-none transition-all placeholder:text-charcoal-700"
                      />
                      <p className="text-charcoal-600 text-[10px] mt-2 font-medium px-1">
                        Used on receipts and order confirmations so customers recognize who sent the delivery.
                      </p>
                   </div>
                 )}

                 <div>
                    <label className="text-[10px] font-black uppercase tracking-widest text-emerald-500 mb-3 block flex items-center gap-2">
                      <Phone size={12} /> Phone Number
                    </label>
                    <input
                      type="tel"
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      placeholder="e.g. 0803xxxxxxx"
                      className="w-full bg-white/5 border-2 border-white/10 rounded-2xl px-6 py-4 text-ink font-bold tracking-tight focus:border-emerald-500 outline-none transition-all placeholder:text-charcoal-700"
                    />
                    <p className="text-charcoal-600 text-[10px] mt-2 font-medium px-1">
                      Used by the NaijaDrops team to reach you about deliveries. Not shown to customers.
                    </p>
                 </div>

                 <div>
                    <label className="text-[10px] font-black uppercase tracking-widest text-emerald-500 mb-3 block">Name Shown on Delivery Receipts</label>
                    <input 
                      type="text" 
                      value={receiptDisplayName}
                      onChange={(e) => setReceiptDisplayName(e.target.value)}
                      placeholder={role === 'vendor' ? 'e.g. your business name' : 'e.g. your preferred display name'}
                      className="w-full bg-white/5 border-2 border-white/10 rounded-2xl px-6 py-4 text-ink font-bold tracking-tight focus:border-emerald-500 outline-none transition-all placeholder:text-charcoal-700"
                    />
                    <p className="text-charcoal-600 text-[10px] mt-2 font-medium px-1">
                      {role === 'vendor'
                        ? "Shown to customers on their delivery receipt instead of your account name. Leave blank to use your business name."
                        : "Shown on receipts as the rider who delivered the order. Leave blank to use your full name."}
                    </p>
                 </div>
                 <div>
                    <label className="text-[10px] font-black uppercase tracking-widest text-emerald-500 mb-3 block">Registered Email Address (Locked)</label>
                    <input 
                      type="email" 
                      value={user?.email || ""}
                      readOnly
                      disabled
                      className="w-full bg-white/5 border-2 border-white/5 rounded-2xl px-6 py-4 text-charcoal-400 font-bold tracking-tight outline-none cursor-not-allowed opacity-60"
                    />
                 </div>
                 <div>
                    <label className="text-[10px] font-black uppercase tracking-widest text-emerald-500 mb-3 block">Avatar Source URL</label>
                    <input 
                      type="text" 
                      value={avatarUrl}
                      onChange={(e) => setAvatarUrl(e.target.value)}
                      placeholder="https://image-source.com/photo.jpg"
                      className="w-full bg-white/5 border-2 border-white/10 rounded-2xl px-6 py-4 text-ink font-bold tracking-tight focus:border-emerald-500 outline-none transition-all placeholder:text-charcoal-700"
                    />
                    <p className="text-charcoal-600 text-[10px] mt-2 font-medium px-1">Note: We currently support direct image URLs. Full upload system coming soon.</p>
                 </div>
              </div>

              <div className="pt-6 border-t border-white/5 flex gap-4">
                 <button 
                   onClick={handleSave}
                   disabled={isSaving}
                   className="flex-1 bg-emerald-500 hover:bg-emerald-400 disabled:bg-charcoal-700 text-ink font-black py-4 rounded-2xl transition-all shadow-glow active:scale-95 flex items-center justify-center gap-3"
                 >
                    {isSaving ? "Updating System..." : <><Save size={18} /> Commit Changes</>}
                 </button>
                 <button 
                   onClick={() => router.back()}
                   className="bg-white/5 border border-white/10 text-ink font-black px-8 rounded-2xl hover:bg-white/10 transition-all"
                 >
                    Discard
                 </button>
              </div>
           </div>
        </section>

        {role === 'rider' && (
          <section className="bg-emerald-500/5 border border-emerald-500/10 rounded-[3rem] p-10">
             <div className="flex items-center gap-4 mb-8">
                <div className="w-12 h-12 bg-emerald-500 rounded-2xl flex items-center justify-center text-ink shadow-glow">
                   <Shield size={24} />
                </div>
                <div>
                   <h3 className="text-ink font-black text-xl italic tracking-tight">Rider Details</h3>
                   <p className="text-charcoal-500 text-[9px] uppercase tracking-[0.2em] font-black">Your Rider Account</p>
                </div>
             </div>
             
             <div className="grid grid-cols-2 gap-4">
                <div className="p-6 bg-charcoal-900 rounded-2xl border border-white/5">
                   <div className="text-[9px] font-black text-emerald-500 uppercase tracking-widest mb-1">Status</div>
                   <div className="text-ink font-black text-lg italic tracking-tight">Operational</div>
                </div>
                <div className="p-6 bg-charcoal-900 rounded-2xl border border-white/5">
                   <div className="text-[9px] font-black text-emerald-500 uppercase tracking-widest mb-1">Commission</div>
                   <div className="text-ink font-black text-lg italic tracking-tight">20% Standard</div>
                </div>
             </div>
          </section>
        )}

        <section className="bg-white/[0.03] border border-white/10 rounded-[3rem] p-10">
           <div className="flex items-center gap-4 mb-8">
              <div className="w-12 h-12 bg-charcoal-900 rounded-2xl flex items-center justify-center text-emerald-500 border border-white/5">
                 <Sun size={24} />
              </div>
              <div>
                 <h3 className="text-ink font-black text-xl italic tracking-tight">Appearance</h3>
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
                      : 'bg-charcoal-900 border-white/5 text-charcoal-500 hover:text-ink hover:border-white/10'
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
  );
}

'@
Write-Utf8Bom -Path "src\app\profile\page.jsx" -Content $content_6
Write-Host "  [PATCHED] src\app\profile\page.jsx"

$content_7 = @'
"use client";

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { createClient } from '@/utils/supabase/client';
import { CheckCircle2, Package, Star, ArrowRight, Sparkles, Download, Loader2 } from 'lucide-react';
import ReceiptShareButton from '@/components/ui/ReceiptShareButton';
import ReviewModal from '@/components/ReviewModal';
import { renderReceiptImage } from '@/utils/receiptImage';

export default function ReceiptPage() {
  const { orderId } = useParams();
  const router = useRouter();
  const supabase = createClient();

  const [order, setOrder] = useState(null);
  const [isVendorView, setIsVendorView] = useState(false);
  const [currentUserId, setCurrentUserId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [expired, setExpired] = useState(false);
  const [showReview, setShowReview] = useState(false);
  const [downloading, setDownloading] = useState(false);

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        setCurrentUserId(user.id);
        const { data: authedOrder } = await supabase
          .from('orders')
          .select('*, riders(users(full_name, receipt_display_name)), vendors(business_name, logo_url, users(receipt_display_name))')
          .eq('id', orderId)
          .single();
        if (authedOrder) {
          setOrder(authedOrder);
          setIsVendorView(true);
          setLoading(false);
          return;
        }
      }

      try {
        const res = await fetch(`/api/track/${orderId}`);
        const json = await res.json();
        if (res.status === 410 || json?.expired) { setExpired(true); setLoading(false); return; }
        if (!res.ok || !json.success) { setNotFound(true); setLoading(false); return; }
        setOrder(json.order);
        setIsVendorView(false);
      } catch {
        setNotFound(true);
      }
      setLoading(false);
    }
    load();
  }, [orderId, supabase]);

  if (loading) {
    return (
      <div className="min-h-screen bg-charcoal-950 flex items-center justify-center">
        <div className="w-10 h-10 border-4 border-emerald-500/20 border-t-emerald-500 rounded-full animate-spin"></div>
      </div>
    );
  }

  if (expired) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-charcoal-950 text-center px-6">
        <CheckCircle2 className="text-emerald-500 mb-4" size={40} />
        <p className="text-ink font-black text-xl mb-2">This delivery is complete</p>
        <p className="text-charcoal-400 text-sm max-w-xs">
          This tracking link has expired now that the delivery is done. Contact the sender if you need anything else.
        </p>
      </div>
    );
  }

  if (notFound || !order) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-charcoal-950 text-center px-6">
        <p className="text-ink font-black text-xl mb-2">Receipt not found</p>
        <p className="text-charcoal-400 text-sm">Check the link and try again.</p>
      </div>
    );
  }

  if (order.status !== 'delivered') {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-charcoal-950 text-center px-6 gap-6">
        <div>
          <p className="text-ink font-black text-xl mb-2">This order hasn't been delivered yet</p>
          <p className="text-charcoal-400 text-sm">The receipt shows up here as soon as it's marked delivered.</p>
        </div>
        <button
          onClick={() => router.push(`/tracking/${orderId}`)}
          className="flex items-center gap-2 bg-emerald-500 hover:bg-emerald-400 text-charcoal-950 font-black text-sm px-6 py-3 rounded-2xl transition-all active:scale-95"
        >
          Track this delivery <ArrowRight size={16} />
        </button>
      </div>
    );
  }

  const riderName = order.riders?.users?.receipt_display_name || order.riders?.users?.full_name || order.rider?.first_name || null;
  const total = Number(order.agreed_price ?? order.total_price ?? 0);
  const deliveredAt = new Date(order.updated_at).toLocaleString();

  // --- Anonymous customer view: NOT the vendor's receipt. -----------------
  // Customers get a short, clean "it's done" confirmation - not a shareable
  // branded card meant for the VENDOR's own social proof. No Share/Download,
  // no vendor logo/business name treatment.
  if (!isVendorView) {
    const senderName = order.sender_display_name || null;
    return (
      <div className="min-h-screen bg-charcoal-950 flex flex-col items-center justify-center text-center px-6 gap-3">
        <div className="w-16 h-16 bg-emerald-500 rounded-3xl flex items-center justify-center mb-2 shadow-glow">
          <CheckCircle2 className="text-charcoal-950" size={32} />
        </div>
        <p className="text-ink font-black text-2xl">Delivered!</p>
        <p className="text-charcoal-400 text-sm max-w-xs">
          {order.item_description ? `${order.item_description} has` : "Your package has"} been delivered
          {senderName ? ` from ${senderName}` : ""}. Thanks for using NaijaDrops.
        </p>
        <p className="text-charcoal-600 text-xs mt-2">₦{total.toLocaleString()} • {deliveredAt}</p>
      </div>
    );
  }

  // --- Vendor view below: full share-card receipt, social-proof oriented ---
  const senderName = order.vendors?.users?.receipt_display_name || order.vendors?.business_name || null;
  const senderLogo = order.vendors?.logo_url || null;

  const receiptData = {
    total,
    itemDescription: order.item_description,
    pickupName: order.pickup_name,
    dropoffName: order.dropoff_name,
    riderName,
    senderName,
    deliveredAt,
    orderId: order.id,
  };

  async function handleDownload() {
    setDownloading(true);
    try {
      const blob = await renderReceiptImage(receiptData);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `naijadrops-receipt-${String(order.id).slice(0, 8)}.png`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error('Receipt download failed:', err);
    }
    setDownloading(false);
  }

  return (
    <div className="min-h-screen bg-charcoal-950">
      {/* Vibrant hero */}
      <div className="relative overflow-hidden bg-gradient-to-br from-emerald-500 via-emerald-600 to-charcoal-950 pt-16 pb-24 px-6">
        <div className="absolute top-10 left-10 w-32 h-32 bg-white/10 rounded-full blur-2xl"></div>
        <div className="absolute bottom-0 right-0 w-64 h-64 bg-charcoal-950/30 rounded-full blur-3xl"></div>
        <Sparkles className="absolute top-8 right-10 text-white/20" size={40} />
        <Sparkles className="absolute bottom-16 left-16 text-white/20" size={24} />

        <div className="relative max-w-md mx-auto text-center">
          <div className="w-20 h-20 bg-white rounded-3xl flex items-center justify-center mx-auto mb-6 shadow-2xl">
            <CheckCircle2 className="text-emerald-500" size={44} />
          </div>
          <p className="text-white/70 font-black text-[10px] uppercase tracking-[0.3em] mb-2">Delivered Successfully</p>
          <p className="text-white font-black text-5xl tracking-tighter">₦{total.toLocaleString()}</p>
          <p className="text-white/60 text-xs font-bold mt-2">{deliveredAt}</p>
        </div>
      </div>

      <div className="max-w-md mx-auto px-6 -mt-14 pb-16">
        {/* Perforated tear-off edge - classic receipt look */}
        <div
          className="h-4"
          style={{
            background: 'radial-gradient(circle at 12px 0, transparent 8px, #18181b 8px)',
            backgroundSize: '24px 16px',
            backgroundRepeat: 'repeat-x',
          }}
        />

        <div className="bg-charcoal-900 border border-white/10 border-t-0 rounded-b-[2rem] p-8 space-y-6 shadow-premium">

          {(senderName || senderLogo) && (
            <div className="flex flex-col items-center text-center gap-3 pb-4 border-b border-dashed border-white/10">
              {senderLogo ? (
                <img src={senderLogo} alt={senderName || 'Sender'} className="w-14 h-14 rounded-2xl object-cover border border-white/10" />
              ) : (
                <div className="w-14 h-14 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-500 font-black text-lg">
                  {(senderName || 'ND').slice(0, 2).toUpperCase()}
                </div>
              )}
              {senderName && <p className="text-ink font-black text-lg">{senderName}</p>}
              <p className="text-charcoal-500 text-[10px] font-black uppercase tracking-widest">Sent via NaijaDrops</p>
            </div>
          )}

          <div className="space-y-3">
            <div className="flex items-center gap-2 text-sm mb-1"><Package size={14} className="text-charcoal-400" /><span className="text-ink font-bold">{order.item_description}</span></div>
            <div className="flex justify-between text-sm"><span className="text-charcoal-400">From</span><span className="text-ink font-bold text-right">{order.pickup_name}</span></div>
            <div className="flex justify-between text-sm"><span className="text-charcoal-400">To</span><span className="text-ink font-bold text-right">{order.dropoff_name}</span></div>
            {riderName && <div className="flex justify-between text-sm"><span className="text-charcoal-400">Rider</span><span className="text-ink font-bold">{riderName}</span></div>}
            <div className="flex justify-between text-sm pt-3 border-t border-dashed border-white/10"><span className="text-charcoal-400 font-bold">Total Paid</span><span className="text-emerald-400 font-black text-lg">₦{total.toLocaleString()}</span></div>
          </div>

          <div className="flex flex-col gap-3 pt-2">
            <div className="grid grid-cols-3 gap-3">
              <ReceiptShareButton receiptData={receiptData} className="col-span-2" />
              <button
                onClick={handleDownload}
                disabled={downloading}
                className="flex items-center justify-center gap-2 py-3 bg-white/5 border border-white/10 rounded-2xl text-ink text-xs font-black uppercase tracking-widest hover:bg-white/10 transition-all active:scale-95 disabled:opacity-60"
              >
                {downloading ? <Loader2 size={16} className="animate-spin" /> : <Download size={16} />}
              </button>
            </div>
            {riderName && (
              <button
                onClick={() => setShowReview(true)}
                className="flex items-center justify-center gap-2 py-3 bg-emerald-500/10 border border-emerald-500/20 rounded-2xl text-emerald-400 text-xs font-black uppercase tracking-widest hover:bg-emerald-500/20 transition-all active:scale-95"
              >
                <Star size={16} /> Rate this delivery
              </button>
            )}
            <button
              onClick={() => router.push('/vendor/active-orders')}
              className="text-charcoal-400 hover:text-ink text-xs font-bold text-center pt-1 transition-colors"
            >
              Back to active orders
            </button>
          </div>
        </div>
      </div>

      {riderName && (
        <ReviewModal
          order={order}
          driverProfile={{ full_name: riderName }}
          reviewerId={currentUserId}
          isOpen={showReview}
          onClose={() => setShowReview(false)}
        />
      )}
    </div>
  );
}

'@
Write-Utf8Bom -Path "src\app\receipt\[orderId]\page.jsx" -Content $content_7
Write-Host "  [PATCHED] src\app\receipt\[orderId]\page.jsx"

$content_8 = @'
﻿"use client";

import { Suspense, useState, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/utils/supabase/client";
import { motion } from "framer-motion";
import { ArrowLeft, ShieldCheck, Star, Clock } from "lucide-react";
import dynamic from 'next/dynamic';
const PaystackButton = dynamic(
  () => import('react-paystack').then((mod) => mod.PaystackButton),
  { ssr: false }
);
function ConfirmContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const orderId = searchParams.get("orderId");
  const supabase = createClient();

  const [order, setOrder] = useState(null);
  const [rider, setRider] = useState(null);
  const [loading, setLoading] = useState(true);
  const [cancelling, setCancelling] = useState(false);

  useEffect(() => {
    if (!orderId) { router.replace("/send-package/step-3"); return; }
    async function fetchData() {
      const { data: o } = await supabase.from("orders").select("*").eq("id", orderId).single();
      if (!o) { router.replace("/send-package/step-3"); return; }
      setOrder(o);

      if (o.rider_id) {
        const { data: r } = await supabase
          .from("riders")
          .select("*, users(full_name, email)")
          .eq("user_id", o.rider_id)
          .single();
        setRider(r);
      }
      setLoading(false);
    }
    fetchData();
  }, [orderId]);

  async function cancelMatch() {
    setCancelling(true);
    await supabase.from("orders").update({ 
      rider_id: null, 
      status: "pending" 
    }).eq("id", orderId);
    router.replace(`/send-package/step-3?orderId=${orderId}`);
  }

  const paystackConfig = {
    reference: (new Date()).getTime().toString(),
    email: rider?.users?.email || "customer@naijadrops.com",
    amount: (order?.agreed_price || 0) * 100, // Paystack uses kobo
    publicKey: process.env.NEXT_PUBLIC_PAYSTACK_PUBLIC_KEY,
    metadata: {
      orderId: orderId,
      riderId: rider?.user_id,
      vendorId: order?.vendor_id,
    }
  };

  const handlePaystackSuccessAction = (reference) => {
    // We don't update state here! The webhook handles it.
    // But we redirect to a 'waiting' or 'tracking' page
    router.push(`/track/${orderId}?payment=verifying`);
  };

  const handlePaystackCloseAction = () => {
    console.log('closed');
  };

  const componentProps = {
    ...paystackConfig,
    text: 'Pay & Dispatch Driver',
    onSuccess: (reference) => handlePaystackSuccessAction(reference),
    onClose: handlePaystackCloseAction,
  };

  if (loading) return (
    <div className="min-h-screen bg-charcoal-950 flex items-center justify-center">
      <div className="w-8 h-8 border-2 border-emerald-500/30 border-t-emerald-500 rounded-full animate-spin" />
    </div>
  );

  const etaMin = order?.eta_min || Math.round(8 + Math.random() * 7);

  return (
    <div className="min-h-[100dvh] bg-charcoal-950 flex flex-col">
      {/* Header */}
      <div className="flex items-center gap-4 px-5 pt-14 pb-5">
        {/* FIX: this page only exists once a driver has already been matched
            and an order created - router.back() would drop the vendor back
            into whatever step-3 search/negotiation state was last in browser
            history, which no longer makes sense. Forward to tracking instead. */}
        <button onClick={() => router.replace(`/tracking/${orderId}`)} className="w-10 h-10 rounded-2xl bg-white/[0.05] border border-white/10 flex items-center justify-center text-ink hover:bg-white/10 transition-colors">
          <ArrowLeft size={18} />
        </button>
        <div>
          <div className="text-[10px] font-black text-charcoal-500 uppercase tracking-widest">Safe Escrow Bridge</div>
          <h1 className="text-xl font-black text-ink tracking-tight">Checkout Portal</h1>
        </div>
      </div>

      <div className="flex-1 px-5 overflow-y-auto pb-6 space-y-4">
        {/* Driver card */}
        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}
          className="bg-white/[0.04] border border-white/10 rounded-3xl p-5">
          <div className="flex justify-between items-center mb-4">
            <div className="text-[10px] font-black text-charcoal-500 uppercase tracking-widest">Matched Dispatcher</div>
            <div className="flex items-center gap-1.5 px-2 py-1 bg-emerald-500/10 border border-emerald-500/20 rounded-lg">
               <div className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse" />
               <span className="text-[9px] font-black text-emerald-500 uppercase">Reserved</span>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <div className="w-16 h-16 bg-emerald-500/10 border border-emerald-500/20 rounded-2xl flex items-center justify-center text-3xl">
              {order?.vehicle_type === "car" ? "🚗" : "🏍️"}
            </div>
            <div className="flex-1">
              <div className="flex items-center gap-2">
                <span className="text-ink font-black text-xl">{rider?.users?.full_name || "Verified Driver"}</span>
                <ShieldCheck size={16} className="text-blue-400" />
              </div>
              <div className="flex items-center gap-3 mt-1">
                <div className="flex items-center gap-1 text-amber-400">
                  <Star size={12} fill="currentColor" />
                  <span className="text-xs font-black">{rider?.rating || "5.0"}</span>
                </div>
                <span className="text-charcoal-600 text-xs">·</span>
                <span className="text-charcoal-400 text-xs capitalize font-medium">{order?.vehicle_type || "motorcycle"}</span>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3 mt-4">
            <div className="bg-white/[0.03] rounded-2xl p-3">
              <Clock size={14} className="text-emerald-400 mb-1" />
              <div className="text-ink font-black text-lg">{etaMin} min</div>
              <div className="text-charcoal-500 text-[10px] font-bold uppercase tracking-widest">ETA to pickup</div>
            </div>
            <div className="bg-white/[0.03] rounded-2xl p-3">
              <div className="text-emerald-400 font-black text-xl mb-1">₦{order?.agreed_price?.toLocaleString()}</div>
              <div className="text-charcoal-500 text-[10px] font-bold uppercase tracking-widest">Escrow Hold</div>
            </div>
          </div>
        </motion.div>

        {/* Route card */}
        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.08 }}
          className="bg-white/[0.04] border border-white/10 rounded-3xl p-5">
          <div className="text-[10px] font-black text-charcoal-500 uppercase tracking-widest mb-4">Logistics Route</div>
          <div className="space-y-4 relative">
            <div className="absolute left-3 top-6 bottom-6 w-0.5 bg-gradient-to-b from-charcoal-600 to-emerald-500" />
            <div className="flex items-start gap-4">
              <div className="w-6 h-6 bg-charcoal-700 border-2 border-charcoal-600 rounded-full flex items-center justify-center shrink-0 z-10">
                <div className="w-2 h-2 bg-white rounded-full" />
              </div>
              <div>
                <div className="text-[10px] font-black text-charcoal-500 uppercase tracking-widest mb-0.5">Pickup</div>
                <div className="text-ink font-semibold text-sm leading-tight">{order?.pickup_name}</div>
              </div>
            </div>
            <div className="flex items-start gap-4">
              <div className="w-6 h-6 bg-emerald-500/20 border-2 border-emerald-500 rounded-full flex items-center justify-center shrink-0 z-10">
                <div className="w-2 h-2 bg-emerald-400 rounded-full animate-pulse" />
              </div>
              <div>
                <div className="text-[10px] font-black text-emerald-500 uppercase tracking-widest mb-0.5">Dropoff</div>
                <div className="text-ink font-semibold text-sm leading-tight">{order?.dropoff_name}</div>
              </div>
            </div>
          </div>
        </motion.div>

        {/* Price Summary */}
        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.16 }}
          className="bg-emerald-500/[0.06] border border-emerald-500/20 rounded-3xl p-5">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-[10px] font-black text-charcoal-500 uppercase tracking-widest mb-1">Authorization Amount</div>
              <div className="text-emerald-400 font-black text-4xl">₦{order?.agreed_price?.toLocaleString()}</div>
            </div>
          </div>
          <div className="mt-4 pt-4 border-t border-emerald-500/10 flex items-center gap-3">
             <ShieldCheck size={24} className="text-emerald-500" />
             <p className="text-[10px] text-charcoal-400 font-medium leading-tight uppercase tracking-tight">
               Funds are held in escrow and only released to the rider once the package is delivered. 100% refund available before pickup.
             </p>
          </div>
        </motion.div>
      </div>

      {/* CTA */}
      <div className="px-5 pb-8 pt-4 border-t border-white/[0.06] space-y-3">
        <PaystackButton {...componentProps} className="w-full bg-emerald-500 hover:bg-emerald-400 text-charcoal-950 font-black py-5 rounded-2xl flex items-center justify-center gap-2 text-lg shadow-[0_0_24px_rgba(16,185,129,0.4)] transition-all" />
        
        <button 
          onClick={cancelMatch}
          disabled={cancelling}
          className="w-full py-4 text-charcoal-500 font-black uppercase text-[10px] tracking-widest hover:text-ink transition-colors"
        >
          {cancelling ? "Releasing Driver..." : "Cancel & Change Driver"}
        </button>
      </div>
    </div>
  );
}

export default function ConfirmPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-charcoal-950 flex items-center justify-center"><div className="w-8 h-8 border-2 border-emerald-500/30 border-t-emerald-500 rounded-full animate-spin" /></div>}>
      <ConfirmContent />
    </Suspense>
  );
}

'@
Write-Utf8Bom -Path "src\app\send-package\confirm\page.jsx" -Content $content_8
Write-Host "  [PATCHED] src\app\send-package\confirm\page.jsx"

$content_9 = @'
﻿"use client";

import { useState, useEffect, useRef, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { createClient } from "@/utils/supabase/client";
import {
  ArrowLeft, Star, Zap, MessageCircle, Clock, Bike, Car,
  CheckCircle2, X, ChevronRight, Loader2, AlertCircle, DollarSign, Lock
} from "lucide-react";

const DRAFT_KEY = "nd_order_draft";
const NEGOTIATION_TIMEOUT = 60; // seconds

function Step3Content() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const supabase = createClient();

  const [draft, setDraft] = useState(null);
  const [orderId, setOrderId] = useState(searchParams.get("orderId") || null);
  const [mode, setMode] = useState("quickmatch"); // 'quickmatch' | 'negotiate'
  const [matchState, setMatchState] = useState("idle"); // 'idle' | 'searching' | 'found' | 'accepted' | 'no_drivers'
  const [matchedRider, setMatchedRider] = useState(null);
  const [bids, setBids] = useState([]);
  const [offerPrice, setOfferPrice] = useState("");
  const [offerSent, setOfferSent] = useState(false);
  const [timeLeft, setTimeLeft] = useState(NEGOTIATION_TIMEOUT);
  const [creatingOrder, setCreatingOrder] = useState(false);
  const [error, setError] = useState(null);

  // ✅ NEW: Auth gate state — show signup prompt instead of redirecting
  const [showAuthGate, setShowAuthGate] = useState(false);
  const [showLaunchGate, setShowLaunchGate] = useState(false);
  const [showPhoneGate, setShowPhoneGate] = useState(false);
  const [phoneInput, setPhoneInput] = useState("");
  const [savingPhone, setSavingPhone] = useState(false);
  const [phoneGateError, setPhoneGateError] = useState(null);

  const timerRef = useRef(null);
  const channelRef = useRef(null);
  const pollingRef = useRef(null);

  // Load draft on mount — do NOT create order or check auth yet
  useEffect(() => {
    try {
      const d = JSON.parse(sessionStorage.getItem(DRAFT_KEY));
      if (!d?.pickup || !d?.estimated_price) { router.replace("/send-package/step-2"); return; }
      setDraft(d);
      setOfferPrice(String(d.estimated_price));
      // If we already have an orderId (returning to this page), resume match
      if (d.orderId) {
        setOrderId(d.orderId);
        setMatchState("searching");
        startQuickMatch(d.orderId);
      }
    } catch { router.replace("/send-package/step-2"); }
  }, []);

  // ✅ NEW: "Find My Driver" button handler — checks auth before creating order
  // Soft pre-launch gate: everyone except this one test account sees the
  // launch-date message instead of actually dispatching. Intentionally a UI-
  // level check, not a hard backend block - this isn't protecting anything
  // sensitive, just managing expectations before the real pilot goes live.
  const LAUNCH_GATE_ALLOWED_EMAIL = "ibroibrahim665@gmail.com";

  async function handleFindDriver() {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      // Show auth gate instead of redirecting away
      setShowAuthGate(true);
      return;
    }

    // Gate: we need a phone number on file before we can actually call this
    // vendor about a delivery (rider no-shows, address confusion, etc).
    // Deliberately checked here - the first moment we're about to actually
    // need to reach them - not at signup, where it'd just be one more field
    // people skip past.
    const { data: userRow } = await supabase.from("users").select("phone").eq("id", user.id).single();
    if (!userRow?.phone) {
      setShowPhoneGate(true);
      return;
    }

    if (user.email !== LAUNCH_GATE_ALLOWED_EMAIL) {
      setShowLaunchGate(true);
      return;
    }
    await createOrder();
  }

  async function savePhoneAndContinue() {
    setPhoneGateError(null);
    const cleaned = phoneInput.trim();
    if (cleaned.length < 10) {
      setPhoneGateError("Enter a valid phone number.");
      return;
    }
    setSavingPhone(true);
    const { data: { user } } = await supabase.auth.getUser();
    const { error } = await supabase.from("users").update({ phone: cleaned }).eq("id", user.id);
    setSavingPhone(false);
    if (error) {
      setPhoneGateError("Couldn't save that - try again.");
      return;
    }
    setShowPhoneGate(false);
    await handleFindDriver();
  }

  async function createOrder() {
    setCreatingOrder(true);
    setMatchState("searching");
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { setShowAuthGate(true); setCreatingOrder(false); return; }

      // Get Vendor Profile ID (Required for Foreign Key)
      const { data: vendorProfile } = await supabase
        .from("vendors")
        .select("id")
        .eq("user_id", user.id)
        .single();

      if (!vendorProfile) throw new Error("Vendor profile not found. Please go back and select 'Send Packages' again.");

      const { data: order, error: err } = await supabase.from("orders").insert({
        vendor_id: vendorProfile.id,
        pickup_name: draft.pickup.name,
        pickup_lat: draft.pickup.lat,
        pickup_lng: draft.pickup.lng,
        pickup_details: draft.pickup_note || null,
        pickup_voice_note_url: draft.pickup_voice_note_url || null,
        dropoff_name: draft.dropoff.name,
        dropoff_lat: draft.dropoff.lat,
        dropoff_lng: draft.dropoff.lng,
        dropoff_details: draft.dropoff_note || null,
        dropoff_voice_note_url: draft.dropoff_voice_note_url || null,
        item_size: draft.size,
        vehicle_type: draft.vehicle,
        item_description: draft.description,
        package_photo_url: draft.package_photo_url || null,
        voice_note_url: draft.voice_note,
        // ✅ FIX: Use correct column names matching DB schema
        recipient_name: draft.recipient_name,
        recipient_phone: draft.recipient_phone,
        notify_receiver: draft.notify_receiver,
        agreed_price: draft.estimated_price,
        status: "pending",
      }).select().single();

      if (err) throw err;
      setOrderId(order.id);
      sessionStorage.setItem(DRAFT_KEY, JSON.stringify({ ...draft, orderId: order.id }));
      startQuickMatch(order.id);
    } catch (e) {
      setError("Failed to create order: " + e.message);
      setMatchState("idle");
    } finally {
      setCreatingOrder(false);
    }
  }

  async function startQuickMatch(oid) {
    setMatchState("searching");
    setError(null);
    if (pollingRef.current) clearInterval(pollingRef.current);
    
    // Setup Realtime listener first (to catch the update when matched/assigned)
    const channel = supabase.channel(`order-match-${oid}`)
      .on("postgres_changes", {
        event: "UPDATE", schema: "public", table: "orders", filter: `id=eq.${oid}`
      }, async (payload) => {
        if (payload.new.rider_id && payload.new.status === "matched") {
          if (pollingRef.current) clearInterval(pollingRef.current);
          const { data: rider } = await supabase
            .from("riders")
            .select("*, users(full_name, email)")
            .eq("id", payload.new.rider_id)
            .single();
            
          setMatchedRider({
            id: payload.new.rider_id,
            name: rider?.users?.full_name || "Rider",
            vehicle_type: rider?.vehicle_type || "bike",
            plate: rider?.plate_number || "",
            rating: rider?.rating || 5.0,
            eta_min: Math.round(5 + Math.random() * 10),
            price: payload.new.agreed_price,
          });
          setMatchState("found");
        }
      })
      .subscribe();
    channelRef.current = channel;

    // Trigger the actual Dispatch Engine
    const triggerDispatch = async () => {
      try {
        const response = await fetch("/api/dispatch", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ orderId: oid })
        });
        return await response.json();
      } catch (e) {
        console.error("Dispatch Fault:", e);
        return { success: false, message: e.message };
      }
    };

    // FIX: this result used to be thrown away entirely - if dispatch failed
    // for any reason (including the RLS bug that silently blocked every
    // broadcast until now), the vendor just watched "searching..." with zero
    // explanation until the 15s poll cycle eventually gave up.
    //
    // SECOND BUG FOUND: the dispatch route's error path returns
    // { error: "..." } (no "success" key at all), but this check only ever
    // looked for { success: false, message }. That mismatch meant a genuine
    // server-side failure (e.g. missing SUPABASE_SERVICE_ROLE_KEY causing
    // the admin client to throw) still showed nothing to the vendor, even
    // after the fix above - now both shapes are caught.
    const firstAttempt = await triggerDispatch();
    if (firstAttempt && (firstAttempt.success === false || firstAttempt.error)) {
      setError(firstAttempt.message || firstAttempt.error || "Couldn't reach nearby riders. Retrying automatically...");
    }

    // Poll every 15 seconds to check status and expand radius if necessary
    pollingRef.current = setInterval(async () => {
      const { data: order, error: orderErr } = await supabase
        .from("orders")
        .select("status, broadcast_radius_km, max_broadcast_radius_km")
        .eq("id", oid)
        .single();

      if (orderErr || !order) return;

      if (order.status !== "pending") {
        clearInterval(pollingRef.current);
        return;
      }

      const currentRadius = Number(order.broadcast_radius_km) || 1.5;
      const maxRadius = Number(order.max_broadcast_radius_km) || 8;

      if (currentRadius >= maxRadius) {
        clearInterval(pollingRef.current);
        setMatchState("no_drivers");
        setError("No riders nearby within the maximum search radius.");
        return;
      }

      // Expand order radius in DB
      await supabase.rpc('expand_order_radius', { p_order_id: oid });

      // Re-trigger dispatch API to broadcast to the new radius pool
      await triggerDispatch();
    }, 15000);
  }

  function startNegotiationTimer() {
    setTimeLeft(NEGOTIATION_TIMEOUT);
    timerRef.current = setInterval(() => {
      setTimeLeft(t => {
        if (t <= 1) {
          clearInterval(timerRef.current);
          setMode("quickmatch");
          setOfferSent(false);
          setBids([]);
          if (orderId) startQuickMatch(orderId);
          return 0;
        }
        return t - 1;
      });
    }, 1000);
  }

  async function sendOffer() {
    if (!offerPrice || !orderId) return;
    const price = parseInt(offerPrice);
    if (isNaN(price) || price < 100) { setError("Please enter a valid price (min ₦100)"); return; }

    await supabase.from("orders").update({ agreed_price: price, status: "negotiating" }).eq("id", orderId);

    // ✅ FIX: Use correct column names in join
    const channel = supabase.channel(`bids-${orderId}`)
      .on("postgres_changes", {
        event: "INSERT", schema: "public", table: "bids", filter: `order_id=eq.${orderId}`
      }, async (payload) => {
        const { data: bid } = await supabase.from("bids")
          .select("*, riders(user_id, vehicle_type, plate_number, rating, users(full_name))")
          .eq("id", payload.new.id).single();
        if (bid) setBids(prev => [...prev, bid]);
      })
      .subscribe();
    channelRef.current = channel;

    setOfferSent(true);
    startNegotiationTimer();
  }

  async function acceptBid(bid) {
    clearInterval(timerRef.current);
    if (pollingRef.current) clearInterval(pollingRef.current);
    if (channelRef.current) supabase.removeChannel(channelRef.current);

    const { error: rpcErr } = await supabase.rpc('accept_bid', { p_order_id: orderId, p_bid_id: bid.id });
    if (rpcErr) {
      setError("Failed to accept bid: " + rpcErr.message);
      return;
    }

    setMatchedRider({
      id: bid.rider_id,
      // ✅ FIX: full_name not name
      name: bid.riders?.users?.full_name || "Driver",
      vehicle_type: bid.riders?.vehicle_type || "bike",
      plate: bid.riders?.plate_number || "",
      // ✅ FIX: rating not avg_rating
      rating: bid.riders?.rating || 5.0,
      eta_min: Math.round(5 + Math.random() * 10),
      price: bid.amount,
    });
    setMatchState("accepted");
    setTimeout(() => router.push(`/send-package/confirm?orderId=${orderId}`), 1000);
  }

  async function cancelMatch() {
    if (!orderId) return;
    if (pollingRef.current) clearInterval(pollingRef.current);
    
    const { data: order } = await supabase.from("orders").select("rider_id").eq("id", orderId).single();
    if (order?.rider_id) {
      await supabase.from("riders").update({ operational_status: "online" }).eq("user_id", order.rider_id);
    }

    setMatchState("searching");
    await supabase.from("orders").update({ rider_id: null, status: "pending" }).eq("id", orderId);
    setMatchedRider(null);
    setBids([]);
    setOfferSent(false);
    if (orderId) startQuickMatch(orderId);
  }

  async function acceptQuickMatch() {
    if (!matchedRider) return;
    await supabase.from("riders").update({ operational_status: "awaiting_payment" }).eq("user_id", matchedRider.id);
    setMatchState("accepted");
    setTimeout(() => router.push(`/send-package/confirm?orderId=${orderId}`), 800);
  }

  useEffect(() => {
    return () => {
      clearInterval(timerRef.current);
      if (pollingRef.current) clearInterval(pollingRef.current);
      if (channelRef.current) supabase.removeChannel(channelRef.current);
    };
  }, []);

  if (!draft) return (
    <div className="min-h-screen bg-charcoal-950 flex items-center justify-center">
      <div className="w-8 h-8 border-2 border-emerald-500/30 border-t-emerald-500 rounded-full animate-spin" />
    </div>
  );

  return (
    <div className="min-h-[100dvh] bg-charcoal-950 flex flex-col">
      {/* Header */}
      <div className="flex items-center gap-4 px-5 pt-14 pb-5">
        <button onClick={() => router.push("/send-package/step-2")} className="w-10 h-10 rounded-2xl bg-white/[0.05] border border-white/10 flex items-center justify-center text-ink hover:bg-white/10 transition-colors">
          <ArrowLeft size={18} />
        </button>
        <div>
          <div className="text-[10px] font-black text-charcoal-500 uppercase tracking-widest">Step 3 of 3</div>
          <h1 className="text-xl font-black text-ink tracking-tight">Find a Driver</h1>
        </div>
        <div className="ml-auto flex gap-1.5">
          {[1, 2, 3].map(s => (
            <div key={s} className={`h-1.5 rounded-full transition-all w-6 bg-emerald-500`} />
          ))}
        </div>
      </div>

      {/* ✅ NEW: Auth Gate Modal — shown instead of redirect */}
      <AnimatePresence>
        {showAuthGate && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-charcoal-950/90 backdrop-blur-md z-50 flex items-end justify-center pb-10 px-5"
          >
            <motion.div
              initial={{ y: 80, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 80, opacity: 0 }}
              className="w-full max-w-sm bg-charcoal-900 border border-white/10 rounded-[2rem] p-8 text-center"
            >
              <div className="w-16 h-16 bg-emerald-500/10 border border-emerald-500/20 rounded-full flex items-center justify-center mx-auto mb-6">
                <Lock size={28} className="text-emerald-500" />
              </div>
              <h2 className="text-xl font-black text-ink mb-3">Almost there!</h2>
              <p className="text-charcoal-400 text-sm leading-relaxed mb-8">
                Create a free account to confirm your delivery. Your route and pricing are saved — just sign in and dispatch.
              </p>
              <button
                onClick={() => router.push('/auth/login?next=/send-package/step-3')}
                className="w-full bg-emerald-500 hover:bg-emerald-400 text-charcoal-950 font-black py-4 rounded-2xl mb-3 transition-all"
              >
                Create Free Account
              </button>
              <button
                onClick={() => setShowAuthGate(false)}
                className="w-full py-4 text-charcoal-500 font-bold text-sm"
              >
                ← Back to preview
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Phone gate: we need a working number before we can dispatch, since
          riders and ops need to be able to reach the vendor directly if
          something goes wrong. Collected here, not at signup. */}
      <AnimatePresence>
        {showPhoneGate && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-charcoal-950/90 backdrop-blur-md z-50 flex items-end justify-center pb-10 px-5"
          >
            <motion.div
              initial={{ y: 80, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 80, opacity: 0 }}
              className="w-full max-w-sm bg-charcoal-900 border border-white/10 rounded-[2rem] p-8 text-center"
            >
              <div className="w-16 h-16 bg-emerald-500/10 border border-emerald-500/20 rounded-full flex items-center justify-center mx-auto mb-6">
                <Lock size={28} className="text-emerald-500" />
              </div>
              <h2 className="text-xl font-black text-ink mb-3">One quick thing</h2>
              <p className="text-charcoal-400 text-sm leading-relaxed mb-6">
                We need a phone number so we can reach you if a rider has trouble finding the pickup, or anything else comes up during this delivery.
              </p>
              <input
                type="tel"
                value={phoneInput}
                onChange={(e) => setPhoneInput(e.target.value)}
                placeholder="e.g. 0803xxxxxxx"
                className="w-full bg-white/5 border-2 border-white/10 rounded-2xl px-5 py-4 text-ink font-bold tracking-tight focus:border-emerald-500 outline-none transition-all mb-3"
              />
              {phoneGateError && <p className="text-red-400 text-xs font-bold mb-3">{phoneGateError}</p>}
              <button
                onClick={savePhoneAndContinue}
                disabled={savingPhone}
                className="w-full bg-emerald-500 hover:bg-emerald-400 disabled:opacity-60 text-charcoal-950 font-black py-4 rounded-2xl mb-3 transition-all"
              >
                {savingPhone ? "Saving..." : "Save & Continue"}
              </button>
              <button
                onClick={() => setShowPhoneGate(false)}
                className="w-full py-4 text-charcoal-500 font-bold text-sm"
              >
                ← Back to preview
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Pre-launch gate: everyone except the one test account sees this
          instead of actually dispatching a rider. */}
      <AnimatePresence>
        {showLaunchGate && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-charcoal-950/90 backdrop-blur-md z-50 flex items-end justify-center pb-10 px-5"
          >
            <motion.div
              initial={{ y: 80, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 80, opacity: 0 }}
              className="w-full max-w-sm bg-charcoal-900 border border-white/10 rounded-[2rem] p-8 text-center"
            >
              <div className="w-16 h-16 bg-emerald-500/10 border border-emerald-500/20 rounded-full flex items-center justify-center mx-auto mb-6">
                <Clock size={28} className="text-emerald-500" />
              </div>
              <h2 className="text-xl font-black text-ink mb-3">We're almost open!</h2>
              <p className="text-charcoal-400 text-sm leading-relaxed mb-2">
                NaijaDrops launches fully in Kano on <span className="text-ink font-bold">Saturday, August 15, 2026</span>.
              </p>
              <p className="text-charcoal-500 text-xs leading-relaxed mb-8">
                Your route and pricing are saved - come back after launch and dispatch will be live.
              </p>
              <button
                onClick={() => setShowLaunchGate(false)}
                className="w-full bg-emerald-500 hover:bg-emerald-400 text-charcoal-950 font-black py-4 rounded-2xl transition-all"
              >
                Got it
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ✅ NEW: Idle state — shown before user clicks "Find My Driver" */}
      {matchState === "idle" && (
        <div className="flex-1 flex flex-col items-center justify-center px-5 pb-10">
          <div className="w-full max-w-sm bg-white/[0.04] border border-white/10 rounded-3xl p-6 mb-8">
            <div className="text-[10px] font-black text-emerald-500 uppercase tracking-widest mb-4">Your Delivery Summary</div>
            <div className="space-y-3">
              <div className="flex justify-between text-sm">
                <span className="text-charcoal-500 font-bold">From</span>
                <span className="text-ink font-black text-right max-w-[180px] truncate">{draft.pickup?.name}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-charcoal-500 font-bold">To</span>
                <span className="text-ink font-black text-right max-w-[180px] truncate">{draft.dropoff?.name}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-charcoal-500 font-bold">Estimated Fare</span>
                <span className="text-emerald-400 font-black">₦{draft.estimated_price?.toLocaleString()}</span>
              </div>
            </div>
          </div>
          {error && (
            <div className="w-full max-w-sm mb-6 p-4 bg-red-500/10 border border-red-500/20 rounded-2xl text-red-400 text-sm font-bold">
              {error}
            </div>
          )}
          <button
            onClick={handleFindDriver}
            disabled={creatingOrder}
            className="w-full max-w-sm bg-emerald-500 hover:bg-emerald-400 text-charcoal-950 font-black py-5 rounded-2xl text-lg flex items-center justify-center gap-3 shadow-[0_0_24px_rgba(16,185,129,0.3)] transition-all active:scale-95 disabled:opacity-50"
          >
            {creatingOrder ? <Loader2 size={22} className="animate-spin" /> : <><Zap size={22} /> Find My Rider</>}
          </button>
          <p className="text-charcoal-600 text-xs font-bold mt-4 uppercase tracking-widest">No payment until delivery</p>
        </div>
      )}

      {/* Mode Toggle — only show when actively searching/matching */}
      {matchState !== "idle" && (
        <>
          <div className="mx-5 mb-6 bg-white/[0.04] border border-white/10 rounded-2xl p-1 flex gap-1">
            <button onClick={() => { setMode("quickmatch"); setOfferSent(false); clearInterval(timerRef.current); if (orderId && matchState !== "found") startQuickMatch(orderId); }}
              className={`flex-1 py-2.5 rounded-xl text-sm font-black transition-all flex items-center justify-center gap-1.5 ${mode === "quickmatch" ? "bg-emerald-500 text-charcoal-950 shadow-[0_0_12px_rgba(16,185,129,0.4)]" : "text-charcoal-500 hover:text-ink"}`}>
              <Zap size={14} /> Quick Match
            </button>
            <button onClick={() => setMode("negotiate")}
              className={`flex-1 py-2.5 rounded-xl text-sm font-black transition-all flex items-center justify-center gap-1.5 ${mode === "negotiate" ? "bg-white/10 text-ink" : "text-charcoal-500 hover:text-ink"}`}>
              <MessageCircle size={14} /> Negotiate Price
            </button>
          </div>

          <div className="flex-1 px-5 overflow-y-auto pb-8">
            <AnimatePresence mode="wait">

              {/* ====== QUICK MATCH MODE ====== */}
              {(mode === "quickmatch" || (mode === "negotiate" && matchState === "found")) && (
                <motion.div key="quickmatch" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} className="space-y-6">
                  {mode === "negotiate" && <div className="text-[10px] font-black text-charcoal-500 uppercase tracking-widest px-1">Instant Match Available</div>}
                  
                  {matchState === "searching" && mode === "quickmatch" && (
                    <div className="flex flex-col items-center py-16">
                      <div className="relative mb-8">
                        <div className="w-32 h-32 rounded-full bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center">
                          <div className="w-16 h-16 bg-emerald-500/20 rounded-full flex items-center justify-center">
                            <Loader2 size={32} className="text-emerald-500 animate-spin" />
                          </div>
                        </div>
                        <div className="absolute inset-0 w-32 h-32 rounded-full border border-emerald-500/30 animate-ping opacity-20" />
                      </div>
                      <h2 className="text-ink font-black text-xl mb-2">Finding nearby riders...</h2>
                      <p className="text-charcoal-500 text-sm text-center max-w-[240px]">Scanning riders within 3km of your pickup point</p>
                    </div>
                  )}

                  {matchState === "found" && matchedRider && (
                    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="space-y-4">
                      <div className="bg-white/[0.04] border border-white/10 rounded-3xl p-5 relative overflow-hidden">
                        <div className="absolute top-0 right-0 px-3 py-1 bg-emerald-500 text-charcoal-950 font-black text-[10px] uppercase tracking-widest rounded-bl-xl">Best Value</div>
                        <div className="flex items-center gap-4 mb-5">
                          <div className="w-16 h-16 bg-emerald-500/10 rounded-2xl flex items-center justify-center text-3xl border border-emerald-500/20">
                            {matchedRider.vehicle_type === "car" ? "🚗" : "🏍️"}
                          </div>
                          <div className="flex-1">
                            <div className="text-ink font-black text-xl">{matchedRider.name}</div>
                            <div className="flex items-center gap-2 mt-1">
                              <div className="flex items-center gap-1 text-amber-400 font-black text-xs">⭐ {matchedRider.rating}</div>
                              <span className="text-charcoal-600">·</span>
                              <span className="text-ink font-black text-lg">₦{matchedRider.price?.toLocaleString()}</span>
                            </div>
                          </div>
                        </div>

                        <div className="flex gap-3">
                          <button onClick={cancelMatch} className="flex-1 py-4 bg-white/5 border border-white/10 text-ink font-black rounded-2xl uppercase text-[10px] tracking-widest">
                            Cancel Match
                          </button>
                          <button onClick={acceptQuickMatch}
                            className="flex-[2] bg-emerald-500 hover:bg-emerald-400 text-charcoal-950 font-black py-4 rounded-2xl flex items-center justify-center gap-2 transition-all active:scale-[0.98]">
                            Instant Start <Zap size={18} />
                          </button>
                        </div>
                      </div>
                    </motion.div>
                  )}

                  {matchState === "accepted" && (
                    <div className="flex flex-col items-center py-16">
                      <div className="w-20 h-20 bg-emerald-500/20 border border-emerald-500/40 rounded-full flex items-center justify-center mb-6">
                        <CheckCircle2 size={40} className="text-emerald-400" />
                      </div>
                      <h2 className="text-ink font-black text-2xl mb-2">Rider Accepted!</h2>
                      <p className="text-charcoal-500 text-sm">Redirecting to confirmation...</p>
                    </div>
                  )}

                  {matchState === "no_drivers" && mode === "quickmatch" && (
                    <div className="flex flex-col items-center py-12 text-center">
                      <div className="w-20 h-20 bg-amber-500/10 border border-amber-500/20 rounded-full flex items-center justify-center mb-6">
                        <AlertCircle size={36} className="text-amber-400" />
                      </div>
                      <h2 className="text-ink font-black text-xl mb-3">No riders nearby</h2>
                      <p className="text-charcoal-400 text-sm mb-6 leading-relaxed max-w-[260px]">
                        No immediate match found at ₦{draft.estimated_price?.toLocaleString()}. Try negotiating for a faster response.
                      </p>
                      <button onClick={() => setMode("negotiate")}
                        className="bg-amber-500/20 border border-amber-500/40 text-amber-400 font-black px-6 py-3.5 rounded-2xl text-sm flex items-center gap-2 hover:bg-amber-500/30 transition-all">
                        <MessageCircle size={16} /> Negotiate Price
                      </button>
                    </div>
                  )}
                </motion.div>
              )}

              {/* ====== NEGOTIATE MODE ====== */}
              {mode === "negotiate" && (
                <motion.div key="negotiate" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} className="space-y-5 mt-4">
                  {!offerSent ? (
                    <div className="space-y-4">
                      <div className="bg-white/[0.03] border border-white/5 p-5 rounded-3xl">
                        <label className="text-[10px] font-black text-charcoal-500 uppercase tracking-widest ml-1 mb-2 block">Set Your Offer</label>
                        <div className="relative">
                          <span className="absolute left-5 top-1/2 -translate-y-1/2 text-emerald-400 font-black text-xl">₦</span>
                          <input type="number" value={offerPrice} onChange={e => setOfferPrice(e.target.value)}
                            className="w-full bg-charcoal-900 border border-white/10 rounded-2xl py-5 pl-12 pr-4 text-ink text-2xl font-black focus:outline-none focus:ring-2 focus:ring-emerald-500/40 transition-all" />
                        </div>
                        <div className="flex justify-between mt-3 px-1 text-[10px] font-black uppercase text-charcoal-600">
                           <span>Recommended: ₦{draft.estimated_price}</span>
                        </div>
                      </div>

                      <button onClick={sendOffer}
                        className="w-full bg-white/5 border border-white/10 text-ink font-black py-4 rounded-2xl hover:bg-white/10 transition-all">
                         Broadcast New Offer 📢
                      </button>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      <div className="flex items-center justify-between px-5 py-4 bg-charcoal-900 border border-emerald-500/20 rounded-2xl">
                         <div className="text-charcoal-500 text-[10px] font-black uppercase">Current Offer</div>
                         <div className="text-ink font-black text-xl">₦{parseInt(offerPrice).toLocaleString()}</div>
                      </div>

                      {bids.length === 0 ? (
                        <div className="text-center py-6 bg-charcoal-900/50 rounded-2xl">
                          <Loader2 className="text-emerald-500 animate-spin mx-auto mb-3" size={24} />
                          <p className="text-charcoal-500 text-xs font-black uppercase tracking-widest">Awaiting Driver Bids...</p>
                        </div>
                      ) : (
                        <div className="space-y-3">
                          {bids.map(bid => (
                            <motion.div key={bid.id} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
                              className="bg-white/[0.04] border border-white/10 rounded-2xl p-4 flex items-center justify-between">
                              <div className="flex items-center gap-3">
                                <div className="w-10 h-10 bg-emerald-500/10 rounded-xl flex items-center justify-center text-xl border border-emerald-500/20">🏍️</div>
                                <div>
                                  {/* ✅ FIX: full_name not name, rating not avg_rating */}
                                  <div className="text-ink font-black text-sm">{bid.riders?.users?.full_name || "Rider"}</div>
                                  <div className="text-amber-400 font-bold text-[10px]">⭐ {bid.riders?.rating || "4.8"}</div>
                                </div>
                              </div>
                              <div className="flex items-center gap-3">
                                 <div className="text-emerald-400 font-black">₦{bid.amount?.toLocaleString()}</div>
                                 <button onClick={() => acceptBid(bid)} className="bg-emerald-500 text-charcoal-950 font-black px-4 py-2 rounded-xl text-xs">Accept</button>
                              </div>
                            </motion.div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </>
      )}
    </div>
  );
}

export default function Step3Page() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-charcoal-950 flex items-center justify-center"><div className="w-8 h-8 border-2 border-emerald-500/30 border-t-emerald-500 rounded-full animate-spin" /></div>}>
      <Step3Content />
    </Suspense>
  );
}

'@
Write-Utf8Bom -Path "src\app\send-package\step-3\page.jsx" -Content $content_9
Write-Host "  [PATCHED] src\app\send-package\step-3\page.jsx"

$content_10 = @'
"use client";

import { useState, useEffect, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { createClient } from '@/utils/supabase/client';
import { Loader2, MapPin, Package, CheckCircle2, MessageCircle, Share2, Radar, X, AlertTriangle, CreditCard, Check } from 'lucide-react';
import MapCanvas from '@/components/MapCanvas';
import OrderChat from '@/components/OrderChat';
import OrderStatusStepper from '@/components/ui/OrderStatusStepper';
import { cancelOrder } from '@/app/vendor/active-orders/actions';
import Skeleton from '@/components/ui/Skeleton';
import { AnimatePresence, motion } from 'framer-motion';

const STATUS_STEPS = ['pending', 'looking_for_driver', 'matched', 'picked_up', 'in_transit', 'delivered'];
const STATUS_LABELS = {
  pending: 'Finding a rider',
  looking_for_driver: 'Finding a rider',
  matched: 'Rider assigned',
  picked_up: 'Package picked up',
  in_transit: 'On the way',
  delivered: 'Delivered',
  cancelled: 'Cancelled'
};

export default function TrackingPage() {
  const { orderId } = useParams();
  const router = useRouter();
  const supabase = createClient();
  const [order, setOrder] = useState(null);
  const [isVendorView, setIsVendorView] = useState(false);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [expired, setExpired] = useState(false);
  const [currentUserId, setCurrentUserId] = useState(null);
  const [showChat, setShowChat] = useState(false);
  const [showCancelConfirm, setShowCancelConfirm] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [linkCopied, setLinkCopied] = useState(false);
  const [showLinkModal, setShowLinkModal] = useState(false);
  const [statusToast, setStatusToast] = useState(null);
  const expandPollRef = useRef(null);
  const anonPollRef = useRef(null);
  const prevStatusRef = useRef(null);

  useEffect(() => {
    let channel;
    async function load() {
      // Try the authenticated path first - covers vendors viewing their own order
      // history (vendor/history links here) via normal RLS.
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        setCurrentUserId(user.id);
        const { data: authedOrder } = await supabase
          .from('orders')
          .select('*, riders(id, current_lat, current_lng, users(full_name)), vendors(business_name, logo_url)')
          .eq('id', orderId)
          .single();
        if (authedOrder) {
          prevStatusRef.current = authedOrder.status;
          setOrder(authedOrder);
          setIsVendorView(true);
          setLoading(false);
          channel = supabase
            .channel(`track-${orderId}`)
            .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'orders', filter: `id=eq.${orderId}` },
              (payload) => {
                setOrder(prev => ({ ...prev, ...payload.new }));
                announceStatusChange(payload.new.status);
              })
            .subscribe();
          return;
        }
      }

      // Anonymous / no access via RLS: use the scoped public tracking API instead.
      try {
        const res = await fetch(`/api/track/${orderId}`);
        const json = await res.json();
        if (res.status === 410 || json?.expired) { setExpired(true); setLoading(false); return; }
        if (!res.ok || !json.success) { setNotFound(true); setLoading(false); return; }
        prevStatusRef.current = json.order.status;
        setOrder(json.order);
        setIsVendorView(false);
      } catch {
        setNotFound(true);
      }
      setLoading(false);
    }
    load();
    return () => { if (channel) supabase.removeChannel(channel); };
  }, [orderId, supabase]);

  // FIX: live rider location for the vendor's own (authenticated) view.
  // The 'orders' realtime subscription above only ever delivers order
  // columns - it never included the nested riders(...) join, so
  // order.riders.current_lat/lng was frozen at whatever it was on first
  // load, and the map's rider marker never actually moved without a full
  // page refresh. This subscribes directly to the assigned rider's own row
  // once it's known, and merges fresh coordinates in as they arrive.
  useEffect(() => {
    const riderId = order?.riders?.id;
    if (!isVendorView || !riderId) return;

    const riderChannel = supabase
      .channel(`rider-location-${riderId}`)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'riders', filter: `id=eq.${riderId}` },
        (payload) => {
          setOrder(prev => prev ? ({
            ...prev,
            riders: { ...prev.riders, current_lat: payload.new.current_lat, current_lng: payload.new.current_lng }
          }) : prev);
        })
      .subscribe();

    return () => supabase.removeChannel(riderChannel);
  }, [isVendorView, order?.riders?.id, supabase]);

  function announceStatusChange(newStatus) {
    if (prevStatusRef.current === newStatus) return;
    prevStatusRef.current = newStatus;
    setStatusToast(STATUS_LABELS[newStatus] || newStatus);
    setTimeout(() => setStatusToast(null), 4500);
  }

  // FIX: anonymous customers (no account, viewing via the public link) had
  // no realtime subscription at all - the authenticated path above gets
  // live postgres_changes updates, but this path only ever saw whatever
  // status the order was in at the moment the page first loaded. A
  // customer sitting on this page during pickup/in-transit/delivery would
  // never see it change without manually refreshing. Light polling closes
  // that gap without needing a realtime connection for someone who isn't
  // logged in.
  useEffect(() => {
    if (isVendorView || !order || notFound) return;
    if (order.status === 'delivered' || order.status === 'cancelled') return;

    anonPollRef.current = setInterval(async () => {
      try {
        const res = await fetch(`/api/track/${orderId}`);
        const json = await res.json();
        if (res.status === 410 || json?.expired) { setExpired(true); return; }
        if (!res.ok || !json.success) return;
        announceStatusChange(json.order.status);
        setOrder(json.order);
      } catch {
        // transient network issue - just try again next tick
      }
    }, 12000);

    return () => { if (anonPollRef.current) clearInterval(anonPollRef.current); };
  }, [isVendorView, order?.status, orderId, notFound]);

  // --- Once delivered, this page hands off to the dedicated receipt page.
  useEffect(() => {
    if (order?.status === 'delivered') {
      const t = setTimeout(() => router.replace(`/receipt/${orderId}`), 600);
      return () => clearTimeout(t);
    }
  }, [order?.status, orderId, router]);

  // FIX: the "expanding search radius" shown below only ever actually
  // expanded if the sender happened to still have the send-package
  // confirmation screen open in the same tab - vendor-created orders (and
  // anyone who navigated away and came back to this tracking page instead)
  // had no path that ever grew the radius or re-triggered dispatch, so
  // riders outside the initial radius were never found even though the UI
  // implied a live, growing search. This runs the same expand + re-dispatch
  // cycle here instead, so it works from whichever screen is actually being
  // watched. It only runs while genuinely waiting (pending/looking_for_driver)
  // and stops itself as soon as the order leaves that state.
  useEffect(() => {
    if (!order || !orderId) return;
    const waiting = order.status === 'pending' || order.status === 'looking_for_driver';
    if (!waiting) {
      if (expandPollRef.current) { clearInterval(expandPollRef.current); expandPollRef.current = null; }
      return;
    }
    if (expandPollRef.current) return; // already polling

    const triggerDispatch = async () => {
      try {
        await fetch('/api/dispatch', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ orderId })
        });
      } catch (e) {
        console.error('Dispatch retry failed:', e);
      }
    };

    expandPollRef.current = setInterval(async () => {
      const { data: fresh, error: freshErr } = await supabase
        .from('orders')
        .select('status, broadcast_radius_km, max_broadcast_radius_km')
        .eq('id', orderId)
        .single();
      if (freshErr || !fresh) return;
      if (fresh.status !== 'pending' && fresh.status !== 'looking_for_driver') {
        clearInterval(expandPollRef.current);
        expandPollRef.current = null;
        return;
      }

      const currentRadius = Number(fresh.broadcast_radius_km) || 1.5;
      const maxRadius = Number(fresh.max_broadcast_radius_km) || 8;
      if (currentRadius >= maxRadius) {
        // Already at max - just keep re-broadcasting in case a rider has
        // come online/back in range since the last attempt.
        await triggerDispatch();
        return;
      }

      await supabase.rpc('expand_order_radius', { p_order_id: orderId });
      await triggerDispatch();
    }, 15000);

    return () => {
      if (expandPollRef.current) { clearInterval(expandPollRef.current); expandPollRef.current = null; }
    };
  }, [order?.status, orderId, supabase]);

  // Shares the tracking link itself (this page's URL) - distinct from the
  // receipt page's own share button, which shares the finished receipt.
  //
  // FIX: this used to share window.location.href directly, which can carry
  // stray query params/hash fragments depending on how the vendor arrived
  // at this page - not necessarily "wrong" content-wise, but not the clean
  // canonical link either. Now explicitly builds `${origin}/tracking/${id}`,
  // which is always the exact same anonymous-accessible URL regardless of
  // how this page was reached. Also: navigator.share/clipboard can both be
  // unavailable or silently throw depending on the browser/webview (no
  // permission, insecure context, etc.) - previously that meant nothing
  // visibly happened at all. Now there's always a final fallback: a modal
  // with the link in a selectable field, so there's never a silent dead end.
  const trackingUrl = typeof window !== 'undefined' ? `${window.location.origin}/tracking/${orderId}` : '';

  const handleShareTrackingLink = async () => {
    const text = `Track your delivery live: ${order.item_description || 'your package'} is on its way.`;
    if (typeof navigator !== 'undefined' && navigator.share) {
      try {
        await navigator.share({ title: 'Track your NaijaDrops delivery', text, url: trackingUrl });
        return;
      } catch (err) {
        if (err?.name === 'AbortError') return;
        // fall through to clipboard/modal below
      }
    }
    if (typeof navigator !== 'undefined' && navigator.clipboard) {
      try {
        await navigator.clipboard.writeText(trackingUrl);
        setLinkCopied(true);
        setTimeout(() => setLinkCopied(false), 2000);
        return;
      } catch {
        // fall through to the modal below
      }
    }
    setShowLinkModal(true);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-charcoal-950">
        <Skeleton className="h-64 w-full rounded-none" />
        <div className="px-6 py-8 space-y-8">
          <div className="space-y-2">
            <Skeleton className="h-2.5 w-14" />
            <Skeleton className="h-7 w-48" />
            <Skeleton className="h-3 w-64" />
            <Skeleton className="h-1.5 w-full rounded-full mt-3" />
          </div>
          <div className="border-t border-white/10 pt-6 space-y-4">
            <Skeleton className="h-4 w-40" />
            <div className="flex justify-between"><Skeleton className="h-3 w-10" /><Skeleton className="h-3 w-32" /></div>
            <div className="flex justify-between"><Skeleton className="h-3 w-10" /><Skeleton className="h-3 w-32" /></div>
          </div>
        </div>
      </div>
    );
  }

  if (expired) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-charcoal-950 text-center px-6">
        <CheckCircle2 className="text-emerald-500 mb-4" size={40} />
        <p className="text-ink font-black text-xl mb-2">This delivery is complete</p>
        <p className="text-charcoal-400 text-sm max-w-xs">
          This tracking link has expired now that the delivery is done. Contact the sender if you need anything else.
        </p>
      </div>
    );
  }

  if (notFound || !order) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-charcoal-950 text-center px-6">
        <p className="text-ink font-black text-xl mb-2">Delivery not found</p>
        <p className="text-charcoal-400 text-sm">Check the link and try again, or contact the sender.</p>
      </div>
    );
  }

  const riderName = order.riders?.users?.full_name || order.rider?.first_name || null;
  const riderLat = order.riders?.current_lat ?? order.rider?.current_lat;
  const riderLng = order.riders?.current_lng ?? order.rider?.current_lng;

  // --- Delivered: brief handoff to the dedicated receipt page ---
  if (order.status === 'delivered') {
    return (
      <div className="min-h-screen bg-charcoal-950 flex flex-col items-center justify-center gap-4">
        <CheckCircle2 className="text-emerald-500" size={48} />
        <p className="text-ink font-black text-lg">Delivered! Loading your receipt...</p>
        <Loader2 className="animate-spin text-emerald-500" size={20} />
      </div>
    );
  }

  // --- In progress ---
  const isWaitingForRider = order.status === 'pending' || order.status === 'looking_for_driver';

  async function handleCancelOrder() {
    setCancelling(true);
    const res = await cancelOrder(order.id, 'Cancelled from tracking page');
    setCancelling(false);
    if (res.success) {
      router.push('/vendor/active-orders');
    } else {
      setShowCancelConfirm(false);
      alert(res.error || 'Could not cancel this order.');
    }
  }

  const StatusToastBanner = () => (
    <AnimatePresence>
      {statusToast && (
        <motion.div
          initial={{ y: -60, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: -60, opacity: 0 }}
          className="fixed top-4 left-4 right-4 z-[200] max-w-md mx-auto"
        >
          <div className="bg-emerald-500 text-charcoal-950 rounded-2xl px-5 py-3 shadow-glow flex items-center gap-3 font-black text-sm">
            <CheckCircle2 size={18} /> Status update: {statusToast}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );

  // --- Waiting for a rider: dedicated, simpler view - nothing has happened
  // yet, so a full 6-step timeline and an empty map box (the old behavior)
  // just added noise and made it look stuck. This shows what's actually
  // happening: a live, expanding search radius, matching the real dispatch
  // system underneath.
  if (isWaitingForRider) {
    const radius = Number(order.broadcast_radius_km) || 1.5;
    const maxRadius = Number(order.max_broadcast_radius_km) || 8;
    const searchPct = Math.min(100, Math.round((radius / maxRadius) * 100));

    return (
      <div className="min-h-screen bg-charcoal-950 flex flex-col">
        <StatusToastBanner />
        <div className="h-64 relative bg-charcoal-900 flex items-center justify-center overflow-hidden">
          <div className="absolute w-40 h-40 rounded-full border-2 border-emerald-500/20 animate-ping" style={{ animationDuration: '2.5s' }} />
          <div className="absolute w-28 h-28 rounded-full border-2 border-emerald-500/30 animate-ping" style={{ animationDuration: '2.5s', animationDelay: '0.4s' }} />
          <div className="relative w-16 h-16 bg-emerald-500 rounded-full flex items-center justify-center shadow-glow">
            <Radar className="text-charcoal-950 animate-spin" size={28} style={{ animationDuration: '3s' }} />
          </div>
        </div>

        <div className="px-6 py-8 space-y-8">
          <div>
            <p className="text-charcoal-400 text-[11px] font-black uppercase tracking-widest">Status</p>
            <p className="text-ink font-black text-2xl font-outfit">Finding a rider</p>
            <p className="text-charcoal-500 text-sm mt-2">
              Searching within <span className="text-emerald-500 font-bold">{radius.toFixed(1)}km</span> of your pickup point{radius < maxRadius ? ' — expanding automatically' : ''}.
            </p>
            <div className="w-full h-1.5 bg-white/5 rounded-full mt-3 overflow-hidden">
              <div className="h-full bg-emerald-500 rounded-full transition-all duration-1000" style={{ width: `${searchPct}%` }} />
            </div>
          </div>

          <div className="border-t border-white/10 pt-6 space-y-3">
            <div className="flex items-center gap-2 text-sm"><Package size={14} className="text-charcoal-400" /><span className="text-ink font-bold">{order.item_description}</span></div>
            <div className="flex justify-between text-sm"><span className="text-charcoal-400">From</span><span className="text-ink">{order.pickup_name}</span></div>
            <div className="flex justify-between text-sm"><span className="text-charcoal-400">To</span><span className="text-ink">{order.dropoff_name}</span></div>
          </div>

          {isVendorView && (
            <div className="grid grid-cols-2 gap-3">
              <button
                onClick={handleShareTrackingLink}
                className="flex items-center justify-center gap-2 py-4 rounded-2xl bg-white/5 border border-white/10 text-ink text-xs font-black uppercase tracking-widest hover:bg-white/10 transition-all"
              >
                {linkCopied ? <><Check size={14} className="text-emerald-500" /> Copied</> : <><Share2 size={14} /> Share Link</>}
              </button>
              <button
                onClick={() => setShowCancelConfirm(true)}
                className="flex items-center justify-center gap-2 py-4 rounded-2xl bg-white/5 border border-white/10 text-red-400 text-xs font-black uppercase tracking-widest hover:bg-red-500/10 hover:border-red-500/20 transition-all"
              >
                Cancel Order
              </button>
            </div>
          )}
        </div>

        {showCancelConfirm && (
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
              <div className="flex gap-3">
                <button
                  onClick={() => setShowCancelConfirm(false)}
                  disabled={cancelling}
                  className="flex-1 py-3 rounded-xl bg-white/5 border border-white/10 text-ink text-xs font-black uppercase tracking-widest hover:bg-white/10 transition-all"
                >
                  Keep Order
                </button>
                <button
                  onClick={handleCancelOrder}
                  disabled={cancelling}
                  className="flex-1 py-3 rounded-xl bg-red-500 text-white text-xs font-black uppercase tracking-widest hover:bg-red-400 transition-all flex items-center justify-center gap-2 disabled:opacity-50"
                >
                  {cancelling ? <Loader2 size={14} className="animate-spin" /> : <X size={14} />}
                  Cancel It
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  // --- Rider matched or later: full timeline + live map ---
  const mapMarkers = [];
  if (order.pickup_lat && order.pickup_lng) mapMarkers.push({ lat: order.pickup_lat, lng: order.pickup_lng, type: 'pickup', label: 'Pickup' });
  if (riderLat && riderLng) mapMarkers.push({ lat: riderLat, lng: riderLng, type: 'rider', label: riderName || 'Rider' });
  if (order.dropoff_lat && order.dropoff_lng) mapMarkers.push({ lat: order.dropoff_lat, lng: order.dropoff_lng, type: 'dropoff', label: 'Drop-off' });

  return (
    <div className="min-h-screen bg-charcoal-950 flex flex-col">
      <StatusToastBanner />
      <div className="h-80 relative">
        {mapMarkers.length > 0 ? (
          <>
            <MapCanvas markers={mapMarkers} showRoute />
            {riderLat && riderLng && (
              <div className="absolute top-4 left-4 bg-charcoal-950/80 backdrop-blur border border-emerald-500/30 rounded-full px-3 py-1.5 flex items-center gap-2 pointer-events-none">
                <span className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse" />
                <span className="text-emerald-400 text-[10px] font-black uppercase tracking-widest">Live</span>
              </div>
            )}
          </>
        ) : (
          <div className="h-full flex items-center justify-center text-charcoal-500 text-sm bg-charcoal-900">
            <MapPin className="mr-2" size={16} /> Waiting for rider location…
          </div>
        )}
      </div>

      <div className="px-6 py-8 space-y-8">
        <div className="flex items-start justify-between gap-4">
          {/* FIX: text block had no min-w-0, so a longer status label had
              nowhere to go but push against/under the 48px chat button on
              narrow screens instead of truncating cleanly. */}
          <div className="min-w-0">
            <p className="text-charcoal-400 text-[11px] font-black uppercase tracking-widest">Status</p>
            <p className="text-ink font-black text-2xl font-outfit truncate">{STATUS_LABELS[order.status] || order.status}</p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {isVendorView && (
              <button
                onClick={handleShareTrackingLink}
                className="w-12 h-12 bg-white/5 border border-white/10 rounded-2xl flex items-center justify-center text-ink hover:bg-white/10 transition-all active:scale-95"
                title="Share tracking link"
              >
                {linkCopied ? <Check size={18} className="text-emerald-500" /> : <Share2 size={18} />}
              </button>
            )}
            {isVendorView && (
              <button
                onClick={() => setShowChat(true)}
                className="w-12 h-12 bg-emerald-500/10 border border-emerald-500/20 rounded-2xl flex items-center justify-center text-emerald-500 hover:bg-emerald-500/20 transition-all active:scale-95"
                title="Message rider"
              >
                <MessageCircle size={20} />
              </button>
            )}
          </div>
        </div>

        <OrderStatusStepper steps={STATUS_STEPS} currentStatus={order.status} />

        {/* Payment gate: a rider is assigned but the vendor hasn't paid yet.
            The rider's app is deliberately locked from heading to pickup
            until payment_status flips to 'paid' (see /api/verify-payment),
            so this needs to be impossible to miss here. */}
        {isVendorView && order.status === 'matched' && order.payment_status !== 'paid' && (
          <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/5 p-5 space-y-3">
            <div className="flex items-center gap-2 text-emerald-400 text-xs font-black uppercase tracking-widest">
              <CreditCard size={16} /> Payment required
            </div>
            <p className="text-charcoal-300 text-sm leading-relaxed">
              A rider has been assigned. Complete payment now so they can head to pickup - this order stays paused until then.
            </p>
            <button
              onClick={() => router.push(`/payment?orderId=${order.id}`)}
              className="w-full py-4 bg-emerald-500 hover:bg-emerald-400 text-charcoal-950 rounded-2xl font-black text-sm uppercase tracking-widest transition-all active:scale-95"
            >
              Pay ₦{order.agreed_price?.toLocaleString()} Now
            </button>
          </div>
        )}

        <div className="border-t border-white/10 pt-6 space-y-3">
          <div className="flex items-center gap-2 text-sm"><Package size={14} className="text-charcoal-400" /><span className="text-ink font-bold">{order.item_description}</span></div>
          <div className="flex justify-between text-sm"><span className="text-charcoal-400">From</span><span className="text-ink">{order.pickup_name}</span></div>
          <div className="flex justify-between text-sm"><span className="text-charcoal-400">To</span><span className="text-ink">{order.dropoff_name}</span></div>
          {riderName && <div className="flex justify-between text-sm"><span className="text-charcoal-400">Rider</span><span className="text-ink font-bold">{riderName}</span></div>}
        </div>
      </div>

      {isVendorView && showChat && currentUserId && (
        <OrderChat
          orderId={order.id}
          currentUserId={currentUserId}
          onClose={() => setShowChat(false)}
        />
      )}

      {/* Final fallback if native share AND clipboard both failed/were
          unavailable - guarantees the link is always actually obtainable,
          never a silent dead end. */}
      {showLinkModal && (
        <div className="fixed inset-0 z-[150] flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="bg-charcoal-900 border border-white/10 rounded-t-3xl sm:rounded-3xl w-full max-w-sm p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-ink font-black text-base">Tracking link</h3>
              <button onClick={() => setShowLinkModal(false)} className="w-8 h-8 rounded-full bg-white/5 flex items-center justify-center text-charcoal-400 hover:text-ink">
                <X size={14} />
              </button>
            </div>
            <p className="text-charcoal-500 text-xs">Couldn't share or copy automatically - select the link below and copy it manually.</p>
            <input
              readOnly
              value={trackingUrl}
              onFocus={(e) => e.target.select()}
              className="w-full bg-black/30 border border-white/10 rounded-xl px-4 py-3 text-ink text-xs font-mono"
            />
          </div>
        </div>
      )}
    </div>
  );
}
'@
Write-Utf8Bom -Path "src\app\tracking\[orderId]\page.jsx" -Content $content_10
Write-Host "  [PATCHED] src\app\tracking\[orderId]\page.jsx"

$content_11 = @'
﻿"use client";

import { useState } from "react";
import { Share2, Check, MessageCircle } from "lucide-react";

const SHARE_URL = "https://naijadrops.tech";
const SHARE_TEXT =
  "No more chasing riders on the phone 📦 NaijaDrops tracks every delivery live, right here in Kano. Launching August 15 — check it out:";

export default function ShareButton({ className = "" }) {
  const [copied, setCopied] = useState(false);

  async function handleShare() {
    // Native share sheet — on Android (the default here) this surfaces
    // WhatsApp, Instagram DM, SMS etc. directly. This is the primary path
    // since almost everyone in the ICP is on a WhatsApp-first Android phone.
    if (typeof navigator !== "undefined" && navigator.share) {
      try {
        await navigator.share({
          title: "NaijaDrops — Kano",
          text: SHARE_TEXT,
          url: SHARE_URL,
        });
        return;
      } catch (err) {
        // User cancelled the native sheet — do nothing, don't fall through
        if (err?.name === "AbortError") return;
      }
    }

    // Fallback for browsers without navigator.share (mostly desktop):
    // open a pre-filled WhatsApp chat, since that's the dominant channel here.
    const waUrl = `https://wa.me/?text=${encodeURIComponent(`${SHARE_TEXT} ${SHARE_URL}`)}`;
    window.open(waUrl, "_blank", "noopener,noreferrer");

    // Also copy the link as a quiet secondary convenience
    try {
      await navigator.clipboard.writeText(SHARE_URL);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // clipboard not available — no big deal, WhatsApp tab already opened
    }
  }

  return (
    <button
      type="button"
      onClick={handleShare}
      className={`group inline-flex items-center gap-2 text-emerald-400 hover:text-emerald-300 text-xs font-black uppercase tracking-widest transition-colors ${className}`}
    >
      {copied ? (
        <>
          <Check size={14} />
          Link copied
        </>
      ) : (
        <>
          <Share2 size={14} className="group-hover:scale-110 transition-transform" />
          Share with a vendor or rider
        </>
      )}
    </button>
  );
}
'@
Write-Utf8Bom -Path "src\components\ui\ShareButton.jsx" -Content $content_11
Write-Host "  [PATCHED] src\components\ui\ShareButton.jsx"

$content_12 = @'
/**
 * Renders a delivery share-card to a PNG image entirely with the Canvas API -
 * no external library needed. This is a fixed-dimension SOCIAL card (not a
 * scaled-down receipt) meant to work as a WhatsApp Status / Instagram Story
 * or feed post - the kind of thing a vendor posts as social proof that
 * deliveries actually show up, the same way a Strava activity card works as
 * proof of a run rather than a literal receipt.
 *
 * Fixed at 1080x1350 (4:5) - native Instagram feed portrait ratio, and crops
 * cleanly enough for WhatsApp Status (9:16) without losing the core content,
 * which stays vertically centered.
 */
export async function renderReceiptImage({
  total,
  itemDescription,
  pickupName,
  dropoffName,
  riderName,
  senderName,
  deliveredAt,
  orderId,
}) {
  const W = 1080;
  const H = 1350;
  const scale = 2; // render at 2x for crisp export on any screen
  const pad = 90;

  const canvas = document.createElement("canvas");
  canvas.width = W * scale;
  canvas.height = H * scale;
  const ctx = canvas.getContext("2d");
  ctx.scale(scale, scale);

  // --- Background: deep charcoal with a soft emerald glow, not a flat receipt bg ---
  ctx.fillStyle = "#09090b";
  ctx.fillRect(0, 0, W, H);

  const glow = ctx.createRadialGradient(W / 2, 220, 40, W / 2, 220, 620);
  glow.addColorStop(0, "rgba(16,185,129,0.35)");
  glow.addColorStop(1, "rgba(16,185,129,0)");
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, W, H);

  // --- Top brand mark ---
  ctx.fillStyle = "rgba(255,255,255,0.5)";
  ctx.font = "800 22px -apple-system, Helvetica, Arial, sans-serif";
  ctx.textAlign = "center";
  ctx.fillText("N A I J A D R O P S", W / 2, 110);

  // --- Big checkmark badge ---
  const badgeY = 260;
  ctx.fillStyle = "#10b981";
  ctx.beginPath();
  ctx.arc(W / 2, badgeY, 74, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = "#09090b";
  ctx.lineWidth = 10;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.beginPath();
  ctx.moveTo(W / 2 - 30, badgeY);
  ctx.lineTo(W / 2 - 8, badgeY + 26);
  ctx.lineTo(W / 2 + 36, badgeY - 30);
  ctx.stroke();

  // --- "Delivered Successfully" ---
  ctx.fillStyle = "rgba(255,255,255,0.55)";
  ctx.font = "800 20px -apple-system, Helvetica, Arial, sans-serif";
  ctx.fillText("D E L I V E R E D   S U C C E S S F U L L Y", W / 2, badgeY + 130);

  // --- Sender / business name - the actual social-proof hook ---
  let y = badgeY + 190;
  if (senderName) {
    ctx.fillStyle = "#ffffff";
    ctx.font = "900 46px -apple-system, Helvetica, Arial, sans-serif";
    ctx.fillText(senderName, W / 2, y);
    y += 60;
  }

  // --- Item description ---
  ctx.fillStyle = "rgba(255,255,255,0.75)";
  ctx.font = "700 30px -apple-system, Helvetica, Arial, sans-serif";
  let itemText = String(itemDescription || "Package");
  const maxItemWidth = W - pad * 2;
  while (ctx.measureText(itemText).width > maxItemWidth && itemText.length > 3) {
    itemText = itemText.slice(0, -2);
  }
  if (itemText !== String(itemDescription || "Package")) itemText += "…";
  ctx.fillText(itemText, W / 2, y);
  y += 70;

  // --- Divider ---
  ctx.strokeStyle = "rgba(255,255,255,0.12)";
  ctx.lineWidth = 1;
  ctx.setLineDash([6, 6]);
  ctx.beginPath();
  ctx.moveTo(pad, y);
  ctx.lineTo(W - pad, y);
  ctx.stroke();
  ctx.setLineDash([]);
  y += 60;

  // --- Route (From / To) ---
  ctx.textAlign = "left";
  function routeRow(label, value, rowY) {
    ctx.fillStyle = "#71717a";
    ctx.font = "800 20px -apple-system, Helvetica, Arial, sans-serif";
    ctx.fillText(label.toUpperCase(), pad, rowY);

    ctx.fillStyle = "#f4f4f5";
    ctx.font = "700 26px -apple-system, Helvetica, Arial, sans-serif";
    let text = String(value || "");
    const maxWidth = W - pad * 2;
    while (ctx.measureText(text).width > maxWidth && text.length > 3) {
      text = text.slice(0, -2);
    }
    if (text !== String(value || "")) text += "…";
    ctx.fillText(text, pad, rowY + 36);
  }

  routeRow("From", pickupName, y);
  y += 100;
  routeRow("To", dropoffName, y);
  y += 100;

  if (riderName) {
    routeRow("Delivered By", riderName, y);
    y += 100;
  }

  ctx.textAlign = "center";

  // --- Total, big and bold near the bottom ---
  const totalBlockY = H - 260;
  ctx.strokeStyle = "rgba(255,255,255,0.12)";
  ctx.setLineDash([6, 6]);
  ctx.beginPath();
  ctx.moveTo(pad, totalBlockY - 50);
  ctx.lineTo(W - pad, totalBlockY - 50);
  ctx.stroke();
  ctx.setLineDash([]);

  ctx.fillStyle = "#a1a1aa";
  ctx.font = "800 22px -apple-system, Helvetica, Arial, sans-serif";
  ctx.fillText("TOTAL PAID", W / 2, totalBlockY);
  ctx.fillStyle = "#34d399";
  ctx.font = "900 64px -apple-system, Helvetica, Arial, sans-serif";
  ctx.fillText(`₦${Number(total).toLocaleString()}`, W / 2, totalBlockY + 60);

  // --- Footer ---
  ctx.fillStyle = "#52525b";
  ctx.font = "700 18px -apple-system, Helvetica, Arial, sans-serif";
  ctx.fillText(deliveredAt, W / 2, H - 90);
  ctx.fillStyle = "#3f3f46";
  ctx.font = "700 15px -apple-system, Helvetica, Arial, sans-serif";
  ctx.fillText(`Order #${String(orderId).slice(0, 8).toUpperCase()}  •  naijadrops.tech`, W / 2, H - 60);

  return new Promise((resolve) => {
    canvas.toBlob((blob) => resolve(blob), "image/png", 1);
  });
}

'@
Write-Utf8Bom -Path "src\utils\receiptImage.js" -Content $content_12
Write-Host "  [PATCHED] src\utils\receiptImage.js"


Write-Host "`n=== Done ===" -ForegroundColor Green
Write-Host "Review the diff, then commit and push:" -ForegroundColor Cyan
Write-Host "  git status"
Write-Host "  git diff"
Write-Host "  git add -A"
Write-Host "  git commit -m `"Batch fixes: rider payouts, cancellation visibility, receipt/share redesign, expiring links, vendor profile fields, phone gate, back-button fix, launch date to Aug 15`""
Write-Host "  git push"
Write-Host "`nReminders:" -ForegroundColor Yellow
Write-Host "  - riders.bank_name / account_number / account_name were already added to Supabase directly - nothing to do there."
Write-Host "  - Existing riders will show `"No payout account on file`" until they fill in bank details via their earnings/profile screen."
Write-Host "  - Existing vendors will see blank Business Name / Phone until they fill them in via Profile."
