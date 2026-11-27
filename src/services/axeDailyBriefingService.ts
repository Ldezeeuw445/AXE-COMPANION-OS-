/**
 * AXE Daily Briefing Service
 *
 * Generates personalized morning briefs for traders based on:
 * - Trader profile (name, timezone, preferences from profiles table)
 * - Trading history (top pairs, recent wins from broker_trades)
 * - Alignment score (learning arc)
 * - Market context (session time, personalized pair focus)
 *
 * Saves results to axe_daily_briefings and surfaces them in the AXE Feed.
 */

import "server-only";

import { createServiceRoleSupabaseClient } from "@/lib/supabase/serviceRole";
import { callLLM, type LLMRequest } from "@/services/llmClient";
import { getTraderLearningArc } from "@/services/learningArcService";
import type { ArcSession, SessionSplit } from "@/lib/axe/learningArc";
import type { ChartSetupSummary } from "@/lib/chart/chartPrefs";
import { getChartSetup } from "@/services/chartSetupService";
import { trackAdaptiveEvent } from "@/services/trackAdaptiveEvent";
import { getAxeEngineProfile } from "@/services/axeEngineService";
import { fetchWeatherForBrief, type WeatherSnapshot } from "@/services/weatherService";
import { buildMarketContext } from "@/lib/market/marketContextService";
import { buildBriefHighlights } from "@/lib/briefing/briefingNewsCards";
import { summarizeBriefMarketContext } from "@/lib/briefing/briefMarketDigest";
import {
  fetchBriefPeriodTrades,
  formatPeriodPerformanceForPrompt,
  type BriefPeriodPerformance,
} from "@/lib/briefing/briefPeriodTrades";
import type { BriefHighlight } from "@/lib/briefing/briefBodyFormat";
import { loadBriefPriceFacts } from "@/services/briefPriceFacts";
import {
  formatPriceFactBlock,
  hasPriceFactsMarker,
  priceFactRules,
  toPriceFactsHighlight,
  type SymbolFactsResult,
} from "@/lib/briefing/priceFacts";
import {
  describeViolationsForRetry,
  findPriceViolations,
  stripViolatingSentences,
} from "@/lib/briefing/briefPriceValidator";
import type { MarketContext } from "@/lib/market/marketTypes";
import type { SupabaseClient } from "@supabase/supabase-js";
import { filterUsersWithFeature } from "@/services/entitledUsers";
import { runBatchWithinBudget } from "@/lib/briefing/cronBudget";
import {
  summarizeMarketStatus,
  type MarketStatusSummary,
} from "@/lib/market/marketHours";
import {
  describeFocusForPrompt,
  isEventInFocus,
  isHeadlineInFocus,
  normalizeBriefFocusPrefs,
  resolveBriefFocus,
  type BriefFocus,
} from "@/lib/briefing/briefFocus";
import {
  formatAccountsPromptBlock,
  toAccountsHighlight,
  type AccountDigest,
} from "@/lib/briefing/accountsDigest";
import {
  describeContentViolations,
  stripContentViolations,
  validateBriefContent,
} from "@/lib/briefing/briefContentGuard";
import { loadAccountDigests, loadBriefFocusPrefs, loadWatchlistSymbols } from "@/services/briefInputs";
import {
  BRIEF_SECTION_HEADERS,
  briefIsClosedMarketDay,
  briefPriceSymbols,
  marketStatusLines,
  normalizeBriefHeader,
  withServerSections,
} from "@/lib/briefing/briefSections";

export { briefPriceSymbols, briefIsClosedMarketDay, withServerSections };

// ─── Timezone helpers ─────────────────────────────────────────────────────────

/** YYYY-MM-DD in the trader's local timezone (not UTC). */
export function getLocalDateString(timezone: string, refDate = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(refDate);
}

/** Local hour 0–23 in the trader's timezone. */
export function getLocalHour(timezone: string, refDate = new Date()): number {
  try {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: timezone,
      hour: "numeric",
      hour12: false,
    }).formatToParts(refDate);
    const raw = parseInt(parts.find((p) => p.type === "hour")?.value ?? "0", 10);
    return raw === 24 ? 0 : raw;
  } catch {
    return refDate.getUTCHours();
  }
}

function getLocalWeekday(timezone: string, refDate = new Date()): string {
  try {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: timezone,
      weekday: "short",
    }).formatToParts(refDate);
    return parts.find((p) => p.type === "weekday")?.value ?? "";
  } catch {
    return ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][refDate.getUTCDay()] ?? "";
  }
}

/** True when local time is past 06:00 and the daily brief for today is still missing. */
export async function shouldDeliverTodaysDailyBrief(
  supabase: SupabaseClient,
  userId: string,
): Promise<{ due: boolean; timezone: string }> {
  const profile = await fetchProfileDirect(supabase, userId);
  if (profile.preferences.morningBriefingOptIn === false) {
    return { due: false, timezone: profile.timezone };
  }

  const hour = getLocalHour(profile.timezone);
  if (hour < 6) return { due: false, timezone: profile.timezone };

  const existing = await getTodaysBrief(supabase, userId, "daily", profile.timezone);
  if (existing?.body) return { due: false, timezone: profile.timezone };

  return { due: true, timezone: profile.timezone };
}

/** Generate today's daily brief if cron missed the 06:00 window. */
export async function ensureTodaysDailyBrief(userId: string): Promise<boolean> {
  const writeSb = createServiceRoleSupabaseClient();
  if (!writeSb) return false;

  const { due } = await shouldDeliverTodaysDailyBrief(writeSb, userId);
  if (!due) return false;

  try {
    await generateMorningBrief(userId, writeSb, { weekly: false });
    return true;
  } catch (err) {
    console.error("[Briefing] ensureTodaysDailyBrief failed:", err);
    return false;
  }
}

// ─── Types ────────────────────────────────────────────────────────────────────

export interface TraderBriefingContext {
  traderId: string;
  name: string;
  timezone: string;
  /**
   * The markets this brief may cover — `focus.markets`, in order. Kept as a
   * plain list for the callers that only need symbols.
   */
  preferredPairs: string[];
  /** Chosen markets + labelled drivers + the currencies whose events matter. */
  focus: BriefFocus;
  /** Open / closed per focus market at generation time. */
  marketStatus: MarketStatusSummary;
  /** Every linked account, with the same numbers as the TOS funded suite. */
  accounts: AccountDigest[];
  /**
   * 0–100 from the latest cockpit snapshot, or null when AXE has never scored
   * this trader. It used to default to 50, which the prompt then handed the
   * model as "how well AXE has learned this trader's style" — so a trader AXE
   * knew nothing about was told it was half way there.
   */
  alignment: number | null;
  periodPerformance: BriefPeriodPerformance;
  /**
   * The indicators and SMC overlays this trader actually has switched on,
   * read from their own saved chart setup.
   *
   * This line used to read `topIndicators: string[]` and always contain
   * "RSI", "MACD", "MA" — a constant in `learningArcService`, handed to the
   * model under "Key facts". It was removed when there was no way to know,
   * and comes back now that chart preferences are synced server-side.
   */
  chartSetup: ChartSetupSummary;
  /** Which session is open as the brief is written. Not a fact about the trader. */
  liveSession: "london" | "newyork" | "asia";
  /**
   * Where this trader actually enters, counted from their own closed trades.
   * Null until there are enough of them to mean anything.
   */
  sessionHistory: ArcSessionHistory | null;
  tier: "free" | "core" | "pro" | "founder" | "elite";
  weather: WeatherSnapshot | null;
  preferences: Record<string, unknown>;
  engineConfidence: {
    score: number;
    tier: "low" | "medium" | "high";
    gateMode: "strict" | "guided" | "proactive";
  };
}

/**
 * `null` means AXE has never scored this trader. The old signature took a
 * plain number, so a missing score arrived as 0 and the brief read "You're at
 * 0% aligned — AXE knows your style well." — two false statements in one
 * sentence. There is no percentage to lock in that case, so the locked
 * sentence says what is missing instead.
 */
function alignmentSentence(alignment: number | null): string {
  if (alignment === null) {
    return "AXE has not scored your alignment yet — close a trade, or journal one with AXE, and it will.";
  }
  return `You're at ${Math.max(0, Math.min(100, Math.round(alignment)))}% aligned — AXE knows your style well.`;
}

/**
 * Keep the alignment section deterministic and synced with Cockpit score.
 * This prevents model drift/hallucinations like "75%" when true score is 48%,
 * and — when there is no score — stops it inventing one at all.
 */
function syncBriefAlignmentSection(body: string, alignment: number | null): string {
  const source = body.replace(/\r\n/g, "\n").trim();
  if (!source) return source;

  const lines = source.split("\n");
  const targetHeader = "ALIGNMENT SCORE";
  const targetIdx = lines.findIndex((line) => normalizeBriefHeader(line) === targetHeader);
  const lockedSentence = alignmentSentence(alignment);

  if (targetIdx === -1) {
    return `${source}\n\nALIGNMENT SCORE\n${lockedSentence}`;
  }

  let nextHeaderIdx = lines.length;
  for (let i = targetIdx + 1; i < lines.length; i++) {
    if (BRIEF_SECTION_HEADERS.has(normalizeBriefHeader(lines[i] ?? ""))) {
      nextHeaderIdx = i;
      break;
    }
  }

  const rewritten = [
    ...lines.slice(0, targetIdx + 1),
    lockedSentence,
    ...lines.slice(nextHeaderIdx),
  ]
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  return rewritten;
}

// ─── Profile fetch (service-role, no relative URLs) ───────────────────────────

type ProfileBrief = {
  displayName: string;
  timezone: string;
  preferences: Record<string, unknown>;
  tier: "free" | "core" | "pro" | "founder" | "elite";
};

async function fetchProfileDirect(supabase: SupabaseClient, userId: string): Promise<ProfileBrief> {
  try {
    const { data } = await supabase
      .from("profiles")
      .select("display_name, timezone, preferences")
      .eq("id", userId)
      .maybeSingle();

    const entitlements = await supabase
      .from("axe_user_entitlements")
      .select("plan")
      .eq("user_id", userId)
      .maybeSingle();

    const prefs =
      data?.preferences && typeof data.preferences === "object"
        ? (data.preferences as Record<string, unknown>)
        : {};

    return {
      displayName: data?.display_name ?? "Trader",
      timezone: data?.timezone ?? "Europe/Amsterdam",
      preferences: prefs,
      tier: (entitlements.data?.plan as ProfileBrief["tier"]) ?? "free",
    };
  } catch {
    return {
      displayName: "Trader",
      timezone: "Europe/Amsterdam",
      preferences: {},
      tier: "free",
    };
  }
}

// ─── Build briefing context from Supabase ────────────────────────────────────

export async function buildBriefingContext(
  supabase: SupabaseClient,
  traderId: string,
  options?: { weekly?: boolean; now?: Date },
): Promise<TraderBriefingContext> {
  const now = options?.now ?? new Date();
  try {
    const [profile, arc, chartSetup, watchlist, focusPrefs] = await Promise.all([
      fetchProfileDirect(supabase, traderId),
      getTraderLearningArc(traderId, supabase),
      getChartSetup(supabase, traderId),
      loadWatchlistSymbols(supabase, traderId).catch(() => [] as string[]),
      loadBriefFocusPrefs(supabase, traderId).catch(() => null),
    ]);
    const tradFi = summarizeMarketStatus(["EURUSD"], now);
    const tradFiClosed = tradFi.closed.length > 0 && (tradFi.tradFiWeekend || tradFi.statuses[0]?.reason === "holiday");
    const accountsRes = await loadAccountDigests(supabase, traderId, now, { marketsOpen: !tradFiClosed }).catch(() => ({
      accounts: [] as AccountDigest[],
      positions: [],
      error: "accounts read failed",
    }));
    const focus = resolveBriefFocus({
      prefs: focusPrefs ?? normalizeBriefFocusPrefs(null),
      watchlist,
      traded: arc.topPairs.slice(0, 3).map((pair) => pair.symbol),
      openPositions: accountsRes.positions.map((p) => p.symbol),
      tradFiClosed,
    });
    const marketStatus = summarizeMarketStatus(focus.markets.map((m) => m.symbol), now);
    const engineProfile = await getAxeEngineProfile(supabase, traderId, {
      source: "briefing_context",
    }).catch(() => null);

    const periodPerformance = await fetchBriefPeriodTrades(
      supabase,
      traderId,
      profile.timezone,
      { weekly: options?.weekly },
    );

    const tzDate = new Date(
      new Date().toLocaleString("en-US", { timeZone: profile.timezone })
    );
    const hour = tzDate.getHours();

    let liveSession: "london" | "newyork" | "asia" = "asia";
    if (hour >= 7 && hour < 16) liveSession = "london";
    if (hour >= 14 && hour < 23) liveSession = "newyork";

    // Weather: on by default — use explicit location when set, else timezone city
    let weather: WeatherSnapshot | null = null;
    if (profile.preferences.weatherOptIn !== false) {
      const loc =
        profile.preferences.locationOptIn !== false
          ? (profile.preferences.location as
              | { lat?: number; lon?: number; name?: string }
              | undefined)
          : undefined;
      weather = await fetchWeatherForBrief(loc, profile.timezone);
    }

    return {
      traderId,
      name: profile.displayName,
      timezone: profile.timezone,
      preferredPairs: focus.markets.map((m) => m.symbol),
      focus,
      marketStatus,
      accounts: accountsRes.accounts,
      alignment: arc.alignmentScore,
      periodPerformance,
      chartSetup,
      liveSession,
      sessionHistory: toSessionHistory(arc.session),
      tier: profile.tier,
      weather,
      preferences: profile.preferences,
      engineConfidence: {
        score: engineProfile?.confidenceScore ?? 0,
        tier: engineProfile?.confidenceTier ?? "low",
        gateMode: engineProfile?.gateMode ?? "strict",
      },
    };
  } catch (error) {
    console.error("[Briefing] Failed to build context:", error);
    return {
      traderId,
      name: "Trader",
      timezone: "Europe/Amsterdam",
      preferredPairs: [],
      focus: { markets: [], drivers: [], excluded: [], currencies: [], mode: "auto" },
      marketStatus: summarizeMarketStatus([], now),
      accounts: [],
      alignment: null,
      periodPerformance: {
        since: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
        trades: [],
        wins: 0,
        losses: 0,
        breakeven: 0,
        netPnl: 0,
      },
      chartSetup: { indicators: [], smcTools: [], scopes: 0, symbols: [] },
      liveSession: "london",
      sessionHistory: null,
      tier: "free",
      weather: null,
      preferences: {},
      engineConfidence: {
        score: 0,
        tier: "low",
        gateMode: "strict",
      },
    };
  }
}

export type ArcSessionHistory = {
  session: ArcSession;
  /** Entries in that window, and the total that could be placed. */
  trades: number;
  classified: number;
};

/**
 * Only hand the model a session preference when the trader's own trades show
 * one. `sessionSplit` already returns null below its minimum sample and on a
 * tie, so this is the whole check.
 */
function toSessionHistory(split: SessionSplit): ArcSessionHistory | null {
  if (!split.session) return null;
  return {
    session: split.session,
    trades: split.counts[split.session],
    classified: split.classified,
  };
}

/**
 * The trader's own chart setup, in one line for the prompt.
 *
 * Empty means they have never changed a default, which is worth saying as
 * itself: the model should not name indicators, and it should not be
 * encouraging about ones it invented. The old line said "standard set" here,
 * which reads like a fact and is not one.
 */
function describeChartSetup(setup: ChartSetupSummary): string {
  const parts: string[] = [];
  if (setup.indicators.length > 0) parts.push(`indicators on: ${setup.indicators.join(", ")}`);
  if (setup.smcTools.length > 0) parts.push(`overlays on: ${setup.smcTools.join(", ")}`);
  if (parts.length === 0) {
    return "nothing saved yet — they have not changed a chart default, so do not name any indicator as theirs";
  }
  return `${parts.join("; ")} (across ${setup.scopes} of their saved charts: ${setup.symbols.join(", ")})`;
}

// ─── Prompt builder ───────────────────────────────────────────────────────────

function marketStatusPromptBlock(context: TraderBriefingContext): string {
  const lines = marketStatusLines(context);
  if (lines.length === 0) return "";
  const hol = context.marketStatus.holiday ? `\nHoliday today: ${context.marketStatus.holiday}.` : "";
  return `\n\nMARKET STATUS (computed from exchange hours right now — hard facts):\n${lines.map((l) => `- ${l}`).join("\n")}${hol}
Market-hours rules (hard — a server check rejects the brief otherwise):
- A market marked CLOSED gets NO "watch/monitor/trade it today", no "this session", no entries. You may only frame it as: closed, last close, what to expect at the reopen (time given above), weekend gap risk, or the week ahead.
- Only markets marked OPEN can have a "today" plan.`;
}

function buildBriefingPrompt(context: TraderBriefingContext, options?: { weekly?: boolean }): string {
  const closedDay = briefIsClosedMarketDay(context);
  const timeStr = new Date().toLocaleString("en-US", {
    timeZone: context.timezone,
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
    weekday: "long",
  });

  const hasPeriodTrades = context.periodPerformance.trades.length > 0;
  const isWeekly = options?.weekly ?? false;
  const hasAlignment = context.alignment !== null;

  let prompt = `You are AXE — a warm, sharp trading companion. Generate a ${isWeekly ? "personalized weekly outlook" : "personalized morning brief"} for ${context.name}.

Key facts:
- Their local time: ${timeStr} (${context.timezone})
- ${describeFocusForPrompt(context.focus).replace(/\n/g, "\n  ")}
- AXE alignment score: ${hasAlignment ? `${context.alignment}% (how well AXE has learned this trader's style)` : "not scored yet — AXE has taken no snapshot of this trader. Do not state or imply a number."}
- AXE engine confidence: ${context.engineConfidence.score}/100 (${context.engineConfidence.tier}, gate: ${context.engineConfidence.gateMode})
- Session open as this is written: ${context.liveSession}
- Session they actually enter in: ${
    context.sessionHistory
      ? `${context.sessionHistory.session} (${context.sessionHistory.trades} of ${context.sessionHistory.classified} closed trades opened in that window)`
      : "not enough closed trades to say — do not guess one"
  }
- How they read a chart: ${describeChartSetup(context.chartSetup)}`;

  if (context.weather) {
    prompt += `\n- Weather in ${context.weather.location}: ${context.weather.summary}, ${context.weather.tempC}°C, wind ${context.weather.windKmh} km/h`;
  }

  if (hasPeriodTrades) {
    prompt += formatPeriodPerformanceForPrompt(context.periodPerformance);
  }

  prompt += marketStatusPromptBlock(context);
  prompt += `\n\n${formatAccountsPromptBlock(context.accounts, context.timezone)}
Account rules: the server prints a YOUR ACCOUNTS section with these exact numbers — do not write that section yourself and never compute a limit, room or drawdown of your own. You may refer to one account by name and its room when it matters for an action item.`;

  if (isWeekly) {
    prompt += `

Write a weekly outlook that:
1. Opens with a greeting that uses ${context.name}'s name and frames the week ahead
2. Covers ONLY their markets listed above for the week (closed ones as "at the reopen"), using ONLY the PRICE FACTS levels (this week's and last week's high/low, 20-day range) and the dated calendar events and headlines below — no setups or levels from memory
3. ${hasAlignment ? "May mention their alignment score once, as the number given above" : "Does not mention an alignment score — AXE has none for them yet"}; never mention their plan, tier or subscription
4. Includes one tactical insight tied to ${context.sessionHistory ? `the ${context.sessionHistory.session} session they trade` : "their recent winners"}
5. Ends with the single most important thing to watch this week

Tone: warm, direct, confident. Like a senior trader who actually knows them. No generic textbook talk.
Length: 200-280 words maximum.`;
  } else {
    const weatherLine = context.weather
      ? `the weather at your location is ${context.weather.summary}, ${context.weather.tempC}°C`
      : "the weather at your location is unavailable";

    const openMarkets = context.marketStatus.open;
    const outlookBlock = closedDay
      ? `MARKET OUTLOOK
[${
          openMarkets.length
            ? `1-2 sentences on ${openMarkets.join(", ")} — the only market(s) open right now. Say plainly that their other markets are closed.`
            : "One sentence: all of their markets are closed right now, and when they reopen (from MARKET STATUS)."
        }]

WEEK AHEAD
[2-3 sentences: what to prepare for when their closed markets reopen — last close, weekend gap risk, and the dated high-impact events of the coming week from the calendar data. No "today" plan for a closed market.]`
      : `MARKET OUTLOOK
[2-3 sentences on session setup for their markets that are OPEN — mention symbols like XAUUSD as plain text, not markdown. A market marked CLOSED gets at most "closed, reopens …".]`;

    prompt += `

Write a morning brief using EXACTLY this plain-text structure (no markdown, no ** or # symbols):

Good morning ${context.name}, ${weatherLine}.

${outlookBlock}

NEWS
[Today's agenda: lead with scheduled economic events from the calendar data below. 1-2 sentences on what matters for their pairs today. If a major headline is provided, summarize it in plain language — never paste URLs or filing titles. Omit this section only if the calendar is quiet AND no relevant headlines exist.]

RECENT PERFORMANCE
[Only include if closed History trades are listed above. Summarize wins AND losses. Use exact P/L currency amounts from the data — never percentages. Never mention Quotes or chart timeframes.]

ALIGNMENT SCORE
[${
      hasAlignment
        ? `Exactly ONE sentence, e.g. "You're at ${context.alignment}% aligned — AXE knows your style well."`
        : "Exactly ONE sentence saying AXE has not scored alignment yet and what would produce one — a closed trade, or a trade journalled with AXE. Never state a percentage here."
    } Do NOT repeat the words "Alignment score" in this sentence.]

ACTION ITEMS
[${
      closedDay
        ? "2-3 numbered prep points for the reopen (levels to mark from PRICE FACTS, events to note, risk to size) — nothing to execute on a closed market"
        : "2-4 numbered tactical points for today on OPEN markets only — plain numbers like 1. 2. 3., no markdown"
    }]
${
      closedDay
        ? ""
        : `
WATCH THIS SESSION
[One clear tactical watch item for today's session, on an OPEN market]
`
    }
Rules:
- Do NOT use **, __, #, bullet lists, or URLs
- Section headers on their own line — exactly: ${closedDay ? "MARKET OUTLOOK, WEEK AHEAD, NEWS, RECENT PERFORMANCE, ALIGNMENT SCORE, ACTION ITEMS" : "MARKET OUTLOOK, NEWS, RECENT PERFORMANCE, ALIGNMENT SCORE, ACTION ITEMS, WATCH THIS SESSION"}
- Do not write MARKET STATUS or YOUR ACCOUNTS — the server adds them
- Name only the markets listed under "Their markets" (and labelled drivers); calendar events in other currencies are not theirs
- Never repeat a section header inside the body text under that section
- Omit RECENT PERFORMANCE entirely if no closed trades were provided above
- Use ONLY calendar events and headlines from the market context below — never invent news
- Never mention their plan, tier or subscription
- Ignore SEC filings, Form 8.3, fund disclosure PR — not useful for traders
- Mention their markets by ticker (e.g. ${context.preferredPairs.slice(0, 2).join(", ") || "XAUUSD"})
- Closed trades come from History — never call them Quotes; open positions live under Trade
- Write so the trader knows what to expect today without clicking links

Tone: warm, direct, confident. Like a senior trader who actually knows them.
Length: 160-240 words maximum.`;
  }

  if (context.engineConfidence.gateMode === "strict") {
    prompt += `\n\nConfidence gate: STRICT.
- Avoid hard predictive language.
- Keep action items conservative and scenario-based.
- If data confidence is low, explicitly say what needs confirmation first.`;
  } else if (context.engineConfidence.gateMode === "guided") {
    prompt += `\n\nConfidence gate: GUIDED.
- Prefer conditional recommendations ("if/then" framing).
- Keep one clear primary plan and one fallback.`;
  } else {
    prompt += `\n\nConfidence gate: PROACTIVE.
- You may be direct and proactive, but stay anchored to broker/live context and avoid generic macro hype.`;
  }

  return prompt;
}

async function appendMarketContextToPrompt(
  context: TraderBriefingContext,
  prompt: string,
  weekly = false,
): Promise<{ prompt: string; marketCtx: MarketContext | null }> {
  const primaryPair = context.preferredPairs[0] ?? "XAUUSD";
  try {
    const rawCtx = await buildMarketContext({
      symbol: primaryPair,
      watchlist: context.preferredPairs,
      newsLimit: 6,
      calendarLimit: 16,
    });
    // Calendar events in a currency none of their markets trade in are not
    // their news: this is how AUD CPI became "today's agenda" for a gold trader.
    const marketCtx: MarketContext = {
      ...rawCtx,
      events: rawCtx.events.filter((e) => isEventInFocus(e.currency ?? e.country, context.focus)),
      news: rawCtx.news.filter((n) => isHeadlineInFocus(n.title, n.summary, context.focus)),
    };
    const summary = summarizeBriefMarketContext(marketCtx, context.timezone, { weekly });
    if (summary.trim()) {
      return {
        prompt: `${prompt}\n\nMarket context (real calendar + dated headlines — do not fabricate beyond this):\n${summary}`,
        marketCtx,
      };
    }
    return { prompt, marketCtx };
  } catch (err) {
    console.warn("[Briefing] Market context unavailable:", err);
  }
  return {
    prompt: `${prompt}\n\nMarket context: the news and calendar feed is unavailable right now — say so and do not name any event or headline.`,
    marketCtx: null,
  };
}

/** Text that is honest when there is no live price at all. */
function noPriceDataNote(results: SymbolFactsResult[]): string | null {
  if (results.some((r) => r.ok)) return null;
  return "Live prices are unavailable right now, so this brief names no price levels.";
}

// ─── Generate brief and save to DB ───────────────────────────────────────────

export async function generateMorningBrief(
  traderId: string,
  supabase?: SupabaseClient,
  options?: { weekly?: boolean; save?: boolean; force?: boolean }
): Promise<{
  brief: string;
  context: TraderBriefingContext;
  model: string;
  provider: "ollama" | "openai";
  latency_ms: number;
}> {
  const startTime = Date.now();
  const isWeekly = options?.weekly ?? false;
  const shouldSave = options?.save ?? true;
  const force = options?.force ?? false;

  // Reads may use caller client; writes always use service role (RLS is select-only).
  const readSbCandidate = supabase ?? createServiceRoleSupabaseClient();
  if (!readSbCandidate) throw new Error("Supabase client unavailable");
  const readSb = readSbCandidate;
  const writeSb = (createServiceRoleSupabaseClient() ?? readSb) as SupabaseClient;

  const contextForDate = await buildBriefingContext(readSb, traderId, { weekly: isWeekly });
  const today = getLocalDateString(contextForDate.timezone);
  const briefingType = isWeekly ? "weekly" : "daily";

  // Skip LLM when today's brief already exists (cron / prior run)
  if (shouldSave && !force) {
    const { data: existingRow } = await writeSb
      .from("axe_daily_briefings")
      .select("body, created_at, highlights")
      .eq("user_id", traderId)
      .eq("briefing_date", today)
      .eq("briefing_type", briefingType)
      .maybeSingle();

    // Rows written before live-price checking existed are regenerated, not served.
    if (existingRow?.body && hasPriceFactsMarker(existingRow.highlights)) {
      const syncedBody = syncBriefAlignmentSection(String(existingRow.body), contextForDate.alignment);
      if (syncedBody !== String(existingRow.body)) {
        await writeSb
          .from("axe_daily_briefings")
          .update({ body: syncedBody })
          .eq("user_id", traderId)
          .eq("briefing_date", today)
          .eq("briefing_type", briefingType);
      }
      return {
        brief: syncedBody,
        context: contextForDate,
        model: "cached",
        provider: "ollama",
        latency_ms: Date.now() - startTime,
      };
    }
  }

  // Build context
  const context = contextForDate;

  // Build prompt (+ live market context for news section)
  let userPrompt = buildBriefingPrompt(context, { weekly: isWeekly });
  const enriched = await appendMarketContextToPrompt(context, userPrompt, isWeekly);
  userPrompt = enriched.prompt;
  const marketCtx: MarketContext | null = enriched.marketCtx;

  // Real prices (MT5 broker feed → Twelve Data → Yahoo), never the model's memory.
  const factsAt = new Date();
  const priceFacts = await loadBriefPriceFacts(readSb, traderId, briefPriceSymbols(context.preferredPairs), factsAt).catch(
    (err): SymbolFactsResult[] => {
      console.warn("[Briefing] price facts failed:", err);
      return briefPriceSymbols(context.preferredPairs).map((symbol) => ({ ok: false, symbol, reason: "price lookup failed" }));
    },
  );
  userPrompt += `\n\n${formatPriceFactBlock(priceFacts)}\n\n${priceFactRules(priceFacts)}`;

  // Call LLM
  const llmRequest: LLMRequest = {
    messages: [
      {
        role: "system",
        content:
          "You are AXE Companion, a warm and intelligent AI trading partner. Write concise, personal, actionable morning briefs. Never use markdown formatting — no **, no #, no bullet lists. Use plain section headers on their own line.",
      },
      { role: "user", content: userPrompt },
    ],
    temperature: 0.8,
    max_tokens: 350,
  };

  let response = await callLLM(llmRequest, "briefing");

  // Server-side check: every price must sit near the live price. One regenerate, then strip.
  let violations = findPriceViolations(response.content ?? "", priceFacts);
  if (violations.length > 0) {
    console.warn(`[Briefing] ${violations.length} invented price(s) for ${traderId} — regenerating`);
    const retry = await callLLM(
      {
        ...llmRequest,
        temperature: 0.3,
        messages: [
          ...llmRequest.messages,
          { role: "assistant", content: response.content ?? "" },
          { role: "user", content: describeViolationsForRetry(violations) },
        ],
      },
      "briefing",
    ).catch(() => null);
    if (retry?.content) {
      response = retry;
      violations = findPriceViolations(retry.content, priceFacts);
    }
  }
  if (violations.length > 0) {
    console.warn(`[Briefing] stripping ${violations.length} invented price sentence(s) for ${traderId}`);
    response = { ...response, content: stripViolatingSentences(response.content ?? "", violations) };
  }
  // Market hours + focus: one regenerate with the violations named, then cut.
  const contentCtx = { status: context.marketStatus, focus: context.focus };
  let contentViolations = validateBriefContent(response.content ?? "", contentCtx);
  if (contentViolations.length > 0) {
    console.warn(`[Briefing] ${contentViolations.length} market-hours/focus violation(s) for ${traderId} — regenerating`);
    const retry = await callLLM(
      {
        ...llmRequest,
        temperature: 0.3,
        messages: [
          ...llmRequest.messages,
          { role: "assistant", content: response.content ?? "" },
          { role: "user", content: describeContentViolations(contentViolations) },
        ],
      },
      "briefing",
    ).catch(() => null);
    if (retry?.content && findPriceViolations(retry.content, priceFacts).length === 0) {
      response = retry;
      contentViolations = validateBriefContent(retry.content, contentCtx);
    }
  }
  if (contentViolations.length > 0) {
    console.warn(`[Briefing] stripping ${contentViolations.length} market-hours/focus sentence(s) for ${traderId}`);
    response = { ...response, content: stripContentViolations(response.content ?? "", contentViolations) };
  }
  const noDataNote = noPriceDataNote(priceFacts);
  if (noDataNote && !/unavailable/i.test(response.content ?? "")) {
    response = { ...response, content: `${noDataNote}\n\n${response.content ?? ""}` };
  }
  const latency_ms = Date.now() - startTime;

  console.log(
    `[Briefing] Generated for ${traderId} in ${latency_ms}ms via ${response.provider}`
  );

  const briefText = withServerSections(
    syncBriefAlignmentSection(
      (response.content ?? "")
      .replace(/\*\*/g, "")
      .replace(/\bon\s+quote\b/gi, "from History")
      .replace(/\bquotes?\s+tab\b/gi, "History")
      .replace(/https?:\/\/\S+/g, "")
      .replace(/\n{3,}/g, "\n\n")
      .trim(),
      context.alignment,
    ),
    context,
  );

  const highlightRows: BriefHighlight[] = [
    ...(marketCtx && !isWeekly
      ? buildBriefHighlights(marketCtx, context.timezone, context.preferredPairs)
      : context.preferredPairs.map((p) => ({ pair: p }))),
    toPriceFactsHighlight(priceFacts, factsAt),
    toAccountsHighlight(context.accounts, factsAt),
    {
      type: "market_status",
      checkedAt: factsAt.toISOString(),
      closedDay: briefIsClosedMarketDay(context),
      holiday: context.marketStatus.holiday,
      markets: context.marketStatus.statuses.map((st) => ({
        symbol: st.symbol,
        open: st.open,
        reason: st.reason,
        reopensAt: st.reopensAt,
      })),
      focus: context.focus.markets.map((m) => ({ symbol: m.symbol, priority: m.priority, reasons: m.reasons })),
      drivers: context.focus.drivers.map((d) => d.symbol),
    },
  ];

  // Save to axe_daily_briefings (upsert by user_id + date + type)
  if (shouldSave) {
    const { error: saveError } = await writeSb.from("axe_daily_briefings").upsert(
      {
        user_id: traderId,
        briefing_date: today,
        briefing_type: isWeekly ? "weekly" : "daily",
        title: isWeekly
          ? `Weekly Outlook — ${new Date().toLocaleDateString("en-GB", {
              weekday: "long",
              day: "numeric",
              month: "short",
              timeZone: context.timezone,
            })}`
          : `Morning Brief — ${new Date().toLocaleDateString("en-GB", {
              weekday: "long",
              day: "numeric",
              month: "short",
              timeZone: context.timezone,
            })}`,
        body: briefText,
        highlights: highlightRows,
        created_at: new Date().toISOString(),
        chat_prefill: isWeekly
          ? `AXE, walk me through this week's outlook for ${
              context.preferredPairs[0] ?? "the market"
            }`
          : `AXE, tell me more about today's setup for ${
              context.preferredPairs[0] ?? "the market"
            }`,
        feed_url: "/feed",
      },
      { onConflict: "user_id,briefing_date,briefing_type" },
    );
    if (saveError) {
      console.error("[Briefing] Failed to save to DB:", saveError.message);
      throw new Error(`Failed to save briefing: ${saveError.message}`);
    }
    console.log(`[Briefing] Saved ${isWeekly ? "weekly" : "daily"} brief to axe_daily_briefings for ${traderId}`);
  }

  // Track event (best-effort)
  try {
    await trackAdaptiveEvent({
      accountId: null,
      eventType: "morning_brief_delivered",
      route: "/cockpit",
      payload: {
        traderId,
        alignment: context.alignment,
        topPairs: context.preferredPairs,
        engineConfidence: context.engineConfidence,
      },
      occurredAt: new Date().toISOString(),
    });
  } catch {
    // Non-blocking
  }

  return {
    brief: briefText,
    context,
    model: response.model,
    provider: response.provider,
    latency_ms,
  };
}

// ─── Get today's brief for a user ────────────────────────────────────────────

export async function getTodaysBrief(
  supabase: SupabaseClient,
  userId: string,
  type: "daily" | "weekly" = "daily",
  timezone?: string,
): Promise<{
  title: string;
  body: string;
  highlights: Array<{ pair?: string; [k: string]: unknown }>;
  chat_prefill: string;
  briefing_date: string;
  feed_url: string;
  briefing_type: string;
  read_at?: string | null;
} | null> {
  try {
    let tz = timezone ?? "Europe/Amsterdam";
    if (!timezone) {
      const { data: profile } = await supabase
        .from("profiles")
        .select("timezone")
        .eq("id", userId)
        .maybeSingle();
      if (profile?.timezone) tz = String(profile.timezone);
    }
    const today = getLocalDateString(tz);

    if (type === "weekly") {
      // Only this week's outlook — an unread one from weeks ago is not "this week".
      const weekAgo = getLocalDateString(tz, new Date(Date.now() - 6 * 24 * 60 * 60 * 1000));
      const { data } = await supabase
        .from("axe_daily_briefings")
        .select("title, body, highlights, chat_prefill, briefing_date, feed_url, briefing_type, read_at")
        .eq("user_id", userId)
        .eq("briefing_type", "weekly")
        .is("read_at", null)
        .gte("briefing_date", weekAgo)
        .order("briefing_date", { ascending: false })
        .limit(1)
        .maybeSingle();
      return data && hasPriceFactsMarker(data.highlights) ? data : null;
    }

    const { data } = await supabase
      .from("axe_daily_briefings")
      .select("title, body, highlights, chat_prefill, briefing_date, feed_url, briefing_type, read_at")
      .eq("user_id", userId)
      .eq("briefing_date", today)
      .eq("briefing_type", type)
      .maybeSingle();
    // A brief written before its prices were checked against live data is not served.
    return data && hasPriceFactsMarker(data.highlights) ? data : null;
  } catch {
    return null;
  }
}

export async function getActiveBrief(
  supabase: SupabaseClient,
  userId: string,
): Promise<Awaited<ReturnType<typeof getTodaysBrief>>> {
  const daily = await getTodaysBrief(supabase, userId, "daily");
  if (daily) return daily;
  return getTodaysBrief(supabase, userId, "weekly");
}

export async function markBriefRead(
  _supabase: SupabaseClient,
  userId: string,
  briefingDate: string,
  briefingType: "daily" | "weekly",
): Promise<void> {
  const writeSb = createServiceRoleSupabaseClient();
  if (!writeSb) {
    console.warn("[Briefing] Service role unavailable — cannot mark read");
    return;
  }
  await writeSb
    .from("axe_daily_briefings")
    .update({ read_at: new Date().toISOString() })
    .eq("user_id", userId)
    .eq("briefing_date", briefingDate)
    .eq("briefing_type", briefingType);
}

// ─── Fetch all users opted into daily briefing ───────────────────────────────

async function getTraderIdsForBriefing(
  supabase: SupabaseClient,
  opts?: {
    targetHour?: number;
    catchUpHours?: [number, number];
    weekly?: boolean;
    paidOnly?: boolean;
  },
): Promise<string[]> {
  try {
    const targetHour = opts?.targetHour ?? 7;
    const catchUpRange = opts?.catchUpHours;
    const isWeekly = opts?.weekly ?? false;
    const paidOnly = opts?.paidOnly ?? isWeekly;
    const now = new Date();
    const PAGE_SIZE = 500;

    const rows: { id: string; preferences: unknown; timezone: string | null }[] = [];
    let offset = 0;

    while (true) {
      const { data, error } = await supabase
        .from("profiles")
        .select("id, preferences, timezone")
        .range(offset, offset + PAGE_SIZE - 1);

      if (error) {
        console.warn("[Briefing] Could not fetch profiles:", error.message);
        break;
      }
      if (!data?.length) break;

      rows.push(...data);
      if (data.length < PAGE_SIZE) break;
      offset += PAGE_SIZE;
    }

    const ids = rows
      .filter((row) => {
        const prefs =
          typeof row.preferences === "object" && row.preferences !== null
            ? (row.preferences as Record<string, unknown>)
            : {};
        if (prefs.morningBriefingOptIn === false) return false;

        const tz = (row.timezone as string) || "Europe/Amsterdam";
        const localHour = getLocalHour(tz, now);

        if (isWeekly) {
          if (getLocalWeekday(tz, now) !== "Mon") return false;
          if (localHour === targetHour) return true;
          if (
            catchUpRange &&
            localHour >= catchUpRange[0] &&
            localHour <= catchUpRange[1]
          ) {
            return true;
          }
          return false;
        }

        if (localHour === targetHour) return true;
        if (
          catchUpRange &&
          localHour >= catchUpRange[0] &&
          localHour <= catchUpRange[1]
        ) {
          return true;
        }
        return false;
      })
      .map((row) => row.id as string);

    if (!paidOnly) return ids;

    // Same entitlement a request sees, including "an anonymous user is never
    // paid" — the plan string alone briefed 8,032 mornings for anonymous
    // accounts and would have kept doing it for the 51 founder rows.
    const entitled = await filterUsersWithFeature(supabase, ids, "briefings");
    return ids.filter((id) => entitled.has(id));
  } catch (err) {
    console.error("[Briefing] getTraderIdsForBriefing error:", err);
    return [];
  }
}

// ─── Daily cron entry point ───────────────────────────────────────────────────

export async function runDailyBriefingCron(): Promise<{
  processed: number;
  failed: number;
  latency_ms: number;
  /** Traders left for the next tick because the time budget ran out. */
  deferred: number;
}> {
  const startTime = Date.now();
  let processed = 0;
  let failed = 0;
  let deferred = 0;

  const supabase = createServiceRoleSupabaseClient();
  if (!supabase) {
    console.error("[Briefing] Service role client unavailable — aborting cron");
    return { processed: 0, failed: 0, deferred: 0, latency_ms: Date.now() - startTime };
  }

  // Pre-generate at 06:00 local; catch-up 07:00–11:00 if that run missed
  const traders = await getTraderIdsForBriefing(supabase, {
    targetHour: 6,
    catchUpHours: [7, 11],
    paidOnly: false,
  });
  console.log(`[Briefing] Daily cron starting for ${traders.length} traders`);

  const batch = await runBatchWithinBudget(
    traders,
    (traderId) => generateMorningBrief(traderId, supabase, { weekly: false }).then(() => undefined),
    {
      onError: (traderId, error, attempt) =>
        console.error(
          attempt === 1
            ? `[Briefing] Failed for trader ${traderId}, retrying:`
            : `[Briefing] Retry failed for trader ${traderId}:`,
          error,
        ),
    },
  );
  processed = batch.processed;
  failed = batch.failed;
  deferred = batch.deferred;
  if (deferred > 0) {
    console.log(`[Briefing] cron budget reached: ${deferred} traders deferred to the next tick`);
  }

  const latency_ms = Date.now() - startTime;
  console.log(
    `[Briefing] Daily cron complete: ${processed} processed, ${failed} failed in ${latency_ms}ms`
  );

  return { processed, failed, deferred, latency_ms };
}

// ─── Weekly cron entry point ──────────────────────────────────────────────────

export async function runWeeklyBriefingCron(): Promise<{
  processed: number;
  failed: number;
  latency_ms: number;
  /** Traders left for the next tick because the time budget ran out. */
  deferred: number;
}> {
  const startTime = Date.now();
  let processed = 0;
  let failed = 0;
  let deferred = 0;

  const supabase = createServiceRoleSupabaseClient();
  if (!supabase) {
    console.error("[Briefing] Service role client unavailable — aborting cron");
    return { processed: 0, failed: 0, deferred: 0, latency_ms: Date.now() - startTime };
  }

  // Monday 06:00 local (+ catch-up through 11:00) — weekly outlook for paid tiers.
  const traders = await getTraderIdsForBriefing(supabase, {
    targetHour: 6,
    catchUpHours: [7, 11],
    weekly: true,
    paidOnly: true,
  });
  console.log(`[Briefing] Weekly cron starting for ${traders.length} traders`);

  const batch = await runBatchWithinBudget(
    traders,
    (traderId) => generateMorningBrief(traderId, supabase, { weekly: true }).then(() => undefined),
    {
      onError: (traderId, error, attempt) =>
        console.error(
          attempt === 1
            ? `[Briefing] Weekly failed for trader ${traderId}, retrying:`
            : `[Briefing] Weekly retry failed for trader ${traderId}:`,
          error,
        ),
    },
  );
  processed = batch.processed;
  failed = batch.failed;
  deferred = batch.deferred;
  if (deferred > 0) {
    console.log(`[Briefing] Weekly cron budget reached: ${deferred} traders deferred to the next tick`);
  }

  const latency_ms = Date.now() - startTime;
  console.log(
    `[Briefing] Weekly cron complete: ${processed} processed, ${failed} failed in ${latency_ms}ms`
  );

  return { processed, failed, deferred, latency_ms };
}

export type { TraderBriefingContext as BriefingContext };
