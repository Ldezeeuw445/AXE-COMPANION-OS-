/**
 * engine/services/axeService.ts
 * =============================
 * Axe (AI assistant) service — combines Supabase memory + technical analysis.
 * 
 * Flow:
 *   1. Fetch memory from Supabase (user truth)
 *   2. Fetch chart data for technical analysis
 *   3. Calculate key levels, patterns, signals
 *   4. Merge with memory
 *   5. Return fixed AxeContext shape
 * 
 * Supabase = memory truth. Analysis = computed context.
 */

import { CacheEngine } from '../core/cache';
import { InflightDeduper } from '../core/dedupe';
import { Normalizer } from '../core/normalize';
import { SourceRouter } from '../core/router';
import { ProviderHealthTracker } from '../core/health';
import type { SourcePolicy } from '../core/policies';
import { DEFAULT_POLICIES } from '../core/policies';
import type { AxeContext, AxeMemoryItem, AxeStatus, KeyLevel, Pattern, Signal } from '../types/axe';
import { SupabaseProvider } from '../providers/supabase';
import { ChartService } from './chartService';

export interface AxeProviderConfig {
  id: string;
  provider: SupabaseProvider;
  weight: number;
}

export class AxeService {
  private cache: CacheEngine;
  private deduper: InflightDeduper;
  private health: ProviderHealthTracker;
  private providers: Map<string, AxeProviderConfig>;
  private policy: SourcePolicy;
  private chartService: ChartService;

  constructor(
    cache: CacheEngine,
    deduper: InflightDeduper,
    router: SourceRouter,
    health: ProviderHealthTracker,
    chartService: ChartService,
    configs: AxeProviderConfig[]
  ) {
    this.cache = cache;
    this.deduper = deduper;
    this.health = health;
    this.chartService = chartService;
    this.providers = new Map(configs.map(c => [c.id, c]));
    this.policy = DEFAULT_POLICIES.axe;

    for (const config of configs) {
      router.register({
        id: config.id,
        provider: 'supabase',
        weight: config.weight,
        monthlyLimit: Infinity,
        dailyLimit: 0,
        usedThisMonth: 0,
        usedToday: 0,
        avgLatencyMs: 50,
        dataQuality: 1.0
      });
    }
  }

  /**
   * Get Axe context for a symbol — the ONLY function the UI calls for Axe analysis.
   */
  async getContext(symbol: string, timeframe: string, userId: string): Promise<AxeContext> {
    const normSymbol = Normalizer.symbol(symbol);
    const normTf = Normalizer.timeframe(timeframe);
    const cacheKey = Normalizer.cacheKey('axe', { symbol: normSymbol, tf: normTf, userId });

    const result = await this.cache.getOrFetch(
      cacheKey,
      this.policy.cacheTtlMs,
      this.policy.staleWhileRevalidate || false,
      () => this.deduper.dedupe(cacheKey, () => this.buildContext(normSymbol, normTf, userId))
    );

    return result.data as AxeContext;
  }

  /**
   * Get Axe memory for user.
   */
  async getMemory(userId: string, symbol?: string): Promise<AxeMemoryItem[]> {
    const cacheKey = Normalizer.cacheKey('axe_memory', { userId, symbol });

    const result = await this.cache.getOrFetch(
      cacheKey,
      10000,  // 10 seconds
      false,
      () => this.deduper.dedupe(cacheKey, () => this.fetchMemory(userId, symbol))
    );

    return result.data as AxeMemoryItem[];
  }

  /**
   * Get Axe status (online, active symbols, pending alerts).
   */
  async getStatus(userId: string): Promise<AxeStatus> {
    const memory = await this.getMemory(userId);
    const pendingAlerts = memory.filter(m => m.type === 'alert' && !m.resolvedAt).length;
    const activeSymbols = [
      ...new Set(
        memory
          .map((m) => m.symbol)
          .filter((s): s is string => typeof s === 'string' && s.length > 0),
      ),
    ];

    return {
      isOnline: true,
      lastActivity: memory[0]?.createdAt || new Date().toISOString(),
      activeSymbols,
      pendingAlerts,
      memoryCount: memory.length
    };
  }

  // --- Private builders ---

  private async buildContext(symbol: string, timeframe: string, userId: string): Promise<AxeContext> {
    // 1. Fetch memory from Supabase
    const memory = await this.fetchMemory(userId, symbol);

    // 2. Fetch chart for technical analysis
    const chart = await this.chartService.getChart(symbol, timeframe);

    // 3. Calculate key levels
    const keyLevels = this.calculateKeyLevels(chart);

    // 4. Detect patterns
    const patterns = this.detectPatterns(chart);

    // 5. Generate signals
    const signals = this.generateSignals(chart, keyLevels);

    // 6. Determine bias
    const { bias, confidence } = this.calculateBias(signals, patterns);

    // 7. Build human-readable analysis
    const analysis = this.buildAnalysis(symbol, bias, confidence, signals, keyLevels, patterns);

    return {
      symbol,
      timeframe,
      bias,
      confidence,
      keyLevels,
      patterns,
      signals,
      memory,
      lastUpdated: new Date().toISOString(),
      analysis
    };
  }

  private async fetchMemory(userId: string, symbol?: string): Promise<AxeMemoryItem[]> {
    const config = this.providers.get('supabase_1');
    if (!config) throw new Error('No Supabase provider configured');

    try {
      const raw = await config.provider.fetchAxeMemory(userId, symbol);
      this.health.recordSuccess('supabase_1');

      return raw.map((m: any) => ({
        id: m.id,
        type: m.type || 'insight',
        content: m.content,
        symbol: m.symbol,
        createdAt: m.created_at,
        resolvedAt: m.resolved_at,
        priority: m.priority || 'medium'
      }));
    } catch (e) {
      this.health.recordFailure('supabase_1', e);
      throw e;
    }
  }

  // --- Technical Analysis ---

  private calculateKeyLevels(chart: any): KeyLevel[] {
    const candles = chart.candles;
    if (candles.length < 20) return [];

    const levels: KeyLevel[] = [];
    const closes = candles.map((c: any) => c.close);
    const highs = candles.map((c: any) => c.high);
    const lows = candles.map((c: any) => c.low);

    // Recent high/low
    const recentHigh = Math.max(...highs.slice(-20));
    const recentLow = Math.min(...lows.slice(-20));
    const current = closes[closes.length - 1];

    levels.push({ price: recentHigh, type: 'resistance', strength: 0.8 });
    levels.push({ price: recentLow, type: 'support', strength: 0.8 });

    // VWAP approximation
    const vwap = candles.slice(-20).reduce((sum: number, c: any) => sum + c.close, 0) / 20;
    levels.push({ price: vwap, type: 'vwap', strength: 0.6 });

    // Psychological levels
    const round = Math.round(current / 10) * 10;
    levels.push({ price: round, type: 'psychological', strength: 0.4 });

    // Fibonacci retracement from recent swing
    const fibLevels = [0.236, 0.382, 0.5, 0.618, 0.786];
    const range = recentHigh - recentLow;
    for (const fib of fibLevels) {
      levels.push({
        price: recentHigh - range * fib,
        type: 'fibonacci',
        strength: 0.5
      });
    }

    return levels.sort((a, b) => b.strength - a.strength).slice(0, 8);
  }

  private detectPatterns(chart: any): Pattern[] {
    const candles = chart.candles;
    const patterns: Pattern[] = [];

    if (candles.length < 5) return patterns;

    const last5 = candles.slice(-5);
    const closes = last5.map((c: any) => c.close);

    // Check for trend
    const first = closes[0];
    const lastCloseBar = closes[closes.length - 1];
    const change = ((lastCloseBar - first) / first) * 100;

    if (change > 3) {
      patterns.push({
        name: 'Uptrend',
        type: 'continuation',
        confidence: Math.min(0.9, Math.abs(change) / 10),
        startTime: last5[0].time
      });
    } else if (change < -3) {
      patterns.push({
        name: 'Downtrend',
        type: 'continuation',
        confidence: Math.min(0.9, Math.abs(change) / 10),
        startTime: last5[0].time
      });
    }

    // Doji detection
    const lastCandle = last5[last5.length - 1];
    const body = Math.abs(lastCandle.close - lastCandle.open);
    const range = lastCandle.high - lastCandle.low;
    if (range > 0 && body / range < 0.1) {
      patterns.push({
        name: 'Doji',
        type: 'neutral',
        confidence: 0.7,
        startTime: lastCandle.time
      });
    }

    return patterns;
  }

  private generateSignals(chart: any, levels: KeyLevel[]): Signal[] {
    const signals: Signal[] = [];
    const candles = chart.candles;
    if (candles.length < 14) return signals;

    const closes = candles.map((c: any) => c.close);
    const lastClose = closes[closes.length - 1];
    const rsi = this.calculateRSI(closes, 14);
    const lastRSI = rsi[rsi.length - 1];

    // RSI signals
    if (!isNaN(lastRSI)) {
      if (lastRSI < 30) {
        signals.push({
          name: 'RSI Oversold',
          direction: 'bullish',
          strength: (30 - lastRSI) / 30,
          timeframe: chart.timeframe,
          indicator: 'RSI'
        });
      } else if (lastRSI > 70) {
        signals.push({
          name: 'RSI Overbought',
          direction: 'bearish',
          strength: (lastRSI - 70) / 30,
          timeframe: chart.timeframe,
          indicator: 'RSI'
        });
      }
    }

    // Price vs key levels
    for (const level of levels) {
      const distance = Math.abs(lastClose - level.price) / lastClose;
      if (distance < 0.005) {
        signals.push({
          name: `Near ${level.type}`,
          direction: lastClose > level.price ? 'bearish' : 'bullish',
          strength: level.strength,
          timeframe: chart.timeframe,
          indicator: 'Key Level'
        });
      }
    }

    return signals;
  }

  private calculateBias(signals: Signal[], patterns: Pattern[]): { bias: 'bullish' | 'bearish' | 'neutral'; confidence: number } {
    let bullishScore = 0;
    let bearishScore = 0;

    for (const signal of signals) {
      if (signal.direction === 'bullish') bullishScore += signal.strength;
      if (signal.direction === 'bearish') bearishScore += signal.strength;
    }

    for (const pattern of patterns) {
      if (pattern.type === 'continuation') {
        // Trend continuation — check direction from pattern name
        if (pattern.name.includes('Up')) bullishScore += pattern.confidence;
        if (pattern.name.includes('Down')) bearishScore += pattern.confidence;
      }
    }

    const total = bullishScore + bearishScore;
    if (total === 0) return { bias: 'neutral', confidence: 0.5 };

    const bullishRatio = bullishScore / total;
    const confidence = Math.abs(bullishRatio - 0.5) * 2;

    if (bullishRatio > 0.6) return { bias: 'bullish', confidence };
    if (bullishRatio < 0.4) return { bias: 'bearish', confidence };
    return { bias: 'neutral', confidence };
  }

  private buildAnalysis(symbol: string, bias: string, confidence: number, signals: Signal[], levels: KeyLevel[], patterns: Pattern[]): string {
    const parts: string[] = [];
    parts.push(`${symbol} is showing ${bias} signals with ${(confidence * 100).toFixed(0)}% confidence.`);

    if (signals.length > 0) {
      const topSignals = signals.slice(0, 3).map(s => s.name).join(', ');
      parts.push(`Key signals: ${topSignals}.`);
    }

    if (levels.length > 0) {
      const keyLevel = levels[0];
      parts.push(`Watch ${keyLevel.type} at ${keyLevel.price.toFixed(2)}.`);
    }

    if (patterns.length > 0) {
      parts.push(`Pattern detected: ${patterns[0].name}.`);
    }

    return parts.join(' ');
  }

  private calculateRSI(values: number[], period: number = 14): number[] {
    const result: number[] = [];
    let avgGain = 0, avgLoss = 0;

    for (let i = 1; i <= period && i < values.length; i++) {
      const change = values[i] - values[i - 1];
      if (change > 0) avgGain += change;
      else avgLoss -= change;
    }
    avgGain /= period;
    avgLoss /= period;

    for (let i = 0; i < values.length; i++) {
      if (i < period) {
        result.push(NaN);
        continue;
      }
      const rs = avgGain / (avgLoss || 1);
      result.push(100 - (100 / (1 + rs)));

      if (i < values.length - 1) {
        const change = values[i + 1] - values[i];
        avgGain = (avgGain * (period - 1) + (change > 0 ? change : 0)) / period;
        avgLoss = (avgLoss * (period - 1) + (change < 0 ? -change : 0)) / period;
      }
    }
    return result;
  }
}
