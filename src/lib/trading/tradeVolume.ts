export const MIN_TRADE_VOLUME_LOTS = 0.01;
export const MAX_TRADE_VOLUME_LOTS = 5;
export const DEFAULT_TRADE_VOLUME_LOTS = 0.1;

export function normalizeTradeVolume(value: unknown): number {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) return DEFAULT_TRADE_VOLUME_LOTS;
  return Math.min(MAX_TRADE_VOLUME_LOTS, Math.max(MIN_TRADE_VOLUME_LOTS, Math.round(n * 100) / 100));
}
