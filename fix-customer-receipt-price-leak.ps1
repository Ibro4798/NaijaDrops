<#
  fix-customer-receipt-price-leak.ps1

  The customer tracking link itself is fine - /tracking/[orderId] already
  gates all vendor-only content (pricing, bids, payment) behind isVendorView,
  which is set from an RLS-scoped authenticated fetch (vendor/rider/admin
  only), not a spoofable client flag. Confirmed against the live 'orders'
  SELECT policy before writing this patch.

  The actual leak: once an order hits 'delivered', BOTH vendor and customer
  get redirected to /receipt/[orderId]. The customer branch there was
  already stripped of Share/Download/branding, but it still printed the
  delivery price. This patch:

    1. src/app/receipt/[orderId]/page.jsx
       - Anonymous/customer branch: drop the price, keep just the
         delivered timestamp. Vendor branch is untouched - the vendor
         should still see and be able to share/download their own receipt
         with the price on it.

    2. src/app/api/track/[orderId]/route.js
       - Removes total_price from the public (anonymous) API payload
         entirely. Defense in depth: the customer-facing UI no longer
         needs it, so the anonymous endpoint shouldn't return it.

  Usage:
    Run in an EMPTY folder (does its own fresh clone):
      powershell -ExecutionPolicy Bypass -File .\fix-customer-receipt-price-leak.ps1
    Review 'git diff' inside NaijaDrops_patched, then commit/push/redeploy.

  Safety:
    - Fresh clone only.
    - Every file touched is backed up to <file>.bak_<timestamp> first.
    - Each patch requires an EXACT match count of 1, or the script stops
      and tells you which one failed instead of guessing.
#>

$ErrorActionPreference = "Stop"

$RepoUrl   = "https://github.com/Ibro4798/NaijaDrops.git"
$CloneDir  = "NaijaDrops_patched"
$Stamp     = Get-Date -Format "yyyyMMdd_HHmmss"

function Normalize([string]$s) {
    return $s -replace "`r`n", "`n"
}

function Backup-File([string]$path) {
    $bak = "$path.bak_$Stamp"
    Copy-Item -LiteralPath $path -Destination $bak -Force
    Write-Host "  backed up -> $bak"
}

function Patch-File {
    param(
        [string]$Path,
        [string]$OldStr,
        [string]$NewStr,
        [string]$Label
    )

    Write-Host "Patching: $Label"
    if (-not (Test-Path -LiteralPath $Path)) {
        throw "File not found: $Path"
    }

    $raw = Get-Content -LiteralPath $Path -Raw -Encoding UTF8
    $normRaw = Normalize $raw
    $normOld = Normalize $OldStr

    $count = ([regex]::Matches($normRaw, [regex]::Escape($normOld))).Count
    if ($count -ne 1) {
        throw "Expected exactly 1 match for '$Label' in $Path but found $count. Aborting - source may have changed."
    }

    Backup-File $Path

    $normNew = Normalize $NewStr
    $patchedNorm = $normRaw.Replace($normOld, $normNew)
    $patchedCRLF = $patchedNorm -replace "`n", "`r`n"

    $utf8Bom = New-Object System.Text.UTF8Encoding($true)
    [System.IO.File]::WriteAllText($Path, $patchedCRLF, $utf8Bom)
    Write-Host "  OK`n"
}

Write-Host "== Cloning fresh copy of NaijaDrops ==`n"
if (Test-Path $CloneDir) {
    throw "$CloneDir already exists. Delete it or run this in a clean folder."
}
git clone $RepoUrl $CloneDir
Set-Location $CloneDir

# ---------------------------------------------------------------------------
# 1. src/app/receipt/[orderId]/page.jsx - drop price from customer view
# ---------------------------------------------------------------------------

Patch-File `
  -Path "src\app\receipt\[orderId]\page.jsx" `
  -Label "remove price from anonymous customer receipt view" `
  -OldStr @'
        <p className="text-charcoal-400 text-sm max-w-xs">
          {order.item_description ? `${order.item_description} has` : "Your package has"} been delivered
          {senderName ? ` from ${senderName}` : ""}. Thanks for using NaijaDrops.
        </p>
        <p className="text-charcoal-600 text-xs mt-2">₦{total.toLocaleString()} • {deliveredAt}</p>
'@ `
  -NewStr @'
        <p className="text-charcoal-400 text-sm max-w-xs">
          {order.item_description ? `${order.item_description} has` : "Your package has"} been delivered
          {senderName ? ` from ${senderName}` : ""}. Thanks for using NaijaDrops.
        </p>
        {/* Deliberately no price here - this is the customer's confirmation
            screen, not a receipt. The vendor's price/receipt is a separate
            concern between the vendor and NaijaDrops. */}
        <p className="text-charcoal-600 text-xs mt-2">{deliveredAt}</p>
'@

# ---------------------------------------------------------------------------
# 2. src/app/api/track/[orderId]/route.js - stop returning total_price
# ---------------------------------------------------------------------------

Patch-File `
  -Path "src\app\api\track\[orderId]\route.js" `
  -Label "remove total_price from public tracking API payload" `
  -OldStr @'
    created_at: order.created_at,
    updated_at: order.updated_at,
    total_price: order.status === 'delivered' ? order.agreed_price : null,
    sender_display_name: order.vendors?.users?.receipt_display_name || null,
'@ `
  -NewStr @'
    created_at: order.created_at,
    updated_at: order.updated_at,
    // Deliberately NOT returning total_price / agreed_price here - this is
    // the anonymous customer's endpoint, and the delivery price is between
    // the vendor and NaijaDrops, not something the customer needs to see.
    sender_display_name: order.vendors?.users?.receipt_display_name || null,
'@

Write-Host "`n== All patches applied successfully ==`n"
Write-Host "Files changed:"
Write-Host "  - src/app/receipt/[orderId]/page.jsx"
Write-Host "  - src/app/api/track/[orderId]/route.js"
Write-Host "`nBackups (.bak_$Stamp) sit next to each modified file inside $CloneDir."
Write-Host "Review with 'git diff', then commit and push from $CloneDir when happy."
