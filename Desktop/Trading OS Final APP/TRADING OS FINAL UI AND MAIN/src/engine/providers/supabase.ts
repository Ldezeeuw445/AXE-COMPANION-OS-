/**
 * engine/providers/supabase.ts
 * ============================
 * Supabase provider for user truth data.
 * ONLY fetches raw data. No business logic.
 * 
 * Tables:
 *   - accounts (balance, equity, margin)
 *   - positions (open trades)
 *   - watchlists (user symbols)
 *   - axe_memory (AI assistant memory)
 */

import { SupabaseClient } from '@supabase/supabase-js';
import type { BrokerAccount, BrokerTrade, JournalAnalytics, JournalLabel, TradeHistoryQuery } from '../types/broker';

export class SupabaseProvider {
  private client: SupabaseClient;

  constructor(client: SupabaseClient) {
    this.client = client;
  }

  /**
   * Fetch account summary for user.
   */
  async fetchAccount(userId: string): Promise<any | null> {
    const { data, error } = await this.client
      .from('accounts')
      .select('*')
      .eq('user_id', userId)
      .maybeSingle();
    if (error) throw new Error(`Supabase account error: ${error.message}`);
    return data;
  }

  /**
   * Fetch open positions for user.
   */
  async fetchPositions(userId: string): Promise<any[]> {
    const { data, error } = await this.client
      .from('positions')
      .select('*')
      .eq('user_id', userId)
      .eq('status', 'open');
    if (error) throw new Error(`Supabase positions error: ${error.message}`);
    return data || [];
  }

  /**
   * Fetch watchlist for user.
   */
  async fetchWatchlist(userId: string): Promise<any[]> {
    const { data, error } = await this.client
      .from('watchlists')
      .select('*')
      .eq('user_id', userId);
    if (error) throw new Error(`Supabase watchlist error: ${error.message}`);
    return data || [];
  }

  /**
   * Fetch Axe memory for user.
   */
  async fetchAxeMemory(userId: string, symbol?: string): Promise<any[]> {
    let query = this.client
      .from('axe_memory')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });

    if (symbol) query = query.eq('symbol', symbol);

    const { data, error } = await query;
    if (error) throw new Error(`Supabase axe_memory error: ${error.message}`);
    return data || [];
  }

  // ---------------------------------------------------------------------------
  // AXE Phase 1 — broker accounts / trades / labels / analytics
  // ---------------------------------------------------------------------------

  async listBrokerAccounts(userId: string): Promise<BrokerAccount[]> {
    const { data, error } = await this.client
      .from('user_broker_accounts')
      .select(
        'id,user_id,provider,label,status,mt5_login,mt5_server,connection_method,external_connection_id,provider_status,last_sync_at,masked_login,metadata,created_at,updated_at',
      )
      .eq('user_id', userId)
      .order('created_at', { ascending: false });
    if (error) throw new Error(`Supabase broker accounts error: ${error.message}`);
    return (data ?? []).map((r: any) => ({
      id: r.id,
      userId: r.user_id,
      provider: r.provider,
      label: r.label,
      status: r.status,
      mt5Login: r.mt5_login,
      mt5Server: r.mt5_server,
      connectionMethod: (r.connection_method ?? 'local_bridge') as BrokerAccount['connectionMethod'],
      externalConnectionId: r.external_connection_id ?? null,
      providerStatus: r.provider_status ?? null,
      lastSyncAt: r.last_sync_at ?? null,
      maskedLogin: r.masked_login ?? null,
      metadata: (r.metadata && typeof r.metadata === 'object' ? r.metadata : {}) as Record<string, unknown>,
      createdAt: r.created_at,
      updatedAt: r.updated_at,
    }));
  }

  async insertBrokerAccount(args: {
    userId: string;
    provider: string;
    label: string;
    status?: string;
    mt5Login?: string;
    mt5Server?: string;
    linkTokenHash: string;
  }): Promise<BrokerAccount> {
    const { data, error } = await this.client
      .from('user_broker_accounts')
      .insert({
        user_id: args.userId,
        provider: args.provider,
        label: args.label,
        status: args.status ?? 'active',
        mt5_login: args.mt5Login ?? null,
        mt5_server: args.mt5Server ?? null,
        link_token_hash: args.linkTokenHash,
        connection_method: 'local_bridge',
      })
      .select(
        'id,user_id,provider,label,status,mt5_login,mt5_server,connection_method,external_connection_id,provider_status,last_sync_at,masked_login,metadata,created_at,updated_at',
      )
      .single();
    if (error) throw new Error(`Supabase insert broker account error: ${error.message}`);
    return {
      id: data.id,
      userId: data.user_id,
      provider: data.provider,
      label: data.label,
      status: data.status,
      mt5Login: data.mt5_login,
      mt5Server: data.mt5_server,
      connectionMethod: (data.connection_method ?? 'local_bridge') as BrokerAccount['connectionMethod'],
      externalConnectionId: data.external_connection_id ?? null,
      providerStatus: data.provider_status ?? null,
      lastSyncAt: data.last_sync_at ?? null,
      maskedLogin: data.masked_login ?? null,
      metadata: (data.metadata && typeof data.metadata === 'object' ? data.metadata : {}) as Record<string, unknown>,
      createdAt: data.created_at,
      updatedAt: data.updated_at,
    };
  }

  async setActiveAccount(userId: string, accountId: string | null): Promise<void> {
    const { error } = await this.client.from('user_workspace_preferences').upsert(
      {
        user_id: userId,
        active_account_id: accountId,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'user_id' },
    );
    if (error) throw new Error(`Supabase set active account error: ${error.message}`);
  }

  async fetchTradeHistory(
    userId: string,
    query: TradeHistoryQuery,
  ): Promise<{
    trades: BrokerTrade[];
    labelsByTradeId: Record<string, { label: JournalLabel; note?: string | null; updatedAt: string }>;
  }> {
    const limit = query.limit ?? 200;
    let q = this.client
      .from('broker_trades')
      .select('id,user_id,account_id,external_trade_id,symbol,side,volume,open_time,close_time,open_price,close_price,pnl,fees,created_at,updated_at')
      .eq('user_id', userId)
      .eq('account_id', query.accountId)
      .order('close_time', { ascending: false, nullsFirst: false })
      .limit(limit);

    if (query.from) q = q.gte('close_time', query.from);
    if (query.to) q = q.lte('close_time', query.to);
    if (query.symbol) q = q.eq('symbol', query.symbol);

    const { data, error } = await q;
    if (error) throw new Error(`Supabase broker_trades error: ${error.message}`);
    const trades = (data ?? []).map((r: any) => ({
      id: r.id,
      userId: r.user_id,
      accountId: r.account_id,
      externalTradeId: r.external_trade_id,
      symbol: r.symbol,
      side: r.side,
      volume: Number(r.volume ?? 0) || 0,
      openTime: r.open_time,
      closeTime: r.close_time,
      openPrice: r.open_price,
      closePrice: r.close_price,
      pnl: Number(r.pnl ?? 0) || 0,
      fees: Number(r.fees ?? 0) || 0,
      createdAt: r.created_at,
      updatedAt: r.updated_at,
    })) as BrokerTrade[];

    const ids = trades.map((t) => t.id);
    const labelsByTradeId: Record<string, { label: JournalLabel; note?: string | null; updatedAt: string }> = {};
    if (ids.length > 0) {
      const { data: lbls, error: lerr } = await this.client
        .from('trade_journal_labels')
        .select('trade_id,label,note,updated_at')
        .eq('user_id', userId)
        .in('trade_id', ids);
      if (lerr) throw new Error(`Supabase trade_journal_labels error: ${lerr.message}`);
      for (const r of lbls ?? []) {
        labelsByTradeId[String((r as any).trade_id)] = {
          label: (r as any).label as JournalLabel,
          note: (r as any).note,
          updatedAt: (r as any).updated_at,
        };
      }
    }

    return { trades, labelsByTradeId };
  }

  async upsertTradeLabel(args: { userId: string; accountId: string; tradeId: string; label: JournalLabel; note?: string | null }): Promise<void> {
    const { error } = await this.client
      .from('trade_journal_labels')
      .upsert(
        {
          trade_id: args.tradeId,
          user_id: args.userId,
          account_id: args.accountId,
          label: args.label,
          note: args.note ?? null,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'trade_id' },
      );
    if (error) throw new Error(`Supabase upsert trade label error: ${error.message}`);
  }

  async getJournalAnalytics(userId: string, query: { accountId: string; from?: string; to?: string }): Promise<JournalAnalytics> {
    // Pull trades and labels, compute analytics in engine (cheap; avoids SQL complexity).
    const { trades, labelsByTradeId } = await this.fetchTradeHistory(userId, {
      accountId: query.accountId,
      from: query.from,
      to: query.to,
      limit: 5000,
      label: 'all',
    });

    let wins = 0;
    let losses = 0;
    let grossProfit = 0;
    let grossLoss = 0;
    let totalPnl = 0;
    let winSum = 0;
    let lossSum = 0;

    const labels: Record<JournalLabel, number> = {
      PerfectlyExecuted: 0,
      Good: 0,
      Impatient: 0,
      EmotionalWreck: 0,
      VeryStupid: 0,
    };

    for (const t of trades) {
      const pnl = Number(t.pnl ?? 0) || 0;
      totalPnl += pnl;
      if (pnl > 0) {
        wins += 1;
        grossProfit += pnl;
        winSum += pnl;
      } else if (pnl < 0) {
        losses += 1;
        grossLoss += pnl;
        lossSum += pnl;
      }
      const lbl = labelsByTradeId[t.id]?.label;
      if (lbl && lbl in labels) labels[lbl] += 1;
    }

    const tradesCount = trades.length;
    const winRate = tradesCount > 0 ? wins / tradesCount : 0;
    const profitFactor = grossLoss < 0 ? grossProfit / Math.abs(grossLoss) : grossProfit > 0 ? Infinity : null;
    const avgWin = wins > 0 ? winSum / wins : null;
    const avgLoss = losses > 0 ? lossSum / losses : null;

    return {
      accountId: query.accountId,
      from: query.from,
      to: query.to,
      trades: tradesCount,
      wins,
      losses,
      winRate,
      grossProfit,
      grossLoss,
      profitFactor: profitFactor === Infinity ? null : profitFactor,
      totalPnl,
      avgWin,
      avgLoss,
      labels,
    };
  }
}
