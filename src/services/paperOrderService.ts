import type { SupabaseClient } from "@supabase/supabase-js";

import { getDemoQuotePrice } from "@/lib/broker/demoAccount";
import {
  closePaperPosition,
  openPaperPosition,
  paperOrderRejections,
  type PaperPosition,
  type PaperSide,
} from "@/lib/trading/paperBroker";
import {
  mayJudgeWith,
  toBrokerTradeRow,
  type StoredQuoteOrigin,
} from "@/lib/trading/paperStopRules";
import {
  describeQuoteOrigin,
  quoteFromSnapshot,
  simulatedQuote,
  type ResolvedQuote,
} from "@/lib/trading/paperQuoteSource";

/**
 * Placing an order on a practice account.
 *
 * `/api/mt5/order` used to answer a demo account with a flat 409: *"AXE Demo
 * Account is virtual — paper trades never reach a broker."* True, and it made
 * the account useless for the thing a practice account is for. Build-list
 * item 10.
 *
 * Two decisions live here, and both are about honesty rather than mechanics.
 *
 * **Where the price comes from.** A paper account has no feed of its own, so
 * this looks for a real bid/ask the trader already has — any live snapshot on
 * their own accounts for that symbol. Found one, the fill is at the real
 * spread and the trade counts as evidence. Not found, it falls back to the
 * demo generator and the row is marked `simulated` forever, because a win on
 * invented prices says nothing about whether someone can trade. That mark is
 * what keeps a random walk out of `playbookEdge`.
 *
 * **What is not checked.** The live-trading acknowledgement is deliberately
 * skipped: it exists so nobody sends real money to a broker by accident, and
 * there is no broker here. Making someone accept a risk disclaimer to place a
 * pretend trade teaches them to click through disclaimers, which is the
 * opposite of what it is for. Everything that shapes a habit — volume limits,
 * stops on the right side, crossing the spread — does apply.
 */

export type PaperOrderInput = {
  accountId: string;
  symbol: string;
  side: PaperSide;
  volume: number;
  stopLoss?: number | null;
  takeProfit?: number | null;
  comment?: string | null;
};

export type PaperOrderResult =
  | {
      ok: true;
      positionId: string;
      openPrice: number;
      quoteOrigin: "live" | "simulated";
      /** One line for the feed and the journal. */
      note: string;
    }
  | { ok: false; code: string; message: string };

/**
 * The best real price this trader has for a symbol, from any of their own
 * accounts.
 *
 * Scoped to `user_id` and nothing else: RLS would stop a cross-user read
 * anyway, but a query that only works because of RLS is one row of policy
 * away from leaking. Ordered newest first — `quoteFromSnapshot` then decides
 * whether it is fresh enough to fill against.
 */
export async function findLiveQuote(
  supabase: SupabaseClient,
  userId: string,
  symbol: string,
): Promise<ResolvedQuote> {
  const { data, error } = await supabase
    .from("chart_live_snapshots")
    .select("last_bid,last_ask,last_tick_at")
    .eq("user_id", userId)
    .eq("display_symbol", symbol.toUpperCase())
    .order("last_tick_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) return { origin: "none", reason: "could not read the price feed" };
  return quoteFromSnapshot(data);
}

export async function placePaperOrder(
  supabase: SupabaseClient,
  userId: string,
  input: PaperOrderInput,
): Promise<PaperOrderResult> {
  const symbol = input.symbol.trim().toUpperCase();

  // A real price if the trader has one, generated prices otherwise — and the
  // row remembers which, because by the time the position closes nobody can
  // tell them apart from the numbers alone.
  let resolved = await findLiveQuote(supabase, userId, symbol);
  if (resolved.origin === "none") {
    resolved = simulatedQuote(getDemoQuotePrice(symbol));
  }
  if (resolved.origin === "none") {
    return { ok: false, code: "no_price", message: describeQuoteOrigin(resolved) };
  }

  const openedAt = new Date().toISOString();
  const args = {
    id: crypto.randomUUID(),
    symbol,
    side: input.side,
    volume: input.volume,
    quote: resolved.quote,
    stopLoss: input.stopLoss ?? null,
    takeProfit: input.takeProfit ?? null,
    openedAt,
  };

  const rejections = paperOrderRejections(args);
  if (rejections.length > 0) {
    return { ok: false, code: "rejected", message: rejections.join("; ") };
  }

  const position = openPaperPosition(args);

  const { error } = await supabase.from("paper_positions").insert({
    id: position.id,
    user_id: userId,
    account_id: input.accountId,
    symbol: position.symbol,
    side: position.side,
    volume: position.volume,
    open_price: position.openPrice,
    stop_loss: position.stopLoss,
    take_profit: position.takeProfit,
    opened_at: position.openedAt,
    quote_origin: resolved.origin,
    comment: input.comment ?? null,
  });

  if (error) {
    // The table arrived in a migration that has to be applied separately, so
    // a missing relation is a real possibility rather than a theoretical one.
    // Say which it is instead of a generic failure, or the next person debugs
    // the order path when the answer is one SQL file.
    const missing = /relation .*paper_positions.* does not exist/i.test(error.message);
    return {
      ok: false,
      code: missing ? "paper_table_missing" : "paper_insert_failed",
      message: missing
        ? "Practice trading is not set up on this project yet — the paper_positions table has not been created."
        : `Could not record the paper position: ${error.message}`,
    };
  }

  return {
    ok: true,
    positionId: position.id,
    openPrice: position.openPrice,
    quoteOrigin: resolved.origin,
    note: describeQuoteOrigin(resolved),
  };
}

/**
 * Closing a practice position by hand.
 *
 * The same rule as the watcher: a position is closed against a price of the
 * kind it opened on. If a live position's feed has gone quiet, this refuses
 * rather than filling at a generated or stale price — which is what a broker
 * does too when the market is shut. Being unable to close is annoying and
 * true; a fabricated exit price is neither.
 *
 * The write order mirrors the watcher's, and for the same reason: record the
 * closed trade first, then remove the open position. A crash in between
 * leaves a trade that the next attempt writes into the same row, because the
 * row's primary key is the position's id.
 */
export async function closePaperPositionById(
  supabase: SupabaseClient,
  userId: string,
  positionId: string,
): Promise<PaperOrderResult | { ok: true; closed: true; pnl: number; price: number; note: string }> {
  const { data, error } = await supabase
    .from("paper_positions")
    .select("id,account_id,symbol,side,volume,open_price,stop_loss,take_profit,opened_at,quote_origin")
    .eq("user_id", userId)
    .eq("id", positionId)
    .maybeSingle();

  if (error) return { ok: false, code: "lookup_failed", message: error.message };
  if (!data) {
    return {
      ok: false,
      code: "position_not_found",
      message: "That practice position is not open on your account.",
    };
  }

  const row = data as Record<string, unknown>;
  const side = row.side === "buy" || row.side === "sell" ? (row.side as PaperSide) : null;
  const volume = Number(row.volume);
  const openPrice = Number(row.open_price);
  if (!side || !Number.isFinite(volume) || !Number.isFinite(openPrice)) {
    return { ok: false, code: "position_unreadable", message: "That position has values that cannot be read." };
  }

  const origin: StoredQuoteOrigin = row.quote_origin === "live" ? "live" : "simulated";
  const symbol = String(row.symbol);

  const resolved =
    origin === "simulated"
      ? simulatedQuote(getDemoQuotePrice(symbol))
      : await findLiveQuote(supabase, userId, symbol);

  const allowed = mayJudgeWith(origin, resolved.origin);
  if (!allowed.ok || resolved.origin === "none") {
    return {
      ok: false,
      code: "no_price",
      message:
        resolved.origin === "none"
          ? `Cannot close right now: ${"reason" in resolved ? resolved.reason : "no usable price"}.`
          : allowed.ok
            ? "Cannot close right now: no usable price."
            : `Cannot close right now — ${allowed.detail}.`,
    };
  }

  const position: PaperPosition = {
    id: String(row.id),
    symbol,
    side,
    volume,
    openPrice,
    stopLoss: row.stop_loss == null ? null : Number(row.stop_loss),
    takeProfit: row.take_profit == null ? null : Number(row.take_profit),
    openedAt: String(row.opened_at),
  };

  const close = closePaperPosition(position, resolved.quote);
  const closedAt = new Date().toISOString();

  const { error: insertErr } = await supabase
    .from("broker_trades")
    .upsert(
      toBrokerTradeRow({
        position,
        positionOrigin: origin,
        close,
        userId,
        accountId: String(row.account_id),
        closedAt,
      }),
      { onConflict: "id" },
    );

  if (insertErr) {
    return { ok: false, code: "close_record_failed", message: insertErr.message };
  }

  const { error: deleteErr } = await supabase
    .from("paper_positions")
    .delete()
    .eq("id", position.id)
    .eq("user_id", userId);

  if (deleteErr) {
    return {
      ok: false,
      code: "close_recorded_still_open",
      message: `The trade was recorded but the position is still listed: ${deleteErr.message}`,
    };
  }

  return {
    ok: true,
    closed: true,
    pnl: close.pnl,
    price: close.price,
    note:
      origin === "live"
        ? "Closed at the live broker spread. Counts towards what AXE learns about you."
        : "Closed at generated prices. Does not count towards what AXE learns about you.",
  };
}
