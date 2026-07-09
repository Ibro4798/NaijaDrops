<#
  Query-Files.ps1
  Read-only. Prints the full content of the two files that didn't match the fix
  script's patch patterns, with clear markers, so the output can be copy-pasted
  back for precise instructions. Does not modify anything.
  Run from the repo root, same place as Fix-NaijaDrops.ps1.
#>

function Show-File($rel) {
    $full = Join-Path (Get-Location) $rel
    Write-Host "`n===== BEGIN: $rel =====" -ForegroundColor Cyan
    if (Test-Path $full) {
        Get-Content -Path $full -Raw -Encoding UTF8
    } else {
        Write-Host "  (file not found at this path)" -ForegroundColor Red
    }
    Write-Host "===== END: $rel =====`n" -ForegroundColor Cyan
}

Show-File "src/app/api/verify-payment/route.js"
Show-File "src/app/rider/onboarding/page.jsx"
