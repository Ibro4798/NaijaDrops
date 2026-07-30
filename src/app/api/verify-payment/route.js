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

    if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY.includes('dummy')) {
      console.error('SUPABASE_SERVICE_ROLE_KEY or NEXT_PUBLIC_SUPABASE_URL is missing/placeholder - verify-payment cannot look up or update orders. Set it in .env.local and in Vercel Production env vars, then redeploy.');
      return NextResponse.json({ error: 'Payment verification is misconfigured on the server (missing Supabase service role key). Contact support before retrying.' }, { status: 500 });
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
        console.error('verify-payment: order lookup failed for orderId', orderId, orderErr);
        return NextResponse.json({ error: orderErr ? `Order lookup failed: ${orderErr.message}` : 'Order not found' }, { status: 404 });
    }

    // FIX: agreed_price is a nullable column. If it were ever null here,
    // `null * 100` evaluates to 0, and the amount check below
    // (`paidAmount < expectedAmountKobo`) would then pass for literally any
    // paid amount, including â‚¦0 - the check would exist in the code but be
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