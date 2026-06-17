// IsItSahih service worker — app-shell caching for installability + offline support.
// NEVER caches /.netlify/* (server functions) or cross-origin requests.
// Bump CACHE version here whenever you deploy a new build so old caches are purged.
const CACHE = "isitsahih-v2";

const PRECACHE = [
  "/",
  "/logo.svg",
  "/icon-192.png",
  "/icon-512.png",
  "/manifest.webmanifest",
];

// Precache the app shell on install. Individual failures are ignored so a
// single 404 never blocks installation.
self.addEventListener("install", (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE).then((cache) =>
      Promise.allSettled(PRECACHE.map((url) => cache.add(url)))
    )
  );
});

// Drop old cache versions on activation.
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
      )
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;

  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return; // leave cross-origin alone
  if (url.pathname.startsWith("/.netlify/")) return; // never cache functions/API
  if (url.pathname.startsWith("/share/")) return; // let edge function handle OG injection

  // Navigations: network-first, fall back to cached shell when offline.
  if (req.mode === "navigate") {
    event.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put("/", copy)).catch(() => {});
          return res;
        })
        .catch(() =>
          caches.match("/").then((r) => r || caches.match(req))
        )
    );
    return;
  }

  // Static assets: cache-first, populate cache on first network fetch.
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
        })
    )
  );
});
