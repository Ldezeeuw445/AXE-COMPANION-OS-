import type { SupabaseClient } from "@supabase/supabase-js";

export type BriefPeriodTrade = {
  symbol: string;
  side: string;
  volume: number;
  pnl: number;
  closeTime: string;
};

export type BriefPeriodPerformance = {
  since: string;
  trades: BriefPeriodTrade[];
  wins: number;
  losses: number;
  breakeven: number;
  netPnl: number;
};

function normalizeSymbol(symbol: string | null): string {
  return (symbol ?? "").replace(/\.[a-z]+$/i, "").toUpperCase().trim();
}

function getLocalDateString(timezone: string, refDate = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(refDate);
}

/** Closed History trades since the previous daily morning brief (not Quotes / open Trade tab). */
export async function fetchBriefPeriodTrades(
  supabase: SupabaseClient,
  traderId: string,
  timezone: string,
  options?: { weekly?: boolean },
): Promise<BriefPeriodPerformance> {
  const today = getLocalDateString(timezone);
  const weekly = options?.weekly ?? false;

  let since: string;

  if (weekly) {
    since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  } else {
    const { data: prevBrief } = await supabase
      .from("axe_daily_briefings")
      .select("created_at")
      .eq("user_id", traderId)
      .eq("briefing_type", "daily")
      .lt("briefing_date", today)
      .order("briefing_date", { ascending: false })
      .limit(1)
      .maybeSingle();

    since =
      (prevBrief?.created_at as string | undefined) ??
      new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  }

  const { data: rows } = await supabase
    .from("broker_trades")
    .select("symbol, side, volume, pnl, close_time")
    .eq("user_id", traderId)
    .not("close_time", "is", null)
    .gt("close_time", since)
    .order("close_time", { ascending: false })
    .limit(40);

  const trades: BriefPeriodTrade[] = (rows ?? []).map((t) => {
    const row = t as {
      symbol: string | null;
      side: string | null;
      volume: number | null;
      pnl: number | null;
      close_time: string | null;
    };
    return {
      symbol: normalizeSymbol(row.symbol),
      side: (row.side ?? "buy").toLowerCase(),
      volume: Number(row.volume ?? 0),
      pnl: Number(row.pnl ?? 0),
      closeTime: row.close_time ?? "",
    };
  });

  const wins = trades.filter((t) => t.pnl > 0).length;
  const losses = trades.filter((t) => t.pnl < 0).length;
  const breakeven = trades.filter((t) => t.pnl === 0).length;
  const netPnl = trades.reduce((sum, t) => sum + t.pnl, 0);

  return { since, trades, wins, losses, breakeven, netPnl };
}

export function formatPeriodPerformanceForPrompt(perf: BriefPeriodPerformance): string {
  if (perf.trades.length === 0) return "";

  const sinceLabel = new Date(perf.since).toLocaleString("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });

  let out = `\n\nClosed trades from History since last morning brief (after ${sinceLabel}):`;
  for (const t of perf.trades.slice(0, 12)) {
    const sign = t.pnl >= 0 ? "+" : "";
    const closeStr = t.closeTime
      ? new Date(t.closeTime).toLocaleString("en-GB", {
          day: "numeric",
          month: "short",
          hour: "2-digit",
          minute: "2-digit",
        })
      : "—";
    out += `\n- ${t.symbol} ${t.side} ${t.volume}: P/L ${sign}${t.pnl.toFixed(2)} (closed ${closeStr})`;
  }

  const wl =
    perf.breakeven > 0
      ? `${perf.wins}W / ${perf.losses}L / ${perf.breakeven}BE`
      : `${perf.wins}W / ${perf.losses}L`;
  const netSign = perf.netPnl >= 0 ? "+" : "";
  out += `\nSummary: ${wl}, net P/L ${netSign}${perf.netPnl.toFixed(2)}`;
  out +=
    "\nRules for RECENT PERFORMANCE: these are closed positions from the History tab — never call them Quotes or open Trade positions. Report P/L as currency amounts only (e.g. +5.29 or -6.78). Never convert to percentages. Mention both winning and losing trades when both exist.";

  return out;
}
