/**
 * engine/services/brokerTradesService.ts
 * =====================================
 * Broker accounts + trades + journal label workflow.
 *
 * Truth lives in Supabase tables:
 * - user_broker_accounts
 * - broker_trades
 * - trade_journal_labels
 * - user_workspace_preferences.active_account_id
 */

import { CacheEngine } from '../core/cache';
import { InflightDeduper } from '../core/dedupe';
import { SupabaseProvider } from '../providers/supabase';
import type { BrokerAccount, BrokerTrade, JournalAnalytics, JournalLabel, TradeHistoryQuery } from '../types/broker';

function hex(bytes: ArrayBuffer): string {
  const u8 = new Uint8Array(bytes);
  return Array.from(u8)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

async function sha256Hex(input: string): Promise<string> {
  const buf = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest('SHA-256', buf);
  return hex(digest);
}

function newLinkToken(): string {
  // Token is displayed once; only hash is stored.
  const rand = typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `t_${Date.now()}_${Math.random().toString(36).slice(2)}`;
  return `axe_${rand}`;
}

export class BrokerTradesService {
  constructor(
    private cache: CacheEngine,
    private deduper: InflightDeduper,
    private supabase: SupabaseProvider,
  ) {}

  async listAccounts(userId: string): Promise<BrokerAccount[]> {
    const cacheKey = `broker:accounts:${userId}`;
    const result = await this.cache.getOrFetch(cacheKey, 5000, true, () =>
      this.deduper.dedupe(cacheKey, () => this.supabase.listBrokerAccounts(userId)),
    );
    return result.data as BrokerAccount[];
  }

  async createAccount(
    userId: string,
    args: { label: string; mt5Login?: string; mt5Server?: string },
  ): Promise<{ account: BrokerAccount; linkToken: string }> {
    const token = newLinkToken();
    const tokenHash = await sha256Hex(token);
    const account = await this.supabase.insertBrokerAccount({
      userId,
      provider: 'mt5',
      label: args.label || 'MT5 Account',
      mt5Login: args.mt5Login,
      mt5Server: args.mt5Server,
      linkTokenHash: tokenHash,
    });
    // Invalidate account cache.
    this.cache.invalidate(`broker:accounts:${userId}`);
    return { account, linkToken: token };
  }

  async setActiveAccount(userId: string, accountId: string | null): Promise<void> {
    await this.supabase.setActiveAccount(userId, accountId);
    // Preferences are cached client-side; no cache here.
  }

  async getTradeHistory(
    userId: string,
    query: TradeHistoryQuery,
  ): Promise<{ trades: BrokerTrade[]; labelsByTradeId: Record<string, { label: JournalLabel; note?: string | null; updatedAt: string }> }> {
    const cacheKey = `broker:trades:${userId}:${query.accountId}:${query.from ?? ''}:${query.to ?? ''}:${query.symbol ?? ''}:${query.label ?? ''}:${query.limit ?? ''}`;
    const result = await this.cache.getOrFetch(cacheKey, 4000, true, () =>
      this.deduper.dedupe(cacheKey, () => this.supabase.fetchTradeHistory(userId, query)),
    );
    return result.data as any;
  }

  async labelTrade(userId: string, args: { tradeId: string; accountId: string; label: JournalLabel; note?: string | null }): Promise<void> {
    await this.supabase.upsertTradeLabel({ userId, ...args });
    // Labels affect analytics and trade history; clear broad caches for this user.
    this.cache.invalidate(`broker:trades:${userId}:`);
    this.cache.invalidate(`broker:analytics:${userId}:`);
  }

  async getAnalytics(userId: string, query: { accountId: string; from?: string; to?: string }): Promise<JournalAnalytics> {
    const cacheKey = `broker:analytics:${userId}:${query.accountId}:${query.from ?? ''}:${query.to ?? ''}`;
    const result = await this.cache.getOrFetch(cacheKey, 5000, true, () =>
      this.deduper.dedupe(cacheKey, () => this.supabase.getJournalAnalytics(userId, query)),
    );
    return result.data as JournalAnalytics;
  }
}

