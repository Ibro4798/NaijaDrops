import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

// Service-role client: bypasses RLS intentionally, because this route is the ONLY
// path an anonymous customer (no account) can use to check their delivery. It must
// never return anything beyond the fields explicitly selected below.
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// How long an anonymous customer's tracking/receipt link stays usable after
// the order is marked delivered. After this, the link is dead - it's a
// unique link scoped to the lifetime of that one delivery, not a permanent
// public URL for the order.
const POST_DELIVERY_GRACE_MS = 2 * 60 * 60 * 1000; // 2 hours

export async function GET(req, { params }) {
  const { orderId } = await params;

  if (!orderId) {
    return NextResponse.json({ error: 'Missing order id' }, { status: 400 });
  }

  const { data: order, error } = await supabaseAdmin
    .from('orders')
    .select(`
      id, status, payment_status, pickup_name, pickup_lat, pickup_lng, dropoff_name, dropoff_lat, dropoff_lng, item_description,
      created_at, updated_at, agreed_price, rider_id,
      riders ( id, current_lat, current_lng, last_seen_at, users ( full_name, receipt_display_name ) ),
      vendors ( users ( receipt_display_name ) )
    `)
    .eq('id', orderId)
    .single();

  if (error || !order) {
    return NextResponse.json({ error: 'Order not found' }, { status: 404 });
  }

  if (order.status === 'delivered') {
    const deliveredAt = new Date(order.updated_at).getTime();
    if (Date.now() - deliveredAt > POST_DELIVERY_GRACE_MS) {
      return NextResponse.json({ error: 'Link expired', expired: true }, { status: 410 });
    }
  }

  // Deliberately narrow response: never leak recipient_phone, notes, voice_note_url,
  // or the vendor's real business_name/account identity to an anonymous requester.
  // The one exception is receipt_display_name - that's a name the vendor
  // explicitly chose to show on receipts (set in their profile), so surfacing
  // it here is the whole point of that field rather than a leak.
  //
  // FIX: payment_status and last_seen_at were both missing from this payload.
  // Without payment_status, the anonymous customer page could never gate the
  // "share this link" affordance on payment (it didn't need to, since customers
  // don't share their own link - but it's needed so the customer chat UI knows
  // whether the order is still active). Without last_seen_at, there was no way
  // to tell a genuinely live rider location apart from a stale one last written
  // minutes ago on a bad connection - the UI just always said "Live".
  const safePayload = {
    id: order.id,
    status: order.status,
    payment_status: order.payment_status,
    pickup_name: order.pickup_name,
    pickup_lat: order.pickup_lat,
    pickup_lng: order.pickup_lng,
    dropoff_name: order.dropoff_name,
    dropoff_lat: order.dropoff_lat,
    dropoff_lng: order.dropoff_lng,
    item_description: order.item_description,
    created_at: order.created_at,
    updated_at: order.updated_at,
    // Deliberately NOT returning total_price / agreed_price here - this is
    // the anonymous customer's endpoint, and the delivery price is between
    // the vendor and NaijaDrops, not something the customer needs to see.
    sender_display_name: order.vendors?.users?.receipt_display_name || null,
    rider: order.riders ? {
      first_name: (order.riders.users?.receipt_display_name || order.riders.users?.full_name || 'Rider').split(' ')[0],
      current_lat: order.riders.current_lat,
      current_lng: order.riders.current_lng,
      last_seen_at: order.riders.last_seen_at
    } : null
  };

  return NextResponse.json({ success: true, order: safePayload });
}
