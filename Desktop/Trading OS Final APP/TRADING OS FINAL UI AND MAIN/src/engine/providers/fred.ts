/**
 * engine/providers/fred.ts
 * ========================
 * FRED (Federal Reserve Economic Data) provider.
 * ONLY fetches raw macro data. No normalization.
 * Free tier: 120 requests/day [^4^]
 * 
 * Series IDs:
 *   - CPIAUCSL → CPI (Consumer Price Index)
 *   - UNRATE → Unemployment Rate
 *   - FEDFUNDS → Federal Funds Rate
 *   - GDP → Gross Domestic Product
 *   - DGS10 → 10-Year Treasury Rate
 */

const BASE_URL = 'https://api.stlouisfed.org/fred';

export interface FREDConfig {
  apiKey: string;
}

export class FREDProvider {
  private apiKey: string;

  constructor(config: FREDConfig) {
    this.apiKey = config.apiKey;
  }

  /**
   * Fetch raw series data.
   */
  async fetchSeries(seriesId: string, from?: string, to?: string): Promise<any> {
    const params = new URLSearchParams({
      series_id: seriesId,
      api_key: this.apiKey,
      file_type: 'json',
      sort_order: 'desc',
      limit: '1000'
    });
    if (from) params.set('observation_start', from);
    if (to) params.set('observation_end', to);

    const url = `${BASE_URL}/series/observations?${params}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`FRED series error: ${res.status}`);
    const data = await res.json();
    if (!data.observations) throw new Error('FRED: no observations');
    return data;
  }

  /**
   * Fetch series info (name, description, frequency).
   */
  async fetchSeriesInfo(seriesId: string): Promise<any> {
    const url = `${BASE_URL}/series?series_id=${seriesId}&api_key=${this.apiKey}&file_type=json`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`FRED info error: ${res.status}`);
    const data = await res.json();
    const seriesList = data.seriess ?? data.seriemos;
    if (!Array.isArray(seriesList) || seriesList.length === 0) throw new Error('FRED: no series info');
    return seriesList[0];
  }
}
