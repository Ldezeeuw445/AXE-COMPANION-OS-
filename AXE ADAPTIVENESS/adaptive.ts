export type AdaptiveEventType =
  | "chart_opened"
  | "chart_symbol_selected"
  | "chart_timeframe_selected"
  | "chart_indicator_enabled"
  | "chart_indicator_disabled"
  | "chart_mode_enabled"
  | "chart_mode_disabled"
  | "chart_quick_action_used"
  | "chart_fib_drawn"
  | "chart_fib_adjusted"
  | "chart_fib_confirmed"
  | "cockpit_opened"
  | "journal_opened"
  | "journal_entry_created"
  | "journal_entry_tagged"
  | "alignment_feedback_viewed"
  | "behavior_map_viewed"
  | "morning_briefing_opened"
  | "morning_briefing_pair_clicked"
  | "morning_briefing_suggestion_accepted"
  | "morning_briefing_suggestion_dismissed"
  | "adaptive_suggestion_shown"
  | "adaptive_suggestion_accepted"
  | "adaptive_suggestion_dismissed";

export type AdaptiveSuggestionKind =
  | "fib_style_default"
  | "session_briefing_focus"
  | "quick_action_pin"
  | "chart_mode_default";

export type AdaptiveSuggestionStatus =
  | "pending"
  | "accepted"
  | "dismissed"
  | "expired";

export type AdaptiveUiEvent = {
  id?: string;
  userId: string;
  accountId?: string | null;
  eventType: AdaptiveEventType;
  route: string;
  sessionId?: string | null;
  occurredAt?: string;
  payload: Record<string, unknown>;
};

export type AdaptiveUiClientEvent = {
  accountId?: string | null;
  eventType: AdaptiveEventType;
  route: string;
  sessionId?: string | null;
  occurredAt?: string;
  payload: Record<string, unknown>;
};

export type AdaptiveAccountProfile = {
  accountId: string;
  broker: "mt5" | "alpaca" | "ibkr" | "demo" | "unknown";
  preferredSymbol: string | null;
  preferredTimeframes: string[];
  enabledIndicators: string[];
  preferredChartModes: string[];
  topQuickActions: string[];
  preferredSessions: string[];
  pinnedQuickActions?: string[];
  defaultChartMode?: string | null;
  confidence: {
    symbol: number;
    timeframes: number;
    indicators: number;
    chartModes: number;
    quickActions: number;
    sessionPreference: number;
  };
};

export type AdaptiveGlobalPreferences = {
  briefingTone: "calm" | "focused" | "direct";
  morningBriefingOptIn: boolean;
  weatherOptIn: boolean;
  locationOptIn: boolean;
  coachingSensitivity: "low" | "medium" | "high";
  briefingSessionOverride?: "asia" | "london" | "newyork" | "mixed" | null;
  fibStyleOverride?: string | null;
};

export type AdaptiveBehaviorSignals = {
  likelyFibStyle: {
    id: string | null;
    confidence: number;
    evidenceCount: number;
  };
  likelySessionFocus: {
    id: "asia" | "london" | "newyork" | "mixed" | null;
    confidence: number;
  };
  fatigueRisk: {
    overtrading: number;
    revenge: number;
    inconsistency: number;
  };
};

export type AdaptiveSuggestionState = {
  id: string;
  kind: AdaptiveSuggestionKind;
  accountId?: string;
  status: AdaptiveSuggestionStatus;
  payload: Record<string, unknown>;
  createdAt: string;
  resolvedAt: string | null;
};

export type AdaptiveTradingProfile = {
  userId: string;
  accountProfiles: AdaptiveAccountProfile[];
  globalPreferences: AdaptiveGlobalPreferences;
  behaviorSignals: AdaptiveBehaviorSignals;
  suggestionState: AdaptiveSuggestionState[];
  updatedAt: string;
};

export type AdaptiveUiDecisionSet = {
  chart: {
    defaultSymbol: string | null;
    defaultTimeframes: string[];
    enabledIndicators: string[];
    chartModes: string[];
    topQuickActions: string[];
    fibMode?: string | null;
  };
  cockpit: {
    preferredSessions: string[];
    preferredInstruments: string[];
    highlightPatterns: string[];
  };
  briefing: {
    greeting: string;
    includeWeather: boolean;
    sessionFocus: string | null;
    preferredPairs: string[];
    tacticalPromptStyle: "calm" | "focused" | "direct";
  };
  suggestions: AdaptiveSuggestionState[];
};

export type AdaptiveUiProfileRow = {
  user_id: string;
  profile: AdaptiveTradingProfile;
  updated_at: string;
};

export type AdaptiveUiSuggestionRow = {
  id: string;
  user_id: string;
  account_id: string | null;
  kind: AdaptiveSuggestionKind;
  status: AdaptiveSuggestionStatus;
  payload: Record<string, unknown>;
  created_at: string;
  resolved_at: string | null;
};
