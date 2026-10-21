// Telegram alerts to the NaijaDrops operations team.
//
// Set in Vercel (Settings > Environment Variables), then redeploy:
//   TELEGRAM_BOT_TOKEN       from @BotFather  (mark it Sensitive)
//   TELEGRAM_ADMIN_CHAT_ID   your chat id, or a group id (negative number).
//                            Several ids can be comma-separated, e.g. "123456789,-1001234567890"
// Until both are set every function here quietly does nothing.
const API_BASE = process.env.TELEGRAM_API_BASE || "https://api.telegram.org";

const chatIds = () =>
  (process.env.TELEGRAM_ADMIN_CHAT_ID || "").split(",").map((s) => s.trim()).filter(Boolean);

export const telegramConfigured = () => !!process.env.TELEGRAM_BOT_TOKEN && chatIds().length > 0;

export const escapeHtml = (value) =>
  String(value ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/**
 * Send one message to every configured chat. `rows` = [[{ text, url }, ...], ...] shown as buttons under the message.
 * Never throws and never logs the token.
 *
 * Returns { sent, uncertain }:
 *   sent      - at least one chat definitely received it
 *   uncertain - no confirmation, but the message MAY have been delivered (timeout / dropped connection).
 *               Callers must NOT resend in that case, or the team gets duplicates.
 *   (both false = Telegram definitely refused it)
 */
export async function sendTelegram(text, { rows } = {}) {
  if (!telegramConfigured()) return { sent: false, uncertain: false };
  const url = `${API_BASE}/bot${process.env.TELEGRAM_BOT_TOKEN}/sendMessage`;
  const outcomes = await Promise.all(
    chatIds().map(async (chat_id) => {
      try {
        const res = await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            chat_id,
            text,
            parse_mode: "HTML",
            disable_web_page_preview: true,
            ...(rows && rows.length
              ? { reply_markup: { inline_keyboard: rows.map((r) => r.map((b) => ({ text: b.text, url: b.url }))) } }
              : {}),
          }),
          signal: AbortSignal.timeout(10000),
        });
        if (!res.ok) {
          console.error("Telegram send refused: HTTP", res.status);
          return "refused";
        }
        return "sent";
      } catch (err) {
        console.error("Telegram send unconfirmed:", err?.name || "unknown");
        return "uncertain";
      }
    })
  );
  const sent = outcomes.includes("sent");
  return { sent, uncertain: !sent && outcomes.includes("uncertain") };
}
