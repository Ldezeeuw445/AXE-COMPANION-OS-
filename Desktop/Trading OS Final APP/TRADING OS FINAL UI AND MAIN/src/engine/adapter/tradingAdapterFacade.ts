/**
 * Shared contract for in-process EngineAdapter and RemoteEngineAdapter (Edge proxy client).
 */
import type { NewsItem, NewsFilter } from '../types/news';
import type { MacroSeries, MacroFilter } from '../types/macro';
import type { AccountSummary, Position, WatchlistItem } from '../types/account';
import type { ChartData } from '../types/chart';
import type { ScannerResult, ScannerFilter } from '../types/scanner';
import type { AxeContext, AxeMemoryItem, AxeStatus } from '../types/axe';
import type { DashboardData, HistoricalMetrics } from '../types/dashboard';
import type { EarningsEvent } from '../types/earnings';
import type { AnalystConsensusData, RelativePerformanceData, KeyLevelsData, SentimentShortData } from '../types/context';
import type { JetPosition, Vessel, VesselAlert } from '../types/intel';
import type {
  BrokerAccount,
  BrokerTrade,
  CloudMt5ConnectionResult,
  CreateCloudMt5ConnectionArgs,
  JournalAnalytics,
  JournalLabel,
  TradeHistoryQuery,
} from '../types/broker';

export interface TradingAdapterFacade {
  news(symbol?: string, filters?: Omit<NewsFilter, 'symbol'>): Promise<NewsItem[]>;
  getAnalystConsensus(symbol: string): Promise<AnalystConsensusData | null>;
  getRelativePerformance(symbol: string): Promise<RelativePerformanceData | null>;
  getKeyLevels(symbol: string): Promise<KeyLevelsData | null>;
  getSentimentShort(symbol: string): Promise<SentimentShortData | null>;
  getCorporateJets(): Promise<JetPosition[]>;
  getVesselStream(): Promise<{ vessels: Vessel[]; alerts: VesselAlert[] }>;
  macroSeries(key: string, range?: MacroFilter['range']): Promise<MacroSeries>;
  /** Async so the same contract works over HTTP (Edge proxy). */
  listMacroSeries(): Promise<{ key: string; name: string; unit: string; frequency: string }[]>;
  getAccountSummary(userId: string): Promise<AccountSummary>;
  getOpenPositions(userId: string): Promise<Position[]>;
  getWatchlist(userId: string): Promise<WatchlistItem[]>;
  getChart(symbol: string, timeframe: string, limit?: number): Promise<ChartData>;
  getScannerResults(filter?: ScannerFilter): Promise<ScannerResult[]>;
  getEarningsCalendar(from: string, to: string): Promise<EarningsEvent[]>;
  getAxeContext(symbol: string, timeframe: string, userId: string): Promise<AxeContext>;
  getAxeMemory(userId: string, symbol?: string): Promise<AxeMemoryItem[]>;
  getAxeStatus(userId: string): Promise<AxeStatus>;
  getDashboard(): Promise<DashboardData>;
  getMetricsHistory(timeframe: '1H' | '24H' | '7D' | '30D'): Promise<HistoricalMetrics>;
  getEngineStatus(): Promise<{ status: 'healthy' | 'degraded' | 'critical'; message: string }>;

  // AXE Phase 1 — broker trades + journal analytics (account truth)
  listBrokerAccounts(userId: string): Promise<BrokerAccount[]>;
  createBrokerAccount(userId: string, args: { label: string; mt5Login?: string; mt5Server?: string }): Promise<{ account: BrokerAccount; linkToken: string }>;
  createCloudMt5Connection(userId: string, args: CreateCloudMt5ConnectionArgs): Promise<CloudMt5ConnectionResult>;
  testCloudMt5Connection(userId: string, args: { accountId: string }): Promise<CloudMt5ConnectionResult>;
  syncCloudMt5Account(userId: string, args: { accountId: string }): Promise<CloudMt5ConnectionResult>;
  disconnectCloudMt5Account(userId: string, args: { accountId: string }): Promise<CloudMt5ConnectionResult>;
  setActiveAccount(userId: string, accountId: string | null): Promise<{ ok: true }>;
  getTradeHistory(userId: string, query: TradeHistoryQuery): Promise<{ trades: BrokerTrade[]; labelsByTradeId: Record<string, { label: JournalLabel; note?: string | null; updatedAt: string }> }>;
  labelTrade(userId: string, args: { tradeId: string; accountId: string; label: JournalLabel; note?: string | null }): Promise<{ ok: true }>;
  getJournalAnalytics(userId: string, query: { accountId: string; from?: string; to?: string }): Promise<JournalAnalytics>;
}
