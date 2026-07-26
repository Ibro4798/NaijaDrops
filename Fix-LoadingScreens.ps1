<#
.SYNOPSIS
  Replaces bare spinners with content-shaped shimmer skeletons on the pages
  that matter most (list/dashboard pages), and adds Next.js loading.jsx
  files for instant navigation feedback. Based on research: skeleton
  screens measurably reduce perceived wait time vs spinners, especially on
  mobile (this is a mobile-first app) - see chat for sources.

  WHAT THIS TOUCHES:
   - globals.css: adds a theme-aware shimmer sweep animation
   - components/ui/Skeleton.jsx: upgraded to use the shimmer (was already
     built but unused anywhere in the app until now)
   - rider dashboard: full shell skeleton (status header + 2 job cards)
   - rider jobs history: header/tabs now render immediately (previously
     hidden behind the spinner too); list area gets matching card skeletons
   - vendor active-orders: spinner -> matching card skeletons
   - vendor history: upgraded from flat pulsing rectangles to skeletons
     that mirror the actual card layout
   - tracking page: spinner -> shell skeleton matching the map+status layout
   - NEW: loading.jsx added for rider/(main), vendor, and tracking/[orderId]
     route segments - Next.js shows these instantly on navigation, before
     the page's own data fetch even starts

  WHAT THIS DELIBERATELY DOES NOT TOUCH: button-level spinners (Save
  Profile, Go Online/Offline, Cancel It, etc). Research is clear these are
  the *correct* pattern for short, discrete actions - only content/list
  loading benefits from skeletons.

  Safe to re-run - each edit is skipped if already applied.

.USAGE
  Run this from the ROOT of the NaijaDrops repo (same folder as package.json):
    .\Fix-LoadingScreens.ps1

  Then review, test, and push:
    git diff
    npm run dev
    git add -A
    git commit -m "Replace spinners with content-shaped skeleton screens"
    git push
#>

$ErrorActionPreference = "Stop"

if (-not (Test-Path ".\package.json") -or -not (Test-Path ".\src\app\globals.css")) {
    Write-Host "ERROR: Run this script from the root of the NaijaDrops repo (folder containing package.json)." -ForegroundColor Red
    exit 1
}

$totalEdits = 0

function Patch-File {
    param($Path, $OldStr, $NewStr, $Label, $AlreadyDoneMarker)
    if (-not (Test-Path -LiteralPath $Path)) {
        Write-Host "WARNING: $Path not found - skipping $Label" -ForegroundColor Red
        return 0
    }
    # Normalize CRLF -> LF before comparing/replacing (Windows editors/git
    # settings can re-save files with different line endings than this
    # script's here-strings use, which otherwise causes silent match
    # failures even when the visible text is identical). Written back as
    # LF too - harmless for Next.js/npm either way.
    $raw = Get-Content -LiteralPath $Path -Raw -Encoding UTF8
    $c = $raw -replace "`r`n", "`n"
    $oldNorm = $OldStr -replace "`r`n", "`n"
    $newNorm = $NewStr -replace "`r`n", "`n"
    if ($c.Contains($AlreadyDoneMarker)) {
        Write-Host "$Label - already applied, skipping" -ForegroundColor Yellow
        return 0
    }
    if (-not $c.Contains($oldNorm)) {
        Write-Host "WARNING: could not find match for '$Label' in $Path - patch it manually, see chat for the block." -ForegroundColor Red
        return 0
    }
    $c = $c.Replace($oldNorm, $newNorm)
    Set-Content -LiteralPath $Path -Value $c -Encoding UTF8 -NoNewline
    Write-Host "$Label - patched" -ForegroundColor Green
    return 1
}

# =============================================================================
# 1. globals.css - shimmer keyframe
# =============================================================================
$oldCss = @'
.leaflet-marker-icon {
    transition: transform 0.3s ease-in-out;
}
'@
$newCss = @'
.leaflet-marker-icon {
    transition: transform 0.3s ease-in-out;
}

/* Skeleton loading shimmer - a sweeping highlight over a static base block.
   Uses mix-blend-mode: overlay so the same gradient reads correctly in both
   light and dark mode (lightens dark blocks, still visible on light ones)
   without needing separate light/dark shimmer colors. */
@keyframes skeleton-shimmer {
    0% { transform: translateX(-100%); }
    100% { transform: translateX(100%); }
}
.skeleton-shimmer {
    position: relative;
    overflow: hidden;
}
.skeleton-shimmer::after {
    content: "";
    position: absolute;
    inset: 0;
    transform: translateX(-100%);
    background: linear-gradient(90deg, transparent, rgba(255, 255, 255, 0.5), transparent);
    mix-blend-mode: overlay;
    animation: skeleton-shimmer 1.8s ease-in-out infinite;
}
'@
$totalEdits += Patch-File ".\src\app\globals.css" $oldCss $newCss "globals.css shimmer keyframe" "skeleton-shimmer"

# =============================================================================
# 2. Skeleton.jsx - use the shimmer
# =============================================================================
$oldSkeleton = @'
export default function Skeleton({ className }) {
  return (
    <div className={`animate-pulse bg-charcoal-700/50 rounded-xl ${className}`}></div>
  );
}
'@
$newSkeleton = @'
export default function Skeleton({ className = "" }) {
  return (
    <div className={`skeleton-shimmer bg-charcoal-700/50 rounded-xl ${className}`}></div>
  );
}
'@
$totalEdits += Patch-File ".\src\components\ui\Skeleton.jsx" $oldSkeleton $newSkeleton "Skeleton.jsx shimmer upgrade" "skeleton-shimmer bg-charcoal"

# =============================================================================
# 3. Rider dashboard - shell skeleton
# =============================================================================
$dashPath = ".\src\app\rider\(main)\dashboard\page.jsx"
$oldDashImport = "import { Loader2 } from 'lucide-react';"
$newDashImport = "import { Loader2 } from 'lucide-react';`nimport Skeleton from '@/components/ui/Skeleton';"
$totalEdits += Patch-File $dashPath $oldDashImport $newDashImport "rider dashboard: import Skeleton" "components/ui/Skeleton'"

$oldDashSpinner = '  if (loading) return <div className="flex justify-center py-20"><Loader2 className="animate-spin text-emerald-500" /></div>;'
$newDashSpinner = @'
  if (loading) {
    return (
      <div className="space-y-8 pb-32">
        <div className="flex items-center justify-between">
          <div className="space-y-2">
            <Skeleton className="h-2.5 w-14" />
            <Skeleton className="h-7 w-24" />
          </div>
          <Skeleton className="h-12 w-32 rounded-2xl" />
        </div>
        <div className="space-y-6">
          {[1, 2].map((i) => (
            <div key={i} className="bg-white/[0.03] border border-white/10 rounded-2xl p-5 space-y-4">
              <div className="flex items-center gap-3">
                <Skeleton className="w-12 h-12 rounded-2xl shrink-0" />
                <div className="flex-1 space-y-2">
                  <Skeleton className="h-2.5 w-1/3" />
                  <Skeleton className="h-4 w-2/3" />
                </div>
              </div>
              <Skeleton className="h-3 w-full" />
              <Skeleton className="h-3 w-4/5" />
              <div className="flex gap-3 pt-2">
                <Skeleton className="h-10 flex-1 rounded-xl" />
                <Skeleton className="h-10 flex-1 rounded-xl" />
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }
'@
$totalEdits += Patch-File $dashPath $oldDashSpinner $newDashSpinner "rider dashboard: shell skeleton" "Skeleton className=`"h-2.5 w-14`""

# =============================================================================
# 4. Rider jobs page - header/tabs render immediately, list gets a skeleton
# =============================================================================
$jobsPath = ".\src\app\rider\(main)\jobs\page.jsx"
$oldJobsImport = @'
import { MapPin, Clock, DollarSign, CheckCircle, AlertCircle } from "lucide-react";
import { useRouter } from "next/navigation";
'@
$newJobsImport = @'
import { MapPin, Clock, DollarSign, CheckCircle, AlertCircle } from "lucide-react";
import { useRouter } from "next/navigation";
import Skeleton from "@/components/ui/Skeleton";
'@
$totalEdits += Patch-File $jobsPath $oldJobsImport $newJobsImport "rider jobs: import Skeleton" "components/ui/Skeleton`""

$oldJobsSpinner = @'
  if (loading) {
    return (
      <div className="min-h-screen bg-black text-ink flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-emerald-500" />
      </div>
    );
  }
'@
$newJobsSpinner = "  // Full-page spinner gate removed - header/tabs render immediately now,`n  // list-level skeleton (below) handles the loading state instead.`n"
$totalEdits += Patch-File $jobsPath $oldJobsSpinner $newJobsSpinner "rider jobs: remove full-page spinner gate" "Full-page spinner gate removed"

$oldJobsList = @'
      {/* Jobs List */}
      {jobs.length > 0 ? (
'@
$newJobsList = @'
      {/* Jobs List */}
      {loading ? (
        <div className="space-y-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="bg-charcoal-900/40 border border-white/5 rounded-2xl p-6">
              <div className="flex items-center gap-2 mb-3">
                <Skeleton className="h-4 w-16 rounded" />
                <Skeleton className="h-3 w-28" />
              </div>
              <div className="flex items-center gap-2 mb-3">
                <Skeleton className="w-4 h-4 rounded-full" />
                <Skeleton className="h-5 w-40" />
              </div>
              <Skeleton className="h-3 w-2/3" />
            </div>
          ))}
        </div>
      ) : jobs.length > 0 ? (
'@
$totalEdits += Patch-File $jobsPath $oldJobsList $newJobsList "rider jobs: list skeleton" "Skeleton className=`"h-4 w-16 rounded`""

# =============================================================================
# 5. Vendor active-orders - spinner -> matching card skeletons
# =============================================================================
$aoPath = ".\src\app\vendor\active-orders\page.jsx"
$oldAoImport = 'import { ArrowLeft, Package, MapPin, Clock, Loader2, X, ChevronRight, AlertTriangle } from "lucide-react";'
$newAoImport = "import { ArrowLeft, Package, MapPin, Clock, Loader2, X, ChevronRight, AlertTriangle } from `"lucide-react`";`nimport Skeleton from `"@/components/ui/Skeleton`";"
$totalEdits += Patch-File $aoPath $oldAoImport $newAoImport "vendor active-orders: import Skeleton" "components/ui/Skeleton`""

$oldAoSpinner = @'
        {loading ? (
          <div className="flex justify-center py-20"><Loader2 className="animate-spin text-emerald-500" /></div>
        ) : orders.length === 0 ? (
'@
$newAoSpinner = @'
        {loading ? (
          <div className="space-y-4">
            {[1, 2, 3].map((i) => (
              <div key={i} className="bg-white/[0.03] border border-white/10 rounded-2xl p-5 space-y-4">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-2">
                    <Skeleton className="w-4 h-4 rounded" />
                    <Skeleton className="h-4 w-32" />
                  </div>
                  <Skeleton className="h-5 w-24 rounded-full" />
                </div>
                <div className="space-y-2">
                  <Skeleton className="h-3 w-4/5" />
                  <Skeleton className="h-3 w-3/5" />
                </div>
                <div className="flex items-center justify-between pt-3 border-t border-white/5">
                  <Skeleton className="h-3 w-14" />
                  <Skeleton className="h-7 w-20 rounded-lg" />
                </div>
              </div>
            ))}
          </div>
        ) : orders.length === 0 ? (
'@
$totalEdits += Patch-File $aoPath $oldAoSpinner $newAoSpinner "vendor active-orders: list skeleton" "Skeleton className=`"w-4 h-4 rounded`""

# =============================================================================
# 6. Vendor history - flat pulse blocks -> structured skeleton
# =============================================================================
$histPath = ".\src\app\vendor\history\page.jsx"
$oldHistImport = @'
import { ArrowLeft, Clock, MapPin, Package, History as HistoryIcon, ChevronRight, Navigation } from 'lucide-react';
import Link from 'next/link';
'@
$newHistImport = @'
import { ArrowLeft, Clock, MapPin, Package, History as HistoryIcon, ChevronRight, Navigation } from 'lucide-react';
import Link from 'next/link';
import Skeleton from '@/components/ui/Skeleton';
'@
$totalEdits += Patch-File $histPath $oldHistImport $newHistImport "vendor history: import Skeleton" "components/ui/Skeleton'"

$oldHist = @'
            {loading ? (
                <div className="space-y-4">
                    {[1, 2, 3, 4].map((i) => (
                        <div key={i} className="bg-white/[0.03] rounded-[2rem] p-6 border border-white/10 h-32 animate-pulse" />
                    ))}
                </div>
            ) : orders.length === 0 ? (
'@
$newHist = @'
            {loading ? (
                <div className="space-y-4">
                    {[1, 2, 3, 4].map((i) => (
                        <div key={i} className="bg-white/[0.03] rounded-[2rem] p-6 border border-white/10 space-y-6">
                            <div className="flex items-start justify-between">
                                <div className="flex items-start gap-4">
                                    <Skeleton className="w-12 h-12 rounded-2xl shrink-0" />
                                    <div className="space-y-2">
                                        <Skeleton className="h-2.5 w-32" />
                                        <Skeleton className="h-5 w-40" />
                                    </div>
                                </div>
                                <div className="flex flex-col items-end gap-2">
                                    <Skeleton className="h-5 w-16 rounded-lg" />
                                    <Skeleton className="h-6 w-20" />
                                </div>
                            </div>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 border-t border-white/5 pt-6">
                                {[1, 2].map((j) => (
                                    <div key={j} className="flex items-center gap-3">
                                        <Skeleton className="w-8 h-8 rounded-lg shrink-0" />
                                        <div className="space-y-1.5 flex-1">
                                            <Skeleton className="h-2.5 w-12" />
                                            <Skeleton className="h-3.5 w-28" />
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    ))}
                </div>
            ) : orders.length === 0 ? (
'@
$totalEdits += Patch-File $histPath $oldHist $newHist "vendor history: structured skeleton" "Skeleton className=`"w-12 h-12 rounded-2xl shrink-0`""

# =============================================================================
# 7. Tracking page - spinner -> shell skeleton
# =============================================================================
$trackPath = ".\src\app\tracking\[orderId]\page.jsx"
$oldTrackImport = @'
import MapCanvas from '@/components/MapCanvas';
import OrderChat from '@/components/OrderChat';
import ReviewModal from '@/components/ReviewModal';
import { cancelOrder } from '@/app/vendor/active-orders/actions';
'@
$newTrackImport = @'
import MapCanvas from '@/components/MapCanvas';
import OrderChat from '@/components/OrderChat';
import ReviewModal from '@/components/ReviewModal';
import { cancelOrder } from '@/app/vendor/active-orders/actions';
import Skeleton from '@/components/ui/Skeleton';
'@
$totalEdits += Patch-File $trackPath $oldTrackImport $newTrackImport "tracking: import Skeleton" "components/ui/Skeleton'"

$oldTrackSpinner = '  if (loading) return <div className="min-h-screen flex items-center justify-center bg-charcoal-950"><Loader2 className="animate-spin text-emerald-500" size={32} /></div>;'
$newTrackSpinner = @'
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
'@
$totalEdits += Patch-File $trackPath $oldTrackSpinner $newTrackSpinner "tracking: shell skeleton" "Skeleton className=`"h-64 w-full rounded-none`""

# =============================================================================
# 8. New loading.jsx files for instant navigation feedback
# =============================================================================
function New-LoadingFile {
    param($Path, $Content, $Label)
    if (Test-Path -LiteralPath $Path) {
        Write-Host "$Label - already exists, skipping" -ForegroundColor Yellow
        return
    }
    $dir = Split-Path $Path -Parent
    if (-not (Test-Path -LiteralPath $dir)) { New-Item -ItemType Directory -Path $dir -Force | Out-Null }
    Set-Content -LiteralPath $Path -Value $Content -Encoding UTF8 -NoNewline
    Write-Host "$Label - created" -ForegroundColor Green
}

$riderLoading = @'
import Skeleton from "@/components/ui/Skeleton";

// Shown instantly on navigation into any /rider/* route while the layout's
// server-side auth/profile check and the page's own data resolve - replaces
// the blank flash that used to happen before anything (even the nav) had
// rendered. Deliberately generic/lightweight per Next.js guidance: this is
// only visible for a moment, so it doesn't try to mirror every page's exact
// layout - each page's own loading state (see dashboard/jobs pages) takes
// over immediately after this for the data-fetch itself.
export default function Loading() {
  return (
    <div className="min-h-screen bg-charcoal-950 p-6 space-y-6">
      <div className="flex items-center justify-between">
        <Skeleton className="h-7 w-32" />
        <Skeleton className="h-10 w-10 rounded-xl" />
      </div>
      <Skeleton className="h-32 w-full rounded-2xl" />
      <Skeleton className="h-32 w-full rounded-2xl" />
    </div>
  );
}
'@
New-LoadingFile ".\src\app\rider\(main)\loading.jsx" $riderLoading "rider/(main)/loading.jsx"

$vendorLoading = @'
import Skeleton from "@/components/ui/Skeleton";

// Shown instantly on navigation into any /vendor/* route while the layout's
// server-side auth check and the page's own data resolve. See the matching
// comment in rider/(main)/loading.jsx - kept deliberately lightweight since
// it's only visible for a moment before each page's own loading state
// (matching that page's real content shape) takes over.
export default function Loading() {
  return (
    <div className="min-h-screen bg-charcoal-900 p-6 space-y-6 max-w-7xl mx-auto w-full">
      <Skeleton className="h-8 w-40" />
      <Skeleton className="h-40 w-full rounded-2xl" />
      <Skeleton className="h-40 w-full rounded-2xl" />
    </div>
  );
}
'@
New-LoadingFile ".\src\app\vendor\loading.jsx" $vendorLoading "vendor/loading.jsx"

$trackingLoading = @'
import Skeleton from "@/components/ui/Skeleton";

// Shown instantly on navigation into /tracking/[orderId] before the page
// component itself has even mounted. The page's own loading state (matching
// its real layout shape) takes over immediately after - see the matching
// skeleton in tracking/[orderId]/page.jsx.
export default function Loading() {
  return (
    <div className="min-h-screen bg-charcoal-950">
      <Skeleton className="h-64 w-full rounded-none" />
      <div className="px-6 py-8 space-y-4">
        <Skeleton className="h-7 w-48" />
        <Skeleton className="h-3 w-64" />
      </div>
    </div>
  );
}
'@
New-LoadingFile ".\src\app\tracking\[orderId]\loading.jsx" $trackingLoading "tracking/[orderId]/loading.jsx"

Write-Host ""
Write-Host "Done. $totalEdits patch(es) applied to existing files, plus any new loading.jsx files created above." -ForegroundColor Green
Write-Host "Next steps:" -ForegroundColor Cyan
Write-Host "  git diff"
Write-Host "  npm run dev    # check rider dashboard, rider job history, vendor active orders, vendor history, and a tracking link"
Write-Host "  git add -A"
Write-Host "  git commit -m `"Replace spinners with content-shaped skeleton screens`""
Write-Host "  git push"
