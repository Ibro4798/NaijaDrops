<#
  Fix-Remaining.ps1
  Fixes the 2 files the main Fix-NaijaDrops.ps1 script missed, using patterns
  verified directly against your actual file content (pasted back to me).
  Uses regex with \r?\n so it works regardless of CRLF/LF line endings.
  Run from the same repo root as the other scripts.
#>

$ErrorActionPreference = "Stop"
$root = Get-Location
$backupDir = Join-Path $root ".fix-backup"
if (-not (Test-Path $backupDir)) { New-Item -ItemType Directory -Path $backupDir | Out-Null }

function Get-FullPath($rel) { return Join-Path $root $rel }

function Backup-File($full) {
    $rel = $full.Substring($root.Path.Length).TrimStart('\','/')
    $dest = Join-Path $backupDir $rel
    $destDir = Split-Path $dest -Parent
    if (-not (Test-Path $destDir)) { New-Item -ItemType Directory -Path $destDir -Force | Out-Null }
    Copy-Item $full $dest -Force
}

function Write-Utf8NoBom($full, $content) {
    $enc = New-Object System.Text.UTF8Encoding($false)
    [System.IO.File]::WriteAllText($full, $content, $enc)
}

function Read-Utf8($full) {
    return [System.IO.File]::ReadAllText($full, [System.Text.Encoding]::UTF8)
}

# ============================================================
# Fix 1: verify-payment/route.js
# ============================================================
$rel1 = "src/app/api/verify-payment/route.js"
$full1 = Get-FullPath $rel1
if (Test-Path $full1) {
    $content = Read-Utf8 $full1
    $original = $content

    # Single-line replacements (safe regardless of line endings)
    $content = $content.Replace(
        "if (order.status === 'accepted') {",
        "if (order.payment_status === 'paid') {"
    )
    $content = $content.Replace(
        "message: 'Already marked as accepted'",
        "message: 'Already marked as paid'"
    )

    # Remove both occurrences of the invalid "status: 'accepted'," line entirely,
    # including its own line ending - regex handles CRLF or LF either way.
    $content = [regex]::Replace($content, "[ \t]*status: 'accepted',\r?\n", "")

    if ($content -ne $original) {
        Backup-File $full1
        Write-Utf8NoBom $full1 $content
        Write-Host "patched: $rel1" -ForegroundColor Green
    } else {
        Write-Host "no change made (patterns not found) in $rel1 - paste content again if this persists" -ForegroundColor Yellow
    }
} else {
    Write-Host "not found: $rel1" -ForegroundColor Red
}

# ============================================================
# Fix 2: rider/onboarding/page.jsx
# ============================================================
$rel2 = "src/app/rider/onboarding/page.jsx"
$full2 = Get-FullPath $rel2
if (Test-Path $full2) {
    $content = Read-Utf8 $full2
    $original = $content

    # Real file uses double quotes: router.push("/dashboard")
    $content = $content.Replace(
        'router.push("/dashboard")',
        'router.push("/support")'
    )

    if ($content -ne $original) {
        Backup-File $full2
        Write-Utf8NoBom $full2 $content
        Write-Host "patched: $rel2" -ForegroundColor Green
    } else {
        Write-Host "no change made (pattern not found) in $rel2 - paste content again if this persists" -ForegroundColor Yellow
    }
} else {
    Write-Host "not found: $rel2" -ForegroundColor Red
}

Write-Host "`nDone. Backups (if any changes were made) are in .fix-backup\" -ForegroundColor Cyan
