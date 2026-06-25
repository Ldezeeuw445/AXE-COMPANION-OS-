/**
 * engine/providers/polygon.ts
 * ===========================
 * Polygon.io (Massive) provider.
 * ONLY fetches raw data. No normalization.
 * Free tier: 5 calls/minute [^11^]
 * 
 * Endpoints:
 *   - /aggs/ticker/{symbol}/range/{multiplier}/{timespan}/{from}/{to}
 *   - /quotes/{symbol}
 *   - /aggs/ticker/X:{pair}/prev (crypto)
 */

const BASE_URL = 'https://api.polygon.io/v2';

export interface PolygonConfig {
  apiKey: string;
}

export class PolygonProvider {
  private apiKey: string;

  constructor(config: PolygonConfig) {
    this.apiKey = config.apiKey;
  }

  /**
   * Fetch raw OHLC aggregates.
   */
  async fetchAggregates(symbol: string, multiplier: number = 1, timespan: string = 'day', from?: string, to?: string): Promise<any> {
    const fromDate = from || this.daysAgo(30);
    const toDate = to || this.today();
    const url = `${BASE_URL}/aggs/ticker/${symbol}/range/${multiplier}/${timespan}/${fromDate}/${toDate}?apiKey=${this.apiKey}`;

    const res = await fetch(url);
    if (!res.ok) throw new Error(`Polygon aggregates error: ${res.status}`);
    const data = await res.json();
    if (!Array.isArray(data.results) || data.results.length === 0) {
      throw new Error('Polygon: no aggregate results');
    }
    return data;
  }

  /**
   * Fetch raw quote.
   */
  async fetchQuote(symbol: string): Promise<any> {
    const url = `https://api.polygon.io/v3/quotes/${symbol}?apiKey=${this.apiKey}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Polygon quote error: ${res.status}`);
    const data = await res.json();
    if (!data.results || data.results.length === 0) throw new Error('Polygon: no quote results');
    return data.results[0];
  }

  /**
   * Fetch raw crypto aggregates.
   */
  async fetchCrypto(pair: string): Promise<any> {
    const url = `https://api.polygon.io/v2/aggs/ticker/X:${pair}/prev?apiKey=${this.apiKey}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Polygon crypto error: ${res.status}`);
    const data = await res.json();
    if (!data.results || data.results.length === 0) throw new Error('Polygon: no crypto results');
    return data.results[0];
  }

  private today(): string {
    return new Date().toISOString().split('T')[0];
  }

  private daysAgo(n: number): string {
    return new Date(Date.now() - n * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
  }
}
