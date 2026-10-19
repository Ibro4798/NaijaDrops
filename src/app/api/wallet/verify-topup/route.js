import { NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";
import { createAdminClient } from "@/utils/supabase/admin";

export const runtime = "nodejs";

// Confirms a Paystack top-up and credits the wallet. Safe to call twice: the database
// refuses to credit the same Paystack reference more than once.
export async function POST(req) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Please sign in." }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const reference = typeof body?.reference === "string" ? body.reference.trim() : "";
    if (!reference || reference.length > 100) {
      return NextResponse.json({ error: "Missing payment reference." }, { status: 400 });
    }
    if (!process.env.PAYSTACK_SECRET_KEY) {
      console.error("wallet verify-topup: PAYSTACK_SECRET_KEY is not set");
      return NextResponse.json({ error: "Payments are not configured. Contact support." }, { status: 500 });
    }

    const res = await fetch("https://api.paystack.co/transaction/verify/" + encodeURIComponent(reference), {
      headers: { Authorization: "Bearer " + process.env.PAYSTACK_SECRET_KEY },
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok || !json?.status) {
      return NextResponse.json({ error: json?.message || "Could not verify this payment with Paystack." }, { status: 502 });
    }

    const tx = json.data || {};
    if (tx.status !== "success") return NextResponse.json({ error: "This payment is " + tx.status + "." }, { status: 400 });
    if (tx.currency !== "NGN") return NextResponse.json({ error: "Unexpected currency." }, { status: 400 });

    // The payment must have been started as a top-up for THIS account.
    const meta = tx.metadata || {};
    if (meta.purpose !== "wallet_topup" || meta.userId !== user.id) {
      return NextResponse.json({ error: "This payment is not a wallet top-up for your account." }, { status: 400 });
    }

    const kobo = Number(tx.amount);
    if (!Number.isInteger(kobo) || kobo <= 0) return NextResponse.json({ error: "Invalid amount." }, { status: 400 });

    const admin = createAdminClient();

    // A payment that already paid for an order can never also fund a wallet.
    const { data: usedByOrder } = await admin.from("orders").select("id").eq("payment_reference", reference).limit(1);
    if (usedByOrder && usedByOrder.length > 0) {
      return NextResponse.json({ error: "This payment was already used for a delivery." }, { status: 409 });
    }

    const { data, error } = await admin.rpc("wallet_credit", {
      p_user_id: user.id,
      p_amount: kobo / 100,
      p_reference: reference,
      p_category: "topup",
      p_description: "Wallet top-up",
      p_metadata: { gateway: "paystack", channel: tx.channel || null },
    });
    if (error) {
      console.error("wallet verify-topup: credit failed", error.message);
      return NextResponse.json({ error: "We could not add the money yet. It will be credited automatically; contact support if it does not appear." }, { status: 500 });
    }

    return NextResponse.json({ success: true, status: data?.status, balance: data?.balance });
  } catch (err) {
    console.error("wallet verify-topup error:", err);
    return NextResponse.json({ error: "Something went wrong. Please try again." }, { status: 500 });
  }
}
