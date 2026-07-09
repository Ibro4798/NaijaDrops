<#
  Fix-Commission-15.ps1
  Brings platform commission down from 20% to 15% app-wide, across all files
  the earlier scripts touched. Run from the same repo root as the others.
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

function Patch-File($rel, [string[]]$pairs) {
    $full = Get-FullPath $rel
    if (-not (Test-Path $full)) { Write-Host "  skip (not found): $rel" -ForegroundColor DarkGray; return }
    $content = Read-Utf8 $full
    $original = $content
    for ($i = 0; $i -lt $pairs.Length; $i += 2) {
        if ($content.Contains($pairs[$i])) {
            $content = $content.Replace($pairs[$i], $pairs[$i + 1])
        } else {
            Write-Host "  WARNING: pattern not found in $rel :" -ForegroundColor Yellow
            Write-Host "    $($pairs[$i])" -ForegroundColor Yellow
        }
    }
    if ($content -ne $original) {
        Backup-File $full
        Write-Utf8NoBom $full $content
        Write-Host "  patched: $rel" -ForegroundColor Green
    } else {
        Write-Host "  no change needed: $rel" -ForegroundColor DarkGray
    }
}

Write-Host "Bringing commission to 15% app-wide..." -ForegroundColor Cyan

Patch-File "src/app/rider/earnings/page.jsx" @(
    '* 0.80; // 20% platform commission', '* 0.85; // 15% platform commission',
    'tx.agreed_price * 0.80', 'tx.agreed_price * 0.85'
)

Patch-File "src/app/ops-terminal/finance/page.jsx" @(
    'totalRevenue * 0.20; // 20% commission', 'totalRevenue * 0.15; // 15% commission',
    'gmv * 0.20', 'gmv * 0.15',
    '"20% Take Rate"', '"15% Take Rate"'
)

Patch-File "src/app/tracking/[orderId]/page.jsx" @(
    'order.agreed_price * 0.20', 'order.agreed_price * 0.15',
    'Platform Commission (20%)', 'Platform Commission (15%)'
)

Write-Host "`nDone. Database side (request_withdrawal function) was already updated directly - nothing to run there." -ForegroundColor Cyan
