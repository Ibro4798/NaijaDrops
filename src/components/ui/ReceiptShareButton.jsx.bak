"use client";

import { useState } from "react";
import { Share2, Check } from "lucide-react";

/**
 * Shares THIS specific delivery receipt (its own URL + a short summary of
 * this order) - deliberately separate from the generic ShareButton used on
 * the landing page, which shares the marketing site instead. Mixing the two
 * up is exactly what made the old "Share" button on the receipt view feel
 * generic instead of about the actual delivery that just happened.
 */
export default function ReceiptShareButton({ itemDescription, price, className = "" }) {
  const [copied, setCopied] = useState(false);

  async function handleShare() {
    const url = typeof window !== "undefined" ? window.location.href : "";
    const priceText = price ? ` (â‚¦${Number(price).toLocaleString()})` : "";
    const text = `Delivery receipt${itemDescription ? ` for ${itemDescription}` : ""}${priceText} â€” delivered via NaijaDrops.`;

    if (typeof navigator !== "undefined" && navigator.share) {
      try {
        await navigator.share({ title: "NaijaDrops delivery receipt", text, url });
        return;
      } catch (err) {
        if (err?.name === "AbortError") return;
      }
    }

    if (typeof navigator !== "undefined" && navigator.clipboard) {
      try {
        await navigator.clipboard.writeText(url);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
        return;
      } catch {
        // ignore - nothing else we can do without navigator.share or clipboard
      }
    }
  }

  return (
    <button
      type="button"
      onClick={handleShare}
      className={`flex items-center justify-center gap-2 py-3 bg-white/5 border border-white/10 rounded-2xl text-ink text-xs font-black uppercase tracking-widest hover:bg-white/10 transition-all active:scale-95 ${className}`}
    >
      {copied ? <><Check size={16} className="text-emerald-500" /> Link Copied</> : <><Share2 size={16} /> Share Receipt</>}
    </button>
  );
}