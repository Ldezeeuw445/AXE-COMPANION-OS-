/**
 * FX session clock for Home.
 *
 * Hours are the common cash-session heuristic in each city's own timezone
 * (not an exchange calendar). Status is computed from a real clock.
 */

export type SessionStatus = "open" | "soon" | "closed";

export type FxSessionId = "syd" | "tyo" | "ldn" | "nyc";

export type FxSessionDef = {
  id: FxSessionId;
  code: string;
  name: string;
  timeZone: string;
  /** Local hour the session opens (inclusive). */
  openHour: number;
  /** Local hour the session closes (exclusive). */
  closeHour: number;
};

export const FX_SESSIONS: readonly FxSessionDef[] = [
  { id: "syd", code: "SYD", name: "Sydney", timeZone: "Australia/Sydney", openHour: 8, closeHour: 17 },
  { id: "tyo", code: "TYO", name: "Tokyo", timeZone: "Asia/Tokyo", openHour: 9, closeHour: 18 },
  { id: "ldn", code: "LDN", name: "London", timeZone: "Europe/London", openHour: 8, closeHour: 16 },
  { id: "nyc", code: "NYC", name: "New York", timeZone: "America/New_York", openHour: 8, closeHour: 17 },
] as const;

export const SOON_MINUTES = 90;

export type SessionClock = {
  status: SessionStatus;
  localTime: string;
  hour: number;
  minute: number;
  minutesUntilOpen: number | null;
  minutesUntilClose: number | null;
};

export type TimelineBlock = {
  id: string;
  startPct: number;
  widthPct: number;
};

function tzParts(date: Date, timeZone: string): { hour: number; minute: number; second: number } {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone,
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const num = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? 0);
  return { hour: num("hour"), minute: num("minute"), second: num("second") };
}

function pad2(n: number): string {
  return n.toString().padStart(2, "0");
}

function minutesUntil(fromMin: number, toMin: number): number {
  const diff = toMin - fromMin;
  return diff >= 0 ? diff : diff + 24 * 60;
}

export function sessionClock(def: FxSessionDef, now: Date, soonMinutes = SOON_MINUTES): SessionClock {
  const { hour, minute } = tzParts(now, def.timeZone);
  const nowMin = hour * 60 + minute;
  const openMin = def.openHour * 60;
  const closeMin = def.closeHour * 60;
  const open = nowMin >= openMin && nowMin < closeMin;
  const untilOpen = open ? null : minutesUntil(nowMin, openMin);
  const untilClose = open ? minutesUntil(nowMin, closeMin) : null;
  let status: SessionStatus = "closed";
  if (open) status = "open";
  else if (untilOpen != null && untilOpen <= soonMinutes) status = "soon";

  return {
    status,
    localTime: `${pad2(hour)}:${pad2(minute)}`,
    hour,
    minute,
    minutesUntilOpen: untilOpen,
    minutesUntilClose: untilClose,
  };
}

export function formatCountdown(minutes: number | null): string {
  if (minutes == null) return "";
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h <= 0) return `${m}m`;
  return `${h}h ${pad2(m)}m`;
}

/**
 * Map a session's local open/close onto a 24h bar in `viewZone`.
 * Sessions that wrap midnight become two blocks.
 */
export function sessionTimelineBlocks(
  def: FxSessionDef,
  now: Date,
  viewZone: string,
): TimelineBlock[] {
  const openUtc = wallTimeToUtc(now, def.timeZone, def.openHour, 0);
  const closeUtc = wallTimeToUtc(now, def.timeZone, def.closeHour, 0);
  const openMin = minutesInZone(openUtc, viewZone);
  const closeMin = minutesInZone(closeUtc, viewZone);
  return blocksFromRange(def.id, openMin, closeMin);
}

function blocksFromRange(id: string, startMin: number, endMin: number): TimelineBlock[] {
  const start = ((startMin % 1440) + 1440) % 1440;
  const end = ((endMin % 1440) + 1440) % 1440;
  if (start === end) return [];
  if (end > start) {
    return [{ id, startPct: (start / 1440) * 100, widthPct: ((end - start) / 1440) * 100 }];
  }
  return [
    { id: `${id}-a`, startPct: (start / 1440) * 100, widthPct: ((1440 - start) / 1440) * 100 },
    { id: `${id}-b`, startPct: 0, widthPct: (end / 1440) * 100 },
  ];
}

function minutesInZone(date: Date, timeZone: string): number {
  const { hour, minute } = tzParts(date, timeZone);
  return hour * 60 + minute;
}

/** The UTC instant of `hour:minute` on `now`'s calendar day in `timeZone`. */
export function wallTimeToUtc(now: Date, timeZone: string, hour: number, minute: number): Date {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hourCycle: "h23",
  }).formatToParts(now);
  const num = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? 0);
  const y = num("year");
  const mo = num("month");
  const d = num("day");
  const guess = new Date(Date.UTC(y, mo - 1, d, hour, minute, 0));
  const asZone = tzParts(guess, timeZone);
  const wanted = hour * 60 + minute;
  const got = asZone.hour * 60 + asZone.minute;
  return new Date(guess.getTime() + (wanted - got) * 60_000);
}

export function nowMarkerPct(now: Date, viewZone: string): number {
  return (minutesInZone(now, viewZone) / 1440) * 100;
}

export function clockLabel(now: Date, timeZone: string): { time: string; zone: string } {
  const time = new Intl.DateTimeFormat("en-GB", {
    timeZone,
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).format(now);
  const zone =
    new Intl.DateTimeFormat("en-GB", { timeZone, timeZoneName: "shortOffset" })
      .formatToParts(now)
      .find((p) => p.type === "timeZoneName")?.value ?? timeZone;
  const city = timeZone.split("/").pop()?.replace(/_/g, " ") ?? timeZone;
  return { time, zone: `${zone} · ${city}` };
}

export function formatSessionStatusLine(def: FxSessionDef, clock: SessionClock): string {
  if (clock.status === "open") return `Open · ${clock.localTime}`;
  if (clock.status === "soon") return `Opens in ${formatCountdown(clock.minutesUntilOpen)}`;
  return "Closed";
}
