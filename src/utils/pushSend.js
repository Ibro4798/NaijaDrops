import webpush from "web-push";
import { createAdminClient } from "@/utils/supabase/admin";

let ready = false;
function init() {
  if (ready) return true;
  if (!process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || !process.env.VAPID_PRIVATE_KEY) return false;
  webpush.setVapidDetails(
    process.env.VAPID_SUBJECT || "mailto:ibrahim@naijadrops.tech",
    process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY,
    process.env.VAPID_PRIVATE_KEY
  );
  ready = true;
  return true;
}

// Push a notification to every registered device of the given users. Never throws.
export async function sendPushToUsers(userIds, { title, body, url }) {
  try {
    if (!init() || !userIds.length) return { sent: 0 };
    const admin = createAdminClient();
    const { data: subs } = await admin.from("push_subscriptions").select("id, endpoint, p256dh, auth").in("user_id", userIds);
    if (!subs?.length) return { sent: 0 };
    const payload = JSON.stringify({ title, body, url });
    const results = await Promise.allSettled(
      subs.map((sub) =>
        webpush.sendNotification({ endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } }, payload).catch(async (err) => {
          if (err?.statusCode === 404 || err?.statusCode === 410) await admin.from("push_subscriptions").delete().eq("id", sub.id);
          throw err;
        })
      )
    );
    return { sent: results.filter((r) => r.status === "fulfilled").length };
  } catch (err) {
    console.error("push error:", err?.message || err);
    return { sent: 0 };
  }
}
