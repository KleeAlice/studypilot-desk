const SHELL_CACHE = "studypilot-shell-v1";

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));
self.addEventListener("fetch", (event) => {
  if (event.request.mode !== "navigate") return;
  event.respondWith(fetch(event.request).then((response) => {
    const copy = response.clone();
    void caches.open(SHELL_CACHE).then((cache) => cache.put(event.request, copy));
    return response;
  }).catch(async () => (await caches.match(event.request)) || Response.error()));
});
