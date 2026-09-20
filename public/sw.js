// Deliberately does nothing except exist. Some browsers (notably Chrome on
// Android, historically) require a registered service worker with a fetch
// handler before they'll consider a site installable and fire
// beforeinstallprompt - but this app is heavily dynamic (live orders,
// live pricing, live rider locations), so a service worker that actually
// caches responses is exactly the kind of thing that serves stale prices
// or stale order status after a deploy. Every request here just goes
// straight to the network, unmodified - this file's only purpose is
// installability, not offline support or caching.
self.addEventListener("install", (event) => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  event.respondWith(fetch(event.request));
});

// Push notifications - the one thing this worker actively handles, aside
// from the fetch passthrough above. A push event only contains whatever
// the server put in the payload; it never touches live order/price data
// itself, so it doesn't conflict with the "never cache anything" design
// above.
self.addEventListener("push", (event) => {
  if (!event.data) return;
  let payload;
  try {
    payload = event.data.json();
  } catch {
    payload = { title: "NaijaDrops", body: event.data.text() };
  }

  const { title = "NaijaDrops", body, icon = "/favicon.png", url = "/" } = payload;

  event.waitUntil(
    self.registration.showNotification(title, {
      body,
      icon,
      badge: icon,
      data: { url },
    })
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = event.notification.data?.url || "/";
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if (client.url.includes(url) && "focus" in client) return client.focus();
      }
      if (self.clients.openWindow) return self.clients.openWindow(url);
    })
  );
});
