/**
 * Browser-side adapter: same contract as EngineAdapter, but calls Supabase Edge `engine-proxy`.
 * Secrets stay on the server; JWT is forwarded so RLS applies on Supabase reads.
 */
import { supabase } from './supabase';
import type { TradingAdapterFacade } from '@/engine/adapter/tradingAdapterFacade';
import type { NewsItem, NewsFilter } from '@/engine/types/news';
import type { MacroSeries, MacroFilter } from '@/engine/types/macro';
import type { AccountSummary, Position, WatchlistItem } from '@/engine/types/account';
import type { ChartData, ChartFetchDebugMeta } from '@/engine/types/chart';
import { ChartFetchError } from '@/engine/types/chart';
import type { ScannerResult, ScannerFilter } from '@/engine/types/scanner';
import type { EarningsEvent } from '@/engine/types/earnings';
import type { AnalystConsensusData, RelativePerformanceData, KeyLevelsData, SentimentShortData } from '@/engine/types/context';
import type { JetPosition, Vessel, VesselAlert } from '@/engine/types/intel';
import type { AxeContext, AxeMemoryItem, AxeStatus } from '@/engine/types/axe';
import type { DashboardData, HistoricalMetrics } from '@/engine/types/dashboard';
import type {
  BrokerAccount,
  BrokerTrade,
  CloudMt5ConnectionResult,
  CreateCloudMt5ConnectionArgs,
  JournalAnalytics,
  JournalLabel,
  TradeHistoryQuery,
} from '@/engine/types/broker';
import { invokeAxeMt5Cloud } from '@/lib/axeMt5CloudInvoke';

type EngineProxyResponse<T> =
  | { ok: true; data: T }
  | { ok: false; error: string; chartDebug?: ChartFetchDebugMeta };

export class RemoteEngineAdapter implements TradingAdapterFacade {
  private proxyUrl(): string {
    const custom = import.meta.env.VITE_ENGINE_PROXY_URL as string | undefined;
    if (custom?.trim()) return custom.trim().replace(/\/$/, '');
    const base = import.meta.env.VITE_SUPABASE_URL as string | undefined;
    if (!base?.trim()) throw new Error('VITE_SUPABASE_URL is required for Edge engine');
    return `${base.replace(/\/$/, '')}/functions/v1/engine-proxy`;
  }

  private async invoke<T>(action: string, args: Record<string, unknown> = {}): Promise<T> {
    // Public market-data actions should work without a user session.
    // User-scoped actions (watchlist, account, AXE memory, etc.) still require auth.
    const PUBLIC_ACTIONS = new Set([
      'getChart',
      'news',
      'macroSeries',
      'listMacroSeries',
      'getScannerResults',
      'getEarningsCalendar',
      'getDashboard',
      'getMetricsHistory',
      'getEngineStatus',
    ]);

    const { data: sessionData } = await supabase.auth.getSession();
    const token = sessionData.session?.access_token ?? null;
    if (!token && !PUBLIC_ACTIONS.has(action)) {
      throw new Error('Not signed in — this action requires a Supabase session');
    }

    const anon = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;
    if (!anon?.trim()) throw new Error('VITE_SUPABASE_ANON_KEY is required for Edge engine');

    // Supabase Functions gateway often expects an Authorization header even when JWT verification is disabled.
    // For public actions, fall back to the anon key to satisfy the header requirement.
    const authHeader = token ? `Bearer ${token}` : `Bearer ${anon}`;

    const res = await fetch(this.proxyUrl(), {
      method: 'POST',
      headers: {
        Authorization: authHeader,
        apikey: anon,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ action, args }),
    });

    const json = (await res.json()) as EngineProxyResponse<T>;
    if (!res.ok || !json || typeof json !== 'object' || json.ok !== true) {
      const err = json && typeof json === 'object' && 'error' in json ? String((json as { error: string }).error) : res.statusText;
      if (json && typeof json === 'object' && 'chartDebug' in json && (json as { chartDebug?: ChartFetchDebugMeta }).chartDebug) {
        throw new ChartFetchError(err || 'engine_proxy_failed', (json as { chartDebug: ChartFetchDebugMeta }).chartDebug);
      }
      throw new Error(err || 'engine_proxy_failed');
    }
    return json.data;
  }

  news(symbol?: string, filters?: Omit<NewsFilter, 'symbol'>): Promise<NewsItem[]> {
    return this.invoke('news', { symbol, filters: filters ?? {} });
  }

  getAnalystConsensus(symbol: string): Promise<AnalystConsensusData | null> {
    return this.invoke('getAnalystConsensus', { symbol });
  }

  getRelativePerformance(symbol: string): Promise<RelativePerformanceData | null> {
    return this.invoke('getRelativePerformance', { symbol });
  }

  getKeyLevels(symbol: string): Promise<KeyLevelsData | null> {
    return this.invoke('getKeyLevels', { symbol });
  }

  getSentimentShort(symbol: string): Promise<SentimentShortData | null> {
    return this.invoke('getSentimentShort', { symbol });
  }

  getCorporateJets(): Promise<JetPosition[]> {
    return this.invoke('getCorporateJets', {});
  }

  getVesselStream(): Promise<{ vessels: Vessel[]; alerts: VesselAlert[] }> {
    return this.invoke('getVesselStream', {});
  }

  macroSeries(key: string, range?: MacroFilter['range']): Promise<MacroSeries> {
    return this.invoke('macroSeries', { key, range });
  }

  listMacroSeries(): Promise<{ key: string; name: string; unit: string; frequency: string }[]> {
    return this.invoke('listMacroSeries', {});
  }

  getAccountSummary(userId: string): Promise<AccountSummary> {
    return this.invoke('getAccountSummary', { userId });
  }

  getOpenPositions(userId: string): Promise<Position[]> {
    return this.invoke('getOpenPositions', { userId });
  }

  getWatchlist(userId: string): Promise<WatchlistItem[]> {
    return this.invoke('getWatchlist', { userId });
  }

  getChart(symbol: string, timeframe: string, limit?: number): Promise<ChartData> {
    return this.invoke('getChart', { symbol, timeframe, limit });
  }

  getScannerResults(filter?: ScannerFilter): Promise<ScannerResult[]> {
    return this.invoke('getScannerResults', { filter: filter ?? {} });
  }

  getEarningsCalendar(from: string, to: string): Promise<EarningsEvent[]> {
    return this.invoke('getEarningsCalendar', { from, to });
  }

  getAxeContext(symbol: string, timeframe: string, userId: string): Promise<AxeContext> {
    return this.invoke('getAxeContext', { symbol, timeframe, userId });
  }

  getAxeMemory(userId: string, symbol?: string): Promise<AxeMemoryItem[]> {
    return this.invoke('getAxeMemory', { userId, symbol });
  }

  getAxeStatus(userId: string): Promise<AxeStatus> {
    return this.invoke('getAxeStatus', { userId });
  }

  getDashboard(): Promise<DashboardData> {
    return this.invoke('getDashboard', {});
  }

  getMetricsHistory(timeframe: '1H' | '24H' | '7D' | '30D'): Promise<HistoricalMetrics> {
    return this.invoke('getMetricsHistory', { timeframe });
  }

  getEngineStatus(): Promise<{ status: 'healthy' | 'degraded' | 'critical'; message: string }> {
    return this.invoke('getEngineStatus', {});
  }

  listBrokerAccounts(userId: string): Promise<BrokerAccount[]> {
    return this.invoke('listBrokerAccounts', { userId });
  }

  createBrokerAccount(
    userId: string,
    args: { label: string; mt5Login?: string; mt5Server?: string },
  ): Promise<{ account: BrokerAccount; linkToken: string }> {
    return this.invoke('createBrokerAccount', { userId, ...args });
  }

  createCloudMt5Connection(userId: string, args: CreateCloudMt5ConnectionArgs): Promise<CloudMt5ConnectionResult> {
    return invokeAxeMt5Cloud({
      action: 'create',
      userId,
      label: args.label,
      mt5Login: args.mt5Login,
      mt5Server: args.mt5Server,
      investorPassword: args.investorPassword,
      region: args.region ?? '',
      readOnlyConfirmed: args.readOnlyConfirmed,
    });
  }

  testCloudMt5Connection(userId: string, args: { accountId: string }): Promise<CloudMt5ConnectionResult> {
    return invokeAxeMt5Cloud({ action: 'test', userId, accountId: args.accountId });
  }

  syncCloudMt5Account(userId: string, args: { accountId: string }): Promise<CloudMt5ConnectionResult> {
    return invokeAxeMt5Cloud({ action: 'sync', userId, accountId: args.accountId });
  }

  disconnectCloudMt5Account(userId: string, args: { accountId: string }): Promise<CloudMt5ConnectionResult> {
    return invokeAxeMt5Cloud({ action: 'disconnect', userId, accountId: args.accountId });
  }

  setActiveAccount(userId: string, accountId: string | null): Promise<{ ok: true }> {
    return this.invoke('setActiveAccount', { userId, accountId });
  }

  getTradeHistory(
    userId: string,
    query: TradeHistoryQuery,
  ): Promise<{ trades: BrokerTrade[]; labelsByTradeId: Record<string, { label: JournalLabel; note?: string | null; updatedAt: string }> }> {
    return this.invoke('getTradeHistory', { userId, query });
  }

  labelTrade(
    userId: string,
    args: { tradeId: string; accountId: string; label: JournalLabel; note?: string | null },
  ): Promise<{ ok: true }> {
    return this.invoke('labelTrade', { userId, ...args });
  }

  getJournalAnalytics(
    userId: string,
    query: { accountId: string; from?: string; to?: string },
  ): Promise<JournalAnalytics> {
    return this.invoke('getJournalAnalytics', { userId, query });
  }
}
