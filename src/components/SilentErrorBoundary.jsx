"use client";

import { Component } from "react";

// FIX (the actual crash in the "Something went wrong" screenshot): a
// customer on a slow/flaky Kano connection hit a failed chunk load inside
// ChatNotificationListener or OrderStatusNotificationListener - both
// dynamic(..., { ssr: false }) imports rendered directly in layout.js as
// siblings of {children}, not descendants of it. That placement matters:
// app/error.jsx only wraps the routed page tree ({children}), so a render-
// time throw from either of these two toast listeners skips straight past
// it and hits app/global-error.jsx instead - crashing the ENTIRE app
// (navigation, forms, everything) for the failure of two nonessential
// background toast listeners. ChunkErrorRecovery's window.onerror listener
// doesn't catch this either: React's error-boundary mechanism intercepts a
// render-phase throw internally, before it ever becomes an uncaught global
// error event.
//
// This is a plain class component because React error boundaries still
// require the class lifecycle (getDerivedStateFromError/componentDidCatch)
// - there's no functional equivalent yet. Deliberately minimal: on error,
// log it and render nothing. Losing toast notifications for the rest of a
// session is a fine trade-off for never taking down the whole app over
// them.
export default class SilentErrorBoundary extends Component {
  state = { hasErrored: false };

  static getDerivedStateFromError() {
    return { hasErrored: true };
  }

  componentDidCatch(error) {
    console.error("[NOTIFICATION_LISTENER_ERROR]", error);
  }

  render() {
    if (this.state.hasErrored) return null;
    return this.props.children;
  }
}
