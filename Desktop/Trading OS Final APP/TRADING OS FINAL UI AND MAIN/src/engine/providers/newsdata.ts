/**
 * engine/providers/newsdata.ts
 * ============================
 * NewsData.io provider (news).
 *
 * Endpoint:
 * - /api/1/news?apikey=...&q=...&language=en
 */

const BASE_URL = 'https://newsdata.io/api/1';

export interface NewsDataConfig {
  apiKey: string;
}

export class NewsDataProvider {
  private apiKey: string;

  constructor(config: NewsDataConfig) {
    this.apiKey = config.apiKey;
  }

  async fetchNews(symbol: string, limit: number = 10): Promise<any[]> {
    const url =
      `${BASE_URL}/news?apikey=${encodeURIComponent(this.apiKey)}` +
      `&q=${encodeURIComponent(symbol)}` +
      `&language=en`;

    const res = await fetch(url);
    if (!res.ok) throw new Error(`NewsData news error: ${res.status}`);
    const json = await res.json();
    const results = Array.isArray(json?.results) ? json.results : [];
    return results.slice(0, limit);
  }
}

