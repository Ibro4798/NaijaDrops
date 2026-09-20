"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { Bell, X } from "lucide-react";
import { createClient } from "@/utils/supabase/client";
import { subscribeToPush } from "@/utils/push/subscribe";

// Nothing in the codebase ever called Notification.requestPermission() -
// OrderStatusNotificationListener and ChatNotificationListener both already
// had a `new Notification(...)` call gated on `Notification.permission ===
// 'granted'`, but permission defaults to "default" and stays there forever
// if nobody asks. Both were effectively dead code. This is the one place
// that actually asks, and it also subscribes the device for real push (works
// even if the tab is backgrounded or the browser is fully closed - the
// in-tab Notification() calls elsewhere only fire while the tab is open,
// even if hidden behind another app).
export default function NotificationPermissionPrompt() {
  const pathname = usePathname();
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (pathname?.startsWith("/ops-terminal")) return;
    if (!("Notification" in window) || !("serviceWorker" in navigator) || !("PushManager" in window)) return;
    if (Notification.permission !== "default") return;
    if (sessionStorage.getItem("np_dismissed")) return;

    const timer = setTimeout(() => setVisible(true), 4000);
    return () => clearTimeout(timer);
  }, [pathname]);

  async function handleEnable() {
    setVisible(false);
    try {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return; // anonymous visitors have nothing to subscribe against

      const permission = await Notification.requestPermission();
      if (permission !== "granted") return;

      await subscribeToPush();
    } catch {
      // Silent - notifications are a nice-to-have, never block the app on this.
    }
  }

  function handleDismiss() {
    setVisible(false);
    sessionStorage.setItem("np_dismissed", "1");
  }

  if (!visible) return null;

  return (
    <div className="fixed bottom-24 left-4 right-4 z-[998] max-w-sm mx-auto sm:left-auto sm:right-4">
      <div className="glass-dark border border-white/10 rounded-[2rem] p-4 flex items-center gap-3 shadow-premium">
        <div className="w-11 h-11 bg-emerald-500 rounded-2xl flex items-center justify-center shrink-0 shadow-glow">
          <Bell size={18} className="text-charcoal-950" />
        </div>

        <div className="flex-1 min-w-0">
          <p className="text-sm text-white font-semibold leading-tight">Get delivery alerts</p>
          <p className="text-[11px] text-white/50 leading-snug mt-0.5">
            Know the moment your order status changes, even if you&apos;re not looking at the app.
          </p>
        </div>

        <button
          onClick={handleEnable}
          className="tap-target px-3 shrink-0 bg-emerald-500 hover:bg-emerald-400 text-charcoal-950 text-xs font-black rounded-xl transition-colors"
        >
          Enable
        </button>

        <button
          onClick={handleDismiss}
          aria-label="Dismiss"
          className="tap-target shrink-0 text-white/30 hover:text-white transition-colors"
        >
          <X size={14} />
        </button>
      </div>
    </div>
  );
}
