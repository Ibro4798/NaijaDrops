<#
  Apply-PayFirstStopsScheduled.ps1

  What this does (all of it additive and reversible):
    1. PAY FIRST   - OPTIONAL and admin-controlled (ops-terminal > Payment Policy):
                     globally or per vendor, orders either keep today's flow
                     (riders notified straight away, pay after a rider accepts) or
                     require payment before any rider is notified. The choice is
                     stamped on each order by the database. Unpaid pay-first orders
                     are cancelled after a set time. The webhook now checks the
                     amount before trusting metadata, and the simulated-payment
                     fallback is off in production.
    2. EXTRA STOPS - a vendor can add up to 4 more drop-offs to ONE order
                     (new page /send-package/stops). Price = base fare + a flat
                     fee and the distance for each extra stop. Riders get a
                     drop-off checklist and cannot mark the order delivered until
                     every stop is done.
    3. SCHEDULED   - vendors that ops enables can book the 12:30 PM / 3:30 PM
                     windows. Scheduled orders are never auto-broadcast; ops
                     releases them to one rider on /ops-terminal/scheduled.

  How it stays safe:
    * It checks EVERY change first and writes NOTHING if any anchor does not
      match your files exactly (all or nothing).
    * It backs up every file it touches to _backup_payfirst_<timestamp>\
    * Re-running it is harmless (already-applied changes are skipped).
    * -DryRun shows what it would do without changing anything.

  Run from the project root (the folder that contains package.json):
      powershell -ExecutionPolicy Bypass -File .\Apply-PayFirstStopsScheduled.ps1
      (add -DryRun first if you like)

  Run supabase/migrations/20261007120000_payment_policy_stops_scheduling.sql in the
  Supabase SQL editor (safe before or after deploying; defaults to today's behaviour).
  Then use ops-terminal > Payment Policy to choose pay-first or not.
#>
param([switch]$DryRun)

$ErrorActionPreference = 'Stop'

$root = (Get-Location).Path
if (-not (Test-Path -LiteralPath (Join-Path $root 'package.json')) -or -not (Test-Path -LiteralPath (Join-Path $root 'src'))) {
  Write-Host 'Run this from your project root (the folder containing package.json and src).' -ForegroundColor Red
  exit 1
}

$stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$backupRoot = Join-Path $root ('_backup_payfirst_' + $stamp)

function ToLf([string]$s) { return $s.Replace("`r`n", "`n") }

function Read-Src([string]$full) {
  $bytes = [System.IO.File]::ReadAllBytes($full)
  $hasBom = ($bytes.Length -ge 3 -and $bytes[0] -eq 0xEF -and $bytes[1] -eq 0xBB -and $bytes[2] -eq 0xBF)
  $text = [System.Text.Encoding]::UTF8.GetString($bytes)
  if ($hasBom) { $text = $text.Substring(1) }
  $crlf = $text.Contains("`r`n")
  return @{ Text = (ToLf $text); HasBom = $hasBom; Crlf = $crlf; Changed = $false }
}

function Write-Src([string]$full, [string]$text, [bool]$hasBom, [bool]$crlf) {
  if ($crlf) { $text = $text.Replace("`n", "`r`n") }
  $enc = New-Object System.Text.UTF8Encoding($hasBom)
  [System.IO.File]::WriteAllText($full, $text, $enc)
}

function Count-Occ([string]$text, [string]$needle) {
  $c = 0
  $i = 0
  while (($i = $text.IndexOf($needle, $i, [System.StringComparison]::Ordinal)) -ge 0) {
    $c++
    $i += $needle.Length
  }
  return $c
}

# ----------------------------------------------------------------------
# New files
# ----------------------------------------------------------------------
$newFiles = @(
  @{
    Path = 'src/app/ops-terminal/payments/PaymentPolicyPanel.jsx'
    Content = @'
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { setPaymentMode, setVendorPolicy, setVendorScheduled, setExpiryMinutes, expireUnpaidNow } from "./actions";

export default function PaymentPolicyPanel({ mode, expiryMinutes, vendors }) {
  const router = useRouter();
  const [busy, setBusy] = useState(null);
  const [message, setMessage] = useState(null);
  const [minutes, setMinutes] = useState(String(expiryMinutes));

  async function run(key, fn) {
    setBusy(key);
    setMessage(null);
    const res = await fn();
    setBusy(null);
    if (res?.success) {
      if (typeof res.cancelled === "number") setMessage({ ok: true, text: "Cancelled " + res.cancelled + " unpaid order(s)." });
      router.refresh();
    } else {
      setMessage({ ok: false, text: res?.error || "Failed." });
    }
  }

  const modeButton = (value, title, body) => (
    <button
      type="button"
      disabled={busy === "mode"}
      onClick={() => value !== mode && run("mode", () => setPaymentMode(value))}
      className={"text-left p-5 rounded-2xl border transition-colors " + (mode === value ? "border-emerald-500 bg-emerald-500/10" : "border-white/10 bg-white/[0.03] hover:border-white/20")}
    >
      <p className={"font-black text-sm " + (mode === value ? "text-emerald-400" : "text-ink")}>{title}{mode === value ? "  (active)" : ""}</p>
      <p className="text-charcoal-500 text-xs mt-1 leading-relaxed">{body}</p>
    </button>
  );

  return (
    <div className="space-y-8">
      <section className="space-y-3">
        <h2 className="text-ink font-black text-sm uppercase tracking-widest">Default for all vendors</h2>
        <div className="grid gap-3 md:grid-cols-2">
          {modeButton("optional", "Payment not required up front", "Orders are sent to riders straight away, price can be negotiated, and the vendor pays after a rider accepts. This is how the app works today.")}
          {modeButton("required", "Pay first", "The vendor pays before any rider is notified. Fixed price, no negotiation. Unpaid orders are cancelled automatically after the time below.")}
        </div>
        <p className="text-charcoal-500 text-xs">Scheduled-window orders always require payment first, whatever you choose here.</p>
      </section>

      <section className="space-y-3">
        <h2 className="text-ink font-black text-sm uppercase tracking-widest">Cancel unpaid pay-first orders after</h2>
        <div className="flex items-center gap-3">
          <input value={minutes} onChange={(e) => setMinutes(e.target.value)} inputMode="numeric" className="w-24 bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-ink font-bold" />
          <span className="text-charcoal-400 text-sm font-bold">minutes (0 = never)</span>
          <button disabled={busy === "expiry"} onClick={() => run("expiry", () => setExpiryMinutes(minutes))} className="ml-auto px-4 py-3 rounded-xl bg-emerald-500 text-charcoal-950 font-black text-xs uppercase tracking-widest disabled:opacity-50">
            {busy === "expiry" ? <Loader2 size={14} className="animate-spin" /> : "Save"}
          </button>
          <button disabled={busy === "now"} onClick={() => run("now", () => expireUnpaidNow())} className="px-4 py-3 rounded-xl bg-white/5 border border-white/10 text-ink font-black text-xs uppercase tracking-widest disabled:opacity-50">
            {busy === "now" ? <Loader2 size={14} className="animate-spin" /> : "Run now"}
          </button>
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-ink font-black text-sm uppercase tracking-widest">Per vendor</h2>
        {vendors.length === 0 && <p className="text-charcoal-500 text-sm">No vendors yet.</p>}
        {vendors.map((v) => (
          <div key={v.id} className="flex flex-wrap items-center gap-3 bg-white/[0.04] border border-white/10 rounded-2xl p-4">
            <p className="text-ink font-black text-sm flex-1 min-w-[140px]">{v.business_name || v.id.slice(0, 8)}</p>
            <select
              value={v.payment_policy || "default"}
              disabled={busy === "p" + v.id}
              onChange={(e) => run("p" + v.id, () => setVendorPolicy(v.id, e.target.value))}
              className="bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-ink text-xs font-bold"
            >
              <option value="default">Use default</option>
              <option value="required">Pay first</option>
              <option value="optional">Not required</option>
            </select>
            <label className="flex items-center gap-2 text-xs font-bold text-charcoal-400">
              <input
                type="checkbox"
                checked={!!v.scheduled_enabled}
                disabled={busy === "s" + v.id}
                onChange={(e) => run("s" + v.id, () => setVendorScheduled(v.id, e.target.checked))}
                className="w-4 h-4 accent-emerald-500"
              />
              Scheduled windows
            </label>
          </div>
        ))}
      </section>

      {message && <p className={"text-xs font-bold " + (message.ok ? "text-emerald-400" : "text-red-400")}>{message.text}</p>}
    </div>
  );
}
'@
  }
  @{
    Path = 'src/app/ops-terminal/payments/actions.js'
    Content = @'
"use server";

import { validateAdmin, logAdminAction } from "@/utils/admin";
import { createAdminClient } from "@/utils/supabase/admin";
import { revalidatePath } from "next/cache";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function saveSetting(db, adminId, key, value) {
  const { error } = await db.from("app_settings").upsert(
    { key, value, updated_at: new Date().toISOString(), updated_by: adminId },
    { onConflict: "key" }
  );
  if (error) throw error;
}

function fail(err) {
  console.error("payments action error:", err);
  return { success: false, error: err?.message || "Something went wrong." };
}

// Global default: 'required' = vendors pay BEFORE riders are notified;
// 'optional' = today's flow (riders are notified straight away, pay after a rider accepts).
export async function setPaymentMode(mode) {
  try {
    const { admin } = await validateAdmin();
    if (mode !== "required" && mode !== "optional") return { success: false, error: "Invalid mode." };
    const db = createAdminClient();
    await saveSetting(db, admin.id, "payment_policy", { mode });
    await logAdminAction(admin.id, "SET_PAYMENT_MODE", "setting", admin.id, { mode });
    revalidatePath("/ops-terminal/payments");
    return { success: true };
  } catch (err) { return fail(err); }
}

// Per-vendor override: 'default' follows the global setting.
export async function setVendorPolicy(vendorId, policy) {
  try {
    const { admin } = await validateAdmin();
    if (!UUID_RE.test(vendorId || "")) return { success: false, error: "Invalid vendor." };
    if (!["default", "required", "optional"].includes(policy)) return { success: false, error: "Invalid policy." };
    const db = createAdminClient();
    const { error } = await db.from("vendors")
      .update({ payment_policy: policy === "default" ? null : policy })
      .eq("id", vendorId);
    if (error) throw error;
    await logAdminAction(admin.id, "SET_VENDOR_PAYMENT_POLICY", "vendor", vendorId, { policy });
    revalidatePath("/ops-terminal/payments");
    return { success: true };
  } catch (err) { return fail(err); }
}

// Scheduled delivery windows on/off for one vendor.
export async function setVendorScheduled(vendorId, enabled) {
  try {
    const { admin } = await validateAdmin();
    if (!UUID_RE.test(vendorId || "")) return { success: false, error: "Invalid vendor." };
    const db = createAdminClient();
    const { error } = await db.from("vendors")
      .update({ scheduled_enabled: enabled === true })
      .eq("id", vendorId);
    if (error) throw error;
    await logAdminAction(admin.id, "SET_VENDOR_SCHEDULED", "vendor", vendorId, { enabled: enabled === true });
    revalidatePath("/ops-terminal/payments");
    return { success: true };
  } catch (err) { return fail(err); }
}

// Minutes before an unpaid pay-first order is cancelled automatically (0 = never).
export async function setExpiryMinutes(minutes) {
  try {
    const { admin } = await validateAdmin();
    const m = Math.floor(Number(minutes));
    if (!Number.isFinite(m) || m < 0 || m > 1440) return { success: false, error: "Use 0 to 1440 minutes." };
    const db = createAdminClient();
    await saveSetting(db, admin.id, "unpaid_expiry_minutes", { minutes: m });
    await logAdminAction(admin.id, "SET_UNPAID_EXPIRY", "setting", admin.id, { minutes: m });
    revalidatePath("/ops-terminal/payments");
    return { success: true };
  } catch (err) { return fail(err); }
}

export async function expireUnpaidNow() {
  try {
    const { admin } = await validateAdmin();
    const db = createAdminClient();
    const { data, error } = await db.rpc("expire_unpaid_orders");
    if (error) throw error;
    await logAdminAction(admin.id, "EXPIRE_UNPAID_ORDERS", "setting", admin.id, { cancelled: data });
    revalidatePath("/ops-terminal/payments");
    return { success: true, cancelled: Number(data) || 0 };
  } catch (err) { return fail(err); }
}
'@
  }
  @{
    Path = 'src/app/ops-terminal/payments/page.jsx'
    Content = @'
import { validateAdmin } from "@/utils/admin";
import { createAdminClient } from "@/utils/supabase/admin";
import PaymentPolicyPanel from "./PaymentPolicyPanel";

export const dynamic = "force-dynamic";

export default async function PaymentPolicyPage() {
  await validateAdmin();
  const db = createAdminClient();

  const { data: settings, error: settingsErr } = await db
    .from("app_settings")
    .select("key, value, updated_at");

  const { data: vendors, error: vendorsErr } = await db
    .from("vendors")
    .select("id, business_name, payment_policy, scheduled_enabled")
    .order("business_name", { ascending: true });

  const setupError = settingsErr || vendorsErr;
  const byKey = Object.fromEntries((settings || []).map((s) => [s.key, s]));
  const mode = byKey.payment_policy?.value?.mode === "required" ? "required" : "optional";
  const expiryMinutes = Number(byKey.unpaid_expiry_minutes?.value?.minutes ?? 30);

  return (
    <div className="p-6 md:p-10 max-w-3xl space-y-6">
      <div>
        <p className="text-[10px] font-black text-emerald-500 uppercase tracking-[0.3em]">Operations</p>
        <h1 className="text-ink font-black text-3xl font-outfit">Payment policy</h1>
        <p className="text-charcoal-500 text-sm mt-1">
          Decide whether vendors pay before riders are notified. The choice is stamped on each order when it is created, so changing it never affects orders already in progress.
        </p>
      </div>

      {setupError ? (
        <div className="p-4 rounded-2xl bg-red-500/10 border border-red-500/20 text-red-400 text-sm font-bold">
          The database is not set up for this yet. Run the SQL migration in Supabase first. ({setupError.message})
        </div>
      ) : (
        <PaymentPolicyPanel mode={mode} expiryMinutes={expiryMinutes} vendors={vendors || []} />
      )}
    </div>
  );
}
'@
  }
  @{
    Path = 'src/app/ops-terminal/scheduled/ReleasePanel.jsx'
    Content = @'
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Send } from "lucide-react";
import { releaseToRider } from "./actions";

const naira = (n) => "\u20A6" + Number(n || 0).toLocaleString();

export default function ReleasePanel({ groups, riders }) {
  const router = useRouter();
  const [selected, setSelected] = useState({});
  const [riderId, setRiderId] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState(null);

  const selectedIds = Object.keys(selected).filter((id) => selected[id]);

  function toggle(id) {
    setSelected((s) => ({ ...s, [id]: !s[id] }));
  }

  async function release() {
    setMessage(null);
    if (selectedIds.length === 0) { setMessage({ ok: false, text: "Select at least one order." }); return; }
    if (!riderId) { setMessage({ ok: false, text: "Choose a rider." }); return; }
    setBusy(true);
    const res = await releaseToRider(selectedIds, riderId);
    setBusy(false);
    if (res.success) {
      setMessage({ ok: true, text: "Released " + res.released + " order(s)." + (res.skipped ? " Skipped " + res.skipped + "." : "") + " Call the rider so they open the app." });
      setSelected({});
      router.refresh();
    } else {
      setMessage({ ok: false, text: res.error });
    }
  }

  return (
    <div className="space-y-8">
      {groups.length === 0 && (
        <p className="text-charcoal-500 text-sm font-bold">No paid scheduled orders are waiting.</p>
      )}

      {groups.map((g) => (
        <div key={g.key} className="space-y-3">
          <h2 className="text-emerald-400 font-black text-sm uppercase tracking-widest">{g.label} <span className="text-charcoal-500">({g.orders.length})</span></h2>
          {g.orders.map((o) => (
            <label key={o.id} className="flex items-start gap-4 bg-white/[0.04] border border-white/10 rounded-2xl p-4 cursor-pointer">
              <input type="checkbox" checked={!!selected[o.id]} onChange={() => toggle(o.id)} className="mt-1 w-5 h-5 accent-emerald-500" />
              {o.package_photo_url && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={o.package_photo_url} alt="Package" className="w-16 h-16 rounded-xl object-cover shrink-0" />
              )}
              <div className="min-w-0 flex-1 space-y-1">
                <p className="text-ink font-black text-sm">{o.vendor_name || "Vendor"} &middot; {naira(o.agreed_price)}</p>
                <p className="text-charcoal-400 text-xs truncate">{o.pickup_name} &rarr; {o.dropoff_name}</p>
                <p className="text-charcoal-500 text-[11px] font-bold uppercase tracking-widest">
                  {o.item_size || "size ?"}{Number(o.stop_count) > 1 ? " \u00B7 " + o.stop_count + " drop-offs" : ""}
                  {o.released_to > 0 ? " \u00B7 released to " + o.released_to + " rider(s)" : ""}
                </p>
                {o.item_description && <p className="text-charcoal-500 text-xs truncate">{o.item_description}</p>}
              </div>
            </label>
          ))}
        </div>
      ))}

      <div className="sticky bottom-4 bg-charcoal-900 border border-white/10 rounded-2xl p-4 space-y-3">
        <select value={riderId} onChange={(e) => setRiderId(e.target.value)} className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-ink font-bold">
          <option value="">Choose rider</option>
          {riders.map((r) => (
            <option key={r.id} value={r.id}>{r.full_name || r.phone || r.id.slice(0, 8)} ({r.operational_status})</option>
          ))}
        </select>
        <button onClick={release} disabled={busy} className="w-full bg-emerald-500 disabled:opacity-50 text-charcoal-950 font-black py-4 rounded-xl flex items-center justify-center gap-2 text-sm uppercase tracking-widest">
          {busy ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />} Release {selectedIds.length || ""} to rider
        </button>
        {message && <p className={"text-xs font-bold " + (message.ok ? "text-emerald-400" : "text-red-400")}>{message.text}</p>}
      </div>
    </div>
  );
}
'@
  }
  @{
    Path = 'src/app/ops-terminal/scheduled/actions.js'
    Content = @'
"use server";

import { validateAdmin, logAdminAction } from "@/utils/admin";
import { createAdminClient } from "@/utils/supabase/admin";
import { revalidatePath } from "next/cache";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Release paid, scheduled orders to ONE rider.
 * This writes the same (order_id, rider_id) rows that /api/dispatch writes,
 * so the rider sees the order in their normal feed (photos, stops, details)
 * and accepts it through the normal flow. Nobody else is notified.
 */
export async function releaseToRider(orderIds, riderId) {
  try {
    const { admin } = await validateAdmin();

    if (!Array.isArray(orderIds) || orderIds.length === 0 || orderIds.length > 10) {
      return { success: false, error: "Pick between 1 and 10 orders." };
    }
    if (!orderIds.every((id) => UUID_RE.test(id)) || !UUID_RE.test(riderId || "")) {
      return { success: false, error: "Invalid order or rider." };
    }

    const db = createAdminClient();

    const { data: rider } = await db
      .from("riders")
      .select("id, status")
      .eq("id", riderId)
      .maybeSingle();
    if (!rider || rider.status !== "approved") {
      return { success: false, error: "That rider is not approved." };
    }

    // Re-check eligibility on the server: paid, scheduled, and still waiting.
    const { data: eligible, error: eligibleErr } = await db
      .from("orders")
      .select("id")
      .in("id", orderIds)
      .eq("payment_status", "paid")
      .not("scheduled_at", "is", null)
      .in("status", ["pending", "looking_for_driver"]);
    if (eligibleErr) throw eligibleErr;

    if (!eligible || eligible.length === 0) {
      return { success: false, error: "None of those orders can be released (not paid, not scheduled, or already taken)." };
    }

    const rows = eligible.map((o) => ({ order_id: o.id, rider_id: riderId }));
    const { error: upsertErr } = await db
      .from("order_broadcasts")
      .upsert(rows, { onConflict: "order_id,rider_id", ignoreDuplicates: true });
    if (upsertErr) throw upsertErr;

    await logAdminAction(admin.id, "RELEASE_SCHEDULED_ORDERS", "rider", riderId, {
      order_ids: eligible.map((o) => o.id),
      skipped: orderIds.length - eligible.length,
    });

    revalidatePath("/ops-terminal/scheduled");
    return { success: true, released: eligible.length, skipped: orderIds.length - eligible.length };
  } catch (err) {
    console.error("releaseToRider error:", err);
    return { success: false, error: err.message || "Release failed." };
  }
}
'@
  }
  @{
    Path = 'src/app/ops-terminal/scheduled/page.jsx'
    Content = @'
import { validateAdmin } from "@/utils/admin";
import { createAdminClient } from "@/utils/supabase/admin";
import { formatWindowTime } from "@/utils/windows";
import ReleasePanel from "./ReleasePanel";

export const dynamic = "force-dynamic";

export default async function ScheduledOrdersPage() {
  await validateAdmin();
  const db = createAdminClient();

  const { data: orders } = await db
    .from("orders")
    .select("id, scheduled_at, pickup_name, dropoff_name, item_size, item_description, package_photo_url, agreed_price, stop_count, vendors(business_name)")
    .not("scheduled_at", "is", null)
    .eq("payment_status", "paid")
    .in("status", ["pending", "looking_for_driver"])
    .order("scheduled_at", { ascending: true });

  const ids = (orders || []).map((o) => o.id);
  const releasedCount = {};
  if (ids.length > 0) {
    const { data: broadcasts } = await db.from("order_broadcasts").select("order_id").in("order_id", ids);
    (broadcasts || []).forEach((b) => { releasedCount[b.order_id] = (releasedCount[b.order_id] || 0) + 1; });
  }

  const byWindow = new Map();
  (orders || []).forEach((o) => {
    const key = o.scheduled_at;
    if (!byWindow.has(key)) byWindow.set(key, { key, label: formatWindowTime(key), orders: [] });
    byWindow.get(key).orders.push({
      ...o,
      vendor_name: o.vendors?.business_name || null,
      released_to: releasedCount[o.id] || 0,
    });
  });

  const { data: riders } = await db
    .from("riders")
    .select("id, full_name, phone, operational_status")
    .eq("status", "approved")
    .order("full_name", { ascending: true });

  return (
    <div className="p-6 md:p-10 max-w-3xl space-y-6">
      <div>
        <p className="text-[10px] font-black text-emerald-500 uppercase tracking-[0.3em]">Operations</p>
        <h1 className="text-ink font-black text-3xl font-outfit">Scheduled orders</h1>
        <p className="text-charcoal-500 text-sm mt-1">Paid orders waiting for a window. Release them to one rider; they accept through the normal feed.</p>
      </div>
      <ReleasePanel groups={Array.from(byWindow.values())} riders={riders || []} />
    </div>
  );
}
'@
  }
  @{
    Path = 'src/app/send-package/stops/page.jsx'
    Content = @'
"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import { ArrowLeft, ArrowRight, Plus, X, MapPin, Loader2 } from "lucide-react";
import { createClient } from "@/utils/supabase/client";
import { fetchPricingSettings, getFuelMultiplier } from "@/utils/pricing";
import { MAX_EXTRA_STOPS, extraStopFees } from "@/utils/stops";

const MapModal = dynamic(() => import("@/components/MapModal"), { ssr: false });

const DRAFT_KEY = "nd_order_draft";
const naira = (n) => "\u20A6" + Number(n || 0).toLocaleString();

export default function StopsPage() {
  const router = useRouter();
  const supabase = createClient();

  const [draft, setDraft] = useState(null);
  const [extras, setExtras] = useState([]);
  const [fuelMultiplier, setFuelMultiplier] = useState(1);

  const [mapOpen, setMapOpen] = useState(false);
  const [pendingLoc, setPendingLoc] = useState(null);
  const [rName, setRName] = useState("");
  const [rPhone, setRPhone] = useState("");
  const [note, setNote] = useState("");
  const [formError, setFormError] = useState(null);

  useEffect(() => {
    try {
      const d = JSON.parse(sessionStorage.getItem(DRAFT_KEY));
      if (!d?.pickup || !d?.dropoff || !d?.estimated_price) {
        router.replace("/send-package/step-2");
        return;
      }
      setDraft(d);
      setExtras(Array.isArray(d.extra_stops) ? d.extra_stops : []);
    } catch {
      router.replace("/send-package/step-2");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const settings = await fetchPricingSettings(supabase);
        if (!cancelled) setFuelMultiplier(getFuelMultiplier(settings));
      } catch { /* default multiplier of 1 is fine */ }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!draft) {
    return (
      <div className="min-h-screen bg-charcoal-950 flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-emerald-500/30 border-t-emerald-500 rounded-full animate-spin" />
      </div>
    );
  }

  // base_price is written by step-2; the fallback covers a draft saved before it existed.
  const basePrice = Number(draft.base_price ?? (draft.estimated_price - (draft.extras_total || 0)));
  const fees = extraStopFees(draft.dropoff, extras, draft.vehicle, draft.size, fuelMultiplier);
  const extrasTotal = fees.reduce((a, b) => a + b, 0);
  const total = basePrice + extrasTotal;

  function save(nextExtras) {
    const nextFees = extraStopFees(draft.dropoff, nextExtras, draft.vehicle, draft.size, fuelMultiplier);
    const nextExtrasTotal = nextFees.reduce((a, b) => a + b, 0);
    const updated = {
      ...draft,
      base_price: basePrice,
      extra_stops: nextExtras,
      extras_total: nextExtrasTotal,
      stop_count: 1 + nextExtras.length,
      estimated_price: basePrice + nextExtrasTotal,
    };
    sessionStorage.setItem(DRAFT_KEY, JSON.stringify(updated));
    setDraft(updated);
    setExtras(nextExtras);
  }

  function handleLocationPicked({ name, coords }) {
    setMapOpen(false);
    if (!coords) return;
    setPendingLoc({ name, lat: coords.lat, lng: coords.lng });
    setFormError(null);
  }

  function addStop() {
    if (!pendingLoc) return;
    const phoneDigits = rPhone.replace(/\D/g, "");
    if (rName.trim().length < 2) { setFormError("Enter the receiver's name."); return; }
    if (phoneDigits.length < 10) { setFormError("Enter a valid receiver phone number."); return; }
    save([
      ...extras,
      {
        name: pendingLoc.name,
        lat: pendingLoc.lat,
        lng: pendingLoc.lng,
        recipient_name: rName.trim(),
        recipient_phone: rPhone.trim(),
        note: note.trim(),
      },
    ]);
    setPendingLoc(null);
    setRName(""); setRPhone(""); setNote(""); setFormError(null);
  }

  function removeStop(index) {
    save(extras.filter((_, i) => i !== index));
  }

  const canAddMore = extras.length < MAX_EXTRA_STOPS;

  return (
    <div className="min-h-screen bg-charcoal-950 flex flex-col">
      <div className="flex items-center gap-4 px-5 pt-6 pb-4">
        <button onClick={() => router.push("/send-package/step-2")} className="w-10 h-10 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center text-ink">
          <ArrowLeft size={18} />
        </button>
        <div>
          <p className="text-[10px] font-black text-emerald-500 uppercase tracking-widest">Optional</p>
          <h1 className="text-ink font-black text-xl">More drop-offs</h1>
        </div>
      </div>

      <div className="flex-1 px-5 pb-10 max-w-md w-full mx-auto space-y-4">
        <div className="bg-white/[0.04] border border-white/10 rounded-3xl p-5 space-y-3">
          <div className="flex items-start gap-3">
            <MapPin size={16} className="text-emerald-500 mt-0.5 shrink-0" />
            <div className="min-w-0">
              <p className="text-[10px] font-black text-charcoal-500 uppercase tracking-widest">Stop 1</p>
              <p className="text-ink font-bold text-sm truncate">{draft.dropoff?.name}</p>
              <p className="text-charcoal-500 text-xs">{draft.recipient_name}</p>
            </div>
          </div>
          {extras.map((s, i) => (
            <div key={i} className="flex items-start gap-3 border-t border-white/5 pt-3">
              <MapPin size={16} className="text-amber-400 mt-0.5 shrink-0" />
              <div className="min-w-0 flex-1">
                <p className="text-[10px] font-black text-charcoal-500 uppercase tracking-widest">Stop {i + 2} &middot; +{naira(fees[i])}</p>
                <p className="text-ink font-bold text-sm truncate">{s.name}</p>
                <p className="text-charcoal-500 text-xs">{s.recipient_name} &middot; {s.recipient_phone}</p>
              </div>
              <button onClick={() => removeStop(i)} className="w-8 h-8 rounded-lg bg-white/5 flex items-center justify-center text-charcoal-400 hover:text-red-400" aria-label="Remove stop">
                <X size={14} />
              </button>
            </div>
          ))}
        </div>

        {pendingLoc ? (
          <div className="bg-white/[0.04] border border-emerald-500/30 rounded-3xl p-5 space-y-3">
            <p className="text-[10px] font-black text-emerald-500 uppercase tracking-widest">Stop {extras.length + 2}</p>
            <p className="text-ink font-bold text-sm">{pendingLoc.name}</p>
            <input value={rName} onChange={(e) => setRName(e.target.value)} placeholder="Receiver name" className="w-full bg-white/5 border-2 border-white/10 rounded-2xl px-4 py-3 text-ink font-bold focus:border-emerald-500 outline-none" />
            <input value={rPhone} onChange={(e) => setRPhone(e.target.value)} placeholder="Receiver phone e.g. 0803xxxxxxx" inputMode="tel" className="w-full bg-white/5 border-2 border-white/10 rounded-2xl px-4 py-3 text-ink font-bold focus:border-emerald-500 outline-none" />
            <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Landmark or note (optional)" className="w-full bg-white/5 border-2 border-white/10 rounded-2xl px-4 py-3 text-ink font-bold focus:border-emerald-500 outline-none" />
            {formError && <p className="text-red-400 text-xs font-bold">{formError}</p>}
            <div className="flex gap-3">
              <button onClick={() => { setPendingLoc(null); setFormError(null); }} className="flex-1 py-3 rounded-2xl bg-white/5 border border-white/10 text-ink font-black text-xs uppercase tracking-widest">Cancel</button>
              <button onClick={addStop} className="flex-1 py-3 rounded-2xl bg-emerald-500 text-charcoal-950 font-black text-xs uppercase tracking-widest">Add stop</button>
            </div>
          </div>
        ) : canAddMore ? (
          <button onClick={() => setMapOpen(true)} className="w-full py-4 rounded-2xl bg-white/5 border border-dashed border-emerald-500/40 text-emerald-400 font-black text-sm flex items-center justify-center gap-2">
            <Plus size={16} /> Add another drop-off
          </button>
        ) : (
          <p className="text-charcoal-500 text-xs font-bold text-center">Maximum of {MAX_EXTRA_STOPS + 1} drop-offs per order.</p>
        )}

        <div className="bg-white/[0.04] border border-white/10 rounded-3xl p-5 space-y-2 text-sm">
          <div className="flex justify-between"><span className="text-charcoal-500 font-bold">Delivery to stop 1</span><span className="text-ink font-black">{naira(basePrice)}</span></div>
          {extras.map((s, i) => (
            <div key={i} className="flex justify-between"><span className="text-charcoal-500 font-bold">Stop {i + 2}</span><span className="text-ink font-black">+{naira(fees[i])}</span></div>
          ))}
          <div className="flex justify-between border-t border-white/10 pt-2"><span className="text-ink font-black">Total</span><span className="text-emerald-400 font-black">{naira(total)}</span></div>
        </div>

        <button onClick={() => router.push("/send-package/step-3")} disabled={!!pendingLoc} className="w-full bg-emerald-500 hover:bg-emerald-400 disabled:opacity-40 text-charcoal-950 font-black py-5 rounded-2xl text-lg flex items-center justify-center gap-3">
          {extras.length > 0 ? "Continue" : "Continue with one drop-off"} <ArrowRight size={20} />
        </button>
      </div>

      <MapModal
        isOpen={mapOpen}
        onClose={() => setMapOpen(false)}
        onConfirm={handleLocationPicked}
        title={"Drop-off " + (extras.length + 2)}
      />
    </div>
  );
}
'@
  }
  @{
    Path = 'src/components/ScheduledOrderView.jsx'
    Content = @'
"use client";

import Link from "next/link";
import { CalendarClock, CheckCircle2, MapPin, Loader2 } from "lucide-react";
import { formatWindowTime } from "@/utils/windows";

// Shown on the tracking page for a paid order that is waiting for its window.
// Nothing is broadcast to riders for these; ops hands them to a rider.
export default function ScheduledOrderView({ order, isVendorView, onCancel, cancelling }) {
  function confirmCancel() {
    if (window.confirm("Cancel this scheduled delivery? Your payment will be refunded within 24 hours.")) {
      onCancel?.();
    }
  }

  return (
    <div className="min-h-screen bg-charcoal-950 flex flex-col items-center justify-center px-6 text-center gap-6">
      <div className="w-20 h-20 rounded-full bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center">
        <CalendarClock className="text-emerald-500" size={36} />
      </div>
      <div className="space-y-2">
        <p className="text-charcoal-400 text-[11px] font-black uppercase tracking-widest">Scheduled delivery</p>
        <h1 className="text-ink font-black text-3xl font-outfit">{formatWindowTime(order.scheduled_at)}</h1>
        <p className="inline-flex items-center gap-1.5 text-emerald-400 text-xs font-black uppercase tracking-widest">
          <CheckCircle2 size={14} /> Paid
        </p>
      </div>
      <div className="w-full max-w-sm bg-white/[0.04] border border-white/10 rounded-3xl p-5 text-left space-y-3">
        <div className="flex items-start gap-3">
          <MapPin size={16} className="text-emerald-500 mt-0.5 shrink-0" />
          <div className="min-w-0">
            <p className="text-[10px] font-black text-charcoal-500 uppercase tracking-widest">From</p>
            <p className="text-ink font-bold text-sm">{order.pickup_name}</p>
          </div>
        </div>
        <div className="flex items-start gap-3">
          <MapPin size={16} className="text-amber-400 mt-0.5 shrink-0" />
          <div className="min-w-0">
            <p className="text-[10px] font-black text-charcoal-500 uppercase tracking-widest">To{Number(order.stop_count) > 1 ? " (+" + (Number(order.stop_count) - 1) + " more)" : ""}</p>
            <p className="text-ink font-bold text-sm">{order.dropoff_name}</p>
          </div>
        </div>
      </div>
      <p className="text-charcoal-500 text-sm max-w-xs leading-relaxed">
        A rider is assigned shortly before your window. Live tracking appears here as soon as they accept.
      </p>
      <div className="w-full max-w-sm space-y-3">
        {isVendorView && (
          <button onClick={confirmCancel} disabled={cancelling} className="w-full py-4 rounded-2xl bg-white/5 border border-white/10 text-red-400 text-xs font-black uppercase tracking-widest disabled:opacity-50 flex items-center justify-center gap-2">
            {cancelling ? <Loader2 size={14} className="animate-spin" /> : null} Cancel order
          </button>
        )}
        {isVendorView && (
          <Link href="/vendor/active-orders" className="block w-full py-4 rounded-2xl bg-emerald-500 text-charcoal-950 text-xs font-black uppercase tracking-widest">
            Back to my orders
          </Link>
        )}
      </div>
    </div>
  );
}
'@
  }
  @{
    Path = 'src/components/rider/DropoffChecklist.jsx'
    Content = @'
"use client";

import { useState, useEffect, useCallback } from "react";
import { MapPin, Phone, Navigation, CheckCircle2, Loader2 } from "lucide-react";
import { createClient } from "@/utils/supabase/client";

// Drop-off list for an order with more than one stop. The order's own
// "Mark Delivered" slider stays locked until every stop here is delivered.
export default function DropoffChecklist({ orderId, canComplete = false, onProgress }) {
  const [supabase] = useState(() => createClient());
  const [stops, setStops] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState(null);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    const { data, error: loadErr } = await supabase
      .from("order_stops")
      .select("id, seq, dropoff_name, dropoff_lat, dropoff_lng, dropoff_details, recipient_name, recipient_phone, status")
      .eq("order_id", orderId)
      .order("seq", { ascending: true });
    if (loadErr) {
      setError("Couldn't load the drop-off list. Pull to refresh and try again.");
      onProgress?.(false);
    } else {
      const rows = data || [];
      setStops(rows);
      setError(null);
      onProgress?.(rows.length > 0 && rows.every((s) => s.status === "delivered"));
    }
    setLoading(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [supabase, orderId]);

  useEffect(() => { load(); }, [load]);

  async function complete(stopId) {
    setBusyId(stopId);
    setError(null);
    const { error: rpcErr } = await supabase.rpc("complete_order_stop", { p_stop_id: stopId });
    if (rpcErr) setError(rpcErr.message || "Couldn't mark that stop delivered.");
    await load();
    setBusyId(null);
  }

  const doneCount = stops.filter((s) => s.status === "delivered").length;

  return (
    <div className="bg-white/[0.04] border border-white/10 rounded-[2rem] p-5 space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-[10px] font-black text-emerald-500 uppercase tracking-widest">Drop-offs</p>
        <p className="text-charcoal-400 text-[10px] font-black uppercase tracking-widest">{doneCount}/{stops.length} done</p>
      </div>

      {loading && <div className="flex justify-center py-4"><Loader2 size={18} className="animate-spin text-emerald-500" /></div>}
      {error && <p className="text-red-400 text-xs font-bold">{error}</p>}

      {stops.map((s) => {
        const done = s.status === "delivered";
        return (
          <div key={s.id} className={"rounded-2xl border p-4 space-y-3 " + (done ? "border-emerald-500/30 bg-emerald-500/5" : "border-white/10 bg-white/[0.03]")}>
            <div className="flex items-start gap-3">
              {done ? <CheckCircle2 size={18} className="text-emerald-500 mt-0.5 shrink-0" /> : <MapPin size={18} className="text-amber-400 mt-0.5 shrink-0" />}
              <div className="min-w-0 flex-1">
                <p className="text-[10px] font-black text-charcoal-500 uppercase tracking-widest">Stop {s.seq}</p>
                <p className="text-ink font-bold text-sm">{s.dropoff_name}</p>
                {s.recipient_name && <p className="text-charcoal-400 text-xs mt-0.5">{s.recipient_name}</p>}
                {s.dropoff_details && <p className="text-charcoal-500 text-xs mt-1">{s.dropoff_details}</p>}
              </div>
            </div>
            {!done && (
              <div className="grid grid-cols-3 gap-2">
                <a href={"https://www.google.com/maps/dir/?api=1&destination=" + s.dropoff_lat + "," + s.dropoff_lng} target="_blank" rel="noreferrer" className="flex items-center justify-center gap-1.5 py-3 rounded-xl bg-white/5 border border-white/10 text-ink text-[10px] font-black uppercase tracking-widest">
                  <Navigation size={12} /> Go
                </a>
                <a href={"tel:" + (s.recipient_phone || "")} className="flex items-center justify-center gap-1.5 py-3 rounded-xl bg-white/5 border border-white/10 text-ink text-[10px] font-black uppercase tracking-widest">
                  <Phone size={12} /> Call
                </a>
                <button onClick={() => complete(s.id)} disabled={!canComplete || busyId === s.id} className="flex items-center justify-center gap-1.5 py-3 rounded-xl bg-emerald-500 disabled:opacity-40 text-charcoal-950 text-[10px] font-black uppercase tracking-widest">
                  {busyId === s.id ? <Loader2 size={12} className="animate-spin" /> : "Delivered"}
                </button>
              </div>
            )}
          </div>
        );
      })}

      {!canComplete && stops.length > 0 && doneCount < stops.length && (
        <p className="text-charcoal-500 text-[10px] font-bold uppercase tracking-widest text-center">You can mark stops delivered once the trip is in transit.</p>
      )}
    </div>
  );
}
'@
  }
  @{
    Path = 'src/utils/stops.js'
    Content = @'
import { roundUpTo50 } from "@/utils/pricing";

// Extra drop-offs on a single order (pilot).
// Stop 1 is priced exactly as before (send-package/step-2). Every additional
// drop-off adds a flat handling fee plus the distance from the previous stop.
export const MAX_EXTRA_STOPS = 4;
export const EXTRA_STOP_BASE = 150;

// Keep these in sync with send-package/step-2/page.jsx.
const PRICE_PER_KM = { bike: 120, car: 200 };
const SIZE_MULTIPLIERS = { small: 1.0, medium: 1.25, large: 1.6 };

// Straight-line distance is shorter than the road; this evens it out
// without needing a routing API call per extra stop.
const ROAD_FACTOR = 1.35;

export function haversineKm(a, b) {
  if (!a || !b) return 0;
  const toRad = (x) => (x * Math.PI) / 180;
  const R = 6371;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

// Fee for each extra stop, chained from stop 1: stop1 -> extra1 -> extra2 ...
export function extraStopFees(firstStop, extras, vehicle = "bike", size = "small", fuelMultiplier = 1) {
  const rate = (PRICE_PER_KM[vehicle] || PRICE_PER_KM.bike) * fuelMultiplier;
  const sizeMultiplier = SIZE_MULTIPLIERS[size] || 1.0;
  let prev = firstStop;
  return (extras || []).map((stop) => {
    const km = haversineKm(prev, stop) * ROAD_FACTOR;
    prev = stop;
    return roundUpTo50((EXTRA_STOP_BASE + km * rate) * sizeMultiplier);
  });
}
'@
  }
  @{
    Path = 'src/utils/windows.js'
    Content = @'
// Pilot delivery windows. Nigeria (Africa/Lagos) is UTC+1 all year with no
// daylight saving, so a fixed offset is exact here.
const LAGOS_OFFSET_MS = 60 * 60 * 1000;

// Vendors must book at least this long before the window starts.
export const CUTOFF_MINUTES_BEFORE = 60;

export const DELIVERY_WINDOWS = [
  { id: "12:30", hour: 12, minute: 30, label: "12:30 PM" },
  { id: "15:30", hour: 15, minute: 30, label: "3:30 PM" },
];

function dayLabel(dayOffset, startMs) {
  if (dayOffset === 0) return "Today";
  if (dayOffset === 1) return "Tomorrow";
  return new Date(startMs).toLocaleDateString("en-NG", { weekday: "long", timeZone: "Africa/Lagos" });
}

// Windows whose cutoff has not passed yet, soonest first.
export function upcomingWindows(now = new Date(), count = 4) {
  const nowMs = now.getTime();
  const lagos = new Date(nowMs + LAGOS_OFFSET_MS);
  const y = lagos.getUTCFullYear();
  const m = lagos.getUTCMonth();
  const d = lagos.getUTCDate();
  const out = [];

  for (let dayOffset = 0; dayOffset < 3 && out.length < count; dayOffset++) {
    for (const w of DELIVERY_WINDOWS) {
      // Lagos wall-clock time -> real UTC instant.
      const startMs = Date.UTC(y, m, d + dayOffset, w.hour, w.minute) - LAGOS_OFFSET_MS;
      const cutoffMs = startMs - CUTOFF_MINUTES_BEFORE * 60 * 1000;
      if (cutoffMs <= nowMs) continue;
      if (out.length >= count) break;
      out.push({
        iso: new Date(startMs).toISOString(),
        cutoffIso: new Date(cutoffMs).toISOString(),
        label: dayLabel(dayOffset, startMs) + " " + w.label,
      });
    }
  }
  return out;
}

export function formatWindowTime(iso) {
  if (!iso) return "";
  return new Date(iso).toLocaleString("en-NG", {
    timeZone: "Africa/Lagos",
    weekday: "short",
    hour: "numeric",
    minute: "2-digit",
  });
}
'@
  }
  @{
    Path = 'supabase/migrations/20261007120000_payment_policy_stops_scheduling.sql'
    Content = @'
-- =====================================================================
-- ONE MIGRATION - safe to run now, before or after deploying the new code.
-- Everything is additive and defaults to TODAY'S behaviour:
--   * Payment policy defaults to "optional" (pay after a rider accepts).
--     Nothing changes until you flip it on the ops "Payment Policy" page.
--   * Orders created by the OLD code are never forced to pay first.
--   * stop_count defaults to 1, scheduled windows are off for every vendor.
-- Rollback block at the bottom.
-- =====================================================================
begin;

-- 1. Columns -----------------------------------------------------------
alter table public.orders  add column if not exists scheduled_at     timestamptz;   -- already exists live; no-op
alter table public.orders  add column if not exists stop_count       integer not null default 1;
alter table public.orders  add column if not exists payment_required boolean not null default false;
alter table public.vendors add column if not exists scheduled_enabled boolean not null default false;
alter table public.vendors add column if not exists payment_policy   text;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'vendors_payment_policy_check') then
    alter table public.vendors add constraint vendors_payment_policy_check
      check (payment_policy is null or payment_policy in ('required', 'optional'));
  end if;
end $$;

-- 2. Admin-controlled settings ------------------------------------------
create table if not exists public.app_settings (
  key        text primary key,
  value      jsonb not null,
  updated_at timestamptz not null default now(),
  updated_by uuid
);
alter table public.app_settings enable row level security;   -- no policies: only the server (service role) can touch it
revoke all on public.app_settings from anon, authenticated;
grant all on public.app_settings to service_role;

insert into public.app_settings (key, value) values
  ('payment_policy',        '{"mode": "optional"}'::jsonb),
  ('unpaid_expiry_minutes', '{"minutes": 30}'::jsonb)
on conflict (key) do nothing;

-- 3. Payment policy: decided by the DATABASE when an order is created ----
create or replace function public.payment_required_for_vendor(p_vendor_id uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_policy text;
  v_mode   text;
begin
  select payment_policy into v_policy from public.vendors where id = p_vendor_id;
  if v_policy = 'required' then return true; end if;
  if v_policy = 'optional' then return false; end if;
  select value ->> 'mode' into v_mode from public.app_settings where key = 'payment_policy';
  return coalesce(v_mode, 'optional') = 'required';
end;
$$;

-- Used only to word the vendor screen; the order's own flag is what counts.
create or replace function public.payment_required_for_me()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select public.payment_required_for_vendor(v.id)
       from public.vendors v where v.user_id = auth.uid() limit 1),
    false);
$$;

revoke all on function public.payment_required_for_vendor(uuid) from public, anon;
revoke all on function public.payment_required_for_me() from public, anon;
grant execute on function public.payment_required_for_vendor(uuid) to authenticated, service_role;
grant execute on function public.payment_required_for_me() to authenticated, service_role;

-- A vendor's browser cannot opt out: the flag is stamped here, not by the client.
create or replace function public.set_order_payment_required()
returns trigger
language plpgsql
as $$
begin
  NEW.payment_required := (NEW.scheduled_at is not null) or public.payment_required_for_vendor(NEW.vendor_id);
  return NEW;
end;
$$;

drop trigger if exists trg_orders_set_payment_required on public.orders;
create trigger trg_orders_set_payment_required
  before insert on public.orders
  for each row
  execute function public.set_order_payment_required();

-- A rider can only be assigned to a pay-first order once it is paid.
create or replace function public.enforce_paid_before_accept()
returns trigger
language plpgsql
as $$
begin
  if NEW.payment_required
     and NEW.payment_status is distinct from 'paid'
     and (
           (OLD.rider_id is null and NEW.rider_id is not null)
        or (NEW.status in ('matched', 'accepted')
            and OLD.status in ('pending', 'looking_for_driver'))
         )
  then
    raise exception 'ORDER_NOT_PAID: this order must be paid before a rider can accept it';
  end if;
  return NEW;
end;
$$;

drop trigger if exists trg_orders_require_paid_before_accept on public.orders;
create trigger trg_orders_require_paid_before_accept
  before update on public.orders
  for each row
  execute function public.enforce_paid_before_accept();

-- 4. Extra drop-offs on one order ----------------------------------------
create table if not exists public.order_stops (
  id              uuid primary key default gen_random_uuid(),
  order_id        uuid not null references public.orders(id) on delete cascade,
  seq             integer not null check (seq >= 1),
  dropoff_name    text not null,
  dropoff_lat     double precision not null,
  dropoff_lng     double precision not null,
  dropoff_details text,
  recipient_name  text,
  recipient_phone text,
  status          text not null default 'pending' check (status in ('pending', 'delivered')),
  delivered_at    timestamptz,
  created_at      timestamptz not null default now(),
  unique (order_id, seq)
);
create index if not exists order_stops_order_id_idx on public.order_stops (order_id);
alter table public.order_stops enable row level security;

create or replace function public.order_stops_visible(p_order_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
           select 1 from public.orders o
           join public.vendors v on v.id = o.vendor_id
           where o.id = p_order_id and v.user_id = auth.uid())
      or exists (
           select 1 from public.orders o
           join public.riders r on r.id = o.rider_id
           where o.id = p_order_id and r.user_id = auth.uid())
      or exists (
           select 1 from public.order_broadcasts b
           join public.riders r on r.id = b.rider_id
           where b.order_id = p_order_id and r.user_id = auth.uid());
$$;

create or replace function public.order_stops_can_insert(p_order_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.orders o
    join public.vendors v on v.id = o.vendor_id
    where o.id = p_order_id
      and v.user_id = auth.uid()
      and o.status = 'pending'
      and o.rider_id is null);
$$;

drop policy if exists order_stops_select on public.order_stops;
create policy order_stops_select on public.order_stops
  for select to authenticated using (public.order_stops_visible(order_id));

drop policy if exists order_stops_insert on public.order_stops;
create policy order_stops_insert on public.order_stops
  for insert to authenticated with check (public.order_stops_can_insert(order_id));

revoke all on public.order_stops from anon;
grant select, insert on public.order_stops to authenticated;
grant all on public.order_stops to service_role;

revoke all on function public.order_stops_visible(uuid) from public, anon;
revoke all on function public.order_stops_can_insert(uuid) from public, anon;
grant execute on function public.order_stops_visible(uuid) to authenticated, service_role;
grant execute on function public.order_stops_can_insert(uuid) to authenticated, service_role;

-- A rider marks ONE stop delivered: assigned rider only, trip in transit only.
create or replace function public.complete_order_stop(p_stop_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order_id uuid;
begin
  select s.order_id into v_order_id from public.order_stops s where s.id = p_stop_id;
  if v_order_id is null then
    raise exception 'STOP_NOT_FOUND';
  end if;

  if not exists (
    select 1 from public.orders o
    join public.riders r on r.id = o.rider_id
    where o.id = v_order_id
      and r.user_id = auth.uid()
      and o.status = 'in_transit'
  ) then
    raise exception 'NOT_ALLOWED: only the assigned rider can complete stops while the order is in transit';
  end if;

  update public.order_stops
     set status = 'delivered', delivered_at = now()
   where id = p_stop_id and status <> 'delivered';
end;
$$;

revoke all on function public.complete_order_stop(uuid) from public, anon;
grant execute on function public.complete_order_stop(uuid) to authenticated;

-- An order cannot become 'delivered' while any of its stops is pending.
create or replace function public.enforce_stops_before_delivered()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if exists (
    select 1 from public.order_stops s
    where s.order_id = NEW.id and s.status <> 'delivered'
  ) then
    raise exception 'STOPS_REMAINING: complete every drop-off before marking this order delivered';
  end if;
  return NEW;
end;
$$;

drop trigger if exists trg_orders_stops_before_delivered on public.orders;
create trigger trg_orders_stops_before_delivered
  before update on public.orders
  for each row
  when (NEW.status = 'delivered' and OLD.status is distinct from 'delivered')
  execute function public.enforce_stops_before_delivered();

-- 5. Cancel abandoned pay-first orders -------------------------------------
-- Only orders that REQUIRE payment, are still waiting for a rider and were
-- never paid. Orders on the "pay after a rider accepts" flow are never touched.
create or replace function public.expire_unpaid_orders()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_minutes integer;
  v_count   integer;
begin
  select (value ->> 'minutes')::integer into v_minutes
    from public.app_settings where key = 'unpaid_expiry_minutes';
  v_minutes := coalesce(v_minutes, 30);
  if v_minutes <= 0 then
    return 0;
  end if;

  with cancelled as (
    update public.orders
       set status = 'cancelled',
           cancellation_reason = 'Payment not completed in time'
     where payment_required
       and status in ('pending', 'looking_for_driver')
       and rider_id is null
       and payment_status in ('unpaid', 'pending')
       and created_at < now() - make_interval(mins => v_minutes)
    returning 1
  )
  select count(*) into v_count from cancelled;

  return v_count;
end;
$$;

revoke all on function public.expire_unpaid_orders() from public, anon, authenticated;
grant execute on function public.expire_unpaid_orders() to service_role;

commit;

-- 6. Run the expiry every 5 minutes (needs the pg_cron extension) ------------
-- If this prints a notice instead, enable pg_cron in Supabase:
--   Dashboard > Database > Extensions > pg_cron, then run this block again.
-- Without it everything still works; use the "Run now" button on the ops
-- Payment Policy page whenever you want to clear abandoned orders.
do $$
begin
  begin
    create extension if not exists pg_cron;
  exception when others then
    raise notice 'pg_cron could not be enabled automatically (%). Enable it in Dashboard > Database > Extensions, then re-run this block.', sqlerrm;
  end;

  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    if exists (select 1 from cron.job where jobname = 'expire-unpaid-orders') then
      perform cron.unschedule('expire-unpaid-orders');
    end if;
    perform cron.schedule('expire-unpaid-orders', '*/5 * * * *', 'select public.expire_unpaid_orders()');
    raise notice 'Scheduled expire-unpaid-orders every 5 minutes.';
  end if;
exception when others then
  raise notice 'Could not schedule the expiry job (%). Use "Run now" on the ops Payment Policy page instead.', sqlerrm;
end $$;

-- ---------------------------------------------------------------------
-- ROLLBACK (only if needed; the old app keeps working with all of this in place):
--   select cron.unschedule('expire-unpaid-orders');   -- if pg_cron was used
--   drop trigger if exists trg_orders_require_paid_before_accept on public.orders;
--   drop trigger if exists trg_orders_set_payment_required on public.orders;
--   drop trigger if exists trg_orders_stops_before_delivered on public.orders;
--   drop function if exists public.enforce_paid_before_accept();
--   drop function if exists public.set_order_payment_required();
--   drop function if exists public.enforce_stops_before_delivered();
--   drop function if exists public.expire_unpaid_orders();
--   drop function if exists public.complete_order_stop(uuid);
--   drop function if exists public.payment_required_for_me();
--   drop function if exists public.payment_required_for_vendor(uuid);
--   drop table if exists public.order_stops;
--   drop function if exists public.order_stops_visible(uuid);
--   drop function if exists public.order_stops_can_insert(uuid);
--   drop table if exists public.app_settings;
--   alter table public.orders  drop column if exists payment_required;
--   alter table public.orders  drop column if exists stop_count;
--   alter table public.vendors drop column if exists payment_policy;
--   alter table public.vendors drop column if exists scheduled_enabled;
-- ---------------------------------------------------------------------
'@
  }
)

# ----------------------------------------------------------------------
# Edits to existing files (each anchor must match exactly once)
# ----------------------------------------------------------------------
$patches = @(
  @{
    File = 'src/app/send-package/step-2/page.jsx'
    Label = 'step-2: save base price, route to the extra-stops page'
    Mode = 'literal'
    Marker = @'
base_price: estimatedPrice,
'@
    Find = @'
      estimated_price: estimatedPrice,
    };
    sessionStorage.setItem(DRAFT_KEY, JSON.stringify(updated));
    router.push("/send-package/step-3");
'@
    Replace = @'
      estimated_price: estimatedPrice,
      base_price: estimatedPrice,
      extras_total: 0,
      stop_count: 1,
    };
    sessionStorage.setItem(DRAFT_KEY, JSON.stringify(updated));
    router.push("/send-package/stops");
'@
  }
  @{
    File = 'src/app/send-package/step-3/page.jsx'
    Label = 'step-3: imports'
    Mode = 'literal'
    Marker = @'
import { upcomingWindows } from "@/utils/windows";
'@
    Find = @'
import { ArrowLeft, Zap, Loader2, Lock } from "lucide-react";
'@
    Replace = @'
import { ArrowLeft, Zap, Loader2, Lock } from "lucide-react";
import { cancelOrder } from "@/app/vendor/active-orders/actions";
import { upcomingWindows } from "@/utils/windows";
'@
  }
  @{
    File = 'src/app/send-package/step-3/page.jsx'
    Label = 'step-3: scheduled-window state'
    Mode = 'literal'
    Marker = @'
const [scheduledEnabled, setScheduledEnabled]
'@
    Find = @'
  const [error, setError] = useState(null);
'@
    Replace = @'
  const [error, setError] = useState(null);

  // Scheduled delivery windows: only shown to vendors ops has switched on.
  const [scheduledEnabled, setScheduledEnabled] = useState(false);
  const [windowChoice, setWindowChoice] = useState("now");
  const [payFirst, setPayFirst] = useState(false);
  const windowOptions = upcomingWindows();

  useEffect(() => {
    (async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;
        const { data } = await supabase
          .from("vendors")
          .select("scheduled_enabled")
          .eq("user_id", user.id)
          .maybeSingle();
        if (data?.scheduled_enabled) setScheduledEnabled(true);
        // Only used for wording: the database decides the real policy on insert.
        const { data: pf } = await supabase.rpc("payment_required_for_me");
        setPayFirst(pf === true);
      } catch { /* feature simply stays hidden */ }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
'@
  }
  @{
    File = 'src/app/send-package/step-3/page.jsx'
    Label = 'step-3: compute stops + window before insert'
    Mode = 'literal'
    Marker = @'
let scheduledAtIso = null;
'@
    Find = @'
      const { data: order, error: err } = await supabase.from("orders").insert({
'@
    Replace = @'
      const extras = Array.isArray(draft.extra_stops) ? draft.extra_stops : [];
      if (extras.length > 0 && Number(draft.stop_count) !== 1 + extras.length) {
        throw new Error("Please review your drop-offs again before continuing.");
      }

      let scheduledAtIso = null;
      if (windowChoice !== "now") {
        const startMs = new Date(windowChoice).getTime();
        if (!Number.isFinite(startMs) || startMs - Date.now() < 60 * 60 * 1000) {
          throw new Error("That delivery window has just closed. Please pick another.");
        }
        scheduledAtIso = new Date(startMs).toISOString();
      }

      const { data: order, error: err } = await supabase.from("orders").insert({
'@
  }
  @{
    File = 'src/app/send-package/step-3/page.jsx'
    Label = 'step-3: stop_count / scheduled_at on the order'
    Mode = 'literal'
    Marker = @'
...(scheduledAtIso ? { scheduled_at: scheduledAtIso } : {}),
'@
    Find = @'
        agreed_price: draft.estimated_price,
        status: "pending",
'@
    Replace = @'
        agreed_price: draft.estimated_price,
        ...(extras.length > 0 ? { stop_count: 1 + extras.length } : {}),
        ...(scheduledAtIso ? { scheduled_at: scheduledAtIso } : {}),
        status: "pending",
'@
  }
  @{
    File = 'src/app/send-package/step-3/page.jsx'
    Label = 'step-3: save stops, pay first (no dispatch before payment)'
    Mode = 'literal'
    Marker = @'
if (order.payment_required) {
'@
    Find = @'
      sessionStorage.setItem(DRAFT_KEY, JSON.stringify({ ...draft, orderId: order.id }));

      // Kick off the first dispatch broadcast immediately rather than
      // waiting for the tracking page's own 15s poll cycle to fire it -
      // this order shouldn't sit invisible to nearby riders for up to 15
      // extra seconds just because of where the redirect happens to land.
      fetch("/api/dispatch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderId: order.id })
      }).catch(() => { /* tracking page's own retry loop covers this */ });

      setRedirecting(true);
      router.replace(`/tracking/${order.id}`);
'@
    Replace = @'
      if (extras.length > 0) {
        const stopRows = [
          {
            order_id: order.id,
            seq: 1,
            dropoff_name: draft.dropoff.name,
            dropoff_lat: draft.dropoff.lat,
            dropoff_lng: draft.dropoff.lng,
            dropoff_details: draft.dropoff_note || null,
            recipient_name: draft.recipient_name || null,
            recipient_phone: draft.recipient_phone || null,
          },
          ...extras.map((s, i) => ({
            order_id: order.id,
            seq: i + 2,
            dropoff_name: s.name,
            dropoff_lat: s.lat,
            dropoff_lng: s.lng,
            dropoff_details: s.note || null,
            recipient_name: s.recipient_name || null,
            recipient_phone: s.recipient_phone || null,
          })),
        ];
        const { error: stopsErr } = await supabase.from("order_stops").insert(stopRows);
        if (stopsErr) {
          await cancelOrder(order.id, "Extra drop-offs could not be saved").catch(() => {});
          throw new Error("Could not save your extra drop-offs. Please try again.");
        }
      }

      sessionStorage.setItem(DRAFT_KEY, JSON.stringify({ ...draft, orderId: order.id }));

      setRedirecting(true);
      if (order.payment_required) {
        // PAY FIRST (decided per order by the database from your payment
        // policy): riders are only notified once payment is confirmed (see
        // /api/verify-payment and the Paystack webhook).
        router.replace(`/payment?orderId=${order.id}`);
      } else {
        // Payment not required up front: dispatch straight away, as before.
        fetch("/api/dispatch", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ orderId: order.id })
        }).catch(() => { /* tracking page's own retry loop covers this */ });
        router.replace(`/tracking/${order.id}`);
      }
'@
  }
  @{
    File = 'src/app/send-package/step-3/page.jsx'
    Label = 'step-3: summary row for extra drop-offs'
    Mode = 'literal'
    Marker = @'
Extra drop-offs</span>
'@
    Find = @'
            <div className="flex justify-between text-sm">
              <span className="text-charcoal-500 font-bold">Estimated Fare</span>
'@
    Replace = @'
            {Array.isArray(draft.extra_stops) && draft.extra_stops.length > 0 && (
              <div className="flex justify-between text-sm">
                <span className="text-charcoal-500 font-bold">Extra drop-offs</span>
                <span className="text-ink font-black">+{draft.extra_stops.length}</span>
              </div>
            )}
            <div className="flex justify-between text-sm">
              <span className="text-charcoal-500 font-bold">Estimated Fare</span>
'@
  }
  @{
    File = 'src/app/send-package/step-3/page.jsx'
    Label = 'step-3: delivery window selector'
    Mode = 'literal'
    Marker = @'
Delivery time</div>
'@
    Find = @'
        {error && (
          <div className="w-full max-w-sm mb-6 p-4 bg-red-500/10
'@
    Replace = @'
        {scheduledEnabled && windowOptions.length > 0 && (
          <div className="w-full max-w-sm mb-6 bg-white/[0.04] border border-white/10 rounded-3xl p-5">
            <div className="text-[10px] font-black text-emerald-500 uppercase tracking-widest mb-3">Delivery time</div>
            <div className="grid grid-cols-1 gap-2">
              <button
                type="button"
                onClick={() => setWindowChoice("now")}
                className={"w-full text-left px-4 py-3 rounded-2xl border text-sm font-black " + (windowChoice === "now" ? "border-emerald-500 bg-emerald-500/10 text-emerald-400" : "border-white/10 text-ink")}
              >
                Now - find a rider right away
              </button>
              {windowOptions.map((w) => (
                <button
                  key={w.iso}
                  type="button"
                  onClick={() => setWindowChoice(w.iso)}
                  className={"w-full text-left px-4 py-3 rounded-2xl border text-sm font-black " + (windowChoice === w.iso ? "border-emerald-500 bg-emerald-500/10 text-emerald-400" : "border-white/10 text-ink")}
                >
                  {w.label}
                </button>
              ))}
            </div>
          </div>
        )}
        {error && (
          <div className="w-full max-w-sm mb-6 p-4 bg-red-500/10
'@
  }
  @{
    File = 'src/app/send-package/step-3/page.jsx'
    Label = 'step-3: button label'
    Mode = 'literal'
    Marker = @'
payFirst ? "Pay & Find My Rider" : "Find My Rider"
'@
    Find = @'
<><Zap size={22} /> Find My Rider</>
'@
    Replace = @'
<><Zap size={22} /> {windowChoice !== "now" ? "Pay & Schedule" : payFirst ? "Pay & Find My Rider" : "Find My Rider"}</>
'@
  }
  @{
    File = 'src/app/send-package/step-3/page.jsx'
    Label = 'step-3: copy - pay first'
    Mode = 'literal'
    Marker = @'
"Pay securely first" : "No payment until delivery"
'@
    Find = @'
<p className="text-charcoal-600 text-xs font-bold mt-4 uppercase tracking-widest">No payment until delivery</p>
'@
    Replace = @'
<p className="text-charcoal-600 text-xs font-bold mt-4 uppercase tracking-widest">{windowChoice !== "now" || payFirst ? "Pay securely first" : "No payment until delivery"}</p>
'@
  }
  @{
    File = 'src/app/send-package/step-3/page.jsx'
    Label = 'step-3: copy - what happens next'
    Mode = 'literal'
    Marker = @'
You'll pay with Paystack next. Once paid
'@
    Find = @'
You'll be taken straight to live tracking, where you can negotiate price and see bids from nearby riders.
'@
    Replace = @'
{windowChoice !== "now" || payFirst ? "You'll pay with Paystack next. Once paid, nearby riders are notified right away (scheduled orders are handed to a rider before your window)." : "You'll be taken straight to live tracking, where you can negotiate price and see bids from nearby riders."}
'@
  }
  @{
    File = 'src/app/api/dispatch/route.js'
    Label = 'dispatch: never broadcast unpaid or scheduled orders'
    Mode = 'literal'
    Marker = @'
PAY FIRST: riders are only notified
'@
    Find = @'
if (!order) return NextResponse.json({ error: "Order not found" }, { status: 404 });
'@
    Replace = @'
if (!order) return NextResponse.json({ error: "Order not found" }, { status: 404 });

    // Only orders still waiting for a rider are ever broadcast.
    if (order.status !== "pending" && order.status !== "looking_for_driver") {
      return NextResponse.json({ success: false, message: "Order is not waiting for a rider." });
    }
    // PAY FIRST: riders are only notified for orders that require payment up
    // front once they are paid. (order.payment_required is set by the database
    // from the payment policy when the order is created.)
    if (order.payment_required && order.payment_status !== "paid") {
      return NextResponse.json({ success: false, message: "Order is not paid yet - riders are not notified until payment is confirmed." });
    }
    // Scheduled orders are never auto-broadcast; ops releases them to a rider.
    if (order.scheduled_at) {
      return NextResponse.json({ success: false, scheduled: true, message: "Scheduled order - released by ops." });
    }
'@
  }
  @{
    File = 'src/app/api/verify-payment/route.js'
    Label = 'verify-payment: no simulated payments in production'
    Mode = 'literal'
    Marker = @'
misconfigured on the server (missing PAYSTACK_SECRET_KEY)
'@
    Find = @'
        console.warn('Using dummy verification due to missing PAYSTACK_SECRET_KEY');
'@
    Replace = @'
        if (process.env.NODE_ENV === 'production') {
          console.error('PAYSTACK_SECRET_KEY is missing/placeholder in production - refusing to simulate a payment.');
          return NextResponse.json({ error: 'Payment verification is misconfigured on the server (missing PAYSTACK_SECRET_KEY). Contact support.' }, { status: 500 });
        }
        console.warn('Using dummy verification due to missing PAYSTACK_SECRET_KEY');
'@
  }
  @{
    File = 'src/app/api/verify-payment/route.js'
    Label = 'verify-payment: lock the price once paid'
    Mode = 'literal'
    Marker = @'
price_locked: true
'@
    Find = @'
            payment_status: 'paid',
            delivery_pin: generatedPin,
            payment_reference: reference
'@
    Replace = @'
            payment_status: 'paid',
            delivery_pin: generatedPin,
            payment_reference: reference,
            price_locked: true
'@
  }
  @{
    File = 'src/app/api/verify-payment/route.js'
    Label = 'verify-payment: notify riders only after payment'
    Mode = 'literal'
    Marker = @'
PAY FIRST: payment is confirmed, so now (and only now)
'@
    Find = @'
      throw updateErr;
    }

    return NextResponse.json({ success: true });
'@
    Replace = @'
      throw updateErr;
    }

    // PAY FIRST: payment is confirmed, so now (and only now) notify riders.
    // /api/dispatch itself skips scheduled orders.
    try {
      await fetch(`${new URL(req.url).origin}/api/dispatch`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orderId }),
        signal: AbortSignal.timeout(8000),
      });
    } catch (dispatchErr) {
      console.error('Post-payment dispatch failed (the tracking page retries):', dispatchErr);
    }

    return NextResponse.json({ success: true });
'@
  }
  @{
    File = 'src/app/api/webhooks/paystack/route.js'
    Label = 'webhook: check the amount before marking paid'
    Mode = 'regex'
    Marker = @'
PAY FIRST: never mark an order paid
'@
    Find = @'
const \{ error \} = await supabase\s*\.from\("orders"\)\s*\.update\(\{\s*payment_status: "paid",\s*payment_reference: body\.data\.reference\s*\}\)\s*\.eq\("id", orderId\);
'@
    Replace = @'
// PAY FIRST: never mark an order paid unless Paystack actually collected
      // at least the order's price. Metadata alone can be forged, so the
      // amount and currency are checked against our own record.
      const { data: orderRow } = await supabase
        .from("orders")
        .select("agreed_price, payment_status, status")
        .eq("id", orderId)
        .maybeSingle();

      if (!orderRow) {
        console.error(`Webhook: order ${orderId} not found - ignoring.`);
        return NextResponse.json({ received: true });
      }

      const paidKobo = Number(body.data.amount) || 0;
      if (!orderRow.agreed_price || paidKobo < orderRow.agreed_price * 100 || body.data.currency !== "NGN") {
        console.error(`Webhook: amount/currency mismatch for order ${orderId} (paid ${paidKobo} ${body.data.currency}, expected ${orderRow.agreed_price} NGN) - NOT marking paid.`);
        return NextResponse.json({ received: true });
      }

      if (orderRow.payment_status === "paid") {
        return NextResponse.json({ received: true });
      }

      const { error } = await supabase
        .from("orders")
        .update({
          payment_status: "paid",
          payment_reference: body.data.reference,
          price_locked: true
        })
        .eq("id", orderId);
'@
  }
  @{
    File = 'src/app/api/webhooks/paystack/route.js'
    Label = 'webhook: notify riders after payment'
    Mode = 'literal'
    Marker = @'
Post-payment dispatch failed (webhook)
'@
    Find = @'
      console.log(`Order ${orderId} payment confirmed via Paystack webhook.`);
'@
    Replace = @'
      console.log(`Order ${orderId} payment confirmed via Paystack webhook.`);

      if (!error && orderRow.status === "cancelled") {
        console.error(`REFUND NEEDED: order ${orderId} was cancelled but a payment arrived (${body.data.reference}).`);
      }

      // PAY FIRST: now that the order is paid, notify riders (the dispatch
      // route itself skips scheduled, unpaid-required and non-waiting orders).
      if (!error) {
        try {
          await fetch(`${new URL(req.url).origin}/api/dispatch`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ orderId }),
            signal: AbortSignal.timeout(8000),
          });
        } catch (dispatchErr) {
          console.error("Post-payment dispatch failed (webhook):", dispatchErr);
        }
      }
'@
  }
  @{
    File = 'src/app/tracking/[orderId]/page.jsx'
    Label = 'tracking: import the scheduled view'
    Mode = 'literal'
    Marker = @'
import ScheduledOrderView from '@/components/ScheduledOrderView';
'@
    Find = @'
import { cancelOrder } from '@/app/vendor/active-orders/actions';
'@
    Replace = @'
import { cancelOrder } from '@/app/vendor/active-orders/actions';
import ScheduledOrderView from '@/components/ScheduledOrderView';
'@
  }
  @{
    File = 'src/app/tracking/[orderId]/page.jsx'
    Label = 'tracking: send the vendor to pay when the order is unpaid'
    Mode = 'literal'
    Marker = @'
PAY FIRST: an unpaid order isn't visible to riders
'@
    Find = @'
  // The "expanding search radius" shown below only actually expands if
'@
    Replace = @'
  // PAY FIRST: an unpaid order isn't visible to riders, so there is nothing
  // to track yet - send the vendor to pay instead.
  useEffect(() => {
    if (!isVendorView || !order) return;
    const unpaidAndWaiting =
      order.payment_required &&
      order.payment_status !== 'paid' &&
      (order.status === 'pending' || order.status === 'looking_for_driver') &&
      !order.rider_id;
    if (unpaidAndWaiting) router.replace(`/payment?orderId=${order.id}`);
  }, [isVendorView, order, router]);

  // The "expanding search radius" shown below only actually expands if
'@
  }
  @{
    File = 'src/app/tracking/[orderId]/page.jsx'
    Label = 'tracking: no dispatch polling for scheduled or unpaid orders'
    Mode = 'literal'
    Marker = @'
if (!waiting || order.scheduled_at || (order.payment_required && order.payment_status !== 'paid')) {
'@
    Find = @'
    const waiting = order.status === 'pending' || order.status === 'looking_for_driver';
    if (!waiting) {
      if (expandPollRef.current) { clearInterval(expandPollRef.current); expandPollRef.current = null; }
'@
    Replace = @'
    const waiting = order.status === 'pending' || order.status === 'looking_for_driver';
    if (!waiting || order.scheduled_at || (order.payment_required && order.payment_status !== 'paid')) {
      if (expandPollRef.current) { clearInterval(expandPollRef.current); expandPollRef.current = null; }
'@
  }
  @{
    File = 'src/app/tracking/[orderId]/page.jsx'
    Label = 'tracking: re-run the poll effect when payment/schedule change'
    Mode = 'literal'
    Marker = @'
}, [order?.status, order?.scheduled_at, order?.payment_required, order?.payment_status, orderId, supabase]);
'@
    Find = @'
  }, [order?.status, orderId, supabase]);
'@
    Replace = @'
  }, [order?.status, order?.scheduled_at, order?.payment_required, order?.payment_status, orderId, supabase]);
'@
  }
  @{
    File = 'src/app/tracking/[orderId]/page.jsx'
    Label = 'tracking: dedicated view for a paid scheduled order'
    Mode = 'literal'
    Marker = @'
if (isWaitingForRider && order.scheduled_at) {
'@
    Find = @'
  if (isWaitingForRider) {
    const radius = Number(order.broadcast_radius_km) || 1.5;
'@
    Replace = @'
  if (isWaitingForRider && order.scheduled_at) {
    return (
      <ScheduledOrderView
        order={order}
        isVendorView={isVendorView}
        onCancel={handleCancelOrder}
        cancelling={cancelling}
      />
    );
  }

  if (isWaitingForRider) {
    const radius = Number(order.broadcast_radius_km) || 1.5;
'@
  }
  @{
    File = 'src/app/rider/(main)/active-job/page.jsx'
    Label = 'active-job: import the drop-off checklist'
    Mode = 'literal'
    Marker = @'
import DropoffChecklist from '@/components/rider/DropoffChecklist';
'@
    Find = @'
import OrderChat from '@/components/OrderChat';
'@
    Replace = @'
import OrderChat from '@/components/OrderChat';
import DropoffChecklist from '@/components/rider/DropoffChecklist';
'@
  }
  @{
    File = 'src/app/rider/(main)/active-job/page.jsx'
    Label = 'active-job: stops gate state'
    Mode = 'literal'
    Marker = @'
const stopsGateOpen =
'@
    Find = @'
  const [deliveryPhotoUrl, setDeliveryPhotoUrl] = useState(null);
'@
    Replace = @'
  const [deliveryPhotoUrl, setDeliveryPhotoUrl] = useState(null);
  // Orders with extra drop-offs: the final "Mark Delivered" slider stays
  // locked until the checklist reports every stop delivered.
  const [stopsDone, setStopsDone] = useState(false);
  const stopsGateOpen = !(Number(order?.stop_count) > 1) || stopsDone;
'@
  }
  @{
    File = 'src/app/rider/(main)/active-job/page.jsx'
    Label = 'active-job: show the drop-off checklist'
    Mode = 'literal'
    Marker = @'
<DropoffChecklist orderId={order.id}
'@
    Find = @'
        {/* Delivery photo - encouraged, not required, right before the final
'@
    Replace = @'
        {Number(order.stop_count) > 1 && ['matched', 'picked_up', 'in_transit'].includes(order.status) && (
          <DropoffChecklist orderId={order.id} canComplete={order.status === 'in_transit'} onProgress={setStopsDone} />
        )}

        {/* Delivery photo - encouraged, not required, right before the final
'@
  }
  @{
    File = 'src/app/rider/(main)/active-job/page.jsx'
    Label = 'active-job: lock the deliver slider until all stops are done'
    Mode = 'regex'
    Marker = @'
Complete every drop-off above first
'@
    Find = @'
\{order\.status === 'in_transit' && \(\s*<SlideToConfirm\s+text="Slide to Mark Delivered"
'@
    Replace = @'
{order.status === 'in_transit' && !stopsGateOpen && (
             <div className="rounded-[2rem] border border-amber-500/20 bg-amber-500/5 p-5 text-center">
               <p className="text-amber-500 font-black text-xs uppercase tracking-widest">Complete every drop-off above first</p>
             </div>
           )}
           {order.status === 'in_transit' && stopsGateOpen && (
             <SlideToConfirm
               text="Slide to Mark Delivered"
'@
  }
  @{
    File = 'src/components/rider/IncomingOrderCard.jsx'
    Label = 'rider card: show drop-off count and scheduled time'
    Mode = 'literal'
    Marker = @'
drop-offs</div>
'@
    Find = @'
{basePrice.toLocaleString()}</div>
'@
    Replace = @'
{basePrice.toLocaleString()}</div>
              {Number(order.stop_count) > 1 && (
                <div className="inline-flex self-start bg-amber-500/10 border border-amber-500/20 text-amber-400 text-[10px] font-black uppercase tracking-widest px-3 py-1.5 rounded-full">{order.stop_count} drop-offs</div>
              )}
              {order.scheduled_at && (
                <div className="inline-flex self-start bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-[10px] font-black uppercase tracking-widest px-3 py-1.5 rounded-full">Scheduled {new Date(order.scheduled_at).toLocaleTimeString('en-NG', { timeZone: 'Africa/Lagos', hour: 'numeric', minute: '2-digit' })}</div>
              )}
'@
  }
  @{
    File = 'src/components/rider/IncomingOrderCard.jsx'
    Label = 'rider card: no counter-offers once a pay-first order is paid'
    Mode = 'literal'
    Marker = @'
((order.payment_required && order.payment_status === 'paid') || order.price_locked) ? null :
'@
    Find = @'
{!showBidInput ? (
'@
    Replace = @'
{((order.payment_required && order.payment_status === 'paid') || order.price_locked) ? null : !showBidInput ? (
'@
  }
  @{
    File = 'src/app/rider/(main)/dashboard/page.jsx'
    Label = 'rider feed: only paid orders are visible'
    Mode = 'literal'
    Marker = @'
(!o.payment_required || o.payment_status === 'paid'));
'@
    Find = @'
.filter(o => o && (o.status === 'pending' || o.status === 'looking_for_driver'));
'@
    Replace = @'
.filter(o => o && (o.status === 'pending' || o.status === 'looking_for_driver') && (!o.payment_required || o.payment_status === 'paid'));
'@
  }
  @{
    File = 'src/app/ops-terminal/OpsTerminalShell.jsx'
    Label = 'ops: Scheduled link in the nav'
    Mode = 'literal'
    Marker = @'
href: "/ops-terminal/scheduled"
'@
    Find = @'
      { href: "/ops-terminal/drivers", label: "Tactical Fleet", icon: Users },
'@
    Replace = @'
      { href: "/ops-terminal/scheduled", label: "Scheduled", icon: Package },
      { href: "/ops-terminal/payments", label: "Payment Policy", icon: DollarSign },
      { href: "/ops-terminal/drivers", label: "Tactical Fleet", icon: Users },
'@
  }
)

# ----------------------------------------------------------------------
# Stage 1: work everything out in memory. Nothing is written yet.
# ----------------------------------------------------------------------
$errors = New-Object System.Collections.ArrayList
$notes = New-Object System.Collections.ArrayList
$files = @{}

foreach ($p in $patches) {
  $rel = $p.File
  $full = Join-Path $root $rel
  if (-not (Test-Path -LiteralPath $full)) {
    [void]$errors.Add("MISSING FILE: $rel   (needed for: $($p.Label))")
    continue
  }
  if (-not $files.ContainsKey($rel)) { $files[$rel] = Read-Src $full }
  $f = $files[$rel]
  $marker = ToLf $p.Marker
  $find = ToLf $p.Find
  $replace = ToLf $p.Replace

  if ($f.Text.Contains($marker)) {
    [void]$notes.Add("already applied: $($p.Label)")
    continue
  }

  if ($p.Mode -eq 'regex') {
    $ms = [regex]::Matches($f.Text, $find)
    if ($ms.Count -ne 1) {
      [void]$errors.Add("ANCHOR (regex) matched $($ms.Count) times in ${rel}   (needed for: $($p.Label))")
      continue
    }
    $m = $ms[0]
    $f.Text = $f.Text.Substring(0, $m.Index) + $replace + $f.Text.Substring($m.Index + $m.Length)
  } else {
    $n = Count-Occ $f.Text $find
    if ($n -ne 1) {
      [void]$errors.Add("ANCHOR found $n times in ${rel}   (needed for: $($p.Label))")
      continue
    }
    $idx = $f.Text.IndexOf($find, [System.StringComparison]::Ordinal)
    $f.Text = $f.Text.Substring(0, $idx) + $replace + $f.Text.Substring($idx + $find.Length)
  }
  $f.Changed = $true
  [void]$notes.Add("will edit:       $($p.Label)")
}

$createList = New-Object System.Collections.ArrayList
foreach ($nf in $newFiles) {
  $full = Join-Path $root $nf.Path
  $content = (ToLf $nf.Content) + "`n"
  if (Test-Path -LiteralPath $full) {
    $existing = (Read-Src $full).Text
    if ($existing -eq $content) {
      [void]$notes.Add("already present: $($nf.Path)")
    } else {
      [void]$notes.Add("WARNING exists and differs, left untouched: $($nf.Path)")
    }
  } else {
    [void]$createList.Add(@{ Full = $full; Rel = $nf.Path; Content = $content })
    [void]$notes.Add("will create:     $($nf.Path)")
  }
}

if ($errors.Count -gt 0) {
  Write-Host ''
  Write-Host 'NOTHING WAS CHANGED. These did not match your files:' -ForegroundColor Red
  foreach ($e in $errors) { Write-Host "  - $e" -ForegroundColor Red }
  Write-Host ''
  Write-Host 'Your files differ from the version this script was written against. Send me the file(s) named above.' -ForegroundColor Yellow
  exit 1
}

Write-Host ''
foreach ($n in $notes) { Write-Host "  $n" }

if ($DryRun) {
  Write-Host ''
  Write-Host 'Dry run only - nothing was written.' -ForegroundColor Cyan
  exit 0
}

# ----------------------------------------------------------------------
# Stage 2: back up, then write.
# ----------------------------------------------------------------------
$changedCount = 0
foreach ($rel in $files.Keys) {
  $f = $files[$rel]
  if (-not $f.Changed) { continue }
  $full = Join-Path $root $rel
  $bk = Join-Path $backupRoot $rel
  $bkDir = Split-Path -Parent $bk
  if (-not (Test-Path -LiteralPath $bkDir)) { New-Item -ItemType Directory -Force -Path $bkDir | Out-Null }
  Copy-Item -LiteralPath $full -Destination $bk -Force
  Write-Src $full $f.Text $f.HasBom $f.Crlf
  $changedCount++
}

foreach ($c in $createList) {
  $dir = Split-Path -Parent $c.Full
  if (-not (Test-Path -LiteralPath $dir)) { New-Item -ItemType Directory -Force -Path $dir | Out-Null }
  Write-Src $c.Full $c.Content $false $false
}

Write-Host ''
Write-Host "Done. Edited $changedCount file(s), created $($createList.Count) new file(s)." -ForegroundColor Green
if ($changedCount -gt 0) { Write-Host "Backups of the edited files: $backupRoot" -ForegroundColor Green }
Write-Host ''
Write-Host 'NEXT STEPS' -ForegroundColor Cyan
Write-Host '  1. Supabase SQL editor: run supabase\migrations\20261007120000_payment_policy_stops_scheduling.sql'
Write-Host '  2. npm run dev  and test: a normal order, an order with extra stops, a scheduled order'
Write-Host '  3. Deploy to Vercel'
Write-Host '  4. /ops-terminal/payments: choose Pay first or Not required (default is Not required = today''s behaviour)'
Write-Host '     and switch Scheduled windows on for the pilot vendors there'
