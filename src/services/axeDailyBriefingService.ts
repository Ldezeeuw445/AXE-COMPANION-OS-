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
import { trackAdaptiveEvent } from "@/services/trackAdaptiveEvent";
import { fetchWeatherForBrief, type WeatherSnapshot } from "@/services/weatherService";
import { buildMarketContext, summarizeMarketContext } from "@/lib/market/marketContextService";
import { buildBriefNewsCards } from "@/lib/briefing/briefingNewsCards";
import type { BriefHighlight } from "@/lib/briefing/briefBodyFormat";
import type { MarketContext } from "@/lib/market/marketTypes";
import type { SupabaseClient } from "@supabase/supabase-js";

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

// ─── Types ────────────────────────────────────────────────────────────────────

export interface TraderBriefingContext {
  traderId: string;
  name: string;
  timezone: string;
  preferredPairs: string[];
  alignment: number; // 0-100
  recentWins: Array<{ pair: string; timeframe: string; gain: number }>;
  topIndicators: string[];
  preferredSession: "london" | "newyork" | "asia";
  tier: "free" | "pro" | "founder" | "elite";
  weather: WeatherSnapshot | null;
  preferences: Record<string, unknown>;
}

// ─── Profile fetch (service-role, no relative URLs) ───────────────────────────

type ProfileBrief = {
  displayName: string;
  timezone: string;
  preferences: Record<string, unknown>;
  tier: "free" | "pro" | "founder" | "elite";
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
  traderId: string
): Promise<TraderBriefingContext> {
  try {
    const [profile, arc] = await Promise.all([
      fetchProfileDirect(supabase, traderId),
      getTraderLearningArc(traderId, supabase),
    ]);

    const tzDate = new Date(
      new Date().toLocaleString("en-US", { timeZone: profile.timezone })
    );
    const hour = tzDate.getHours();

    let session: "london" | "newyork" | "asia" = "asia";
    if (hour >= 7 && hour < 16) session = "london";
    if (hour >= 14 && hour < 23) session = "newyork";

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
      preferredPairs: arc.topPairs.slice(0, 3),
      alignment: arc.alignmentScore,
      recentWins: arc.recentWins.slice(0, 3),
      topIndicators: arc.topIndicators.slice(0, 3),
      preferredSession: session,
      tier: profile.tier,
      weather,
      preferences: profile.preferences,
    };
  } catch (error) {
    console.error("[Briefing] Failed to build context:", error);
    return {
      traderId,
      name: "Trader",
      timezone: "Europe/Amsterdam",
      preferredPairs: [],
      alignment: 0,
      recentWins: [],
      topIndicators: [],
      preferredSession: "london",
      tier: "free",
      weather: null,
      preferences: {},
    };
  }
}

// ─── Prompt builder ───────────────────────────────────────────────────────────

function buildBriefingPrompt(context: TraderBriefingContext, options?: { weekly?: boolean }): string {
  const timeStr = new Date().toLocaleString("en-US", {
    timeZone: context.timezone,
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
    weekday: "long",
  });

  const hasPairs = context.preferredPairs.length > 0;
  const hasWins = context.recentWins.length > 0;
  const isWeekly = options?.weekly ?? false;

  let prompt = `You are AXE — a warm, sharp trading companion. Generate a ${isWeekly ? "personalized weekly outlook" : "personalized morning brief"} for ${context.name}.

Key facts:
- Their local time: ${timeStr} (${context.timezone})
- Tier: ${context.tier}
- Top pairs: ${hasPairs ? context.preferredPairs.join(", ") : "not yet identified — be encouraging"}
- AXE alignment score: ${context.alignment}% (how well AXE has learned this trader's style)
- Session focus: ${context.preferredSession}
- Key indicators they use: ${context.topIndicators.length > 0 ? context.topIndicators.join(", ") : "standard set"}`;

  if (context.weather) {
    prompt += `\n- Weather in ${context.weather.location}: ${context.weather.summary}, ${context.weather.tempC}°C, wind ${context.weather.windKmh} km/h`;
  }

  if (hasWins) {
    prompt += `\n\nRecent profitable trades:`;
    for (const win of context.recentWins) {
      prompt += `\n- ${win.pair} on ${win.timeframe}: +${win.gain.toFixed(1)}%`;
    }
  }

  if (isWeekly) {
    prompt += `

Write a weekly outlook that:
1. Opens with a greeting that uses ${context.name}'s name and frames the week ahead
2. Calls out 2-3 high-probability setups or macro themes for the week
3. References their tier (${context.tier}) and alignment score in a motivating way
4. Includes one tactical insight tied to their preferred session or recent winners
5. Ends with the single most important thing to watch this week

Tone: warm, direct, confident. Like a senior trader who actually knows them. No generic textbook talk.
Length: 200-280 words maximum.`;
  } else {
    const weatherLine = context.weather
      ? `the weather at your location is ${context.weather.summary}, ${context.weather.tempC}°C`
      : "the weather at your location is unavailable";

    prompt += `

Write a morning brief using EXACTLY this plain-text structure (no markdown, no ** or # symbols):

Good morning ${context.name}, ${weatherLine}.

MARKET OUTLOOK
[2-3 sentences on session setup for their top pairs — bold pair symbols as plain text like XAUUSD, not markdown]

NEWS
[Only include this section if there is meaningful news in the market context below. 1-2 sentences on the most important headline or calendar event for their pairs. Omit the whole NEWS section if nothing notable.]

WATCH THIS SESSION
[One clear tactical watch item tied to alignment (${context.alignment}% aligned)]

Rules:
- Do NOT use **, __, #, or bullet lists
- Section headers must be exactly: MARKET OUTLOOK, NEWS, WATCH THIS SESSION
- Use ONLY headlines/events from the market context below for NEWS — never invent news
- Mention trading pairs by ticker (XAUUSD, BTCUSD, etc.)

Tone: warm, direct, confident. Like a senior trader who actually knows them.
Length: 150-220 words maximum.`;
  }

  return prompt;
}

async function appendMarketContextToPrompt(
  context: TraderBriefingContext,
  prompt: string,
): Promise<{ prompt: string; marketCtx: MarketContext | null }> {
  const primaryPair = context.preferredPairs[0] ?? "XAUUSD";
  try {
    const marketCtx = await buildMarketContext({
      symbol: primaryPair,
      watchlist: context.preferredPairs,
      newsLimit: 6,
      calendarLimit: 8,
    });
    const summary = summarizeMarketContext(marketCtx);
    if (summary.trim()) {
      return {
        prompt: `${prompt}\n\nMarket context (use for NEWS section only — do not fabricate beyond this):\n${summary}`,
        marketCtx,
      };
    }
    return { prompt, marketCtx };
  } catch (err) {
    console.warn("[Briefing] Market context unavailable:", err);
  }
  return { prompt, marketCtx: null };
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
  const readSb = supabase ?? createServiceRoleSupabaseClient();
  const writeSb = createServiceRoleSupabaseClient() ?? readSb;
  if (!readSb) throw new Error("Supabase client unavailable");

  const contextForDate = await buildBriefingContext(readSb, traderId);
  const today = getLocalDateString(contextForDate.timezone);
  const briefingType = isWeekly ? "weekly" : "daily";

  // Skip LLM when today's brief already exists (cron / prior run)
  if (shouldSave && !force) {
    const { data: existingRow } = await writeSb
      .from("axe_daily_briefings")
      .select("body, created_at")
      .eq("user_id", traderId)
      .eq("briefing_date", today)
      .eq("briefing_type", briefingType)
      .maybeSingle();

    if (existingRow?.body) {
      return {
        brief: existingRow.body as string,
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
  let marketCtx: MarketContext | null = null;
  if (!isWeekly) {
    const enriched = await appendMarketContextToPrompt(context, userPrompt);
    userPrompt = enriched.prompt;
    marketCtx = enriched.marketCtx;
  }

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

  const response = await callLLM(llmRequest, "intel");
  const latency_ms = Date.now() - startTime;

  console.log(
    `[Briefing] Generated for ${traderId} in ${latency_ms}ms via ${response.provider}`
  );

  const briefText = (response.content ?? "").replace(/\*\*/g, "");

  const highlightRows: BriefHighlight[] = context.preferredPairs.length
    ? context.preferredPairs.map((p) => ({ pair: p }))
    : [];
  if (marketCtx && !isWeekly) {
    for (const card of buildBriefNewsCards(marketCtx, 2)) {
      highlightRows.push(card);
    }
  }

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
      const { data } = await supabase
        .from("axe_daily_briefings")
        .select("title, body, highlights, chat_prefill, briefing_date, feed_url, briefing_type, read_at")
        .eq("user_id", userId)
        .eq("briefing_type", "weekly")
        .is("read_at", null)
        .order("briefing_date", { ascending: false })
        .limit(1)
        .maybeSingle();
      return data ?? null;
    }

    const { data } = await supabase
      .from("axe_daily_briefings")
      .select("title, body, highlights, chat_prefill, briefing_date, feed_url, briefing_type, read_at")
      .eq("user_id", userId)
      .eq("briefing_date", today)
      .eq("briefing_type", type)
      .maybeSingle();
    return data ?? null;
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
  opts?: { targetHour?: number; weekly?: boolean; paidOnly?: boolean }
): Promise<string[]> {
  try {
    const targetHour = opts?.targetHour ?? 7;
    const isWeekly = opts?.weekly ?? false;
    const paidOnly = opts?.paidOnly ?? isWeekly;

    const { data, error } = await supabase
      .from("profiles")
      .select("id, preferences, timezone")
      .limit(500);

    if (error || !data) {
      console.warn("[Briefing] Could not fetch profiles:", error?.message);
      return [];
    }

    const ids = data
      .filter((row) => {
        const prefs =
          typeof row.preferences === "object" && row.preferences !== null
            ? (row.preferences as Record<string, unknown>)
            : {};
        if (prefs.morningBriefingOptIn === false) return false;

        const tz = (row.timezone as string) || "Europe/Amsterdam";
        try {
          const localParts = new Intl.DateTimeFormat("en-US", {
            timeZone: tz,
            hour: "numeric",
            weekday: "short",
            hour12: false,
          }).formatToParts(new Date());
          const localHour = parseInt(
            localParts.find((p) => p.type === "hour")?.value ?? "0",
            10,
          );
          const weekday = localParts.find((p) => p.type === "weekday")?.value ?? "";
          if (localHour !== targetHour) return false;
          if (isWeekly && weekday !== "Mon") return false;
        } catch {
          if (new Date().getUTCHours() !== targetHour) return false;
          if (isWeekly && new Date().getUTCDay() !== 1) return false;
        }

        return true;
      })
      .map((row) => row.id as string);

    if (!paidOnly) return ids;

    const paid: string[] = [];
    for (const id of ids) {
      const { data: ent } = await supabase
        .from("axe_user_entitlements")
        .select("plan")
        .eq("user_id", id)
        .maybeSingle();
      const plan = ent?.plan ?? "free";
      if (plan === "pro" || plan === "founder" || plan === "elite") {
        paid.push(id);
      }
    }
    return paid;
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
}> {
  const startTime = Date.now();
  let processed = 0;
  let failed = 0;

  const supabase = createServiceRoleSupabaseClient();
  if (!supabase) {
    console.error("[Briefing] Service role client unavailable — aborting cron");
    return { processed: 0, failed: 0, latency_ms: Date.now() - startTime };
  }

  // Run every hour but only process users whose local time is 07:00
  const traders = await getTraderIdsForBriefing(supabase, { targetHour: 7, paidOnly: false });
  console.log(`[Briefing] Daily cron starting for ${traders.length} traders`);

  for (const traderId of traders) {
    try {
      await generateMorningBrief(traderId, supabase, { weekly: false });
      processed++;
    } catch (error) {
      console.error(`[Briefing] Failed for trader ${traderId}:`, error);
      failed++;
    }
  }

  const latency_ms = Date.now() - startTime;
  console.log(
    `[Briefing] Daily cron complete: ${processed} processed, ${failed} failed in ${latency_ms}ms`
  );

  return { processed, failed, latency_ms };
}

// ─── Weekly cron entry point ──────────────────────────────────────────────────

export async function runWeeklyBriefingCron(): Promise<{
  processed: number;
  failed: number;
  latency_ms: number;
}> {
  const startTime = Date.now();
  let processed = 0;
  let failed = 0;

  const supabase = createServiceRoleSupabaseClient();
  if (!supabase) {
    console.error("[Briefing] Service role client unavailable — aborting cron");
    return { processed: 0, failed: 0, latency_ms: Date.now() - startTime };
  }

  // Monday 07:00 local — weekly outlook for paid tiers.
  const traders = await getTraderIdsForBriefing(supabase, {
    targetHour: 7,
    weekly: true,
    paidOnly: true,
  });
  console.log(`[Briefing] Weekly cron starting for ${traders.length} traders`);

  for (const traderId of traders) {
    try {
      await generateMorningBrief(traderId, supabase, { weekly: true });
      processed++;
    } catch (error) {
      console.error(`[Briefing] Failed for trader ${traderId}:`, error);
      failed++;
    }
  }

  const latency_ms = Date.now() - startTime;
  console.log(
    `[Briefing] Weekly cron complete: ${processed} processed, ${failed} failed in ${latency_ms}ms`
  );

  return { processed, failed, latency_ms };
}

export type { TraderBriefingContext as BriefingContext };
