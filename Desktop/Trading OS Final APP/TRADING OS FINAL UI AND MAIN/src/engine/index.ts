/**
 * engine/index.ts — barrel exports (verbatimModuleSyntax: type/value split).
 */

// Core
export type { Priority, SourcePolicy } from './core/policies';
export { DEFAULT_POLICIES } from './core/policies';
export { Normalizer } from './core/normalize';
export { CacheEngine } from './core/cache';
export type { CacheResult, CacheState } from './core/cache';
export { InflightDeduper } from './core/dedupe';
export { SourceRouter } from './core/router';
export type { ProviderConfig } from './core/router';
export { ProviderHealthTracker } from './core/health';
export type { ProviderHealth } from './core/health';
export { MetricsCollector } from './core/metrics';

// Types
export type { NewsItem, NewsFilter } from './types/news';
export type { MacroSeries, MacroDataPoint, MacroFilter } from './types/macro';
export type { AccountSummary, Position, WatchlistItem } from './types/account';
export type { ChartData, Candle, ChartFilter } from './types/chart';
export type { ScannerResult, ScannerFilter, ScannerMetric, HeatmapData } from './types/scanner';
export type {
  AxeContext,
  AxeMemoryItem,
  AxeStatus,
  AxeMemoryType,
  KeyLevel,
  Pattern,
  Signal,
} from './types/axe';
export type {
  DashboardData,
  EngineOverview,
  EfficiencyMetric,
  CacheMetric,
  InflightMetric,
  ProviderMetric,
  Recommendation,
  HistoricalMetrics,
  TimeSeriesPoint,
} from './types/dashboard';

// Services
export { NewsService } from './services/newsService';
export type { NewsProviderConfig } from './services/newsService';
export { MacroService } from './services/macroService';
export type { MacroProviderConfig } from './services/macroService';
export { AccountService } from './services/accountService';
export type { AccountProviderConfig } from './services/accountService';
export { ChartService } from './services/chartService';
export type { ChartProviderConfig } from './services/chartService';
export { ScannerService } from './services/scannerService';
export type { ScannerProviderConfig } from './services/scannerService';
export { AxeService } from './services/axeService';
export type { AxeProviderConfig } from './services/axeService';
export { DashboardService } from './services/dashboardService';
export type { DashboardServiceConfig } from './services/dashboardService';

// Providers
export { FMPProvider } from './providers/fmp';
export type { FMPConfig } from './providers/fmp';
export { FREDProvider } from './providers/fred';
export type { FREDConfig } from './providers/fred';
export { SupabaseProvider } from './providers/supabase';
export { PolygonProvider } from './providers/polygon';
export type { PolygonConfig } from './providers/polygon';
export { TwelveDataProvider } from './providers/twelvedata';
export type { TwelveDataConfig } from './providers/twelvedata';
export { YahooFinanceProvider } from './providers/yahoo';
export type { YahooConfig } from './providers/yahoo';

// Adapter + factory
export type { TradingAdapterFacade } from './adapter/tradingAdapterFacade';
export { EngineAdapter } from './adapter/engineAdapter';
export { createEngine } from './factory';
export type { EngineConfig, EngineInstance } from './factory';
