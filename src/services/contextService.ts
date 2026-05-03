/**
 * contextService — central context assembler for AXE Companion.
 *
 * Mirrors the TradingOS /api/context pattern: one parallel fetch that assembles
 * symbol, timeframe, filtered_news, account_state, user_memory, candles_summary,
 * and key_levels into a single TradingOSContext object.
 *
 * Both the /api/context route (external consumers) and sendChatMessage (internal)
 * use this function — no more per-query Supabase calls scattered across chatService.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { TradingOSContext, FilteredNewsEvent, OpenCommitment, Mt5AccountSnapshot, Mt5Position, Mt5ClosedPosition } from "@/types/context";
import type { WatchlistEntry, TerminalAlert, TerminalExecution } from "@/services/axeService";
import { fetchEconomicCalendar } from "@/services/marketDataService";

// ─── Symbol → relevant news currencies ──────────────────────────────────────

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

  // Forex pairs (6-char e.g. EURUSD, GBPJPY, XAUUSD)
  if (s.length === 6) {
    const base = s.slice(0, 3);
    const quote = s.slice(3, 6);
    // Commodity bases map to quote currency for news purposes
    if (COMMODITY_CURRENCIES[base]) return [...COMMODITY_CURRENCIES[base]];
    return [...new Set([base, quote])];
  }

  // Futures (ES, NQ, CL, GC, etc.) — USD-denominated
  if (["ES", "NQ", "YM", "RTY", "CL", "GC", "SI", "NG"].includes(s)) {
    return ["USD"];
  }

  // Crypto
  if (["BTC", "ETH", "SOL"].includes(s)) return ["USD"];

  // Fallback: treat as single currency or return USD
  return [s.length <= 3 ? s : "USD"];
}

// ─── Key level extraction ────────────────────────────────────────────────────

function extractKeyLevels(watchRows: WatchlistEntry[], symbol?: string): string[] {
  const levels: string[] = [];
  for (const w of watchRows) {
    const payload = (w.condition_payload ?? {}) as Record<string, unknown>;
    const price =
      payload.price ?? payload.level ?? payload.entry ?? payload.trigger ?? payload.value;

    if (price !== undefined) {
      const label =
        symbol && w.symbol.toUpperCase() !== symbol.toUpperCase()
          ? `${w.symbol} `
          : "";
      const condition = w.condition_type ?? w.kind ?? "";
      levels.push(`${label}${price}${condition ? ` (${condition})` : ""}`);
    }
  }
  return levels;
}

// ─── Central context assembler ────────────────────────────────────────────────

export async function fetchTradingOSContext(
  userId: string,
  supabase: SupabaseClient,
  symbol?: string | null,
  tf?: string | null
): Promise<TradingOSContext> {
  // Map symbol to relevant currency codes for news filtering
  const relevantCurrencies = symbol ? symbolToCurrencies(symbol) : [];

  // Fire all Supabase queries + optional news fetch in parallel
  const [
    memoryResult,
    watchResult,
    manualWatchResult,
    alertResult,
    execResult,
    newsResult,
    commitmentsResult,
    accountSnapshotResult,
    positionsResult,
    closedPositionsResult,
  ] = await Promise.all([
    // user_memory: last 20 assistant_memory_entries (all scopes)
    supabase
      .from("assistant_memory_entries")
      .select("scope,entry_key,content")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(20),

    // account_state.watchlist: active watch_requests from TradingOS terminal
    supabase
      .from("watch_requests")
      .select("symbol,kind,condition_type,condition_payload,message,status")
      .eq("user_id", userId)
      .eq("status", "active")
      .order("created_at", { ascending: false })
      .limit(30),

    // account_state.watchlist (manual): scope="watchlist" memory entries
    supabase
      .from("assistant_memory_entries")
      .select("entry_key,content")
      .eq("user_id", userId)
      .eq("scope", "watchlist")
      .order("created_at", { ascending: true }),

    // account_state.recentAlerts: last 8 terminal alerts
    supabase
      .from("alerts")
      .select("title,body,type,read")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(8),

    // account_state.recentExecutions: last 6 terminal execution requests
    supabase
      .from("execution_requests")
      .select("*")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(6),

    // filtered_news: high-impact events for symbol's relevant currencies
    // Only fetch if we have a symbol; skip otherwise to avoid latency
    relevantCurrencies.length > 0
      ? fetchEconomicCalendar(undefined, "High")
      : Promise.resolve([] as FilteredNewsEvent[]),

    // open_commitments: AXE promises that haven't been resolved yet
    supabase
      .from("axe_commitments")
      .select("id,symbol,description,created_at")
      .eq("user_id", userId)
      .eq("status", "open")
      .order("created_at", { ascending: true })
      .limit(10),

    // live_account: most recent MT5 account snapshot (synced every 30s by TradingOS)
    supabase
      .from("mt5_account_snapshots")
      .select("account_id,balance,equity,margin,free_margin,leverage,currency,server,name,updated_at")
      .eq("user_id", userId)
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle(),

    // live_positions: all currently open MT5 positions
    supabase
      .from("mt5_positions")
      .select("id,account_id,symbol,type,volume,open_price,current_price,profit,swap,stop_loss,take_profit,opened_at,comment")
      .eq("user_id", userId)
      .order("opened_at", { ascending: true }),

    // closed_positions: last 20 closed MT5 trades (synced by TradingOS)
    supabase
      .from("mt5_closed_positions")
      .select("id,account_id,symbol,type,volume,open_price,close_price,profit,swap,commission,opened_at,closed_at,close_reason,comment")
      .eq("user_id", userId)
      .order("closed_at", { ascending: false })
      .limit(20),
  ]);

  // ── user_memory ───────────────────────────────────────────────────────────
  const user_memory = (memoryResult.data ?? []) as {
    scope: string;
    entry_key: string | null;
    content: string;
  }[];

  // ── account_state.watchlist ───────────────────────────────────────────────
  const tosEntries = (watchResult.data ?? []) as WatchlistEntry[];
  const tosSymbols = new Set(tosEntries.map((r) => r.symbol.toUpperCase()));

  const manualEntries: WatchlistEntry[] = (manualWatchResult.data ?? []).map((r) => ({
    symbol: (r.entry_key as string) ?? "",
    kind: "manual",
    condition_type: null,
    condition_payload: null,
    message:
      (r.content as string) !== (r.entry_key as string) ? (r.content as string) : null,
  }));

  const watchlist: WatchlistEntry[] = [
    ...tosEntries,
    ...manualEntries.filter((e) => !tosSymbols.has(e.symbol.toUpperCase())),
  ];

  // ── account_state.recentAlerts ────────────────────────────────────────────
  const recentAlerts = (alertResult.data ?? []) as TerminalAlert[];

  // ── account_state.recentExecutions ───────────────────────────────────────
  const recentExecutions = (execResult.data ?? []) as TerminalExecution[];

  // ── filtered_news ─────────────────────────────────────────────────────────
  let filtered_news: FilteredNewsEvent[] = [];
  if (Array.isArray(newsResult) && newsResult.length > 0) {
    const events = newsResult as FilteredNewsEvent[];
    filtered_news =
      relevantCurrencies.length > 0
        ? events.filter((e) => relevantCurrencies.includes(e.currency))
        : events;
    // Cap at 12 most impactful
    filtered_news = filtered_news.slice(0, 12);
  }

  // ── key_levels ─────────────────────────────────────────────────────────────
  // Filter watchlist to symbol if provided, then extract price levels
  const relevantWatch = symbol
    ? watchlist.filter((w) => w.symbol.toUpperCase() === symbol.toUpperCase())
    : watchlist;
  const key_levels = extractKeyLevels(relevantWatch, symbol ?? undefined);

  // ── open_commitments ──────────────────────────────────────────────────────
  const open_commitments = (commitmentsResult.data ?? []) as OpenCommitment[];

  // ── live_account (MT5 snapshot) ───────────────────────────────────────────
  const live_account = (accountSnapshotResult.data ?? null) as Mt5AccountSnapshot | null;

  // ── live_positions (MT5 open positions) ──────────────────────────────────
  const live_positions = (positionsResult.data ?? []) as Mt5Position[];

  // ── closed_positions (MT5 trade history) ─────────────────────────────────
  const closed_positions = (closedPositionsResult.data ?? []) as Mt5ClosedPosition[];

  // ── candles_summary ────────────────────────────────────────────────────────
  // The pinned_context from the active conversation acts as the candles/session brief.
  // Fetched by chatService and passed in — we surface it as-is here.
  // (Set to null; callers inject it separately from conversation.pinnedContext.)
  const candles_summary: string | null = null;

  return {
    symbol: symbol ?? null,
    timeframe: tf ?? null,
    filtered_news,
    account_state: {
      watchlist,
      recentAlerts,
      recentExecutions,
    },
    user_memory,
    candles_summary,
    key_levels,
    open_commitments,
    live_account,
    live_positions,
    closed_positions,
    knowledge_layer: null,
  };
}
