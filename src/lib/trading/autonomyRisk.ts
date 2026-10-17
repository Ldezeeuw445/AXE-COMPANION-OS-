/**
 * What one order risks, as a percent of the account.
 *
 * The caller hands in `pointValuePerLot` — the same figure
 * `@/lib/risk/accountRiskBand` uses to draw the risk band a trader looks at —
 * so the number enforced here is the number they were shown. A cap enforced
 * against a different model of the world than the UI draws would be its own
 * quiet lie.
 *
 * Injected rather than imported so this file keeps no runtime imports and the
 * verify scripts can exercise it with `node --experimental-strip-types`.
 *
 * Returns null when it genuinely cannot be worked out — no stop, no equity, a
 * stop sitting on top of entry. The guard treats null as a refusal when a cap
 * is set, rather than guessing.
 */

export type TradeRiskInput = {
  entryPrice: number | null | undefined;
  stopLoss: number | null | undefined;
  volumeLots: number;
  equity: number | null | undefined;
  /** Account currency per price unit, per lot. From accountRiskBand. */
  pointValuePerLot: number;
};

export function tradeRiskPct(input: TradeRiskInput): number | null {
  const { entryPrice, stopLoss, volumeLots, equity, pointValuePerLot } = input;
  if (entryPrice == null || stopLoss == null) return null;
  if (!Number.isFinite(entryPrice) || !Number.isFinite(stopLoss)) return null;
  if (!Number.isFinite(volumeLots) || volumeLots <= 0) return null;
  if (!Number.isFinite(pointValuePerLot) || pointValuePerLot <= 0) return null;
  if (equity == null || !Number.isFinite(equity) || equity <= 0) return null;

  const distance = Math.abs(entryPrice - stopLoss);
  if (distance <= 0) return null;

  const riskDollars = distance * pointValuePerLot * volumeLots;
  if (!Number.isFinite(riskDollars)) return null;
  return (riskDollars / equity) * 100;
}
