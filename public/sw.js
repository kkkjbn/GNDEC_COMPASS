/**
 * GNDEC One service worker.
 *
 * Strategy:
 *  - App shell + assets: stale-while-revalidate (fast, self-updating).
 *  - JSON data: stale-while-revalidate so Today opens instantly offline.
 *  - Navigations: network-first, fall back to the cached shell then offline.html.
 *  - /api/*: never cached (AI answers and health checks must be live).
 */

const VERSION = "gndec-one-v1.0.0";
const SHELL_CACHE = `${VERSION}-shell`;
const DATA_CACHE = `${VERSION}-data`;
const MEDIA_CACHE = `${VERSION}-media`;

const SHELL = [
  "/",
  "/index.html",
  "/offline.html",
  "/manifest.webmanifest",
  "/icon.svg",
  "/assets/css/app.css",
  "/assets/js/app.js",
  "/assets/js/ui.js",
  "/assets/js/store.js",
  "/assets/js/data.js",
  "/assets/js/logic.js",
  "/assets/js/search.js",
  "/assets/js/components.js",
  "/assets/js/assistant.js",
  "/assets/js/pages/today.js",
  "/assets/js/pages/timetable.js",
  "/assets/js/pages/people.js",
  "/assets/js/pages/rasta.js",
  "/assets/js/pages/study.js",
  "/assets/js/pages/notices.js",
  "/assets/js/pages/exams.js",
  "/assets/js/pages/assistant-page.js",
  "/assets/js/pages/settings.js",
  "/assets/js/pages/admin.js",
  "/assets/js/pages/about.js",
  "/assets/js/pages/more.js",
  "/assets/icons/icon-192.png",
  "/assets/icons/icon-512.png",
  "/assets/icons/maskable-512.png",
  "/assets/icons/apple-touch-icon.png",
  "/assets/img/main-gate.jpg",
  "/assets/img/admin.jpg",
  "/assets/img/library.jpg",
  "/assets/img/lab.jpg",
  "/assets/img/auditorium.jpg",
  "/assets/img/workshop.jpg",
  "/assets/img/campus-life.jpg",
  "/assets/img/sports.jpg",
  "/assets/img/new-gate.jpg",
  "/assets/img/convocation.jpg",
  "/assets/img/admissions.jpg",
  "/assets/img/campus-map.jpg",
  "/assets/img/og.jpg",
];

const CORE_DATA = ["/data/meta.json", "/data/timetable.json", "/data/notices.json", "/data/campus.json"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const shell = await caches.open(SHELL_CACHE);
      // Add individually: one missing file must not break the whole install.
      await Promise.all(
        SHELL.map(async (url) => {
          try {
            const response = await fetch(new Request(url, { cache: "reload" }));
            if (response.ok) await shell.put(url, response);
          } catch {
            /* ignore individual failures */
          }
        }),
      );
      const data = await caches.open(DATA_CACHE);
      await Promise.all(
        CORE_DATA.map(async (url) => {
          try {
            const response = await fetch(new Request(url, { cache: "reload" }));
            if (response.ok) await data.put(url, response);
          } catch {
            /* ignore */
          }
        }),
      );
      await self.skipWaiting();
    })(),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(keys.filter((key) => key.startsWith("gndec-one-") && !key.startsWith(VERSION)).map((key) => caches.delete(key)));
      await self.clients.claim();
    })(),
  );
});

async function staleWhileRevalidate(request, cacheName, { fallback = null } = {}) {
  const cache = await caches.open(cacheName);
  const cached = (await cache.match(request, { ignoreSearch: false })) || (await caches.match(request, { ignoreSearch: false }));
  const network = fetch(request)
    .then(async (response) => {
      if (response && response.ok && response.type !== "opaque") {
        await cache.put(request, response.clone()).catch(() => {});
      }
      return response;
    })
    .catch(() => null);

  if (cached) {
    network.catch(() => {});
    return cached;
  }
  const fresh = await network;
  if (fresh) return fresh;
  if (fallback) {
    const fallbackHit = await cache.match(fallback);
    if (fallbackHit) return fallbackHit;
    const shell = await caches.open(SHELL_CACHE);
    const shellHit = await shell.match(fallback);
    if (shellHit) return shellHit;
  }
  return new Response("Offline", { status: 503, statusText: "Offline" });
}

async function networkFirst(request) {
  try {
    const response = await fetch(request);
    if (response && response.ok) {
      const shell = await caches.open(SHELL_CACHE);
      await shell.put("/index.html", response.clone()).catch(() => {});
    }
    return response;
  } catch {
    const shell = await caches.open(SHELL_CACHE);
    const cached = (await shell.match("/index.html")) || (await shell.match("/"));
    if (cached) return cached;
    return (await caches.match("/offline.html")) || new Response("<h1>Offline</h1>", { headers: { "content-type": "text/html" } });
  }
}

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith("/api/")) return;

  if (request.mode === "navigate") {
    event.respondWith(networkFirst(request));
    return;
  }

  if (url.pathname.startsWith("/data/")) {
    event.respondWith(staleWhileRevalidate(request, DATA_CACHE, { fallback: null }));
    return;
  }

  if (url.pathname.startsWith("/assets/") || url.pathname === "/icon.svg" || url.pathname === "/manifest.webmanifest") {
    event.respondWith(staleWhileRevalidate(request, MEDIA_CACHE));
  }
});

self.addEventListener("message", (event) => {
  if (event.data === "skip-waiting") self.skipWaiting();
});
