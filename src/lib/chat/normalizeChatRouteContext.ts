/**
 * Trading OS talks to Companion /api/chat/stream with its own labels:
 * timeframe `1H` (not `h1`) and symbols like `NASDAQ 100`, `EURUSDm`, `GOLD`.
 * Chart snapshots and axeContextBuilder match exact `display_symbol` + keys
 * like `h1`. This helper is the one translation step on the way in.
 */

import { CANONICAL_BROKER_SYMBOLS } from "@/lib/broker/brokerSymbolRuntime";
import { cleanDisplaySymbol } from "@/lib/broker/symbolResolution";

export const COMPANION_CHART_TF_KEYS = ["m5", "m15", "m30", "h1", "h4", "d1", "w1", "mn1"] as const;
export type CompanionChartTfKey = (typeof COMPANION_CHART_TF_KEYS)[number];

const TOS_SYMBOL_TO_DISPLAY: Record<string, string> = {
  QQQ: "NAS100",
  SPY: "SPX500",
  DIA: "US30",
  NASDAQ100: "NAS100",
  NASDAQ: "NAS100",
  NDX: "NAS100",
  NDX100: "NAS100",
};

/** Prefer the instrument list Companion actually charts. */
const DISPLAY_TO_CANONICAL: Record<string, string> = {
  NASDAQ: "NAS100",
  US100: "NAS100",
  USTEC: "NAS100",
  NDX100: "NAS100",
  US500: "SPX500",
  SPX: "SPX500",
  SP500: "SPX500",
};

const CANONICAL = new Set<string>(CANONICAL_BROKER_SYMBOLS);

function compactSymbol(raw: string): string {
  return raw.replace(/[^A-Za-z0-9]/g, "").toUpperCase();
}

function nearestMinutes(n: number): CompanionChartTfKey {
  if (n <= 7) return "m5";
  if (n <= 22) return "m15";
  if (n <= 45) return "m30";
  if (n <= 120) return "h1";
  if (n <= 360) return "h4";
  return "d1";
}

function nearestHours(n: number): CompanionChartTfKey {
  if (n <= 2) return "h1";
  if (n <= 6) return "h4";
  return "d1";
}

function nearestDays(n: number): CompanionChartTfKey {
  if (n <= 2) return "d1";
  if (n <= 10) return "w1";
  return "mn1";
}

function nearestWeeks(n: number): CompanionChartTfKey {
  if (n <= 2) return "w1";
  return "mn1";
}

export function normalizeChatTimeframe(tf: string | undefined | null): string | undefined {
  const raw = (tf ?? "").trim();
  if (!raw) return undefined;
  const key = raw.toLowerCase().replace(/\s+/g, "");

  if (key === "mn1" || key === "1mn" || key === "mn" || key === "1mo" || key === "mo") return "mn1";
  if ((COMPANION_CHART_TF_KEYS as readonly string[]).includes(key)) return key;

  const minute = key.match(/^(\d+)m(?:in(?:ute)?s?)?$/) ?? key.match(/^m(\d+)$/);
  if (minute) return nearestMinutes(Number(minute[1]));

  const hour = key.match(/^(\d+)h(?:ours?)?$/) ?? key.match(/^h(\d+)$/);
  if (hour) return nearestHours(Number(hour[1]));

  const day = key.match(/^(\d+)d(?:ays?)?$/) ?? key.match(/^d(\d+)$/);
  if (day) return nearestDays(Number(day[1]));

  const week = key.match(/^(\d+)w(?:eeks?)?$/) ?? key.match(/^w(\d+)$/);
  if (week) return nearestWeeks(Number(week[1]));

  return "h1";
}

export function normalizeChatSymbol(symbol: string | undefined | null): string | undefined {
  const raw = (symbol ?? "").trim();
  if (!raw) return undefined;
  const compact = compactSymbol(raw);
  if (TOS_SYMBOL_TO_DISPLAY[compact]) return TOS_SYMBOL_TO_DISPLAY[compact];
  const cleaned = cleanDisplaySymbol(raw) || compact;
  const canonical = DISPLAY_TO_CANONICAL[cleaned] ?? cleaned;
  if (CANONICAL.has(canonical)) return canonical;
  return canonical;
}

export function normalizeChatRouteContext(input: {
  symbol?: string | null;
  tf?: string | null;
}): { symbol: string | undefined; tf: string | undefined } {
  return {
    symbol: normalizeChatSymbol(input.symbol),
    tf: normalizeChatTimeframe(input.tf),
  };
}
