/**
 * Learning Arc Service
 *
 * Tracks trader behaviour over time and derives insights directly from
 * Supabase — no relative-URL fetch calls that would break in server components.
 *
 * Provides:
 * - Top pairs and timeframes from real broker trades / chart snapshots
 * - Win/loss breakdown from broker_trades
 * - Alignment score from the latest cockpit snapshot
 */

import type { SupabaseClient } from "@supabase/supabase-js";

export interface TraderLearningArc {
  traderId: string;
  topPairs: string[];
  topTimeframes: string[];
  topIndicators: string[];
  preferredSession: "london" | "newyork" | "asia";
  recentWins: Array<{ pair: string; timeframe: string; gain: number; timestamp: string }>;
  recentLosses: Array<{ pair: string; timeframe: string; loss: number; timestamp: string }>;
  alignmentScore: number; // 0-100: how well AXE matches trader
  updatedAt: string;
}

// ────────────────────────────────────────────────────────────────────────────
// Main entry point — call with a Supabase client from the server component
// ────────────────────────────────────────────────────────────────────────────

export async function getTraderLearningArc(
  traderId: string,
  supabase?: SupabaseClient,
): Promise<TraderLearningArc> {
  if (!supabase) {
    console.warn("[LearningArc] No Supabase client provided — returning defaults");
    return getDefaultArc(traderId);
  }

  try {
    const ninetyDaysAgo = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString();

    // Fetch trades, chart snapshots and latest alignment score in parallel
    const [tradesRes, chartSnapshotsRes, snapshotRes] = await Promise.all([
      supabase
        .from("broker_trades")
        .select("symbol, pnl, close_time")
        .eq("user_id", traderId)
        .not("close_time", "is", null)
        .gte("close_time", ninetyDaysAgo)
        .order("close_time", { ascending: false })
        .limit(300),

      supabase
        .from("chart_live_snapshots")
        .select("display_symbol, timeframe, updated_at")
        .eq("user_id", traderId)
        .order("updated_at", { ascending: false })
        .limit(200),

      supabase
        .from("assistant_cockpit_snapshots")
        .select("alignment_score")
        .eq("user_id", traderId)
        .order("captured_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
    ]);

    const trades = (tradesRes.data ?? []) as Array<{
      symbol: string | null;
      pnl: number | null;
      close_time: string | null;
    }>;

    const chartSnapshots = (chartSnapshotsRes.data ?? []) as Array<{
      display_symbol: string | null;
      timeframe: string | null;
    }>;

    const rawAlignment = snapshotRes.data?.alignment_score ?? null;

    // ── Top pairs ──────────────────────────────────────────────────────────
    const pairCounts: Record<string, number> = {};
    for (const t of trades) {
      // Strip broker suffixes (.r, .x, etc.)
      const sym = (t.symbol ?? "").replace(/\.[a-z]+$/i, "").toUpperCase().trim();
      if (sym) pairCounts[sym] = (pairCounts[sym] ?? 0) + 1;
    }
    // Also count pairs from chart snapshots (user opened these)
    for (const s of chartSnapshots) {
      const sym = (s.display_symbol ?? "").replace(/\.[a-z]+$/i, "").toUpperCase().trim();
      if (sym) pairCounts[sym] = (pairCounts[sym] ?? 0) + 0.5; // half-weight vs trades
    }
    const topPairs = Object.entries(pairCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([sym]) => sym);

    // ── Top timeframes ─────────────────────────────────────────────────────
    const tfCounts: Record<string, number> = {};
    for (const s of chartSnapshots) {
      const tf = (s.timeframe ?? "").toUpperCase().trim();
      if (tf) tfCounts[tf] = (tfCounts[tf] ?? 0) + 1;
    }
    const topTimeframes = Object.entries(tfCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([tf]) => tf);

    // ── Preferred session (heuristic from trade close times) ──────────────
    let londonCount = 0;
    let nyCount = 0;
    let asiaCount = 0;
    for (const t of trades) {
      if (!t.close_time) continue;
      const hour = new Date(t.close_time).getUTCHours();
      if (hour >= 7 && hour < 12) londonCount++;
      else if (hour >= 12 && hour < 21) nyCount++;
      else asiaCount++;
    }
    const preferredSession: "london" | "newyork" | "asia" =
      londonCount >= nyCount && londonCount >= asiaCount
        ? "london"
        : nyCount >= asiaCount
          ? "newyork"
          : "asia";

    // ── Wins & losses ──────────────────────────────────────────────────────
    const defaultTf = topTimeframes[0] ?? "H1";

    const recentWins = trades
      .filter((t) => Number(t.pnl ?? 0) > 0)
      .slice(0, 5)
      .map((t) => ({
        pair: (t.symbol ?? "").replace(/\.[a-z]+$/i, "").toUpperCase(),
        timeframe: defaultTf,
        gain: Number(t.pnl),
        timestamp: t.close_time ?? new Date().toISOString(),
      }));

    const recentLosses = trades
      .filter((t) => Number(t.pnl ?? 0) < 0)
      .slice(0, 5)
      .map((t) => ({
        pair: (t.symbol ?? "").replace(/\.[a-z]+$/i, "").toUpperCase(),
        timeframe: defaultTf,
        loss: Math.abs(Number(t.pnl)),
        timestamp: t.close_time ?? new Date().toISOString(),
      }));

    // ── Alignment score ────────────────────────────────────────────────────
    // snapshot stores score as 0-1 float or 0-100 integer — normalise to 0-100
    let alignmentScore = 50;
    if (rawAlignment !== null) {
      const n = Number(rawAlignment);
      alignmentScore = Number.isFinite(n)
        ? n > 1
          ? Math.round(n)
          : Math.round(n * 100)
        : 50;
    }

    return {
      traderId,
      topPairs: topPairs.length ? topPairs : ["EURUSD", "XAUUSD", "GBPUSD"],
      topTimeframes: topTimeframes.length ? topTimeframes : ["H1", "H4", "D1"],
      topIndicators: ["RSI", "MACD", "MA"],
      preferredSession,
      recentWins,
      recentLosses,
      alignmentScore,
      updatedAt: new Date().toISOString(),
    };
  } catch (error) {
    console.error("[LearningArc] Error querying Supabase:", error);
    return getDefaultArc(traderId);
  }
}

// ────────────────────────────────────────────────────────────────────────────
// Default arc — used when Supabase is unavailable or returns no data
// ────────────────────────────────────────────────────────────────────────────

function getDefaultArc(traderId: string): TraderLearningArc {
  return {
    traderId,
    topPairs: ["EURUSD", "XAUUSD", "GBPUSD"],
    topTimeframes: ["H1", "H4", "D1"],
    topIndicators: ["RSI", "MACD", "MA"],
    preferredSession: "london",
    recentWins: [],
    recentLosses: [],
    alignmentScore: 50,
    updatedAt: new Date().toISOString(),
  };
}

// ────────────────────────────────────────────────────────────────────────────
// Event recording — used when a trade closes or a suggestion is acted on
// ────────────────────────────────────────────────────────────────────────────

/**
 * Record a trade event via API (client-side only — uses relative URL).
 * Do NOT call this from server components.
 */
export async function recordTradeEvent(
  traderId: string,
  event: {
    pair: string;
    timeframe: string;
    outcome: "win" | "loss" | "breakeven";
    gain?: number;
    loss?: number;
    indicators?: string[];
    entryTime?: string;
    exitTime?: string;
  },
): Promise<{ success: boolean; error?: string }> {
  try {
    const response = await fetch("/api/profile/trade-event", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        userId: traderId,
        ...event,
        timestamp: new Date().toISOString(),
      }),
    });

    if (!response.ok) {
      const err = (await response.json()) as { error?: string };
      return { success: false, error: err.error };
    }

    return { success: true };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error("[LearningArc] Failed to record event:", errorMessage);
    return { success: false, error: errorMessage };
  }
}

/**
 * Update alignment score based on AXE suggestion acceptance.
 * Do NOT call this from server components.
 */
export async function updateAlignmentScore(
  traderId: string,
  action: "accepted" | "rejected" | "followed",
  suggestionId: string,
): Promise<{ newScore: number; change: number }> {
  try {
    const response = await fetch("/api/profile/alignment", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId: traderId, action, suggestionId }),
    });

    if (!response.ok) {
      throw new Error(`Failed to update alignment: ${response.status}`);
    }

    return await response.json() as { newScore: number; change: number };
  } catch (error) {
    console.error("[LearningArc] Failed to update alignment:", error);
    return { newScore: 50, change: 0 };
  }
}

/**
 * Get trader's preferred session (client-side).
 * Do NOT call this from server components.
 */
export async function getTraderSessionPreference(
  traderId: string,
): Promise<"london" | "newyork" | "asia"> {
  try {
    const arc = await getTraderLearningArc(traderId);
    return arc.preferredSession;
  } catch {
    return "london";
  }
}
