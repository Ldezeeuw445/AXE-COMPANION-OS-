/**
 * contextService — compatibility entry point for AXE context.
 *
 * Phase 3A keeps the public `fetchTradingOSContext` export stable for chat and
 * /api/context while the actual work moves into the Companion-native builder.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { AxeCompanionContext, TradingOSContext } from "@/types/context";
import {
  buildAxeCompanionContext,
  buildTradingOSCompatibleContext,
} from "@/services/axeContextBuilder";

const COMMODITY_CURRENCIES: Record<string, string[]> = {
  XAU: ["USD"],
  XAG: ["USD"],
  WTI: ["USD"],
  OIL: ["USD"],
};

/**
 * Given a trading symbol (e.g. "XAUUSD", "GBPJPY", "ES"), return the currencies
 * that drive price action and should be watched in the economic calendar.
 */
export function symbolToCurrencies(symbol: string): string[] {
  if (!symbol) return [];
  const s = symbol.toUpperCase().replace(/[^A-Z]/g, "");

  if (s.length === 6) {
    const base = s.slice(0, 3);
    const quote = s.slice(3, 6);
    if (COMMODITY_CURRENCIES[base]) return [...COMMODITY_CURRENCIES[base]];
    return [...new Set([base, quote])];
  }

  if (["ES", "NQ", "YM", "RTY", "CL", "GC", "SI", "NG"].includes(s)) {
    return ["USD"];
  }

  if (["BTC", "ETH", "SOL"].includes(s)) return ["USD"];
  return [s.length <= 3 ? s : "USD"];
}

export async function fetchAxeCompanionContext(
  userId: string,
  supabase: SupabaseClient,
  symbol?: string | null,
  tf?: string | null,
  pinnedContext?: string | null,
): Promise<AxeCompanionContext> {
  return buildAxeCompanionContext({ userId, supabase, symbol, tf, pinnedContext });
}

export async function fetchTradingOSContext(
  userId: string,
  supabase: SupabaseClient,
  symbol?: string | null,
  tf?: string | null,
  pinnedContext?: string | null,
): Promise<TradingOSContext> {
  return buildTradingOSCompatibleContext({ userId, supabase, symbol, tf, pinnedContext });
}
