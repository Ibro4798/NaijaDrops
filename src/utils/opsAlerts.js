import { sendTelegram, escapeHtml, telegramConfigured } from "@/utils/telegram";

const siteUrl = () => (process.env.NEXT_PUBLIC_SITE_URL || "https://www.naijadrops.tech").replace(/\/+$/, "");
const naira = (n) => "\u20A6" + Number(n || 0).toLocaleString("en-NG");
const clip = (s, n = 300) => { const t = String(s || "").trim(); return t.length > n ? t.slice(0, n - 1) + "\u2026" : t; };
const place = (name) => String(name || "").split(",").slice(0, 2).join(",").trim();
const httpsUrl = (u) => (typeof u === "string" && /^https:\/\//i.test(u) ? u : null);
const note = (s) => (String(s || "").trim() ? `\n\uD83D\uDCDD <i>${escapeHtml(clip(s))}</i>` : "");

// Columns the alert needs (the claim query below returns them in one round trip).
const ALERT_COLUMNS =
  "id, pickup_name, dropoff_name, agreed_price, item_size, item_category, item_description, vehicle_type, " +
  "payment_status, payment_timing, scheduled_at, stop_count, pickup_details, dropoff_details, " +
  "voice_note_url, pickup_voice_note_url, dropoff_voice_note_url";

/**
 * The alert text and its buttons. Includes the notes the customer wrote for the rider, and tap-to-play buttons
 * for voice notes (recordings are .webm, which Telegram cannot play inline). Customer names and phone numbers
 * are not included: alerts pass through Telegram, a third party.
 */
export function buildNewOrderAlert(order, riderCount) {
  const when = order.scheduled_at
    ? "Scheduled " + new Date(order.scheduled_at).toLocaleString("en-NG", { timeZone: "Africa/Lagos", weekday: "short", hour: "numeric", minute: "2-digit" })
    : "Now";
  const pay = order.payment_status === "paid"
    ? "paid \u2705"
    : order.payment_timing === "at_pickup" ? "pays at pickup" : "pays after a price is agreed";
  const extra = Number(order.stop_count) > 1 ? ` <i>(+${Number(order.stop_count) - 1} more stops)</i>` : "";
  const detail = [order.item_size, order.vehicle_type, order.item_category].filter(Boolean).map(escapeHtml).join(" \u00B7 ");
  const reach = order.scheduled_at
    ? "\u23F0 <b>Scheduled.</b> Release it to a rider from Ops Terminal."
    : riderCount > 0
      ? `\uD83D\uDEB4 ${riderCount} online rider${riderCount === 1 ? "" : "s"} notified`
      : "\u26A0\uFE0F <b>NO RIDER REACHED.</b> Nobody is online nearby. Call a rider and assign the job.";

  const lines = [
    `\uD83D\uDCE6 <b>NEW ORDER</b>  #${escapeHtml(String(order.id).slice(0, 6).toUpperCase())}`,
    "\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501",
    "",
    `\uD83D\uDCCD <b>PICKUP</b>\n${escapeHtml(place(order.pickup_name) || "Pickup")}${note(order.pickup_details)}`,
    "",
    `\uD83C\uDFC1 <b>DROP-OFF</b>\n${escapeHtml(place(order.dropoff_name) || "Drop-off")}${extra}${note(order.dropoff_details)}`,
    "",
    `\uD83C\uDF92 <b>PACKAGE</b>\n${detail || "-"}${order.item_description ? `\n\u201C${escapeHtml(clip(order.item_description, 200))}\u201D` : ""}`,
    "",
    `\uD83D\uDCB0 <b>${naira(order.agreed_price)}</b>  \u00B7  ${pay}`,
    `\uD83D\uDD52 ${when}`,
    "",
    reach,
  ];

  const voice = [
    { text: "\uD83C\uDFA4 Pickup voice note", url: httpsUrl(order.pickup_voice_note_url) },
    { text: "\uD83C\uDFA4 Drop-off voice note", url: httpsUrl(order.dropoff_voice_note_url) },
    { text: "\uD83C\uDFA4 Voice note", url: httpsUrl(order.voice_note_url) },
  ].filter((b) => b.url);
  const rows = [];
  if (voice.length) rows.push(voice);
  rows.push([{ text: "Open orders", url: siteUrl() + "/ops-terminal/orders" }]);
  return { text: lines.join("\n"), rows };
}

/**
 * Alert ops about an order, ONCE. Several paths call /api/dispatch for the same order (creation, payment,
 * webhook, retry), so the first caller "claims" the order in the database and only that caller sends.
 *
 * The claim is released ONLY when Telegram definitely refused the message. If the answer is unclear (a timeout
 * while the message was in fact delivered) the claim is kept, so the team never gets the same order twice.
 * Never throws.
 */
export async function notifyOpsNewOrder(supabase, order) {
  try {
    if (!telegramConfigured()) return;
    const { data: claimed } = await supabase
      .from("orders")
      .update({ ops_alerted_at: new Date().toISOString() })
      .eq("id", order.id)
      .is("ops_alerted_at", null)
      .select(ALERT_COLUMNS)
      .maybeSingle();
    if (!claimed) return; // already alerted

    const { count } = await supabase
      .from("order_broadcasts")
      .select("rider_id", { count: "exact", head: true })
      .eq("order_id", order.id);

    const { text, rows } = buildNewOrderAlert(claimed, count || 0);
    const result = await sendTelegram(text, { rows });
    if (!result.sent && !result.uncertain) {
      await supabase.from("orders").update({ ops_alerted_at: null }).eq("id", order.id); // refused: allow a retry
    }
  } catch (err) {
    console.error("Ops alert failed:", err?.message || err);
  }
}
