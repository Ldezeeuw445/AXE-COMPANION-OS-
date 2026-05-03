/**
 * engine/services/macroService.ts
 * ================================
 * Macro service — fetches economic data from FRED/FMP.
 * 
 * Flow:
 *   1. Normalize series key (CPI_US → CPIAUCSL)
 *   2. Check cache (longer TTL — macro changes slowly)
 *   3. Select provider (FRED → FMP)
 *   4. Fetch with failover
 *   5. Normalize to MacroSeries
 *   6. Calculate changes
 *   7. Return fixed shape
 */

import { CacheEngine } from '../core/cache';
import { InflightDeduper } from '../core/dedupe';
import { Normalizer } from '../core/normalize';
import { SourceRouter } from '../core/router';
import { ProviderHealthTracker } from '../core/health';
import type { SourcePolicy } from '../core/policies';
import { DEFAULT_POLICIES } from '../core/policies';
import type { MacroSeries, MacroFilter, MacroDataPoint } from '../types/macro';
import { FREDProvider } from '../providers/fred';
import { withRetry } from '../core/retry';
import { costUnits } from '../core/cost';

export interface MacroProviderConfig {
  id: string;
  provider: FREDProvider | any;
  weight: number;
  monthlyLimit: number;
  dailyLimit: number;
  avgLatencyMs: number;
  dataQuality: number;
  costPerCall?: number;
}

// Series ID mapping: UI keys / FRED ids → FRED fetch + metadata.
// Legacy aliases (CPI_US, …) plus every FRED id used by MacroTerminal / engineAdapterLegacy MACRO_DEFS.
const SERIES_MAP: Record<string, { fred: string; fmp?: string; name: string; unit: string; frequency: MacroSeries['frequency'] }> = {
  CPI_US: { fred: 'CPIAUCSL', name: 'Consumer Price Index', unit: 'Index', frequency: 'monthly' },
  UNEMPLOYMENT_US: { fred: 'UNRATE', name: 'Unemployment Rate', unit: '%', frequency: 'monthly' },
  FEDFUNDS: { fred: 'FEDFUNDS', name: 'Federal Funds Rate', unit: '%', frequency: 'monthly' },
  GDP_US: { fred: 'GDP', name: 'Gross Domestic Product', unit: 'Billions USD', frequency: 'quarterly' },
  TREASURY_10Y: { fred: 'DGS10', name: '10-Year Treasury Rate', unit: '%', frequency: 'daily' },
  INFLATION_US: { fred: 'T10YIE', name: '10-Year Breakeven Inflation', unit: '%', frequency: 'daily' },
  NONFARM_PAYROLLS: { fred: 'PAYEMS', name: 'Nonfarm Payrolls', unit: 'Thousands', frequency: 'monthly' },
  RETAIL_SALES: { fred: 'RSXFS', name: 'Retail Sales', unit: 'Million USD', frequency: 'monthly' },

  // Rates (daily)
  DGS10: { fred: 'DGS10', name: '10Y Treasury', unit: '%', frequency: 'daily' },
  DGS2: { fred: 'DGS2', name: '2Y Treasury', unit: '%', frequency: 'daily' },
  DGS30: { fred: 'DGS30', name: '30Y Treasury', unit: '%', frequency: 'daily' },
  DGS5: { fred: 'DGS5', name: '5Y Treasury', unit: '%', frequency: 'daily' },
  T10Y2Y: { fred: 'T10Y2Y', name: '10Y-2Y Spread', unit: '%', frequency: 'daily' },
  T10Y3M: { fred: 'T10Y3M', name: '10Y-3M Spread', unit: '%', frequency: 'daily' },
  MORTGAGE30US: { fred: 'MORTGAGE30US', name: '30Y Mortgage', unit: '%', frequency: 'weekly' },

  // Inflation / prices
  CPIAUCSL: { fred: 'CPIAUCSL', name: 'CPI (All Urban Consumers)', unit: 'Index', frequency: 'monthly' },
  CPILFESL: { fred: 'CPILFESL', name: 'Core CPI', unit: 'Index', frequency: 'monthly' },
  PCEPI: { fred: 'PCEPI', name: 'PCE Price Index', unit: 'Index', frequency: 'monthly' },
  PCEPILFE: { fred: 'PCEPILFE', name: 'Core PCE', unit: 'Index', frequency: 'monthly' },
  PPIFIS: { fred: 'PPIFIS', name: 'PPI Final Demand', unit: 'Index', frequency: 'monthly' },
  CUSR0000SAH1: { fred: 'CUSR0000SAH1', name: 'Shelter CPI', unit: 'Index', frequency: 'monthly' },
  T10YIE: { fred: 'T10YIE', name: 'Breakeven Inflation 10Y', unit: '%', frequency: 'daily' },
  DCOILWTICO: { fred: 'DCOILWTICO', name: 'WTI Crude', unit: 'USD', frequency: 'daily' },

  // Growth
  A191RL1Q225SBEA: { fred: 'A191RL1Q225SBEA', name: 'Real GDP Growth', unit: '%', frequency: 'quarterly' },
  GDP: { fred: 'GDP', name: 'Nominal GDP', unit: 'Billions USD', frequency: 'quarterly' },
  IPMAN: { fred: 'IPMAN', name: 'Industrial Production', unit: 'Index', frequency: 'monthly' },
  M2SL: { fred: 'M2SL', name: 'M2 Money Supply', unit: 'Billions USD', frequency: 'monthly' },
  HOUST: { fred: 'HOUST', name: 'Housing Starts', unit: 'Thousands SAAR', frequency: 'monthly' },
  RSAFS: { fred: 'RSAFS', name: 'Retail Sales', unit: 'Millions USD', frequency: 'monthly' },

  // Labor
  UNRATE: { fred: 'UNRATE', name: 'Unemployment Rate', unit: '%', frequency: 'monthly' },
  PAYEMS: { fred: 'PAYEMS', name: 'Nonfarm Payrolls', unit: 'Thousands', frequency: 'monthly' },
  CES0500000003: { fred: 'CES0500000003', name: 'Avg Hourly Earnings', unit: 'USD', frequency: 'monthly' },
  ICSA: { fred: 'ICSA', name: 'Initial Claims', unit: 'Persons', frequency: 'weekly' },
  U6RATE: { fred: 'U6RATE', name: 'U6 Underemployment', unit: '%', frequency: 'monthly' },
  CIVPART: { fred: 'CIVPART', name: 'Labor Participation', unit: '%', frequency: 'monthly' },

  // Money / credit
  M1SL: { fred: 'M1SL', name: 'M1 Money Supply', unit: 'Billions USD', frequency: 'monthly' },
  DTWEXBGS: { fred: 'DTWEXBGS', name: 'US Dollar Index', unit: 'Index', frequency: 'daily' },
  DPCREDIT: { fred: 'DPCREDIT', name: 'Bank Credit', unit: 'Billions USD', frequency: 'weekly' },

  // Risk / markets
  SP500: { fred: 'SP500', name: 'S&P 500', unit: 'Index', frequency: 'daily' },
  VIXCLS: { fred: 'VIXCLS', name: 'VIX', unit: 'Index', frequency: 'daily' },
  BAMLH0A0HYM2: { fred: 'BAMLH0A0HYM2', name: 'HY OAS', unit: 'Percent', frequency: 'daily' },
  TEDRATE: { fred: 'TEDRATE', name: 'TED Spread', unit: '%', frequency: 'daily' },
  GOLDPMGBD228NLBM: { fred: 'GOLDPMGBD228NLBM', name: 'Gold (London PM)', unit: 'USD', frequency: 'daily' },
  UMCSENT: { fred: 'UMCSENT', name: 'Consumer Sentiment', unit: 'Index', frequency: 'monthly' },
  CSCICP03USM665S: { fred: 'CSCICP03USM665S', name: 'Consumer Confidence', unit: 'Index', frequency: 'monthly' },
  RECPROUSM156N: { fred: 'RECPROUSM156N', name: 'Recession Prob 6M', unit: '%', frequency: 'monthly' },
};

function inferFredSeriesMeta(key: string): { fred: string; name: string; unit: string; frequency: MacroSeries['frequency'] } | null {
  const k = key.trim();
  if (!/^[A-Z0-9._]+$/.test(k)) return null;
  return { fred: k, name: k, unit: '', frequency: 'monthly' };
}

export class MacroService {
  private cache: CacheEngine;
  private deduper: InflightDeduper;
  private router: SourceRouter;
  private health: ProviderHealthTracker;
  private providers: Map<string, MacroProviderConfig>;
  private policy: SourcePolicy;

  constructor(
    cache: CacheEngine,
    deduper: InflightDeduper,
    router: SourceRouter,
    health: ProviderHealthTracker,
    configs: MacroProviderConfig[]
  ) {
    this.cache = cache;
    this.deduper = deduper;
    this.router = router;
    this.health = health;
    this.providers = new Map(configs.map(c => [c.id, c]));
    this.policy = DEFAULT_POLICIES.macro;

    for (const config of configs) {
      router.register({
        id: config.id,
        provider: config.id.split('_')[0],
        weight: config.weight,
        monthlyLimit: config.monthlyLimit,
        dailyLimit: config.dailyLimit,
        usedThisMonth: 0,
        usedToday: 0,
        avgLatencyMs: config.avgLatencyMs,
        dataQuality: config.dataQuality,
        costPerCall: config.costPerCall ?? 1,
      });
    }
  }

  /**
   * Get macro series — the ONLY function the UI calls for macro data.
   */
  async getSeries(key: string, filter: MacroFilter = {}): Promise<MacroSeries> {
    const seriesInfo = SERIES_MAP[key] ?? inferFredSeriesMeta(key);
    if (!seriesInfo) {
      throw new Error(`Unknown macro series: ${key}`);
    }

    const range = Normalizer.dateRange(filter.range);
    const cacheKey = Normalizer.cacheKey('macro', { key, from: range.from, to: range.to });

    const result = await this.cache.getOrFetch(
      cacheKey,
      this.policy.cacheTtlMs,
      this.policy.staleWhileRevalidate || false,
      () => this.deduper.dedupe(cacheKey, () => this.fetchFromProviders(key, range.from, range.to))
    );

    return result.data as MacroSeries;
  }

  /**
   * List available macro series.
   */
  listAvailableSeries(): { key: string; name: string; unit: string; frequency: string }[] {
    return Object.entries(SERIES_MAP).map(([key, info]) => ({
      key,
      name: info.name,
      unit: info.unit,
      frequency: info.frequency
    }));
  }

  /**
   * Fetch from providers with failover.
   */
  private async fetchFromProviders(key: string, from: string, to: string): Promise<MacroSeries> {
    const seriesInfo = SERIES_MAP[key] ?? inferFredSeriesMeta(key);
    if (!seriesInfo) throw new Error(`Unknown macro series: ${key}`);
    const providerIds = Array.from(this.providers.keys());
    const primaryId = this.router.select(providerIds, this.policy.priority);

    if (!primaryId) {
      throw new Error('No healthy macro provider available');
    }

    const chain = this.router.buildFallbackChain(primaryId, providerIds, this.policy.fallback);
    let lastError: Error | null = null;

    for (const id of chain) {
      const config = this.providers.get(id);
      if (!config) continue;

      try {
        if (id !== primaryId) this.router.recordFallbackUsed();
        const raw = await withRetry(
          async () => {
            this.router.recordUsage(id, costUnits({ domain: 'macro', provider: id.split('_')[0], endpoint: 'fetchSeries' }));
            if (config.provider instanceof FREDProvider) {
              return await config.provider.fetchSeries(seriesInfo.fred, from, to);
            }
            return await config.provider.fetchMacro(key, from, to);
          },
          { maxAttempts: 2, baseDelayMs: 200, maxDelayMs: 1200 },
        );

        this.health.recordSuccess(id);
        return this.normalizeMacro(key, raw.value, seriesInfo);
      } catch (e) {
        lastError = e as Error;
        this.health.recordFailure(id, e);
      }
    }

    throw lastError || new Error('All macro providers failed');
  }

  /**
   * Normalize raw FRED data to fixed MacroSeries shape.
   */
  private normalizeMacro(key: string, raw: any, info: typeof SERIES_MAP[string]): MacroSeries {
    const observations = raw.observations || [];

    // Parse and sort by date
    const points: MacroDataPoint[] = observations
      .map((obs: any) => ({
        date: obs.date,
        value: obs.value === '.' ? NaN : parseFloat(obs.value)
      }))
      .filter((p: MacroDataPoint) => !isNaN(p.value))
      .sort((a: MacroDataPoint, b: MacroDataPoint) => new Date(a.date).getTime() - new Date(b.date).getTime());

    // Calculate changes
    for (let i = 1; i < points.length; i++) {
      const prev = points[i - 1].value;
      const curr = points[i].value;
      points[i].change = curr - prev;
      points[i].changePercent = prev !== 0 ? ((curr - prev) / Math.abs(prev)) * 100 : 0;
    }

    return {
      key,
      name: info.name,
      description: `${info.name} — ${info.frequency} data`,
      unit: info.unit,
      frequency: info.frequency,
      data: points,
      lastUpdated: new Date().toISOString()
    };
  }
}
