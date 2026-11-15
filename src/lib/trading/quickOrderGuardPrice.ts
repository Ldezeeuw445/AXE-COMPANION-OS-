/**
 * Which entry price the last-line trade guard in `placeMt5QuickOrder` measures
 * risk-per-trade against.
 *
 * A market order sends no open price to the broker, so the guard used to get
 * `entryPrice: null` for every market order. With a risk cap set (level 3
 * autonomy requires one) that made `tradeRiskPct` null and the guard refused
 * every market order as `risk_unknown` — including alert auto-trades and
 * drafts whose caller had just passed the very same guard with a known entry.
 *
 * Pending orders: the open price is the entry. Market orders: the caller's
 * reference price (trigger / draft entry), which is what the first guard call
 * already measured. Still null when neither is known, so the guard keeps
 * failing closed instead of guessing.
 *
 * Dependency-free so it can be unit tested without Supabase or MetaApi.
 */
export function quickOrderGuardEntryPrice(args: {
  orderType: "market" | "buy_limit" | "sell_limit";
  openPrice?: number | null;
  riskReferencePrice?: number | null;
}): number | null {
  const pick = args.orderType === "market" ? args.riskReferencePrice : args.openPrice;
  if (pick == null || !Number.isFinite(pick) || pick <= 0) return null;
  return pick;
}
