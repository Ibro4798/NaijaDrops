"use client";

import { useEffect } from "react";

/**
 * Keeps the screen on while `active` is true (e.g. a rider on a live
 * delivery). Browsers throttle GPS and timers once the screen locks, so
 * this is what keeps live tracking flowing in an installed PWA / Trusted
 * Web Activity. The lock is released by the browser whenever the page is
 * hidden, so it is re-acquired when the page becomes visible again.
 * Fails silently where unsupported or denied (e.g. battery saver).
 */
export default function useWakeLock(active = true) {
  useEffect(() => {
    if (!active || typeof navigator === "undefined" || !("wakeLock" in navigator)) return;

    let lock = null;
    let stopped = false;

    const acquire = async () => {
      if (stopped || document.visibilityState !== "visible") return;
      try {
        const next = await navigator.wakeLock.request("screen");
        if (stopped) {
          next.release().catch(() => {});
          return;
        }
        lock = next;
        lock.addEventListener?.("release", () => {
          if (lock === next) lock = null;
        });
      } catch {
        // Denied or unsupported right now - not fatal.
      }
    };

    const onVisible = () => {
      if (document.visibilityState === "visible" && !lock) acquire();
    };

    document.addEventListener("visibilitychange", onVisible);
    acquire();

    return () => {
      stopped = true;
      document.removeEventListener("visibilitychange", onVisible);
      if (lock) lock.release().catch(() => {});
      lock = null;
    };
  }, [active]);
}
