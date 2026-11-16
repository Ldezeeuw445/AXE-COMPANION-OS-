/**
 * Reduces an economic-calendar read to what the auto-trade guard needs.
 *
 * Pure and import-free (same strip-types constraint as autoTradeGuard).
 *
 * The distinction that matters: an EMPTY calendar is not "no news". Every
 * provider swallows its own network errors and returns [] — so a dead feed and
 * a quiet week look identical. A real calendar covering the window below
 * (12 h back to days ahead) is never empty, so zero events means the data is
 * missing, and the guard must treat it as unknown rather than as clear.
 */

export type CalendarEventLike = {
  impact: string;
  startsAt: string;
};

export type NewsReading = {
  /** False when the calendar could not be read (no events from any provider). */
  calendarKnown: boolean;
  /** Minutes to the nearest high-impact event inside the window, else null. */
  minutesToHighImpact: number | null;
};

/** Events further out than this are not "near" for the guard. */
const LOOKBEHIND_MIN = 45;
const LOOKAHEAD_MIN = 90;

export function readNewsWindow(
  events: readonly CalendarEventLike[] | null | undefined,
  nowMs: number,
): NewsReading {
  if (!events || events.length === 0) {
    return { calendarKnown: false, minutesToHighImpact: null };
  }
  let nearest: number | null = null;
  for (const event of events) {
    if (event.impact !== "high") continue;
    const t = new Date(event.startsAt).getTime();
    if (!Number.isFinite(t)) continue;
    const delta = (t - nowMs) / 60000;
    if (delta < -LOOKBEHIND_MIN || delta > LOOKAHEAD_MIN) continue;
    if (nearest === null || Math.abs(delta) < Math.abs(nearest)) nearest = delta;
  }
  return { calendarKnown: true, minutesToHighImpact: nearest };
}
