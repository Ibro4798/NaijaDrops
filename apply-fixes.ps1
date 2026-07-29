<#
    NaijaDrops - apply-fixes.ps1
    ------------------------------------------------------------------
    Applies 3 fixes directly to your project files:
      1) Active Orders page: adds a real "Pay Now" button that links
         straight to /payment (the Paystack page) for matched/unpaid orders.
      2) Geolocation: "Use My Location" waits longer for a real device
         reading instead of dropping to an inaccurate IP-based guess.
      3) Dashboard side menu: removes the "Contact Support" email link
         (WhatsApp Help stays).

    Written for Windows PowerShell 5.1 (the version that ships with
    Windows by default) - no PowerShell 7-only syntax is used.

    HOW TO RUN:
      1) Copy this file into the ROOT of your project (the folder that
         contains the "src" folder).
      2) Right-click apply-fixes.ps1 -> "Run with PowerShell"
         OR open PowerShell in that folder and run:
           powershell -ExecutionPolicy Bypass -File .\apply-fixes.ps1
      3) It will tell you, per file, whether it changed something,
         already found it changed, or couldn't find the expected text
         (in which case it won't touch that file, so it's safe to re-run).
#>

$ErrorActionPreference = "Stop"

function Update-FileBlock {
    param(
        [string]$RelativePath,
        [string]$OldBlock,
        [string]$NewBlock,
        [string]$Label
    )

    $fullPath = Join-Path -Path (Get-Location) -ChildPath $RelativePath

    if (-not (Test-Path $fullPath)) {
        Write-Host "[SKIP] $Label - file not found: $RelativePath" -ForegroundColor Yellow
        return
    }

    $content = Get-Content -Raw -Encoding UTF8 -LiteralPath $fullPath

    if ($content.Contains($NewBlock)) {
        Write-Host "[OK]   $Label - already applied, nothing to do." -ForegroundColor Green
        return
    }

    if (-not $content.Contains($OldBlock)) {
        Write-Host "[WARN] $Label - expected original text not found. File may already differ from what this script expects." -ForegroundColor Yellow
        Write-Host "       No changes made to $RelativePath - safe to check it by hand." -ForegroundColor Yellow
        return
    }

    # Back up the original once
    $backupPath = "$fullPath.bak"
    if (-not (Test-Path $backupPath)) {
        Copy-Item -LiteralPath $fullPath -Destination $backupPath
    }

    $updated = $content.Replace($OldBlock, $NewBlock)
    Set-Content -LiteralPath $fullPath -Value $updated -Encoding UTF8 -NoNewline
    Write-Host "[DONE] $Label - updated. Backup saved as $(Split-Path $backupPath -Leaf)" -ForegroundColor Cyan
}

Write-Host ""
Write-Host "NaijaDrops fixes" -ForegroundColor White
Write-Host "----------------"
Write-Host "Run this from your project ROOT (the folder containing 'src')." -ForegroundColor DarkGray
Write-Host ""

# ------------------------------------------------------------------
# FIX 1: Pay Now button on Active Orders page
# ------------------------------------------------------------------
$fix1Old = @'
                  <button
                    onClick={() => router.push(`/tracking/${order.id}`)}
                    className="flex items-center gap-1 text-[10px] font-black uppercase tracking-widest text-emerald-400 hover:text-emerald-300 px-3 py-2 rounded-lg hover:bg-emerald-500/10 transition-all"
                  >
                    Track <ChevronRight size={12} />
                  </button>
'@

$fix1New = @'
                  {order.status === "matched" && order.payment_status !== "paid" ? (
                    <button
                      onClick={() => router.push(`/payment?orderId=${order.id}`)}
                      className="flex items-center gap-1 text-[10px] font-black uppercase tracking-widest bg-emerald-500 hover:bg-emerald-400 text-charcoal-950 px-3 py-2 rounded-lg transition-all active:scale-95"
                    >
                      Pay Now <ChevronRight size={12} />
                    </button>
                  ) : (
                    <button
                      onClick={() => router.push(`/tracking/${order.id}`)}
                      className="flex items-center gap-1 text-[10px] font-black uppercase tracking-widest text-emerald-400 hover:text-emerald-300 px-3 py-2 rounded-lg hover:bg-emerald-500/10 transition-all"
                    >
                      Track <ChevronRight size={12} />
                    </button>
                  )}
'@

Update-FileBlock -RelativePath "src\app\vendor\active-orders\page.jsx" -OldBlock $fix1Old -NewBlock $fix1New -Label "Fix 1: Pay Now button (active-orders)"

# ------------------------------------------------------------------
# FIX 2: Geolocation accuracy
# ------------------------------------------------------------------
$fix2Old = @'
            // FIX 2: extended back from 2500ms to 4500ms. FIX 1's 2500ms window
            // was too short for weak-signal conditions (indoors, cloud cover)
            // to ever produce a 2nd stabilizing ping at all, so most requests
            // in those conditions never got a chance to reach the tier-2 check
            // above - they just timed out early on whatever the first
            // (possibly bad) reading was. 4500ms is a middle ground: still
            // meaningfully faster than the original 5000ms, but leaves enough
            // room for a real 2nd ping to arrive.
            setTimeout(async () => {
                if (locationFound) return;
                cleanup();

                // FIX 2: raised from 200m to 500m. A 200-500m GPS reading is
                // still an order of magnitude better than the ~5000m-accuracy
                // IP fallback below - for last-mile delivery pin placement,
                // "somewhere on the right street" beats "somewhere in the
                // right city." Falling back to IP here was actively making
                // location worse in the exact cases (weak GPS signal) it was
                // meant to rescue.
                if (bestReading && bestReading.accuracy < 500) {
                    resolve(bestReading);
                } else {
                    const ipLoc = await getIPLocation();
                    if (ipLoc) {
                        resolve(ipLoc);
                    } else if (bestReading) {
                        resolve(bestReading); // Use the poor GPS reading if IP fails too
                    } else {
                        // Ultimate fallback: Null or let user know
                        updateStatus("❌ Location failed.");
                        resolve(null);
                    }
                }
            }, 4500); 
'@

$fix2New = @'
            // FIX 3: extended from 4500ms to 12000ms. 4500ms was still too
            // short for a device (especially a laptop/desktop or a phone
            // relying on WiFi-based positioning rather than a cold GPS fix)
            // to ever land a reading tight enough to beat the old 500m
            // threshold below - so most requests were timing out onto the
            // IP fallback by default. That's exactly what made "Use My
            // Location" resolve to essentially random places: ipapi.co
            // resolves mobile connections to the carrier's gateway city,
            // which can be a completely different part of the state (or a
            // different state entirely) from where the device actually is.
            // 12s is still fast enough to not feel broken, but gives real
            // device positioning a genuine chance to report back first.
            setTimeout(async () => {
                if (locationFound) return;
                cleanup();

                // FIX 3: raised from 500m to 2000m, and - more importantly -
                // ANY real device reading is now preferred over the IP
                // fallback, not just ones under this threshold. IP-based
                // geolocation for Nigerian mobile networks is frequently off
                // by tens of kilometers (it locates the ISP's gateway, not
                // the device), so even a coarse device reading (WiFi-based,
                // weak GPS, etc.) is almost always still closer to the truth
                // than falling back to IP. IP is now used only when we truly
                // got nothing from the device at all.
                if (bestReading) {
                    resolve(bestReading);
                } else {
                    const ipLoc = await getIPLocation();
                    if (ipLoc) {
                        resolve(ipLoc);
                    } else {
                        // Ultimate fallback: Null or let user know
                        updateStatus("❌ Location failed.");
                        resolve(null);
                    }
                }
            }, 12000); 
'@

Update-FileBlock -RelativePath "src\utils\geolocation.js" -OldBlock $fix2Old -NewBlock $fix2New -Label "Fix 2: Location accuracy (geolocation.js)"

# ------------------------------------------------------------------
# FIX 3: Remove Contact Support email from vendor side menu
# ------------------------------------------------------------------
$fix3Old = @'
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

$fix3New = @'
           <a href="https://wa.me/2349118267433" target="_blank" className="w-full flex items-center gap-4 p-4 rounded-2xl hover:bg-emerald-500/10 text-emerald-400 transition-all">
'@

Update-FileBlock -RelativePath "src\app\dashboard\page.jsx" -OldBlock $fix3Old -NewBlock $fix3New -Label "Fix 3: Remove Contact Support email"

Write-Host ""
Write-Host "Done. Review the changes (git diff, or the .bak files next to each edited file) before deploying." -ForegroundColor White
Write-Host ""
