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
