import type { WatchlistEntry, TerminalAlert, TerminalExecution } from "@/services/axeService";
import type { MarketContext, ProviderStatus } from "@/lib/market/marketTypes";
import type { IntelProviderStatus } from "@/lib/intel/intelClient";

export type FilteredNewsEvent = {
  title: string;
  currency: string;
  date: string;
  time: string;
  impact: "High" | "Medium" | "Low" | "Holiday" | "Unknown";
  forecast: string;
  previous: string;
};

export type AccountState = {
  watchlist: WatchlistEntry[];
  recentAlerts: TerminalAlert[];
  recentExecutions: TerminalExecution[];
};

export type OpenCommitment = {
  id: string;
  symbol: string | null;
  description: string;
  created_at: string;
};

export type Mt5AccountSnapshot = {
  account_id: string;
  balance: number | null;
  equity: number | null;
  margin: number | null;
  free_margin: number | null;
  leverage: number | null;
  currency: string | null;
  server: string | null;
  name: string | null;
  updated_at: string;
};

export type Mt5Position = {
  id: string;
  account_id: string;
  symbol: string;
  type: "BUY" | "SELL";
  volume: number;
  open_price: number;
  current_price: number | null;
  profit: number | null;
  swap: number | null;
  stop_loss: number | null;
  take_profit: number | null;
  opened_at: string | null;
  comment: string | null;
};

export type Mt5ClosedPosition = {
  id: string;
  account_id: string;
  symbol: string;
  type: "BUY" | "SELL";
  volume: number;
  open_price: number;
  close_price: number;
  profit: number | null;
  swap: number | null;
  commission: number | null;
  opened_at: string | null;
  closed_at: string;
  close_reason: string | null;
  comment: string | null;
};

/** Companion-linked broker accounts (MT5 ingest / user_broker_accounts). */
export type CompanionBrokerAccount = {
  id: string;
  label: string;
  provider: string;
  status: string | null;
};

/** Closed trades from broker_trades (same ledger as History). */
export type CompanionBrokerTrade = {
  id: string;
  symbol: string;
  side: string;
  volume: number;
  pnl: number;
  close_time: string | null;
};

export type CompanionTradeLabel = {
  trade_id: string;
  symbol: string;
  label: string | null;
  note: string | null;
};

export type CompanionJournalEntry = {
  symbol: string;
  notes: string;
  created_at: string;
};

/**
 * Compact smart-money intel snapshot fed by Unusual Whales via the
 * Supabase intel-proxy. Kept minimal so it can ride inside the AXE
 * desk context without blowing up the prompt.
 */
export type IntelSummary = {
  /** ISO timestamp of when this snapshot was assembled. */
  generatedAt: string;
  /** Bias from market tide: "bullish" | "bearish" | "neutral". */
  tideBias: "bullish" | "bearish" | "neutral" | null;
  /** Net call premium in USD (positive = bullish flow). */
  netCallPremium: number | null;
  /** Net put premium in USD (negative typical when puts dominate). */
  netPutPremium: number | null;
  /** Top-3 insider transactions (ticker, name, side, value). */
  topInsiders: Array<{
    ticker: string;
    insider: string;
    type: "BUY" | "SELL";
    value: number;
    date: string;
  }>;
  /** Top-3 congressional disclosures. */
  topCongress: Array<{
    politician: string;
    chamber: string;
    ticker: string;
    direction: "BUY" | "SELL";
    size: string;
    date: string;
  }>;
  /** Top-3 dark pool prints by notional. */
  topDarkPool: Array<{
    symbol: string;
    notional: number;
    size: number;
    price: number;
  }>;
  /** Top-3 unusual options flow alerts by premium. */
  topOptions: Array<{
    symbol: string;
    side: "CALL" | "PUT";
    strike: number;
    exp: string;
    premium: number;
  }>;
};

export type TradingOSContext = {
  symbol: string | null;
  timeframe: string | null;
  filtered_news: FilteredNewsEvent[];
  account_state: AccountState;
  user_memory: { scope: string; entry_key: string | null; content: string }[];
  candles_summary: string | null;
  key_levels: string[];
  open_commitments: OpenCommitment[];
  live_account: Mt5AccountSnapshot | null;
  live_positions: Mt5Position[];
  closed_positions: Mt5ClosedPosition[];
  /** Assembled retrieval block (knowledge + journal + broker snapshot + rules). */
  knowledge_layer: string | null;
  /** AXE Companion — linked broker rows (RLS). */
  companion_accounts: CompanionBrokerAccount[];
  companion_active_account_id: string | null;
  companion_broker_trades: CompanionBrokerTrade[];
  companion_trade_labels: CompanionTradeLabel[];
  companion_journal_entries: CompanionJournalEntry[];
  /** Compact UnusualWhales smart-money snapshot for the active symbol (top rows only). */
  intel_summary: IntelSummary | null;
  /** AXE Companion-native context, kept alongside legacy fields during migration. */
  axe_context?: AxeCompanionContext;
};

export type ContextHealthState = "ready" | "partial" | "empty" | "timeout" | "error";

export type ContextHealth = {
  section:
    | "settings"
    | "accounts"
    | "chart"
    | "trades"
    | "intel"
    | "alerts"
    | "market"
    | "memory"
    | "legacy";
  state: ContextHealthState;
  message?: string;
  updatedAt?: string | null;
};

export type AxeMemoryEntry = {
  scope: string;
  entryKey: string | null;
  content: string;
};

export type SettingsUserContext = {
  profile: {
    displayName: string | null;
    timezone: string | null;
  };
  pinnedContext: string | null;
  accountName: string | null;
  watchlist: WatchlistEntry[];
  push: {
    subscribed: boolean;
    subscriptionCount: number;
  };
  liveTradingEnabled: boolean;
};

export type AccountsContext = {
  activeAccountId: string | null;
  accounts: Array<{
    id: string;
    label: string;
    provider: string;
    status: string | null;
    connectionMethod: string | null;
    providerStatus: string | null;
    lastSyncAt: string | null;
    maskedLogin: string | null;
    mt5Server: string | null;
    active: boolean;
  }>;
  hasCloudMt5: boolean;
  activeLabel: string | null;
  activeServer: string | null;
};

export type ChartContext = {
  symbol: string | null;
  timeframe: string | null;
  brokerSymbol: string | null;
  accountId: string | null;
  lastPrice: number | null;
  lastBid: number | null;
  lastAsk: number | null;
  lastTickAt: string | null;
  lastCandleAt: string | null;
  liveStatus: string | null;
  source: string | null;
  updatedAt: string | null;
  openPositionsCount: number | null;
};

export type TradesJournalContext = {
  activeAccountId: string | null;
  recentTrades: CompanionBrokerTrade[];
  labels: CompanionTradeLabel[];
  journalEntries: CompanionJournalEntry[];
  analytics: {
    totalTrades: number;
    totalPnl: number;
    wins: number;
    losses: number;
  };
};

export type IntelContext = {
  symbol: string | null;
  summary: IntelSummary | null;
  providers: IntelProviderStatus[];
  cache: {
    state: "fresh" | "stale" | "empty";
    ageSeconds: number | null;
    message?: string;
  };
  hasLiveData: boolean;
};

export type AlertsContext = {
  active: number;
  paused: number;
  triggered: number;
  recent: TerminalAlert[];
  symbolAlerts: TerminalAlert[];
};

export type MarketContextSummary = {
  symbol: string | null;
  summary: string | null;
  providers: ProviderStatus[];
  hasLiveData: boolean;
  raw: MarketContext | null;
};

export type MemoryContext = {
  entries: AxeMemoryEntry[];
  openCommitments: OpenCommitment[];
};

export type AxeCompanionContext = {
  generatedAt: string;
  symbol: string | null;
  timeframe: string | null;
  settings: SettingsUserContext;
  accounts: AccountsContext;
  chart: ChartContext;
  trades: TradesJournalContext;
  intel: IntelContext;
  alerts: AlertsContext;
  market: MarketContextSummary;
  memory: MemoryContext;
  health: ContextHealth[];
  summary: string;
};
