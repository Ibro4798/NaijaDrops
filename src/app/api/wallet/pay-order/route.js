import { NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";
import { createAdminClient } from "@/utils/supabase/admin";

export const runtime = "nodejs";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const ERRORS = {
  INSUFFICIENT_FUNDS: [402, "Your wallet balance is not enough for this delivery."],
  NOT_ORDER_OWNER: [403, "This order belongs to a different account."],
  ORDER_NOT_FOUND: [404, "Order not found."],
  ORDER_NOT_PAYABLE: [409, "This order can no longer be paid."],
  NO_PRICE: [409, "This order has no agreed price yet."],
  WALLET_LOCKED: [403, "Your wallet is locked. Please contact support."],
};

// Pays for an order from the signed-in user's wallet. The debit and the "order is paid" update
// happen in ONE database transaction, so you can never be charged without the order being paid.
export async function POST(req) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Please sign in." }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const orderId = body?.orderId;
    if (typeof orderId !== "string" || !UUID_RE.test(orderId)) {
      return NextResponse.json({ error: "Invalid order." }, { status: 400 });
    }

    const admin = createAdminClient();
    const { data, error } = await admin.rpc("wallet_pay_order", { p_user_id: user.id, p_order_id: orderId });

    if (error) {
      const code = Object.keys(ERRORS).find((k) => error.message?.includes(k));
      if (code) {
        const extra = {};
        if (code === "INSUFFICIENT_FUNDS") {
          const { data: w } = await admin.from("user_wallets").select("balance").eq("user_id", user.id).maybeSingle();
          extra.balance = Number(w?.balance || 0);
        }
        return NextResponse.json({ error: ERRORS[code][1], code, ...extra }, { status: ERRORS[code][0] });
      }
      console.error("wallet pay-order failed:", error.message);
      return NextResponse.json({ error: "We could not complete the payment. You have not been charged." }, { status: 500 });
    }

    // Same follow-up as a card payment: now that it is paid, notify riders
    // (the dispatch route itself skips scheduled and not-waiting orders).
    if (data?.status === "paid") {
      try {
        await fetch(new URL(req.url).origin + "/api/dispatch", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ orderId }),
          signal: AbortSignal.timeout(8000),
        });
      } catch (dispatchErr) {
        console.error("Post-wallet-payment dispatch failed (the tracking page retries):", dispatchErr);
      }
    }

    return NextResponse.json({ success: true, status: data?.status, balance: data?.balance });
  } catch (err) {
    console.error("wallet pay-order error:", err);
    return NextResponse.json({ error: "Something went wrong. You have not been charged." }, { status: 500 });
  }
}
