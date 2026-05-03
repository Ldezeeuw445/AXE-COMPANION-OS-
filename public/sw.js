// AXE Companion Service Worker — handles push notifications and offline shell

const CACHE_NAME = "axe-v1";
const OFFLINE_URL = "/chat";

// ── Install: cache offline shell ──────────────────────────────────────────────
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.add(OFFLINE_URL))
  );
  self.skipWaiting();
});

// ── Activate: clean old caches ────────────────────────────────────────────────
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
      )
  );
  self.clients.claim();
});

// ── Push: show notification ───────────────────────────────────────────────────
self.addEventListener("push", (event) => {
  let data = { title: "AXE", body: "New message from AXE Companion", url: "/chat" };

  try {
    if (event.data) {
      data = { ...data, ...event.data.json() };
    }
  } catch (_) {
    // ignore malformed payload
  }

  const options = {
    body: data.body,
    icon: "/axe-icon-512.png",
    badge: "/axe-icon.png",
    tag: data.tag || "axe-notification",
    renotify: true,
    requireInteraction: false,
    data: { url: data.url || "/chat" },
    vibrate: [200, 100, 200],
  };

  event.waitUntil(self.registration.showNotification(data.title, options));
});

// ── Notification click: focus or open app ────────────────────────────────────
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const targetUrl = event.notification.data?.url || "/chat";

  event.waitUntil(
    clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then((windowClients) => {
        // Focus existing window if already open
        for (const client of windowClients) {
          if (client.url.includes(self.location.origin) && "focus" in client) {
            client.navigate(targetUrl);
            return client.focus();
          }
        }
        // Open new window
        if (clients.openWindow) {
          return clients.openWindow(targetUrl);
        }
      })
  );
});
