"use client";

import { useEffect } from "react";

export default function ServiceWorkerRegister() {
  useEffect(() => {
    if (typeof window === "undefined" || !("serviceWorker" in navigator)) return;
    // Registered once, no error surfaced to the user if it fails (older
    // browsers, private-browsing restrictions, etc.) - it's a nice-to-have
    // for installability, never something the app depends on to function.
    navigator.serviceWorker.register("/sw.js").catch(() => {});
  }, []);

  return null;
}
