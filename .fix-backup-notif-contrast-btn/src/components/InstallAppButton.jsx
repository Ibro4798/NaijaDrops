"use client";

import { useState, useEffect } from "react";
import { Download, Share, Plus, X, Smartphone } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

function isIOS() {
  if (typeof navigator === "undefined") return false;
  return /iphone|ipad|ipod/i.test(navigator.userAgent);
}

function isStandalone() {
  if (typeof window === "undefined") return false;
  // Two different signals for "already installed": the standard media
  // query (Chrome/Edge/Android) and Safari's own non-standard flag (iOS
  // has no beforeinstallprompt at all, so this is the only way to know).
  return (
    window.matchMedia?.("(display-mode: standalone)")?.matches ||
    window.navigator.standalone === true
  );
}

/**
 * No money for Play Store/App Store ranking right now, so this is the
 * substitute: a direct "install this as an app" path straight from the
 * homepage, using the browser's own install mechanism (PWA) rather than
 * an app store listing. Chrome/Edge/Android get the real one-tap native
 * prompt; iOS Safari doesn't expose that API at all, so it gets clear
 * manual instructions instead - there's no way around that limitation,
 * it's an iOS platform restriction, not something fixable from the app.
 */
export default function InstallAppButton({ className = "" }) {
  const [deferredPrompt, setDeferredPrompt] = useState(null);
  const [installed, setInstalled] = useState(false);
  const [showIOSSheet, setShowIOSSheet] = useState(false);
  const [ios, setIos] = useState(false);

  // Deliberately NOT computed during render (e.g. via a lazy useState
  // initializer) - isIOS()/isStandalone() read `window`/`navigator`,
  // which don't exist during SSR. Computing them at render time would
  // make the server-rendered HTML (always "false") disagree with the
  // client's very first render, which is a real hydration mismatch, not
  // just a lint nag. Starting both at `false` to match what the server
  // rendered, then correcting them here after mount, is the standard
  // SSR-safe pattern for browser-only detection.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- see comment above: must run after mount, not during render, to stay SSR-safe
    setIos(isIOS());
    setInstalled(isStandalone());

    const handlePrompt = (e) => {
      e.preventDefault();
      setDeferredPrompt(e);
    };
    const handleInstalled = () => {
      setInstalled(true);
      setDeferredPrompt(null);
    };

    window.addEventListener("beforeinstallprompt", handlePrompt);
    window.addEventListener("appinstalled", handleInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", handlePrompt);
      window.removeEventListener("appinstalled", handleInstalled);
    };
  }, []);

  // Already installed, or a browser that doesn't support any install path
  // at all and isn't iOS (no way to help there) - nothing useful to show.
  if (installed || (!deferredPrompt && !ios)) return null;

  async function handleClick() {
    if (ios) {
      setShowIOSSheet(true);
      return;
    }
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    await deferredPrompt.userChoice;
    // Whether accepted or dismissed, this specific prompt event can only
    // be used once - clear it either way so the button reflects reality.
    setDeferredPrompt(null);
  }

  return (
    <>
      <button
        onClick={handleClick}
        className={`inline-flex items-center gap-1.5 px-3.5 py-2 bg-white/[0.08] hover:bg-white/[0.14] border border-white/15 rounded-xl text-white font-black text-[10px] uppercase tracking-widest transition-all active:scale-95 ${className}`}
      >
        <Download size={13} /> Install
      </button>

      <AnimatePresence>
        {showIOSSheet && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setShowIOSSheet(false)}
            className="fixed inset-0 z-[300] bg-charcoal-950/80 backdrop-blur-sm flex items-end sm:items-center justify-center p-4"
          >
            <motion.div
              initial={{ y: 40, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 40, opacity: 0 }}
              onClick={(e) => e.stopPropagation()}
              className="w-full max-w-sm bg-charcoal-900 border border-white/10 rounded-[2rem] p-6"
            >
              <div className="flex items-center justify-between mb-5">
                <div className="flex items-center gap-2.5">
                  <div className="w-9 h-9 bg-emerald-500/10 border border-emerald-500/20 rounded-xl flex items-center justify-center text-emerald-400">
                    <Smartphone size={16} />
                  </div>
                  <h3 className="text-white font-black text-sm uppercase tracking-widest">Add to Home Screen</h3>
                </div>
                <button onClick={() => setShowIOSSheet(false)} className="w-9 h-9 flex items-center justify-center text-charcoal-500 hover:text-white">
                  <X size={18} />
                </button>
              </div>
              <ol className="space-y-4">
                <li className="flex items-start gap-3">
                  <span className="w-6 h-6 rounded-full bg-white/10 flex items-center justify-center text-white text-xs font-black shrink-0">1</span>
                  <p className="text-charcoal-300 text-sm leading-relaxed flex items-center gap-1.5 flex-wrap">
                    Tap the Share icon <Share size={14} className="inline text-emerald-400" /> in Safari&apos;s toolbar
                  </p>
                </li>
                <li className="flex items-start gap-3">
                  <span className="w-6 h-6 rounded-full bg-white/10 flex items-center justify-center text-white text-xs font-black shrink-0">2</span>
                  <p className="text-charcoal-300 text-sm leading-relaxed flex items-center gap-1.5 flex-wrap">
                    Scroll down and tap <span className="text-white font-bold inline-flex items-center gap-1">Add to Home Screen <Plus size={13} /></span>
                  </p>
                </li>
                <li className="flex items-start gap-3">
                  <span className="w-6 h-6 rounded-full bg-white/10 flex items-center justify-center text-white text-xs font-black shrink-0">3</span>
                  <p className="text-charcoal-300 text-sm leading-relaxed">Tap <span className="text-white font-bold">Add</span> - NaijaDrops now opens like any other app.</p>
                </li>
              </ol>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
