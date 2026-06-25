import { CacheEngine } from '../core/cache';
import { InflightDeduper } from '../core/dedupe';
import { Normalizer } from '../core/normalize';
import { SourceRouter } from '../core/router';
import { ProviderHealthTracker } from '../core/health';
import type { SourcePolicy } from '../core/policies';
import { DEFAULT_POLICIES } from '../core/policies';
import { withRetry } from '../core/retry';
import { costUnits } from '../core/cost';
import type { EarningsEvent, EarningsImpact } from '../types/earnings';
import { FMPProvider } from '../providers/fmp';

export interface EarningsProviderConfig {
  id: string;
  provider: FMPProvider;
  weight: number;
  monthlyLimit: number;
  dailyLimit: number;
  avgLatencyMs: number;
  dataQuality: number;
  costPerCall?: number;
}

export class EarningsService {
  private cache: CacheEngine;
  private deduper: InflightDeduper;
  private router: SourceRouter;
  private health: ProviderHealthTracker;
  private providers: Map<string, EarningsProviderConfig>;
  private policy: SourcePolicy;

  constructor(
    cache: CacheEngine,
    deduper: InflightDeduper,
    router: SourceRouter,
    health: ProviderHealthTracker,
    configs: EarningsProviderConfig[],
  ) {
    this.cache = cache;
    this.deduper = deduper;
    this.router = router;
    this.health = health;
    this.providers = new Map(configs.map((c) => [c.id, c]));
    this.policy = DEFAULT_POLICIES.earnings ?? DEFAULT_POLICIES.news;

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

  async getEarningsCalendar(from: string, to: string): Promise<EarningsEvent[]> {
    const f = String(from || '').slice(0, 10);
    const t = String(to || '').slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(f) || !/^\d{4}-\d{2}-\d{2}$/.test(t)) {
      throw new Error('invalid_earnings_date_range');
    }

    const cacheKey = Normalizer.cacheKey('earnings', { from: f, to: t });
    const result = await this.cache.getOrFetch(
      cacheKey,
      this.policy.cacheTtlMs,
      this.policy.staleWhileRevalidate || false,
      () => this.deduper.dedupe(cacheKey, () => this.fetchFromProviders(f, t)),
    );

    return result.data as EarningsEvent[];
  }

  private async fetchFromProviders(from: string, to: string): Promise<EarningsEvent[]> {
    const providerIds = Array.from(this.providers.keys());
    const primaryId = this.router.select(providerIds, this.policy.priority);
    if (!primaryId) throw new Error('No healthy earnings provider available');

    const chain = this.router.buildFallbackChain(primaryId, providerIds, this.policy.fallback);
    let lastError: Error | null = null;

    for (const id of chain) {
      const config = this.providers.get(id);
      if (!config) continue;
      try {
        if (id !== primaryId) this.router.recordFallbackUsed();
        const raw = await withRetry(
          async () => {
            this.router.recordUsage(id, costUnits({ domain: 'earnings', provider: id.split('_')[0], endpoint: 'fetchEarningsCalendar' }));
            return await config.provider.fetchEarningsCalendar(from, to);
          },
          { maxAttempts: 2, baseDelayMs: 150, maxDelayMs: 900 },
        );
        this.health.recordSuccess(id);
        return this.normalize(raw.value);
      } catch (e) {
        lastError = e as Error;
        this.health.recordFailure(id, e);
      }
    }

    throw lastError || new Error('All earnings providers failed');
  }

  private normalize(rows: any[]): EarningsEvent[] {
    return (rows ?? []).map((r: any) => {
      const ticker = String(r.symbol || r.ticker || '').toUpperCase();
      const date = String(r.date || r.earningsDate || r.fiscalDateEnding || '').slice(0, 10);
      const timeRaw = String(r.time || r.timeOfDay || '').toUpperCase();
      const time: EarningsEvent['time'] =
        timeRaw === 'BMO' || timeRaw === 'AMC' || timeRaw === 'DMT' ? timeRaw : 'TBD';

      const epsEstimate = r.epsEstimated ?? r.epsEstimate ?? null;
      const epsActual = r.eps ?? r.epsActual ?? null;
      const revEstimate = r.revenueEstimated ?? r.revenueEstimate ?? null;
      const revActual = r.revenue ?? r.revenueActual ?? null;

      const epsSurprise =
        typeof epsEstimate === 'number' && typeof epsActual === 'number' ? epsActual - epsEstimate : null;
      const revenueSurprise =
        typeof revEstimate === 'number' && typeof revActual === 'number' ? revActual - revEstimate : null;

      const impact: EarningsImpact =
        (r.impact as EarningsImpact) ||
        (typeof r.marketCap === 'number' && r.marketCap > 50e9 ? 'high' : typeof r.marketCap === 'number' && r.marketCap > 10e9 ? 'medium' : 'low');

      return {
        ticker,
        company: String(r.company || r.companyName || ticker),
        date,
        time,
        sector: String(r.sector || '—'),
        marketCap: typeof r.marketCap === 'number' ? r.marketCap : 0,
        epsEstimate: typeof epsEstimate === 'number' ? epsEstimate : null,
        revenueEstimate: typeof revEstimate === 'number' ? revEstimate : null,
        epsActual: typeof epsActual === 'number' ? epsActual : null,
        revenueActual: typeof revActual === 'number' ? revActual : null,
        epsSurprise,
        revenueSurprise,
        impact,
      };
    }).filter((e) => e.ticker && e.date);
  }
}

