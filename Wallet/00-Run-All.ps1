param([switch]$Force)
# Runs 01-02 in order, from the repo root:
#   powershell -ExecutionPolicy Bypass -File .\Wallet\00-Run-All.ps1
$ErrorActionPreference = "Stop"
foreach ($n in @("01-Theme-Footer-And-Flash-Fixes.ps1", "02-Customer-Wallet.ps1")) {
    $path = Join-Path $PSScriptRoot $n
    if (-not (Test-Path -LiteralPath $path)) { Write-Host "Missing $n" -ForegroundColor Red; exit 1 }
    & $path -Force:$Force
    if ($null -ne $LASTEXITCODE -and $LASTEXITCODE -ne 0) {
        Write-Host "Stopped at $n (exit code $LASTEXITCODE)." -ForegroundColor Red
        exit $LASTEXITCODE
    }
}
Write-Host ""
Write-Host "All done. Next: npm run build, then deploy." -ForegroundColor Green
