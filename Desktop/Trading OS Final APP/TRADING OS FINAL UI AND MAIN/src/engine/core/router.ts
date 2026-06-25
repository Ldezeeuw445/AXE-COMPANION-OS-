/**
 * engine/core/router.ts
 * =====================
 * Layer C — Source router.
 * Selects optimal provider based on priority strategy, health, and remaining credits.
 */

import type { Priority } from './policies';
import { ProviderHealthTracker } from './health';

export interface ProviderConfig {
  id: string;
  provider: string;
  weight: number;        // 0-1, higher = preferred
  monthlyLimit: number;
  dailyLimit: number;
  usedThisMonth: number; // in cost units
  usedToday: number; // in cost units
  avgLatencyMs: number;
  dataQuality: number;   // 0-1
  /** Estimated cost units per call for this provider+domain. */
  costPerCall?: number;
}

export class SourceRouter {
  private providers: ProviderConfig[] = [];
  private health: ProviderHealthTracker;
  private stats = { selections: 0, fallbacksUsed: 0, fallbacksByDomain: {} as Record<string, number> };

  constructor(health: ProviderHealthTracker) {
    this.health = health;
  }

  register(config: ProviderConfig): void {
    this.providers.push(config);
  }

  /**
   * Select best provider from candidates based on policy.
   */
  select(providerIds: string[], priority: Priority): string | null {
    const candidates = this.providers
      .filter(p => providerIds.includes(p.id))
      .filter(p => this.health.isHealthy(p.id))
      .filter(p => p.usedThisMonth < p.monthlyLimit)
      .filter(p => p.dailyLimit === 0 || p.usedToday < p.dailyLimit);

    if (candidates.length === 0) return null;

    const scored = candidates.map(p => ({
      id: p.id,
      score: this.calculateScore(p, priority)
    }));

    scored.sort((a, b) => b.score - a.score);
    this.stats.selections++;
    return scored[0].id;
  }

  /**
   * Build fallback chain starting from primary provider.
   */
  buildFallbackChain(primaryId: string, allIds: string[], enableFallback: boolean): string[] {
    if (!enableFallback) return [primaryId];
    const chain = [primaryId];
    for (const id of allIds) {
      if (id !== primaryId && this.health.isHealthy(id)) {
        chain.push(id);
      }
    }
    return chain;
  }

  recordUsage(providerId: string, costUnits?: number): void {
    const p = this.providers.find(x => x.id === providerId);
    if (p) {
      const units = Math.max(0, Math.floor(costUnits ?? (p.costPerCall ?? 1)));
      p.usedThisMonth += units;
      p.usedToday += units;
    }
  }

  recordFallbackUsed(domain?: string): void {
    this.stats.fallbacksUsed++;
    if (domain) {
      this.stats.fallbacksByDomain[domain] = (this.stats.fallbacksByDomain[domain] ?? 0) + 1;
    }
  }

  getStats(): { selections: number; fallbacksUsed: number; fallbacksByDomain: Record<string, number> } {
    return { ...this.stats, fallbacksByDomain: { ...this.stats.fallbacksByDomain } };
  }

  getConfigs(): ProviderConfig[] {
    return [...this.providers];
  }

  private calculateScore(p: ProviderConfig, priority: Priority): number {
    const remainingRatio = 1 - (p.usedThisMonth / Math.max(1, p.monthlyLimit));
    const dailyRatio = p.dailyLimit === 0 ? 1 : 1 - (p.usedToday / Math.max(1, p.dailyLimit));
    const latencyScore = 1 / (1 + p.avgLatencyMs / 200);
    const qualityScore = p.dataQuality;
    const weightScore = p.weight;
    const costScore = 1 / (1 + Math.max(0, (p.costPerCall ?? 1) - 1) / 2); // 1.0 when cost=1

    switch (priority) {
      case 'CHEAP':
        return remainingRatio * 0.35 + dailyRatio * 0.25 + costScore * 0.25 + weightScore * 0.1 + qualityScore * 0.05;
      case 'FAST':
        return latencyScore * 0.45 + weightScore * 0.25 + remainingRatio * 0.15 + dailyRatio * 0.05 + qualityScore * 0.1;
      case 'ACCURATE':
        return qualityScore * 0.55 + weightScore * 0.25 + remainingRatio * 0.15 + dailyRatio * 0.05;
      default: // BALANCED
        return remainingRatio * 0.25 + dailyRatio * 0.15 + latencyScore * 0.2 + qualityScore * 0.2 + weightScore * 0.1 + costScore * 0.1;
    }
  }
}
