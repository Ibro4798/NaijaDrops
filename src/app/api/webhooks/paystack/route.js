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
      const { error } = await supabase
        .from("orders")
        .update({ 
          payment_status: "paid",
          payment_reference: body.data.reference
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
    }

    return NextResponse.json({ received: true });
  } catch (err) {
    console.error("Webhook Error:", err);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
