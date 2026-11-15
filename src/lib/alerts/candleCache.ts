/**
 * Per-run candle cache for the smart-alert cron.
 *
 * Candles are market data (not account data), so the key is symbol + timeframe.
 * Previously a single cache slot was filled by the first technical/predictive alert and
 * reused for every other symbol, so alerts evaluated on the wrong symbol's candles.
 */
export type CandleCache<T> = {
  get: (symbol: string, timeframe: string) => Promise<T>;
};

export function candleCacheKey(symbol: string, timeframe: string): string {
  return `${symbol.trim().toUpperCase()}|${timeframe.trim().toLowerCase()}`;
}

export function createCandleCache<T>(load: (symbol: string, timeframe: string) => Promise<T>): CandleCache<T> {
  // Cache the promise so concurrent/duplicate requests for the same key load once.
  const store = new Map<string, Promise<T>>();
  return {
    get(symbol, timeframe) {
      const key = candleCacheKey(symbol, timeframe);
      let hit = store.get(key);
      if (!hit) {
        hit = load(symbol.trim().toUpperCase(), timeframe.trim().toLowerCase()).catch((err) => {
          store.delete(key);
          throw err;
        });
        store.set(key, hit);
      }
      return hit;
    },
  };
}
