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

export const initializePaystack = ({ email, amount, reference, onSuccess, onClose }) => {
  if (!window.PaystackPop) {
    console.error("Paystack script not loaded");
    return;
  }

  const publicKey = process.env.NEXT_PUBLIC_PAYSTACK_PUBLIC_KEY;
  if (!publicKey || publicKey.includes('dummy')) {
    console.warn("Using placeholder Paystack key. Please set NEXT_PUBLIC_PAYSTACK_PUBLIC_KEY in .env.local");
  }

  const handler = window.PaystackPop.setup({
    key: publicKey,
    email: email,
    amount: amount * 100, // Paystack expects amount in Kobo
    currency: 'NGN',
    ref: reference || 'ND_' + Math.floor((Math.random() * 1000000000) + 1), // Generate random reference if none provided
    callback: function(response) {
      if (onSuccess) onSuccess(response);
    },
    onClose: function() {
      if (onClose) onClose();
    }
  });

  handler.openIframe();
};
