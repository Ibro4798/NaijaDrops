"use client";

import { useEffect } from "react";

// FIX: error.jsx and global-error.jsx already exist and catch normal React
// render/throw errors - but the generic, unstyled "Application error: a
// client-side exception has occurred... (see the browser console)" text
// is something different: it's Next.js's own last-resort message, shown
// when a *lazy-loaded JS chunk fails to load entirely* - before React has
// anything to hand to an error boundary. This app leans heavily on
// dynamic(() => import(...)) for heavier pieces like the map, and that's
// exactly the shape of code that breaks this way.
//
// The classic trigger: someone has a tab open from *before* a new deploy
// goes out. The page in memory still references the old build's chunk
// hashes, but Vercel's CDN only serves the new build's files - so the
// moment that tab tries to lazy-load one of those old chunks (opening the
// map, navigating to a page that uses one), the fetch 404s and throws a
// ChunkLoadError that crashes the whole page before any of the app's own
// error handling can step in. It looks alarming, but the fix is just
// "load the current build" - a normal reload.
//
// This catches that specific failure shape (by error name/message, not by
// guessing at what triggered it) and reloads automatically, once, instead
// of leaving the person stuck on a dead screen. The sessionStorage guard
// stops it from looping if the reload somehow doesn't clear the problem
// (e.g. genuinely offline) - at that point it backs off and lets whatever
// error boundary is available take over normally.
function isChunkLoadFailure(message = "") {
  const text = String(message || "");
  return (
    text.includes("ChunkLoadError") ||
    text.includes("Loading chunk") ||
    text.includes("Failed to fetch dynamically imported module") ||
    text.includes("error loading dynamically imported module") ||
    text.includes("Importing a module script failed")
  );
}

const RELOAD_GUARD_KEY = "nd_chunk_reload_attempted";

function tryRecover(message) {
  if (typeof window === "undefined" || !isChunkLoadFailure(message)) return;

  try {
    if (sessionStorage.getItem(RELOAD_GUARD_KEY)) {
      // Already tried once this session and it's still happening - don't
      // loop forever, let the normal error boundary handle it instead.
      return;
    }
    sessionStorage.setItem(RELOAD_GUARD_KEY, "1");
  } catch {
    // Private browsing / storage disabled - still safe to attempt one
    // reload below, just without the loop guard.
  }

  window.location.reload();
}

export default function ChunkErrorRecovery() {
  useEffect(() => {
    // Clear the guard once a page has loaded cleanly, so a genuine future
    // deploy can still trigger one auto-recovery reload rather than being
    // silently blocked by a guard flag left over from a past session.
    try {
      sessionStorage.removeItem(RELOAD_GUARD_KEY);
    } catch {
      // ignore
    }

    const handleError = (event) => {
      tryRecover(event?.error?.message || event?.message);
    };
    const handleRejection = (event) => {
      tryRecover(event?.reason?.message || event?.reason);
    };

    window.addEventListener("error", handleError);
    window.addEventListener("unhandledrejection", handleRejection);
    return () => {
      window.removeEventListener("error", handleError);
      window.removeEventListener("unhandledrejection", handleRejection);
    };
  }, []);

  return null;
}
