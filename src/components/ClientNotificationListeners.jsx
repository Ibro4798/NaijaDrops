"use client";

import dynamic from "next/dynamic";
import SilentErrorBoundary from "./SilentErrorBoundary";

// FIX: `ssr: false` was passed to next/dynamic() directly inside
// src/app/layout.js. layout.js has no "use client" directive - it's a
// Server Component - and Next.js explicitly forbids `ssr: false` there
// ("`ssr: false` is not allowed with `next/dynamic` in Server Components.
// Please move it into a Client Component."). That single line broke every
// production build since it was introduced; the site kept serving the last
// successful deploy from before it, silently, with no visible error to
// anyone but Vercel's build log. This file IS that "Client Component" the
// error message asks for - a tiny "use client" wrapper is all `ssr: false`
// needs to be legal again, while still keeping these two listeners out of
// the main bundle as their own async chunk.
const ChatNotificationListener = dynamic(() => import("./ChatNotificationListener"), { ssr: false });
const OrderStatusNotificationListener = dynamic(() => import("./OrderStatusNotificationListener"), { ssr: false });

// FIX: this component (and therefore these two dynamic imports) renders in
// layout.js as a sibling of {children}, not a descendant of it - so it sits
// OUTSIDE the tree app/error.jsx protects. If either listener's chunk fails
// to load (stale deploy tab, a network blip on a slow connection - see
// SilentErrorBoundary.jsx for the full chain), the render-time throw used
// to skip straight past app/error.jsx and hit app/global-error.jsx,
// crashing the entire app over a failed toast-notification chunk. Wrapping
// each listener in its own SilentErrorBoundary contains that failure to
// exactly what broke: no toasts for the rest of the session, nothing else
// affected.
export default function ClientNotificationListeners() {
  return (
    <>
      <SilentErrorBoundary>
        <ChatNotificationListener />
      </SilentErrorBoundary>
      <SilentErrorBoundary>
        <OrderStatusNotificationListener />
      </SilentErrorBoundary>
    </>
  );
}
