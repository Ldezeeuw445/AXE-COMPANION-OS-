/**
 * engine/factory.ts
 * =================
 * Factory — initializes entire engine + dashboard with one call.
 * Providers are always constructed (empty API keys → failed fetches / health tracking).
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { CacheEngine } from './core/cache';
import { InflightDeduper } from './core/dedupe';
import { SourceRouter } from './core/router';
import { ProviderHealthTracker } from './core/health';
import { MetricsCollector } from './core/metrics';
import { NewsService } from './services/newsService';
import { MacroService } from './services/macroService';
import { AccountService } from './services/accountService';
import { ChartService } from './services/chartService';
import type { ChartCredentialFlags, ChartProviderConfig } from './services/chartService';
import { ScannerService } from './services/scannerService';
import { AxeService } from './services/axeService';
import { BrokerTradesService } from './services/brokerTradesService';
import { DashboardService } from './services/dashboardService';
import { EarningsService } from './services/earningsService';
import { ContextService } from './services/contextService';
import { IntelService } from './services/intelService';
import type { ProviderCredentialSlot } from './types/dashboard';
import { EngineAdapter } from './adapter/engineAdapter';
import { FMPProvider } from './providers/fmp';
import { FREDProvider } from './providers/fred';
import { SupabaseProvider } from './providers/supabase';
import { PolygonProvider } from './providers/polygon';
import { TwelveDataProvider } from './providers/twelvedata';
import { YahooFinanceProvider } from './providers/yahoo';
import { FinnhubProvider } from './providers/finnhub';
import { NewsDataProvider } from './providers/newsdata';
import { TheNewsApiProvider } from './providers/thenewsapi';
import { PerigonProvider } from './providers/perigon';
import { OpenSkyProvider } from './providers/opensky';
import { AISStreamProvider } from './providers/aisstream';

export interface EngineConfig {
  supabase: SupabaseClient;
  /** Single key or comma-separated list (legacy + convenience). */
  fmpApiKey?: string;
  fredApiKey?: string;
  polygonApiKey?: string;
  twelvedataApiKey?: string;
  finnhubApiKey?: string;
  newsdataApiKey?: string;
  thenewsapiApiKey?: string;
  perigonApiKey?: string;
  openskyUsername?: string;
  openskyPassword?: string;
  aisstreamApiKey?: string;

  /** Preferred: pass multiple keys to spread credits + route on health/limits. */
  fmpApiKeys?: string[];
  fredApiKeys?: string[];
  polygonApiKeys?: string[];
  twelvedataApiKeys?: string[];
  finnhubApiKeys?: string[];
  newsdataApiKeys?: string[];
  thenewsapiApiKeys?: string[];
  perigonApiKeys?: string[];
  aisstreamApiKeys?: string[];
  cacheSize?: number;
  /**
   * When false (default), Yahoo is not registered for chart history — production uses Polygon / TwelveData / FMP only.
   * Opt-in: set `ENABLE_YAHOO_CHART_FALLBACK=true` on engine-proxy, or `VITE_ENABLE_YAHOO_CHART_FALLBACK=true` for local in-browser engine.
   */
  enableYahooChartFallback?: boolean;
}

export interface EngineInstance {
  adapter: EngineAdapter;
  core: {
    cache: CacheEngine;
    deduper: InflightDeduper;
    router: SourceRouter;
    health: ProviderHealthTracker;
    metrics: MetricsCollector;
  };
  services: {
    news: NewsService;
    context: ContextService;
    intel: IntelService;
    macro: MacroService;
    account: AccountService;
    chart: ChartService;
    scanner: ScannerService;
    earnings: EarningsService;
    axe: AxeService;
    brokerTrades: BrokerTradesService;
    dashboard: DashboardService;
  };
}

export function createEngine(config: EngineConfig): EngineInstance {
  const cache = new CacheEngine(config.cacheSize || 10000);
  const deduper = new InflightDeduper();
  const health = new ProviderHealthTracker();
  const router = new SourceRouter(health);
  const metrics = new MetricsCollector();

  const normalizeKeyList = (single?: string, list?: string[]): string[] => {
    const fromList = (list ?? []).map((s) => s.trim()).filter(Boolean);
    if (fromList.length > 0) return fromList;
    const fromSingle = (single ?? '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    return fromSingle;
  };

  const fmpKeys = normalizeKeyList(config.fmpApiKey, config.fmpApiKeys);
  const fredKeys = normalizeKeyList(config.fredApiKey, config.fredApiKeys);
  const polygonKeys = normalizeKeyList(config.polygonApiKey, config.polygonApiKeys);
  const twelvedataKeys = normalizeKeyList(config.twelvedataApiKey, config.twelvedataApiKeys);
  const finnhubKeys = normalizeKeyList(config.finnhubApiKey, config.finnhubApiKeys);
  const newsdataKeys = normalizeKeyList(config.newsdataApiKey, config.newsdataApiKeys);
  const thenewsapiKeys = normalizeKeyList(config.thenewsapiApiKey, config.thenewsapiApiKeys);
  const perigonKeys = normalizeKeyList(config.perigonApiKey, config.perigonApiKeys);
  const aisstreamKeys = normalizeKeyList(config.aisstreamApiKey, config.aisstreamApiKeys);
  const openskyUsername = (config.openskyUsername ?? '').trim();
  const openskyPassword = (config.openskyPassword ?? '').trim();

  const hasKeys = (keys: string[]) => keys.some((k) => k.trim().length > 0);
  const credentialSlots: ProviderCredentialSlot[] = [
    { domain: 'fmp', configured: hasKeys(fmpKeys), supabaseSecretNames: ['FMP_API_KEY', 'FMP_API_KEYS', 'FMP_API_KEY_*'] },
    { domain: 'fred', configured: hasKeys(fredKeys), supabaseSecretNames: ['FRED_API_KEY', 'FRED_API_KEYS', 'FRED_API_KEY_*'] },
    { domain: 'polygon', configured: hasKeys(polygonKeys), supabaseSecretNames: ['POLYGON_API_KEY', 'POLYGON_API_KEYS', 'POLYGON_API_KEY_*'] },
    { domain: 'twelvedata', configured: hasKeys(twelvedataKeys), supabaseSecretNames: ['TWELVEDATA_API_KEY', 'TWELVEDATA_API_KEYS', 'TWELVEDATA_API_KEY_*'] },
    { domain: 'finnhub', configured: hasKeys(finnhubKeys), supabaseSecretNames: ['FINNHUB_API_KEY', 'FINNHUB_API_KEYS', 'FINNHUB_API_KEY_*'] },
    { domain: 'newsdata', configured: hasKeys(newsdataKeys), supabaseSecretNames: ['NEWSDATA_API_KEY', 'NEWSDATA_API_KEYS', 'NEWSDATA_API_KEY_*'] },
    { domain: 'thenewsapi', configured: hasKeys(thenewsapiKeys), supabaseSecretNames: ['THENEWS_API_KEY', 'THENEWS_API_KEYS', 'THENEWS_API_KEY_*'] },
    { domain: 'perigon', configured: hasKeys(perigonKeys), supabaseSecretNames: ['PERIGON_API_KEY', 'PERIGON_API_KEYS', 'PERIGON_API_KEY_*'] },
    { domain: 'opensky', configured: Boolean(openskyUsername && openskyPassword), supabaseSecretNames: ['OPENSKY_USERNAME', 'OPENSKY_USER', 'OPENSKY_EMAIL', 'OPENSKY_PASSWORD', 'OPENSKY_PASS'] },
    { domain: 'aisstream', configured: hasKeys(aisstreamKeys), supabaseSecretNames: ['AISSTREAM_API_KEY', 'AISSTREAM_API_KEYS', 'AISSTREAM_API_KEY_*', 'AISSTREAM_KEY', 'AISSTREAM_KEYS', 'AISSTREAM_KEY_*'] },
    { domain: 'yahoo', configured: true, supabaseSecretNames: [] },
  ];

  // Always construct at least one FMP/FRED provider so services are never null.
  const fmpProviders =
    (fmpKeys.length > 0 ? fmpKeys : ['']).map((apiKey) => new FMPProvider({ apiKey }));
  const fredProviders =
    (fredKeys.length > 0 ? fredKeys : ['']).map((apiKey) => new FREDProvider({ apiKey }));

  const polygonProviders = polygonKeys.map((apiKey) => new PolygonProvider({ apiKey }));

  const polygonChartKeys = polygonKeys.map((k) => k.trim()).filter(Boolean);
  const polygonChartProviders = polygonChartKeys.map((apiKey) => new PolygonProvider({ apiKey }));
  const twelvedataChartKeys = twelvedataKeys.map((k) => k.trim()).filter(Boolean);
  const twelvedataChartProviders = twelvedataChartKeys.map((apiKey) => new TwelveDataProvider({ apiKey }));
  const fmpChartKeys = fmpKeys.map((k) => k.trim()).filter(Boolean);
  const fmpChartProviders = fmpChartKeys.map((apiKey) => new FMPProvider({ apiKey }));
  const finnhubProviders = finnhubKeys.map((apiKey) => new FinnhubProvider({ apiKey }));
  const newsdataProviders = newsdataKeys.map((apiKey) => new NewsDataProvider({ apiKey }));
  const thenewsapiProviders = thenewsapiKeys.map((apiKey) => new TheNewsApiProvider({ apiKey }));
  const perigonProviders = perigonKeys.map((apiKey) => new PerigonProvider({ apiKey }));
  const openskyProvider = new OpenSkyProvider({ username: openskyUsername, password: openskyPassword });
  const aisstreamProviders = (aisstreamKeys.length > 0 ? aisstreamKeys : ['']).map((apiKey) => new AISStreamProvider({ apiKey }));

  const yahooProvider = new YahooFinanceProvider();
  const enableYahooChartFallback = config.enableYahooChartFallback === true;
  const supabaseProvider = new SupabaseProvider(config.supabase);

  const news = new NewsService(
    cache,
    deduper,
    router,
    health,
    [
      ...fmpProviders.map((provider, idx) => ({
        id: `fmp_${idx + 1}`,
        provider,
        weight: 1.0,
        monthlyLimit: 7500,
        dailyLimit: 250,
        avgLatencyMs: 280,
        dataQuality: 0.9,
        costPerCall: 1,
      })),
      ...finnhubProviders.map((provider, idx) => ({
        id: `finnhub_${idx + 1}`,
        provider,
        weight: 0.85,
        monthlyLimit: 999999,
        dailyLimit: 500,
        avgLatencyMs: 420,
        dataQuality: 0.86,
        costPerCall: 1,
      })),
      ...perigonProviders.map((provider, idx) => ({
        id: `perigon_${idx + 1}`,
        provider,
        weight: 0.8,
        monthlyLimit: 999999,
        dailyLimit: 400,
        avgLatencyMs: 500,
        dataQuality: 0.85,
        costPerCall: 1,
      })),
      ...thenewsapiProviders.map((provider, idx) => ({
        id: `thenewsapi_${idx + 1}`,
        provider,
        weight: 0.75,
        monthlyLimit: 999999,
        dailyLimit: 400,
        avgLatencyMs: 520,
        dataQuality: 0.83,
        costPerCall: 1,
      })),
      ...newsdataProviders.map((provider, idx) => ({
        id: `newsdata_${idx + 1}`,
        provider,
        weight: 0.7,
        monthlyLimit: 999999,
        dailyLimit: 400,
        avgLatencyMs: 650,
        dataQuality: 0.8,
        costPerCall: 1,
      })),
    ],
  );

  const context = new ContextService(cache, deduper, router, health, [
    ...fmpProviders.map((provider, idx) => ({
      id: `fmp_${idx + 1}`,
      provider,
      weight: 1.0,
      monthlyLimit: 7500,
      dailyLimit: 250,
      avgLatencyMs: 300,
      dataQuality: 0.9,
      costPerCall: 1,
    })),
  ]);

  const intel = new IntelService(
    cache,
    deduper,
    router,
    health,
    [
      {
        id: 'opensky_1',
        provider: openskyProvider,
        weight: 1.0,
        monthlyLimit: 999999,
        dailyLimit: 999999,
        avgLatencyMs: 900,
        dataQuality: 0.75,
        costPerCall: 1,
      },
    ],
    [
      ...aisstreamProviders.map((provider, idx) => ({
        id: `aisstream_${idx + 1}`,
        provider,
        weight: 1.0,
        monthlyLimit: 999999,
        dailyLimit: 999999,
        avgLatencyMs: 900,
        dataQuality: 0.8,
        costPerCall: 1,
      })),
    ],
  );

  const macro = new MacroService(
    cache,
    deduper,
    router,
    health,
    fredProviders.map((provider, idx) => ({
      id: `fred_${idx + 1}`,
      provider,
      weight: 1.0,
      monthlyLimit: 3600,
      dailyLimit: 120,
      avgLatencyMs: 400,
      dataQuality: 0.95,
      costPerCall: 1,
    })),
  );

  const account = new AccountService(cache, deduper, router, health, [{
    id: 'supabase_1', provider: supabaseProvider, weight: 1.0,
  }]);

  const brokerTrades = new BrokerTradesService(cache, deduper, supabaseProvider);

  const chartConfigs: ChartProviderConfig[] = [
    ...polygonChartProviders.map((provider, idx) => ({
      id: `chart_polygon_${idx + 1}`,
      provider,
      weight: 0.95,
      monthlyLimit: 150,
      dailyLimit: 500,
      avgLatencyMs: 140,
      dataQuality: 0.93,
      supportedTimeframes: ['1M', '5M', '15M', '30M', '1H', '4H', '1D', '1W', '1MO'],
      costPerCall: 1,
    })),
    ...twelvedataChartProviders.map((provider, idx) => ({
      id: `chart_twelvedata_${idx + 1}`,
      provider,
      weight: 0.88,
      monthlyLimit: 24000,
      dailyLimit: 800,
      avgLatencyMs: 250,
      dataQuality: 0.88,
      supportedTimeframes: ['1M', '5M', '15M', '30M', '1H', '2H', '4H', '1D', '1W', '1MO'],
      costPerCall: 1,
    })),
    ...fmpChartProviders.map((provider, idx) => ({
      id: `chart_fmp_${idx + 1}`,
      provider,
      weight: 0.82,
      monthlyLimit: 7500,
      dailyLimit: 250,
      avgLatencyMs: 400,
      dataQuality: 0.86,
      supportedTimeframes: ['1D', '3D', '1W', '1MO'],
      costPerCall: 1,
    })),
    ...(enableYahooChartFallback
      ? [
          {
            id: 'yahoo_1',
            provider: yahooProvider,
            weight: 0.12,
            monthlyLimit: 5000,
            dailyLimit: 200,
            avgLatencyMs: 600,
            dataQuality: 0.75,
            supportedTimeframes: ['1M', '5M', '15M', '1H', '4H', '1D', '1W', '1MO'],
            costPerCall: 1,
          },
        ]
      : []),
  ];

  const chartCreds: ChartCredentialFlags = {
    polygon: polygonChartProviders.length > 0,
    twelvedata: twelvedataChartProviders.length > 0,
    fmp: fmpChartProviders.length > 0,
    yahooChartFallbackEnabled: enableYahooChartFallback,
  };

  const chart = new ChartService(cache, deduper, router, health, chartConfigs, chartCreds);

  const scanner = new ScannerService(cache, deduper, router, health, [
    ...fmpProviders.map((provider, idx) => ({
      id: `fmp_${idx + 1}`,
      provider,
      weight: 1.0,
      monthlyLimit: 7500,
      dailyLimit: 250,
      avgLatencyMs: 280,
      dataQuality: 0.90,
      costPerCall: 1,
    })),
    ...polygonProviders.map((provider, idx) => ({
      id: `polygon_${idx + 1}`,
      provider,
      weight: 0.8,
      monthlyLimit: 150,
      dailyLimit: 5,
      avgLatencyMs: 140,
      dataQuality: 0.93,
      costPerCall: 1,
    })),
  ]);

  const earnings = new EarningsService(cache, deduper, router, health, [
    ...fmpProviders.map((provider, idx) => ({
      id: `fmp_${idx + 1}`,
      provider,
      weight: 1.0,
      monthlyLimit: 7500,
      dailyLimit: 250,
      avgLatencyMs: 420,
      dataQuality: 0.9,
      costPerCall: 1,
    })),
  ]);

  const axe = new AxeService(cache, deduper, router, health, chart, [{
    id: 'supabase_1', provider: supabaseProvider, weight: 1.0,
  }]);

  const dashboard = new DashboardService({ cache, deduper, router, health, metrics, credentialSlots });

  const adapter = new EngineAdapter(
    news,
    context,
    intel,
    macro,
    account,
    chart,
    scanner,
    earnings,
    axe,
    dashboard,
    brokerTrades,
  );

  return {
    adapter,
    core: { cache, deduper, router, health, metrics },
    services: {
      news,
      context,
      intel,
      macro,
      account,
      chart,
      scanner,
      earnings,
      axe,
      brokerTrades,
      dashboard,
    },
  };
}
