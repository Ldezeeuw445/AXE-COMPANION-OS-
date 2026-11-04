/**
 * When does a trading day start?
 *
 * Five things on the chart depend on the answer: session VWAP, the session
 * open line, and Previous Day High / Low / Equilibrium. All five bucketed
 * candles by **UTC** date, and all five were therefore wrong for FX.
 *
 * MT5's server day — and the FX convention generally — rolls at EET midnight,
 * which is 17:00 New York, the actual close of the trading day. UTC midnight
 * is two or three hours later depending on the time of year, so:
 *
 *  - PDH and PDL were drawn from a window that ran two hours into the next
 *    day and stopped two hours short of the real one. For levels traders
 *    enter and exit on, that is not a rounding error.
 *  - Every Monday was worse. FX opens Sunday 21:00 or 22:00 UTC, which under
 *    a UTC key is its own "day" — a two-hour stub. So on Monday, "previous
 *    day" was that stub, not Friday's full session. A trader looking at
 *    Monday's PDH was looking at the high of Sunday evening.
 *  - Session VWAP restarted hours after the broker's own candle for the new
 *    day had already printed.
 *
 * On the broker's day, Sunday evening's candles belong to Monday, and
 * Monday's previous day is Friday — which is what MT5 shows.
 *
 * Dependency-free: `Intl` is built in, and the verify suite exercises this
 * directly.
 */

/**
 * MT5 brokers name their server timezone in their own shorthand, and MetaApi
 * passes that string through. These are the names that actually turn up; an
 * IANA zone is also accepted and used as-is, which is why the lookup falls
 * through rather than rejecting.
 *
 * Mapped to IANA zones rather than fixed offsets on purpose: a broker on
 * "EET" moves to EEST in summer, and a fixed +02:00 would put the day
 * boundary an hour out for seven months of the year.
 */
const BROKER_ZONE_ALIASES: Record<string, string> = {
  EET: "Europe/Athens",
  EEST: "Europe/Athens",
  "EET/EEST": "Europe/Athens",
  CET: "Europe/Berlin",
  CEST: "Europe/Berlin",
  "CET/CEST": "Europe/Berlin",
  GMT: "Etc/GMT",
  UTC: "UTC",
  BST: "Europe/London",
  EST: "America/New_York",
  EDT: "America/New_York",
  "EST/EDT": "America/New_York",
  CST: "America/Chicago",
  MSK: "Europe/Moscow",
  AEST: "Australia/Sydney",
  JST: "Asia/Tokyo",
};

/**
 * The default when an account has no stored broker timezone.
 *
 * EET, because that is what the overwhelming majority of MT5 brokers run and
 * what `DEFAULT_BROKER_TIMEZONE` in the MetaApi client already assumes. A
 * wrong-but-conventional boundary beats UTC here: UTC is wrong for nearly
 * every FX broker, EET is right for most.
 */
export const DEFAULT_SESSION_ZONE = "Europe/Athens";

/** Broker shorthand, an IANA zone, or nothing → an IANA zone. */
export function resolveSessionZone(brokerTimezone?: string | null): string {
  const raw = String(brokerTimezone ?? "").trim();
  if (!raw) return DEFAULT_SESSION_ZONE;
  const alias = BROKER_ZONE_ALIASES[raw.toUpperCase()];
  if (alias) return alias;
  // Anything else is taken as an IANA zone, but only if this runtime agrees
  // it is one — an unknown zone makes Intl throw, and a chart must not blank
  // out because a broker sent a name nobody has seen before.
  return isValidTimeZone(raw) ? raw : DEFAULT_SESSION_ZONE;
}

function isValidTimeZone(zone: string): boolean {
  try {
    new Intl.DateTimeFormat("en-CA", { timeZone: zone });
    return true;
  } catch {
    return false;
  }
}

/**
 * Building an `Intl.DateTimeFormat` is expensive and this runs once per
 * candle, on every repaint, for a few thousand candles.
 */
const formatters = new Map<string, Intl.DateTimeFormat>();

function formatterFor(timeZone: string): Intl.DateTimeFormat {
  const cached = formatters.get(timeZone);
  if (cached) return cached;
  // en-CA gives YYYY-MM-DD, which sorts and compares as a plain string.
  const created = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  formatters.set(timeZone, created);
  return created;
}

/**
 * The trading day a candle belongs to, as `YYYY-MM-DD` in `timeZone`.
 *
 * Returns an empty string for a timestamp that is not a finite number, so a
 * bad candle groups with other bad candles instead of silently joining today.
 */
export function sessionDayKey(unixSeconds: number, timeZone: string): string {
  if (!Number.isFinite(unixSeconds)) return "";
  return formatterFor(timeZone).format(new Date(unixSeconds * 1000));
}

/**
 * The broker's trading-day key for an instant (`YYYY-MM-DD` in `timeZone`).
 * Same answer as `sessionDayKey` for a candle's unix seconds.
 */
export function brokerDayKey(now: Date, timeZone: string): string {
  return sessionDayKey(Math.floor(now.getTime() / 1000), timeZone);
}

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

function readZonedParts(
  instant: Date,
  timeZone: string,
): { year: number; month: number; day: number; hour: number; minute: number; second: number } {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(instant);
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? NaN);
  return {
    year: get("year"),
    month: get("month"),
    day: get("day"),
    hour: get("hour"),
    minute: get("minute"),
    second: get("second"),
  };
}

/**
 * UTC instant of the broker-day boundary for `now`.
 *
 * Default reset is midnight in `timeZone`. Pass `resetTime` as `HH:MM` when a
 * firm rolls the day at a different local clock (rare; most MT5 servers use
 * midnight server time). DST-safe: the offset is re-read after the first guess.
 */
function previousDayKey(dayKey: string): string {
  const [y, m, d] = dayKey.split("-").map(Number);
  const prev = new Date(Date.UTC(y, m - 1, d - 1, 12, 0, 0));
  return `${prev.getUTCFullYear()}-${pad2(prev.getUTCMonth() + 1)}-${pad2(prev.getUTCDate())}`;
}

/** UTC instant of `HH:MM` on a given `YYYY-MM-DD` calendar day in `timeZone`. */
function wallClockOnDay(dayKey: string, timeZone: string, resetHour: number, resetMinute: number): Date {
  const [y, m, d] = dayKey.split("-").map(Number);
  let utcMs = Date.UTC(y, m - 1, d, resetHour, resetMinute, 0);
  for (let i = 0; i < 3; i += 1) {
    const local = readZonedParts(new Date(utcMs), timeZone);
    const asIfUtc = Date.UTC(local.year, local.month - 1, local.day, local.hour, local.minute, local.second);
    const desired = Date.UTC(y, m - 1, d, resetHour, resetMinute, 0);
    utcMs += desired - asIfUtc;
  }
  return new Date(utcMs);
}

export function brokerDayStart(now: Date, timeZone: string, resetTime = "00:00"): Date {
  const match = /^(\d{1,2}):(\d{2})$/.exec(String(resetTime).trim());
  const resetHour = match ? Number(match[1]) : 0;
  const resetMinute = match ? Number(match[2]) : 0;
  if (
    !Number.isFinite(resetHour) ||
    !Number.isFinite(resetMinute) ||
    resetHour < 0 ||
    resetHour > 23 ||
    resetMinute < 0 ||
    resetMinute > 59
  ) {
    return brokerDayStart(now, timeZone, "00:00");
  }

  let dayKey = brokerDayKey(now, timeZone);
  let start = wallClockOnDay(dayKey, timeZone, resetHour, resetMinute);
  // Non-midnight reset: before today's reset clock, the open trading day
  // began on the previous calendar date at that same local clock.
  if (start.getTime() > now.getTime()) {
    dayKey = previousDayKey(dayKey);
    start = wallClockOnDay(dayKey, timeZone, resetHour, resetMinute);
  }
  return start;
}
