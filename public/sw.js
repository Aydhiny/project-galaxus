/* Galaxus Service Worker — v1 */

const CACHE = "galaxus-v1";

// Static shell to precache
const PRECACHE = [
  "/",
  "/dashboard",
  "/overview",
  "/daily",
  "/goals",
  "/offline.html",
];

/* ── Install: precache shell ────────────────────────────────────────────── */
self.addEventListener("install", (e) => {
  self.skipWaiting();
  e.waitUntil(
    caches.open(CACHE).then((c) =>
      // addAll would fail if any resource is offline during install; use individual add calls
      Promise.allSettled(PRECACHE.map((url) => c.add(url)))
    )
  );
});

/* ── Activate: clean up old caches ─────────────────────────────────────── */
self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

/* ── Fetch strategy ─────────────────────────────────────────────────────── */
self.addEventListener("fetch", (e) => {
  const { request } = e;

  // Skip non-GET and chrome-extension
  if (request.method !== "GET" || request.url.startsWith("chrome-extension")) return;

  // API routes: network-first, no cache
  if (request.url.includes("/api/")) {
    e.respondWith(
      fetch(request).catch(() =>
        new Response(JSON.stringify({ error: "offline" }), {
          status: 503,
          headers: { "Content-Type": "application/json" },
        })
      )
    );
    return;
  }

  // Next.js static assets (_next/static): cache-first
  if (request.url.includes("/_next/static/")) {
    e.respondWith(
      caches.match(request).then((cached) => cached || fetch(request).then((res) => {
        const clone = res.clone();
        caches.open(CACHE).then((c) => c.put(request, clone));
        return res;
      }))
    );
    return;
  }

  // Pages: network-first, fall back to cache, fall back to offline page
  e.respondWith(
    fetch(request)
      .then((res) => {
        const clone = res.clone();
        caches.open(CACHE).then((c) => c.put(request, clone));
        return res;
      })
      .catch(() =>
        caches.match(request).then(
          (cached) =>
            cached ||
            caches.match("/offline.html") ||
            new Response("<h1>Offline</h1>", {
              headers: { "Content-Type": "text/html" },
            })
        )
      )
  );
});
