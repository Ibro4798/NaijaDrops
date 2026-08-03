import { createAdminClient } from '@/utils/supabase/admin';

// The tracking page itself is a client component ("use client"), so it
// can't export generateMetadata directly - this server layout is what
// gives each tracking link its own title/description instead of
// inheriting the generic homepage copy. The opengraph-image.jsx file in
// this same folder is picked up automatically by Next's file convention
// and doesn't need to be referenced here.

const STATUS_LABELS = {
  pending: 'Finding a rider',
  looking_for_driver: 'Finding a rider',
  matched: 'Rider assigned',
  picked_up: 'Package picked up',
  in_transit: 'On the way',
  delivered: 'Delivered',
  cancelled: 'Cancelled',
};

export async function generateMetadata({ params }) {
  const { orderId } = await params;

  try {
    const supabase = createAdminClient();
    const { data: order } = await supabase
      .from('orders')
      .select('status, pickup_name, dropoff_name')
      .eq('id', orderId)
      .single();

    if (order) {
      const statusLabel = STATUS_LABELS[order.status] || 'Live delivery tracking';
      const title = `${statusLabel} — NaijaDrops`;
      const description = order.pickup_name && order.dropoff_name
        ? `${order.pickup_name} → ${order.dropoff_name}. Track this NaijaDrops delivery live, right here in Kano.`
        : 'Track this NaijaDrops delivery live, right here in Kano.';

      return {
        title,
        description,
        openGraph: { title, description },
        twitter: { title, description, card: 'summary_large_image' },
      };
    }
  } catch {
    // Fall through to the generic default below - a metadata failure
    // should never take down the tracking page itself.
  }

  return {
    title: 'Track your delivery — NaijaDrops',
    description: 'Track this NaijaDrops delivery live, right here in Kano.',
  };
}

export default function TrackingOrderLayout({ children }) {
  return children;
}
