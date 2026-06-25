/**
 * engine/providers/fmp.ts
 * =======================
 * Financial Modeling Prep provider.
 * ONLY fetches raw data. No normalization, no caching, no routing.
 * Free tier: 250 requests/day [^16^]
 * 
 * Endpoints:
 *   - /quote/{symbol}
 *   - /stock_news?tickers={symbol}
 *   - /profile/{symbol}
 *   - /technical_indicator/1day/{symbol}
 */

const BASE_URL = 'https://financialmodelingprep.com/api/v3';

export interface FMPConfig {
  apiKey: string;
}

export class FMPProvider {
  private apiKey: string;

  constructor(config: FMPConfig) {
    this.apiKey = config.apiKey;
  }

  /**
   * Fetch raw stock quote.
   */
  async fetchQuote(symbol: string): Promise<any> {
    const url = `${BASE_URL}/quote/${symbol}?apikey=${this.apiKey}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`FMP quote error: ${res.status}`);
    const data = await res.json();
    if (!Array.isArray(data) || data.length === 0) throw new Error('FMP: empty quote response');
    return data[0];
  }

  /**
   * Fetch raw news.
   */
  async fetchNews(symbol: string, limit: number = 10): Promise<any[]> {
    const url = `${BASE_URL}/stock_news?tickers=${symbol}&limit=${limit}&apikey=${this.apiKey}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`FMP news error: ${res.status}`);
    const data = await res.json();
    if (!Array.isArray(data)) throw new Error('FMP: invalid news response');
    return data;
  }

  /**
   * Fetch raw company profile.
   */
  async fetchProfile(symbol: string): Promise<any> {
    const url = `${BASE_URL}/profile/${symbol}?apikey=${this.apiKey}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`FMP profile error: ${res.status}`);
    const data = await res.json();
    if (!Array.isArray(data) || data.length === 0) throw new Error('FMP: empty profile response');
    return data[0];
  }

  /**
   * Fetch raw technical indicator.
   */
  async fetchTechnical(symbol: string, indicator: string = 'rsi', period: number = 14): Promise<any[]> {
    const url = `${BASE_URL}/technical_indicator/1day/${symbol}?type=${indicator}&period=${period}&apikey=${this.apiKey}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`FMP technical error: ${res.status}`);
    const data = await res.json();
    if (!Array.isArray(data)) throw new Error('FMP: invalid technical response');
    return data;
  }

  async fetchAnalystTargets(symbol: string): Promise<any[]> {
    const url = `https://financialmodelingprep.com/api/v4/price-target-consensus?symbol=${encodeURIComponent(symbol)}&apikey=${this.apiKey}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`FMP targets error: ${res.status}`);
    const data = await res.json();
    if (!Array.isArray(data)) throw new Error('FMP: invalid targets response');
    return data;
  }

  async fetchAnalystRecommendations(symbol: string): Promise<any[]> {
    const url = `${BASE_URL}/analyst-stock-recommendations/${encodeURIComponent(symbol)}?apikey=${this.apiKey}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`FMP recs error: ${res.status}`);
    const data = await res.json();
    if (!Array.isArray(data)) throw new Error('FMP: invalid recs response');
    return data;
  }

  async fetchUpgradesDowngrades(symbol: string): Promise<any[]> {
    const url = `https://financialmodelingprep.com/api/v4/upgrades-downgrades?symbol=${encodeURIComponent(symbol)}&apikey=${this.apiKey}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`FMP upgrades error: ${res.status}`);
    const data = await res.json();
    if (!Array.isArray(data)) throw new Error('FMP: invalid upgrades response');
    return data;
  }

  async fetchStockPeers(symbol: string): Promise<any[]> {
    const url = `https://financialmodelingprep.com/api/v4/stock_peers?symbol=${encodeURIComponent(symbol)}&apikey=${this.apiKey}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`FMP peers error: ${res.status}`);
    const data = await res.json();
    if (!Array.isArray(data)) throw new Error('FMP: invalid peers response');
    return data;
  }

  async fetchHistoricalLine(symbol: string): Promise<any> {
    if (!this.apiKey?.trim()) throw new Error('FMP: missing api key');
    const enc = encodeURIComponent(symbol);
    const stable = `https://financialmodelingprep.com/stable/historical-chart/1day/${enc}?apikey=${encodeURIComponent(this.apiKey)}`;
    const resStable = await fetch(stable);
    if (resStable.ok) {
      const arr = await resStable.json();
      if (Array.isArray(arr) && arr.length > 0) return { historical: arr };
    }
    const url = `${BASE_URL}/historical-price-full/${enc}?serietype=line&apikey=${this.apiKey}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`FMP historical error: ${res.status}`);
    const data = await res.json();
    if (data && Array.isArray(data.historical) && data.historical.length > 0) return data;
    if (Array.isArray(data) && data.length > 0) return { historical: data };
    throw new Error('FMP: empty historical response');
  }

  /**
   * Fetch raw earnings calendar rows for a date range.
   * Dates must be YYYY-MM-DD.
   */
  async fetchEarningsCalendar(from: string, to: string): Promise<any[]> {
    const url = `${BASE_URL}/earning_calendar?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}&apikey=${this.apiKey}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`FMP earnings error: ${res.status}`);
    const data = await res.json();
    if (!Array.isArray(data)) throw new Error('FMP: invalid earnings response');
    return data;
  }
}
