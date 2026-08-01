import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

/**
 * Anonymous customer chat endpoint.
 *
 * The `messages` table's RLS policies only ever grant access to the
 * authenticated vendor or rider on an order (auth.uid() based) - an
 * anonymous customer (no account, accessing only via the unguessable
 * order-id tracking link) has no auth.uid() at all, so they could never
 * read or send a message through the normal Supabase client no matter
 * what UI was built for it.
 *
 * This mirrors the existing /api/track/[orderId] pattern exactly: a
 * service-role client that intentionally bypasses RLS, narrowly scoped to
 * only the two channels a customer is allowed into (vendor_customer,
 * rider_customer - never vendor_rider), and only for the specific order in
 * the URL. Same trust model as the rest of anonymous tracking: whoever has
 * the order-id link is treated as "the customer" for that order.
 */
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const POST_DELIVERY_GRACE_MS = 2 * 60 * 60 * 1000;
const ALLOWED_CHANNELS = ['vendor_customer', 'rider_customer'];
const MAX_TEXT_LEN = 1000;

async function getScopedOrder(orderId) {
  const { data: order } = await supabaseAdmin
    .from('orders')
    .select('id, status, updated_at, rider_id')
    .eq('id', orderId)
    .single();
  return order || null;
}

function isExpired(order) {
  if (!order || order.status !== 'delivered') return false;
  return Date.now() - new Date(order.updated_at).getTime() > POST_DELIVERY_GRACE_MS;
}

export async function GET(req, { params }) {
  const { orderId } = params;
  const { searchParams } = new URL(req.url);
  const channel = searchParams.get('channel');

  if (!orderId || !ALLOWED_CHANNELS.includes(channel)) {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
  }

  const order = await getScopedOrder(orderId);
  if (!order) return NextResponse.json({ error: 'Order not found' }, { status: 404 });
  if (isExpired(order)) return NextResponse.json({ error: 'Link expired', expired: true }, { status: 410 });

  // No rider on the order yet - the rider_customer thread simply doesn't
  // exist yet rather than erroring, so the UI can show an empty state.
  if (channel === 'rider_customer' && !order.rider_id) {
    return NextResponse.json({ success: true, messages: [] });
  }

  const { data, error } = await supabaseAdmin
    .from('messages')
    .select('id, text, type, sender_role, created_at')
    .eq('order_id', orderId)
    .eq('channel', channel)
    .order('created_at', { ascending: true })
    .limit(200);

  if (error) return NextResponse.json({ error: 'Could not load messages' }, { status: 500 });
  return NextResponse.json({ success: true, messages: data || [] });
}

export async function POST(req, { params }) {
  const { orderId } = params;

  let body;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid body' }, { status: 400 });
  }

  const { channel, text } = body || {};
  if (!orderId || !ALLOWED_CHANNELS.includes(channel)) {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
  }
  const trimmed = (text || '').trim().slice(0, MAX_TEXT_LEN);
  if (!trimmed) return NextResponse.json({ error: 'Message is empty' }, { status: 400 });

  const order = await getScopedOrder(orderId);
  if (!order) return NextResponse.json({ error: 'Order not found' }, { status: 404 });
  if (isExpired(order)) return NextResponse.json({ error: 'Link expired', expired: true }, { status: 410 });
  if (channel === 'rider_customer' && !order.rider_id) {
    return NextResponse.json({ error: 'No rider assigned yet' }, { status: 409 });
  }
  if (order.status === 'cancelled') {
    return NextResponse.json({ error: 'This order was cancelled' }, { status: 409 });
  }

  const { error } = await supabaseAdmin.from('messages').insert({
    order_id: orderId,
    sender_id: null,
    sender_role: 'customer',
    channel,
    text: trimmed,
    type: 'text',
  });

  if (error) return NextResponse.json({ error: 'Could not send message' }, { status: 500 });
  return NextResponse.json({ success: true });
}
