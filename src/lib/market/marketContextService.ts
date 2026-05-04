import "server-only";
import type { MarketContext } from "@/lib/market/marketTypes";
import { detectProviders } from "@/lib/market/providerStatus";
import { loadMacroSnapshot } from "@/lib/market/fredProvider";
import { loadNews } from "@/lib/market/newsProvider";
import { loadEconomicCalendar } from "@/lib/market/calendarProvider";
import { dedupeSymbols } from "@/lib/market/symbolContext";

/**
 * One-stop server function that gathers macro + news + calendar for a
 * (symbol, watchlist, positions) context. Each provider runs in parallel and
 * is independently cached. Falls back gracefully when keys are missing.
 */
export async function buildMarketContext(args: {
  symbol: string;
  watchlist?: string[];
  positionsSymbols?: string[];
  newsLimit?: number;
  calendarLimit?: number;
}): Promise<MarketContext> {
  const symbol = args.symbol.trim().toUpperCase() || "XAUUSD";
  const symbols = dedupeSymbols([symbol, ...(args.watchlist ?? []), ...(args.positionsSymbols ?? [])]);

  const [macro, news, events] = await Promise.all([
    loadMacroSnapshot(symbol),
    loadNews({ symbol, watchlist: args.watchlist ?? [], limit: args.newsLimit ?? 12 }),
    loadEconomicCalendar({ symbol, limit: args.calendarLimit ?? 24 }),
  ]);

  const providers = detectProviders();
  const hasLiveData = Boolean(macro?.points.length) || news.length > 0 || events.length > 0;

  return {
    symbol,
    symbols,
    generatedAt: new Date().toISOString(),
    macro,
    news,
    events,
    providers,
    hasLiveData,
  };
}

/** Compact textual summary suitable for chat context injection (≤ ~600 tokens). */
export function summarizeMarketContext(ctx: MarketContext): string {
  const parts: string[] = [];
  parts.push(`Active symbol: ${ctx.symbol}.`);
  if (ctx.symbols.length > 1) parts.push(`Watchlist set: ${ctx.symbols.join(", ")}.`);

  if (ctx.macro && ctx.macro.points.length > 0) {
    const macroLine = ctx.macro.points
      .filter((p) => p.value != null)
      .map((p) => `${p.label} ${p.value}${p.units && p.units !== "%" ? "" : p.units ?? ""}`)
      .join(" · ");
    if (macroLine) parts.push(`Macro snapshot (FRED): ${macroLine}`);
  }

  if (ctx.events.length > 0) {
    const high = ctx.events.filter((e) => e.impact === "high").slice(0, 3);
    if (high.length > 0) {
      const evLine = high
        .map((e) => `${e.title} (${e.currency ?? e.country ?? "?"}) @ ${new Date(e.startsAt).toISOString().slice(0, 16)}Z`)
        .join("; ");
      parts.push(`Upcoming high-impact events: ${evLine}.`);
    }
  }

  if (ctx.news.length > 0) {
    const heads = ctx.news.slice(0, 4).map((n) => `“${n.title}” — ${n.source}`).join(" | ");
    parts.push(`Recent headlines: ${heads}.`);
  }

  if (!ctx.hasLiveData) {
    const missing = ctx.providers.filter((p) => p.state === "missing_config").map((p) => p.label);
    parts.push(
      `Market context providers not connected yet${missing.length ? ` (missing: ${missing.join(", ")})` : ""}.`,
    );
  }
  return parts.join("\n");
}
