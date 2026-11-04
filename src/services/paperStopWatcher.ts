import type { SupabaseClient } from "@supabase/supabase-js";

import { getDemoQuotePrice } from "@/lib/broker/demoAccount";
import {
  evaluatePaperStops,
  type PaperPosition,
  type PaperSide,
} from "@/lib/trading/paperBroker";
import { quoteFromSnapshot, simulatedQuote } from "@/lib/trading/paperQuoteSource";
import {
  decideClose,
  toBrokerTradeRow,
  type StoredQuoteOrigin,
} from "@/lib/trading/paperStopRules";

/**
 * Closing practice positions whose stop or target has been reached.
 *
 * A position opened through `/api/mt5/order` on a practice account sits in
 * `paper_positions` until something notices its level was hit. Nothing did,
 * until this. A stop that never fires is worse than no stop: the trader
 * practises placing them and learns that they do not matter.
 *
 * Runs from a host cron, like the other sweeps. It is deliberately dull —
 * every judgement lives in `paperStopRules` and `paperBroker` where it can be
 * exercised without a database.
 *
 * One behaviour worth knowing about: a live position whose feed has gone
 * quiet is left open rather than closed against a stale or generated price.
 * That is `mayJudgeWith`, and it means a stop can fire late. Late is visible
 * and arguable; a fill at a price that never existed is neither.
 */

export type PaperStopSummary = {
  checked: number;
  closed: number;
  skipped: Record<string, number>;
  errors: string[];
};

type PositionRow = {
  id: string;
  user_id: string;
  account_id: string;
  symbol: string;
  side: string;
  volume: number | string;
  open_price: number | string;
  stop_loss: number | string | null;
  take_profit: number | string | null;
  opened_at: string;
  quote_origin: string;
};

function toPosition(row: PositionRow): PaperPosition | null {
  const side = row.side === "buy" || row.side === "sell" ? (row.side as PaperSide) : null;
  if (!side) return null;
  const volume = Number(row.volume);
  const openPrice = Number(row.open_price);
  if (!Number.isFinite(volume) || !Number.isFinite(openPrice)) return null;

  return {
    id: row.id,
    symbol: row.symbol,
    side,
    volume,
    openPrice,
    stopLoss: row.stop_loss == null ? null : Number(row.stop_loss),
    takeProfit: row.take_profit == null ? null : Number(row.take_profit),
    openedAt: row.opened_at,
  };
}

export async function sweepPaperStops(
  supabase: SupabaseClient,
  options: { maxPositions?: number } = {},
): Promise<PaperStopSummary> {
  const summary: PaperStopSummary = { checked: 0, closed: 0, skipped: {}, errors: [] };
  const limit = options.maxPositions ?? 200;

  const { data, error } = await supabase
    .from("paper_positions")
    .select("id,user_id,account_id,symbol,side,volume,open_price,stop_loss,take_profit,opened_at,quote_origin")
    .or("stop_loss.not.is.null,take_profit.not.is.null")
    .order("opened_at", { ascending: true })
    .limit(limit);

  if (error) {
    summary.errors.push(`could not read open positions: ${error.message}`);
    return summary;
  }

  const rows = (data ?? []) as PositionRow[];

  // One snapshot read per (user, symbol) rather than per position: a trader
  // with eight positions on gold should not cost eight identical queries.
  const quoteCache = new Map<string, Awaited<ReturnType<typeof quoteFromSnapshot>>>();

  for (const row of rows) {
    summary.checked += 1;
    const position = toPosition(row);
    if (!position) {
      summary.errors.push(`position ${row.id} has values that cannot be read`);
      continue;
    }

    const origin: StoredQuoteOrigin = row.quote_origin === "live" ? "live" : "simulated";
    const key = `${row.user_id}|${position.symbol}`;

    let resolved = quoteCache.get(key);
    if (!resolved) {
      if (origin === "simulated") {
        resolved = simulatedQuote(getDemoQuotePrice(position.symbol));
      } else {
        const { data: snap } = await supabase
          .from("chart_live_snapshots")
          .select("last_bid,last_ask,last_tick_at")
          .eq("user_id", row.user_id)
          .eq("display_symbol", position.symbol.toUpperCase())
          .order("last_tick_at", { ascending: false })
          .limit(1)
          .maybeSingle();
        resolved = quoteFromSnapshot(snap);
      }
      quoteCache.set(key, resolved);
    }

    const decision = decideClose(position, origin, resolved.origin, () =>
      resolved.origin === "none" ? null : evaluatePaperStops(position, resolved.quote),
    );

    if (!decision.act) {
      summary.skipped[decision.skip] = (summary.skipped[decision.skip] ?? 0) + 1;
      continue;
    }

    const closedAt = new Date().toISOString();
    const tradeRow = toBrokerTradeRow({
      position,
      positionOrigin: origin,
      close: decision.close,
      userId: row.user_id,
      accountId: row.account_id,
      closedAt,
    });

    // Write the closed trade first, then remove the open position. A crash
    // between the two leaves the position open and the trade recorded; the
    // next sweep closes it again into the same row, because the row's id is
    // the position's id. The other order would lose the trade entirely.
    //
    // `broker_trades` has no unique constraint except its primary key —
    // checked against the live schema rather than assumed — so the id is what
    // makes this idempotent.
    const { error: insertErr } = await supabase
      .from("broker_trades")
      .upsert(tradeRow, { onConflict: "id" });

    if (insertErr) {
      summary.errors.push(`could not record closed trade ${position.id}: ${insertErr.message}`);
      continue;
    }

    const { error: deleteErr } = await supabase
      .from("paper_positions")
      .delete()
      .eq("id", position.id);

    if (deleteErr) {
      summary.errors.push(`closed trade ${position.id} recorded but still open: ${deleteErr.message}`);
      continue;
    }

    summary.closed += 1;
  }

  return summary;
}
