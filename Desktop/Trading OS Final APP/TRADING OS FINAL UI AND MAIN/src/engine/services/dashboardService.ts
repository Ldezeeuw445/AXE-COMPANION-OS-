/**
 * engine/services/dashboardService.ts
 * ===================================
 * Dashboard service — aggregates all engine metrics into a single view.
 * 
 * Flow:
 *   1. Collect metrics from cache, router, health tracker
 *   2. Calculate efficiency scores
 *   3. Generate smart recommendations
 *   4. Return fixed DashboardData shape
 */

import { CacheEngine } from '../core/cache';
import { InflightDeduper } from '../core/dedupe';
import { SourceRouter } from '../core/router';
import { ProviderHealthTracker } from '../core/health';
import { MetricsCollector } from '../core/metrics';
import type {
  DashboardData,
  EngineOverview,
  EfficiencyMetric,
  CacheMetric,
  InflightMetric,
  ProviderMetric,
  ProviderCredentialSlot,
  Recommendation,
  HistoricalMetrics,
} from '../types/dashboard';

export interface DashboardServiceConfig {
  cache: CacheEngine;
  deduper: InflightDeduper;
  router: SourceRouter;
  health: ProviderHealthTracker;
  metrics: MetricsCollector;
  /** When set, included in getDashboard() for Ops UI (configured = non-empty key list at engine boot). */
  credentialSlots?: ProviderCredentialSlot[];
}

export class DashboardService {
  private cache: CacheEngine;
  private deduper: InflightDeduper;
  private router: SourceRouter;
  private health: ProviderHealthTracker;
  private metrics: MetricsCollector;
  private credentialSlots: ProviderCredentialSlot[];

  constructor(config: DashboardServiceConfig) {
    this.cache = config.cache;
    this.deduper = config.deduper;
    this.router = config.router;
    this.health = config.health;
    this.metrics = config.metrics;
    this.credentialSlots = config.credentialSlots ?? [];
  }

  /**
   * Get full dashboard — the ONLY function the UI calls for ops/metrics.
   */
  getDashboard(): DashboardData {
    const providers = this.buildProviderMetrics();
    const cache = this.buildCacheMetrics();
    const inflight = this.buildInflightMetrics();
    const efficiency = this.buildEfficiencyMetric(providers, cache);
    const overview = this.buildOverview(providers, efficiency);

    // Record time-series snapshot
    this.metrics.record(
      efficiency.cacheHitRate,
      efficiency.creditSavingsRate,
      efficiency.avgLatencyMs,
      providers.filter(p => p.isHealthy).length
    );

    return {
      overview,
      efficiency,
      cache,
      inflight,
      providers,
      recommendations: this.generateRecommendations(providers, cache, efficiency),
      fallbacksByDomain: this.router.getStats().fallbacksByDomain,
      credentialSlots: this.credentialSlots.length ? [...this.credentialSlots] : undefined,
    };
  }

  /**
   * Get historical metrics for charts.
   */
  getHistory(timeframe: '1H' | '24H' | '7D' | '30D'): HistoricalMetrics {
    return this.metrics.getHistory(timeframe);
  }

  /**
   * Get quick status (lightweight, for header/status bar).
   */
  getQuickStatus(): { status: 'healthy' | 'degraded' | 'critical'; message: string } {
    const providers = this.buildProviderMetrics();
    const healthy = providers.filter(p => p.isHealthy);
    const inCooldown = providers.filter(p => p.isInCooldown);

    if (inCooldown.length === providers.length && providers.length > 0) {
      return { status: 'critical', message: `All ${providers.length} providers in cooldown` };
    }
    if (inCooldown.length > 0) {
      return { status: 'degraded', message: `${inCooldown.length} provider(s) in cooldown` };
    }
    if (healthy.length === 0 && providers.length > 0) {
      return { status: 'critical', message: 'No healthy providers' };
    }
    return { status: 'healthy', message: `${healthy.length}/${providers.length} providers healthy` };
  }

  // --- Private builders ---

  private buildProviderMetrics(): ProviderMetric[] {
    const configs = this.router.getConfigs();
    return configs.map(config => {
      const health = this.health.getHealth(config.id);
      const isHealthy = health ? health.isHealthy : true;
      const isInCooldown = health ? !!health.cooldownUntil && Date.now() < health.cooldownUntil : false;
      const cooldownRemainingSec = health?.cooldownUntil
        ? Math.max(0, Math.ceil((health.cooldownUntil - Date.now()) / 1000))
        : undefined;

      const lastError = health?.lastErrorMessage
        ? `${health.cooldownReason ? `[${health.cooldownReason}] ` : ''}${health.lastErrorMessage}`
        : health?.lastError
          ? new Date(health.lastError).toISOString()
          : 'never';

      return {
        id: config.id,
        provider: config.provider,
        isHealthy,
        isInCooldown,
        cooldownRemainingSec,
        usedThisMonth: config.usedThisMonth,
        monthlyLimit: config.monthlyLimit,
        remainingThisMonth: Math.max(0, config.monthlyLimit - config.usedThisMonth),
        utilizationPercent: config.monthlyLimit > 0
          ? (config.usedThisMonth / config.monthlyLimit) * 100
          : 0,
        usedToday: config.usedToday,
        dailyLimit: config.dailyLimit,
        // IMPORTANT: never emit `Infinity` — Edge responses JSON.stringify the payload and will 500.
        remainingToday: config.dailyLimit > 0 ? Math.max(0, config.dailyLimit - config.usedToday) : 0,
        failureCount: health?.failureCount || 0,
        lastSuccess: health?.lastSuccess
          ? new Date(health.lastSuccess).toISOString()
          : 'never',
        lastError,
        avgLatencyMs: config.avgLatencyMs,
        dataQuality: config.dataQuality
      };
    });
  }

  private buildCacheMetrics(): CacheMetric {
    const stats = this.cache.getStats();
    const total = stats.hits + stats.misses + stats.staleServes;
    return {
      size: stats.size,
      maxSize: 10000,  // From CacheEngine default
      hits: stats.hits,
      misses: stats.misses,
      staleServes: stats.staleServes,
      evictions: stats.evictions,
      hitRate: total > 0 ? stats.hits / total : 0,
      missRate: total > 0 ? stats.misses / total : 0
    };
  }

  private buildInflightMetrics(): InflightMetric {
    const stats = this.deduper.getStats();
    return {
      activeRequests: stats.active,
      totalDedupes: stats.dedupes
    };
  }

  private buildEfficiencyMetric(providers: ProviderMetric[], cache: CacheMetric): EfficiencyMetric {
    const totalRequests = cache.hits + cache.misses + cache.staleServes;
    const realApiCalls = cache.misses + cache.staleServes;
    const creditsSaved = cache.hits;
    const routerStats = this.router.getStats();

    // Calculate weighted average latency from providers
    const avgLatency = providers.length > 0
      ? providers.reduce((sum, p) => sum + p.avgLatencyMs, 0) / providers.length
      : 0;

    return {
      totalRequests,
      realApiCalls,
      cacheHits: cache.hits,
      creditsSaved,
      cacheHitRate: totalRequests > 0 ? creditsSaved / totalRequests : 0,
      creditSavingsRate: totalRequests > 0 ? creditsSaved / totalRequests : 0,
      avgLatencyMs: avgLatency,
      effectiveMultiplier: realApiCalls > 0 ? totalRequests / realApiCalls : 1,
      fallbacksUsed: routerStats.fallbacksUsed,
    };
  }

  private buildOverview(providers: ProviderMetric[], efficiency: EfficiencyMetric): EngineOverview {
    const healthy = providers.filter(p => p.isHealthy);
    const inCooldown = providers.filter(p => p.isInCooldown);
    const totalAvailable = providers.reduce((sum, p) => sum + p.monthlyLimit, 0);
    const totalUsed = providers.reduce((sum, p) => sum + p.usedThisMonth, 0);

    let status: 'healthy' | 'degraded' | 'critical' = 'healthy';
    if (inCooldown.length === providers.length && providers.length > 0) status = 'critical';
    else if (inCooldown.length > 0) status = 'degraded';
    else if (healthy.length === 0 && providers.length > 0) status = 'critical';

    return {
      status,
      activeProviders: healthy.length,
      totalProviders: providers.length,
      providersInCooldown: inCooldown.length,
      totalCreditsAvailable: totalAvailable,
      totalCreditsUsed: totalUsed,
      overallUtilization: totalAvailable > 0 ? (totalUsed / totalAvailable) * 100 : 0,
      cacheHitRate: efficiency.cacheHitRate,
      creditSavingsRate: efficiency.creditSavingsRate,
      lastUpdated: new Date().toISOString()
    };
  }

  private generateRecommendations(
    providers: ProviderMetric[],
    cache: CacheMetric,
    efficiency: EfficiencyMetric
  ): Recommendation[] {
    const recs: Recommendation[] = [];

    // Credit savings
    if (efficiency.creditSavingsRate > 0.5) {
      recs.push({
        priority: 'info',
        message: `💰 Excellent credit savings: ${(efficiency.creditSavingsRate * 100).toFixed(1)}% of requests served from cache`,
        action: 'Your free tiers are lasting much longer'
      });
    } else if (efficiency.creditSavingsRate < 0.2) {
      recs.push({
        priority: 'warning',
        message: `💡 Low cache hit rate: ${(efficiency.cacheHitRate * 100).toFixed(1)}% — consider increasing cache TTL`,
        action: 'Increase cacheTtlMs for slow-changing data like macro'
      });
    }

    // Provider health
    const inCooldown = providers.filter(p => p.isInCooldown);
    if (inCooldown.length > 0) {
      for (const p of inCooldown) {
        recs.push({
          priority: 'warning',
          message: `⏳ ${p.provider} (${p.id}) is in cooldown for ${p.cooldownRemainingSec}s`,
          action: 'Check API key validity or rate limit status'
        });
      }
    }

    // Exhausted providers
    const exhausted = providers.filter(p => p.remainingThisMonth === 0);
    if (exhausted.length > 0) {
      for (const p of exhausted) {
        recs.push({
          priority: 'critical',
          message: `🔴 ${p.provider} (${p.id}) has exhausted its monthly limit (${p.monthlyLimit} calls)`,
          action: 'Add more API keys or wait for monthly reset'
        });
      }
    }

    // Imbalanced usage
    const usages = providers.map(p => p.utilizationPercent);
    if (usages.length > 1) {
      const max = Math.max(...usages);
      const min = Math.min(...usages);
      if (max - min > 30) {
        recs.push({
          priority: 'warning',
          message: `⚖️ Usage imbalance: ${max.toFixed(0)}% vs ${min.toFixed(0)}% across providers`,
          action: 'Switch to CHEAP priority to balance credits'
        });
      }
    }

    // Cache near capacity
    if (cache.size > cache.maxSize * 0.9) {
      recs.push({
        priority: 'warning',
        message: `💾 Cache near capacity: ${cache.size}/${cache.maxSize} entries`,
        action: 'Increase cacheSize in createEngine() or lower TTL'
      });
    }

    // High stale serves
    if (cache.staleServes > cache.hits * 0.1) {
      recs.push({
        priority: 'info',
        message: `🔄 ${cache.staleServes} stale-while-revalidate serves — background refresh is working`,
        action: 'Users see instant data while fresh data loads in background'
      });
    }

    // Everything optimal
    if (recs.length === 0) {
      recs.push({
        priority: 'info',
        message: '✅ All systems operating optimally',
        action: 'No action needed'
      });
    }

    return recs;
  }
}
