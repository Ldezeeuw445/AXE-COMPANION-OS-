import type { AccountKind } from "@/lib/risk/accountProfile";

export type HomeAccount = {
  id: string;
  label: string;
  kind: AccountKind;
  kindLabel: string;
  equity: number | null;
  balance: number | null;
  currency: string | null;
  realizedNet: number | null;
  isActive: boolean;
  isProp: boolean;
  firmName: string | null;
  firmModel: string | null;
  maxDailyLossPct: number | null;
  maxTotalLossPct: number | null;
  lastSyncAt: string | null;
};

export type HomeQuote = {
  symbol: string;
  displaySymbol: string;
  price: number | null;
  changePercent: number | null;
  state: string;
};

export type HomePosition = {
  id: string;
  accountId: string | null;
  symbol: string;
  side: string;
  sideLabel: string;
  volume: number;
  openPrice: number | null;
  currentPrice: number | null;
  pnl: number | null;
  stopLoss: number | null;
  takeProfit: number | null;
  extra: string | null;
  pending: boolean;
};

export type HomeTrade = {
  id: string;
  accountId: string;
  accountLabel: string;
  symbol: string;
  side: string;
  pnl: number;
  fees: number;
  closeTime: string | null;
};

export type HomeJournalNote = {
  id: string;
  symbol: string | null;
  title: string;
  body: string;
  tag: string | null;
  createdAt: string;
};

export type HomeAlert = {
  id: string;
  symbol: string | null;
  title: string;
  subtitle: string;
  createdAt: string;
  triggeredAt: string | null;
  status: string;
};

export type HomeWallet = {
  id: string;
  label: string;
  chain: string;
  address: string;
  nativeAmount: number | null;
  nativeSymbol: string | null;
  usdEstimate: number | null;
};

export type HomeNewsItem = {
  id: string;
  title: string;
  source: string;
  url: string;
  publishedAt: string;
  sentiment: number | null;
  symbols: string[];
};

export type HomeEvent = {
  id: string;
  title: string;
  startsAt: string;
  impact: "low" | "medium" | "high" | "unknown";
  currency: string | null;
  country: string | null;
};

export type HomeMacroPoint = {
  id: string;
  label: string;
  value: number | null;
  units: string | null;
  observedAt: string | null;
};

export type HomeBriefItem = {
  tone: "ok" | "action" | "warn";
  k: string;
  v: string;
};

export type HomeStep = {
  id: string;
  title: string;
  subtitle: string;
};

export type HomeCockpitSummary = {
  alignmentScore: number | null;
  signalCount: number;
  calibrationState: string;
  calibrationMessage: string;
  canLearn: boolean;
};

export type HomePageData = {
  accounts: HomeAccount[];
  activeAccountId: string | null;
  quotes: HomeQuote[];
  positions: HomePosition[];
  positionsAccountId: string | null;
  trades: HomeTrade[];
  journal: HomeJournalNote[];
  alerts: HomeAlert[];
  wallets: HomeWallet[];
  news: HomeNewsItem[];
  events: HomeEvent[];
  macro: HomeMacroPoint[];
  brief: HomeBriefItem[];
  briefTitle: string | null;
  steps: HomeStep[];
  figuresFromCache: boolean;
  loadError: string | null;
};

export function emptyHomePageData(): HomePageData {
  return {
    accounts: [],
    activeAccountId: null,
    quotes: [],
    positions: [],
    positionsAccountId: null,
    trades: [],
    journal: [],
    alerts: [],
    wallets: [],
    news: [],
    events: [],
    macro: [],
    brief: [],
    briefTitle: null,
    steps: [],
    figuresFromCache: false,
    loadError: null,
  };
}

export function kindLabel(kind: AccountKind): string {
  switch (kind) {
    case "prop_funded":
      return "Funded";
    case "prop_evaluation":
      return "Challenge";
    case "live":
      return "Live";
    case "demo":
      return "Demo";
    default:
      return "Account";
  }
}
