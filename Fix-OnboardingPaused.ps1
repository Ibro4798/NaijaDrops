<#
  Fix-OnboardingPaused.ps1
  Compatible with Windows PowerShell 5.1.

  Fix-AdminAndOnboarding.ps1 patched 7 of 9 files successfully but skipped two
  edits to src\app\rider\onboarding\page.jsx. Cause: that file had never been
  rewritten by any prior script, so it still had the CRLF line endings Windows
  git checkout applies by default. The anchor text in that script was built as
  plain LF, so the exact-match check silently failed and printed a warning
  instead of guessing wrong.

  This script normalizes line endings before matching, so it works regardless
  of CRLF vs LF, then restores CRLF on write only if the file had it originally
  (keeps it consistent with the rest of your Windows checkout).

  Adds paused-status handling to the rider onboarding screen: distinct message,
  reason-on-file box, and routes to /support - previously a paused rider would
  have seen the "resume your draft" flow (the multi-step form again) instead of
  any explanation.

  Run from the ROOT of your local repo clone:
      powershell -ExecutionPolicy Bypass -File .\Fix-OnboardingPaused.ps1
#>

$ErrorActionPreference = "Stop"
$root = Get-Location
$backupDir = Join-Path $root ".fix-backup-onboarding"
if (-not (Test-Path -LiteralPath $backupDir)) { New-Item -ItemType Directory -Path $backupDir | Out-Null }

function Backup-Path($full) {
    $rel = $full.Substring($root.Path.Length).TrimStart('\','/')
    $dest = Join-Path $backupDir $rel
    $destParent = Split-Path $dest -Parent
    if (-not (Test-Path -LiteralPath $destParent)) { New-Item -ItemType Directory -Path $destParent -Force | Out-Null }
    Copy-Item -LiteralPath $full -Destination $dest -Force
}

function Patch-File-LineEndingSafe($targetFull, $oldStrLF, $newStrLF, $label) {
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
        if ($hadCRLF) {
            $normalized = $normalized -replace "`n", "`r`n"
        }
        Set-Content -LiteralPath $targetFull -Value $normalized -NoNewline -Encoding UTF8
        Write-Host "  PATCHED: $label" -ForegroundColor Green
    } elseif ($normalized.Contains($newStrLF)) {
        Write-Host "  ALREADY PATCHED: $label" -ForegroundColor Yellow
    } else {
        Write-Host "  WARNING: anchor text still not found for $label - the file may have changed since this script was written. Send the current content of that file and I will regenerate this." -ForegroundColor Red
    }
}

if (-not (Test-Path -LiteralPath (Join-Path $root "src\app"))) {
    Write-Host "ERROR: src\app not found. Run this script from the repo root." -ForegroundColor Red
    exit 1
}

$onboardingPath = Join-Path $root "src\app\rider\onboarding\page.jsx"
Write-Host "`nPatching rider onboarding page for paused-status handling:" -ForegroundColor Cyan

$patchOld0 = @'
        if (rider.status === 'pending' || rider.status === 'approved') {
          setExistingStatus(rider.status);
        } else if (rider.status === 'rejected') {
          setExistingStatus('rejected');
        } else {
          // status is null/draft - resume the form where they left off
'@
$patchNew0 = @'
        if (rider.status === 'pending' || rider.status === 'approved' || rider.status === 'paused') {
          setExistingStatus(rider.status);
        } else if (rider.status === 'rejected') {
          setExistingStatus('rejected');
        } else {
          // status is null/draft - resume the form where they left off
'@
Patch-File-LineEndingSafe $onboardingPath $patchOld0 $patchNew0 "onboarding loadData paused handling"

$patchOld1 = @'
            <button
              onClick={() => { setExistingStatus(null); setStep(1); }}
              className="w-full max-w-sm bg-emerald-500 hover:bg-emerald-400 text-charcoal-950 font-black py-4 rounded-2xl uppercase text-sm tracking-widest mb-4"
            >
              Update & Resubmit
            </button>
          </>
        )}
        <button
          onClick={() => router.push("/support")}
          className="w-full max-w-sm py-4 bg-white/5 border border-white/10 rounded-2xl text-white font-bold text-sm hover:bg-white/10 transition-all"
        >
          Back to Support
        </button>
'@
$patchNew1 = @'
            <button
              onClick={() => { setExistingStatus(null); setStep(1); }}
              className="w-full max-w-sm bg-emerald-500 hover:bg-emerald-400 text-charcoal-950 font-black py-4 rounded-2xl uppercase text-sm tracking-widest mb-4"
            >
              Update & Resubmit
            </button>
          </>
        )}
        {existingStatus === 'paused' && (
          <>
            <div className="w-24 h-24 bg-amber-500/10 border border-amber-500/20 rounded-full flex items-center justify-center mb-8">
              <AlertCircle className="text-amber-500" size={40} />
            </div>
            <h2 className="text-2xl font-black text-white mb-4 font-outfit">You've Been Paused</h2>
            <p className="text-charcoal-400 text-sm leading-relaxed mb-4 max-w-xs">
              This isn't a rejection - you're still a NaijaDrops rider. Message support below and we'll help resolve it so you can go back online.
            </p>
            {formData.rejection_reason && (
              <div className="w-full max-w-sm bg-amber-500/5 border border-amber-500/10 rounded-2xl p-4 mb-8 text-left">
                <div className="text-[10px] font-black text-amber-400 uppercase tracking-widest mb-1">Reason</div>
                <p className="text-charcoal-300 text-xs">{formData.rejection_reason}</p>
              </div>
            )}
          </>
        )}
        <button
          onClick={() => router.push("/support")}
          className="w-full max-w-sm py-4 bg-white/5 border border-white/10 rounded-2xl text-white font-bold text-sm hover:bg-white/10 transition-all"
        >
          Back to Support
        </button>
'@
Patch-File-LineEndingSafe $onboardingPath $patchOld1 $patchNew1 "onboarding paused render branch"


if (Test-Path -LiteralPath (Join-Path $root ".git")) {
    Write-Host "`nStaging and committing (not pushing):" -ForegroundColor Cyan
    git add -A
    git commit -m "fix: add paused-status handling to rider onboarding screen (CRLF-safe patch)"
    Write-Host "`nCommitted locally. Push it yourself when ready:" -ForegroundColor Cyan
    Write-Host "  git push" -ForegroundColor White
} else {
    Write-Host "`nNot a git repo - file was patched but not committed." -ForegroundColor Yellow
}

Write-Host "`nDone. Backup is in .fix-backup-onboarding\ if needed." -ForegroundColor Green
