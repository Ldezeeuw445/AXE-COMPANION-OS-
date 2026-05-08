/** Shared types for the Market Context layer. */

export type ProviderId =
  | "fred"
  | "perigon"
  | "finnhub"
  | "eodhd"
  | "unusualWhales"
  | "demo";

export type ProviderState = "live" | "missing_config" | "demo" | "error";

export type ProviderStatus = {
  id: ProviderId;
  label: string;
  state: ProviderState;
  description?: string;
};

export type MacroSnapshotPoint = {
  /** FRED series id (e.g. DGS10). */
  seriesId: string;
  /** Human title. */
  label: string;
  /** Latest observation value as a number (parsed from FRED). */
  value: number | null;
  /** Latest observation date (YYYY-MM-DD). */
  observedAt: string | null;
  /** Optional units description. */
  units?: string;
};

export type MacroSnapshot = {
  source: "fred";
  generatedAt: string;
  symbol: string;
  points: MacroSnapshotPoint[];
};

export type NewsItem = {
  id: string;
  title: string;
  summary?: string | null;
  url: string;
  source: string;
  publishedAt: string;
  /** Provider id that returned the item. */
  provider: ProviderId;
  /** Optional symbols extracted by the provider. */
  symbols?: string[];
  /** Optional sentiment hint when provider supplies it (-1..1). */
  sentiment?: number | null;
  imageUrl?: string | null;
};

export type EconomicEvent = {
  id: string;
  title: string;
  country: string | null;
  currency: string | null;
  /** ISO timestamp. */
  startsAt: string;
  /** "low" | "medium" | "high" — providers map to this. */
  impact: "low" | "medium" | "high" | "unknown";
  actual?: number | string | null;
  forecast?: number | string | null;
  previous?: number | string | null;
  unit?: string | null;
  provider: ProviderId;
};

export type MarketContext = {
  symbol: string;
  /** Watchlist + active symbol used as filter set. */
  symbols: string[];
  generatedAt: string;
  macro: MacroSnapshot | null;
  news: NewsItem[];
  events: EconomicEvent[];
  providers: ProviderStatus[];
  /** True when at least one live provider returned content. */
  hasLiveData: boolean;
};
