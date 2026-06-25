/**
 * engine/adapter/engineAdapter.ts
 * ===============================
 * The ONLY layer the UI talks to (new modular engine).
 */

import type { NewsItem, NewsFilter } from '../types/news';
import type { MacroSeries, MacroFilter } from '../types/macro';
import type { AccountSummary, Position, WatchlistItem } from '../types/account';
import type { ChartData } from '../types/chart';
import type { ScannerResult, ScannerFilter } from '../types/scanner';
import type { EarningsEvent } from '../types/earnings';
import type { AnalystConsensusData, RelativePerformanceData, KeyLevelsData, SentimentShortData } from '../types/context';
import type { AxeContext, AxeMemoryItem, AxeStatus } from '../types/axe';
import type { DashboardData, HistoricalMetrics } from '../types/dashboard';
import type {
  BrokerAccount,
  BrokerTrade,
  CloudMt5ConnectionResult,
  CreateCloudMt5ConnectionArgs,
  JournalAnalytics,
  JournalLabel,
  TradeHistoryQuery,
} from '../types/broker';
import { invokeAxeMt5Cloud } from '@/lib/axeMt5CloudInvoke';

import { NewsService } from '../services/newsService';
import { ContextService } from '../services/contextService';
import { IntelService } from '../services/intelService';
import { MacroService } from '../services/macroService';
import { AccountService } from '../services/accountService';
import { ChartService } from '../services/chartService';
import { ScannerService } from '../services/scannerService';
import { EarningsService } from '../services/earningsService';
import { AxeService } from '../services/axeService';
import { DashboardService } from '../services/dashboardService';
import { BrokerTradesService } from '../services/brokerTradesService';
import type { TradingAdapterFacade } from './tradingAdapterFacade';

export class EngineAdapter implements TradingAdapterFacade {
  private readonly newsService: NewsService;
  private readonly contextService: ContextService;
  private readonly intelService: IntelService;
  private readonly macroService: MacroService;
  private readonly accountService: AccountService;
  private readonly chartService: ChartService;
  private readonly scannerService: ScannerService;
  private readonly earningsService: EarningsService;
  private readonly axeService: AxeService;
  private readonly dashboardService: DashboardService;
  private readonly brokerTradesService: BrokerTradesService;

  constructor(
    newsService: NewsService,
    contextService: ContextService,
    intelService: IntelService,
    macroService: MacroService,
    accountService: AccountService,
    chartService: ChartService,
    scannerService: ScannerService,
    earningsService: EarningsService,
    axeService: AxeService,
    dashboardService: DashboardService,
    brokerTradesService: BrokerTradesService,
  ) {
    this.newsService = newsService;
    this.contextService = contextService;
    this.intelService = intelService;
    this.macroService = macroService;
    this.accountService = accountService;
    this.chartService = chartService;
    this.scannerService = scannerService;
    this.earningsService = earningsService;
    this.axeService = axeService;
    this.dashboardService = dashboardService;
    this.brokerTradesService = brokerTradesService;
  }

  async news(symbol?: string, filters?: Omit<NewsFilter, 'symbol'>): Promise<NewsItem[]> {
    return this.newsService.getNews({ symbol, ...filters });
  }

  getAnalystConsensus(symbol: string): Promise<AnalystConsensusData | null> {
    return this.contextService.getAnalystConsensus(symbol);
  }

  getRelativePerformance(symbol: string): Promise<RelativePerformanceData | null> {
    return this.contextService.getRelativePerformance(symbol);
  }

  getKeyLevels(symbol: string): Promise<KeyLevelsData | null> {
    return this.contextService.getKeyLevels(symbol);
  }

  getSentimentShort(symbol: string): Promise<SentimentShortData | null> {
    return this.contextService.getSentimentShort(symbol);
  }

  getCorporateJets() {
    return this.intelService.getCorporateJets();
  }

  getVesselStream() {
    return this.intelService.getVesselStream();
  }

  async macroSeries(key: string, range?: MacroFilter['range']): Promise<MacroSeries> {
    return this.macroService.getSeries(key, { range });
  }

  async listMacroSeries(): Promise<{ key: string; name: string; unit: string; frequency: string }[]> {
    return this.macroService.listAvailableSeries();
  }

  async getAccountSummary(userId: string): Promise<AccountSummary> {
    return this.accountService.getSummary(userId);
  }

  async getOpenPositions(userId: string): Promise<Position[]> {
    return this.accountService.getOpenPositions(userId);
  }

  async getWatchlist(userId: string): Promise<WatchlistItem[]> {
    return this.accountService.getWatchlist(userId);
  }

  async getChart(symbol: string, timeframe: string, limit?: number): Promise<ChartData> {
    return this.chartService.getChart(symbol, timeframe, limit);
  }

  async getScannerResults(filter?: ScannerFilter): Promise<ScannerResult[]> {
    return this.scannerService.scan(filter);
  }

  async getEarningsCalendar(from: string, to: string): Promise<EarningsEvent[]> {
    return this.earningsService.getEarningsCalendar(from, to);
  }

  async getAxeContext(symbol: string, timeframe: string, userId: string): Promise<AxeContext> {
    return this.axeService.getContext(symbol, timeframe, userId);
  }

  async getAxeMemory(userId: string, symbol?: string): Promise<AxeMemoryItem[]> {
    return this.axeService.getMemory(userId, symbol);
  }

  async getAxeStatus(userId: string): Promise<AxeStatus> {
    return this.axeService.getStatus(userId);
  }

  async getDashboard(): Promise<DashboardData> {
    return this.dashboardService.getDashboard();
  }

  async getMetricsHistory(timeframe: '1H' | '24H' | '7D' | '30D'): Promise<HistoricalMetrics> {
    return this.dashboardService.getHistory(timeframe);
  }

  async getEngineStatus(): Promise<{ status: 'healthy' | 'degraded' | 'critical'; message: string }> {
    return this.dashboardService.getQuickStatus();
  }

  listBrokerAccounts(userId: string): Promise<BrokerAccount[]> {
    return this.brokerTradesService.listAccounts(userId);
  }

  createBrokerAccount(
    userId: string,
    args: { label: string; mt5Login?: string; mt5Server?: string },
  ): Promise<{ account: BrokerAccount; linkToken: string }> {
    return this.brokerTradesService.createAccount(userId, args);
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

  async setActiveAccount(userId: string, accountId: string | null): Promise<{ ok: true }> {
    await this.brokerTradesService.setActiveAccount(userId, accountId);
    return { ok: true };
  }

  getTradeHistory(
    userId: string,
    query: TradeHistoryQuery,
  ): Promise<{ trades: BrokerTrade[]; labelsByTradeId: Record<string, { label: JournalLabel; note?: string | null; updatedAt: string }> }> {
    return this.brokerTradesService.getTradeHistory(userId, query) as any;
  }

  async labelTrade(
    userId: string,
    args: { tradeId: string; accountId: string; label: JournalLabel; note?: string | null },
  ): Promise<{ ok: true }> {
    await this.brokerTradesService.labelTrade(userId, args);
    return { ok: true };
  }

  getJournalAnalytics(userId: string, query: { accountId: string; from?: string; to?: string }): Promise<JournalAnalytics> {
    return this.brokerTradesService.getAnalytics(userId, query);
  }
}
