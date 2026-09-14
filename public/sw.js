const CACHE = "ironlog-shell-v21";
const SHELL = ["/", "/manifest.webmanifest", "/favicon.svg", "/apple-touch-icon.png", "/icon-512.png"];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(SHELL)));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key)))));
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin || url.pathname.startsWith("/api/")) return;

  if (event.request.mode === "navigate") {
    event.respondWith((async () => {
      const cached = await caches.match("/");
      const update = fetch(event.request).then((response) => {
        if (response.ok) caches.open(CACHE).then((cache) => cache.put("/", response.clone()));
        return response;
      });
      if (cached) {
        event.waitUntil(update.catch(() => undefined));
        return cached;
      }
      return update.catch(() => new Response("IronLog is unavailable offline until it has opened once.", { status: 503 }));
    })());
    return;
  }

  event.respondWith((async () => {
    const cached = await caches.match(event.request);
    if (cached) return cached;
    const response = await fetch(event.request);
    if (response.ok) {
      const copy = response.clone();
      event.waitUntil(caches.open(CACHE).then((cache) => cache.put(event.request, copy)));
    }
    return response;
  })());
});
