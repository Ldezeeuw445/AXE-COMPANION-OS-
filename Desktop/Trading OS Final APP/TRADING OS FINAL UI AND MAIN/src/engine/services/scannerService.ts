/**
 * engine/services/scannerService.ts
 * ==================================
 * Scanner service — aggregates market data into ranked signals.
 * 
 * Flow:
 *   1. Fetch market snapshot from multiple providers
 *   2. Calculate metrics (RSI, volume, momentum, etc.)
 *   3. Score each symbol 0-100
 *   4. Rank and filter
 *   5. Return fixed ScannerResult[]
 */

import { CacheEngine } from '../core/cache';
import { InflightDeduper } from '../core/dedupe';
import { Normalizer } from '../core/normalize';
import { SourceRouter } from '../core/router';
import { ProviderHealthTracker } from '../core/health';
import type { SourcePolicy } from '../core/policies';
import { DEFAULT_POLICIES } from '../core/policies';
import type { ScannerResult, ScannerFilter } from '../types/scanner';
import { FMPProvider } from '../providers/fmp';
import { PolygonProvider } from '../providers/polygon';
import { withRetry } from '../core/retry';
import { costUnits } from '../core/cost';

export interface ScannerProviderConfig {
  id: string;
  provider: FMPProvider | PolygonProvider;
  weight: number;
  monthlyLimit: number;
  dailyLimit: number;
  avgLatencyMs: number;
  dataQuality: number;
  costPerCall?: number;
}

export class ScannerService {
  private cache: CacheEngine;
  private deduper: InflightDeduper;
  private router: SourceRouter;
  private health: ProviderHealthTracker;
  private providers: Map<string, ScannerProviderConfig>;
  private policy: SourcePolicy;

  constructor(
    cache: CacheEngine,
    deduper: InflightDeduper,
    router: SourceRouter,
    health: ProviderHealthTracker,
    configs: ScannerProviderConfig[]
  ) {
    this.cache = cache;
    this.deduper = deduper;
    this.router = router;
    this.health = health;
    this.providers = new Map(configs.map(c => [c.id, c]));
    this.policy = DEFAULT_POLICIES.scanner;

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
   * Scan market — the ONLY function the UI calls for scanner/heatmap.
   */
  async scan(filter: ScannerFilter = {}): Promise<ScannerResult[]> {
    const cacheKey = Normalizer.cacheKey('scanner', filter as Record<string, unknown>);

    const result = await this.cache.getOrFetch(
      cacheKey,
      this.policy.cacheTtlMs,
      this.policy.staleWhileRevalidate || false,
      () => this.deduper.dedupe(cacheKey, () => this.fetchAndScore(filter))
    );

    let results = result.data as ScannerResult[];

    // Apply filters
    if (filter.sector) {
      results = results.filter(r => r.sector === filter.sector);
    }
    if (filter.minMarketCap) {
      results = results.filter(r => (r.marketCap || 0) >= filter.minMarketCap!);
    }
    if (filter.minScore) {
      results = results.filter(r => r.score >= filter.minScore!);
    }
    if (filter.signals) {
      results = results.filter(r => filter.signals!.some(s => r.signals.includes(s)));
    }
    if (filter.limit) {
      results = results.slice(0, filter.limit);
    }

    return results;
  }

  /**
   * Fetch raw data and score symbols.
   */
  private async fetchAndScore(filter: ScannerFilter): Promise<ScannerResult[]> {
    const providerIds = Array.from(this.providers.keys());
    const primaryId = this.router.select(providerIds, this.policy.priority);

    if (!primaryId) {
      throw new Error('No healthy scanner provider available');
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
            if (config.provider instanceof FMPProvider) {
              return await this.fetchFMPScanner(id, config.provider, filter);
            }
            if (config.provider instanceof PolygonProvider) {
              return await this.fetchPolygonScanner(id, config.provider, filter);
            }
            return [];
          },
          { maxAttempts: 2, baseDelayMs: 150, maxDelayMs: 800 },
        );

        this.health.recordSuccess(id);
        return this.scoreAndRank(raw.value);
      } catch (e) {
        lastError = e as Error;
        this.health.recordFailure(id, e);
      }
    }

    throw lastError || new Error('All scanner providers failed');
  }

  private async fetchFMPScanner(providerId: string, provider: FMPProvider, _filter: ScannerFilter): Promise<any[]> {
    // FMP doesn't have a direct screener in free tier
    // We fetch quotes for major symbols and calculate scores
    const symbols = ['AAPL', 'MSFT', 'GOOGL', 'AMZN', 'TSLA', 'META', 'NVDA', 'AMD', 'NFLX', 'SPY', 'QQQ'];
    const results: any[] = [];

    for (const symbol of symbols) {
      try {
        this.router.recordUsage(
          providerId,
          costUnits({ domain: 'scanner', provider: providerId.split('_')[0], endpoint: 'fetchQuote' }),
        );
        const quote = await provider.fetchQuote(symbol);
        results.push(quote);
      } catch {
        // Skip failed symbols
      }
    }

    return results;
  }

  private async fetchPolygonScanner(providerId: string, provider: PolygonProvider, _filter: ScannerFilter): Promise<any[]> {
    // Polygon aggregates for major symbols
    const symbols = ['AAPL', 'MSFT', 'GOOGL', 'TSLA', 'NVDA'];
    const results: any[] = [];

    for (const symbol of symbols) {
      try {
        this.router.recordUsage(
          providerId,
          costUnits({ domain: 'scanner', provider: providerId.split('_')[0], endpoint: 'fetchAggregates' }),
        );
        const agg = await provider.fetchAggregates(symbol, 1, 'day');
        if (agg.results && agg.results.length > 0) {
          results.push({ symbol, ...agg.results[agg.results.length - 1] });
        }
      } catch {
        // Skip failed symbols
      }
    }

    return results;
  }

  /**
   * Score and rank raw data into ScannerResult[].
   */
  private scoreAndRank(raw: any[]): ScannerResult[] {
    const scored = raw.map((item) => {
      const symbol = item.symbol || 'UNKNOWN';
      const price = item.price || item.c || item.close || 0;
      const change = item.change || 0;
      const changePercent = item.changesPercentage || ((change / (price - change)) * 100) || 0;
      const volume = item.volume || item.v || 0;
      const marketCap = item.marketCap || 0;

      // Calculate signals
      const signals: string[] = [];
      if (Math.abs(changePercent) > 5) signals.push('High volatility');
      if (volume > 10000000) signals.push('Volume spike');
      if (changePercent > 2) signals.push('Bullish momentum');
      if (changePercent < -2) signals.push('Bearish momentum');

      // Composite score (0-100)
      let score = 50;
      score += Math.min(25, Math.abs(changePercent) * 3);  // Volatility
      score += Math.min(15, Math.log10(volume + 1) / 2);   // Volume
      if (marketCap > 100000000000) score += 10;            // Large cap

      // Determine trend
      let trend: ScannerResult['trend'] = 'neutral';
      if (changePercent > 5) trend = 'strong_up';
      else if (changePercent > 2) trend = 'up';
      else if (changePercent < -5) trend = 'strong_down';
      else if (changePercent < -2) trend = 'down';

      return {
        symbol,
        name: item.name,
        score: Math.min(100, Math.max(0, score)),
        rank: 0,  // Set after sorting
        signals,
        metrics: [
          { name: 'Price', value: price, unit: 'USD' },
          { name: 'Change', value: changePercent, unit: '%' },
          { name: 'Volume', value: volume },
          { name: 'Market Cap', value: marketCap, unit: 'USD' }
        ],
        trend,
        sector: item.sector,
        marketCap
      };
    });

    // Sort by score descending and assign ranks
    scored.sort((a, b) => b.score - a.score);
    scored.forEach((s, i) => { s.rank = i + 1; });

    return scored;
  }
}
