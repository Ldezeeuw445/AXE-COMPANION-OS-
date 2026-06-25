/**
 * engine/services/newsService.ts
 * ==============================
 * News service — chooses provider, fallback, cache, normalize.
 * 
 * Flow:
 *   1. Normalize input (symbol uppercase)
 *   2. Check cache
 *   3. Select best provider (FMP → Financial Juice)
 *   4. Fetch with failover
 *   5. Normalize to NewsItem[]
 *   6. Deduplicate by URL
 *   7. Enrich (sentiment, importance)
 *   8. Return fixed shape
 */

import { CacheEngine } from '../core/cache';
import { InflightDeduper } from '../core/dedupe';
import { Normalizer } from '../core/normalize';
import { SourceRouter } from '../core/router';
import { ProviderHealthTracker } from '../core/health';
import type { SourcePolicy } from '../core/policies';
import { DEFAULT_POLICIES } from '../core/policies';
import type { NewsItem, NewsFilter } from '../types/news';
import { FMPProvider } from '../providers/fmp';
import { withRetry } from '../core/retry';
import { costUnits } from '../core/cost';

export interface NewsProviderConfig {
  id: string;
  provider: FMPProvider | any;  // Extend with other news providers
  weight: number;
  monthlyLimit: number;
  dailyLimit: number;
  avgLatencyMs: number;
  dataQuality: number;
  costPerCall?: number;
}

export class NewsService {
  private cache: CacheEngine;
  private deduper: InflightDeduper;
  private router: SourceRouter;
  private health: ProviderHealthTracker;
  private providers: Map<string, NewsProviderConfig>;
  private policy: SourcePolicy;

  constructor(
    cache: CacheEngine,
    deduper: InflightDeduper,
    router: SourceRouter,
    health: ProviderHealthTracker,
    configs: NewsProviderConfig[]
  ) {
    this.cache = cache;
    this.deduper = deduper;
    this.router = router;
    this.health = health;
    this.providers = new Map(configs.map(c => [c.id, c]));
    this.policy = DEFAULT_POLICIES.news;

    // Register providers with router
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
   * Get news — the ONLY function the UI calls for news.
   */
  async getNews(filter: NewsFilter = {}): Promise<NewsItem[]> {
    const symbol = filter.symbol ? Normalizer.symbol(filter.symbol) : undefined;
    const cacheKey = Normalizer.cacheKey('news', { symbol, category: filter.category, limit: filter.limit });

    // 1. Cache check + inflight dedupe
    const result = await this.cache.getOrFetch(
      cacheKey,
      this.policy.cacheTtlMs,
      this.policy.staleWhileRevalidate || false,
      () => this.deduper.dedupe(cacheKey, () => this.fetchFromProviders(symbol, filter))
    );

    // 2. Filter & enrich
    let items = result.data as NewsItem[];

    if (filter.sentiment) {
      items = items.filter(n => n.sentiment === filter.sentiment);
    }
    if (filter.minImportance) {
      items = items.filter(n => (n.importance || 0) >= filter.minImportance!);
    }
    if (filter.limit) {
      items = items.slice(0, filter.limit);
    }

    return items;
  }

  /**
   * Fetch from providers with failover.
   */
  private async fetchFromProviders(symbol?: string, filter?: NewsFilter): Promise<NewsItem[]> {
    const providerIds = Array.from(this.providers.keys());
    const primaryId = this.router.select(providerIds, this.policy.priority);

    if (!primaryId) {
      throw new Error('No healthy news provider available');
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
            this.router.recordUsage(id, costUnits({ domain: 'news', provider: id.split('_')[0], endpoint: 'fetchNews' }));
            return await config.provider.fetchNews(symbol || 'AAPL', filter?.limit || 10);
          },
          { maxAttempts: 2, baseDelayMs: 150, maxDelayMs: 800 },
        );
        this.health.recordSuccess(id);

        // Normalize to NewsItem[]
        const items = this.normalizeNews(raw.value, symbol);
        return items;
      } catch (e) {
        lastError = e as Error;
        this.health.recordFailure(id, e);
      }
    }

    throw lastError || new Error('All news providers failed');
  }

  /**
   * Normalize raw provider data to fixed NewsItem shape.
   */
  private normalizeNews(raw: any[], symbol?: string): NewsItem[] {
    const seen = new Set<string>();

    return raw
      .map((item: any, i: number) => {
        const id = item.url || item.link || `${item.source || 'unknown'}_${i}_${Date.now()}`;
        return {
          id,
          source: item.site || item.source || 'unknown',
          title: item.title || item.headline || 'Untitled',
          summary: item.text || item.summary || item.description || undefined,
          url: item.url || item.link || undefined,
          publishedAt: item.publishedDate || item.published_at || item.datetime || new Date().toISOString(),
          symbol: symbol || item.symbol || null,
          category: item.category || null,
          sentiment: this.inferSentiment(item),
          importance: this.calculateImportance(item)
        };
      })
      .filter(item => {
        // Deduplicate by URL
        if (seen.has(item.id)) return false;
        seen.add(item.id);
        return true;
      });
  }

  /**
   * Infer sentiment from title + summary.
   */
  private inferSentiment(item: any): 'bullish' | 'bearish' | 'neutral' | null {
    const text = `${item.title || ''} ${item.text || item.summary || ''}`.toLowerCase();
    const bullish = ['surge', 'rally', 'gain', 'bull', 'up', 'rise', 'growth', 'beat', 'strong', 'moon', 'breakout'];
    const bearish = ['drop', 'fall', 'bear', 'down', 'crash', 'loss', 'miss', 'weak', 'sell', 'dump', 'recession'];

    const bCount = bullish.filter(w => text.includes(w)).length;
    const beCount = bearish.filter(w => text.includes(w)).length;

    if (bCount > beCount) return 'bullish';
    if (beCount > bCount) return 'bearish';
    if (bCount > 0 || beCount > 0) return 'neutral';
    return null;
  }

  /**
   * Calculate importance score (0-10).
   */
  private calculateImportance(item: any): number {
    let score = 5;
    if (item.title?.length > 80) score += 1;
    if (item.text?.length > 500) score += 1;
    if (item.url?.includes('bloomberg') || item.url?.includes('reuters')) score += 2;
    return Math.min(10, score);
  }
}
