import type {
  AdaptiveAccountProfile,
  AdaptiveBehaviorSignals,
  AdaptiveGlobalPreferences,
  AdaptiveSuggestionKind,
  AdaptiveSuggestionState,
  AdaptiveTradingProfile,
  AdaptiveUiClientEvent,
  AdaptiveUiDecisionSet,
  AdaptiveUiSuggestionRow,
} from "@/types/adaptive";

type AdaptiveEventRow = AdaptiveUiClientEvent & {
  userId?: string;
};

type CounterMap = Record<string, number>;

const EMPTY_GLOBAL_PREFERENCES: AdaptiveGlobalPreferences = {
  briefingTone: "focused",
  morningBriefingOptIn: true,
  weatherOptIn: false,
  locationOptIn: false,
  coachingSensitivity: "medium",
  briefingSessionOverride: null,
  fibStyleOverride: null,
};

function increment(map: CounterMap, key: string | null | undefined, amount = 1): CounterMap {
  if (!key) return map;
  const normalized = key.trim();
  if (!normalized) return map;
  return {
    ...map,
    [normalized]: (map[normalized] ?? 0) + amount,
  };
}

function topEntries(map: CounterMap, limit = 5): Array<[string, number]> {
  return Object.entries(map)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, limit);
}

function topKeys(map: CounterMap, limit = 5): string[] {
  return topEntries(map, limit).map(([key]) => key);
}

function totalCount(map: CounterMap): number {
  return Object.values(map).reduce((sum, value) => sum + value, 0);
}

function confidenceFromMap(map: CounterMap): number {
  const total = totalCount(map);
  if (total <= 0) return 0;
  const top = topEntries(map, 1)[0]?.[1] ?? 0;
  return Math.max(0, Math.min(1, top / total));
}

function sessionIdForIso(iso: string | null | undefined): "asia" | "london" | "newyork" {
  const date = iso ? new Date(iso) : new Date();
  const hour = date.getUTCHours();
  if (hour >= 2 && hour < 10) return "london";
  if (hour >= 13 && hour < 21) return "newyork";
  return "asia";
}

function sessionLabel(id: string): string {
  if (id === "london") return "London";
  if (id === "newyork") return "New York";
  return "Asia";
}

function mapSuggestionRows(rows: AdaptiveUiSuggestionRow[]): AdaptiveSuggestionState[] {
  return rows.map((row) => ({
    id: row.id,
    kind: row.kind,
    accountId: row.account_id ?? undefined,
    status: row.status,
    payload: row.payload,
    createdAt: row.created_at,
    resolvedAt: row.resolved_at,
  }));
}

export function createEmptyAdaptiveProfile(userId: string): AdaptiveTradingProfile {
  return {
    userId,
    accountProfiles: [],
    globalPreferences: { ...EMPTY_GLOBAL_PREFERENCES },
    behaviorSignals: {
      likelyFibStyle: { id: null, confidence: 0, evidenceCount: 0 },
      likelySessionFocus: { id: null, confidence: 0 },
      fatigueRisk: { overtrading: 0, revenge: 0, inconsistency: 0 },
    },
    suggestionState: [],
    updatedAt: new Date().toISOString(),
  };
}

export function deriveAdaptiveTradingProfile(input: {
  userId: string;
  events: AdaptiveEventRow[];
  suggestions?: AdaptiveUiSuggestionRow[];
}): AdaptiveTradingProfile {
  const byAccount = new Map<
    string,
    {
      symbols: CounterMap;
      timeframes: CounterMap;
      indicators: CounterMap;
      modes: CounterMap;
      actions: CounterMap;
      sessions: CounterMap;
    }
  >();
  let fibModes: CounterMap = {};
  let globalSessions: CounterMap = {};

  for (const event of input.events) {
    const payload = (event.payload ?? {}) as Record<string, unknown>;
    const accountId = event.accountId ?? "__global__";
    const state = byAccount.get(accountId) ?? {
      symbols: {},
      timeframes: {},
      indicators: {},
      modes: {},
      actions: {},
      sessions: {},
    };

    const symbol = typeof payload.symbol === "string" ? payload.symbol.toUpperCase() : null;
    const timeframe = typeof payload.timeframe === "string" ? payload.timeframe.toLowerCase() : null;
    const session = sessionIdForIso(event.occurredAt);

    state.sessions = increment(state.sessions, session);
    byAccount.set(accountId, state);
    globalSessions = increment(globalSessions, session);

    if (event.eventType === "chart_opened" || event.eventType === "chart_symbol_selected") {
      state.symbols = increment(state.symbols, symbol);
    }
    if (event.eventType === "chart_opened" || event.eventType === "chart_timeframe_selected") {
      state.timeframes = increment(state.timeframes, timeframe);
    }
    if (event.eventType === "chart_indicator_enabled") {
      const indicator = typeof payload.indicator === "string" ? payload.indicator : null;
      state.indicators = increment(state.indicators, indicator);
    }
    if (event.eventType === "chart_mode_enabled") {
      const mode = typeof payload.mode === "string" ? payload.mode : null;
      state.modes = increment(state.modes, mode);
    }
    if (event.eventType === "chart_quick_action_used") {
      const actionId = typeof payload.actionId === "string" ? payload.actionId : null;
      state.actions = increment(state.actions, actionId);
    }
    if (event.eventType === "chart_fib_adjusted" || event.eventType === "chart_fib_confirmed") {
      const fibMode = typeof payload.mode === "string" ? payload.mode : null;
      fibModes = increment(fibModes, fibMode);
    }
  }

  const accountProfiles: AdaptiveAccountProfile[] = Array.from(byAccount.entries())
    .filter(([accountId]) => accountId !== "__global__")
    .map(([accountId, state]) => ({
      accountId,
      broker: "unknown" as const,
      preferredSymbol: topKeys(state.symbols, 1)[0] ?? null,
      preferredTimeframes: topKeys(state.timeframes, 3),
      enabledIndicators: topKeys(state.indicators, 5),
      preferredChartModes: topKeys(state.modes, 5),
      topQuickActions: topKeys(state.actions, 5),
      pinnedQuickActions: [],
      defaultChartMode: null,
      preferredSessions: topKeys(state.sessions, 3),
      confidence: {
        symbol: confidenceFromMap(state.symbols),
        timeframes: confidenceFromMap(state.timeframes),
        indicators: confidenceFromMap(state.indicators),
        chartModes: confidenceFromMap(state.modes),
        quickActions: confidenceFromMap(state.actions),
        sessionPreference: confidenceFromMap(state.sessions),
      },
    }))
    .sort((a, b) => (b.confidence.symbol + b.confidence.quickActions) - (a.confidence.symbol + a.confidence.quickActions));

  const likelySession = topKeys(globalSessions, 1)[0] as AdaptiveBehaviorSignals["likelySessionFocus"]["id"];
  const likelyFibStyle = topKeys(fibModes, 1)[0] ?? null;

  return {
    userId: input.userId,
    accountProfiles,
    globalPreferences: { ...EMPTY_GLOBAL_PREFERENCES },
    behaviorSignals: {
      likelyFibStyle: {
        id: likelyFibStyle,
        confidence: confidenceFromMap(fibModes),
        evidenceCount: totalCount(fibModes),
      },
      likelySessionFocus: {
        id: likelySession,
        confidence: confidenceFromMap(globalSessions),
      },
      fatigueRisk: {
        overtrading: 0,
        revenge: 0,
        inconsistency: 0,
      },
    },
    suggestionState: mapSuggestionRows(input.suggestions ?? []),
    updatedAt: new Date().toISOString(),
  };
}

export function buildAdaptiveSuggestions(profile: AdaptiveTradingProfile): Array<{
  accountId?: string | null;
  kind: AdaptiveSuggestionKind;
  payload: Record<string, unknown>;
}> {
  const suggestions: Array<{
    accountId?: string | null;
    kind: AdaptiveSuggestionKind;
    payload: Record<string, unknown>;
  }> = [];

  const existingKeys = new Set(
    profile.suggestionState
      .filter((item) => item.status === "pending" || item.status === "accepted")
      .map((item) => `${item.kind}:${item.accountId ?? "global"}`),
  );

  for (const account of profile.accountProfiles) {
    if (
      account.topQuickActions.length >= 3 &&
      account.confidence.quickActions >= 0.5 &&
      !existingKeys.has(`quick_action_pin:${account.accountId}`)
    ) {
      suggestions.push({
        accountId: account.accountId,
        kind: "quick_action_pin",
        payload: {
          actions: account.topQuickActions.slice(0, 5),
          title: "Pin your top chart actions?",
          description: "AXE noticed the same actions keep repeating. We can surface them first under the chart star menu.",
        },
      });
    }

    if (
      account.preferredChartModes.length > 0 &&
      account.confidence.chartModes >= 0.58 &&
      !existingKeys.has(`chart_mode_default:${account.accountId}`)
    ) {
      suggestions.push({
        accountId: account.accountId,
        kind: "chart_mode_default",
        payload: {
          mode: account.preferredChartModes[0],
          title: `Keep ${account.preferredChartModes[0]} on by default?`,
          description: "AXE sees this mode come back often enough to make it your default.",
        },
      });
    }
  }

  if (
    profile.behaviorSignals.likelySessionFocus.id &&
    profile.behaviorSignals.likelySessionFocus.id !== "mixed" &&
    profile.behaviorSignals.likelySessionFocus.confidence >= 0.58 &&
    !existingKeys.has("session_briefing_focus:global")
  ) {
    suggestions.push({
      kind: "session_briefing_focus",
      payload: {
        session: profile.behaviorSignals.likelySessionFocus.id,
        title: `Prioritize ${sessionLabel(profile.behaviorSignals.likelySessionFocus.id)} tactics in your morning briefing?`,
        description: "AXE can front-load the session that matters most in your actual usage.",
      },
    });
  }

  if (
    profile.behaviorSignals.likelyFibStyle.id &&
    profile.behaviorSignals.likelyFibStyle.confidence >= 0.72 &&
    profile.behaviorSignals.likelyFibStyle.evidenceCount >= 3 &&
    !existingKeys.has("fib_style_default:global")
  ) {
    suggestions.push({
      kind: "fib_style_default",
      payload: {
        mode: profile.behaviorSignals.likelyFibStyle.id,
        title: "Use this fib style as your default?",
        description: "AXE noticed you keep placing auto fibs the same way.",
      },
    });
  }

  return suggestions;
}

function pickAccountProfile(
  profile: AdaptiveTradingProfile,
  accountId: string | null | undefined,
): AdaptiveAccountProfile | null {
  if (!accountId) return profile.accountProfiles[0] ?? null;
  return profile.accountProfiles.find((item) => item.accountId === accountId) ?? profile.accountProfiles[0] ?? null;
}

export function preferredChartDefaults(
  profile: AdaptiveTradingProfile | null,
  accountId: string | null | undefined,
): { symbol: string | null; timeframe: string | null } {
  if (!profile) return { symbol: null, timeframe: null };
  const account = pickAccountProfile(profile, accountId);
  return {
    symbol: account?.preferredSymbol ?? null,
    timeframe: account?.preferredTimeframes[0] ?? null,
  };
}

export function buildAdaptiveDecisionSet(input: {
  profile: AdaptiveTradingProfile | null;
  accountId?: string | null;
  displayName?: string | null;
}): AdaptiveUiDecisionSet {
  const fallbackGreeting = input.displayName?.trim()
    ? `Good morning, ${input.displayName.trim()}.`
    : "Good morning.";

  if (!input.profile) {
    return {
      chart: {
        defaultSymbol: null,
        defaultTimeframes: [],
        enabledIndicators: [],
        chartModes: [],
        topQuickActions: [],
        fibMode: null,
      },
      cockpit: {
        preferredSessions: [],
        preferredInstruments: [],
        highlightPatterns: [],
      },
      briefing: {
        greeting: fallbackGreeting,
        includeWeather: false,
        sessionFocus: null,
        preferredPairs: [],
        tacticalPromptStyle: "focused",
      },
      suggestions: [],
    };
  }

  const account = pickAccountProfile(input.profile, input.accountId ?? null);
  return {
    chart: {
      defaultSymbol: account?.preferredSymbol ?? null,
      defaultTimeframes: account?.preferredTimeframes ?? [],
      enabledIndicators: account?.enabledIndicators ?? [],
      chartModes: account?.defaultChartMode
        ? [account.defaultChartMode, ...(account?.preferredChartModes ?? []).filter((mode) => mode !== account.defaultChartMode)]
        : account?.preferredChartModes ?? [],
      topQuickActions:
        account?.pinnedQuickActions && account.pinnedQuickActions.length > 0
          ? account.pinnedQuickActions
          : account?.topQuickActions ?? [],
      fibMode: input.profile.globalPreferences.fibStyleOverride ?? null,
    },
    cockpit: {
      preferredSessions: account?.preferredSessions ?? [],
      preferredInstruments: input.profile.accountProfiles
        .map((item) => item.preferredSymbol)
        .filter((value): value is string => Boolean(value))
        .slice(0, 4),
      highlightPatterns: [],
    },
    briefing: {
      greeting: fallbackGreeting,
      includeWeather:
        input.profile.globalPreferences.morningBriefingOptIn &&
        input.profile.globalPreferences.weatherOptIn &&
        input.profile.globalPreferences.locationOptIn,
      sessionFocus:
        input.profile.globalPreferences.briefingSessionOverride ??
        account?.preferredSessions[0] ??
        input.profile.behaviorSignals.likelySessionFocus.id ??
        null,
      preferredPairs: input.profile.accountProfiles
        .map((item) => item.preferredSymbol)
        .filter((value): value is string => Boolean(value))
        .slice(0, 4),
      tacticalPromptStyle: input.profile.globalPreferences.briefingTone,
    },
    suggestions: input.profile.suggestionState.filter((item) => item.status === "pending"),
  };
}
