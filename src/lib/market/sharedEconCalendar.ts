/**
 * Read side of `public.econ_calendar_events` — the shared economic calendar.
 *
 * Trading OS owns the table and the intel-proxy cron that fills it from
 * Finance Calendar (financecalendar.com, paid plan): actual, consensus, prior,
 * surprise, impact and the exact UTC release time. Companion only reads, as
 * the signed-in user (RLS: SELECT for `authenticated`).
 *
 * Fresh = the newest ingest is younger than 2 hours. Anything else returns []
 * and the caller falls back to the existing Finnhub → market-proxy → Forex
 * Factory chain. Null figures stay null.
 *
 * Finance Calendar terms: show a link to https://www.financecalendar.com near
 * the data (see FINANCE_CALENDAR_ATTRIBUTION_URL).
 */

import type { EconomicEvent } from "@/lib/market/marketTypes";

/** Exact column list of the Trading OS econ_calendar_events read contract. */
export const SHARED_ECON_SELECT =
  "id,title,name,country,currency,impact,status,event_date,release_at,all_day,consensus,prior,actual,surprise,unit,event_url,ingested_at";

/** Cron is every 15 minutes; older than this means the ingest is down. */
export const SHARED_ECON_FRESH_MS = 2 * 60 * 60 * 1000;

export const FINANCE_CALENDAR_ATTRIBUTION_URL = "https://www.financecalendar.com";

export type SharedEconRow = {
  id: string;
  title: string;
  name: string | null;
  country: string | null;
  currency: string | null;
  impact: string | null;
  status: string | null;
  event_date: string;
  release_at: string | null;
  all_day: boolean | null;
  consensus: string | null;
  prior: string | null;
  actual: string | null;
  surprise: string | null;
  unit: string | null;
  event_url: string | null;
  ingested_at: string | null;
};

const IMPACTS = new Set(["high", "medium", "low"]);

export function mapSharedEconRow(row: SharedEconRow | null | undefined): EconomicEvent | null {
  if (!row || typeof row.id !== "string" || !row.id) return null;
  if (row.status === "cancelled") return null;
  const title = (row.name && row.name.length < (row.title ?? "").length ? row.name : row.title)?.trim();
  if (!title) return null;
  const startsRaw = row.release_at ?? (row.event_date ? `${row.event_date}T00:00:00.000Z` : null);
  const startsMs = startsRaw ? Date.parse(startsRaw) : NaN;
  if (!Number.isFinite(startsMs)) return null;
  const impact = typeof row.impact === "string" && IMPACTS.has(row.impact) ? (row.impact as EconomicEvent["impact"]) : "unknown";
  const url = typeof row.event_url === "string" && /^https:\/\//i.test(row.event_url) ? row.event_url : null;
  return {
    id: row.id,
    title,
    country: row.country ?? null,
    currency: row.currency ?? null,
    startsAt: new Date(startsMs).toISOString(),
    impact,
    actual: row.actual ?? null,
    forecast: row.consensus ?? null,
    previous: row.prior ?? null,
    surprise: row.surprise ?? null,
    unit: row.unit ?? null,
    eventUrl: url,
    allDay: Boolean(row.all_day) || !row.release_at,
    provider: "financeCalendar",
  };
}

/**
 * Rows from the current ingest only (fresh and not dropped upstream), mapped,
 * inside [now − 12h, now + daysAhead], soonest first. [] when stale or empty.
 */
export function pickFreshSharedEcon(
  rows: readonly SharedEconRow[] | null | undefined,
  opts: { nowMs: number; daysAhead: number },
): EconomicEvent[] {
  const list = rows ?? [];
  const ingest = (r: SharedEconRow) => (r.ingested_at ? Date.parse(r.ingested_at) : NaN);
  const newest = list.reduce((m, r) => (Number.isFinite(ingest(r)) ? Math.max(m, ingest(r)) : m), 0);
  if (!newest || opts.nowMs - newest > SHARED_ECON_FRESH_MS) return [];
  const from = opts.nowMs - 12 * 60 * 60 * 1000;
  const to = opts.nowMs + opts.daysAhead * 24 * 60 * 60 * 1000;
  return list
    .filter((r) => ingest(r) >= newest - SHARED_ECON_FRESH_MS)
    .map(mapSharedEconRow)
    .filter((e): e is EconomicEvent => e != null)
    .filter((e) => {
      const t = Date.parse(e.startsAt);
      // Date-only rows sit at 00:00 UTC: keep the day they belong to.
      return t <= to && (t >= from || (e.allDay === true && t >= from - 24 * 60 * 60 * 1000));
    })
    .sort((a, b) => Date.parse(a.startsAt) - Date.parse(b.startsAt));
}

export type SharedEconQueryClient = {
  from: (table: string) => {
    select: (cols: string) => {
      gte: (col: string, v: string) => {
        lte: (col: string, v: string) => {
          order: (col: string, o: { ascending: boolean }) => {
            limit: (n: number) => PromiseLike<{ data: unknown[] | null; error: unknown }>;
          };
        };
      };
    };
  };
};

/** Read the shared table; [] on any error, missing table, empty or stale ingest. */
export async function loadSharedEconRows(
  supabase: SharedEconQueryClient | null | undefined,
  opts: { daysAhead: number; nowMs?: number },
): Promise<EconomicEvent[]> {
  if (!supabase) return [];
  const nowMs = opts.nowMs ?? Date.now();
  const day = (ms: number) => new Date(ms).toISOString().slice(0, 10);
  try {
    const { data, error } = await supabase
      .from("econ_calendar_events")
      .select(SHARED_ECON_SELECT)
      .gte("event_date", day(nowMs - 36 * 60 * 60 * 1000))
      .lte("event_date", day(nowMs + opts.daysAhead * 24 * 60 * 60 * 1000))
      .order("event_date", { ascending: true })
      .limit(1000);
    if (error || !Array.isArray(data)) return [];
    return pickFreshSharedEcon(data as SharedEconRow[], { nowMs, daysAhead: opts.daysAhead });
  } catch {
    return [];
  }
}

/** "+0.2" / "-0.3" — surprise with an explicit sign; null when not a number. */
export function formatSurprise(surprise: string | number | null | undefined): string | null {
  if (surprise == null) return null;
  const t = String(surprise).trim();
  if (!t) return null;
  const n = Number(t);
  if (!Number.isFinite(n)) return null;
  return n > 0 && !t.startsWith("+") ? `+${t}` : t;
}
