// Spotlog Service Worker — caches the app shell only (index.html/app.js/style.css/
// manifest/icons/privacy/help). Leaflet, Chart.js, Lucide and the Google Fonts CSS
// are still loaded from their CDNs at runtime and are NOT cached here, so the app
// still needs a network connection for map/chart/icon rendering (see SPEC.md §4,
// "外部CDN依存"). This pass only covers phase 4's actual goal — installable,
// launches in its own window without browser chrome — not full offline support.
const CACHE_NAME = "spotlog-shell-v1";
const SHELL_FILES = [
  "/",
  "/index.html",
  "/app.js",
  "/style.css",
  "/manifest.json",
  "/privacy.html",
  "/help.html",
  "/icons/icon-192.png",
  "/icons/icon-512.png",
  "/icons/icon-512-maskable.png"
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(SHELL_FILES))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))
      ))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET" || new URL(req.url).origin !== self.location.origin) {
    return; // cross-origin (CDN) and non-GET requests: let the browser handle them untouched
  }

  // Network-first for every same-origin shell file (not just navigation) — this
  // app has no build step that hashes filenames on deploy, so a cache-first
  // strategy on app.js/style.css would keep serving yesterday's code to a
  // returning visitor until CACHE_NAME is manually bumped. Network-first means
  // an online visitor always gets whatever was just deployed; the cache only
  // kicks in as a fallback when there's genuinely no connection.
  const cacheKey = req.mode === "navigate" ? "/index.html" : req;
  event.respondWith(
    fetch(req)
      .then((res) => {
        const clone = res.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(cacheKey, clone));
        return res;
      })
      .catch(() => caches.match(cacheKey))
  );
});
