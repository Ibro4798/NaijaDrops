import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

// Service-role client: bypasses RLS intentionally, because this route is the ONLY
// path an anonymous customer (no account) can use to check their delivery. It must
// never return anything beyond the fields explicitly selected below.
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export async function GET(req, { params }) {
  const { orderId } = params;

  if (!orderId) {
    return NextResponse.json({ error: 'Missing order id' }, { status: 400 });
  }

  const { data: order, error } = await supabaseAdmin
    .from('orders')
    .select(`
      id, status, pickup_name, dropoff_name, item_description,
      created_at, updated_at, agreed_price, rider_id,
      riders ( id, current_lat, current_lng, users ( full_name ) )
    `)
    .eq('id', orderId)
    .single();

  if (error || !order) {
    return NextResponse.json({ error: 'Order not found' }, { status: 404 });
  }

  // Deliberately narrow response: never leak recipient_phone, notes, voice_note_url,
  // or vendor identity to an anonymous requester.
  const safePayload = {
    id: order.id,
    status: order.status,
    pickup_name: order.pickup_name,
    dropoff_name: order.dropoff_name,
    item_description: order.item_description,
    created_at: order.created_at,
    updated_at: order.updated_at,
    total_price: order.status === 'delivered' ? order.agreed_price : null,
    rider: order.riders ? {
      first_name: (order.riders.users?.full_name || 'Rider').split(' ')[0],
      current_lat: order.riders.current_lat,
      current_lng: order.riders.current_lng
    } : null
  };

  return NextResponse.json({ success: true, order: safePayload });
}
