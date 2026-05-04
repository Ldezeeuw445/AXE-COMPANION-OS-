import "server-only";
import { getFinnhubKey, getFmpKey } from "@/lib/market/providerStatus";
import type { EconomicEvent } from "@/lib/market/marketTypes";

const REVALIDATE_SECONDS = 60 * 30; // 30 min

function rangeIso(daysAhead: number): { from: string; to: string } {
  const now = new Date();
  const start = new Date(now.getTime() - 12 * 60 * 60 * 1000); // include last ~12h for context
  const end = new Date(now.getTime() + daysAhead * 24 * 60 * 60 * 1000);
  const fmt = (d: Date) => d.toISOString().slice(0, 10);
  return { from: fmt(start), to: fmt(end) };
}

function mapImpact(raw: string | number | null | undefined): EconomicEvent["impact"] {
  if (raw == null) return "unknown";
  const v = String(raw).toLowerCase();
  if (v === "3" || v.includes("high")) return "high";
  if (v === "2" || v.includes("medium") || v.includes("moderate")) return "medium";
  if (v === "1" || v.includes("low")) return "low";
  return "unknown";
}

// ── Finnhub `/calendar/economic` ───────────────────────────────────────────
type FinnhubEvent = {
  actual?: number | string | null;
  country?: string;
  estimate?: number | string | null;
  event?: string;
  impact?: string;
  prev?: number | string | null;
  time?: string;
  unit?: string;
};

async function fetchFinnhubCalendar(daysAhead: number): Promise<EconomicEvent[]> {
  const apiKey = getFinnhubKey();
  if (!apiKey) return [];
  const { from, to } = rangeIso(daysAhead);
  const params = new URLSearchParams({ from, to, token: apiKey });
  try {
    const res = await fetch(`https://finnhub.io/api/v1/calendar/economic?${params.toString()}`, {
      next: { revalidate: REVALIDATE_SECONDS, tags: ["calendar:finnhub"] },
    });
    if (!res.ok) return [];
    const body = (await res.json()) as { economicCalendar?: FinnhubEvent[] };
    const arr = body.economicCalendar ?? [];
    return arr
      .map((e, i) => ({
        id: `finnhub:${e.country ?? ""}:${e.event ?? ""}:${e.time ?? i}`,
        title: e.event ?? "Economic event",
        country: e.country ?? null,
        currency: e.country ? guessCurrency(e.country) : null,
        startsAt: e.time ? new Date(e.time.replace(" ", "T") + "Z").toISOString() : new Date().toISOString(),
        impact: mapImpact(e.impact),
        actual: e.actual ?? null,
        forecast: e.estimate ?? null,
        previous: e.prev ?? null,
        unit: e.unit ?? null,
        provider: "finnhub" as const,
      }))
      .sort((a, b) => Date.parse(a.startsAt) - Date.parse(b.startsAt));
  } catch {
    return [];
  }
}

// ── FMP `/economic_calendar` (fallback) ────────────────────────────────────
type FmpCalendarEvent = {
  date?: string;
  country?: string;
  event?: string;
  currency?: string;
  previous?: number | string | null;
  estimate?: number | string | null;
  actual?: number | string | null;
  impact?: string;
  unit?: string;
};

async function fetchFmpCalendar(daysAhead: number): Promise<EconomicEvent[]> {
  const apiKey = getFmpKey();
  if (!apiKey) return [];
  const { from, to } = rangeIso(daysAhead);
  const params = new URLSearchParams({ from, to, apikey: apiKey });
  try {
    const res = await fetch(`https://financialmodelingprep.com/api/v3/economic_calendar?${params.toString()}`, {
      next: { revalidate: REVALIDATE_SECONDS, tags: ["calendar:fmp"] },
    });
    if (!res.ok) return [];
    const arr = (await res.json()) as FmpCalendarEvent[];
    if (!Array.isArray(arr)) return [];
    return arr
      .map((e, i) => ({
        id: `fmp:${e.country ?? ""}:${e.event ?? ""}:${e.date ?? i}`,
        title: e.event ?? "Economic event",
        country: e.country ?? null,
        currency: e.currency ?? null,
        startsAt: e.date ? new Date(e.date).toISOString() : new Date().toISOString(),
        impact: mapImpact(e.impact),
        actual: e.actual ?? null,
        forecast: e.estimate ?? null,
        previous: e.previous ?? null,
        unit: e.unit ?? null,
        provider: "fmp" as const,
      }))
      .sort((a, b) => Date.parse(a.startsAt) - Date.parse(b.startsAt));
  } catch {
    return [];
  }
}

function guessCurrency(country: string): string | null {
  const c = country.toUpperCase();
  if (c === "US" || c === "USA" || c === "UNITED STATES") return "USD";
  if (c === "EU" || c === "EURO AREA" || c === "EUROPEAN UNION" || c === "EURO ZONE") return "EUR";
  if (c === "GB" || c === "UK" || c === "UNITED KINGDOM") return "GBP";
  if (c === "JP" || c === "JAPAN") return "JPY";
  if (c === "CA" || c === "CANADA") return "CAD";
  if (c === "AU" || c === "AUSTRALIA") return "AUD";
  if (c === "NZ" || c === "NEW ZEALAND") return "NZD";
  if (c === "CH" || c === "SWITZERLAND") return "CHF";
  if (c === "CN" || c === "CHINA") return "CNY";
  return null;
}

/** Returns upcoming high-impact-first events; provider chosen automatically. */
export async function loadEconomicCalendar(opts: {
  symbol: string;
  daysAhead?: number;
  limit?: number;
}): Promise<EconomicEvent[]> {
  const days = Math.max(1, Math.min(14, opts.daysAhead ?? 5));
  const events =
    (await fetchFinnhubCalendar(days)).length > 0
      ? await fetchFinnhubCalendar(days)
      : await fetchFmpCalendar(days);

  const briefingCurrency = currencyForSymbol(opts.symbol);
  // Bias to user's relevant currency, then everything else, prioritise high impact.
  const score = (e: EconomicEvent): number => {
    const impactWeight = e.impact === "high" ? 3 : e.impact === "medium" ? 2 : e.impact === "low" ? 1 : 0;
    const currencyMatch = briefingCurrency && e.currency === briefingCurrency ? 5 : 0;
    return impactWeight + currencyMatch;
  };
  return [...events]
    .sort((a, b) => {
      const t = Date.parse(a.startsAt) - Date.parse(b.startsAt);
      if (t !== 0) return t;
      return score(b) - score(a);
    })
    .slice(0, opts.limit ?? 30);
}

function currencyForSymbol(symbol: string): string | null {
  const s = symbol.toUpperCase();
  if (s.endsWith("USD") || s.startsWith("USD")) return "USD";
  if (s.includes("EUR")) return "EUR";
  if (s.includes("GBP")) return "GBP";
  if (s.includes("JPY")) return "JPY";
  if (s.includes("CAD")) return "CAD";
  if (s.includes("AUD")) return "AUD";
  if (s.includes("NZD")) return "NZD";
  if (s.includes("CHF")) return "CHF";
  return null;
}
