import { NextResponse } from "next/server";
import webpush from "web-push";
import { createAdminClient } from "@/utils/supabase/admin";

// FIX: setVapidDetails() used to run at module scope - the instant this
// file loads, which includes Next.js's build-time "collect page data" step,
// before env vars are guaranteed to be populated the same way they are at
// request time. web-push validates the public key eagerly and throws if
// it's missing/malformed, which crashed the entire production build even
// though nothing was actually wrong at runtime. Deferred into a lazy
// initializer that only runs the first time a request actually comes in.
let vapidConfigured = false;
function ensureVapidConfigured() {
  if (vapidConfigured) return;
  webpush.setVapidDetails(
    process.env.VAPID_SUBJECT || "mailto:ibrahim@naijadrops.tech",
    process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY,
    process.env.VAPID_PRIVATE_KEY
  );
  vapidConfigured = true;
}

// Mirrors the MILESTONES map in OrderStatusNotificationListener.jsx - kept
// separate rather than shared because this one runs server-side and needs
// plain strings, not lucide icon components.
const MILESTONES = {
  matched: { title: "Rider assigned", body: (o) => `A rider is on the way to pick up ${o.item_description || "the package"}.` },
  picked_up: { title: "Picked up", body: (o) => `${o.item_description || "The package"} has been picked up.` },
  in_transit: { title: "On the way", body: (o) => `${o.item_description || "The package"} is on the way to ${o.dropoff_name || "the drop-off"}.` },
  delivered: { title: "Delivered", body: (o) => `${o.item_description || "The package"} has been delivered.` },
};

// Called (fire-and-forget) by whichever client tab actually observed an
// order's status change over Realtime - vendor's own dashboard via
// OrderStatusNotificationListener, or the customer's tracking page. That
// tab only tells this route WHICH order changed; it never trusts a
// caller-supplied status. This route re-reads the order itself before
// deciding what to send.
//
// Known limitation: this endpoint has no auth check, so anyone who knows
// (or guesses) an orderId can trigger a send. Worst case is a duplicate/
// early notification to that order's own vendor and rider - no data is
// exposed in the response. Fine for pre-pilot volume; add auth + rate
// limiting before this matters at scale.
export async function POST(req) {
  try {
    if (!process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || !process.env.VAPID_PRIVATE_KEY) {
      // Env vars not set yet (e.g. this deploy predates adding them) -
      // fail quietly rather than 500, since this route is always called
      // fire-and-forget from the client and never awaited for its result.
      return NextResponse.json({ skipped: true, reason: "VAPID env vars not configured" });
    }
    ensureVapidConfigured();

    const { orderId } = await req.json();
    if (!orderId) return NextResponse.json({ error: "Missing orderId" }, { status: 400 });

    const admin = createAdminClient();

    const { data: order, error } = await admin
      .from("orders")
      .select("id, status, vendor_id, rider_user_id, item_description, dropoff_name")
      .eq("id", orderId)
      .single();

    if (error || !order) return NextResponse.json({ error: "Order not found" }, { status: 404 });

    const milestone = MILESTONES[order.status];
    if (!milestone) return NextResponse.json({ skipped: true });

    const recipientUserIds = [];
    if (order.vendor_id) {
      const { data: vendor } = await admin
        .from("vendors")
        .select("user_id")
        .eq("id", order.vendor_id)
        .single();
      if (vendor?.user_id) recipientUserIds.push(vendor.user_id);
    }
    if (order.rider_user_id) recipientUserIds.push(order.rider_user_id);

    if (recipientUserIds.length === 0) return NextResponse.json({ skipped: true });

    const { data: subs } = await admin
      .from("push_subscriptions")
      .select("id, endpoint, p256dh, auth")
      .in("user_id", recipientUserIds);

    if (!subs?.length) return NextResponse.json({ sent: 0 });

    const payload = JSON.stringify({
      title: milestone.title,
      body: milestone.body(order),
      url: `/tracking/${order.id}`,
    });

    const results = await Promise.allSettled(
      subs.map((sub) =>
        webpush
          .sendNotification({ endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } }, payload)
          .catch(async (err) => {
            // 404/410 = the subscription is dead (uninstalled, permission
            // revoked, endpoint expired) - clean it up so future sends
            // stop retrying it.
            if (err?.statusCode === 404 || err?.statusCode === 410) {
              await admin.from("push_subscriptions").delete().eq("id", sub.id);
            }
            throw err;
          })
      )
    );

    const sent = results.filter((r) => r.status === "fulfilled").length;
    return NextResponse.json({ sent, total: subs.length });
  } catch (err) {
    console.error("push send-order-update error:", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
