import { ImageResponse } from 'next/og';
import { createAdminClient } from '@/utils/supabase/admin';

// This is the "site image" that shows up automatically when a tracking
// link is pasted into WhatsApp, SMS, or any other app that renders link
// previews. Next.js wires this up to the tracking page's metadata purely
// by file convention - nothing else needs to reference it. Before this,
// every tracking link shared for every delivery showed the exact same
// generic homepage branding image (or nothing at all on apps that don't
// fall back), which didn't tell the person on the other end what they
// were even clicking into.
//
// Runs server-side only and deliberately mirrors the same "safe fields"
// list as /api/track/[orderId] - never the price, phone numbers, or the
// vendor's real account identity, since this image is visible to anyone
// who can see the shared link, not just the intended recipient.

export const runtime = 'nodejs';
export const alt = 'NaijaDrops delivery tracking';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

const STATUS_LABELS = {
  pending: 'Finding a rider',
  looking_for_driver: 'Finding a rider',
  matched: 'Rider assigned',
  picked_up: 'Package picked up',
  in_transit: 'On the way',
  delivered: 'Delivered',
  cancelled: 'Cancelled',
};

async function getSafeOrder(orderId) {
  try {
    const supabase = createAdminClient();
    const { data: order } = await supabase
      .from('orders')
      .select('status, pickup_name, dropoff_name, item_description')
      .eq('id', orderId)
      .single();
    return order || null;
  } catch {
    return null;
  }
}

export default async function Image({ params }) {
  const { orderId } = await params;
  const order = await getSafeOrder(orderId);
  const statusLabel = order ? (STATUS_LABELS[order.status] || 'Tracking your delivery') : 'Live delivery tracking';
  const isDelivered = order?.status === 'delivered';

  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          padding: '72px',
          backgroundColor: '#09090b',
          backgroundImage: 'radial-gradient(circle at 85% 15%, rgba(16,185,129,0.20), rgba(9,9,11,0) 55%)',
          fontFamily: 'sans-serif',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <div
            style={{
              width: 20,
              height: 20,
              borderRadius: 6,
              backgroundColor: '#10b981',
              boxShadow: '0 0 24px rgba(16,185,129,0.6)',
            }}
          />
          <div style={{ display: 'flex', fontSize: 34, fontWeight: 900, color: '#ffffff', letterSpacing: -1 }}>
            NAIJADROPS
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 28 }}>
          <div
            style={{
              display: 'flex',
              alignSelf: 'flex-start',
              alignItems: 'center',
              gap: 10,
              padding: '10px 22px',
              borderRadius: 999,
              backgroundColor: isDelivered ? 'rgba(16,185,129,0.12)' : 'rgba(245,158,11,0.12)',
              border: `1px solid ${isDelivered ? 'rgba(16,185,129,0.35)' : 'rgba(245,158,11,0.35)'}`,
            }}
          >
            <div
              style={{
                width: 10,
                height: 10,
                borderRadius: 999,
                backgroundColor: isDelivered ? '#10b981' : '#f59e0b',
              }}
            />
            <div
              style={{
                display: 'flex',
                fontSize: 22,
                fontWeight: 800,
                letterSpacing: 2,
                textTransform: 'uppercase',
                color: isDelivered ? '#10b981' : '#f59e0b',
              }}
            >
              {statusLabel}
            </div>
          </div>

          {order ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                <div style={{ width: 18, height: 18, borderRadius: 999, backgroundColor: '#f59e0b', flexShrink: 0 }} />
                <div style={{ display: 'flex', fontSize: 40, fontWeight: 800, color: '#ffffff', maxWidth: 980 }}>
                  {order.pickup_name || 'Pickup point'}
                </div>
              </div>
              <div style={{ display: 'flex', marginLeft: 8, width: 2, height: 36, backgroundColor: 'rgba(255,255,255,0.15)' }} />
              <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                <div style={{ width: 18, height: 18, borderRadius: 6, backgroundColor: '#10b981', flexShrink: 0 }} />
                <div style={{ display: 'flex', fontSize: 40, fontWeight: 800, color: 'rgba(255,255,255,0.75)', maxWidth: 980 }}>
                  {order.dropoff_name || 'Drop-off point'}
                </div>
              </div>
            </div>
          ) : (
            <div style={{ display: 'flex', fontSize: 40, fontWeight: 800, color: '#ffffff' }}>
              Track this delivery live
            </div>
          )}
        </div>

        <div
          style={{
            display: 'flex',
            fontSize: 22,
            fontWeight: 700,
            color: 'rgba(255,255,255,0.35)',
            letterSpacing: 1,
          }}
        >
          Reliable, trackable delivery — Kano
        </div>
      </div>
    ),
    { ...size }
  );
}
