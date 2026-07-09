<#
  NaijaDrops Master Fix Script
  Compatible with Windows PowerShell 5.1 (no PS7-only syntax used).
  Run from the ROOT of your local repo clone:
      cd C:\path\to\NaijaDrops
      powershell -ExecutionPolicy Bypass -File .\Fix-NaijaDrops.ps1
  The script only touches files it finds; nothing is fetched from the network.
  It backs up every file it modifies to .fix-backup\ before writing, so you can
  diff or revert anything by hand if needed.
#>

$ErrorActionPreference = "Stop"
$root = Get-Location
$backupDir = Join-Path $root ".fix-backup"
if (-not (Test-Path $backupDir)) { New-Item -ItemType Directory -Path $backupDir | Out-Null }

function Get-FullPath($rel) { return Join-Path $root $rel }

function Backup-File($full) {
    if (Test-Path $full) {
        $rel = $full.Substring($root.Path.Length).TrimStart('\','/')
        $dest = Join-Path $backupDir $rel
        $destDir = Split-Path $dest -Parent
        if (-not (Test-Path $destDir)) { New-Item -ItemType Directory -Path $destDir -Force | Out-Null }
        Copy-Item $full $dest -Force
    }
}

function Write-Utf8NoBom($full, $content) {
    $enc = New-Object System.Text.UTF8Encoding($false)
    [System.IO.File]::WriteAllText($full, $content, $enc)
}

function Read-Utf8($full) {
    return [System.IO.File]::ReadAllText($full, [System.Text.Encoding]::UTF8)
}

function Get-CharFromCodePoint($n) {
    if ($n -gt 0xFFFF) { return [char]::ConvertFromUtf32($n) }
    return [string]([char]$n)
}

# Every mapping below was derived by direct inspection of the actual corrupted bytes
# in this repo (not a generic guess) - each "Bad" array is the exact sequence of
# Unicode code points produced when the original UTF-8 text was mis-decoded as
# Windows-1252 (browser/WHATWG style, where undefined 1252 slots 0x80-0x9F fall back
# to their raw byte value). Code points are used instead of literal characters so this
# script cannot itself be corrupted by however an older PowerShell reads the .ps1 file.
$mojibakeMap = @(
    @{ Bad = 0xE2,0x201D,0x20AC,0xE2,0x201D,0x20AC; Good = 0x2500,0x2500 }   # ── (double box-draw, 102x)
    @{ Bad = 0xE2,0x20AC,0x201D;                    Good = 0x2014 }          # — em dash (19x)
    @{ Bad = 0xE2,0x153,0x2026;                     Good = 0x2705 }          # ✅ check mark (18x)
    @{ Bad = 0xE2,0x20AC,0xA2;                      Good = 0x2022 }          # • bullet (7x)
    @{ Bad = 0xE2,0x201D,0x20AC;                    Good = 0x2500 }         # ─ single box-draw (5x)
    @{ Bad = 0xC2,0xB1;                             Good = 0xB1 }           # ± plus-minus (3x)
    @{ Bad = 0xE2,0x20AC,0x201C;                     Good = 0x2013 }         # – en dash (3x)
    @{ Bad = 0xE2,0x153,0xA8;                       Good = 0x2728 }          # ✨ sparkles (3x)
    @{ Bad = 0xF0,0x178,0x178,0xA2;                 Good = 0x1F7E2 }        # 🟢 green circle (2x)
    @{ Bad = 0xF0,0x178,0x161,0x2122;               Good = 0x1F699 }        # 🚙 car (1x)
    @{ Bad = 0xF0,0x178,0x17D,0x2030;               Good = 0x1F389 }        # 🎉 party (1x)
    @{ Bad = 0xE2,0x161,0xAB;                       Good = 0x26AB }         # ⚫ black circle (1x)
    @{ Bad = 0xF0,0x178,0x17D,0x2019;               Good = 0x1F392 }        # 🎒 backpack (1x)
    @{ Bad = 0xF0,0x178,0x201C,0xA6;                Good = 0x1F4E6 }        # 📦 package (1x)
    @{ Bad = 0xF0,0x178,0x17D,0xAF;                 Good = 0x1F3AF }        # 🎯 target (1x)
    @{ Bad = 0xE2,0x2020,0x0090;                    Good = 0x2190 }         # ← left arrow (3x)
    @{ Bad = 0xE2,0x00AD,0x0090;                    Good = 0x2B50 }         # ⭐ star (1x)
    @{ Bad = 0xE2,0x161,0x00A0,0xEF,0xB8,0x008F;    Good = 0x26A0,0xFE0F }  # ⚠️ warning (3x, both variants share this shape)
    @{ Bad = 0xE2,0x009D,0x152;                     Good = 0x274C }         # ❌ cross mark (1x)
    @{ Bad = 0xF0,0x178,0x008F,0x008D,0xEF,0xB8,0x008F; Good = 0x1F3CD,0xFE0F } # 🏍️ motorcycle (4x)
    @{ Bad = 0xF0,0x178,0x152,0x008D;               Good = 0x1F30D }        # 🌍 globe (1x)
    @{ Bad = 0xF0,0x178,0x203A,0xB0,0xEF,0xB8,0x008F; Good = 0x1F6F0,0xFE0F } # 🛰️ satellite (1x)
    @{ Bad = 0xF0,0x178,0x2014,0x192,0xEF,0xB8,0x008F; Good = 0x1F5C3,0xFE0F } # 🗃️ card index dividers (1x)
    @{ Bad = 0xE2,0x161,0x00A0,0xEF,0xB8;            Good = 0x26A0,0xFE0F }  # ⚠️ warning (shorter variant, no trailing control byte)
)

function Fix-Mojibake($rel) {
    $full = Get-FullPath $rel
    if (-not (Test-Path $full)) { Write-Host "  skip (not found): $rel" -ForegroundColor DarkGray; return }
    $content = Read-Utf8 $full
    $original = $content
    foreach ($entry in $mojibakeMap) {
        $badStr = ($entry.Bad | ForEach-Object { Get-CharFromCodePoint $_ }) -join ''
        $goodStr = ($entry.Good | ForEach-Object { Get-CharFromCodePoint $_ }) -join ''
        if ($content.Contains($badStr)) {
            $content = $content.Replace($badStr, $goodStr)
        }
    }
    if ($content -ne $original) {
        Backup-File $full
        Write-Utf8NoBom $full $content
        Write-Host "  fixed encoding: $rel" -ForegroundColor Green
    } else {
        Write-Host "  no change needed: $rel" -ForegroundColor DarkGray
    }
}

function Patch-File($rel, [string[]]$findReplacePairs) {
    # $findReplacePairs is a flat array: find1, replace1, find2, replace2, ...
    $full = Get-FullPath $rel
    if (-not (Test-Path $full)) { Write-Host "  skip (not found): $rel" -ForegroundColor DarkGray; return }
    $content = Read-Utf8 $full
    $original = $content
    for ($i = 0; $i -lt $findReplacePairs.Length; $i += 2) {
        $find = $findReplacePairs[$i]
        $replace = $findReplacePairs[$i + 1]
        if ($content.Contains($find)) {
            $content = $content.Replace($find, $replace)
        } else {
            Write-Host "  WARNING: pattern not found in $rel (may already be fixed or file changed):" -ForegroundColor Yellow
            Write-Host "    $find" -ForegroundColor Yellow
        }
    }
    if ($content -ne $original) {
        Backup-File $full
        Write-Utf8NoBom $full $content
        Write-Host "  patched: $rel" -ForegroundColor Green
    }
}

function Remove-DeadFile($rel) {
    $full = Get-FullPath $rel
    if (Test-Path $full) {
        Backup-File $full
        Remove-Item $full -Force
        Write-Host "  deleted: $rel" -ForegroundColor Green
    } else {
        Write-Host "  already absent: $rel" -ForegroundColor DarkGray
    }
}

# ============================================================
# STEP 1: Global mojibake fix (encoding corruption)
# ============================================================
Write-Host "`n[1/8] Fixing character encoding corruption..." -ForegroundColor Cyan
$mojibakeFiles = @(
    "src/components/TrackingMap.jsx",
    "src/components/OrderChat.jsx",
    "src/app/auth/login/page.jsx",
    "src/app/select-mode/page.jsx",
    "src/app/ops-terminal/dashboard/page.jsx",
    "src/app/api/admin/delete-user/route.js",
    "src/app/api/admin/invite-rider/route.js",
    "src/app/contact/page.jsx",
    "src/app/support/page.jsx",
    "src/app/rider/earnings/page.jsx",
    "src/app/rider/active-job/page.jsx",
    "src/app/rider/onboarding/page.jsx",
    "src/app/rider/dashboard/page.jsx",
    "src/app/send-package/confirm/page.jsx",
    "src/app/send-package/step-3/page.jsx",
    "src/app/send-package/step-2/page.jsx",
    "src/app/vendor/create-delivery/page.jsx",
    "src/app/vendor/history/page.jsx",
    "src/app/dashboard/page.jsx",
    "src/app/pricing/page.jsx",
    "src/utils/auth.js",
    "src/utils/geolocation.js",
    "src/utils/check_user.js"
)
foreach ($f in $mojibakeFiles) { Fix-Mojibake $f }

# ============================================================
# STEP 2: Fix mode= URL param on login page (next= already fixed)
# ============================================================
Write-Host "`n[2/8] Fixing signup/login mode= param..." -ForegroundColor Cyan
Patch-File "src/app/auth/login/page.jsx" @(
    'const [mode, setMode] = useState("login");',
    'const [mode, setMode] = useState("login"); // overridden below from ?mode='
)
# Insert a mode-from-URL effect right after nextParam is read
Patch-File "src/app/auth/login/page.jsx" @(
    'const nextParam = searchParams.get("next");',
    @'
const nextParam = searchParams.get("next");
  useEffect(() => {
    const urlMode = searchParams.get("mode");
    if (urlMode === "signup" || urlMode === "login" || urlMode === "reset") {
      setMode(urlMode);
    }
  }, [searchParams]);
'@
)
# Make sure useEffect is imported
Patch-File "src/app/auth/login/page.jsx" @(
    'import { useState',
    'import { useEffect, useState'
)

# ============================================================
# STEP 3: Fix invalid order status literals ('assigned' / 'accepted' -> 'matched')
# ============================================================
Write-Host "`n[3/8] Fixing invalid order status values..." -ForegroundColor Cyan

Patch-File "src/app/rider/active-job/page.jsx" @(
    ".in('status', ['assigned', 'picked_up', 'in_transit'])",
    ".in('status', ['matched', 'picked_up', 'in_transit'])",
    "const isHeadingToPickup = order.status === 'assigned';",
    "const isHeadingToPickup = order.status === 'matched';",
    "{order.status === 'assigned' && (",
    "{order.status === 'matched' && ("
)

Patch-File "src/app/ops-terminal/dashboard/page.jsx" @(
    '.in("status", ["assigned", "picked_up", "in_transit"])',
    '.in("status", ["matched", "picked_up", "in_transit"])'
)

Patch-File "src/app/dashboard/page.jsx" @(
    '["pending", "assigned", "picked_up", "in_transit"]',
    '["pending", "matched", "picked_up", "in_transit"]'
)

Patch-File "src/app/rider/jobs/page.jsx" @(
    'case "assigned":',
    'case "matched":',
    '["all", "assigned", "completed", "cancelled"]',
    '["all", "matched", "completed", "cancelled"]'
)

# verify-payment route: 'accepted' is not a legal status either, and delivery_pin/payment_status
# are the real signal for "paid" -- don't touch order.status here at all, just payment_status + pin.
Patch-File "src/app/api/verify-payment/route.js" @(
    @'
    if (order.status === 'accepted') {
        return NextResponse.json({ success: true, message: 'Already marked as accepted' });
    }
'@,
    @'
    if (order.payment_status === 'paid') {
        return NextResponse.json({ success: true, message: 'Already marked as paid' });
    }
'@,
    @'
        .update({
            status: 'accepted',
            payment_status: 'paid',
            delivery_pin: generatedPin
        })
        .eq('id', orderId);

    if (updateErr) throw updateErr;
'@,
    @'
        .update({
            payment_status: 'paid',
            delivery_pin: generatedPin
        })
        .eq('id', orderId);

    if (updateErr) throw updateErr;
'@,
    @'
     const { error: updateErr } = await supabaseAdmin
        .from('orders')
        .update({
            status: 'accepted',
            payment_status: 'paid',
            delivery_pin: generatedPin
        })
        .eq('id', orderId);

    if (updateErr) return NextResponse.json({ error: 'Simulated update failed', details: updateErr }, { status: 500 });
'@,
    @'
     const { error: updateErr } = await supabaseAdmin
        .from('orders')
        .update({
            payment_status: 'paid',
            delivery_pin: generatedPin
        })
        .eq('id', orderId);

    if (updateErr) return NextResponse.json({ error: 'Simulated update failed', details: updateErr }, { status: 500 });
'@
)

# ============================================================
# STEP 4: Delete orphaned dead code
# ============================================================
Write-Host "`n[4/8] Removing orphaned dead files..." -ForegroundColor Cyan
Remove-DeadFile "src/components/rider/ActiveTripPanel.jsx"

# ============================================================
# STEP 5: Fix rider onboarding rejected-state redirect
# ============================================================
Write-Host "`n[5/8] Fixing rider onboarding rejected-state redirect..." -ForegroundColor Cyan
Patch-File "src/app/rider/onboarding/page.jsx" @(
    "router.push('/dashboard')",
    "router.push('/support')"
)

# ============================================================
# STEP 6: Fix commission rate + IncomingOrderCard missing import
# ============================================================
Write-Host "`n[6/8] Fixing commission rate and IncomingOrderCard import..." -ForegroundColor Cyan
Patch-File "src/app/rider/earnings/page.jsx" @(
    '* 0.85',
    '* 0.80'
)
Patch-File "src/components/rider/IncomingOrderCard.jsx" @(
    "import { MapPin, Navigation, Clock, Check, Plus, Minus, Package, User, Volume2, ChevronDown, ChevronUp, Zap, X } from 'lucide-react';",
    "import { MapPin, Navigation, Clock, Check, Plus, Minus, Package, User, Volume2, ChevronDown, ChevronUp, ChevronRight, Zap, X } from 'lucide-react';"
)

Write-Host "`n[7/8] Manual-build items (too complex/risky for blind text-replace):" -ForegroundColor Magenta
Write-Host @"
  The following need real code written, not mechanical find/replace. Full replacement
  file content for each is provided separately below this script (see the accompanying
  .txt files this script expects in a 'manual-build' folder next to it):
    - src/app/rider/dashboard/page.jsx        (unify with bid/broadcast model)
    - src/app/tracking/[orderId]/page.jsx     (real tracking + receipt page)
    - src/app/api/track/[orderId]/route.js    (new: scoped public tracking API)
    - src/app/rider/earnings/page.jsx         (Withdraw Funds modal wiring)
    - src/app/ops-terminal/finance/page.jsx   (withdrawal approval UI)
  If a 'manual-build' folder is present next to this script, it will now copy those
  files into place automatically.
"@ -ForegroundColor Magenta

$manualDir = Join-Path $root "manual-build"
if (Test-Path $manualDir) {
    $mapping = @{
        "rider-dashboard.jsx"      = "src/app/rider/dashboard/page.jsx";
        "tracking-page.jsx"        = "src/app/tracking/[orderId]/page.jsx";
        "track-api-route.js"       = "src/app/api/track/[orderId]/route.js";
        "rider-earnings.jsx"       = "src/app/rider/earnings/page.jsx";
        "ops-finance.jsx"          = "src/app/ops-terminal/finance/page.jsx";
        "PendingWithdrawals.jsx"   = "src/app/ops-terminal/finance/PendingWithdrawals.jsx";
    }
    foreach ($key in $mapping.Keys) {
        $src = Join-Path $manualDir $key
        $destRel = $mapping[$key]
        $dest = Get-FullPath $destRel
        if (Test-Path $src) {
            $destDir = Split-Path $dest -Parent
            if (-not (Test-Path $destDir)) { New-Item -ItemType Directory -Path $destDir -Force | Out-Null }
            Backup-File $dest
            Copy-Item $src $dest -Force
            Write-Host "  installed: $destRel" -ForegroundColor Green
        }
    }
} else {
    Write-Host "  'manual-build' folder not found next to script - skipping step 8." -ForegroundColor DarkGray
}

Write-Host "`n[8/8] Done." -ForegroundColor Cyan
Write-Host "Backups of every changed file are in .fix-backup\ (mirrors repo structure)." -ForegroundColor Cyan
Write-Host "Review the WARNING lines above (if any) - they mean a pattern was already fixed or the file has since changed." -ForegroundColor Yellow
Write-Host "Next: git diff, test locally, then commit." -ForegroundColor Cyan
