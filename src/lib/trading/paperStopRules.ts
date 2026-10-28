/**
 * When a practice position may be closed by the watcher, and what it becomes.
 *
 * `paperBroker` knows whether a quote takes a position out. This knows
 * whether that quote is one we are allowed to judge it against, and turns the
 * result into the row that reaches `broker_trades` — where the journal,
 * `playbookEdge` and the learning arc pick it up.
 *
 * The rule that is easy to miss: **a position closes on the same kind of
 * price it opened on.** A position opened against the demo generator and
 * closed against a real broker tick produces a P/L that is the distance
 * between an invented number and a real one. That is not a profit or a loss,
 * it is an artefact — and it would land in the journal looking exactly like a
 * real result. So a `simulated` position is only ever judged against
 * simulated prices, and a `live` one only against live prices.
 *
 * The consequence is deliberate and worth stating: a live position whose feed
 * has gone quiet is **left open** rather than closed at a stale or invented
 * price. A stop that fires late is visible and arguable; a stop that fires at
 * a price that never existed is neither.
 *
 * Dependency-free apart from the two modules it joins.
 */

import type { PaperClose, PaperPosition } from "@/lib/trading/paperBroker";
import type { QuoteOrigin } from "@/lib/trading/paperQuoteSource";

export type StoredQuoteOrigin = "live" | "simulated";

/** Why the watcher is leaving a position alone this round. */
export type SkipReason = "no-price" | "origin-mismatch" | "no-stops";

export type CloseDecision =
  | { act: false; skip: SkipReason; detail: string }
  | { act: true; close: PaperClose };

/**
 * Whether this quote may be used to judge this position.
 *
 * Returns the reason rather than a boolean so the watcher can report why it
 * did nothing — a watcher that silently skips everything looks exactly like
 * one that found nothing to do.
 */
export function mayJudgeWith(
  positionOrigin: StoredQuoteOrigin,
  quoteOrigin: QuoteOrigin,
): { ok: true } | { ok: false; skip: SkipReason; detail: string } {
  if (quoteOrigin === "none") {
    return {
      ok: false,
      skip: "no-price",
      detail: "no usable price right now — leaving the position open rather than closing it at a guess",
    };
  }
  if (quoteOrigin !== positionOrigin) {
    return {
      ok: false,
      skip: "origin-mismatch",
      detail:
        positionOrigin === "simulated"
          ? "opened at generated prices, so it is not judged against a real tick — the difference would not be a profit or a loss"
          : "opened at a real price, so it is not closed against generated prices",
    };
  }
  return { ok: true };
}

export function decideClose(
  position: PaperPosition,
  positionOrigin: StoredQuoteOrigin,
  quoteOrigin: QuoteOrigin,
  evaluate: () => PaperClose | null,
): CloseDecision {
  if (position.stopLoss == null && position.takeProfit == null) {
    return { act: false, skip: "no-stops", detail: "no stop or target to hit" };
  }

  const allowed = mayJudgeWith(positionOrigin, quoteOrigin);
  if (!allowed.ok) return { act: false, skip: allowed.skip, detail: allowed.detail };

  const close = evaluate();
  if (!close) return { act: false, skip: "no-stops", detail: "neither level reached" };
  return { act: true, close };
}

/**
 * The row that goes into `broker_trades`.
 *
 * `external_trade_id` is prefixed `paper:` so these are separable from broker
 * fills forever — in a query, in an export, and in anyone's head six months
 * from now. The `raw` payload keeps what made the trade judgeable: which
 * price it was filled against, whether a gap moved the fill, and whether it
 * counts as evidence at all.
 *
 * The row reuses the position's own id as its primary key. `broker_trades`
 * has no unique constraint beyond that key — checked, not assumed — so this
 * is what makes writing the trade idempotent: a watcher that crashes between
 * recording the close and deleting the position retries into the same row
 * instead of creating a second one. It also means a closed paper trade and
 * the position it came from share an id, which is the first thing anyone
 * tracing one will want.
 */
export function toBrokerTradeRow(input: {
  position: PaperPosition;
  positionOrigin: StoredQuoteOrigin;
  close: PaperClose;
  userId: string;
  accountId: string;
  closedAt: string;
}): Record<string, unknown> {
  const { position, close, positionOrigin } = input;
  return {
    id: position.id,
    user_id: input.userId,
    account_id: input.accountId,
    external_trade_id: `paper:${position.id}`,
    symbol: position.symbol,
    side: position.side,
    volume: position.volume,
    open_time: position.openedAt,
    close_time: input.closedAt,
    open_price: position.openPrice,
    close_price: close.price,
    pnl: close.pnl,
    fees: 0,
    raw: {
      paper: true,
      quote_origin: positionOrigin,
      // The one field a reader needs to know whether this number means
      // anything about the trader. Kept inside `raw` rather than inferred
      // from the id prefix, so a query can filter on it directly.
      counts_as_evidence: positionOrigin === "live",
      close_reason: close.reason,
      gapped: close.gapped,
      stop_loss: position.stopLoss,
      take_profit: position.takeProfit,
    },
  };
}
