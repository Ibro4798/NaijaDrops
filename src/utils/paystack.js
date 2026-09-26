"use client";

// Utility to dynamically load the Paystack JS script
export const loadPaystackScript = () => {
  return new Promise((resolve) => {
    if (window.PaystackPop) {
      resolve(true);
      return;
    }

    const script = document.createElement('script');
    script.src = 'https://js.paystack.co/v1/inline.js';
    script.async = true;
    
    script.onload = () => {
      resolve(true);
    };
    
    script.onerror = () => {
      resolve(false);
    };

    document.body.appendChild(script);
  });
};

export const initializePaystack = ({ email, amount, reference, metadata, onSuccess, onClose, onError }) => {
  if (!window.PaystackPop) {
    console.error("Paystack script not loaded");
    if (onError) onError("Payment gateway failed to load. Check your connection and try again.");
    return;
  }

  const publicKey = process.env.NEXT_PUBLIC_PAYSTACK_PUBLIC_KEY;
  // FIX: this used to only console.warn on a missing/placeholder key and
  // then call PaystackPop.setup() anyway with an undefined/dummy key -
  // Paystack's inline widget just fails silently in that case (no popup,
  // no visible error), which is exactly why "Pay Now" looked like it did
  // nothing. Now it stops before ever opening the iframe and reports a
  // real, visible error back to the page instead.
  if (!publicKey || publicKey.includes('dummy')) {
    console.error("NEXT_PUBLIC_PAYSTACK_PUBLIC_KEY is missing or a placeholder - set it in .env.local (and in Vercel's Production env vars, then redeploy, since NEXT_PUBLIC_ vars are baked in at build time).");
    if (onError) onError("Payments aren't configured yet on this deployment.");
    return;
  }

  const handler = window.PaystackPop.setup({
    key: publicKey,
    email: email,
    amount: amount * 100, // Paystack expects amount in Kobo
    currency: 'NGN',
    ref: reference || 'ND_' + Math.floor((Math.random() * 1000000000) + 1), // Generate random reference if none provided
    metadata: metadata || {},
    callback: function(response) {
      if (onSuccess) onSuccess(response);
    },
    onClose: function() {
      if (onClose) onClose();
    }
  });

  handler.openIframe();
};
