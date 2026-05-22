# NaijaDrops Alignment Validator
Write-Host "
🔍 Scanning codebase for alignment issues...
" -ForegroundColor Cyan

$issues = @()
$warnings = @()

# Scan all JS/JSX files
Get-ChildItem -Path "src" -Recurse -Include "*.jsx", "*.js" | ForEach-Object {
    $content = Get-Content $_.FullName | Out-String
    $file = $_.FullName -replace '^.*\\src\\', 'src/'
    
    # Check for bad patterns
    if ($content -match 'r\.approved') { $issues += "$file - Using 'r.approved' (use 'r.status === RIDER_STATUS.PENDING')" }
    if ($content -match '\.avg_rating') { $issues += "$file - Using 'avg_rating' (use 'rating')" }
    if ($content -match 'recipient_name') { $issues += "$file - Using 'recipient_name' (use 'receiver_name')" }
    if ($content -match 'recipient_phone') { $issues += "$file - Using 'recipient_phone' (use 'receiver_phone')" }
    if ($content -match '@/lib/mapResolver') { $issues += "$file - Imports from deleted lib (use @/utils/MapResolver)" }
    if ($content -match "users\(name\)") { $issues += "$file - Using users(name) (use users(full_name))" }
}

# Display results
Write-Host "=" * 80 -ForegroundColor Cyan
if ($issues.Count -eq 0) {
    Write-Host "✅ ALL CHECKS PASSED - Frontend and backend are aligned!" -ForegroundColor Green
} else {
    Write-Host "❌ FOUND $($issues.Count) ALIGNMENT ISSUES:" -ForegroundColor Red
    $issues | ForEach-Object { Write-Host "   ❌ $_" -ForegroundColor Yellow }
}
Write-Host "=" * 80 -ForegroundColor Cyan
