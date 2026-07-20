<#
  Fix-DispatchAndFinalPolish.ps1
  Compatible with Windows PowerShell 5.1 (no PS7-only syntax used).

  What this fixes:

  1. JOBS NOT REACHING RIDERS - ROOT CAUSE FOUND AND FIXED
     order_broadcasts has RLS enabled with exactly one policy (riders can
     SELECT their own broadcasts) and NO insert policy at all. The dispatch
     API was running as the calling vendor's own session, so its insert into
     order_broadcasts was being silently rejected by RLS every single time -
     confirmed directly against your database: a real order with an online,
     approved, in-range rider had zero broadcast rows. Fixed by running
     dispatch through the service-role client (same pattern already used for
     admin actions) instead of the RLS-bound one - dispatch is inherently a
     privileged, system-level operation, not something that should depend on
     the requesting vendor's own row permissions. Also fixed: the dispatch
     API's result was being silently discarded on the frontend, so even a
     clear failure message never reached the vendor - now it does.

  2. LAUNCH GATE ON "FIND A DRIVER"
     Every account except ibroibrahim665@gmail.com now sees a popup with the
     launch date (Monday, August 10, 2026) instead of actually dispatching,
     when they tap "Find My Rider." Everything up to that point (signup,
     pickup/dropoff, pricing) works normally - this is a UI-level check, not
     a backend block, since it's not protecting anything sensitive.

  3. LIGHT MODE TEXT VISIBILITY - TWO SEPARATE BUGS
     a) Login page used literal text-white on the page background token
        (which now flips to white by default) - invisible white-on-white.
        Fixed: swapped to the theme-aware ink token, same as the rest of the
        app.
     b) BIGGER FIND: the charcoal-900 color token was flipped for the whole
        site in an earlier round so the authenticated app's cards would go
        light - but charcoal-900 is ALSO used in several components as a
        FIXED dark color on a permanently-light surface (MapModal's confirm
        button - this is your "map page glow button washed out" bug -
        ReviewModal, the marketing pages like Terms/Privacy/About/Pricing/
        FAQ/Contact, and Navbar's own dark-mode logic). Flipping charcoal-900
        broke ALL of those the same way, not just the two you happened to
        spot. Fixed by pinning charcoal-900 back to its original fixed dark
        value specifically within those always-light files, so they render
        exactly as designed regardless of the site theme, while the
        authenticated app pages that correctly need charcoal-900 to flip
        keep doing so.

  4. SUPPORT EMAIL REMOVED, BROKEN WHATSAPP LINK FIXED
     support@naijadrops.tech removed from the Support page and Footer.
     While in there: the Support page's WhatsApp button was pointing at a
     placeholder number (2348000000000) that was never real - fixed to the
     actual number already used correctly in the Footer.

  5. THEME TOGGLE - PROFILE ONLY NOW
     Removed the standalone light/dark toggle button from Navbar (which
     showed on Terms/Privacy/About/FAQ/Contact). The full Light/Dark/System
     picker already lives on the Profile page - no need for a second,
     simpler toggle scattered across marketing pages too.

  6. VENDOR ORDER HISTORY - MOBILE HEADER OVERLAP
     vendor/layout.jsx had its own "Dashboard | History | Sign Out" text nav
     stacked on top of the history page's own back-arrow header - two
     competing nav rows on a small screen. Simplified to a single compact
     dashboard icon, as asked.

  This script writes full file content for rewritten files, does targeted
  find-and-replace for existing files it only needs to touch in part, and
  does a scoped charcoal-900 immunization sweep across a specific list of
  always-light files (listed inline below). Backs up everything to
  .fix-backup-batch7\ first. Includes a UTF-8 BOM. Uses -LiteralPath
  throughout.

  Run from the ROOT of your local repo clone:
      powershell -ExecutionPolicy Bypass -File .\Fix-DispatchAndFinalPolish.ps1
#>

$ErrorActionPreference = "Stop"
$root = Get-Location
$backupDir = Join-Path $root ".fix-backup-batch7"
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

Write-Host "`nApplying dispatch fix, launch gate, light-mode text fixes, and cleanup:" -ForegroundColor Cyan

$content0 = @'
"use client";

import Link from "next/link";
import { MessageCircle, ArrowLeft, Instagram } from "lucide-react";

export default function SupportPage() {
  return (
    <div className="min-h-screen bg-charcoal-950 flex flex-col items-center justify-center px-6 py-24">
      <div className="w-full max-w-md">
        <Link href="/" className="inline-flex items-center gap-2 text-charcoal-500 hover:text-ink text-sm font-bold mb-10 transition-colors">
          <ArrowLeft size={16} /> Back to home
        </Link>

        <h1 className="text-4xl font-black text-ink tracking-tight mb-3">
          Support
        </h1>
        <p className="text-charcoal-400 text-base mb-10 leading-relaxed">
          NaijaDrops is in active pilot in Kano. If you have a question, issue, or feedback — reach us directly.
        </p>

        <div className="space-y-4">
          <a
            href="https://wa.me/message/3756ZAFK6RTTI1"
            target="_blank"
            rel="noopener noreferrer"
            className="w-full flex items-center gap-4 p-5 bg-white/[0.04] border border-white/10 rounded-2xl hover:bg-white/[0.07] transition-all group"
          >
            <div className="w-12 h-12 bg-emerald-500/10 rounded-xl flex items-center justify-center">
              <MessageCircle size={22} className="text-emerald-400" />
            </div>
            <div>
              <div className="text-ink font-black text-sm">WhatsApp Support</div>
              <div className="text-charcoal-500 text-xs font-medium">Fastest response — usually under 1 hour</div>
            </div>
          </a>

          <a
            href="https://www.instagram.com/naija.drops"
            target="_blank"
            rel="noopener noreferrer"
            className="w-full flex items-center gap-4 p-5 bg-white/[0.04] border border-white/10 rounded-2xl hover:bg-white/[0.07] transition-all group"
          >
            <div className="w-12 h-12 bg-emerald-500/10 rounded-xl flex items-center justify-center">
              <Instagram size={22} className="text-emerald-400" />
            </div>
            <div>
              <div className="text-ink font-black text-sm">Instagram</div>
              <div className="text-charcoal-500 text-xs font-medium">@naija.drops</div>
            </div>
          </a>
        </div>

        <p className="text-charcoal-600 text-xs font-medium mt-10 text-center">
          Operating hours: Mon–Sat, 8am–8pm WAT
        </p>
      </div>
    </div>
  );
}
'@
$target0 = Get-FullPath "src\app\support\page.jsx"
Write-FileContent $target0 $content0

$patchOld0 = @'
import { getBestRider } from "@/utils/dispatch";
import { createClient } from "@/utils/supabase/server";
import { NextResponse } from "next/server";

// Section 7: Kano Pilot Geofence (Metropolitan Bounds)
const KANO_BOUNDS = {
  minLat: 11.9000, maxLat: 12.1000,
  minLng: 8.4000, maxLng: 8.6500
};

function isWithinPilotZone(lat, lng) {
  return lat >= KANO_BOUNDS.minLat && lat <= KANO_BOUNDS.maxLat &&
         lng >= KANO_BOUNDS.minLng && lng <= KANO_BOUNDS.maxLng;
}

export async function POST(req) {
  try {
    const { orderId } = await req.json();
    const supabase = await createClient();
'@
$patchNew0 = @'
import { getBestRider } from "@/utils/dispatch";
import { createAdminClient } from "@/utils/supabase/admin";
import { NextResponse } from "next/server";

// Section 7: Kano Pilot Geofence (Metropolitan Bounds)
const KANO_BOUNDS = {
  minLat: 11.9000, maxLat: 12.1000,
  minLng: 8.4000, maxLng: 8.6500
};

function isWithinPilotZone(lat, lng) {
  return lat >= KANO_BOUNDS.minLat && lat <= KANO_BOUNDS.maxLat &&
         lng >= KANO_BOUNDS.minLng && lng <= KANO_BOUNDS.maxLng;
}

export async function POST(req) {
  try {
    const { orderId } = await req.json();
    // FIX: this was the actual root cause of jobs never reaching riders.
    // order_broadcasts has RLS enabled with only a SELECT policy (riders can
    // see their own broadcasts) - there was no INSERT policy at all, so the
    // .upsert() below was being silently rejected by RLS every single time
    // it ran under the calling vendor's own session. Dispatch is inherently
    // a privileged, system-level operation - it shouldn't depend on the
    // requesting vendor's own row permissions - so this now runs with the
    // service-role client, matching how admin actions already work
    // elsewhere in this codebase, rather than trying to write a permissive-
    // enough RLS policy for an operation that was never really "the vendor's
    // own" action to begin with.
    const supabase = createAdminClient();
'@
$patchTarget0 = Get-FullPath "src\app\api\dispatch\route.js"
Patch-File $patchTarget0 $patchOld0 $patchNew0 "dispatch route service-role client"

$patchOld1 = @'
  const [showAuthGate, setShowAuthGate] = useState(false);
'@
$patchNew1 = @'
  const [showAuthGate, setShowAuthGate] = useState(false);
  const [showLaunchGate, setShowLaunchGate] = useState(false);
'@
$patchTarget1 = Get-FullPath "src\app\send-package\step-3\page.jsx"
Patch-File $patchTarget1 $patchOld1 $patchNew1 "step-3 launch gate state"

$patchOld2 = @'
  async function handleFindDriver() {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      // Show auth gate instead of redirecting away
      setShowAuthGate(true);
      return;
    }
    await createOrder();
  }
'@
$patchNew2 = @'
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
    if (user.email !== LAUNCH_GATE_ALLOWED_EMAIL) {
      setShowLaunchGate(true);
      return;
    }
    await createOrder();
  }
'@
$patchTarget2 = Get-FullPath "src\app\send-package\step-3\page.jsx"
Patch-File $patchTarget2 $patchOld2 $patchNew2 "step-3 handleFindDriver launch gate"

$patchOld3 = @'
    await triggerDispatch();

    // Poll every 15 seconds to check status and expand radius if necessary
'@
$patchNew3 = @'
    // FIX: this result used to be thrown away entirely - if dispatch failed
    // for any reason (including the RLS bug that silently blocked every
    // broadcast until now), the vendor just watched "searching..." with zero
    // explanation until the 15s poll cycle eventually gave up.
    const firstAttempt = await triggerDispatch();
    if (firstAttempt && firstAttempt.success === false && firstAttempt.message) {
      setError(firstAttempt.message);
    }

    // Poll every 15 seconds to check status and expand radius if necessary
'@
$patchTarget3 = Get-FullPath "src\app\send-package\step-3\page.jsx"
Patch-File $patchTarget3 $patchOld3 $patchNew3 "step-3 dispatch result surfaced"

$patchOld4 = @'
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

      {/* ✅ NEW: Idle state — shown before user clicks "Find My Driver" */}
'@
$patchNew4 = @'
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
                NaijaDrops launches fully in Kano on <span className="text-ink font-bold">Monday, August 10, 2026</span>.
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
'@
$patchTarget4 = Get-FullPath "src\app\send-package\step-3\page.jsx"
Patch-File $patchTarget4 $patchOld4 $patchNew4 "step-3 launch gate modal"

$patchOld5 = @'
            <button 
              onClick={toggleTheme}
              className="w-10 h-10 flex items-center justify-center text-charcoal-400 dark:text-white hover:text-emerald-500 hover:bg-emerald-50 dark:hover:bg-white/10 rounded-2xl transition-all border border-transparent"
              title="Toggle Theme"
            >
              {theme === 'dark' ? <Sun size={20} /> : <Moon size={20} />}
            </button>

            {profile && (
'@
$patchNew5 = @'
            {profile && (
'@
$patchTarget5 = Get-FullPath "src\components\layout\Navbar.jsx"
Patch-File $patchTarget5 $patchOld5 $patchNew5 "Navbar theme toggle removed"

$patchOld6 = @'
            <div className="flex items-center gap-4">
              <a href="https://www.instagram.com/naija.drops" target="_blank" className="w-10 h-10 bg-white/5 rounded-xl flex items-center justify-center hover:bg-emerald-500 hover:text-white transition-all">
                <Instagram size={20} />
              </a>
              <a href="https://wa.me/message/3756ZAFK6RTTI1" target="_blank" className="w-10 h-10 bg-white/5 rounded-xl flex items-center justify-center hover:bg-emerald-500 hover:text-white transition-all">
                <MessageCircle size={20} />
              </a>
              <a href="mailto:support@naijadrops.tech" className="w-10 h-10 bg-white/5 rounded-xl flex items-center justify-center hover:bg-emerald-500 hover:text-white transition-all">
                <Mail size={20} />
              </a>
            </div>
'@
$patchNew6 = @'
            <div className="flex items-center gap-4">
              <a href="https://www.instagram.com/naija.drops" target="_blank" className="w-10 h-10 bg-white/5 rounded-xl flex items-center justify-center hover:bg-emerald-500 hover:text-white transition-all">
                <Instagram size={20} />
              </a>
              <a href="https://wa.me/message/3756ZAFK6RTTI1" target="_blank" className="w-10 h-10 bg-white/5 rounded-xl flex items-center justify-center hover:bg-emerald-500 hover:text-white transition-all">
                <MessageCircle size={20} />
              </a>
            </div>
'@
$patchTarget6 = Get-FullPath "src\components\layout\Footer.jsx"
Patch-File $patchTarget6 $patchOld6 $patchNew6 "Footer support email removed"

$patchOld7 = @'
import { redirect } from "next/navigation";
import { createClient } from "@/utils/supabase/server";
import SignOutButton from "@/components/ui/SignOutButton";
'@
$patchNew7 = @'
import { redirect } from "next/navigation";
import { createClient } from "@/utils/supabase/server";
import { LayoutDashboard } from "lucide-react";
'@
$patchTarget7 = Get-FullPath "src\app\vendor\layout.jsx"
Patch-File $patchTarget7 $patchOld7 $patchNew7 "vendor layout imports"

$patchOld8 = @'
      <nav className="border-b border-white/10 p-4 sticky top-0 bg-charcoal-900/80 backdrop-blur-md z-50 flex justify-between items-center">
        <div className="font-outfit font-black text-xl italic tracking-tighter">NaijaDrops <span className="text-emerald-500">Vendor</span></div>
        <div className="flex gap-4 items-center text-sm font-bold">
          <a href="/vendor/dashboard" className="hover:text-emerald-400 transition-colors">Dashboard</a>
          <a href="/vendor/history" className="hover:text-emerald-400 transition-colors">History</a>
          <SignOutButton className="text-red-500 hover:text-red-400 transition-colors bg-transparent border-0 p-0 font-bold cursor-pointer">
            Sign Out
          </SignOutButton>
        </div>
      </nav>
'@
$patchNew8 = @'
      <nav className="border-b border-white/10 p-4 sticky top-0 bg-charcoal-900/80 backdrop-blur-md z-50 flex justify-between items-center">
        <div className="font-outfit font-black text-xl italic tracking-tighter">NaijaDrops <span className="text-emerald-500">Vendor</span></div>
        <a href="/vendor/dashboard" title="Dashboard" className="w-10 h-10 flex items-center justify-center text-ink hover:text-emerald-400 hover:bg-white/5 rounded-2xl transition-all">
          <LayoutDashboard size={20} />
        </a>
      </nav>
'@
$patchTarget8 = Get-FullPath "src\app\vendor\layout.jsx"
Patch-File $patchTarget8 $patchOld8 $patchNew8 "vendor layout nav simplified"


Write-Host "`nApplying login page text-white -> text-ink:" -ForegroundColor Cyan
$loginFile = Get-FullPath "src\app\auth\login\page.jsx"
if (Test-Path -LiteralPath $loginFile) {
    $raw = Get-Content -LiteralPath $loginFile -Raw -Encoding UTF8
    if ($raw -match "text-white") {
        Backup-Path $loginFile
        Set-Content -LiteralPath $loginFile -Value ($raw -replace "text-white", "text-ink") -NoNewline -Encoding UTF8
        Write-Host "  RETHEMED: src\app\auth\login\page.jsx" -ForegroundColor Green
    }
}

Write-Host "`nImmunizing charcoal-900 in always-light files (pins it back to its original fixed dark value, regardless of site theme):" -ForegroundColor Cyan
$immunizeFiles = @(
    "src\components\MapModal.jsx",
    "src\components\ReviewModal.jsx",
    "src\components\MiniRouteMap.jsx",
    "src\components\layout\Navbar.jsx",
    "src\app\contact\page.jsx",
    "src\app\terms\page.jsx",
    "src\app\privacy\page.jsx",
    "src\app\about\page.jsx",
    "src\app\pricing\page.jsx",
    "src\app\faq\page.jsx",
    "src\app\payment\page.jsx"
)
foreach ($rel in $immunizeFiles) {
    $full = Get-FullPath $rel
    if (-not (Test-Path -LiteralPath $full)) {
        Write-Host "  SKIP (not found): $rel" -ForegroundColor Yellow
        continue
    }
    $raw = Get-Content -LiteralPath $full -Raw -Encoding UTF8
    if ($raw -match "charcoal-900") {
        Backup-Path $full
        $updated = $raw -replace "charcoal-900", "[#18181b]"
        Set-Content -LiteralPath $full -Value $updated -NoNewline -Encoding UTF8
        Write-Host "  IMMUNIZED: $rel" -ForegroundColor Green
    } else {
        Write-Host "  (no charcoal-900 found, skipped): $rel" -ForegroundColor Yellow
    }
}

if (Test-Path -LiteralPath (Get-FullPath ".git")) {
    Write-Host "`nStaging and committing (not pushing):" -ForegroundColor Cyan
    git add -A
    git commit -m "fix: dispatch broadcast RLS bug (root cause of jobs never reaching riders), pre-launch gate on Find a Driver, light-mode text visibility fixes, remove support email, simplify vendor history nav"
    Write-Host "`nCommitted locally. Push it yourself when ready:" -ForegroundColor Cyan
    Write-Host "  git push" -ForegroundColor White
} else {
    Write-Host "`nNot a git repo - files were written but not committed." -ForegroundColor Yellow
}

Write-Host "`nDone. Backups are in .fix-backup-batch7\ if needed." -ForegroundColor Green
Write-Host "No Supabase changes needed for this batch - the dispatch fix is entirely in the API route's client choice." -ForegroundColor Green
Write-Host "`nStill pending, by design - not rushed into this batch:" -ForegroundColor Yellow
Write-Host "  - The order flow redesign (per-location notes, voice/text toggle, package photo) - queued as its own dedicated pass." -ForegroundColor Yellow
