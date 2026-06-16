// IsItSahih service worker — minimal, safe app-shell caching for installability
// + basic offline. It NEVER caches the server functions (/.netlify/*) or any
// cross-origin request, so verification, sharing and logging always hit the network.
const CACHE = "isitsahih-v1";

// Best-effort precache of the app shell. Individual failures are ignored so a
// single 404 can never block install.
self.addEventListener("install", (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE).then((cache) =>
      Promise.allSettled([
        cache.add("/"),
        cache.add("/logo.svg"),
        cache.add("/manifest.webmanifest"),
      ]),
    ),
  );
});

// Drop old cache versions on activation.
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;

  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return; // leave cross-origin alone
  if (url.pathname.startsWith("/.netlify/")) return; // never cache functions/API

  // Navigations (including /share/* deep links): network-first, fall back to the
  // cached shell when offline so the installed app still opens.
  if (req.mode === "navigate") {
    event.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put("/", copy)).catch(() => {});
          return res;
        })
        .catch(() => caches.match("/").then((r) => r || caches.match(req))),
    );
    return;
  }

  // Static assets: cache-first, then populate the cache on first network fetch.
  event.respondWith(
    caches.match(req).then(
      (cached) =>
        cached ||
        fetch(req).then((res) => {
          if (res && res.ok) {
            const copy = res.clone();
            caches.open(CACHE).then((c) => c.put(req, copy)).catch(() => {});
          }
          return res;
        }),
    ),
  );
});
