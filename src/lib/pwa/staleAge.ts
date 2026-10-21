/**
 * Shared freshness rules for PWA-cached quotes, candles, and account figures.
 *
 * Cached numbers must not look live. Age is always computed from the last
 * known timestamp; going offline marks the payload stale even if the last
 * tick was a few seconds ago.
 */

export const QUOTE_STALE_MS = 45_000;
/** Account snapshots older than the 10-minute MT5 sync cadence are stale. */
export const ACCOUNT_STALE_MS = 10 * 60 * 1000;
/**
 * Candles older than this are labelled stale, but the last snapshot per
 * symbol+timeframe is still kept for offline use (see clientChartCache).
 */
export const CANDLE_FRESH_MS = 30 * 60 * 1000;

export type FreshnessKind = "live" | "stale" | "offline";

export type Freshness = {
  kind: FreshnessKind;
  stale: boolean;
  ageMs: number | null;
  /** Compact visible badge, e.g. "3m ago" or "Offline · 12m". Null when live. */
  badge: string | null;
  /** Longer title / aria label. */
  title: string;
};

export function ageMs(
  at: string | number | null | undefined,
  now = Date.now(),
): number | null {
  if (at == null) return null;
  const t = typeof at === "number" ? at : Date.parse(at);
  if (!Number.isFinite(t)) return null;
  return Math.max(0, now - t);
}

export function isOlderThan(
  at: string | number | null | undefined,
  thresholdMs: number,
  now = Date.now(),
): boolean {
  const age = ageMs(at, now);
  if (age == null) return true;
  return age > thresholdMs;
}

export function formatCompactAge(ms: number): string {
  const sec = Math.max(0, Math.round(ms / 1000));
  if (sec < 60) return `${sec}s`;
  const min = Math.round(sec / 60);
  if (min < 60) return `${min}m`;
  const hours = Math.round(min / 60);
  if (hours < 48) return `${hours}h`;
  const days = Math.round(hours / 24);
  return `${days}d`;
}

function badgeFor(kind: FreshnessKind, age: number | null): string | null {
  if (kind === "live") return null;
  const compact = age != null ? formatCompactAge(age) : null;
  if (kind === "offline") {
    return compact ? `Offline · ${compact}` : "Offline";
  }
  return compact ? `${compact} ago` : "Stale";
}

function titleFor(kind: FreshnessKind, age: number | null, subject: string): string {
  const compact = age != null ? formatCompactAge(age) : null;
  if (kind === "offline") {
    return compact
      ? `${subject} cached ${compact} ago. You are offline.`
      : `${subject} is cached because you are offline.`;
  }
  if (kind === "stale") {
    return compact ? `${subject} last updated ${compact} ago.` : `${subject} is stale.`;
  }
  return `${subject} is live.`;
}

export function resolveFreshness(input: {
  asOf: string | number | null | undefined;
  online: boolean;
  fromCache?: boolean;
  thresholdMs: number;
  subject: string;
  now?: number;
}): Freshness {
  const now = input.now ?? Date.now();
  const age = ageMs(input.asOf, now);
  const offline = input.online === false || input.fromCache === true;
  const pastThreshold = age == null || age > input.thresholdMs;
  const kind: FreshnessKind = offline ? "offline" : pastThreshold ? "stale" : "live";
  return {
    kind,
    stale: kind !== "live",
    ageMs: age,
    badge: badgeFor(kind, age),
    title: titleFor(kind, age, input.subject),
  };
}

export function quoteFreshness(input: {
  asOf: string | number | null | undefined;
  online: boolean;
  fromCache?: boolean;
  now?: number;
}): Freshness {
  return resolveFreshness({
    ...input,
    thresholdMs: QUOTE_STALE_MS,
    subject: "Quote",
  });
}

export function accountFreshness(input: {
  lastSyncAt: string | number | null | undefined;
  online: boolean;
  fromCache?: boolean;
  now?: number;
}): Freshness {
  const freshness = resolveFreshness({
    asOf: input.lastSyncAt,
    online: input.online,
    fromCache: input.fromCache,
    thresholdMs: ACCOUNT_STALE_MS,
    subject: "Account figures",
    now: input.now,
  });
  if (!input.lastSyncAt) {
    return {
      ...freshness,
      stale: true,
      kind: input.online === false ? "offline" : "stale",
      badge: input.online === false ? "Offline · never synced" : "Never synced",
      title: "Account figures have never synced.",
    };
  }
  if (freshness.kind === "live") {
    const compact = freshness.ageMs != null ? formatCompactAge(freshness.ageMs) : null;
    return {
      ...freshness,
      badge: compact ? `Synced ${compact} ago` : "Synced",
      title: compact
        ? `Account figures synced ${compact} ago.`
        : "Account figures are in sync.",
    };
  }
  if (freshness.kind === "stale") {
    const compact = freshness.ageMs != null ? formatCompactAge(freshness.ageMs) : null;
    return {
      ...freshness,
      badge: compact ? `Stale · ${compact}` : "Stale",
      title: compact
        ? `Last account sync ${compact} ago.`
        : "Account figures are stale.",
    };
  }
  return freshness;
}

export function candleFreshness(input: {
  savedAt: number | null | undefined;
  online: boolean;
  now?: number;
}): Freshness {
  return resolveFreshness({
    asOf: input.savedAt,
    online: input.online,
    thresholdMs: CANDLE_FRESH_MS,
    subject: "Candles",
    now: input.now,
  });
}
