param([switch]$Force)
# Runs scripts 01-07 in order from the root of your NaijaDrops checkout.
# Usage:  powershell -ExecutionPolicy Bypass -File .\PlayStorePrep\00-Apply-All.ps1
$ErrorActionPreference = "Stop"
$scripts = Get-ChildItem -Path $PSScriptRoot -Filter "*.ps1" | Where-Object { $_.Name -match '^0[1-7]-' } | Sort-Object Name
if (-not $scripts -or $scripts.Count -eq 0) { Write-Host "No 01-07 scripts found next to this file." -ForegroundColor Red; exit 1 }
foreach ($s in $scripts) {
    & $s.FullName -Force:$Force
    if ($LASTEXITCODE -ne 0 -and $null -ne $LASTEXITCODE) {
        Write-Host "Stopped at $($s.Name) (exit code $LASTEXITCODE)." -ForegroundColor Red
        exit $LASTEXITCODE
    }
}
Write-Host ""
Write-Host "All done. Next: npm run build, then deploy." -ForegroundColor Green
