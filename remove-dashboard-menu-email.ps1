# remove-dashboard-menu-email.ps1
# Run from repo root: C:\Users\T450s\Documents\logistics welcome soon page
#
# Removes the "Contact Support" (mailto:yahaya.usama@naijadrops.tech) item
# from the vendor dashboard slide-out menu. WhatsApp Help stays as-is.

$ErrorActionPreference = "Stop"

$target = "src\app\dashboard\page.jsx"

if (-not (Test-Path $target)) {
    Write-Host "ERROR: Cannot find $target — run this script from the repo root." -ForegroundColor Red
    exit 1
}

$content = [System.IO.File]::ReadAllText((Resolve-Path $target))

$old = @'
           <a href="mailto:yahaya.usama@naijadrops.tech" className="w-full flex items-center gap-4 p-4 rounded-2xl hover:bg-white/5 text-charcoal-300 transition-all">
              <div className="w-10 h-10 rounded-xl bg-white/5 flex items-center justify-center">
                <FileText size={20} />
              </div>
              <div className="text-left">
                <div className="font-bold text-sm">Contact Support</div>
                <div className="text-[10px] opacity-60">yahaya.usama@naijadrops.tech</div>
              </div>
           </a>

           <a href="https://wa.me/2349118267433" target="_blank" className="w-full flex items-center gap-4 p-4 rounded-2xl hover:bg-emerald-500/10 text-emerald-400 transition-all">
'@

$new = @'
           <a href="https://wa.me/2349118267433" target="_blank" className="w-full flex items-center gap-4 p-4 rounded-2xl hover:bg-emerald-500/10 text-emerald-400 transition-all">
'@

$count = ([regex]::Matches($content, [regex]::Escape($old))).Count

if ($count -eq 0) {
    Write-Host "ERROR: Expected block not found in $target." -ForegroundColor Red
    Write-Host "The file may have changed since this script was written. No changes made." -ForegroundColor Yellow
    exit 1
}
if ($count -gt 1) {
    Write-Host "ERROR: Expected block found $count times (expected exactly 1). Aborting to avoid ambiguous edit." -ForegroundColor Red
    exit 1
}

# Backup original
$stamp = Get-Date -Format "yyyyMMdd_HHmmss"
Copy-Item $target "$target.bak_$stamp"
Write-Host "Backed up original with .bak_$stamp suffix" -ForegroundColor DarkGray

$updated = $content.Replace($old, $new)
[System.IO.File]::WriteAllText((Resolve-Path $target), $updated, (New-Object System.Text.UTF8Encoding($true)))

Write-Host "Updated $target — Contact Support (email) menu item removed." -ForegroundColor Green
Write-Host ""
Write-Host "Next:" -ForegroundColor Cyan
Write-Host "  git add $target"
Write-Host "  git commit -m 'Remove email contact option from dashboard menu'"
Write-Host "  git push origin main"
