/**
 * Self-destroying service worker (tombstone).
 *
 * An earlier version of this app registered a caching service worker. The
 * registration was later removed from the app code, but the old worker keeps
 * running on every device that installed it — serving stale, cache-first builds
 * so new deploys "sometimes don't show up" until the user manually clears their
 * cache (which then forces a slow Firestore cold start).
 *
 * This file replaces that worker. Browsers always revalidate the service-worker
 * script itself, so on the next visit an affected device picks this up, wipes
 * all caches, unregisters, and reloads once — permanently freeing it. New
 * visitors never register a worker at all (the app no longer calls register()),
 * so nothing re-installs.
 *
 * Do NOT delete this file: the SPA `_redirects` catch-all would answer /sw.js
 * with index.html (HTTP 200), the old worker's update check would then fail, and
 * it would keep running forever. Keep the tombstone deployed.
 */
self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    try {
      const keys = await caches.keys();
      await Promise.all(keys.map((key) => caches.delete(key)));
    } catch (err) {
      // Ignore — unregister below is what matters most.
    }
    try {
      await self.registration.unregister();
    } catch (err) {
      // Ignore.
    }
    // Reload every open tab once, now that no worker controls them, so the user
    // immediately gets the latest build from the network instead of stale cache.
    const clients = await self.clients.matchAll({ type: 'window' });
    clients.forEach((client) => {
      if ('navigate' in client) client.navigate(client.url);
    });
  })());
});
