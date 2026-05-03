/**
 * engine/providers/twelvedata.ts
 * ==============================
 * Twelve Data provider.
 * ONLY fetches raw data. No normalization.
 * Free tier: 800 calls/day [^16^]
 * 
 * Endpoints:
 *   - /quote?symbol={symbol}
 *   - /time_series?symbol={symbol}&interval={interval}
 *   - /exchange_rate?symbol={pair}
 */

const BASE_URL = 'https://api.twelvedata.com';

export interface TwelveDataConfig {
  apiKey: string;
}

export class TwelveDataProvider {
  private apiKey: string;

  constructor(config: TwelveDataConfig) {
    this.apiKey = config.apiKey;
  }

  /**
   * Fetch raw quote.
   */
  async fetchQuote(symbol: string): Promise<any> {
    const url = `${BASE_URL}/quote?symbol=${encodeURIComponent(symbol)}&apikey=${encodeURIComponent(this.apiKey)}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`TwelveData quote error: ${res.status}`);
    const data = await res.json();
    if (data.code) throw new Error(`TwelveData: ${data.message}`);
    return data;
  }

  /**
   * Fetch raw time series.
   */
  async fetchTimeSeries(symbol: string, interval: string = '1min', outputsize: number = 100): Promise<any> {
    const url =
      `${BASE_URL}/time_series?symbol=${encodeURIComponent(symbol)}` +
      `&interval=${encodeURIComponent(interval)}` +
      `&outputsize=${encodeURIComponent(String(outputsize))}` +
      `&apikey=${encodeURIComponent(this.apiKey)}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`TwelveData time series error: ${res.status}`);
    const data = await res.json();
    if (data.code) throw new Error(`TwelveData: ${data.message}`);
    return data;
  }

  /**
   * Fetch raw forex rate.
   */
  async fetchForex(pair: string): Promise<any> {
    const url = `${BASE_URL}/exchange_rate?symbol=${encodeURIComponent(pair)}&apikey=${encodeURIComponent(this.apiKey)}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`TwelveData forex error: ${res.status}`);
    const data = await res.json();
    if (data.code) throw new Error(`TwelveData: ${data.message}`);
    return data;
  }
}
