/**
 * Event source for the auto-trade news guard: the existing calendar chain
 * (Finnhub → market-proxy → Forex Factory) MERGED with the shared Finance
 * Calendar table (public.econ_calendar_events, filled by Trading OS).
 *
 * Pure and import-free (same strip-types constraint as newsWindow /
 * autoTradeGuard). Only the event list changes; the blocking rules
 * (readNewsWindow look-behind/ahead, the ±30 min window in evaluateAutoTrade,
 * no currency filter) are untouched.
 *
 * Rules
 * - Union, never replace: Finance Calendar covers fewer series than Forex
 *   Factory, so nothing from the existing chain is ever dropped.
 * - Finance Calendar rows without an exact release time (date-only / allDay)
 *   are ignored: they sit at 00:00 UTC and would invent a midnight window.
 * - Dedupe: same currency, release within 2 minutes, and the same event name
 *   (normalised; one name containing the other counts, e.g. "CPI" vs "US CPI").
 *   On a duplicate the existing-chain row stays and the Finance Calendar row
 *   is skipped; differently-timed copies are both kept (the guard then simply
 *   sees the nearer one — more cautious, never less).
 * - Empty shared list (table stale > 2h, empty, unreadable, timed out) →
 *   the existing list is returned as-is: exactly today's behaviour.
 */

export type GuardCalendarEvent = {
  id?: string;
  title: string;
  currency?: string | null;
  country?: string | null;
  impact: string;
  startsAt: string;
  allDay?: boolean;
  provider?: string;
};

export const GUARD_DEDUPE_WINDOW_MS = 2 * 60 * 1000;

const STOP = new Set(["the", "of", "and", "y", "m", "q", "yy", "mm", "qq", "sa", "nsa", "prel", "preliminary", "final", "flash", "report"]);
const COUNTRY_WORDS = new Set(["us", "usa", "uk", "gb", "eu", "euro", "eurozone", "area", "german", "germany", "japan", "jp", "canada", "ca", "australia", "au", "nz", "new", "zealand", "swiss", "switzerland", "ch", "china", "cn", "united", "states", "kingdom"]);

/** "US CPI Report November 2026" → "cpi"; "CPI y/y" → "cpi"; "Non-Farm Employment Change" → "nonfarm employment change". */
export function normaliseEventName(title: string): string {
  return String(title ?? "")
    .toLowerCase()
    .replace(/non-farm/g, "nonfarm")
    .replace(/\b(january|february|march|april|may|june|july|august|september|october|november|december)\b/g, " ")
    .replace(/\b\d{4}(-\d{2})?\b/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .split(" ")
    .filter((w) => w && !STOP.has(w) && !COUNTRY_WORDS.has(w))
    .join(" ")
    .trim();
}

function sameName(a: string, b: string): boolean {
  const x = normaliseEventName(a);
  const y = normaliseEventName(b);
  if (!x || !y) return false;
  return x === y || x.includes(y) || y.includes(x);
}

const ccy = (e: GuardCalendarEvent) => String(e.currency ?? "").trim().toUpperCase();

export function isDuplicateEvent(a: GuardCalendarEvent, b: GuardCalendarEvent): boolean {
  const ta = Date.parse(a.startsAt);
  const tb = Date.parse(b.startsAt);
  if (!Number.isFinite(ta) || !Number.isFinite(tb)) return false;
  if (Math.abs(ta - tb) > GUARD_DEDUPE_WINDOW_MS) return false;
  if (!ccy(a) || ccy(a) !== ccy(b)) return false;
  return sameName(a.title, b.title);
}

/**
 * Existing-chain events + Finance Calendar events with an exact time, minus
 * duplicates. Returns `existing` itself (same array) when there is nothing to add.
 */
export function mergeGuardCalendar<T extends GuardCalendarEvent>(
  existing: readonly T[],
  shared: readonly T[],
): readonly T[] {
  const timed = shared.filter((e) => e.allDay !== true && Number.isFinite(Date.parse(e.startsAt)));
  if (timed.length === 0) return existing;
  const out: T[] = [...existing];
  for (const fc of timed) {
    if (existing.some((e) => isDuplicateEvent(e, fc))) continue;
    out.push(fc);
  }
  return out.sort((a, b) => Date.parse(a.startsAt) - Date.parse(b.startsAt));
}

/** Resolve to `fallback` when `p` rejects or takes longer than `ms`. Never throws. */
export function withTimeout<T>(p: Promise<T>, ms: number, fallback: T): Promise<T> {
  return new Promise<T>((resolve) => {
    const timer = setTimeout(() => resolve(fallback), ms);
    p.then(
      (v) => {
        clearTimeout(timer);
        resolve(v);
      },
      () => {
        clearTimeout(timer);
        resolve(fallback);
      },
    );
  });
}
