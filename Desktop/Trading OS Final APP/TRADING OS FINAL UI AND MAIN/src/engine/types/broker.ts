export type BrokerProvider = 'mt5';

export type BrokerAccountStatus = 'active' | 'disabled';

/** How the account is linked: in-app cloud connector vs local EA / ingest token. */
export type BrokerConnectionMethod = 'cloud_mt5' | 'local_bridge';

export type CloudMt5ConnectionResult = {
  ok: boolean;
  code?: string;
  message?: string;
  accountId?: string;
  /** Populated by sync action */
  dealsFetched?: number;
  dealsUpserted?: number;
  positions?: number;
};

export type CreateCloudMt5ConnectionArgs = {
  label: string;
  mt5Login: string;
  mt5Server: string;
  investorPassword: string;
  region?: string;
  readOnlyConfirmed: boolean;
};

export type BrokerAccount = {
  id: string;
  userId: string;
  provider: BrokerProvider;
  label: string;
  status: BrokerAccountStatus;
  mt5Login?: string | null;
  mt5Server?: string | null;
  connectionMethod: BrokerConnectionMethod;
  externalConnectionId?: string | null;
  providerStatus?: string | null;
  lastSyncAt?: string | null;
  maskedLogin?: string | null;
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
};

export type TradeSide = 'buy' | 'sell';

export type BrokerTrade = {
  id: string;
  userId: string;
  accountId: string;
  externalTradeId: string;
  symbol: string;
  side: TradeSide;
  volume: number;
  openTime?: string | null;
  closeTime?: string | null;
  openPrice?: number | null;
  closePrice?: number | null;
  pnl: number;
  fees: number;
  createdAt: string;
  updatedAt: string;
};

export type JournalLabel =
  | 'PerfectlyExecuted'
  | 'Good'
  | 'Impatient'
  | 'EmotionalWreck'
  | 'VeryStupid';

export type TradeJournalLabel = {
  tradeId: string;
  userId: string;
  accountId: string;
  label: JournalLabel;
  note?: string | null;
  updatedAt: string;
};

export type TradeHistoryQuery = {
  accountId: string;
  from?: string; // ISO date
  to?: string; // ISO date
  symbol?: string;
  label?: JournalLabel | 'all';
  limit?: number;
};

export type JournalAnalytics = {
  accountId: string;
  from?: string;
  to?: string;
  trades: number;
  wins: number;
  losses: number;
  winRate: number; // 0..1
  grossProfit: number;
  grossLoss: number; // negative or 0
  profitFactor: number | null;
  totalPnl: number;
  avgWin: number | null;
  avgLoss: number | null;
  labels: Record<JournalLabel, number>;
};

