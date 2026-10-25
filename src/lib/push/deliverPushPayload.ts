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

/** I/O seams for {@link sendPushToUser}; the route wires Supabase + web-push. */
export type PushSendDeps = {
  loadSubscriptions: (
    userId: string,
  ) => Promise<{ data: PushSubscriptionRow[] | null; error: string | null }>;
  sendNotification: (sub: PushSubscriptionRow, payload: string) => Promise<unknown>;
  deleteExpired: (userId: string, endpoints: string[]) => Promise<unknown>;
};

export type PushSendOutcome =
  | { ok: true; sent: number; total: number }
  | { ok: false; error: string };

/**
 * C6 delivery core behind POST /api/push/send: load the user's devices,
 * send one web-push per device, prune 404/410 endpoints, report counts.
 * Auth, VAPID and request validation stay in the route.
 */
export async function sendPushToUser(
  req: PushDeliveryRequest,
  deps: PushSendDeps,
): Promise<PushSendOutcome> {
  const { data: subs, error } = await deps.loadSubscriptions(req.userId);
  if (error) return { ok: false, error };
  if (!subs || subs.length === 0) return { ok: true, sent: 0, total: 0 };

  const payload = buildPushNotificationPayload(req);
  const settled = await Promise.allSettled(
    subs.map((sub) => deps.sendNotification(sub, payload)),
  );
  const results: PushSendResult[] = settled.map((r) => {
    if (r.status === "fulfilled") return { status: "fulfilled" };
    const err = r.reason as { statusCode?: number } | undefined;
    return { status: "rejected", statusCode: err?.statusCode };
  });

  const summary = summarizePushDelivery({ subscriptions: subs, results });
  if (summary.expiredEndpoints.length > 0) {
    await deps.deleteExpired(req.userId, summary.expiredEndpoints);
  }
  return { ok: true, sent: summary.sent, total: summary.total };
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

/** JSON body shape returned by POST /api/push/send. */
export type PushSendHttpBody = {
  ok?: boolean;
  sent?: number;
  total?: number;
  error?: string;
};

/**
 * C6: HTTP 200 alone is not delivery — `/api/push/send` returns ok:true with
 * sent:0 when the user has no subscribed device. Only count a device reach
 * when the route reports at least one fulfilled web-push send.
 */
export function pushSendHttpReachedDevice(args: {
  httpOk: boolean;
  body: PushSendHttpBody | null;
}): boolean {
  if (!args.httpOk || !args.body) return false;
  const sent = Number(args.body.sent ?? 0);
  const total = Number(args.body.total ?? 0);
  return watcherAlertReachedDevice({
    hasSubscription: total > 0 || sent > 0,
    pushSendOk: args.body.ok !== false && sent > 0,
    sent,
  });
}

/**
 * Parse /api/push/send JSON safely (cron callers must not throw on bad bodies).
 */
export function parsePushSendHttpBody(raw: unknown): PushSendHttpBody | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const o = raw as Record<string, unknown>;
  return {
    ok: typeof o.ok === "boolean" ? o.ok : undefined,
    sent: typeof o.sent === "number" ? o.sent : undefined,
    total: typeof o.total === "number" ? o.total : undefined,
    error: typeof o.error === "string" ? o.error : undefined,
  };
}

/**
 * Shape a proactive-watcher alert into the /api/push/send request body.
 * Keeps title prefix + severity consistent across cron and feed paths.
 */
export function buildWatcherAlertPushRequest(args: {
  userId: string;
  title: string;
  body: string;
  url: string;
  severity?: PushDeliveryRequest["severity"];
}): PushDeliveryRequest {
  const title = args.title.startsWith("AXE · ") ? args.title : `AXE · ${args.title}`;
  return {
    userId: args.userId,
    title,
    body: args.body,
    url: args.url,
    tag: "axe-watcher",
    severity: args.severity ?? "alert",
  };
}

/**
 * End-to-end delivery decision for a watcher alert (no network):
 * event recorded → optional push → summarize results → device reached?
 */
export function evaluateWatcherAlertDelivery(args: {
  userId: string;
  title: string;
  body: string;
  url: string;
  subscriptions: PushSubscriptionRow[];
  sendResults: PushSendResult[];
}): {
  request: PushDeliveryRequest;
  summary: ReturnType<typeof summarizePushDelivery>;
  reachedDevice: boolean;
} {
  const request = buildWatcherAlertPushRequest(args);
  const summary = summarizePushDelivery({
    subscriptions: args.subscriptions,
    results: args.sendResults,
  });
  return {
    request,
    summary,
    reachedDevice: watcherAlertReachedDevice({
      hasSubscription: args.subscriptions.length > 0,
      pushSendOk: summary.sent > 0,
      sent: summary.sent,
    }),
  };
}
