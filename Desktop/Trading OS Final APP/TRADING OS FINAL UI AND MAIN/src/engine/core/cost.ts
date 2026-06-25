export type EngineDomain = 'news' | 'macro' | 'chart' | 'scanner' | 'earnings' | 'intel' | 'account' | 'axe' | 'dashboard';

export type EngineEndpoint =
  | 'fetchNews'
  | 'fetchQuote'
  | 'fetchProfile'
  | 'fetchStatesAll'
  | 'fetchSnapshot'
  | 'fetchSeries'
  | 'fetchAggregates'
  | 'fetchTimeSeries'
  | 'fetchYahooChart'
  | 'fetchHistoricalLine'
  | 'fetchEarningsCalendar'
  | 'supabaseRead';

/**
 * Cost units are an internal heuristic used by routing.
 * They represent "how expensive" a call is relative to other calls.
 */
export function costUnits(input: {
  domain: EngineDomain;
  provider: string; // 'fmp' | 'fred' | 'polygon' | 'twelvedata' | 'yahoo' | 'supabase'
  endpoint: EngineEndpoint;
  multiplicity?: number; // e.g. scanner fanout count
}): number {
  const m = Math.max(1, Math.floor(input.multiplicity ?? 1));
  const provider = input.provider.toLowerCase();

  // Domain defaults
  if (input.domain === 'account' || input.domain === 'axe' || input.domain === 'dashboard') {
    return 1;
  }

  // Endpoint-specific heuristics
  switch (input.endpoint) {
    case 'fetchNews':
      // News endpoints are usually 1 unit per request.
      return 1;
    case 'fetchQuote':
      // Quote fanout is the expensive part of scanner — count per symbol.
      return 1 * m;
    case 'fetchProfile':
      return 1;
    case 'fetchStatesAll':
      return 2;
    case 'fetchSnapshot':
      return 2;
    case 'fetchSeries':
      return 1;
    case 'fetchAggregates':
      // Polygon candle aggregates are "expensive" relative to simple endpoints.
      return provider === 'polygon' ? 3 : 2;
    case 'fetchTimeSeries':
      return 1;
    case 'fetchYahooChart':
      return 1;
    case 'fetchHistoricalLine':
      return 1;
    case 'supabaseRead':
      return 1;
    default:
      return 1;
  }
}

