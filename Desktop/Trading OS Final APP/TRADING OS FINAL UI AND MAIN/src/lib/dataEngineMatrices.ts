/**
 * Single source of truth for Engine Ops tables + DATA_ENGINE_MATRIX.md (keep in sync).
 * No secret values — names only.
 */

export const ENGINE_PROXY_ACTIONS = [
  'news',
  'getAnalystConsensus',
  'getRelativePerformance',
  'getKeyLevels',
  'getSentimentShort',
  'getCorporateJets',
  'getVesselStream',
  'macroSeries',
  'listMacroSeries',
  'getAccountSummary',
  'getOpenPositions',
  'getWatchlist',
  'getChart',
  'getScannerResults',
  'getEarningsCalendar',
  'getAxeContext',
  'getAxeMemory',
  'getAxeStatus',
  'getDashboard',
  'getMetricsHistory',
  'getEngineStatus',
] as const;

export const INTEL_PROXY_ACTIONS = ['corporateJets', 'insiderTrades', 'vesselStream', 'whaleTransactions'] as const;

/** Supabase Edge `engine-proxy` — set in Dashboard → Edge Functions → engine-proxy → Secrets */
export const ENGINE_PROXY_SECRETS = [
  'SUPABASE_URL',
  'SUPABASE_ANON_KEY',
  'ENGINE_SUPABASE_SERVICE_ROLE_KEY',
  'SUPABASE_SERVICE_ROLE_KEY',
  'SERVICE_ROLE_KEY',
  'FMP_API_KEY',
  'FMP_API_KEYS',
  'FMP_API_KEY_*',
  'FRED_API_KEY',
  'FRED_API_KEYS',
  'FRED_API_KEY_*',
  'POLYGON_API_KEY',
  'POLYGON_API_KEYS',
  'POLYGON_API_KEY_*',
  'TWELVEDATA_API_KEY',
  'TWELVEDATA_API_KEYS',
  'TWELVEDATA_API_KEY_*',
  'FINNHUB_API_KEY',
  'FINNHUB_API_KEYS',
  'FINNHUB_API_KEY_*',
  'NEWSDATA_API_KEY',
  'NEWSDATA_API_KEYS',
  'NEWSDATA_API_KEY_*',
  'THENEWS_API_KEY',
  'THENEWS_API_KEYS',
  'THENEWS_API_KEY_*',
  'PERIGON_API_KEY',
  'PERIGON_API_KEYS',
  'PERIGON_API_KEY_*',
  'OPENSKY_USERNAME',
  'OPENSKY_USER',
  'OPENSKY_EMAIL',
  'OPENSKY_PASSWORD',
  'OPENSKY_PASS',
  'AISSTREAM_API_KEY',
  'AISSTREAM_API_KEYS',
  'AISSTREAM_API_KEY_*',
  'AISSTREAM_KEY',
  'AISSTREAM_KEYS',
  'AISSTREAM_KEY_*',
] as const;

/** Supabase Edge `intel-proxy` */
export const INTEL_PROXY_SECRETS = [
  'SUPABASE_URL',
  'SUPABASE_ANON_KEY',
  'OPENSKY_USERNAME',
  'OPENSKY_PASSWORD',
  'FMP_API_KEY',
  'FMP_API_KEYS',
  'FMP_API_KEY_*',
  'AISSTREAM_API_KEY',
  'AISSTREAM_API_KEYS',
  'AISSTREAM_API_KEY_*',
  'WHALEALERT_API_KEY',
  'WHALEALERT_API_KEYS',
  'WHALEALERT_API_KEY_*',
] as const;

/** Vite client (public bundle) */
export const VITE_CLIENT_ENV = [
  'VITE_SUPABASE_URL',
  'VITE_SUPABASE_ANON_KEY',
  'VITE_USE_ENGINE_EDGE',
  'VITE_ENGINE_PROXY_URL',
  'VITE_LIVE_ENGINE_WS_URL',
  'VITE_TRADING_TERMINAL_API_URL',
  'VITE_VESSEL_FEED_LIVE',
  'VITE_FMP_API_KEY',
  'VITE_FRED_API_KEY',
  'VITE_POLYGON_API_KEY',
  'VITE_TWELVEDATA_API_KEY',
] as const;

export type PageMatrixRow = {
  page: string;
  primaryAdapter: string;
  mode: 'live' | 'stub' | 'mixed' | 'n/a';
  engineProxy?: string;
  intelProxy?: string;
  secrets: string;
  blocker?: string;
};

export const PAGE_DATA_MATRIX: PageMatrixRow[] = [
  { page: 'Chart / TradingTerminal', primaryAdapter: 'getTradingAdapter().getChart', mode: 'live', engineProxy: 'getChart', secrets: 'FMP/POLYGON/TWELVEDATA; optional Yahoo only if ENABLE_YAHOO_CHART_FALLBACK=true', blocker: undefined },
  { page: 'MacroTerminal', primaryAdapter: 'macroSeries → getTradingAdapter().macroSeries', mode: 'live', engineProxy: 'macroSeries', secrets: 'FRED_*', blocker: 'Falls back to MACRO_DEFS if engine empty' },
  { page: 'News (center + context rails)', primaryAdapter: 'news + getAnalystConsensus/getRelativePerformance/getKeyLevels/getSentimentShort', mode: 'mixed', engineProxy: 'news + context actions', secrets: 'FMP + optional FINNHUB/NEWSDATA/THENEWS/PERIGON_*', blocker: 'QuickAlerts/NextCatalysts still stub (marked in UI)' },
  { page: 'MarketScanner', primaryAdapter: 'scannerRun → getScannerResults', mode: 'live', engineProxy: 'getScannerResults', secrets: 'FMP_* + POLYGON_*', blocker: 'Empty engine → built-in mock list' },
  { page: 'Heatmap (market tab)', primaryAdapter: 'heatmapMarketSnapshot → scannerRun', mode: 'mixed', engineProxy: 'getScannerResults', secrets: 'same as scanner', blocker: 'Shows seed until scanner returns rows' },
  { page: 'Intel (jets/vessels)', primaryAdapter: 'getTradingAdapter().getCorporateJets + getVesselStream', mode: 'mixed', engineProxy: 'getCorporateJets + getVesselStream', secrets: 'OPENSKY_*; AISSTREAM_*', blocker: 'Insiders/whales still via intel-proxy legacy; senate/darkpool always stub' },
  { page: 'EngineOps', primaryAdapter: 'getDashboard + getMetricsHistory + getEngineStatus', mode: 'live', engineProxy: 'all three', secrets: 'same as engine boot', blocker: undefined },
  { page: 'Onboarding', primaryAdapter: 'fetchOnboardingOptions', mode: 'live', secrets: 'SUPABASE_URL + SUPABASE_ANON_KEY on onboarding-options function', blocker: 'Edge function must be deployed' },
  { page: 'PolymarketIntel', primaryAdapter: 'gammaPublicSearch (engineAdapter export)', mode: 'mixed', secrets: 'None (public Gamma REST)', blocker: 'KPI strip + watchlist still demo UI' },
  { page: 'EarningsCalendar', primaryAdapter: 'getTradingAdapter().getEarningsCalendar', mode: 'live', engineProxy: 'getEarningsCalendar', secrets: 'FMP_*', blocker: undefined },
  { page: 'QuantLab', primaryAdapter: 'runBacktest()', mode: 'stub', secrets: '—', blocker: 'No engine backtest' },
  { page: 'Analyses', primaryAdapter: 'StubAnalysesDataSource', mode: 'stub', secrets: '—', blocker: 'No engine API' },
  { page: 'AiDataCenterMap', primaryAdapter: 'aiDataCenters via createEngineAiDataCenterDataSource', mode: 'stub', secrets: '—', blocker: 'aiDataCenters() is PLACEHOLDER until Supabase table' },
  {
    page: 'Main dashboard',
    primaryAdapter: 'getAccountSummary, getWatchlist, getOpenPositions, getDashboard (optional)',
    mode: 'mixed',
    engineProxy: 'getAccountSummary, getWatchlist, getOpenPositions, getDashboard',
    secrets: 'Supabase user tables via engine; same Edge session as rest',
    blocker:
      'Workspace category strip + account balances now live from watchlist context + AccountSummary; wallets / performance calendar / most STATS rows still static or EM',
  },
  {
    page: 'AxeCompanion',
    primaryAdapter: 'getAxeContext(symbol,1H,userId), getAxeMemory(userId,symbol), getAxeStatus(userId)',
    mode: 'live',
    engineProxy: 'getAxeContext, getAxeMemory, getAxeStatus',
    secrets: 'Supabase + chart providers for context',
    blocker: 'Voice, attachments, mobile CTA, integration checklists still non-data',
  },
  { page: 'BigMacIndex', primaryAdapter: 'iframe static asset', mode: 'stub', secrets: '—', blocker: 'External embed' },
  { page: 'Auth / Settings', primaryAdapter: 'supabaseAuth only', mode: 'n/a', secrets: 'VITE_SUPABASE_*', blocker: undefined },
  {
    page: 'Journal / Notes workspace',
    primaryAdapter: 'userWorkspaceCloud (hybrid local + Supabase)',
    mode: 'mixed',
    secrets: 'VITE_SUPABASE_* (RLS tables user_trading_notes, user_journal_entries)',
    blocker: 'Guests: localStorage only; signed-in requires migrations applied',
  },
  {
    page: 'Workspace prefs (watchlist, symbol, beginner)',
    primaryAdapter: 'userPreferencesCloud + WorkspacePreferencesSync',
    mode: 'mixed',
    secrets: 'VITE_SUPABASE_* (RLS table user_workspace_preferences)',
    blocker: 'Guests: localStorage; cloud row created on first signed-in session after migration',
  },
];
