param([switch]$Force)
# From the repo root:   powershell -ExecutionPolicy Bypass -File .\WalletV2\00-Run-All.ps1
# Step 1 checks EVERY file in EVERY script and changes nothing. Step 2 applies. If step 1 fails, nothing is written.
$ErrorActionPreference = "Stop"
$names = @("01-Theme-Footer-And-Flash-Fixes.ps1", "02-Customer-Wallet.ps1")
foreach ($n in $names) {
    $path = Join-Path $PSScriptRoot $n
    if (-not (Test-Path -LiteralPath $path)) { Write-Host "Missing $n" -ForegroundColor Red; exit 1 }
}
Write-Host "Step 1 of 2: checking (nothing is changed)..." -ForegroundColor Cyan
foreach ($n in $names) {
    & (Join-Path $PSScriptRoot $n) -Check -Force:$Force
    if ($null -ne $LASTEXITCODE -and $LASTEXITCODE -ne 0) {
        Write-Host "Check failed in $n (exit code $LASTEXITCODE). Nothing was changed." -ForegroundColor Red
        exit $LASTEXITCODE
    }
}
Write-Host ""
Write-Host "Step 2 of 2: applying..." -ForegroundColor Cyan
foreach ($n in $names) {
    & (Join-Path $PSScriptRoot $n) -Force:$Force
    if ($null -ne $LASTEXITCODE -and $LASTEXITCODE -ne 0) {
        Write-Host "Stopped at $n (exit code $LASTEXITCODE)." -ForegroundColor Red
        exit $LASTEXITCODE
    }
}
Write-Host ""
Write-Host "All done. Next: npm run build, then deploy." -ForegroundColor Green
