/**
 * engine/providers/thenewsapi.ts
 * ==============================
 * TheNewsAPI provider (news).
 *
 * Endpoint:
 * - /v1/news/all?api_token=...&search=...
 */

const BASE_URL = 'https://api.thenewsapi.com/v1';

export interface TheNewsApiConfig {
  apiKey: string;
}

export class TheNewsApiProvider {
  private apiKey: string;

  constructor(config: TheNewsApiConfig) {
    this.apiKey = config.apiKey;
  }

  async fetchNews(symbol: string, limit: number = 10): Promise<any[]> {
    const url =
      `${BASE_URL}/news/all?api_token=${encodeURIComponent(this.apiKey)}` +
      `&search=${encodeURIComponent(symbol)}` +
      `&language=en&limit=${encodeURIComponent(String(Math.min(50, Math.max(1, limit))))}`;

    const res = await fetch(url);
    if (!res.ok) throw new Error(`TheNewsAPI news error: ${res.status}`);
    const json = await res.json();
    const data = Array.isArray(json?.data) ? json.data : [];
    return data.slice(0, limit);
  }
}

