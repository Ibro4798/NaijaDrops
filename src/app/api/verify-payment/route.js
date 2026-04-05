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

    if (!paystackData.status) {
      return NextResponse.json({ error: paystackData.message || 'Verification failed' }, { status: 400 });
    }

    const { status: txStatus, amount: paidAmount, currency } = paystackData.data;

    if (txStatus !== 'success') {
      return NextResponse.json({ error: `Transaction is ${txStatus}` }, { status: 400 });
    }

    // 2. Fetch the order from Supabase to verify the amount
    const { data: order, error: orderErr } = await supabaseAdmin
      .from('orders')
      .select('agreed_price, status')
      .eq('id', orderId)
      .single();

    if (orderErr || !order) {
        return NextResponse.json({ error: 'Order not found' }, { status: 404 });
    }

    // Paystack returns amount in kobo (multiply Naira by 100)
    const expectedAmountKobo = order.agreed_price * 100;

    if (paidAmount < expectedAmountKobo) {
        return NextResponse.json({ error: 'Amount paid is less than agreed price' }, { status: 400 });
    }

    if (order.status === 'accepted') {
        return NextResponse.json({ success: true, message: 'Already marked as accepted' });
    }

    // 3. Update the order safely using the Admin connection
    const generatedPin = Math.floor(1000 + Math.random() * 9000).toString();

    const { error: updateErr } = await supabaseAdmin
        .from('orders')
        .update({
            status: 'accepted',
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
            status: 'accepted',
            delivery_pin: generatedPin
        })
        .eq('id', orderId);

    if (updateErr) return NextResponse.json({ error: 'Simulated update failed', details: updateErr }, { status: 500 });
    return NextResponse.json({ success: true });
}
