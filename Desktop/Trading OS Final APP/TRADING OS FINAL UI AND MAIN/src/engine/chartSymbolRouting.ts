/**
 * Per-provider chart symbols (canonical UI symbol → provider-native tickers).
 */

import { Normalizer } from './core/normalize';

export type ChartProviderKind = 'polygon' | 'twelvedata' | 'fmp' | 'yahoo';

export interface ChartSymbolRouting {
  canonical: string;
  polygon: string;
  twelvedata: string;
  fmp: string[];
  yahoo: string;
}

/**
 * Resolve symbols for chart history. `canonical` is Normalizer.symbol output (e.g. XAUUSD).
 */
export function resolveChartSymbolRouting(canonical: string): ChartSymbolRouting {
  const c = Normalizer.symbol(canonical);

  if (c === 'XAUUSD') {
    return {
      canonical: 'XAUUSD',
      polygon: 'C:XAUUSD',
      twelvedata: 'XAU/USD',
      fmp: ['XAUUSD', 'GCUSD'],
      yahoo: 'XAUUSD=X',
    };
  }

  return {
    canonical: c,
    polygon: c,
    twelvedata: c,
    fmp: [c],
    yahoo: c,
  };
}
