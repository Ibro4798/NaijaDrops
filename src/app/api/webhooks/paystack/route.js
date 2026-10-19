import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import crypto from "crypto";

// Use Service Role key for backend operations
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY 
);

export async function POST(req) {
  try {
    const rawBody = await req.text();
    const body = JSON.parse(rawBody);
    const signature = req.headers.get("x-paystack-signature");

    // Verify signature
    const hash = crypto
      .createHmac("sha512", process.env.PAYSTACK_SECRET_KEY)
      .update(rawBody)
      .digest("hex");

    if (hash !== signature) {
      console.error("Paystack Webhook: Invalid Signature");
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const event = body.event;
    console.log(`Paystack Webhook Event: ${event}`);

    if (event === "charge.success") {
      // WALLET TOP-UP (backup for a closed browser): credit the wallet. The database refuses to credit
      // the same reference twice, so this is safe alongside /api/wallet/verify-topup.
      if (body.data.metadata?.purpose === "wallet_topup") {
        const topupUser = body.data.metadata.userId;
        const naira = Number(body.data.amount) / 100;
        if (!topupUser || body.data.currency !== "NGN" || !(naira > 0)) {
          console.error(`Webhook: invalid wallet top-up ${body.data.reference} - ignoring.`);
          return NextResponse.json({ received: true });
        }
        const { data: usedByOrder } = await supabase.from("orders").select("id").eq("payment_reference", body.data.reference).limit(1);
        if (usedByOrder && usedByOrder.length > 0) {
          console.error(`Webhook: top-up reference ${body.data.reference} already paid an order - ignoring.`);
          return NextResponse.json({ received: true });
        }
        const { error: creditErr } = await supabase.rpc("wallet_credit", {
          p_user_id: topupUser,
          p_amount: naira,
          p_reference: body.data.reference,
          p_category: "topup",
          p_description: "Wallet top-up",
          p_metadata: { gateway: "paystack", via: "webhook" },
        });
        if (creditErr) {
          console.error("Webhook wallet credit failed:", creditErr.message);
          return NextResponse.json({ error: "credit failed" }, { status: 500 }); // Paystack will retry
        }
        return NextResponse.json({ received: true });
      }

      const { orderId, riderId } = body.data.metadata || {};
      
      if (!orderId) {
        return NextResponse.json({ error: "Missing metadata" }, { status: 400 });
      }

      // Same reference-binding as verify-payment: records which transaction
      // paid for this order and relies on the same partial unique index to
      // reject a reference already claimed by a different order. A 23505
      // here is treated as informational, not an error - this route trusts
      // Paystack's own metadata (set at initialization, echoed back on a
      // signature-verified event), so a conflict here means the reference
      // was already recorded by verify-payment for the same order moments
      // earlier, not an attack.
      // PAY FIRST: never mark an order paid unless Paystack actually collected
      // at least the order's price. Metadata alone can be forged, so the
      // amount and currency are checked against our own record.
      const { data: orderRow } = await supabase
        .from("orders")
        .select("agreed_price, payment_status, status, delivery_pin")
        .eq("id", orderId)
        .maybeSingle();

      if (!orderRow) {
        console.error(`Webhook: order ${orderId} not found - ignoring.`);
        return NextResponse.json({ received: true });
      }

      const paidKobo = Number(body.data.amount) || 0;
      if (!orderRow.agreed_price || paidKobo < orderRow.agreed_price * 100 || body.data.currency !== "NGN") {
        console.error(`Webhook: amount/currency mismatch for order ${orderId} (paid ${paidKobo} ${body.data.currency}, expected ${orderRow.agreed_price} NGN) - NOT marking paid.`);
        return NextResponse.json({ received: true });
      }

      if (orderRow.payment_status === "paid") {
        return NextResponse.json({ received: true });
      }

      // A wallet top-up reference can never also pay for an order.
      const { data: ledgerHit } = await supabase.from("wallet_ledger").select("id").eq("reference", body.data.reference).limit(1);
      if (ledgerHit && ledgerHit.length > 0) {
        console.error(`Webhook: reference ${body.data.reference} was a wallet top-up; refusing to apply it to order ${orderId}.`);
        return NextResponse.json({ received: true });
      }

      const { error } = await supabase
        .from("orders")
        .update({
          payment_status: "paid",
          payment_method: "paystack",
          payment_reference: body.data.reference,
          // verify-payment normally issues the delivery PIN; make sure a webhook-first payment gets one too.
          delivery_pin: orderRow.delivery_pin || String(Math.floor(1000 + Math.random() * 9000)),
          price_locked: true
        })
        .eq("id", orderId);

      if (error) {
        if (error.code === "23505") {
          console.warn(`Webhook: reference ${body.data.reference} already recorded (likely by verify-payment moments earlier, or a duplicate webhook delivery) - not an error.`);
        } else {
          console.error("Order Update Error:", error);
          return NextResponse.json({ error: error.message }, { status: 500 });
        }
      }

      console.log(`Order ${orderId} payment confirmed via Paystack webhook.`);

      if (!error && orderRow.status === "cancelled") {
        console.error(`REFUND NEEDED: order ${orderId} was cancelled but a payment arrived (${body.data.reference}).`);
      }

      // PAY FIRST: now that the order is paid, notify riders (the dispatch
      // route itself skips scheduled, unpaid-required and non-waiting orders).
      if (!error) {
        try {
          await fetch(`${new URL(req.url).origin}/api/dispatch`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ orderId }),
            signal: AbortSignal.timeout(8000),
          });
        } catch (dispatchErr) {
          console.error("Post-payment dispatch failed (webhook):", dispatchErr);
        }
      }
    }

    return NextResponse.json({ received: true });
  } catch (err) {
    console.error("Webhook Error:", err);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
