"use client";

import { useEffect } from "react";
import { AlertTriangle, RotateCcw, Home } from "lucide-react";

// FIX (better error handling): before this, any unexpected/unhandled error
// anywhere in the app rendered Next.js's default error screen - a blank or
// generic page with no way back in, no matter how small the underlying
// problem was (a bad link paste triggering a downstream crash was one real
// example, but this covers any similar case). This is the app-wide safety
// net: it catches anything that wasn't already handled closer to where it
// happened, logs it, and gives the person a real way to recover instead of
// a dead end.
export default function ErrorBoundary({ error, reset }) {
  useEffect(() => {
    console.error("[APP_ERROR]", error);
  }, [error]);

  return (
    <div className="min-h-screen bg-charcoal-950 flex flex-col items-center justify-center px-6 text-center">
      <div className="w-16 h-16 bg-red-500/10 border border-red-500/20 rounded-[2rem] flex items-center justify-center mb-6">
        <AlertTriangle className="text-red-400" size={28} />
      </div>
      <p className="text-ink font-black text-xl font-outfit mb-2">Something went wrong</p>
      <p className="text-charcoal-400 text-sm max-w-xs mb-8 leading-relaxed">
        That's on us, not you. Try again - if it keeps happening, head back home and try a different path.
      </p>
      <div className="flex flex-col sm:flex-row gap-3 w-full max-w-xs">
        <button
          onClick={() => reset()}
          className="flex-1 flex items-center justify-center gap-2 py-4 bg-emerald-500 hover:bg-emerald-400 text-charcoal-950 rounded-2xl font-black text-xs uppercase tracking-widest transition-all active:scale-95"
        >
          <RotateCcw size={14} /> Try Again
        </button>
        <a
          href="/"
          className="flex-1 flex items-center justify-center gap-2 py-4 bg-white/5 border border-white/10 hover:bg-white/10 text-ink rounded-2xl font-black text-xs uppercase tracking-widest transition-all active:scale-95"
        >
          <Home size={14} /> Go Home
        </a>
      </div>
    </div>
  );
}
