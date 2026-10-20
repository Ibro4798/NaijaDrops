import { sendTelegram, escapeHtml, telegramConfigured } from "@/utils/telegram";

const siteUrl = () => (process.env.NEXT_PUBLIC_SITE_URL || "https://www.naijadrops.tech").replace(/\/+$/, "");
const naira = (n) => "\u20A6" + Number(n || 0).toLocaleString("en-NG");

// Deliberately no customer or receiver names or phone numbers: alerts pass through Telegram, a third party.
// Ops opens the order in the Ops Terminal to see the details.
export function buildNewOrderMessage(order, riderCount) {
  const when = order.scheduled_at
    ? "Scheduled " + new Date(order.scheduled_at).toLocaleString("en-NG", { timeZone: "Africa/Lagos", weekday: "short", hour: "numeric", minute: "2-digit" })
    : "Now";
  const paid = order.payment_status === "paid";
  const pay = paid
    ? "paid \u2705"
    : order.payment_timing === "at_pickup" ? "pays at pickup" : "pays after a price is agreed";
  const stops = Number(order.stop_count) > 1 ? ` (+${Number(order.stop_count) - 1} stops)` : "";
  const detail = [order.item_size, order.vehicle_type].filter(Boolean).map(escapeHtml).join(" \u00B7 ");
  const reach = order.scheduled_at
    ? "\u23F0 Scheduled order: release it to a rider from Ops Terminal."
    : riderCount > 0
      ? `\uD83D\uDEB4 ${riderCount} online rider${riderCount === 1 ? "" : "s"} notified`
      : "\u26A0\uFE0F <b>No rider reached.</b> Nobody is online nearby. Call a rider and assign the job.";
  return [
    `\uD83D\uDCE6 <b>New order</b> #${escapeHtml(String(order.id).slice(0, 6).toUpperCase())}`,
    `${escapeHtml(order.pickup_name || "Pickup")} \u2192 ${escapeHtml(order.dropoff_name || "Drop-off")}${stops}`,
    `${naira(order.agreed_price)}${detail ? " \u00B7 " + detail : ""}`,
    `${when} \u00B7 ${pay}`,
    reach,
  ].join("\n");
}

/**
 * Alert ops about an order, ONCE. Several paths call /api/dispatch for the same order (creation, payment,
 * webhook, retry), so the first caller "claims" the order in the database and only that caller sends.
 * Never throws and never slows dispatch down for long.
 */
export async function notifyOpsNewOrder(supabase, order) {
  try {
    if (!telegramConfigured()) return;
    const { data: claimed } = await supabase
      .from("orders")
      .update({ ops_alerted_at: new Date().toISOString() })
      .eq("id", order.id)
      .is("ops_alerted_at", null)
      .select("id")
      .maybeSingle();
    if (!claimed) return; // already alerted

    const { count } = await supabase
      .from("order_broadcasts")
      .select("rider_id", { count: "exact", head: true })
      .eq("order_id", order.id);

    const sent = await sendTelegram(buildNewOrderMessage(order, count || 0), {
      buttons: [{ text: "Open orders", url: siteUrl() + "/ops-terminal/orders" }],
    });
    if (!sent) {
      // Release the claim so a later dispatch call can try again.
      await supabase.from("orders").update({ ops_alerted_at: null }).eq("id", order.id);
    }
  } catch (err) {
    console.error("Ops alert failed:", err?.message || err);
  }
}
