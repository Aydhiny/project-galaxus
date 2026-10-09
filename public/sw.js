/* Galaxus Service Worker — v2
 *
 * What changed from v1 and why (mostly iOS "home screen app" problems):
 *  • v1 precached "/" and "/dashboard", which REDIRECT. Safari refuses to load
 *    a redirected response served by a service worker ("Response served by
 *    service worker has redirections") → blank error page in the iOS app.
 *    Redirected / non-OK responses are now never cached or served from cache.
 *  • v1 cached every page, including signed-in HTML and Next's RSC payloads,
 *    so private data could reappear after sign-out and stale UI after deploys.
 *    Pages are now network-only; offline shows a small offline page instead.
 *  • Only immutable build assets (/_next/static, hashed) and icons are cached.
 */

const VERSION = "galaxus-v2";
const STATIC_CACHE = `${VERSION}-static`;
const OFFLINE_URL = "/offline.html";
const PRECACHE = [OFFLINE_URL, "/icons/icon-192.png", "/icons/apple-touch-icon.png"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(STATIC_CACHE).then((cache) => Promise.allSettled(PRECACHE.map((u) => cache.add(u))))
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => !k.startsWith(VERSION)).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

function isCacheable(res) {
  return res && res.ok && !res.redirected && res.type === "basic";
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return; // server actions, auth POSTs: untouched
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // Hashed build assets + icons/splash: cache-first (they never change in place).
  if (url.pathname.startsWith("/_next/static/") || url.pathname.startsWith("/icons/") || url.pathname.startsWith("/splash/")) {
    event.respondWith(
      caches.match(request).then(
        (cached) =>
          cached ||
          fetch(request).then((res) => {
            if (isCacheable(res)) {
              const copy = res.clone();
              caches.open(STATIC_CACHE).then((c) => c.put(request, copy));
            }
            return res;
          })
      )
    );
    return;
  }

  // Page navigations: always the network (fresh, private data). If offline,
  // show the offline page. Never respond with a cached redirect.
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request).catch(() => caches.match(OFFLINE_URL).then((r) => r || new Response("Offline", { status: 503 })))
    );
  }
  // Everything else (RSC payloads, API, images): let the browser handle it.
});
