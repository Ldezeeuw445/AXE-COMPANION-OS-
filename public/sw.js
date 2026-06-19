/**
 * Trading OS Service Worker
 *
 * Handles:
 *  • Web push delivery — sound, vibration, lock-screen banner, action buttons
 *  • Tap-to-focus deep linking back into the PWA
 *  • Offline shell fallback for the chat page
 *
 * Versioning: bump CACHE_NAME whenever the SW shape changes — clients pick up
 * the new worker on next page load and we discard old caches in `activate`.
 */

const CACHE_NAME = "trading-os-v1";
const OFFLINE_URL = "/chat";
const FALLBACK_ICON = "/icon.png";
const FALLBACK_BADGE = "/icon.png";

// ── Install: cache offline shell ─────────────────────────────────────────────
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.add(OFFLINE_URL))
  );
  self.skipWaiting();
});

// ── Activate: clean old caches ───────────────────────────────────────────────
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
      )
      .then(() => self.clients.claim())
  );
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

  const title = payload.title || "Trading OS";
  const body = payload.body || "New activity in Trading OS";
  const url = payload.url || "/chat";
  const tag = payload.tag || "trading-os-notification";
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

// ── Notification click: focus or open app ────────────────────────────────────
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  // If the user picked the dismiss action we just close — don't open the app.
  if (event.action === "dismiss") return;

  const targetUrl = event.notification.data?.url || "/chat";

  event.waitUntil(
    self.clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then((windowClients) => {
        for (const client of windowClients) {
          if (client.url.includes(self.location.origin) && "focus" in client) {
            // Navigate the existing client to the target URL and bring it
            // forward — keeps the PWA single-window on iOS.
            client.navigate(targetUrl);
            return client.focus();
          }
        }
        if (self.clients.openWindow) {
          return self.clients.openWindow(targetUrl);
        }
        return undefined;
      })
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
    })()
  );
});
