<#
  Fix-PackagePhotoAndVendorDispatch.ps1
  Compatible with Windows PowerShell 5.1 (no PS7-only syntax used).

  What this fixes:

  1. RIDER CAN'T SEE THE PACKAGE PHOTO BEFORE ACCEPTING
     src\components\rider\IncomingOrderCard.jsx (the pre-accept job card
     riders see on the dashboard feed) never rendered order.package_photo_url
     at all - the photo only ever showed up later, on the active-job screen,
     after the rider had already accepted. Added a full-scale, uncropped
     (object-contain, not object-cover) preview to the card itself, plus a
     tap-to-expand full-screen viewer, so riders can actually inspect the
     item before committing to the job.

  2. VENDOR-CREATED ORDERS NEVER BROADCAST TO RIDERS
     src\app\vendor\create-delivery\page.jsx inserted the new order row into
     the "orders" table and then redirected straight to /vendor/history - it
     never called POST /api/dispatch. The customer-facing send-package flow
     already does call /api/dispatch after creating its order, which is why
     that path works. Vendor orders were just sitting in the DB as "pending"
     forever with zero order_broadcasts rows, so no rider ever saw them -
     independent of (and in addition to) any RLS/dispatch-route fixes
     already in your codebase. Added the same dispatch trigger right after
     the insert succeeds, non-blocking (the order is still created and the
     vendor still gets routed to history even if the dispatch call itself
     fails - the failure is just logged to the console instead of silently
     swallowed).

  This script does targeted find-and-replace on the two existing files -
  it does not touch anything else. Backs up everything to
  .fix-backup-photodispatch\ first. Includes UTF-8 handling that preserves
  each file's original BOM/CRLF-or-LF state so this can't corrupt encoding.

  Run from the ROOT of your local repo clone:
      powershell -ExecutionPolicy Bypass -File .\Fix-PackagePhotoAndVendorDispatch.ps1
#>

$ErrorActionPreference = "Stop"
$root = Get-Location
$backupDir = Join-Path $root ".fix-backup-photodispatch"
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

    # Read raw bytes so we can detect and preserve a UTF-8 BOM exactly as it
    # was, rather than accidentally adding or stripping one on save.
    $bytes = [System.IO.File]::ReadAllBytes($targetFull)
    $hasBOM = ($bytes.Length -ge 3 -and $bytes[0] -eq 0xEF -and $bytes[1] -eq 0xBB -and $bytes[2] -eq 0xBF)

    $raw = Get-Content -LiteralPath $targetFull -Raw -Encoding UTF8
    # Normalize CRLF -> LF before matching, then restore CRLF on write only if
    # the file had it originally - anchors built as plain LF would otherwise
    # silently fail to match files Windows git checkout had converted to CRLF.
    $hadCRLF = $raw.Contains("`r`n")
    $normalized = $raw -replace "`r`n", "`n"

    if ($normalized.Contains($oldStrLF)) {
        Backup-Path $targetFull
        $normalized = $normalized.Replace($oldStrLF, $newStrLF)
        if ($hadCRLF) { $normalized = $normalized -replace "`n", "`r`n" }

        $enc = New-Object System.Text.UTF8Encoding($hasBOM)
        [System.IO.File]::WriteAllText($targetFull, $normalized, $enc)
        Write-Host "  PATCHED: $label" -ForegroundColor Green
    } elseif ($normalized.Contains($newStrLF)) {
        Write-Host "  ALREADY PATCHED: $label" -ForegroundColor Yellow
    } else {
        Write-Host "  WARNING: anchor text not found for $label - skipped, the file may have changed. Send me its current content and I will regenerate this." -ForegroundColor Red
    }
}

if (-not (Test-Path -LiteralPath (Get-FullPath "src\app"))) {
    Write-Host "ERROR: src\app not found. Run this script from the repo root." -ForegroundColor Red
    exit 1
}

Write-Host "`nApplying package-photo and vendor-dispatch fixes:" -ForegroundColor Cyan

# ---------------------------------------------------------------------------
# FIX 1a: IncomingOrderCard.jsx - add photoExpanded state
# ---------------------------------------------------------------------------
$cardFull = Get-FullPath "src\components\rider\IncomingOrderCard.jsx"

$old1a = @'
import { useState } from 'react';
import { MapPin, Navigation, Clock, Check, Plus, Minus, Package, User, Volume2, ChevronDown, ChevronUp, ChevronRight, Zap, X } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

export default function IncomingOrderCard({ order, onAcceptBase, onCounterOffer, onReject, isEmbedded = false }) {
  const [customOffer, setCustomOffer] = useState(order?.agreed_price ? parseInt(order.agreed_price) : 0);
  const [showDetails, setShowDetails] = useState(false);

  if (!order) return null;
'@

$new1a = @'
import { useState } from 'react';
import { MapPin, Navigation, Clock, Check, Plus, Minus, Package, User, Volume2, ChevronDown, ChevronUp, ChevronRight, Zap, X } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

export default function IncomingOrderCard({ order, onAcceptBase, onCounterOffer, onReject, isEmbedded = false }) {
  const [customOffer, setCustomOffer] = useState(order?.agreed_price ? parseInt(order.agreed_price) : 0);
  const [showDetails, setShowDetails] = useState(false);
  const [photoExpanded, setPhotoExpanded] = useState(false);

  if (!order) return null;
'@

Patch-File $cardFull $old1a $new1a "IncomingOrderCard.jsx - add photoExpanded state"

# ---------------------------------------------------------------------------
# FIX 1b: IncomingOrderCard.jsx - render the package photo before Route
# ---------------------------------------------------------------------------
$old1b = @'
        {/* Route Visualization */}
'@

$new1b = @'
        {/* Package Photo - shown uncropped so the rider can actually inspect
            the item (size, condition, packaging) before accepting, not just
            after. Tapping opens it full-screen. */}
        {order.package_photo_url && (
          <button
            type="button"
            onClick={() => setPhotoExpanded(true)}
            className="w-full mb-8 rounded-2xl overflow-hidden border border-white/10 bg-charcoal-950 block"
          >
            <img
              src={order.package_photo_url}
              alt="Package"
              className="w-full max-h-72 object-contain bg-charcoal-950"
            />
            <div className="flex items-center justify-center gap-1.5 py-2 bg-white/5 text-charcoal-400 text-[9px] font-black uppercase tracking-widest">
              <Package size={11} /> Tap to view full size
            </div>
          </button>
        )}

        {/* Route Visualization */}
'@

Patch-File $cardFull $old1b $new1b "IncomingOrderCard.jsx - render package photo preview"

# ---------------------------------------------------------------------------
# FIX 1c: IncomingOrderCard.jsx - full-screen photo viewer on tap
# ---------------------------------------------------------------------------
$old1c = @'
        </button>
      </div>
    </motion.div>
  );
}
'@

$new1c = @'
        </button>
      </div>

      {/* Full-scale photo viewer - true full size, not object-cover cropped,
          so the rider can actually judge what they're picking up. */}
      <AnimatePresence>
        {photoExpanded && order.package_photo_url && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setPhotoExpanded(false)}
            className="fixed inset-0 z-[200] bg-charcoal-950/95 backdrop-blur-md flex items-center justify-center p-6"
          >
            <button
              onClick={() => setPhotoExpanded(false)}
              className="absolute top-6 right-6 w-10 h-10 bg-white/10 rounded-2xl flex items-center justify-center text-ink"
            >
              <X size={20} />
            </button>
            <img
              src={order.package_photo_url}
              alt="Package full size"
              className="max-w-full max-h-full object-contain rounded-2xl"
              onClick={(e) => e.stopPropagation()}
            />
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
'@

Patch-File $cardFull $old1c $new1c "IncomingOrderCard.jsx - full-screen photo viewer"

# ---------------------------------------------------------------------------
# FIX 2: vendor/create-delivery/page.jsx - actually trigger dispatch
# ---------------------------------------------------------------------------
$vendorFull = Get-FullPath "src\app\vendor\create-delivery\page.jsx"

$old2 = @'
      const { data, error } = await supabase.from('orders').insert(orderData).select().single();
      if (error) throw error;
      
      router.push(`/vendor/history`);
'@

$new2 = @'
      const { data, error } = await supabase.from('orders').insert(orderData).select().single();
      if (error) throw error;

      // FIX: this insert used to be the last step - the order was created
      // but nothing ever told the dispatch engine about it, so it just sat
      // in the DB as "pending" forever and no rider ever saw it. The
      // send-package (customer) flow already calls /api/dispatch after
      // creating its order; the vendor flow needs the same trigger, or
      // vendor-created jobs never broadcast to riders at all.
      try {
        const dispatchRes = await fetch('/api/dispatch', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ orderId: data.id })
        });
        const dispatchJson = await dispatchRes.json();
        if (dispatchJson && (dispatchJson.success === false || dispatchJson.error)) {
          // Order was created successfully either way - surface the dispatch
          // problem but don't block navigation on it, matching how
          // send-package handles the same failure mode.
          console.error('Dispatch failed after order creation:', dispatchJson.message || dispatchJson.error);
        }
      } catch (dispatchErr) {
        console.error('Dispatch request failed:', dispatchErr);
      }

      router.push(`/vendor/history`);
'@

Patch-File $vendorFull $old2 $new2 "vendor/create-delivery/page.jsx - trigger dispatch after order insert"

Write-Host "`nDone. Backups of any changed files are in .fix-backup-photodispatch\" -ForegroundColor Cyan
Write-Host "Review the diffs (git diff) and restart your dev server to see the changes." -ForegroundColor Cyan
