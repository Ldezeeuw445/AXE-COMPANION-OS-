/**
 * engine/services/chartService.ts
 * ===============================
 * Chart service — fetches OHLC candles from multiple providers.
 *
 * Order: Polygon → Twelve Data → FMP → optional Yahoo (only when `EngineConfig.enableYahooChartFallback` is true).
 * Per-provider symbols (e.g. XAUUSD → C:XAUUSD, XAU/USD) via chartSymbolRouting.
 */

import { CacheEngine } from '../core/cache';
import { InflightDeduper } from '../core/dedupe';
import { Normalizer } from '../core/normalize';
import { SourceRouter } from '../core/router';
import { ProviderHealthTracker } from '../core/health';
import type { SourcePolicy } from '../core/policies';
import { DEFAULT_POLICIES } from '../core/policies';
import type { ChartData, Candle, ChartFetchDebugMeta } from '../types/chart';
import { ChartFetchError } from '../types/chart';
import { PolygonProvider } from '../providers/polygon';
import { TwelveDataProvider } from '../providers/twelvedata';
import { YahooFinanceProvider } from '../providers/yahoo';
import { FMPProvider } from '../providers/fmp';
import { withRetry } from '../core/retry';
import { costUnits } from '../core/cost';
import { resolveChartSymbolRouting } from '../chartSymbolRouting';

export interface ChartCredentialFlags {
  polygon: boolean;
  twelvedata: boolean;
  fmp: boolean;
  /** Opt-in: Yahoo registered as last chart provider. */
  yahooChartFallbackEnabled: boolean;
}

export interface ChartProviderConfig {
  id: string;
  provider: PolygonProvider | TwelveDataProvider | YahooFinanceProvider | FMPProvider;
  weight: number;
  monthlyLimit: number;
  dailyLimit: number;
  avgLatencyMs: number;
  dataQuality: number;
  supportedTimeframes: string[];
  costPerCall?: number;
}

function sourceLabelFromProviderId(id: string): string {
  if (id.startsWith('chart_polygon')) return 'Polygon';
  if (id.startsWith('chart_twelvedata')) return 'TwelveData';
  if (id.startsWith('chart_fmp') || id.startsWith('fmp_chart')) return 'FMP';
  if (id.startsWith('yahoo')) return 'YahooFinance';
  return id;
}

export class ChartService {
  private cache: CacheEngine;
  private deduper: InflightDeduper;
  private router: SourceRouter;
  private health: ProviderHealthTracker;
  private providers: Map<string, ChartProviderConfig>;
  private policy: SourcePolicy;
  private chartCreds: ChartCredentialFlags;

  constructor(
    cache: CacheEngine,
    deduper: InflightDeduper,
    router: SourceRouter,
    health: ProviderHealthTracker,
    configs: ChartProviderConfig[],
    chartCreds?: ChartCredentialFlags,
  ) {
    this.cache = cache;
    this.deduper = deduper;
    this.router = router;
    this.health = health;
    this.providers = new Map(configs.map((c) => [c.id, c]));
    this.policy = DEFAULT_POLICIES.chart;
    this.chartCreds = chartCreds ?? {
      polygon: false,
      twelvedata: false,
      fmp: false,
      yahooChartFallbackEnabled: false,
    };

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

  async getChart(symbol: string, timeframe: string, limit?: number): Promise<ChartData> {
    const normSymbol = Normalizer.symbol(symbol);
    const normTf = Normalizer.timeframe(timeframe);
    const cacheKey = Normalizer.cacheKey('chart', { symbol: normSymbol, tf: normTf, limit });

    const result = await this.cache.getOrFetch(
      cacheKey,
      this.policy.cacheTtlMs,
      this.policy.staleWhileRevalidate || false,
      () => this.deduper.dedupe(cacheKey, () => this.fetchFromProviders(normSymbol, normTf, limit)),
    );

    return result.data as ChartData;
  }

  /** Polygon → TwelveData → FMP → Yahoo. Legacy ids (fmp_chart_*) still tier correctly. */
  private sortChartProviderIds(ids: string[]): string[] {
    const tier = (id: string): number => {
      if (id.startsWith('chart_polygon') || id.startsWith('polygon_chart')) return 0;
      if (id.startsWith('chart_twelvedata') || id.startsWith('twelvedata_chart')) return 1;
      if (id.startsWith('chart_fmp') || id.startsWith('fmp_chart')) return 2;
      if (id.startsWith('yahoo')) return 3;
      return 9;
    };
    return [...ids].sort((a, b) => tier(a) - tier(b) || a.localeCompare(b));
  }

  private aggregateFromTo(timeframe: string, limit?: number): { from: string; to: string } {
    const to = new Date().toISOString().split('T')[0];
    const L = Math.max(5, limit ?? 100);
    let calDays: number;
    if (timeframe === '1D' || timeframe === '3D') {
      calDays = Math.min(3650, Math.ceil(L * 2.5));
    } else if (timeframe === '1W') {
      calDays = Math.min(3650, L * 14);
    } else if (timeframe === '1MO') {
      calDays = Math.min(3650, 40 * L);
    } else {
      calDays = Math.min(730, Math.max(7, Math.ceil(L / 8) + 14));
    }
    const from = new Date(Date.now() - calDays * 86400000).toISOString().split('T')[0];
    return { from, to };
  }

  private timeframeToYahoo(tf: string, limit?: number): [string, string] {
    const map: Record<string, [string, string]> = {
      '1M': ['1m', '1d'],
      '5M': ['5m', '5d'],
      '15M': ['15m', '5d'],
      '1H': ['1h', '1mo'],
      '4H': ['1h', '3mo'],
      '1D': ['1d', '6mo'],
      '1W': ['1wk', '1y'],
      '1MO': ['1mo', '5y'],
    };
    const base = map[tf] || ['1d', '1mo'];
    if (tf === '1D' && (limit ?? 0) >= 90) {
      return ['1d', '2y'];
    }
    return base;
  }

  private async fetchFromProviders(symbol: string, timeframe: string, limit?: number): Promise<ChartData> {
    const routing = resolveChartSymbolRouting(symbol);
    const notes: string[] = [];
    const debug: ChartFetchDebugMeta = {
      providersAttempted: [],
      providerErrors: {},
      configured: {
        polygon: this.chartCreds.polygon,
        twelvedata: this.chartCreds.twelvedata,
        fmp: this.chartCreds.fmp,
      },
      yahooChartFallbackEnabled: this.chartCreds.yahooChartFallbackEnabled,
      providerSymbol: {},
      finalProviderUsed: null,
      candleCount: 0,
      notes,
    };

    const capableProviders = Array.from(this.providers.entries())
      .filter(([, config]) => config.supportedTimeframes.includes(timeframe))
      .map(([id]) => id);

    if (capableProviders.length === 0) {
      throw new ChartFetchError(`No provider supports timeframe: ${timeframe}`, debug);
    }

    const sorted = this.sortChartProviderIds(capableProviders);
    const chain = sorted.filter((id) => {
      if (id.startsWith('yahoo')) {
        const ok = this.health.isHealthy(id);
        if (!ok) notes.push(`yahoo_skipped_unhealthy:${id}`);
        return ok;
      }
      return true;
    });

    if (chain.length === 0) {
      notes.push('no_healthy_chart_provider_for_timeframe');
      throw new ChartFetchError('No healthy chart provider available', debug);
    }

    let lastError: Error | null = null;
    let sawYahoo429 = false;

    for (let i = 0; i < chain.length; i++) {
      const id = chain[i];
      const config = this.providers.get(id);
      if (!config) continue;

      debug.providersAttempted.push(id);

      const runOne = async (): Promise<{ raw: unknown; symUsed: string }> => {
        const providerKind = id.split('_')[0];
        if (config.provider instanceof PolygonProvider) {
          this.router.recordUsage(id, costUnits({ domain: 'chart', provider: providerKind, endpoint: 'fetchAggregates' }));
          const multiplier = this.timeframeToMultiplier(timeframe);
          const timespan = this.timeframeToTimespan(timeframe);
          const { from, to } = this.aggregateFromTo(timeframe, limit);
          const raw = await config.provider.fetchAggregates(routing.polygon, multiplier, timespan, from, to);
          return { raw, symUsed: routing.polygon };
        }
        if (config.provider instanceof TwelveDataProvider) {
          this.router.recordUsage(id, costUnits({ domain: 'chart', provider: providerKind, endpoint: 'fetchTimeSeries' }));
          const interval = this.timeframeToTwelveDataInterval(timeframe);
          const raw = await config.provider.fetchTimeSeries(routing.twelvedata, interval, limit || 100);
          return { raw, symUsed: routing.twelvedata };
        }
        if (config.provider instanceof FMPProvider) {
          this.router.recordUsage(id, costUnits({ domain: 'chart', provider: 'fmp', endpoint: 'fetchHistoricalLine' }));
          let lastInner: unknown = null;
          for (const fmpSym of routing.fmp) {
            try {
              const raw = await config.provider.fetchHistoricalLine(fmpSym);
              return { raw, symUsed: fmpSym };
            } catch (ie) {
              lastInner = ie;
            }
          }
          throw lastInner instanceof Error ? lastInner : new Error(String(lastInner));
        }
        if (config.provider instanceof YahooFinanceProvider) {
          this.router.recordUsage(id, costUnits({ domain: 'chart', provider: 'yahoo', endpoint: 'fetchYahooChart' }));
          const [interval, range] = this.timeframeToYahoo(timeframe, limit);
          const raw = await config.provider.fetchChart(routing.yahoo, interval, range);
          return { raw, symUsed: routing.yahoo };
        }
        throw new Error('Unsupported chart provider');
      };

      try {
        if (i > 0) this.router.recordFallbackUsed();
        const { value: pack } = await withRetry(async () => runOne(), {
          maxAttempts: 2,
          baseDelayMs: 150,
          maxDelayMs: 900,
        });
        const { raw, symUsed } = pack;
        debug.providerSymbol[id] = symUsed;

        const displaySource = sourceLabelFromProviderId(id);
        const chart = this.normalizeChart(symbol, timeframe, raw, displaySource, limit);
        if (chart.candles.length === 0) {
          throw new Error('empty_candles_after_normalize');
        }

        this.health.recordSuccess(id);
        chart.debug = {
          ...debug,
          finalProviderUsed: id,
          candleCount: chart.candles.length,
          providerSymbol: { ...debug.providerSymbol, [id]: symUsed },
        };
        return chart;
      } catch (e) {
        const err = e instanceof Error ? e : new Error(String(e));
        lastError = err;
        const msg = err.message;
        debug.providerErrors[id] = msg;
        if (id.startsWith('yahoo') && /\b429\b/.test(msg)) {
          sawYahoo429 = true;
        }
        this.health.recordFailure(id, e);
      }
    }

    const priorConfigured =
      this.chartCreds.polygon || this.chartCreds.twelvedata || this.chartCreds.fmp;
    if (sawYahoo429 && priorConfigured) {
      throw new ChartFetchError(
        'yahoo_429_after_configured_providers_failed',
        { ...debug, finalProviderUsed: null, candleCount: 0, notes },
      );
    }

    if (lastError instanceof ChartFetchError) throw lastError;
    throw new ChartFetchError(lastError?.message ?? 'chart_all_providers_failed', {
      ...debug,
      finalProviderUsed: null,
      candleCount: 0,
      notes,
    });
  }

  private normalizeChart(symbol: string, timeframe: string, raw: any, sourceName: string, limit?: number): ChartData {
    let candles: Candle[] = [];

    if (raw.results) {
      candles = raw.results.map((r: any) => ({
        time: new Date(r.t).toISOString(),
        open: r.o,
        high: r.h,
        low: r.l,
        close: r.c,
        volume: r.v,
      }));
    } else if (raw.values) {
      candles = raw.values
        .map((v: any) => ({
          time: v.datetime,
          open: parseFloat(v.open),
          high: parseFloat(v.high),
          low: parseFloat(v.low),
          close: parseFloat(v.close),
          volume: Number(v.volume) || 0,
        }))
        .reverse();
    } else if (Array.isArray(raw?.historical)) {
      const hist = raw.historical as any[];
      candles = [...hist]
        .reverse()
        .map((h: any) => ({
          time: String(h.date ?? h.formattedDate ?? '').includes('T')
            ? String(h.date)
            : `${String(h.date ?? '')}T00:00:00.000Z`,
          open: Number(h.open ?? h.adjOpen ?? 0),
          high: Number(h.high ?? h.adjHigh ?? 0),
          low: Number(h.low ?? h.adjLow ?? 0),
          close: Number(h.close ?? h.adjClose ?? 0),
          volume: Number(h.volume ?? 0),
        }))
        .filter((c) => Number.isFinite(c.close) && c.time);
    } else if (Array.isArray(raw)) {
      candles = [...raw]
        .reverse()
        .map((h: any) => ({
          time: String(h.date ?? h.formattedDate ?? '').includes('T')
            ? String(h.date)
            : `${String(h.date ?? '')}T00:00:00.000Z`,
          open: Number(h.open ?? h.adjOpen ?? 0),
          high: Number(h.high ?? h.adjHigh ?? 0),
          low: Number(h.low ?? h.adjLow ?? 0),
          close: Number(h.close ?? h.adjClose ?? 0),
          volume: Number(h.volume ?? 0),
        }))
        .filter((c) => Number.isFinite(c.close) && c.time);
    } else if (raw.timestamp && raw.indicators?.quote?.[0]) {
      const q = raw.indicators.quote[0];
      candles = raw.timestamp
        .map((t: number, i: number) => ({
          time: new Date(t * 1000).toISOString(),
          open: q.open[i],
          high: q.high[i],
          low: q.low[i],
          close: q.close[i],
          volume: raw.indicators.volume?.[0]?.[i] || 0,
        }))
        .filter((c: Candle) => c.close !== null);
    }

    const cap = typeof limit === 'number' && limit > 0 ? limit : candles.length;
    if (candles.length > cap) {
      candles = candles.slice(-cap);
    }

    const indicators: Record<string, number[]> = {};
    if (candles.length >= 14) {
      indicators.sma20 = this.calculateSMA(
        candles.map((c) => c.close),
        20,
      );
      indicators.rsi = this.calculateRSI(
        candles.map((c) => c.close),
        14,
      );
    }

    return {
      symbol,
      timeframe,
      candles,
      indicators,
      source: sourceName.replace('Provider', ''),
    };
  }

  private timeframeToMultiplier(tf: string): number {
    const map: Record<string, number> = { '1M': 1, '5M': 5, '15M': 15, '30M': 30, '1H': 1, '4H': 4, '1D': 1 };
    return map[tf] || 1;
  }

  private timeframeToTimespan(tf: string): string {
    if (tf.endsWith('M')) return 'minute';
    if (tf.endsWith('H')) return 'hour';
    if (tf === '1D' || tf === '3D') return 'day';
    if (tf === '1W') return 'week';
    if (tf === '1MO') return 'month';
    return 'day';
  }

  private timeframeToTwelveDataInterval(tf: string): string {
    const map: Record<string, string> = {
      '1M': '1min',
      '5M': '5min',
      '15M': '15min',
      '30M': '30min',
      '1H': '1h',
      '2H': '2h',
      '4H': '4h',
      '1D': '1day',
      '1W': '1week',
      '1MO': '1month',
    };
    return map[tf] || '1day';
  }

  private calculateSMA(values: number[], period: number): number[] {
    const result: number[] = [];
    for (let i = 0; i < values.length; i++) {
      if (i < period - 1) {
        result.push(NaN);
        continue;
      }
      const sum = values.slice(i - period + 1, i + 1).reduce((a, b) => a + b, 0);
      result.push(sum / period);
    }
    return result;
  }

  private calculateRSI(values: number[], period: number = 14): number[] {
    const result: number[] = [];
    let gains = 0,
      losses = 0;

    for (let i = 1; i <= period; i++) {
      const change = values[i] - values[i - 1];
      if (change > 0) gains += change;
      else losses -= change;
    }

    let avgGain = gains / period;
    let avgLoss = losses / period;

    for (let i = 0; i < values.length; i++) {
      if (i < period) {
        result.push(NaN);
        continue;
      }
      const rs = avgGain / (avgLoss || 1);
      result.push(100 - 100 / (1 + rs));

      if (i < values.length - 1) {
        const change = values[i + 1] - values[i];
        const gain = change > 0 ? change : 0;
        const loss = change < 0 ? -change : 0;
        avgGain = (avgGain * (period - 1) + gain) / period;
        avgLoss = (avgLoss * (period - 1) + loss) / period;
      }
    }
    return result;
  }
}
