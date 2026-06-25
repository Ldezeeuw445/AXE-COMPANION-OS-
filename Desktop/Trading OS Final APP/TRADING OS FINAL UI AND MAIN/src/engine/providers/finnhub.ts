/**
 * engine/providers/finnhub.ts
 * ===========================
 * Finnhub provider (news).
 *
 * Endpoints:
 * - /company-news?symbol={symbol}&from={YYYY-MM-DD}&to={YYYY-MM-DD}&token=...
 */

const BASE_URL = 'https://finnhub.io/api/v1';

export interface FinnhubConfig {
  apiKey: string;
}

export class FinnhubProvider {
  private apiKey: string;

  constructor(config: FinnhubConfig) {
    this.apiKey = config.apiKey;
  }

  async fetchNews(symbol: string, limit: number = 10): Promise<any[]> {
    const to = new Date();
    const from = new Date(Date.now() - 7 * 86400000);
    const toStr = to.toISOString().slice(0, 10);
    const fromStr = from.toISOString().slice(0, 10);

    const url =
      `${BASE_URL}/company-news?symbol=${encodeURIComponent(symbol)}` +
      `&from=${encodeURIComponent(fromStr)}` +
      `&to=${encodeURIComponent(toStr)}` +
      `&token=${encodeURIComponent(this.apiKey)}`;

    const res = await fetch(url);
    if (!res.ok) throw new Error(`Finnhub news error: ${res.status}`);
    const json = await res.json();
    if (!Array.isArray(json)) throw new Error('Finnhub: invalid news response');
    return json.slice(0, limit);
  }
}

