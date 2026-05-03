/**
 * engine/services/accountService.ts
 * ==================================
 * Account service — user truth from Supabase.
 * 
 * Flow:
 *   1. Check cache (short TTL — account changes frequently)
 *   2. Fetch from Supabase (no fallback — Supabase IS the truth)
 *   3. Normalize to AccountSummary / Position[] / WatchlistItem[]
 *   4. Return fixed shape
 * 
 * NO fallback — Supabase is the single source of truth for user data.
 */

import { CacheEngine } from '../core/cache';
import { InflightDeduper } from '../core/dedupe';
import { SourceRouter } from '../core/router';
import { ProviderHealthTracker } from '../core/health';
import type { SourcePolicy } from '../core/policies';
import { DEFAULT_POLICIES } from '../core/policies';
import type { AccountSummary, Position, WatchlistItem } from '../types/account';
import { SupabaseProvider } from '../providers/supabase';

export interface AccountProviderConfig {
  id: string;
  provider: SupabaseProvider;
  weight: number;
}

export class AccountService {
  private cache: CacheEngine;
  private deduper: InflightDeduper;
  private health: ProviderHealthTracker;
  private providers: Map<string, AccountProviderConfig>;
  private policy: SourcePolicy;

  constructor(
    cache: CacheEngine,
    deduper: InflightDeduper,
    router: SourceRouter,
    health: ProviderHealthTracker,
    configs: AccountProviderConfig[]
  ) {
    this.cache = cache;
    this.deduper = deduper;
    this.health = health;
    this.providers = new Map(configs.map(c => [c.id, c]));
    this.policy = DEFAULT_POLICIES.account;

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
   * Get account summary — the ONLY function the UI calls for account data.
   */
  async getSummary(userId: string): Promise<AccountSummary> {
    const cacheKey = `account:summary:${userId}`;

    const result = await this.cache.getOrFetch(
      cacheKey,
      this.policy.cacheTtlMs,
      this.policy.staleWhileRevalidate || false,
      () => this.deduper.dedupe(cacheKey, () => this.fetchSummary(userId))
    );

    return result.data as AccountSummary;
  }

  /**
   * Get open positions.
   */
  async getOpenPositions(userId: string): Promise<Position[]> {
    const cacheKey = `account:positions:${userId}`;

    const result = await this.cache.getOrFetch(
      cacheKey,
      this.policy.cacheTtlMs,
      this.policy.staleWhileRevalidate || false,
      () => this.deduper.dedupe(cacheKey, () => this.fetchPositions(userId))
    );

    return result.data as Position[];
  }

  /**
   * Get watchlist.
   */
  async getWatchlist(userId: string): Promise<WatchlistItem[]> {
    const cacheKey = `account:watchlist:${userId}`;

    const result = await this.cache.getOrFetch(
      cacheKey,
      15000,  // 15 seconds for watchlist
      true,
      () => this.deduper.dedupe(cacheKey, () => this.fetchWatchlist(userId))
    );

    return result.data as WatchlistItem[];
  }

  // --- Private fetchers ---

  private async fetchSummary(userId: string): Promise<AccountSummary> {
    const config = this.providers.get('supabase_1');
    if (!config) throw new Error('No Supabase provider configured');

    try {
      const raw = await config.provider.fetchAccount(userId);
      this.health.recordSuccess('supabase_1');

      if (!raw) {
        return {
          userId,
          balance: 0,
          equity: 0,
          marginUsed: 0,
          marginAvailable: 0,
          openPnl: 0,
          closedPnl: 0,
          currency: 'USD',
          lastUpdated: new Date().toISOString(),
        };
      }

      return {
        userId,
        balance: raw.balance || 0,
        equity: raw.equity || 0,
        marginUsed: raw.margin_used || 0,
        marginAvailable: raw.margin_available || 0,
        openPnl: raw.open_pnl || 0,
        closedPnl: raw.closed_pnl || 0,
        currency: raw.currency || 'USD',
        lastUpdated: raw.updated_at || new Date().toISOString()
      };
    } catch (e) {
      this.health.recordFailure('supabase_1', e);
      throw e;
    }
  }

  private async fetchPositions(userId: string): Promise<Position[]> {
    const config = this.providers.get('supabase_1');
    if (!config) throw new Error('No Supabase provider configured');

    try {
      const raw = await config.provider.fetchPositions(userId);
      this.health.recordSuccess('supabase_1');

      return raw.map((p: any) => ({
        id: p.id,
        symbol: p.symbol,
        direction: p.direction,
        size: p.size,
        entryPrice: p.entry_price,
        currentPrice: p.current_price,
        stopLoss: p.stop_loss,
        takeProfit: p.take_profit,
        pnl: p.pnl,
        pnlPercent: p.pnl_percent,
        margin: p.margin,
        openedAt: p.opened_at
      }));
    } catch (e) {
      this.health.recordFailure('supabase_1', e);
      throw e;
    }
  }

  private async fetchWatchlist(userId: string): Promise<WatchlistItem[]> {
    const config = this.providers.get('supabase_1');
    if (!config) throw new Error('No Supabase provider configured');

    try {
      const raw = await config.provider.fetchWatchlist(userId);
      this.health.recordSuccess('supabase_1');

      return raw.map((w: any) => ({
        symbol: w.symbol,
        name: w.name,
        price: w.price || 0,
        change: w.change || 0,
        changePercent: w.change_percent || 0,
        volume: w.volume,
        high24h: w.high_24h,
        low24h: w.low_24h,
        alerts: w.alerts || []
      }));
    } catch (e) {
      this.health.recordFailure('supabase_1', e);
      throw e;
    }
  }
}
