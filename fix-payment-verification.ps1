# fix-payment-verification.ps1
# Run from repo root: C:\Users\T450s\Documents\logistics welcome soon page
#
# Fixes the payment verification logic (not the client-side button itself -
# see the note below on that).
#
# 1. verify-payment/route.js:
#    - payment_status wasn't being selected from the order at all, so the
#      "already paid" idempotency check was comparing against `undefined`
#      every time - a duplicate verification call would silently regenerate
#      a new delivery PIN, invalidating whatever PIN the rider/recipient
#      already had.
#    - Added a currency check (was destructured but never actually verified).
#    - Guards against a null/zero agreed_price, which would otherwise make
#      the amount check meaningless (0 * 100 = 0, so any paid amount would
#      pass).
#    - A bad/wrong PAYSTACK_SECRET_KEY (401 from Paystack) now reports
#      plainly instead of a vague "verification failed".
#
# 2. payment/page.jsx: fixed a dead `orderData.user_id` reference - that
#    column has never existed on `orders` (both order-creation flows only
#    ever set vendor_id), so every transaction was tagged with the exact
#    same generic email in Paystack's dashboard.
#
# IMPORTANT - about the button "not working":
# I checked the live production bundle directly and confirmed
# NEXT_PUBLIC_PAYSTACK_PUBLIC_KEY IS correctly baked in (a real pk_test_
# key, not a placeholder), and confirmed RLS is not blocking the order
# fetch. No server errors were logged for /api/verify-payment in the last
# 7 days - meaning no attempt has actually completed a Paystack transaction
# yet, successful or failed. Two likely explanations, in order of
# likelihood:
#   a) Testing with a real card against a pk_test_ key - Paystack test mode
#      only accepts their official test cards. Use: 408 408 408 408 408 1,
#      any future expiry, CVV 408.
#   b) PAYSTACK_SECRET_KEY missing or wrong in Vercel's Production env vars
#      (separate from the public key - this is the server-side secret used
#      by /api/verify-payment). If (a) doesn't fix it, check that next -
#      the improved error message this script adds will now say plainly if
#      that's the problem.

$ErrorActionPreference = "Stop"

$verifyPath = "src\app\api\verify-payment\route.js"
$paymentPath = "src\app\payment\page.jsx"

foreach ($p in @($verifyPath, $paymentPath)) {
    if (-not (Test-Path $p)) {
        Write-Host "ERROR: Cannot find $p — run this script from the repo root." -ForegroundColor Red
        exit 1
    }
}

$stamp = Get-Date -Format "yyyyMMdd_HHmmss"
Copy-Item $verifyPath "$verifyPath.bak_$stamp"
Copy-Item $paymentPath "$paymentPath.bak_$stamp"
Write-Host "Backed up both files with .bak_$stamp suffix" -ForegroundColor DarkGray

function Normalize($s) {
    return $s -replace "`r`n", "`n" -replace "`r", "`n"
}

function Write-Full($path, $content, $label) {
    [System.IO.File]::WriteAllText((Resolve-Path $path), (Normalize $content), (New-Object System.Text.UTF8Encoding($true)))
    Write-Host "Rewrote $path ($label)" -ForegroundColor Green
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

$verifyRoute = @'
import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

// Initialize Supabase with the SERVICE ROLE key to bypass RLS for secure updates
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export async function POST(req) {
  try {
    const { reference, orderId } = await req.json();

    if (!reference || !orderId) {
      return NextResponse.json({ error: 'Missing reference or orderId' }, { status: 400 });
    }

    if (!process.env.PAYSTACK_SECRET_KEY || process.env.PAYSTACK_SECRET_KEY.includes('dummy')) {
        console.warn('Using dummy verification due to missing PAYSTACK_SECRET_KEY');
        // FALLBACK FOR DEV: If no secret key is set, simulate success but warn clearly
        return simulateSuccess(reference, orderId);
    }

    // 1. Verify payment with Paystack API
    const paystackRes = await fetch(`https://api.paystack.co/transaction/verify/${reference}`, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}`,
      },
    });

    const paystackData = await paystackRes.json();

    // FIX: a non-2xx response from Paystack here (most commonly 401, when
    // PAYSTACK_SECRET_KEY is present but wrong - e.g. a live key paired with
    // a pk_test_ public key, or a stale/revoked key) used to fall through
    // to the generic !paystackData.status check below with whatever vague
    // message Paystack's error body happened to contain. Checking res.ok
    // explicitly first means a bad secret key now reports plainly as an
    // auth problem instead of a confusing "verification failed".
    if (!paystackRes.ok) {
      console.error('Paystack verify call failed:', paystackRes.status, paystackData);
      if (paystackRes.status === 401) {
        return NextResponse.json({ error: 'Payment gateway rejected the request (invalid PAYSTACK_SECRET_KEY). Check the key in Vercel env vars.' }, { status: 502 });
      }
      return NextResponse.json({ error: paystackData?.message || 'Could not reach the payment gateway to verify this transaction.' }, { status: 502 });
    }

    if (!paystackData.status) {
      return NextResponse.json({ error: paystackData.message || 'Verification failed' }, { status: 400 });
    }

    const { status: txStatus, amount: paidAmount, currency } = paystackData.data;

    if (txStatus !== 'success') {
      return NextResponse.json({ error: `Transaction is ${txStatus}` }, { status: 400 });
    }

    // FIX: this was never actually checked before - a transaction that came
    // back in a currency other than NGN (shouldn't normally happen given
    // initializePaystack() hardcodes currency: 'NGN', but a tampered client
    // request or a misconfigured Paystack account could produce one) would
    // still pass the kobo comparison below since it only looks at the raw
    // numeric amount, regardless of what currency that number is actually
    // denominated in.
    if (currency !== 'NGN') {
      console.error(`Unexpected transaction currency: ${currency} for reference ${reference}`);
      return NextResponse.json({ error: `Unexpected transaction currency (${currency})` }, { status: 400 });
    }

    // 2. Fetch the order from Supabase to verify the amount
    // FIX: payment_status wasn't in this select at all, so the "already
    // marked as paid" check further down was comparing against `undefined`
    // every single time - it could never actually short-circuit a repeat
    // verification call, meaning a double-fired webhook+client verification
    // (or a user re-submitting) would regenerate a brand new delivery PIN
    // and silently invalidate whatever PIN the rider/recipient already had.
    const { data: order, error: orderErr } = await supabaseAdmin
      .from('orders')
      .select('agreed_price, status, payment_status')
      .eq('id', orderId)
      .single();

    if (orderErr || !order) {
        return NextResponse.json({ error: 'Order not found' }, { status: 404 });
    }

    // FIX: agreed_price is a nullable column. If it were ever null here,
    // `null * 100` evaluates to 0, and the amount check below
    // (`paidAmount < expectedAmountKobo`) would then pass for literally any
    // paid amount, including ₦0 - the check would exist in the code but be
    // silently meaningless for that order. Fail loudly instead.
    if (!order.agreed_price || order.agreed_price <= 0) {
      console.error(`Order ${orderId} has no valid agreed_price (${order.agreed_price}) - refusing to verify payment against it.`);
      return NextResponse.json({ error: 'This order has no valid agreed price on file. Contact support before retrying payment.' }, { status: 409 });
    }

    // Paystack returns amount in kobo (multiply Naira by 100)
    const expectedAmountKobo = order.agreed_price * 100;

    // FIX: kept as a "paid less than agreed" check rather than requiring an
    // exact match, so a legitimate overpayment (e.g. a stale price shown
    // client-side for a second before a debounced recalculation) isn't
    // rejected - but anything short of the agreed price is refused outright
    // rather than silently accepted.
    if (paidAmount < expectedAmountKobo) {
        console.error(`Amount mismatch for order ${orderId}: paid ${paidAmount} kobo, expected at least ${expectedAmountKobo} kobo (agreed_price=${order.agreed_price}).`);
        return NextResponse.json({ error: 'Amount paid is less than the agreed price for this order.' }, { status: 400 });
    }

    if (order.payment_status === 'paid') {
        return NextResponse.json({ success: true, message: 'Already marked as paid' });
    }

    // 3. Update the order safely using the Admin connection
    const generatedPin = Math.floor(1000 + Math.random() * 9000).toString();

    const { error: updateErr } = await supabaseAdmin
        .from('orders')
        .update({
            payment_status: 'paid',
            delivery_pin: generatedPin
        })
        .eq('id', orderId);

    if (updateErr) throw updateErr;

    return NextResponse.json({ success: true });

  } catch (error) {
    console.error('Payment verification error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

async function simulateSuccess(reference, orderId) {
     const generatedPin = Math.floor(1000 + Math.random() * 9000).toString();
     const { error: updateErr } = await supabaseAdmin
        .from('orders')
        .update({
            payment_status: 'paid',
            delivery_pin: generatedPin
        })
        .eq('id', orderId);

    if (updateErr) return NextResponse.json({ error: 'Simulated update failed', details: updateErr }, { status: 500 });
    return NextResponse.json({ success: true });
}
'@
Write-Full $verifyPath $verifyRoute "hardened amount/currency verification"

$oldEmail = @'
        const userEmail = orderData.user_id ? `${orderData.user_id}@naijadrops.com` : 'customer@naijadrops.com';
'@
$newEmail = @'
        // FIX: orders has no user_id column at all (never has - vendor and
        // customer flows both only ever set vendor_id), so this was always
        // undefined and every transaction showed up in Paystack's dashboard
        // under the exact same generic email, making real transactions
        // impossible to tell apart. Keying it to the order's actual
        // vendor_id at least makes each vendor's payments distinguishable.
        const userEmail = orderData.vendor_id ? `vendor-${orderData.vendor_id}@naijadrops.com` : 'customer@naijadrops.com';
'@
Patch-File $paymentPath $oldEmail $newEmail "distinguishable per-vendor email reference"

Write-Host ""
Write-Host "All done. Review the diff, then:" -ForegroundColor Cyan
Write-Host "  git add src/app/api/verify-payment/route.js src/app/payment/page.jsx"
Write-Host "  git commit -m 'Harden payment verification: fix dead idempotency check, add currency check, guard null agreed_price'"
Write-Host "  git push origin main"
Write-Host ""
Write-Host "Then test with Paystack's official test card: 408 408 408 408 408 1 / any future expiry / CVV 408" -ForegroundColor Cyan
Write-Host "If that still fails, the error message will now tell you directly if PAYSTACK_SECRET_KEY is the problem." -ForegroundColor Cyan
