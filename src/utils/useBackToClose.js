"use client";

import { useEffect, useRef } from "react";

/**
 * Makes the Android Back button / back-swipe CLOSE an open overlay instead
 * of leaving the app (which is what a Trusted Web Activity does when
 * history is empty).
 *
 * While `isOpen` is true it pushes one history entry; pressing Back pops
 * that entry and calls `onClose`. If the overlay is closed some other way
 * (its X button, a successful action) the extra entry is removed again -
 * but only when it is still the current one, so a navigation that happens
 * at the same moment is never undone.
 */
export default function useBackToClose(isOpen, onClose) {
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  useEffect(() => {
    if (!isOpen || typeof window === "undefined") return;

    const marker = `nd-overlay-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    window.history.pushState({ ndOverlay: marker }, "");
    let closedByBack = false;

    const onPop = () => {
      closedByBack = true;
      closeRef.current?.();
    };
    window.addEventListener("popstate", onPop);

    return () => {
      window.removeEventListener("popstate", onPop);
      if (!closedByBack && window.history.state?.ndOverlay === marker) {
        window.history.back();
      }
    };
  }, [isOpen]);
}
