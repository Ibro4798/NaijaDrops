NAIJADROPS - PLAY STORE PREP + PAYMENT TIMING
============================

HOW TO RUN
1. Put this whole PlayStorePrep folder in the ROOT of your NaijaDrops repo (next to package.json).
2. In PowerShell from that root:
     powershell -ExecutionPolicy Bypass -File .\PlayStorePrep\00-Apply-All.ps1
   (or run 01..05 one at a time)
3. npm run build   ->   commit   ->   deploy.

Every file that is replaced gets a timestamped .bak next to it. If a file differs from the
version these scripts were built against (you edited it), the script STOPS before changing
anything and lists it. Re-run with -Force only if you are sure.

WHAT EACH SCRIPT DOES
01  /api/admin/delete-user and /api/admin/invite-rider now require a signed-in admin
    (delete-user: super admin only). Before this, anyone could call them.
02  Self-service account deletion: /api/account/delete, a "Delete account" section on the
    profile page, a public /delete-account page (the web link Google Play asks for),
    a full privacy policy rewrite, and a footer link.
03  Full-bleed icons + separate maskable icons + manifest, removes the stale "Launching Aug 29"
    from the page title / social tags, and removes "Launching Aug 10" from the share image.
04  Location disclosure before the first location prompt, screen stays awake during an active
    delivery, and the Android Back button closes the map / chat / review sheet / photo viewer.
05  Order step 2: package photo and Notify Receiver removed. Only size, description and
    receiver details remain.
06  Paystack placeholder emails changed from @naijadrops.com to @naijadrops.tech (a domain you own).
07  Two payment modes, chosen when the order is created:
      AFTER YOU AGREE A PRICE - negotiate, accept a rider, pay, rider heads to pickup (today's flow).
      AT PICKUP - rider heads to pickup first. Reaching the pickup point (GPS or a slide) asks the
      customer to pay; the rider sets off only after payment is confirmed. Drop-off and receiver
      details stay hidden from the rider until then. Riders see a "Pay at pickup" notice BEFORE
      they accept. The customer gets a push notification and an in-app Pay button on arrival.
      Scheduled / ops 'required' orders still pay first, as before.

ALREADY APPLIED TO YOUR LIVE SUPABASE PROJECT (nothing to run)
- play_prep_security_hardening: lead views locked, function search_path pinned, trigger-only
  functions closed to the public API.
- payment_timing_pay_at_pickup: new orders.payment_timing and orders.pickup_arrived_at columns,
  plus a database rule so an unpaid order cannot move to picked_up / in_transit / delivered
  (service role and admins are exempt). Existing orders keep today's behaviour.
- anonymize_account_function: the database function script 02's delete route calls.
  Service-role only. Refuses while an order is in progress or a payout is pending.
  IMPORTANT: deploy script 02 only AFTER confirming SUPABASE_SERVICE_ROLE_KEY is set in Vercel.

STILL MANUAL
- Supabase: Authentication > Sign In / Providers > Email > "Prevent use of leaked passwords"
  (needs the Pro plan).
- privacy@naijadrops.tech must keep working (you created it). Both new pages point to it.
- Play Console listing icon: use play-store-icon-512.png (512x512, no pre-rounded corners).
- Smoke test after deploy (see the chat summary).

KNOWN GAPS (follow-up)
- If a customer never pays at pickup, the rider has no 'release this job' button (same limitation
  as today's waiting-for-payment screen). Worth adding before real volume.

NOT CHANGED (worth a follow-up)
- /api/dispatch has no caller check (it runs with the service role for any orderId).
- /api/notify-delivery is an SMS stub; add auth before wiring a real SMS provider.
