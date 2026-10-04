// Zukhti Voice Desk service worker: lets the desk open with no signal on site.
// Pages: network first, fall back to the last copy. Static build files: cache first.
const CACHE = "zukhti-desk-v1";

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(["/desk", "/manifest.webmanifest", "/icon.svg"]).catch(() => {})));
  self.skipWaiting();
});

self.addEventListener("activate", (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  if (url.pathname.startsWith("/_next/static/") || url.pathname === "/icon.svg") {
    e.respondWith(
      caches.match(req).then(
        (hit) =>
          hit ||
          fetch(req).then((res) => {
            if (res.ok) caches.open(CACHE).then((c) => c.put(req, res.clone()));
            return res;
          }),
      ),
    );
    return;
  }

  // Only the desk pages are kept for offline use (never API calls, files or other CRM pages).
  if (req.mode === "navigate" && url.pathname === "/desk") {
    e.respondWith(
      fetch(req)
        .then((res) => {
          if (res.ok && !res.redirected) caches.open(CACHE).then((c) => c.put("/desk", res.clone()));
          return res;
        })
        .catch(() => caches.match("/desk").then((hit) => hit || new Response("You're offline. Open the Voice Desk once with signal so it works offline next time.", { headers: { "content-type": "text/plain" } }))),
    );
  }
});
