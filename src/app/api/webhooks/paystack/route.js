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
      const { orderId, riderId } = body.data.metadata;
      
      if (!orderId) {
        return NextResponse.json({ error: "Missing metadata" }, { status: 400 });
      }

      // Update order to AUTHORIZED state
      // This is the trigger for the driver to start moving
      const { error } = await supabase
        .from("orders")
        .update({ 
          payment_status: "authorized",
          status: "assigned" 
        })
        .eq("id", orderId);

      if (error) {
        console.error("Order Update Error:", error);
        return NextResponse.json({ error: error.message }, { status: 500 });
      }

      console.log(`Order ${orderId} successfully authorized via Paystack.`);
    }

    return NextResponse.json({ received: true });
  } catch (err) {
    console.error("Webhook Error:", err);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
