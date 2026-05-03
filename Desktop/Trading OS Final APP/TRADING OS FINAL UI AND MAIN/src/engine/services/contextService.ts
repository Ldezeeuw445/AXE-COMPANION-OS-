import { CacheEngine } from '../core/cache';
import { InflightDeduper } from '../core/dedupe';
import { Normalizer } from '../core/normalize';
import { SourceRouter } from '../core/router';
import { ProviderHealthTracker } from '../core/health';
import { DEFAULT_POLICIES } from '../core/policies';
import type { SourcePolicy } from '../core/policies';
import { withRetry } from '../core/retry';
import { costUnits } from '../core/cost';
import type {
  AnalystConsensusData,
  AnalystActionType,
  RelativePerformanceData,
  KeyLevelsData,
  SentimentShortData,
} from '../types/context';
import { FMPProvider } from '../providers/fmp';

export interface ContextProviderConfig {
  id: string;
  provider: FMPProvider;
  weight: number;
  monthlyLimit: number;
  dailyLimit: number;
  avgLatencyMs: number;
  dataQuality: number;
  costPerCall?: number;
}

export class ContextService {
  private cache: CacheEngine;
  private deduper: InflightDeduper;
  private router: SourceRouter;
  private health: ProviderHealthTracker;
  private providers: Map<string, ContextProviderConfig>;
  private policy: SourcePolicy;

  constructor(
    cache: CacheEngine,
    deduper: InflightDeduper,
    router: SourceRouter,
    health: ProviderHealthTracker,
    configs: ContextProviderConfig[],
  ) {
    this.cache = cache;
    this.deduper = deduper;
    this.router = router;
    this.health = health;
    this.providers = new Map(configs.map((c) => [c.id, c]));
    this.policy = DEFAULT_POLICIES.news;

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

  async getAnalystConsensus(symbol: string): Promise<AnalystConsensusData | null> {
    const sym = Normalizer.symbol(symbol);
    const cacheKey = Normalizer.cacheKey('context_analyst', { sym });
    const result = await this.cache.getOrFetch(
      cacheKey,
      300_000,
      true,
      () => this.deduper.dedupe(cacheKey, () => this.fetchAnalystConsensus(sym)),
    );
    return (result.data as AnalystConsensusData | null) ?? null;
  }

  async getRelativePerformance(symbol: string): Promise<RelativePerformanceData | null> {
    const sym = Normalizer.symbol(symbol);
    const cacheKey = Normalizer.cacheKey('context_peers', { sym });
    const result = await this.cache.getOrFetch(
      cacheKey,
      120_000,
      true,
      () => this.deduper.dedupe(cacheKey, () => this.fetchRelativePerformance(sym)),
    );
    return (result.data as RelativePerformanceData | null) ?? null;
  }

  async getKeyLevels(symbol: string): Promise<KeyLevelsData | null> {
    const sym = Normalizer.symbol(symbol);
    const cacheKey = Normalizer.cacheKey('context_levels', { sym });
    const result = await this.cache.getOrFetch(
      cacheKey,
      120_000,
      true,
      () => this.deduper.dedupe(cacheKey, () => this.fetchKeyLevels(sym)),
    );
    return (result.data as KeyLevelsData | null) ?? null;
  }

  async getSentimentShort(symbol: string): Promise<SentimentShortData | null> {
    const sym = Normalizer.symbol(symbol);
    const cacheKey = Normalizer.cacheKey('context_sentiment', { sym });
    const result = await this.cache.getOrFetch(
      cacheKey,
      300_000,
      true,
      () => this.deduper.dedupe(cacheKey, () => this.fetchSentimentShort(sym)),
    );
    return (result.data as SentimentShortData | null) ?? null;
  }

  private selectChain(): { chain: string[]; primaryId: string } {
    const providerIds = Array.from(this.providers.keys());
    const primaryId = this.router.select(providerIds, this.policy.priority);
    if (!primaryId) throw new Error('No healthy context provider available');
    const chain = this.router.buildFallbackChain(primaryId, providerIds, this.policy.fallback);
    return { chain, primaryId };
  }

  private mapAction(action: string, row: any): AnalystActionType {
    const a = String(action || '').toLowerCase();
    if (a.includes('upgrade')) return 'upgrade';
    if (a.includes('downgrade')) return 'downgrade';
    if (a.includes('init')) return 'initiate';
    if (a.includes('raise')) return 'target_raised';
    if (a.includes('lower')) return 'target_lowered';
    if (row?.priceTarget != null || row?.previousPriceTarget != null) return 'reiterate';
    return 'reiterate';
  }

  private async fetchAnalystConsensus(symbol: string): Promise<AnalystConsensusData | null> {
    const { chain, primaryId } = this.selectChain();
    let lastError: Error | null = null;

    for (const id of chain) {
      const config = this.providers.get(id);
      if (!config) continue;
      try {
        if (id !== primaryId) this.router.recordFallbackUsed();
        const { value: [targets, recs, quote, upgrades] } = await withRetry(
          async () => {
            this.router.recordUsage(id, costUnits({ domain: 'news', provider: 'fmp', endpoint: 'fetchQuote' }));
            return await Promise.all([
              config.provider.fetchAnalystTargets(symbol),
              config.provider.fetchAnalystRecommendations(symbol),
              config.provider.fetchQuote(symbol).then((q) => [q]).catch(() => []),
              config.provider.fetchUpgradesDowngrades(symbol),
            ]);
          },
          { maxAttempts: 2, baseDelayMs: 150, maxDelayMs: 900 },
        );

        this.health.recordSuccess(id);

        const t = Array.isArray(targets) ? targets[0] : null;
        const r = Array.isArray(recs) ? recs[0] : null;
        const q = Array.isArray(quote) ? quote[0] : null;
        if (!t && !r) return null;

        const currentPrice = Number(q?.price ?? 0) || 0;

        const recentActions = (upgrades ?? []).slice(0, 12).map((u: any, i: number) => ({
          id: String(u.publishedDate ?? i) + String(u.newsPublisher ?? ''),
          firm: u.gradingCompany ?? u.analystCompany ?? 'Unknown',
          action: this.mapAction(u.action, u),
          fromRating: u.previousGrade ?? null,
          toRating: u.newGrade ?? null,
          fromTarget: u.priceWhenPosted ?? null,
          toTarget: u.priceTarget ?? null,
          publishedAt: u.publishedDate ? Date.parse(u.publishedDate) : Date.now(),
          url: u.newsURL ?? null,
        }));

        return {
          symbol,
          currentPrice,
          target: {
            average: Number(t?.targetConsensus ?? 0) || 0,
            low: Number(t?.targetLow ?? 0) || 0,
            high: Number(t?.targetHigh ?? 0) || 0,
            median: t?.targetMedian != null ? Number(t.targetMedian) : undefined,
            numberOfAnalysts: Number(t?.numberOfAnalysts ?? 0) || 0,
          },
          ratings: {
            strongBuy: Number(r?.analystRatingsStrongBuy ?? 0) || 0,
            buy: Number(r?.analystRatingsbuy ?? r?.analystRatingsBuy ?? 0) || 0,
            hold: Number(r?.analystRatingsHold ?? 0) || 0,
            sell: Number(r?.analystRatingsSell ?? 0) || 0,
            strongSell: Number(r?.analystRatingsStrongSell ?? 0) || 0,
          },
          recentActions,
        };
      } catch (e) {
        lastError = e as Error;
        this.health.recordFailure(id, e);
      }
    }

    if (lastError) throw lastError;
    return null;
  }

  private async fetchRelativePerformance(symbol: string): Promise<RelativePerformanceData | null> {
    const { chain, primaryId } = this.selectChain();
    let lastError: Error | null = null;

    for (const id of chain) {
      const config = this.providers.get(id);
      if (!config) continue;
      try {
        if (id !== primaryId) this.router.recordFallbackUsed();
        const peersRes = await withRetry(
          async () => {
            this.router.recordUsage(id, costUnits({ domain: 'news', provider: 'fmp', endpoint: 'fetchQuote' }));
            return await config.provider.fetchStockPeers(symbol);
          },
          { maxAttempts: 2, baseDelayMs: 150, maxDelayMs: 900 },
        );
        this.health.recordSuccess(id);

        const peersArr = (peersRes?.value?.[0]?.peersList ?? []).slice(0, 6);
        const tickers = [symbol, ...peersArr, 'SPY'];

        const quotes = await config.provider.fetchQuote(tickers.join(',')).catch(async () => {
          // fallback: try multiple quotes by calling v3 /quote with comma list (same endpoint supports list)
          const url = `https://financialmodelingprep.com/api/v3/quote/${tickers.join(',')}?apikey=${(config.provider as any).apiKey ?? ''}`;
          const res = await fetch(url);
          if (!res.ok) return [];
          return res.json();
        });

        const quoteList = Array.isArray(quotes) ? quotes : [];
        if (!quoteList.length) return null;
        const byTicker: Record<string, any> = Object.fromEntries(quoteList.map((q: any) => [q.symbol, q]));
        const selected = byTicker[symbol];
        const benchQ = byTicker['SPY'];

        const peers = peersArr
          .map((p: string) => byTicker[p])
          .filter(Boolean)
          .map((q: any) => ({
            symbol: q.symbol,
            name: q.name ?? q.symbol,
            changePercent: q.changesPercentage ?? 0,
            price: q.price ?? 0,
          }));

        const sectorAverage = peers.length
          ? peers.reduce((sum: number, p: any) => sum + (p.changePercent || 0), 0) / peers.length
          : undefined;

        return {
          symbol,
          sectorName: selected?.sector ?? undefined,
          benchmark: benchQ ? { symbol: benchQ.symbol, changePercent: benchQ.changesPercentage ?? 0 } : undefined,
          sectorAverage,
          peers: [
            {
              symbol,
              name: selected?.name ?? symbol,
              changePercent: selected?.changesPercentage ?? 0,
              price: selected?.price ?? 0,
              isSelected: true,
            },
            ...peers,
          ],
        };
      } catch (e) {
        lastError = e as Error;
        this.health.recordFailure(id, e);
      }
    }

    if (lastError) throw lastError;
    return null;
  }

  private async fetchKeyLevels(symbol: string): Promise<KeyLevelsData | null> {
    const { chain, primaryId } = this.selectChain();
    let lastError: Error | null = null;

    for (const id of chain) {
      const config = this.providers.get(id);
      if (!config) continue;
      try {
        if (id !== primaryId) this.router.recordFallbackUsed();
        const { value: [quoteArr, rsi, sma20, sma50, sma200, hist] } = await withRetry(
          async () => {
            this.router.recordUsage(id, costUnits({ domain: 'news', provider: 'fmp', endpoint: 'fetchQuote' }));
            return await Promise.all([
              config.provider.fetchQuote(symbol).then((q) => [q]).catch(() => []),
              config.provider.fetchTechnical(symbol, 'rsi', 14).catch(() => []),
              config.provider.fetchTechnical(symbol, 'sma', 20).catch(() => []),
              config.provider.fetchTechnical(symbol, 'sma', 50).catch(() => []),
              config.provider.fetchTechnical(symbol, 'sma', 200).catch(() => []),
              config.provider.fetchHistoricalLine(symbol).catch(() => ({ historical: [] })),
            ]);
          },
          { maxAttempts: 2, baseDelayMs: 150, maxDelayMs: 900 },
        );
        this.health.recordSuccess(id);

        const q = Array.isArray(quoteArr) ? quoteArr[0] : null;
        if (!q) return null;
        const price = Number(q.price ?? 0) || 0;
        const hi52 = q.yearHigh != null ? Number(q.yearHigh) : 0;
        const lo52 = q.yearLow != null ? Number(q.yearLow) : 0;

        const historical = (hist as any)?.historical ?? [];
        const ath = Array.isArray(historical)
          ? historical.reduce((m: number, row: any) => Math.max(m, Number(row.close ?? row.price ?? 0) || 0), 0) || undefined
          : undefined;

        const ma = (res: any[], period: number) => {
          const row = Array.isArray(res) ? res[0] : null;
          if (!row) return null;
          const value = Number(row.sma ?? row.value ?? 0) || 0;
          if (!value) return null;
          return { period, value, distancePercent: price ? ((price - value) / value) * 100 : 0 };
        };

        const mas = [ma(sma20 as any, 20), ma(sma50 as any, 50), ma(sma200 as any, 200)].filter(Boolean) as any[];
        const rsiRow = Array.isArray(rsi) ? rsi[0] : null;
        const rsiVal = rsiRow?.rsi != null ? Number(rsiRow.rsi) : null;

        const indicators: any[] = [];
        if (rsiVal != null) {
          indicators.push({
            name: 'RSI-14',
            value: rsiVal,
            signal: rsiVal >= 70 ? 'overbought' : rsiVal <= 30 ? 'oversold' : 'neutral',
          });
        }

        const levels: any[] = [];
        if (hi52) {
          levels.push({ kind: 'resistance', label: '52W high', price: hi52, distancePercent: price ? ((hi52 - price) / price) * 100 : undefined });
        }
        mas.forEach((m) => {
          levels.push({
            kind: price >= m.value ? 'support' : 'resistance',
            label: `${m.period}MA`,
            price: m.value,
            distancePercent: price ? ((m.value - price) / price) * 100 : undefined,
          });
        });
        if (lo52) {
          levels.push({ kind: 'support', label: '52W low', price: lo52, distancePercent: price ? ((lo52 - price) / price) * 100 : undefined });
        }

        return {
          symbol,
          currentPrice: price,
          week52Low: lo52,
          week52High: hi52,
          ath,
          drawdownFromAth: ath && price ? ((price - ath) / ath) * 100 : undefined,
          movingAverages: mas,
          indicators,
          levels,
        };
      } catch (e) {
        lastError = e as Error;
        this.health.recordFailure(id, e);
      }
    }

    if (lastError) throw lastError;
    return null;
  }

  private async fetchSentimentShort(symbol: string): Promise<SentimentShortData | null> {
    // Minimal “non-stub” implementation: derive from FMP profile + recent news sentiment score
    // without introducing new providers yet.
    const { chain, primaryId } = this.selectChain();
    let lastError: Error | null = null;

    for (const id of chain) {
      const config = this.providers.get(id);
      if (!config) continue;
      try {
        if (id !== primaryId) this.router.recordFallbackUsed();

        const { value: [profile, news] } = await withRetry(
          async () => {
            this.router.recordUsage(id, costUnits({ domain: 'news', provider: 'fmp', endpoint: 'fetchProfile' as any }));
            return await Promise.all([
              config.provider.fetchProfile(symbol).catch(() => null),
              config.provider.fetchNews(symbol, 30).catch(() => []),
            ]);
          },
          { maxAttempts: 2, baseDelayMs: 150, maxDelayMs: 900 },
        );
        this.health.recordSuccess(id);

        const shortPercent = profile && typeof profile.shortPercentFloat === 'number' ? profile.shortPercentFloat : undefined;
        const shortShares = profile && typeof profile.sharesShort === 'number' ? profile.sharesShort : undefined;

        // crude sentiment from titles
        const items = Array.isArray(news) ? news : [];
        const bullishWords = ['surge', 'rally', 'gain', 'beat', 'strong', 'breakout', 'upgrade'];
        const bearishWords = ['drop', 'fall', 'miss', 'weak', 'downgrade', 'crash', 'selloff'];
        let bull = 0, bear = 0, neutral = 0;
        for (const n of items) {
          const t = String(n.title ?? n.headline ?? '').toLowerCase();
          const b1 = bullishWords.some((w) => t.includes(w));
          const b2 = bearishWords.some((w) => t.includes(w));
          if (b1 && !b2) bull += 1;
          else if (b2 && !b1) bear += 1;
          else neutral += 1;
        }
        const total = bull + bear + neutral || 1;
        const score = (bull - bear) / total;

        const squeezeScore =
          shortPercent != null
            ? Math.max(0, Math.min(100, Math.round(shortPercent * 2)))
            : undefined;

        return {
          symbol,
          squeezeScore,
          shortInterest: {
            shortPercentOfFloat: shortPercent,
            shortSharesOutstanding: shortShares,
          },
          newsSentiment: {
            score,
            bullishCount: bull,
            bearishCount: bear,
            neutralCount: neutral,
            windowHours: 24,
          },
        };
      } catch (e) {
        lastError = e as Error;
        this.health.recordFailure(id, e);
      }
    }

    if (lastError) throw lastError;
    return null;
  }
}

