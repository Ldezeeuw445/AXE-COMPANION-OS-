// ================================================================
// News Extras — three small symbol-aware panels that fit around
// the news terminal to fill empty layout space.
// ================================================================

// ------------------ Alerts ------------------

export type AlertCategory =
  | 'price'
  | 'technical'
  | 'volume'
  | 'short_interest'
  | 'options'
  | 'news'
  | 'macro';

export interface AlertTemplate {
  id: string;
  category: AlertCategory;
  title: string;                     // "Crosses 200MA"
  description: string;               // short subtitle
  paramSummary?: string;             // "> 5% / 1D"
  defaultEnabled?: boolean;
  badge?: string;                    // "POPULAR", "NEW" etc
}

export interface ActiveAlert {
  id: string;
  templateId: string;
  symbol: string | null;             // null for macro alerts
  title: string;                     // resolved for display
  detail: string;                    // e.g. "AAPL > $220"
  enabled: boolean;
  createdAt: string;                 // ISO
  lastTriggeredAt?: string | null;
}

export interface AlertsDataSource {
  listTemplates(args: { signal?: AbortSignal }): Promise<AlertTemplate[]>;
  listActive(args: { symbol?: string | null; signal?: AbortSignal }): Promise<ActiveAlert[]>;
  /** Create an alert from a template for the given symbol. */
  createFromTemplate(args: {
    templateId: string;
    symbol: string | null;
    signal?: AbortSignal;
  }): Promise<ActiveAlert>;
  toggle(args: { alertId: string; enabled: boolean; signal?: AbortSignal }): Promise<void>;
  remove(args: { alertId: string; signal?: AbortSignal }): Promise<void>;
}

// ------------------ Catalysts ------------------

export type CatalystKind =
  | 'earnings'
  | 'macro'
  | 'fed'
  | 'economic'
  | 'ipo'
  | 'dividend'
  | 'custom';

export type CatalystImpact = 'high' | 'medium' | 'low';

export interface Catalyst {
  id: string;
  kind: CatalystKind;
  title: string;                    // "FOMC Minutes", "TSLA Q1 Earnings"
  symbol?: string | null;           // for earnings / ticker-specific
  country?: string | null;          // for macro
  startAt: string;                  // ISO timestamp
  impact: CatalystImpact;
  note?: string | null;             // "BMO" / "AMC" / small detail
  sourceUrl?: string | null;
}

export interface CatalystsDataSource {
  fetchCatalysts(args: {
    windowHours?: number;
    symbol?: string | null;
    signal?: AbortSignal;
  }): Promise<{ catalysts: Catalyst[]; fetchedAt: string }>;
}

// ------------------ Hotkeys ------------------

export interface HotkeyRow {
  keys: string[];                    // ["j"], ["shift", "k"], ["/"]
  label: string;                     // "Next headline"
  group?: string;                    // "Navigation", "Feeds", etc.
}
