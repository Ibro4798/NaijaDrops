# fix-paystack-stuck-loading.ps1
# Run from repo root: C:\Users\T450s\Documents\logistics welcome soon page
#
# Fixes the actual "click Pay Now and nothing happens" symptom.
#
# The code already detects when Paystack's script fails to load (ad-blocker,
# flaky connection, anything blocking https://js.paystack.co/v1/inline.js)
# and shows an error after 8 seconds - but the "Pay Now" button itself just
# stayed stuck on "Loading Secure Gateway..." forever with no way to try
# again short of a full page reload. Clicking a permanently-disabled button
# looks exactly like "nothing happens."
#
# Adds a working Retry button that re-attempts loading the gateway in place.
#
# This does NOT fix a network/ad-blocker actually blocking Paystack's script
# in the first place - if Retry keeps failing, check (in this order):
#   1. Disable any ad-blocker/privacy extension for this site and retry
#   2. Try a different network (mobile data vs wifi) or browser
#   3. Open DevTools Console (F12) when it fails and check for a red error
#      mentioning "paystack" or a blocked/failed network request

$ErrorActionPreference = "Stop"

$paymentPath = "src\app\payment\page.jsx"

if (-not (Test-Path $paymentPath)) {
    Write-Host "ERROR: Cannot find $paymentPath — run this script from the repo root." -ForegroundColor Red
    exit 1
}

$stamp = Get-Date -Format "yyyyMMdd_HHmmss"
Copy-Item $paymentPath "$paymentPath.bak_$stamp"
Write-Host "Backed up $paymentPath with .bak_$stamp suffix" -ForegroundColor DarkGray

function Normalize($s) {
    return $s -replace "`r`n", "`n" -replace "`r", "`n"
}

function Patch-File($path, $old, $new, $label) {
    $raw = [System.IO.File]::ReadAllText((Resolve-Path $path))
    $content = Normalize $raw
    $oldN = Normalize $old
    $newN = Normalize $new

    $count = ([regex]::Matches($content, [regex]::Escape($oldN))).Count
    if ($count -eq 0) {
        Write-Host "ERROR: Expected block not found in $path ($label). File may have changed. No changes made to this file." -ForegroundColor Red
        exit 1
    }
    if ($count -gt 1) {
        Write-Host "ERROR: Expected block found $count times in $path ($label). Aborting to avoid ambiguous edit." -ForegroundColor Red
        exit 1
    }
    $updated = $content.Replace($oldN, $newN)
    [System.IO.File]::WriteAllText((Resolve-Path $path), $updated, (New-Object System.Text.UTF8Encoding($true)))
    Write-Host "Patched $path ($label)" -ForegroundColor Green
}

$old1 = @'
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (!orderId) {
            router.push('/send');
            return;
        }

        async function fetchPaymentDetails() {
            loadPaystackScript().then((ok) => {
                setPaystackReady(!!ok);
                setPaystackLoadFailed(!ok);
            });
            // Safety net: if the script request itself never fires onload or
            // onerror at all (e.g. blocked entirely by an ad/tracker
            // blocker rather than cleanly failing), the button would
            // otherwise be stuck on "Loading Secure Gateway..." forever
            // with no way forward.
            setTimeout(() => {
                setPaystackReady((ready) => {
                    if (!ready) setPaystackLoadFailed(true);
                    return ready;
                });
            }, 8000);
            
            try {
'@
$new1 = @'
    const [loading, setLoading] = useState(true);

    // FIX: this used to be inlined directly in the mount effect below with
    // no way to run it again - if the Paystack script genuinely failed to
    // load (ad-blocker, flaky connection, anything blocking a third-party
    // script), the "Couldn't load the payment gateway" error would show,
    // but the only way forward was a full page reload, and the "Pay Now"
    // button itself just stayed on "Loading Secure Gateway..." forever with
    // no click doing anything - which is exactly what looks like "I click
    // it and nothing happens." Pulling this out into its own function lets
    // the retry button below re-run the exact same load attempt in place.
    const attemptLoadPaystack = () => {
        setPaystackLoadFailed(false);
        loadPaystackScript().then((ok) => {
            setPaystackReady(!!ok);
            setPaystackLoadFailed(!ok);
        });
        // Safety net: if the script request itself never fires onload or
        // onerror at all (e.g. blocked entirely by an ad/tracker
        // blocker rather than cleanly failing), the button would
        // otherwise be stuck on "Loading Secure Gateway..." forever
        // with no way forward.
        setTimeout(() => {
            setPaystackReady((ready) => {
                if (!ready) setPaystackLoadFailed(true);
                return ready;
            });
        }, 8000);
    };

    useEffect(() => {
        if (!orderId) {
            router.push('/send');
            return;
        }

        async function fetchPaymentDetails() {
            attemptLoadPaystack();

            try {
'@
Patch-File $paymentPath $old1 $new1 "extract attemptLoadPaystack for reuse"

$old2 = @'
                                {paystackLoadFailed && (
                                    <div className="flex items-start gap-2.5 p-4 bg-red-500/10 border border-red-500/20 rounded-2xl">
                                        <AlertTriangle className="text-red-400 shrink-0 mt-0.5" size={16} />
                                        <p className="text-red-400 text-xs font-medium leading-relaxed">Couldn't load the payment gateway. Check your connection and reload this page.</p>
                                    </div>
                                )}
'@
$new2 = @'
                                {paystackLoadFailed && (
                                    <div className="flex items-start gap-2.5 p-4 bg-red-500/10 border border-red-500/20 rounded-2xl">
                                        <AlertTriangle className="text-red-400 shrink-0 mt-0.5" size={16} />
                                        <div className="flex-1">
                                            <p className="text-red-400 text-xs font-medium leading-relaxed mb-2">Couldn't load the payment gateway. This is usually an ad-blocker or privacy extension blocking a third-party script, or a flaky connection. Try disabling any ad-blocker for this site, then retry.</p>
                                            <button
                                                onClick={attemptLoadPaystack}
                                                className="text-red-400 hover:text-red-300 text-[10px] font-black uppercase tracking-widest underline underline-offset-2 transition-colors"
                                            >
                                                Retry
                                            </button>
                                        </div>
                                    </div>
                                )}
'@
Patch-File $paymentPath $old2 $new2 "add working Retry button"

Write-Host ""
Write-Host "All done. Review the diff, then:" -ForegroundColor Cyan
Write-Host "  git add src/app/payment/page.jsx"
Write-Host "  git commit -m 'Add retry path when Paystack gateway script fails to load'"
Write-Host "  git push origin main"
Write-Host ""
Write-Host "Then test again. If the button still gets stuck even after Retry," -ForegroundColor Cyan
Write-Host "open DevTools Console (F12) right when you click Pay Now and check for" -ForegroundColor Cyan
Write-Host "any red error mentioning paystack, or a blocked/failed network request." -ForegroundColor Cyan
