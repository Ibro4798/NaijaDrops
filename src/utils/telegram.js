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
 * Send one message to every configured chat. `buttons` = [{ text, url }] shown under the message.
 * Never throws and never logs the token. Returns true if at least one chat received it.
 */
export async function sendTelegram(text, { buttons } = {}) {
  if (!telegramConfigured()) return false;
  const url = `${API_BASE}/bot${process.env.TELEGRAM_BOT_TOKEN}/sendMessage`;
  const results = await Promise.all(
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
            ...(buttons && buttons.length
              ? { reply_markup: { inline_keyboard: [buttons.map((b) => ({ text: b.text, url: b.url }))] } }
              : {}),
          }),
          signal: AbortSignal.timeout(6000),
        });
        if (!res.ok) {
          console.error("Telegram send failed: HTTP", res.status);
          return false;
        }
        return true;
      } catch (err) {
        console.error("Telegram send error:", err?.name || "unknown");
        return false;
      }
    })
  );
  return results.some(Boolean);
}
