/**
 * engine/core/normalize.ts
 * ========================
 * Layer A — Input normalization.
 * Every symbol, timeframe, date range gets normalized before it hits cache or providers.
 * Prevents cache misses from "EURUSD" vs "EUR-USD" vs "eurusd".
 */

export class Normalizer {
  /**
   * Normalize symbol to uppercase, strip noise.
   * EURUSD, EUR-USD, eurusd → EURUSD
   * BTCUSD → BTCUSD
   */
  static symbol(input: string): string {
    return input
      .toUpperCase()
      .replace(/[^A-Z0-9]/g, '');
  }

  /**
   * Normalize timeframe to standard format.
   * 1m → 1M, 1h → 1H, 1d → 1D
   */
  static timeframe(input: string): string {
    const map: Record<string, string> = {
      '1M': '1M', '1m': '1M',
      '5M': '5M', '5m': '5M',
      '15M': '15M', '15m': '15M',
      '30M': '30M', '30m': '30M',
      '1H': '1H', '1h': '1H',
      '2H': '2H', '2h': '2H',
      '4H': '4H', '4h': '4H',
      '6H': '6H', '6h': '6H',
      '8H': '8H', '8h': '8H',
      '12H': '12H', '12h': '12H',
      '1D': '1D', '1d': '1D',
      '3D': '3D', '3d': '3D',
      '1W': '1W', '1w': '1W',
      '1MO': '1MO', '1mo': '1MO',
    };
    return map[input] || input.toUpperCase();
  }

  /**
   * Convert date range shorthand to from/to ISO dates.
   * 1M → last 30 days, 1Y → last 365 days
   */
  static dateRange(input?: '1M' | '3M' | '6M' | '1Y' | '5Y' | 'ALL'): { from: string; to: string } {
    const now = new Date();
    const to = now.toISOString().split('T')[0];
    const ranges: Record<string, number> = {
      '1M': 30, '3M': 90, '6M': 180, '1Y': 365, '5Y': 1825
    };
    const days = input && ranges[input] ? ranges[input] : 365;
    const from = new Date(now.getTime() - days * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    return { from, to };
  }

  /**
   * Normalize a full request key for cache lookup.
   */
  static cacheKey(endpoint: string, params: Record<string, unknown>): string {
    const sorted = Object.keys(params).sort().reduce((acc, k) => {
      acc[k] = params[k];
      return acc;
    }, {} as Record<string, unknown>);
    return `${endpoint}:${JSON.stringify(sorted)}`;
  }
}
