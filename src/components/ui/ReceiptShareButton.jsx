"use client";

import { useState } from "react";
import { Share2, Check, Loader2 } from "lucide-react";
import { renderReceiptImage } from "@/utils/receiptImage";

/**
 * Shares THIS specific delivery receipt AS AN IMAGE - not a link. Sharing
 * a bare URL meant the recipient had to open a browser and load the page
 * just to see what was shared; a receipt is the kind of thing people
 * expect to be able to forward directly as a picture (WhatsApp, etc.),
 * the same way a real payment receipt or POS slip would be shared.
 * Falls back to downloading the image if native file-sharing isn't
 * available on the device/browser.
 */
export default function ReceiptShareButton({ receiptData, className = "" }) {
  const [status, setStatus] = useState("idle"); // idle | rendering | done

  async function handleShare() {
    setStatus("rendering");
    try {
      const blob = await renderReceiptImage(receiptData);
      const file = new File([blob], `naijadrops-receipt-${String(receiptData.orderId).slice(0, 8)}.png`, { type: "image/png" });

      if (typeof navigator !== "undefined" && navigator.canShare && navigator.canShare({ files: [file] })) {
        await navigator.share({
          files: [file],
          title: "NaijaDrops delivery receipt",
          text: `Delivery receipt for ${receiptData.itemDescription || "your package"} - ₦${Number(receiptData.total).toLocaleString()}`,
        });
        setStatus("idle");
        return;
      }

      // Fallback: device/browser can't share files - download it instead
      // so there's still a usable receipt image rather than a dead end.
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = file.name;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      setStatus("done");
      setTimeout(() => setStatus("idle"), 2000);
    } catch (err) {
      if (err?.name !== "AbortError") console.error("Receipt share failed:", err);
      setStatus("idle");
    }
  }

  return (
    <button
      type="button"
      onClick={handleShare}
      disabled={status === "rendering"}
      className={`flex items-center justify-center gap-2 py-3 bg-white/5 border border-white/10 rounded-2xl text-ink text-xs font-black uppercase tracking-widest hover:bg-white/10 transition-all active:scale-95 disabled:opacity-60 ${className}`}
    >
      {status === "rendering" ? (
        <><Loader2 size={16} className="animate-spin" /> Preparing...</>
      ) : status === "done" ? (
        <><Check size={16} className="text-emerald-500" /> Saved</>
      ) : (
        <><Share2 size={16} /> Share Receipt</>
      )}
    </button>
  );
}