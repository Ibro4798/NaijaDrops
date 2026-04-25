# NaijaDrops Update & Deployment Sync Script
# This script synchronizes the local codebase with the remote repository.

Write-Host "--- Initiating NaijaDrops Tactical Sync ---" -ForegroundColor Cyan

# 1. Pull latest from remote to prevent conflicts
Write-Host "[1/3] Fetching remote state..." -ForegroundColor Gray
git pull origin main

# 2. Add all local modifications
Write-Host "[2/3] Staging local payloads..." -ForegroundColor Gray
git add .

# 3. Create a commit with a timestamped message
$timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
$commitMessage = "Optimization Sync: $timestamp"

Write-Host "[3/3] Committing and pushing to main..." -ForegroundColor Gray
git commit -m "$commitMessage"
git push origin main

if ($LASTEXITCODE -eq 0) {
    Write-Host "`n--- Sync Successful ---" -ForegroundColor Green
    Write-Host "The platform has been updated with the latest optimizations." -ForegroundColor Green
} else {
    Write-Host "`n--- Sync Failed ---" -ForegroundColor Red
    Write-Host "Please check for merge conflicts or connection issues." -ForegroundColor Red
}
