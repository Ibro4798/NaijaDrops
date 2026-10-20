import { NextResponse } from "next/server";
import { validateAdmin } from "@/utils/admin";
import { sendTelegram, telegramConfigured } from "@/utils/telegram";

export const runtime = "nodejs";

// Open https://www.naijadrops.tech/api/admin/telegram-test while signed in as an admin.
// Sends one harmless test message and tells you whether Telegram alerts are set up. Shows no secrets.
export async function GET() {
  try {
    await validateAdmin();
  } catch (err) {
    const forbidden = /Forbidden/i.test(err?.message || "");
    return NextResponse.json({ error: forbidden ? "Forbidden" : "Unauthorized" }, { status: forbidden ? 403 : 401 });
  }
  if (!telegramConfigured()) {
    return NextResponse.json({
      configured: false,
      sent: false,
      hint: "Set TELEGRAM_BOT_TOKEN and TELEGRAM_ADMIN_CHAT_ID in Vercel, then redeploy.",
    });
  }
  const sent = await sendTelegram("\u2705 <b>NaijaDrops alerts are working.</b>\nYou will get a message like this for every new order.");
  return NextResponse.json({
    configured: true,
    sent,
    hint: sent ? "Check Telegram." : "Telegram refused it. Check the token, and that you pressed Start on the bot (or added it to the group).",
  });
}
