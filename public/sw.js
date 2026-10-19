/**
 * AXE Companion Service Worker
 *
 * Handles:
 *  • Web push delivery — sound, vibration, lock-screen banner, action buttons
 *  • Tap-to-focus deep linking back into the PWA
 *  • Offline fallback page (`/offline`) plus last-viewed shell + safe GET data
 *  • Update handshake — a new worker waits until the page posts SKIP_WAITING
 *
 * Versioning: bump CACHE_NAME whenever the SW shape changes.
 * Keep prefixes in sync with src/lib/pwa/cachePolicy.ts (enforced by tests).
 */

const CACHE_NAME = "axe-v5";
const DATA_CACHE = "axe-data-v5";
const OFFLINE_URL = "/offline";
const LAST_VIEWED_KEY = "axe-last-viewed";
const FALLBACK_ICON = "/axe-icon-512.png";
const FALLBACK_BADGE = "/axe-icon.png";

const PRECACHE_URLS = [
  OFFLINE_URL,
  "/manifest.json",
  "/chat",
  "/axe-icon-192.png",
  "/axe-icon-512.png",
  "/axe-icon-maskable-192.png",
  "/axe-icon-maskable-512.png",
  "/apple-touch-icon.png",
];

const SAFE_NAV_PREFIXES = [
  "/chat",
  "/feed",
  "/intel",
  "/journal",
  "/chart",
  "/alerts",
  "/settings",
  "/cockpit",
  "/watchlist",
  "/positions",
  "/accounts",
  "/history",
  "/market",
  "/vault",
  "/actions",
  "/offline",
  "/onboarding",
];

const SAFE_API_PREFIXES = [
  "/api/feed",
  "/api/quotes",
  "/api/onboarding",
  "/api/intel",
  "/api/push/vapid",
  "/api/push/status",
];

const NEVER_CACHE_PREFIXES = [
  "/api/cron",
  "/api/billing",
  "/api/internal",
  "/api/stripe",
  "/api/checkout",
  "/api/tools",
  "/api/push/subscribe",
  "/api/push/send",
  "/api/push/test",
  "/auth",
];

function pathnameOf(url) {
  try {
    return new URL(url, self.location.origin).pathname;
  } catch {
    return "/";
  }
}

function matchesPrefix(pathname, prefixes) {
  return prefixes.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
}

function shouldNeverCache(url) {
  return matchesPrefix(pathnameOf(url), NEVER_CACHE_PREFIXES);
}

function isSafeNavigation(url) {
  const pathname = pathnameOf(url);
  if (pathname === "/") return false;
  return matchesPrefix(pathname, SAFE_NAV_PREFIXES);
}

function isSafeApiGet(url) {
  const pathname = pathnameOf(url);
  if (matchesPrefix(pathname, NEVER_CACHE_PREFIXES)) return false;
  return matchesPrefix(pathname, SAFE_API_PREFIXES);
}

function isStaticAsset(url) {
  const pathname = pathnameOf(url);
  return (
    pathname.startsWith("/_next/static/") ||
    pathname.startsWith("/axe-icon") ||
    pathname.startsWith("/apple-touch-icon") ||
    pathname === "/manifest.json"
  );
}

function sameOrigin(url) {
  try {
    return new URL(url, self.location.origin).origin === self.location.origin;
  } catch {
    return false;
  }
}

// ── Install: cache offline page + icons. Do NOT skipWaiting — the page
// prompts so a deploy cannot leave the tab on a mixed old/new bundle.
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) =>
      Promise.all(
        PRECACHE_URLS.map((url) => cache.add(url).catch(() => undefined)),
      ),
    ),
  );
});

// ── Activate: drop previous caches, then take control of open clients.
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((k) => k !== CACHE_NAME && k !== DATA_CACHE)
            .map((k) => caches.delete(k)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("message", (event) => {
  const data = event.data || {};
  if (data.type === "SKIP_WAITING") {
    self.skipWaiting();
    return;
  }
  if (data.type === "CACHE_LAST_VIEWED" && typeof data.url === "string") {
    event.waitUntil(rememberLastViewed(data.url));
  }
});

async function rememberLastViewed(url) {
  if (!sameOrigin(url) || shouldNeverCache(url)) return;
  const path = pathnameOf(url);
  const target = path.startsWith("/") ? path : `/${path}`;
  if (!isSafeNavigation(target) && target !== OFFLINE_URL) return;

  const absolute = new URL(target, self.location.origin).toString();
  const cache = await caches.open(CACHE_NAME);
  try {
    const res = await fetch(absolute, { credentials: "same-origin" });
    if (res.ok) {
      await cache.put(absolute, res.clone());
      await cache.put(
        LAST_VIEWED_KEY,
        new Response(JSON.stringify({ url: target, cachedAt: Date.now() }), {
          headers: { "Content-Type": "application/json" },
        }),
      );
    }
  } catch {
    /* offline — keep whatever was already cached */
  }
}

async function networkFirst(request, cacheName, fallback) {
  const cache = await caches.open(cacheName);
  try {
    const res = await fetch(request);
    if (res && res.ok) {
      await cache.put(request, res.clone());
    }
    return res;
  } catch (err) {
    const cached = await cache.match(request);
    if (cached) return cached;
    if (fallback) {
      const page = await caches.match(fallback);
      if (page) return page;
    }
    throw err;
  }
}

async function staleWhileRevalidate(request, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);
  const fetching = fetch(request)
    .then((res) => {
      if (res && res.ok) cache.put(request, res.clone());
      return res;
    })
    .catch(() => cached);
  return cached || fetching;
}

async function navigationFallback(request) {
  const cache = await caches.open(CACHE_NAME);
  const cachedPage = await cache.match(request);
  if (cachedPage) return cachedPage;

  const marker = await cache.match(LAST_VIEWED_KEY);
  if (marker) {
    try {
      const { url } = await marker.json();
      if (typeof url === "string") {
        const last = await cache.match(new URL(url, self.location.origin).toString());
        if (last) return last;
      }
    } catch {
      /* ignore corrupt marker */
    }
  }

  const offline = await cache.match(OFFLINE_URL);
  if (offline) return offline;
  return new Response("AXE is offline.", {
    status: 503,
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;
  if (!sameOrigin(request.url)) return;
  if (shouldNeverCache(request.url)) return;

  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then((res) => {
          if (res && res.ok && isSafeNavigation(request.url)) {
            const copy = res.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
          }
          return res;
        })
        .catch(() => navigationFallback(request)),
    );
    return;
  }

  if (isStaticAsset(request.url)) {
    event.respondWith(staleWhileRevalidate(request, CACHE_NAME));
    return;
  }

  if (isSafeApiGet(request.url)) {
    event.respondWith(networkFirst(request, DATA_CACHE, null));
  }
});

// Vibration patterns — chosen to feel right on the wrist + lock screen.
//   info     short single buzz
//   alert    two-stage buzz (price/news alerts)
//   risk     three-stage urgent buzz (position risk, SL hit)
const VIBRATIONS = {
  info: [120],
  alert: [220, 110, 220],
  risk: [320, 140, 320, 140, 320],
};

function pickVibration(severity) {
  if (severity === "risk" || severity === "high") return VIBRATIONS.risk;
  if (severity === "info" || severity === "low") return VIBRATIONS.info;
  return VIBRATIONS.alert;
}

// ── Push: show notification ──────────────────────────────────────────────────
self.addEventListener("push", (event) => {
  /** @type {{
   *   title?: string,
   *   body?: string,
   *   url?: string,
   *   tag?: string,
   *   icon?: string,
   *   badge?: string,
   *   image?: string,
   *   severity?: "info" | "alert" | "risk" | "high" | "low",
   *   silent?: boolean,
   *   requireInteraction?: boolean,
   *   actions?: { action: string, title: string, icon?: string }[],
   *   data?: Record<string, unknown>,
   * }}
   */
  let payload = {};

  try {
    if (event.data) payload = event.data.json();
  } catch (_err) {
    // Some pushes (e.g. APNs sync ping) come without a JSON body; that's fine
    // — we still want to show *something* so the user knows AXE pinged them.
  }

  const title = payload.title || "AXE";
  const body = payload.body || "New activity in AXE Companion";
  const url = payload.url || "/chat";
  const tag = payload.tag || "axe-notification";
  const severity = payload.severity || "alert";
  const requireInteraction = payload.requireInteraction ?? severity === "risk";

  // Default actions for "alert"-class notifications. The platform shows them
  // as buttons under the banner on Android and below the banner when expanded
  // on iOS. iOS only displays the first two actions.
  const defaultActions =
    severity === "risk"
      ? [
          { action: "open", title: "Open" },
          { action: "dismiss", title: "Dismiss" },
        ]
      : [{ action: "open", title: "Open" }];

  const options = {
    body,
    tag,
    renotify: true,
    requireInteraction,
    icon: payload.icon || FALLBACK_ICON,
    badge: payload.badge || FALLBACK_BADGE,
    image: payload.image,
    silent: payload.silent === true,
    vibrate: payload.silent ? [] : pickVibration(severity),
    timestamp: Date.now(),
    data: { url, severity, ...(payload.data || {}) },
    actions: payload.actions ?? defaultActions,
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

// ── Notification click: focus or open the deep link, then patch session ──────
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  // If the user picked the dismiss action we just close — don't open the app.
  if (event.action === "dismiss") return;

  const data = event.notification.data || {};
  const targetUrl = data.url || "/chat";
  const session = data.session && typeof data.session === "object" ? data.session : {};
  const message = { type: "AXE_PUSH_OPEN", url: targetUrl, session };

  event.waitUntil(
    self.clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then((windowClients) => {
        for (const client of windowClients) {
          if (client.url.includes(self.location.origin) && "focus" in client) {
            // Tell the open PWA to patch ActiveSessionProvider, then navigate
            // it to the deep link. iOS 16.4+ may not implement navigate().
            try {
              client.postMessage(message);
            } catch (_err) {
              /* ignore */
            }
            if (typeof client.navigate === "function") {
              try {
                client.navigate(targetUrl);
              } catch (_err) {
                /* iOS */
              }
            }
            return client.focus();
          }
        }
        if (self.clients.openWindow) {
          return self.clients.openWindow(targetUrl);
        }
        return undefined;
      }),
  );
});

// ── Push subscription change: keep server in sync ────────────────────────────
self.addEventListener("pushsubscriptionchange", (event) => {
  // Browsers occasionally rotate subscriptions (e.g. Chrome on Android).
  // Re-subscribe with the same VAPID key and POST the new endpoint to the
  // server so we don't lose delivery.
  event.waitUntil(
    (async () => {
      try {
        const res = await fetch("/api/push/vapid");
        if (!res.ok) return;
        const { publicKey } = await res.json();
        if (!publicKey) return;
        const padding = "=".repeat((4 - (publicKey.length % 4)) % 4);
        const base64 = (publicKey + padding).replace(/-/g, "+").replace(/_/g, "/");
        const raw = atob(base64);
        const arr = new Uint8Array(raw.length);
        for (let i = 0; i < raw.length; i += 1) arr[i] = raw.charCodeAt(i);
        const sub = await self.registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: arr,
        });
        const json = sub.toJSON();
        await fetch("/api/push/subscribe", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ endpoint: json.endpoint, keys: json.keys }),
        });
      } catch (_err) {
        // Best-effort — next page load will retry via PushPermission.
      }
    })(),
  );
});
