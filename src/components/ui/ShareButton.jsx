"use client";

import { useState } from "react";
import { Share2, Check, MessageCircle } from "lucide-react";

const SHARE_URL = "https://naijadrops.tech";
const SHARE_TEXT =
  "No more chasing riders on the phone 📦 NaijaDrops tracks every delivery live, right here in Kano. Launching August 10 — check it out:";

export default function ShareButton({ className = "" }) {
  const [copied, setCopied] = useState(false);

  async function handleShare() {
    // Native share sheet — on Android (the default here) this surfaces
    // WhatsApp, Instagram DM, SMS etc. directly. This is the primary path
    // since almost everyone in the ICP is on a WhatsApp-first Android phone.
    if (typeof navigator !== "undefined" && navigator.share) {
      try {
        await navigator.share({
          title: "NaijaDrops — Kano",
          text: SHARE_TEXT,
          url: SHARE_URL,
        });
        return;
      } catch (err) {
        // User cancelled the native sheet — do nothing, don't fall through
        if (err?.name === "AbortError") return;
      }
    }

    // Fallback for browsers without navigator.share (mostly desktop):
    // open a pre-filled WhatsApp chat, since that's the dominant channel here.
    const waUrl = `https://wa.me/?text=${encodeURIComponent(`${SHARE_TEXT} ${SHARE_URL}`)}`;
    window.open(waUrl, "_blank", "noopener,noreferrer");

    // Also copy the link as a quiet secondary convenience
    try {
      await navigator.clipboard.writeText(SHARE_URL);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // clipboard not available — no big deal, WhatsApp tab already opened
    }
  }

  return (
    <button
      type="button"
      onClick={handleShare}
      className={`group inline-flex items-center gap-2 text-emerald-400 hover:text-emerald-300 text-xs font-black uppercase tracking-widest transition-colors ${className}`}
    >
      {copied ? (
        <>
          <Check size={14} />
          Link copied
        </>
      ) : (
        <>
          <Share2 size={14} className="group-hover:scale-110 transition-transform" />
          Share with a vendor or rider
        </>
      )}
    </button>
  );
}