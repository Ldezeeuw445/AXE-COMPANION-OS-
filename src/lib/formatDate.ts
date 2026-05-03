/**
 * Deterministic date/time strings for SSR + hydration (same in Node and browser).
 * Do not use `toLocaleString()` without fixed locale + timeZone in Client Components.
 */
const LOCALE = "nl-NL";
const TIME_ZONE = "Europe/Amsterdam";

const dateTimeShort = new Intl.DateTimeFormat(LOCALE, {
  dateStyle: "short",
  timeStyle: "short",
  timeZone: TIME_ZONE,
});

const timeHm = new Intl.DateTimeFormat(LOCALE, {
  hour: "2-digit",
  minute: "2-digit",
  timeZone: TIME_ZONE,
});

const weekdayMonthDayHm = new Intl.DateTimeFormat(LOCALE, {
  weekday: "short",
  month: "short",
  day: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: TIME_ZONE,
});

const monthDay = new Intl.DateTimeFormat(LOCALE, {
  month: "short",
  day: "numeric",
  timeZone: TIME_ZONE,
});

function toDate(iso: string | number | Date): Date | null {
  const d = typeof iso === "string" || typeof iso === "number" ? new Date(iso) : iso;
  return Number.isNaN(d.getTime()) ? null : d;
}

export function formatDateTimeShort(iso: string | number | Date): string {
  const d = toDate(iso);
  return d ? dateTimeShort.format(d) : "—";
}

export function formatTimeHm(iso: string | number | Date): string {
  const d = toDate(iso);
  return d ? timeHm.format(d) : "—";
}

export function formatWeekdayMonthDayTime(iso: string | number | Date): string {
  const d = toDate(iso);
  return d ? weekdayMonthDayHm.format(d) : "—";
}

export function formatMonthDay(iso: string | number | Date): string {
  const d = toDate(iso);
  return d ? monthDay.format(d) : "—";
}
