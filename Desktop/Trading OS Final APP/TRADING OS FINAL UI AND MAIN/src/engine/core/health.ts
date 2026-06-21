/**
 * engine/core/health.ts
 * =====================
 * Layer C — Provider health tracking & circuit breaker.
 * Tracks failures, cooldowns, and recovery per provider.
 */

export interface ProviderHealth {
  id: string;
  provider: string;
  lastSuccess: number;
  lastError: number;
  lastErrorMessage?: string;
  cooldownReason?: 'circuit_breaker' | 'rate_limited' | 'quota_exhausted';
  failureCount: number;
  cooldownUntil: number;
  isHealthy: boolean;
}

export class ProviderHealthTracker {
  private health = new Map<string, ProviderHealth>();
  private failureThreshold: number;
  private cooldownMs: number;

  constructor(failureThreshold = 3, cooldownMs = 60000) {
    this.failureThreshold = failureThreshold;
    this.cooldownMs = cooldownMs;
  }

  recordSuccess(providerId: string): void {
    const h = this.getOrCreate(providerId);
    h.lastSuccess = Date.now();
    h.failureCount = 0;
    h.cooldownUntil = 0;
    h.isHealthy = true;
  }

  recordFailure(providerId: string, error?: unknown): void {
    const h = this.getOrCreate(providerId);
    h.lastError = Date.now();
    h.lastErrorMessage = this.toMessage(error);

    const classification = this.classifyRateLimit(error);
    if (classification) {
      // Rate-limit / quota cooldown overrides circuit breaker
      h.failureCount++;
      h.cooldownUntil = Date.now() + classification.cooldownMs;
      h.isHealthy = false;
      h.cooldownReason = classification.reason;
      return;
    }

    h.failureCount++;
    if (h.failureCount >= this.failureThreshold) {
      h.cooldownUntil = Date.now() + this.cooldownMs;
      h.isHealthy = false;
      h.cooldownReason = 'circuit_breaker';
    }
  }

  isHealthy(providerId: string): boolean {
    const h = this.health.get(providerId);
    if (!h) return true;
    if (h.cooldownUntil && Date.now() < h.cooldownUntil) return false;
    return h.isHealthy;
  }

  getHealth(providerId: string): ProviderHealth | undefined {
    return this.health.get(providerId);
  }

  getAllHealth(): ProviderHealth[] {
    return Array.from(this.health.values());
  }

  private getOrCreate(id: string): ProviderHealth {
    if (!this.health.has(id)) {
      this.health.set(id, {
        id,
        provider: id.split('_')[0],
        lastSuccess: 0,
        lastError: 0,
        lastErrorMessage: undefined,
        cooldownReason: undefined,
        failureCount: 0,
        cooldownUntil: 0,
        isHealthy: true
      });
    }
    return this.health.get(id)!;
  }

  private toMessage(error: unknown): string | undefined {
    if (!error) return undefined;
    if (error instanceof Error) return error.message;
    if (typeof error === 'string') return error;
    try {
      return JSON.stringify(error);
    } catch {
      return String(error);
    }
  }

  private classifyRateLimit(error: unknown): { reason: ProviderHealth['cooldownReason']; cooldownMs: number } | null {
    const msg = this.toMessage(error) ?? '';
    // Providers in this repo throw messages like: "FMP news error: 429"
    if (/\b429\b/.test(msg) || /too many requests/i.test(msg) || /rate limit/i.test(msg)) {
      return { reason: 'rate_limited', cooldownMs: 5 * 60_000 };
    }
    if (/\b402\b/.test(msg) || /quota/i.test(msg) || /credit/i.test(msg) || /payment required/i.test(msg)) {
      return { reason: 'quota_exhausted', cooldownMs: 60 * 60_000 };
    }
    return null;
  }
}
