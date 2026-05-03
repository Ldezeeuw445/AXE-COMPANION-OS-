import type { WatchlistEntry, TerminalAlert, TerminalExecution } from "@/services/axeService";

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
};
