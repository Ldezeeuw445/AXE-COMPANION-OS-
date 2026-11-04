/**
 * Learning Arc Service
 *
 * What AXE has measured about how this trader actually trades, read straight
 * from Supabase. Nothing here is a default dressed up as a measurement.
 *
 * What changed and why: this service used to fill every gap with a plausible
 * guess. A trader with no closed trades was told their top pairs were EURUSD,
 * XAUUSD and GBPUSD, their top timeframes H1/H4/D1, their indicators RSI,
 * MACD and MA, their preferred session London, and their alignment 50%. Those
 * five values were constants in the source. They reached the trader twice
 * over: once in the cockpit's "Learning arc · live" panel, and once inside the
 * morning-brief prompt, under the heading "Key facts", where the model took
 * them as true and wrote around them. The brief even had a branch for the
 * honest case — `topPairs.length ? ... : "not yet identified — be
 * encouraging"` — that could never run, because the fallback made the list
 * never empty.
 *
 * Now: a thing that was not measured comes back empty or null, a failed read
 * says so instead of looking like an empty account, and every count carries
 * what it was counted from. The arithmetic lives in
 * `@/lib/axe/learningArc` so the verify suite can exercise it without a
 * database.
 */

import { ARC_WINDOW_DAYS } from "@/lib/axe/learningArc";
import { EVIDENCE_ONLY_FILTER } from "@/lib/trading/tradeEvidence";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  arcHeadline,
  normaliseAlignment,
  normaliseSymbol,
  rankTradedSymbols,
  sessionSplit,
  type ArcTrade,
  type SessionSplit,
  type SymbolTally,
} from "@/lib/axe/learningArc";

/** How far back closed trades are counted. */
// Re-exported so existing importers keep working; the number itself lives in
// `learningArc.ts`, next to the sentence that says it out loud.
export { ARC_WINDOW_DAYS };

export interface TraderLearningArc {
  traderId: string;
  /** Window the trade counts were taken over, in days. */
  windowDays: number;
  /** Instruments ranked by closed trades in the window. Empty is a real answer. */
  topPairs: SymbolTally[];
  /** Closed trades in the window, the denominator behind every share above. */
  tradeCount: number;
  /**
   * Symbols with a live chart snapshot right now. A watchlist, not a
   * frequency: `chart_live_snapshots` holds one row per
   * (account, symbol, timeframe) and updates it in place, so these cannot be
   * ranked by use and are never folded into `topPairs`.
   */
  watchedSymbols: string[];
  /** Timeframes those charts are open on. Presence, not usage. */
  chartTimeframes: string[];
  /** Entry-time session split, with the counts behind it. */
  session: SessionSplit;
  /** 0–100 from the latest cockpit snapshot, or null when none has been taken. */
  alignmentScore: number | null;
  /** One true sentence, or null when there is nothing true to say yet. */
  headline: string | null;
  /**
   * A read failed. The caller must not render this as an empty account —
   * "you have no trades" and "we could not reach your trades" are different
   * sentences and only one of them is honest.
   */
  dataUnavailable: boolean;
  updatedAt: string;
}

function emptyArc(traderId: string, dataUnavailable: boolean): TraderLearningArc {
  return {
    traderId,
    windowDays: ARC_WINDOW_DAYS,
    topPairs: [],
    tradeCount: 0,
    watchedSymbols: [],
    chartTimeframes: [],
    session: { session: null, counts: { london: 0, newyork: 0, asia: 0 }, classified: 0, basis: "none" },
    alignmentScore: null,
    headline: null,
    dataUnavailable,
    updatedAt: new Date().toISOString(),
  };
}

export async function getTraderLearningArc(
  traderId: string,
  supabase?: SupabaseClient,
): Promise<TraderLearningArc> {
  // No client is not "no history" — it is "we did not look".
  if (!supabase) return emptyArc(traderId, true);

  try {
    const windowStart = new Date(
      Date.now() - ARC_WINDOW_DAYS * 24 * 60 * 60 * 1000,
    ).toISOString();

    const [tradesRes, chartsRes, snapshotRes] = await Promise.all([
      supabase
        .from("broker_trades")
        .select("symbol, pnl, open_time, close_time")
        .eq("user_id", traderId)
        .not("close_time", "is", null)
        .gte("close_time", windowStart)
        // Practice fills at generated prices are excluded: the arc describes
        // what this trader is learning, and a lesson drawn from invented
        // prices is not one. See src/lib/trading/tradeEvidence.ts.
        .or(EVIDENCE_ONLY_FILTER)
        .order("close_time", { ascending: false })
        .limit(1000),

      supabase
        .from("chart_live_snapshots")
        .select("display_symbol, timeframe")
        .eq("user_id", traderId)
        .limit(200),

      supabase
        .from("assistant_cockpit_snapshots")
        .select("alignment_score")
        .eq("user_id", traderId)
        .order("captured_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
    ]);

    // A query error used to be swallowed by `?? []`, which turned an outage
    // into "this trader has never traded". Say which it was.
    const dataUnavailable = Boolean(tradesRes.error);
    if (tradesRes.error) {
      console.error("[LearningArc] broker_trades read failed:", tradesRes.error.message);
    }
    if (chartsRes.error) {
      console.error("[LearningArc] chart_live_snapshots read failed:", chartsRes.error.message);
    }

    const rows = (tradesRes.data ?? []) as Array<{
      symbol: string | null;
      pnl: number | null;
      open_time: string | null;
      close_time: string | null;
    }>;
    const trades: ArcTrade[] = rows.map((r) => ({
      symbol: r.symbol,
      pnl: r.pnl,
      openTime: r.open_time,
      closeTime: r.close_time,
    }));

    const charts = (chartsRes.data ?? []) as Array<{
      display_symbol: string | null;
      timeframe: string | null;
    }>;

    const topPairs = rankTradedSymbols(trades);

    const watched = new Set<string>();
    const timeframes = new Set<string>();
    for (const c of charts) {
      const sym = normaliseSymbol(c.display_symbol);
      if (sym) watched.add(sym);
      const tf = String(c.timeframe ?? "").trim().toUpperCase();
      if (tf) timeframes.add(tf);
    }

    const session = sessionSplit(trades);

    return {
      traderId,
      windowDays: ARC_WINDOW_DAYS,
      topPairs,
      tradeCount: trades.length,
      watchedSymbols: [...watched].sort(),
      chartTimeframes: [...timeframes].sort(),
      session,
      alignmentScore: normaliseAlignment(snapshotRes.data?.alignment_score),
      headline: arcHeadline(topPairs[0] ?? null, trades.length, watched.size),
      dataUnavailable,
      updatedAt: new Date().toISOString(),
    };
  } catch (error) {
    console.error("[LearningArc] Error querying Supabase:", error);
    return emptyArc(traderId, true);
  }
}
