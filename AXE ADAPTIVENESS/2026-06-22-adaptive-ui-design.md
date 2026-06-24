# AXE Adaptive UI Design

Date: 2026-06-22
Status: Draft for review
Scope: Product and technical design for a stable-shell adaptive UI layer across Chart, Cockpit, Journal, and Morning Briefing.

## Goal

Make AXE feel like it knows how the trader works without turning the product into a shape-shifting interface. The app should stay recognizably AXE, while remembering safe preferences automatically and surfacing smarter suggestions when it identifies repeated behavior.

The result should feel like:

- AXE remembers my desk.
- AXE sets up the things I use most.
- AXE notices patterns and suggests useful defaults.
- AXE sounds personal in the morning briefing.
- AXE gets more useful over time without becoming unfamiliar.

## Core Product Rule

AXE uses a stable shell with an adaptive layer.

AXE may adapt:

- default chart symbol
- indicator visibility
- per-account chart modes
- top quick actions
- preferred tool presets
- morning briefing focus
- suggestion prompts
- coaching intensity

AXE may not automatically adapt:

- global app navigation
- major layout structure
- critical execution affordances
- order placement safety gates

In short: adaptive ranking, adaptive emphasis, adaptive defaults, adaptive coaching. Not adaptive layout rewriting.

## Behavior Model

There are two classes of adaptation.

### 1. Auto-remembered preferences

These are safe, low-risk preferences that AXE should remember silently.

- most-used chart symbol per account
- indicator on/off states
- chart mode defaults such as paper chat or midnight chart
- top 5 quick actions under the chart star menu
- preferred timeframe presets
- preferred tool defaults that do not alter execution or risk silently

Examples:

- If a user opens XAUUSD most often, AXE opens XAUUSD by default for that account.
- If a user always turns on market structure, AXE keeps market structure enabled.
- If a user uses paper chat on one account and midnight chart on another, AXE remembers that per account.

### 2. Suggested intelligence

These are adaptive conclusions that should be proposed before becoming defaults.

- inferred fib placement style
- inferred session preference such as London-first focus
- inferred briefing style or tactical emphasis
- inferred coaching or anti-tilt interventions
- inferred action bundles beyond obvious frequency ranking

Examples:

- “I notice you usually anchor fibs from the impulsive swing into the retrace. Use this as your default?”
- “You mostly trade London momentum. Want London tactics prioritized in your morning briefing?”

## Experience Surfaces

### Chart

Adaptive chart behavior should be the first real implementation surface.

What AXE remembers automatically:

- default symbol per account
- indicator states
- preferred timeframe
- chart mode toggles such as paper chat or midnight chart
- top 5 quick actions in the star menu

What AXE suggests:

- fib placement default
- preferred auto-fib source
- suggested action shortcuts based on repeated workflows

### Cockpit

The cockpit should reflect the user’s behavior, not what the loudest market did.

Adaptive cockpit outputs:

- preferred sessions
- preferred instruments
- recurring patterns and actions
- “what AXE noticed” summary
- recent suggestions waiting for confirmation

### Journal

The journal becomes smarter based on actual mistakes and style.

Adaptive journal outputs:

- prompt style based on user behavior
- correction categories that match repeated errors
- alignment prompts after known overtrading or revenge patterns
- post-trade review emphasis based on what the user tends to miss

### Morning Briefing

The morning briefing should feel personal and context-aware.

Target structure:

1. Greeting
   - “Good morning, {firstName}”
2. Light context
   - weather, if location/weather access is available and enabled
   - day/session framing
3. Tactical focus
   - preferred pairs first
   - specific session-aware tactical angle
4. Behavioral reminder
   - one relevant note based on recent habits
5. Listening / focus suggestions
   - optional, lightweight, and aligned with the user’s style

The briefing should never sound generic if the user has enough history.

## UX Rules

### Rule 1: Assistive, not controlling

AXE may suggest and prepare. It may not silently take over important trading decisions.

### Rule 2: Explain why

When AXE changes emphasis or proposes a default, the user should be able to understand why.

Examples:

- “Prioritized because you traded this pair most over the last 14 days.”
- “Suggested because you use this fib structure in most reviewed setups.”

### Rule 3: Easy override

Every adaptive default must be overridable.

Needed controls:

- use now
- keep as default
- not for me
- reset adaptive preferences

### Rule 4: Confidence-gated changes

Do not adapt from weak data.

Example thresholds:

- safe preference memory can start after 3-5 repeated actions
- behavioral suggestions need a higher confidence threshold
- briefing personalization should degrade gracefully when profile confidence is low

## Technical Architecture

Use three layers.

### Layer A: Telemetry

Raw event stream describing actual user behavior.

### Layer B: Adaptive Profile

Derived understanding of how the user tends to work.

### Layer C: Adaptive Decisions

Concrete decisions the UI can apply safely or propose.

This keeps the system explainable, testable, and easy to extend.

## Data Model

### Adaptive user profile

```ts
export type AdaptiveTradingProfile = {
  userId: string;
  accountProfiles: AdaptiveAccountProfile[];
  globalPreferences: AdaptiveGlobalPreferences;
  behaviorSignals: AdaptiveBehaviorSignals;
  suggestionState: AdaptiveSuggestionState[];
  updatedAt: string;
};

export type AdaptiveAccountProfile = {
  accountId: string;
  broker: "mt5" | "alpaca" | "ibkr" | "demo";
  preferredSymbol: string | null;
  preferredTimeframes: string[];
  enabledIndicators: string[];
  preferredChartModes: string[];
  topQuickActions: string[];
  preferredSessions: string[];
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
  kind:
    | "fib_style_default"
    | "session_briefing_focus"
    | "quick_action_pin"
    | "chart_mode_default";
  accountId?: string;
  status: "pending" | "accepted" | "dismissed" | "expired";
  payload: Record<string, unknown>;
  createdAt: string;
  resolvedAt: string | null;
};
```

### Adaptive decision set

```ts
export type AdaptiveUiDecisionSet = {
  chart: {
    defaultSymbol: string | null;
    defaultTimeframes: string[];
    enabledIndicators: string[];
    chartModes: string[];
    topQuickActions: string[];
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
```

## Telemetry Schema

Start with a dedicated event table instead of trying to infer this from unrelated UI state.

### Table: `adaptive_ui_events`

```sql
create table adaptive_ui_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  account_id uuid null,
  event_type text not null,
  route text not null,
  session_id text null,
  occurred_at timestamptz not null default now(),
  payload jsonb not null default '{}'::jsonb
);
```

### Event types for MVP

#### Chart events

- `chart_opened`
- `chart_symbol_selected`
- `chart_timeframe_selected`
- `chart_indicator_enabled`
- `chart_indicator_disabled`
- `chart_mode_enabled`
- `chart_mode_disabled`
- `chart_quick_action_used`
- `chart_fib_drawn`
- `chart_fib_adjusted`
- `chart_fib_confirmed`

Suggested payload examples:

```json
{ "symbol": "XAUUSD", "timeframe": "1H" }
```

```json
{ "indicator": "market_structure", "enabled": true }
```

```json
{
  "actionId": "draw_fibonacci",
  "source": "toolbar_star",
  "symbol": "XAUUSD",
  "timeframe": "15m"
}
```

```json
{
  "style": "swing_high_to_retrace_low",
  "sourceMode": "auto",
  "symbol": "XAUUSD",
  "timeframe": "1H"
}
```

#### Cockpit and journal events

- `cockpit_opened`
- `journal_opened`
- `journal_entry_created`
- `journal_entry_tagged`
- `alignment_feedback_viewed`
- `behavior_map_viewed`

#### Briefing events

- `morning_briefing_opened`
- `morning_briefing_pair_clicked`
- `morning_briefing_suggestion_accepted`
- `morning_briefing_suggestion_dismissed`

#### Suggestion events

- `adaptive_suggestion_shown`
- `adaptive_suggestion_accepted`
- `adaptive_suggestion_dismissed`

## Mapping to Existing Codebase

This design should plug into existing AXE surfaces instead of creating parallel UI.

### Existing files to extend

#### Chart

- `src/components/chart/ChartScreen.tsx`
- `src/lib/axeChartActions/chartActionTypes.ts`
- `src/lib/axeChartActions/chartActionMemory.ts`
- `src/lib/accountPreferences.ts`

Use these for:

- symbol memory
- indicator state memory
- chart mode memory
- quick action frequency logging
- fib behavior telemetry

#### Cockpit

- `src/services/cockpitService.ts`
- `src/types/cockpit.ts`
- `src/components/cockpit/*`

Use these for:

- preferred sessions
- preferred instruments
- adaptive behavior summaries
- surfaced suggestions inside cockpit context

#### Journal

- `src/services/journalingService.ts`
- `src/lib/journal/*`
- `src/components/journal/*`

Use these for:

- behavior prompts
- correction pattern detection
- post-trade review personalization

#### Morning briefing / companion

AXE already has contextual instruction and session-start behavior in:

- `src/services/axeService.ts`

This is the natural place to inject:

- user name greeting
- preferred pair emphasis
- recent behavior reminders
- session-specific tactical framing
- weather/location if enabled and available

## Adaptive Logic

Version 1 should use deterministic rules with confidence thresholds.

Examples:

```ts
if (symbolUsage["XAUUSD"] >= 0.45 && totalChartOpens >= 8) {
  decisions.chart.defaultSymbol = "XAUUSD";
}

if (indicatorUsage["market_structure"].enableRate >= 0.8 && indicatorUsage["market_structure"].toggles >= 5) {
  decisions.chart.enabledIndicators.push("market_structure");
}

if (topActions.length >= 5) {
  decisions.chart.topQuickActions = topActions.slice(0, 5);
}

if (fibStyleConfidence >= 0.75) {
  suggestions.push({
    kind: "fib_style_default",
    status: "pending",
    payload: { style: inferredFibStyle }
  });
}
```

No LLM should decide UI state directly in MVP.

LLMs may later be used to:

- summarize patterns in cockpit copy
- improve briefing narration
- explain why suggestions were made

But UI decisions should remain rules-based first.

## Morning Briefing Personalization Design

### Inputs

- user first name
- local time
- optional location/weather
- preferred account
- preferred session
- preferred pairs
- recent behavior signals
- open commitments and recent performance context

### Output format

1. greeting
2. weather/context sentence if available
3. session framing
4. top 2-4 relevant pairs
5. tactical note for the day
6. one behavioral reminder
7. optional listening/focus prompt

Example:

> Good morning, Luka. London opens under light rain in Amsterdam, so this is a clean inside-desk start. XAUUSD and GBPUSD should stay front and center for you today. If gold holds yesterday’s retrace cleanly, focus on continuation rather than forcing reversal structure. Keep the first hour disciplined — your best sessions usually come when you wait for the second clear confirmation.

## MVP Scope

### Phase 1: Passive memory and telemetry

Ship:

- adaptive event table
- chart event logging
- per-account symbol memory
- indicator state memory
- chart mode memory
- quick action usage tracking

No visible adaptive suggestions yet beyond remembered defaults.

### Phase 2: Safe adaptive defaults

Ship:

- default symbol per account
- default indicator set
- top 5 quick actions in star menu
- preferred chart mode persistence

### Phase 3: Suggestion engine

Ship:

- fib style suggestion
- session briefing focus suggestion
- chart mode suggestion if a behavior is obvious

UI requirement:

- lightweight “Use as default?” prompts
- accept / dismiss / never ask for this pattern

### Phase 4: Personalized morning briefing

Ship:

- greeting with name
- optional weather and location
- preferred pairs
- tactical session note
- one behavior-aware coaching line

### Phase 5: Cockpit adaptive summaries

Ship:

- preferred sessions from real behavior
- preferred instruments from real behavior
- repeated action summaries
- suggestion inbox / accepted defaults history

## Safety and Privacy

- weather and location must be opt-in
- behavioral suggestions must be explainable
- users must be able to reset adaptive memory
- users must be able to disable briefing personalization
- no hidden execution changes based on inferred behavior

## Edge Cases

### New users

If the profile confidence is low:

- keep defaults generic
- avoid false certainty
- frame briefing as general context
- do not show fib-style suggestions too early

### Multi-account users

Preferences must be account-aware where relevant:

- chart symbol
- chart mode
- favorite quick actions
- preferred instruments

Global preferences can stay user-level:

- greeting name
- weather/location opt-in
- coaching sensitivity

### Wrong inference

If a user dismisses a suggestion repeatedly:

- cool down re-suggestion
- lower confidence for that inference path
- do not nag

## Testing Strategy

### Unit

- profile aggregation rules
- quick action ranking
- indicator default calculations
- suggestion confidence thresholds

### Integration

- chart interactions emit expected events
- accepted suggestion updates defaults
- morning briefing reads profile inputs correctly

### UX verification

- remembered defaults feel helpful, not surprising
- suggestions are understandable
- morning briefing sounds personal but not invasive

## Rollout Recommendation

Start with chart memory first. That gives visible value quickly and uses the strongest current signals.

Recommended first shipped slice:

1. per-account chart symbol memory
2. indicator memory
3. chart mode memory
4. quick action ranking

After that:

5. fib-style suggestions
6. personalized morning briefing
7. cockpit adaptive summaries

## Summary

This design keeps AXE recognizable while making it feel increasingly personal.

The principle is:

- silently remember safe preferences
- propose inferred behavior changes
- personalize the morning briefing
- reflect behavior back in cockpit and journal

This should make AXE feel less like a static trading app and more like a desk companion that gradually learns how the trader actually works.
