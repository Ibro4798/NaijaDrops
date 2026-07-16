<#
  Fix-Encoding.ps1
  Compatible with Windows PowerShell 5.1.

  What happened: Fix-NaijaDropsFeatures.ps1 had no UTF-8 byte-order-mark, so
  Windows PowerShell read it using your system's default codepage instead of
  UTF-8. Every special character embedded in that script (naira sign, em-dash,
  bullet, arrow, ellipsis) got misread one byte at a time and written back out
  as garbled text - e.g. "N" + garbage instead of the actual "\u20A6" naira
  symbol on every price shown in the app.

  This script repairs the 7 files that were affected, and uses [char] code
  points (plain ASCII in the script itself) instead of embedding the real
  characters, so it can't suffer the same bug.

  Backs up every file it touches to .fix-backup\ first. Commits locally, does
  not push.

  Run from the ROOT of your local repo clone:
      cd C:\path\to\your\repo
      powershell -ExecutionPolicy Bypass -File .\Fix-Encoding.ps1
#>

$ErrorActionPreference = "Stop"
$root = Get-Location
$backupDir = Join-Path $root ".fix-backup-encoding"
if (-not (Test-Path -LiteralPath $backupDir)) { New-Item -ItemType Directory -Path $backupDir | Out-Null }

# Built from Unicode code points, not literal characters - immune to codepage misreads.
$emdash    = [char]0x2014
$bullet    = [char]0x2022
$rightarrow= [char]0x2192
$ellipsis  = [char]0x2026
$naira     = [char]0x20A6

# The exact mojibake each one turned into (also built from code points, for the same reason).
$mojibakeMap = @(
    @{ Bad = [string]([char]0x00E2 + [char]0x20AC + [char]0x201D); Good = $emdash }      # em-dash
    @{ Bad = [string]([char]0x00E2 + [char]0x20AC + [char]0x00A2); Good = $bullet }      # bullet
    @{ Bad = [string]([char]0x00E2 + [char]0x2020 + [char]0x2019); Good = $rightarrow }  # right arrow
    @{ Bad = [string]([char]0x00E2 + [char]0x20AC + [char]0x00A6); Good = $ellipsis }    # ellipsis
    @{ Bad = [string]([char]0x00E2 + [char]0x201A + [char]0x00A6); Good = $naira }       # naira sign
)

$files = @(
    "src\app\rider\(main)\dashboard\page.jsx",
    "src\app\rider\dashboard\page.jsx",
    "src\app\rider\(main)\active-job\page.jsx",
    "src\app\rider\active-job\page.jsx",
    "src\app\rider\(main)\earnings\page.jsx",
    "src\app\rider\earnings\page.jsx",
    "src\app\ops-terminal\finance\page.jsx",
    "src\components\ReviewModal.jsx",
    "src\app\tracking\[orderId]\page.jsx",
    "src\app\vendor\history\page.jsx"
)

function Get-FullPath($rel) { return Join-Path $root $rel }

function Backup-Path($full) {
    $rel = $full.Substring($root.Path.Length).TrimStart('\','/')
    $dest = Join-Path $backupDir $rel
    $destParent = Split-Path $dest -Parent
    if (-not (Test-Path -LiteralPath $destParent)) { New-Item -ItemType Directory -Path $destParent -Force | Out-Null }
    Copy-Item -LiteralPath $full -Destination $dest -Force
}

Write-Host "`nRepairing corrupted special characters:" -ForegroundColor Cyan

$touched = 0
foreach ($rel in $files) {
    $full = Get-FullPath $rel
    if (-not (Test-Path -LiteralPath $full)) { continue }

    $content = Get-Content -LiteralPath $full -Raw -Encoding UTF8
    $original = $content
    $fixedCount = 0

    foreach ($pair in $mojibakeMap) {
        $count = ([regex]::Matches($content, [regex]::Escape($pair.Bad))).Count
        if ($count -gt 0) {
            $content = $content.Replace($pair.Bad, $pair.Good)
            $fixedCount += $count
        }
    }

    if ($fixedCount -gt 0) {
        Backup-Path $full
        # -Encoding UTF8 in Windows PowerShell 5.1 writes a BOM, which is what we want here -
        # it guarantees this corrected file is read back correctly by everything downstream.
        Set-Content -LiteralPath $full -Value $content -NoNewline -Encoding UTF8
        Write-Host "  FIXED: $rel ($fixedCount characters)" -ForegroundColor Green
        $touched++
    }
}

if ($touched -eq 0) {
    Write-Host "`nNo corrupted characters found. Either this was already fixed, or the file paths in this script don't match your layout." -ForegroundColor Yellow
} else {
    if (Test-Path -LiteralPath (Get-FullPath ".git")) {
        Write-Host "`nStaging and committing (not pushing):" -ForegroundColor Cyan
        git add -A
        git commit -m "fix: repair mojibake from Fix-NaijaDropsFeatures.ps1 missing a UTF-8 BOM (naira sign, em-dash, bullet, arrow, ellipsis)"
        Write-Host "`nCommitted locally. Push it yourself when ready:" -ForegroundColor Cyan
        Write-Host "  git push" -ForegroundColor White
    }
    Write-Host "`nDone. Backups are in .fix-backup-encoding\ if needed." -ForegroundColor Green
}
