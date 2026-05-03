/**
 * engine/core/metrics.ts
 * ======================
 * Metrics collector — tracks engine performance over time.
 * Stores time-series data for dashboard visualization.
 */

import type { TimeSeriesPoint, HistoricalMetrics } from '../types/dashboard';

export class MetricsCollector {
  private history: TimeSeriesPoint[] = [];
  private maxPoints: number;
  private lastSnapshot: number = 0;
  private snapshotIntervalMs: number;

  constructor(maxPoints = 1000, snapshotIntervalMs = 60000) {
    this.maxPoints = maxPoints;
    this.snapshotIntervalMs = snapshotIntervalMs;
  }

  /**
   * Record a snapshot if enough time has passed.
   */
  record(
    cacheHitRate: number,
    creditSavingsRate: number,
    avgLatencyMs: number,
    activeProviders: number
  ): void {
    const now = Date.now();
    if (now - this.lastSnapshot < this.snapshotIntervalMs) return;

    const point: TimeSeriesPoint = {
      timestamp: new Date().toISOString(),
      cacheHitRate,
      creditSavingsRate,
      avgLatencyMs,
      activeProviders
    };

    this.history.push(point);
    this.lastSnapshot = now;

    // Trim old data
    if (this.history.length > this.maxPoints) {
      this.history = this.history.slice(-this.maxPoints);
    }
  }

  /**
   * Get historical metrics for a timeframe.
   */
  getHistory(timeframe: '1H' | '24H' | '7D' | '30D'): HistoricalMetrics {
    const now = Date.now();
    const ranges: Record<string, number> = {
      '1H': 60 * 60 * 1000,
      '24H': 24 * 60 * 60 * 1000,
      '7D': 7 * 24 * 60 * 60 * 1000,
      '30D': 30 * 24 * 60 * 60 * 1000
    };

    const cutoff = now - (ranges[timeframe] || ranges['24H']);
    const points = this.history.filter(p => new Date(p.timestamp).getTime() > cutoff);

    return { points, timeframe };
  }

  /**
   * Get latest point.
   */
  getLatest(): TimeSeriesPoint | undefined {
    return this.history[this.history.length - 1];
  }

  /**
   * Clear all history.
   */
  clear(): void {
    this.history = [];
    this.lastSnapshot = 0;
  }

  getStats(): { totalPoints: number; oldestPoint: string | null; newestPoint: string | null } {
    return {
      totalPoints: this.history.length,
      oldestPoint: this.history[0]?.timestamp || null,
      newestPoint: this.history[this.history.length - 1]?.timestamp || null
    };
  }
}
