"use client";

import dynamic from "next/dynamic";

// FIX (the actual deploy-breaking bug): `ssr: false` was passed to
// next/dynamic() directly inside src/app/layout.js. layout.js has no
// "use client" directive - it's a Server Component - and Next.js
// explicitly forbids `ssr: false` there ("`ssr: false` is not allowed
// with `next/dynamic` in Server Components. Please move it into a Client
// Component."). That single line broke every production build since it
// was introduced; the site kept serving the last successful deploy from
// before it, silently, with no visible error to anyone but Vercel's build
// log. This file IS that "Client Component" the error message asks for -
// a tiny "use client" wrapper is all `ssr: false` needs to be legal again,
// while still keeping these two listeners out of the main bundle as their
// own async chunk.
const ChatNotificationListener = dynamic(() => import("./ChatNotificationListener"), { ssr: false });
const OrderStatusNotificationListener = dynamic(() => import("./OrderStatusNotificationListener"), { ssr: false });

export default function ClientNotificationListeners() {
  return (
    <>
      <ChatNotificationListener />
      <OrderStatusNotificationListener />
    </>
  );
}
