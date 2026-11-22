const CACHE = "kizuna-v2";
const OFFLINE_URL = "/offline.html";

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll([OFFLINE_URL])).then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (request.mode === "navigate") {
    event.respondWith(fetch(request).catch(() => caches.match(OFFLINE_URL)));
    return;
  }

  if (url.pathname.startsWith("/_next/static/")) {
    event.respondWith(
      caches.open(CACHE).then(async (cache) => {
        const hit = await cache.match(request);
        if (hit) return hit;
        const res = await fetch(request);
        if (res.ok) cache.put(request, res.clone()).catch(() => {});
        return res;
      }),
    );
  }
});

// Push from /api/push: { title, body, url, tag }. iOS drops the subscription
// of a worker that receives a push without showing anything, so always show.
self.addEventListener("push", (event) => {
  let msg = {};
  try {
    msg = event.data ? event.data.json() : {};
  } catch {}
  event.waitUntil(
    self.registration.showNotification(msg.title || "Kizuna", {
      body: msg.body || "",
      tag: msg.tag,
      icon: "/icons/192",
      badge: "/icons/192",
      data: { url: msg.url || "/" },
    }),
  );
});

// Tapping it brings the game forward on that page (or opens it).
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || "/";
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((list) => {
      const client = list.find((c) => new URL(c.url).origin === self.location.origin);
      // navigate fails on a window this worker doesn't control: open one instead
      if (client)
        return client
          .navigate(url)
          .then((c) => (c || client).focus())
          .catch(() => self.clients.openWindow(url));
      return self.clients.openWindow(url);
    }),
  );
});
