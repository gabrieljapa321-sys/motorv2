const SHELL_CACHE = "motor-shell";
const DATA_CACHE = "motor-data";
const RUNTIME_CACHE = "motor-runtime";
const CACHE_PREFIX = "motor-";

const APP_SHELL = [
  "./",
  "./index.html",
  "./manifest.webmanifest",
  "./assets/data/study-data.json",
  "./assets/data/ui-config.json",
  "./assets/data/exercises.json",
  "./assets/data/news.json",
  "./assets/data/ticker-tape.json",
  "./assets/brand-logos/logo-beneva.png",
  "./assets/brand-logos/logo-itamaraca.png",
  "./assets/brand-logos/logo-tsea.webp",
  "./assets/css/app.css",
  "./assets/css/base.css",
  "./assets/css/dashboard.css",
  "./assets/css/calendar.css",
  "./assets/css/grades.css",
  "./assets/css/week.css",
  "./assets/css/flashcards.css",
  "./assets/css/news.css",
  "./assets/css/ticker.css",
  "./assets/css/work.css",
  "./assets/js/polyfills.js",
  "./assets/js/app-data.js",
  "./assets/js/store.js",
  "./assets/js/dates.js",
  "./assets/js/work-domain.js",
  "./assets/js/theme.js",
  "./assets/js/backup.js",
  "./assets/js/sync-service.js",
  "./assets/js/app-core.js",
  "./assets/js/home-dashboard.js",
  "./assets/js/app-pages.js",
  "./assets/js/grades-page.js",
  "./assets/js/week-planner.js",
  "./assets/js/study-features.js",
  "./assets/js/flashcards-exams.js",
  "./assets/js/app-actions.js",
  "./assets/js/work-planner.js",
  "./assets/js/news-feed.js",
  "./assets/js/ticker-tape.js",
  "./assets/js/app-init.js",
  "./assets/js/firebase-init.js",
  "./assets/js/auth-panel.js",
  "./assets/js/firebase-sync.js",
  "./assets/pwa/icon-192.svg",
  "./assets/pwa/icon-512.svg"
];

function toLocalKey(url) {
  if (url.pathname === "/" || /\/index\.html$/i.test(url.pathname)) return "./index.html";
  return `.${url.pathname}`;
}

async function networkFirst(request, cacheName, fallbackKey) {
  const cache = await caches.open(cacheName);
  try {
    const response = await fetch(request, { cache: "no-store" });
    if (response && response.status === 200) {
      cache.put(fallbackKey || request, response.clone());
    }
    return response;
  } catch (error) {
    const fallback = await cache.match(fallbackKey || request);
    if (fallback) return fallback;
    throw error;
  }
}

async function cacheFirst(request, cacheName, fallbackKey) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(fallbackKey || request);
  if (cached) return cached;
  const response = await fetch(request);
  if (response && response.status === 200) {
    cache.put(fallbackKey || request, response.clone());
  }
  return response;
}

async function staleWhileRevalidate(request, cacheName, fallbackKey) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(fallbackKey || request);
  const networkPromise = fetch(request)
    .then((response) => {
      if (response && response.status === 200) {
        cache.put(fallbackKey || request, response.clone());
      }
      return response;
    })
    .catch(() => cached);
  return cached || networkPromise;
}

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(SHELL_CACHE).then((cache) => cache.addAll(APP_SHELL)).then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  const keep = new Set([SHELL_CACHE, DATA_CACHE, RUNTIME_CACHE]);
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => key.startsWith(CACHE_PREFIX) && !keep.has(key))
          .map((key) => caches.delete(key))
      )
    ).then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  const localKey = toLocalKey(url);

  if (request.mode === "navigate") {
    event.respondWith(networkFirst(request, SHELL_CACHE, "./index.html"));
    return;
  }

  if (/^\.\/assets\/data\/.+\.json$/i.test(localKey)) {
    event.respondWith(networkFirst(request, DATA_CACHE, localKey));
    return;
  }

  if (/\.(?:css|js|webmanifest)$/i.test(url.pathname)) {
    event.respondWith(networkFirst(request, SHELL_CACHE, localKey));
    return;
  }

  if (/\.(?:png|svg|webp|jpg|jpeg|gif|ico)$/i.test(url.pathname)) {
    event.respondWith(staleWhileRevalidate(request, RUNTIME_CACHE, localKey));
    return;
  }

  event.respondWith(cacheFirst(request, RUNTIME_CACHE, localKey));
});
