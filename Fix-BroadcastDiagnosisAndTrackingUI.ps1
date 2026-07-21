<#
  Fix-BroadcastDiagnosisAndTrackingUI.ps1
  Compatible with Windows PowerShell 5.1 (no PS7-only syntax used).

  IMPORTANT - READ THIS FIRST:
  I re-verified the dispatch broadcast fix directly against your live
  database. A brand new test order (placed today, over 2.5 hours AFTER the
  fixed code was deployed to production) STILL has zero broadcast rows,
  despite an online, approved, in-range rider existing. The RLS fix from
  last time is correct and is live - something else is now blocking it.

  My leading hypothesis, and the thing you should check FIRST, before
  anything in this script:

    >>> Confirm SUPABASE_SERVICE_ROLE_KEY is set in Vercel's Production
        environment variables (Project Settings -> Environment Variables).
        The dispatch route now uses this key (createAdminClient()) instead
        of a regular session-bound client. If it's missing or wrong, that
        client throws immediately, dispatch fails silently, and - until this
        script's fix below - the vendor would see nothing at all telling
        them so. Get the correct value from your Supabase project settings
        (Project Settings -> API -> service_role secret key, NOT the anon
        key), add/fix it in Vercel, then redeploy.

  I don't have permission to read Vercel's runtime logs directly in this
  session, so I can't see the exact exception - but this script fixes a
  SECOND, confirmed bug I found while investigating, which was independently
  preventing the vendor from ever seeing an error message regardless of
  cause: the dispatch route's error response was shaped differently
  ({ error: "..." }) than its success response ({ success: true, ... }), and
  the frontend's failure check only recognized the success:false shape - so
  a genuine crash (missing env var or otherwise) still showed nothing. Fixed
  both the route (consistent response shape) and the frontend (catches
  either shape now). Once you confirm/fix the env var and redeploy, the next
  test order should show a real error message immediately if anything is
  still wrong, instead of silently sitting in "pending" forever.

  ALSO IN THIS SCRIPT: the active-order/tracking page redesign for the
  waiting-for-rider state - a live-updating search radius (matching the real
  expanding-radius dispatch system), a proper searching animation instead of
  an empty map box, and a Cancel button right there (reusing the same
  cancel-before-accept action already built for the active-orders list).
  Once a rider is matched, it switches back to the full status timeline as
  before.

  Backs up everything to .fix-backup-batch8\ first. Includes a UTF-8 BOM.
  Uses -LiteralPath throughout.

  Run from the ROOT of your local repo clone:
      powershell -ExecutionPolicy Bypass -File .\Fix-BroadcastDiagnosisAndTrackingUI.ps1
#>

$ErrorActionPreference = "Stop"
$root = Get-Location
$backupDir = Join-Path $root ".fix-backup-batch8"
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

Write-Host "`nApplying dispatch error-surfacing fix and the tracking page redesign:" -ForegroundColor Cyan

$patchOld0 = @'
  } catch (err) {
    console.error("Dispatch API Error:", err);
    return NextResponse.json({ error: "System Fault: Dispatch Logic Failed" }, { status: 500 });
  }
}
'@
$patchNew0 = @'
  } catch (err) {
    console.error("Dispatch API Error:", err);
    // Consistent response shape with the success path above - previously
    // this only returned { error }, which the frontend's failure check
    // didn't recognize, so a genuine crash here (e.g. a missing
    // SUPABASE_SERVICE_ROLE_KEY env var making createAdminClient() throw)
    // still showed the vendor nothing at all.
    return NextResponse.json({
      success: false,
      error: "Dispatch failed - couldn't reach nearby riders.",
      message: err.message,
    }, { status: 500 });
  }
}
'@
$patchTarget0 = Get-FullPath "src\app\api\dispatch\route.js"
Patch-File $patchTarget0 $patchOld0 $patchNew0 "dispatch route consistent error shape"

$patchOld1 = @'
    // FIX: this result used to be thrown away entirely - if dispatch failed
    // for any reason (including the RLS bug that silently blocked every
    // broadcast until now), the vendor just watched "searching..." with zero
    // explanation until the 15s poll cycle eventually gave up.
    const firstAttempt = await triggerDispatch();
    if (firstAttempt && firstAttempt.success === false && firstAttempt.message) {
      setError(firstAttempt.message);
    }
'@
$patchNew1 = @'
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
'@
$patchTarget1 = Get-FullPath "src\app\send-package\step-3\page.jsx"
Patch-File $patchTarget1 $patchOld1 $patchNew1 "step-3 catches both error shapes"

$patchOld2 = @'
import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import { createClient } from '@/utils/supabase/client';
import { Loader2, MapPin, Package, CheckCircle2, Clock, MessageCircle, Star, Share2, Printer } from 'lucide-react';
import MapCanvas from '@/components/MapCanvas';
import OrderChat from '@/components/OrderChat';
import ReviewModal from '@/components/ReviewModal';
'@
$patchNew2 = @'
import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { createClient } from '@/utils/supabase/client';
import { Loader2, MapPin, Package, CheckCircle2, Clock, MessageCircle, Star, Share2, Printer, Radar, X, AlertTriangle } from 'lucide-react';
import MapCanvas from '@/components/MapCanvas';
import OrderChat from '@/components/OrderChat';
import ReviewModal from '@/components/ReviewModal';
import { cancelOrder } from '@/app/vendor/active-orders/actions';
'@
$patchTarget2 = Get-FullPath "src\app\tracking\[orderId]\page.jsx"
Patch-File $patchTarget2 $patchOld2 $patchNew2 "tracking page imports"

$patchOld3 = @'
export default function TrackingPage() {
  const { orderId } = useParams();
  const supabase = createClient();
  const [order, setOrder] = useState(null);
  const [isVendorView, setIsVendorView] = useState(false);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [currentUserId, setCurrentUserId] = useState(null);
  const [showChat, setShowChat] = useState(false);
'@
$patchNew3 = @'
export default function TrackingPage() {
  const { orderId } = useParams();
  const router = useRouter();
  const supabase = createClient();
  const [order, setOrder] = useState(null);
  const [isVendorView, setIsVendorView] = useState(false);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [currentUserId, setCurrentUserId] = useState(null);
  const [showChat, setShowChat] = useState(false);
  const [showCancelConfirm, setShowCancelConfirm] = useState(false);
  const [cancelling, setCancelling] = useState(false);
'@
$patchTarget3 = Get-FullPath "src\app\tracking\[orderId]\page.jsx"
Patch-File $patchTarget3 $patchOld3 $patchNew3 "tracking page state"

$patchOld4 = @'
  // --- In progress: live status timeline + map ---
  const currentStepIndex = STATUS_STEPS.indexOf(order.status);
  return (
    <div className="min-h-screen bg-charcoal-950 flex flex-col">
      <div className="h-64 relative">
        {(riderLat && riderLng) ? (
          <MapCanvas markers={[{ lat: riderLat, lng: riderLng, color: 'emerald', type: 'rider' }]} center={{ lat: riderLat, lng: riderLng }} />
        ) : (
          <div className="h-full flex items-center justify-center text-charcoal-500 text-sm">
            <MapPin className="mr-2" size={16} /> Waiting for rider location…
          </div>
        )}
      </div>

      <div className="px-6 py-8 space-y-8">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-charcoal-400 text-[11px] font-black uppercase tracking-widest">Status</p>
            <p className="text-ink font-black text-2xl font-outfit">{STATUS_LABELS[order.status] || order.status}</p>
          </div>
          {isVendorView && (
            <button
              onClick={() => setShowChat(true)}
              className="w-12 h-12 bg-emerald-500/10 border border-emerald-500/20 rounded-2xl flex items-center justify-center text-emerald-500 hover:bg-emerald-500/20 transition-all active:scale-95 shrink-0"
              title="Message rider"
            >
              <MessageCircle size={20} />
            </button>
          )}
        </div>

        <div className="space-y-4">
          {STATUS_STEPS.map((step, i) => (
            <div key={step} className="flex items-center gap-3">
              {i <= currentStepIndex ? <CheckCircle2 className="text-emerald-500" size={18} /> : <Clock className="text-charcoal-600" size={18} />}
              <span className={i <= currentStepIndex ? 'text-ink font-bold text-sm' : 'text-charcoal-600 text-sm'}>{STATUS_LABELS[step]}</span>
            </div>
          ))}
        </div>

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
'@
$patchNew4 = @'
  // --- In progress ---
  const currentStepIndex = STATUS_STEPS.indexOf(order.status);
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
            <button
              onClick={() => setShowCancelConfirm(true)}
              className="w-full py-4 rounded-2xl bg-white/5 border border-white/10 text-red-400 text-xs font-black uppercase tracking-widest hover:bg-red-500/10 hover:border-red-500/20 transition-all"
            >
              Cancel This Order
            </button>
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
  return (
    <div className="min-h-screen bg-charcoal-950 flex flex-col">
      <div className="h-64 relative">
        {(riderLat && riderLng) ? (
          <MapCanvas markers={[{ lat: riderLat, lng: riderLng, color: 'emerald', type: 'rider' }]} center={{ lat: riderLat, lng: riderLng }} />
        ) : (
          <div className="h-full flex items-center justify-center text-charcoal-500 text-sm">
            <MapPin className="mr-2" size={16} /> Waiting for rider location…
          </div>
        )}
      </div>

      <div className="px-6 py-8 space-y-8">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-charcoal-400 text-[11px] font-black uppercase tracking-widest">Status</p>
            <p className="text-ink font-black text-2xl font-outfit">{STATUS_LABELS[order.status] || order.status}</p>
          </div>
          {isVendorView && (
            <button
              onClick={() => setShowChat(true)}
              className="w-12 h-12 bg-emerald-500/10 border border-emerald-500/20 rounded-2xl flex items-center justify-center text-emerald-500 hover:bg-emerald-500/20 transition-all active:scale-95 shrink-0"
              title="Message rider"
            >
              <MessageCircle size={20} />
            </button>
          )}
        </div>

        <div className="space-y-4">
          {STATUS_STEPS.map((step, i) => (
            <div key={step} className="flex items-center gap-3">
              {i <= currentStepIndex ? <CheckCircle2 className="text-emerald-500" size={18} /> : <Clock className="text-charcoal-600" size={18} />}
              <span className={i <= currentStepIndex ? 'text-ink font-bold text-sm' : 'text-charcoal-600 text-sm'}>{STATUS_LABELS[step]}</span>
            </div>
          ))}
        </div>

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
'@
$patchTarget4 = Get-FullPath "src\app\tracking\[orderId]\page.jsx"
Patch-File $patchTarget4 $patchOld4 $patchNew4 "tracking page waiting-for-rider redesign"


if (Test-Path -LiteralPath (Get-FullPath ".git")) {
    Write-Host "`nStaging and committing (not pushing):" -ForegroundColor Cyan
    git add -A
    git commit -m "fix: dispatch route and frontend now share a consistent error response shape so failures are never silent; redesign tracking page waiting-for-rider state with live search radius and cancel"
    Write-Host "`nCommitted locally. Push it yourself when ready:" -ForegroundColor Cyan
    Write-Host "  git push" -ForegroundColor White
} else {
    Write-Host "`nNot a git repo - files were written but not committed." -ForegroundColor Yellow
}

Write-Host "`nDone. Backups are in .fix-backup-batch8\ if needed." -ForegroundColor Green
Write-Host "`n>>> BEFORE testing again: check Vercel Production env vars for SUPABASE_SERVICE_ROLE_KEY (Supabase Project Settings -> API -> service_role key). Add/fix it, redeploy, then place one more test order." -ForegroundColor Yellow
Write-Host ">>> If it still fails after that, the vendor will now see a real error message on screen instead of silence - send me exactly what it says and I can pin down the remaining cause immediately." -ForegroundColor Yellow
