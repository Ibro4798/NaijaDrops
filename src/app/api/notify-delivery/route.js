import { NextResponse } from 'next/server';

/**
 * notify-delivery API stub
 * 
 * Logs the SMS payload to the server console.
 * To activate real SMS, replace the console.log below with a Termii or Twilio call.
 * 
 * Termii: POST https://api.ng.termii.com/api/sms/send
 * Twilio: POST https://api.twilio.com/2010-04-01/Accounts/{SID}/Messages.json
 */
export async function POST(request) {
  try {
    const { orderId, trackingUrl, recipientPhone } = await request.json();

    const message = `Your NaijaDrops delivery is on the way! Track it live: ${trackingUrl}`;

    // === STUB: Replace with real SMS provider ===
    console.log(`[SMS STUB] To: ${recipientPhone || 'receiver'} | Order: ${orderId}`);
    console.log(`[SMS STUB] Message: ${message}`);
    // ===========================================

    // TODO: Uncomment and configure one of these:
    //
    // TERMII:
    // await fetch('https://api.ng.termii.com/api/sms/send', {
    //   method: 'POST',
    //   headers: { 'Content-Type': 'application/json' },
    //   body: JSON.stringify({
    //     to: recipientPhone, from: 'NaijaDrops', sms: message,
    //     type: 'plain', channel: 'dnd', api_key: process.env.TERMII_API_KEY
    //   })
    // });
    //
    // TWILIO:
    // const client = twilio(process.env.TWILIO_SID, process.env.TWILIO_AUTH_TOKEN);
    // await client.messages.create({ body: message, from: process.env.TWILIO_NUMBER, to: recipientPhone });

    return NextResponse.json({ ok: true, stubbed: true });
  } catch (err) {
    console.error('[notify-delivery] Error:', err);
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 });
  }
}
