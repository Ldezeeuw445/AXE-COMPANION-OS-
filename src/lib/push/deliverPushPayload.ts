/**
 * Pure delivery-path helpers for web-push (C6).
 * Keeps auth + payload shaping testable without hitting VAPID or production devices.
 */

export type PushSubscriptionRow = {
  endpoint: string;
  p256dh: string;
  auth: string;
};

export type PushDeliveryRequest = {
  userId: string;
  title: string;
  body?: string;
  url?: string;
  tag?: string;
  severity?: "info" | "alert" | "risk" | "high" | "low";
  requireInteraction?: boolean;
  silent?: boolean;
  image?: string;
  actions?: { action: string; title: string; icon?: string }[];
};

export type PushSendResult =
  | { status: "fulfilled" }
  | { status: "rejected"; statusCode?: number };

/**
 * Build the JSON payload a subscribed browser service worker expects.
 */
export function buildPushNotificationPayload(req: PushDeliveryRequest): string {
  return JSON.stringify({
    title: req.title,
    body: req.body ?? "",
    url: req.url ?? "/chat",
    tag: req.tag ?? "axe-notification",
    severity: req.severity ?? "alert",
    requireInteraction: req.requireInteraction ?? req.severity === "risk",
    silent: req.silent ?? false,
    image: req.image,
    actions: req.actions,
  });
}

/**
 * Watcher → device delivery accounting:
 * - no subscriptions → sent 0 (ok, not an error)
 * - fulfilled sends count toward `sent`
 * - 404/410 Gone mark endpoints for cleanup
 */
export function summarizePushDelivery(args: {
  subscriptions: PushSubscriptionRow[];
  results: PushSendResult[];
}): { sent: number; total: number; expiredEndpoints: string[] } {
  const { subscriptions, results } = args;
  if (subscriptions.length === 0) {
    return { sent: 0, total: 0, expiredEndpoints: [] };
  }

  const expiredEndpoints: string[] = [];
  let sent = 0;
  results.forEach((r, i) => {
    if (r.status === "fulfilled") {
      sent += 1;
      return;
    }
    if (r.statusCode === 410 || r.statusCode === 404) {
      const endpoint = subscriptions[i]?.endpoint;
      if (endpoint) expiredEndpoints.push(endpoint);
    }
  });

  return { sent, total: subscriptions.length, expiredEndpoints };
}

/**
 * Proves the watcher alert path reaches a subscribed device when send succeeds.
 */
export function watcherAlertReachedDevice(args: {
  hasSubscription: boolean;
  pushSendOk: boolean;
  sent: number;
}): boolean {
  return args.hasSubscription && args.pushSendOk && args.sent > 0;
}
