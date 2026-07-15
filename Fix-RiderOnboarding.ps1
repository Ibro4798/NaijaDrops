<#
  Fix-RiderOnboarding.ps1
  Compatible with Windows PowerShell 5.1 (no PS7-only syntax used).

  What this fixes:
  src/app/rider/layout.jsx wraps EVERY route under /rider/*, including
  /rider/onboarding itself. That layout redirects to /rider/onboarding
  whenever a rider has no row in the `riders` table yet - which is every
  new rider, since the handle_new_user() trigger never creates one.
  Result: a brand-new rider hits /rider/onboarding, the layout redirects
  to /rider/onboarding, which re-triggers the same layout, forever. That's
  the blank page.

  The fix: pull every route that depends on "rider already has a riders
  row" into a route group - src/app/rider/(main)/ - so the redirect-gate
  layout no longer wraps onboarding. Route groups don't change URLs, so
  /rider, /rider/dashboard, /rider/active-job, /rider/earnings, /rider/jobs
  all resolve exactly as before. Only /rider/onboarding is now outside the
  gate, which is the whole point - it's the one page a rider with no row
  needs to be able to reach.

  This script only MOVES files (git mv when the folder is a git repo, plain
  move otherwise). It does not edit the contents of any file. Everything it
  touches is copied to .fix-backup\ first, so you can revert by hand if
  needed.

  Run from the ROOT of your local repo clone:
      cd C:\path\to\NaijaDrops
      powershell -ExecutionPolicy Bypass -File .\Fix-RiderOnboarding.ps1
#>

$ErrorActionPreference = "Stop"
$root = Get-Location
$backupDir = Join-Path $root ".fix-backup"

function Get-FullPath($rel) { return Join-Path $root $rel }

function Backup-Path($full) {
    if (Test-Path $full) {
        $rel = $full.Substring($root.Path.Length).TrimStart('\','/')
        $dest = Join-Path $backupDir $rel
        $destParent = Split-Path $dest -Parent
        if (-not (Test-Path $destParent)) { New-Item -ItemType Directory -Path $destParent -Force | Out-Null }
        Copy-Item $full $dest -Recurse -Force
    }
}

function Test-GitRepo {
    return (Test-Path (Get-FullPath ".git"))
}

function Move-Tracked($relSource, $relDest) {
    $fullSource = Get-FullPath $relSource
    $fullDest = Get-FullPath $relDest

    if (-not (Test-Path $fullSource)) {
        Write-Host "  SKIP (not found): $relSource" -ForegroundColor Yellow
        return
    }
    if (Test-Path $fullDest) {
        Write-Host "  SKIP (destination already exists): $relDest" -ForegroundColor Yellow
        return
    }

    Backup-Path $fullSource

    $destParent = Split-Path $fullDest -Parent
    if (-not (Test-Path $destParent)) { New-Item -ItemType Directory -Path $destParent -Force | Out-Null }

    if (Test-GitRepo) {
        git mv $relSource $relDest
        if ($LASTEXITCODE -ne 0) {
            Write-Host "  git mv failed for $relSource, falling back to plain move" -ForegroundColor Yellow
            Move-Item $fullSource $fullDest -Force
        }
    } else {
        Move-Item $fullSource $fullDest -Force
    }

    Write-Host "  MOVED: $relSource -> $relDest" -ForegroundColor Green
}

# --- Sanity checks -----------------------------------------------------

$riderDir = Get-FullPath "src\app\rider"
if (-not (Test-Path $riderDir)) {
    Write-Host "ERROR: src\app\rider not found. Run this script from the repo root." -ForegroundColor Red
    exit 1
}

$mainGroupRel = "src\app\rider\(main)"
$mainGroupFull = Get-FullPath $mainGroupRel
if (Test-Path $mainGroupFull) {
    Write-Host "ERROR: src\app\rider\(main) already exists. This script has probably already been run." -ForegroundColor Red
    exit 1
}

if (-not (Test-Path $backupDir)) { New-Item -ItemType Directory -Path $backupDir | Out-Null }

Write-Host "`nCreating route group: src\app\rider\(main)\" -ForegroundColor Cyan
New-Item -ItemType Directory -Path $mainGroupFull -Force | Out-Null

Write-Host "`nMoving gated routes into the group (onboarding is left in place, ungated):" -ForegroundColor Cyan

Move-Tracked "src\app\rider\layout.jsx"      "src\app\rider\(main)\layout.jsx"
Move-Tracked "src\app\rider\page.jsx"        "src\app\rider\(main)\page.jsx"
Move-Tracked "src\app\rider\active-job"      "src\app\rider\(main)\active-job"
Move-Tracked "src\app\rider\dashboard"       "src\app\rider\(main)\dashboard"
Move-Tracked "src\app\rider\earnings"        "src\app\rider\(main)\earnings"
Move-Tracked "src\app\rider\jobs"            "src\app\rider\(main)\jobs"

Write-Host "`nVerifying final structure under src\app\rider\:" -ForegroundColor Cyan
Get-ChildItem -Path $riderDir -Recurse -File | ForEach-Object {
    $rel = $_.FullName.Substring($riderDir.Length).TrimStart('\','/')
    Write-Host "  $rel"
}

if (Test-GitRepo) {
    Write-Host "`nStaging and committing (not pushing):" -ForegroundColor Cyan
    git add -A
    git commit -m "fix: move gated rider routes into (main) route group so onboarding is not caught in its own redirect loop"
    Write-Host "`nCommitted locally. Push it yourself when ready:" -ForegroundColor Cyan
    Write-Host "  git push" -ForegroundColor White
} else {
    Write-Host "`nNot a git repo - files were moved but not committed." -ForegroundColor Yellow
}

Write-Host "`nDone. Backups of every moved/original file are in .fix-backup\ if you need to revert." -ForegroundColor Green
Write-Host "Supabase side (onboarding_step column + draft/paused enum values) was already applied directly - nothing to run there." -ForegroundColor Green
