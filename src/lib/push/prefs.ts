import { PUSH_CATEGORIES, isPushCategory, type PushCategory } from "@/lib/push/categories";

export type QuietHours = {
  enabled: boolean;
  start: string;
  end: string;
  timezone: string;
};

export type PushNotificationPrefs = {
  categories: Record<PushCategory, boolean>;
  quietHours: QuietHours;
};

export const DEFAULT_PUSH_PREFS: PushNotificationPrefs = {
  categories: {
    price_alert: true,
    risk_alert: true,
    broker_disconnect: true,
    economic_event: true,
    axe_finding: true,
  },
  quietHours: {
    enabled: false,
    start: "22:00",
    end: "07:00",
    timezone: "Europe/Amsterdam",
  },
};

const TIME_RE = /^([01]\d|2[0-3]):([0-5]\d)$/;

export function isValidClock(value: string): boolean {
  return TIME_RE.test(value);
}

function minutesFromClock(value: string): number | null {
  const match = TIME_RE.exec(value);
  if (!match) return null;
  return Number(match[1]) * 60 + Number(match[2]);
}

export function clockInTimezone(now: Date, timezone: string): string {
  try {
    const parts = new Intl.DateTimeFormat("en-GB", {
      timeZone: timezone || "UTC",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    }).formatToParts(now);
    const hour = parts.find((p) => p.type === "hour")?.value ?? "00";
    const minute = parts.find((p) => p.type === "minute")?.value ?? "00";
    return `${hour.padStart(2, "0")}:${minute.padStart(2, "0")}`;
  } catch {
    const hour = String(now.getUTCHours()).padStart(2, "0");
    const minute = String(now.getUTCMinutes()).padStart(2, "0");
    return `${hour}:${minute}`;
  }
}

/**
 * Quiet hours wrap midnight when start > end (22:00–07:00).
 * Equal start/end means the whole day is quiet when enabled.
 */
export function isWithinQuietHours(now: Date, quiet: QuietHours): boolean {
  if (!quiet.enabled) return false;
  const start = minutesFromClock(quiet.start);
  const end = minutesFromClock(quiet.end);
  if (start == null || end == null) return false;
  const current = minutesFromClock(clockInTimezone(now, quiet.timezone));
  if (current == null) return false;
  if (start === end) return true;
  if (start < end) return current >= start && current < end;
  return current >= start || current < end;
}

export function sanitizePushPrefs(raw: unknown, fallback: PushNotificationPrefs = DEFAULT_PUSH_PREFS): PushNotificationPrefs {
  const src =
    raw && typeof raw === "object" && !Array.isArray(raw)
      ? (raw as Record<string, unknown>)
      : {};
  const nested =
    src.push && typeof src.push === "object" && !Array.isArray(src.push)
      ? (src.push as Record<string, unknown>)
      : src;

  const categories = { ...fallback.categories };
  const incomingCats =
    nested.categories && typeof nested.categories === "object" && !Array.isArray(nested.categories)
      ? (nested.categories as Record<string, unknown>)
      : {};
  for (const key of PUSH_CATEGORIES) {
    if (key in incomingCats) categories[key] = incomingCats[key] !== false;
  }

  const incomingQuiet =
    nested.quietHours && typeof nested.quietHours === "object" && !Array.isArray(nested.quietHours)
      ? (nested.quietHours as Record<string, unknown>)
      : {};
  const start = typeof incomingQuiet.start === "string" && isValidClock(incomingQuiet.start)
    ? incomingQuiet.start
    : fallback.quietHours.start;
  const end = typeof incomingQuiet.end === "string" && isValidClock(incomingQuiet.end)
    ? incomingQuiet.end
    : fallback.quietHours.end;
  const timezone =
    typeof incomingQuiet.timezone === "string" && incomingQuiet.timezone.trim()
      ? incomingQuiet.timezone.trim()
      : fallback.quietHours.timezone;

  return {
    categories,
    quietHours: {
      enabled: incomingQuiet.enabled === true,
      start,
      end,
      timezone,
    },
  };
}

/** Read the push slice out of `profiles.preferences` (or a dedicated column). */
export function prefsFromProfileRow(preferences: unknown, timezone?: string | null): PushNotificationPrefs {
  const parsed = sanitizePushPrefs(preferences);
  if (timezone?.trim() && parsed.quietHours.timezone === DEFAULT_PUSH_PREFS.quietHours.timezone) {
    return {
      ...parsed,
      quietHours: { ...parsed.quietHours, timezone: timezone.trim() },
    };
  }
  return parsed;
}

export function mergePushSliceIntoPreferences(
  existing: unknown,
  next: PushNotificationPrefs,
): Record<string, unknown> {
  const base =
    existing && typeof existing === "object" && !Array.isArray(existing)
      ? { ...(existing as Record<string, unknown>) }
      : {};
  base.push = next;
  return base;
}

export function isCategoryEnabled(prefs: PushNotificationPrefs, category: PushCategory): boolean {
  return prefs.categories[category] !== false;
}

export function shouldSuppressForPrefs(
  prefs: PushNotificationPrefs,
  category: PushCategory,
  now: Date = new Date(),
): "category_disabled" | "quiet_hours" | null {
  if (!isPushCategory(category)) return "category_disabled";
  if (!isCategoryEnabled(prefs, category)) return "category_disabled";
  if (isWithinQuietHours(now, prefs.quietHours)) return "quiet_hours";
  return null;
}
