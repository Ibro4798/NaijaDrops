import { NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';

// Resolves a Nigerian bank account number using Paystack's official API.
// Called from the rider earnings page before saving payout details.
export async function POST(req) {
  try {
    // Must be a signed-in rider
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { account_number, bank_code } = await req.json();

    if (!account_number || !/^\d{10}$/.test(account_number)) {
      return NextResponse.json({ error: 'Account number must be exactly 10 digits.' }, { status: 400 });
    }
    if (!bank_code) {
      return NextResponse.json({ error: 'Bank code is required.' }, { status: 400 });
    }

    const key = process.env.PAYSTACK_SECRET_KEY;
    if (!key || key.includes('dummy')) {
      return NextResponse.json({ error: 'Payment service not configured on this server.' }, { status: 500 });
    }

    const res = await fetch(
      `https://api.paystack.co/bank/resolve?account_number=${account_number}&bank_code=${bank_code}`,
      { headers: { Authorization: `Bearer ${key}` } }
    );
    const data = await res.json();

    if (!res.ok || !data.status) {
      return NextResponse.json(
        { error: data.message || 'Could not verify this account. Check the details and try again.' },
        { status: 400 }
      );
    }

    return NextResponse.json({ account_name: data.data.account_name });
  } catch (err) {
    console.error('verify-bank error:', err);
    return NextResponse.json({ error: 'Server error verifying bank account.' }, { status: 500 });
  }
}
