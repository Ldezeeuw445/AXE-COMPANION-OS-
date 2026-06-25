/**
 * engine/providers/perigon.ts
 * ===========================
 * Perigon provider (news).
 *
 * Endpoint:
 * - /v1/all?apiKey=...&q=...
 */

const BASE_URL = 'https://api.goperigon.com/v1';

export interface PerigonConfig {
  apiKey: string;
}

export class PerigonProvider {
  private apiKey: string;

  constructor(config: PerigonConfig) {
    this.apiKey = config.apiKey;
  }

  async fetchNews(symbol: string, limit: number = 10): Promise<any[]> {
    const url =
      `${BASE_URL}/all?apiKey=${encodeURIComponent(this.apiKey)}` +
      `&q=${encodeURIComponent(symbol)}` +
      `&pageSize=${encodeURIComponent(String(Math.min(50, Math.max(1, limit))))}`;

    const res = await fetch(url);
    if (!res.ok) throw new Error(`Perigon news error: ${res.status}`);
    const json = await res.json();
    const articles = Array.isArray(json?.articles) ? json.articles : [];
    return articles.slice(0, limit);
  }
}

