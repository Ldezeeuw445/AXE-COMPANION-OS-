import "server-only";

import type { EconomicEvent } from "@/lib/market/marketTypes";

const FF_CALENDAR_URL = "https://nfs.faireconomy.media/ff_calendar_thisweek.json";
const REVALIDATE_SECONDS = 60 * 5;

type FFEvent = {
  title: string;
  country: string;
  date: string;
  time: string;
  impact: string;
  forecast: string;
  previous: string;
};

function mapImpact(raw: string): EconomicEvent["impact"] {
  const v = (raw ?? "").toLowerCase();
  if (v === "high") return "high";
  if (v === "medium") return "medium";
  if (v === "low") return "low";
  return "unknown";
}

function parseStartsAt(date: string, time: string): string {
  const d = (date ?? "").trim();
  const t = (time ?? "").trim();
  if (!d) return new Date().toISOString();
  // Modern FF mirror embeds full ISO datetime in `date`.
  if (d.includes("T")) {
    const parsed = Date.parse(d);
    return Number.isFinite(parsed) ? new Date(parsed).toISOString() : new Date().toISOString();
  }
  const combined = t && t !== "All Day" && t !== "Tentative" ? `${d} ${t}` : d;
  const parsed = Date.parse(combined);
  return Number.isFinite(parsed) ? new Date(parsed).toISOString() : new Date().toISOString();
}

function inRange(startsAt: string, daysAhead: number): boolean {
  const ts = Date.parse(startsAt);
  if (!Number.isFinite(ts)) return false;
  const now = Date.now();
  const start = now - 12 * 60 * 60 * 1000;
  const end = now + daysAhead * 24 * 60 * 60 * 1000;
  return ts >= start && ts <= end;
}

/** Free Forex Factory mirror — same source chat uses via marketDataService. */
export async function loadForexFactoryCalendar(daysAhead: number): Promise<EconomicEvent[]> {
  const days = Math.max(1, Math.min(14, daysAhead));
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 10_000);
    const res = await fetch(FF_CALENDAR_URL, {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; AXE-Companion/1.0)" },
      signal: ctrl.signal,
      next: { revalidate: REVALIDATE_SECONDS, tags: ["calendar:forexfactory"] },
    });
    clearTimeout(timer);
    if (!res.ok) return [];
    const raw = (await res.json()) as FFEvent[];
    if (!Array.isArray(raw)) return [];

    return raw
      .map((e, i) => {
        const currency = (e.country ?? "").toUpperCase() || null;
        const startsAt = parseStartsAt(e.date, e.time);
        return {
          id: `ff:${currency ?? "xx"}:${e.title}:${e.date}:${e.time}:${i}`,
          title: e.title || "Economic event",
          country: currency,
          currency,
          startsAt,
          impact: mapImpact(e.impact),
          actual: null,
          forecast: e.forecast?.trim() ? e.forecast.trim() : null,
          previous: e.previous?.trim() ? e.previous.trim() : null,
          unit: null,
          provider: "forexFactory" as const,
        } satisfies EconomicEvent;
      })
      .filter((e) => inRange(e.startsAt, days))
      .sort((a, b) => Date.parse(a.startsAt) - Date.parse(b.startsAt));
  } catch {
    return [];
  }
}
