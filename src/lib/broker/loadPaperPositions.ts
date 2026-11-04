import type { SupabaseClient } from "@supabase/supabase-js";

import { getDemoQuotePrice } from "@/lib/broker/demoAccount";
import { markToMarket, type PaperPosition, type PaperSide } from "@/lib/trading/paperBroker";
import { quoteFromSnapshot, simulatedQuote } from "@/lib/trading/paperQuoteSource";
import { mayJudgeWith, type StoredQuoteOrigin } from "@/lib/trading/paperStopRules";

/**
 * Open practice positions, valued the way the watcher would judge them.
 *
 * The positions page loads from MetaApi and needs a `cloud_mt5` account, so a
 * trader practising on paper saw nothing at all — orders went in and
 * disappeared. Build-list item 10.
 *
 * The same rule as `paperStopWatcher` applies to the number shown here, and
 * for the same reason: a position opened at generated prices is marked
 * against generated prices, never against a real tick. Showing a live-priced
 * P/L on a position that was filled at an invented price would be a number
 * nobody could act on — and the trader would act on it, because it looks
 * exactly like every other P/L in the app.
 *
 * Where no usable price exists the position is listed with a null P/L rather
 * than a stale one. An empty cell says "not known right now", which is true.
 * A stale number says something false with full confidence.
 */

export type PaperPositionRow = {
  id: string;
  symbol: string;
  side: string;
  volume: number;
  openPrice: number | null;
  currentPrice: number | null;
  profit: number | null;
  stopLoss: number | null;
  takeProfit: number | null;
  openTime: string | null;
  /** 'live' or 'simulated' — shown so a practice win is never mistaken for proof. */
  quoteOrigin: StoredQuoteOrigin;
};

type Row = {
  id: string;
  symbol: string;
  side: string;
  volume: number | string;
  open_price: number | string;
  stop_loss: number | string | null;
  take_profit: number | string | null;
  opened_at: string;
  quote_origin: string;
};

export async function loadPaperPositions(
  supabase: SupabaseClient,
  userId: string,
  accountId: string,
): Promise<PaperPositionRow[]> {
  const { data, error } = await supabase
    .from("paper_positions")
    .select("id,symbol,side,volume,open_price,stop_loss,take_profit,opened_at,quote_origin")
    .eq("user_id", userId)
    .eq("account_id", accountId)
    .order("opened_at", { ascending: false });

  if (error || !data) return [];

  const rows = data as Row[];
  const quoteCache = new Map<string, ReturnType<typeof quoteFromSnapshot>>();
  const out: PaperPositionRow[] = [];

  for (const row of rows) {
    const side: PaperSide | null =
      row.side === "buy" || row.side === "sell" ? (row.side as PaperSide) : null;
    const volume = Number(row.volume);
    const openPrice = Number(row.open_price);
    if (!side || !Number.isFinite(volume) || !Number.isFinite(openPrice)) continue;

    const origin: StoredQuoteOrigin = row.quote_origin === "live" ? "live" : "simulated";
    const position: PaperPosition = {
      id: row.id,
      symbol: row.symbol,
      side,
      volume,
      openPrice,
      stopLoss: row.stop_loss == null ? null : Number(row.stop_loss),
      takeProfit: row.take_profit == null ? null : Number(row.take_profit),
      openedAt: row.opened_at,
    };

    const key = `${origin}|${position.symbol}`;
    let resolved = quoteCache.get(key);
    if (!resolved) {
      if (origin === "simulated") {
        resolved = simulatedQuote(getDemoQuotePrice(position.symbol));
      } else {
        const { data: snap } = await supabase
          .from("chart_live_snapshots")
          .select("last_bid,last_ask,last_tick_at")
          .eq("user_id", userId)
          .eq("display_symbol", position.symbol.toUpperCase())
          .order("last_tick_at", { ascending: false })
          .limit(1)
          .maybeSingle();
        resolved = quoteFromSnapshot(snap);
      }
      quoteCache.set(key, resolved);
    }

    // Same gate as the watcher: only a price of the position's own kind may
    // put a number next to it. Narrowed by hand rather than through a boolean,
    // because the compiler cannot see that `allowed.ok` implies a quote exists
    // — and a cast here would be the one place this rule could be bypassed.
    const allowed = mayJudgeWith(origin, resolved.origin);
    const usable = allowed.ok && resolved.origin !== "none" ? resolved : null;

    out.push({
      id: position.id,
      symbol: position.symbol,
      side: position.side,
      volume: position.volume,
      openPrice: position.openPrice,
      currentPrice: usable ? (position.side === "buy" ? usable.quote.bid : usable.quote.ask) : null,
      profit: usable ? markToMarket(position, usable.quote) : null,
      stopLoss: position.stopLoss,
      takeProfit: position.takeProfit,
      openTime: position.openedAt,
      quoteOrigin: origin,
    });
  }

  return out;
}
